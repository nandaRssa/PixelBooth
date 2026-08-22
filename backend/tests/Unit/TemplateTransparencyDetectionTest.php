<?php

namespace Tests\Unit;

use App\Services\FrameMaskService;
use App\Services\TemplateFrameDetector;
use Tests\TestCase;

class TemplateTransparencyDetectionTest extends TestCase
{
    private function saveTempPng($img): string
    {
        $path = tempnam(sys_get_temp_dir(), 'tpl_trans') . '.png';
        imagepng($img, $path);
        imagedestroy($img);

        return $path;
    }

    private function saveTempJpg($img): string
    {
        $path = tempnam(sys_get_temp_dir(), 'tpl_jpg') . '.jpg';
        imagejpeg($img, $path, 95);
        imagedestroy($img);

        return $path;
    }

    /**
     * KONDISI 1: PNG dengan 2 lubang transparan valid
     * -> Menggunakan Transparency Detection, 1 region = 1 frame, 100% cover + overscan, no remove design.
     */
    public function test_detects_transparent_holes_condition_1(): void
    {
        $w = 600;
        $h = 1000;
        $img = imagecreatetruecolor($w, $h);
        imagealphablending($img, false);
        imagesavealpha($img, true);

        // Background gelap pekat (opaque)
        $bg = imagecolorallocatealpha($img, 40, 40, 40, 0);
        imagefilledrectangle($img, 0, 0, $w - 1, $h - 1, $bg);

        // 2 Lubang transparan (alpha = 127)
        $trans = imagecolorallocatealpha($img, 0, 0, 0, 127);
        imagefilledrectangle($img, 100, 100, 500, 450, $trans); // Hole 1: 401 x 351
        imagefilledrectangle($img, 100, 550, 500, 900, $trans); // Hole 2: 401 x 351

        $tmp = $this->saveTempPng($img);

        $detector = new TemplateFrameDetector();
        $result = $detector->detect($tmp);
        @unlink($tmp);

        $this->assertNotNull($result, 'Hasil deteksi transparansi tidak boleh null');
        $this->assertSame('transparent', $result['detection_method'], 'Harus menggunakan metode Transparency Detection');
        $this->assertSame(2, $result['frame_count'], '1 valid transparent region = 1 camera frame');
        $this->assertCount(2, $result['frame_configuration']);

        $slots = $result['frame_configuration'];
        $this->assertSame('transparent', $slots[0]['source']);
        $this->assertSame('transparent', $slots[1]['source']);

        // Frame harus menutupi 100% area transparan dengan sedikit overscan
        $this->assertLessThanOrEqual(100, $slots[0]['x']);
        $this->assertLessThanOrEqual(100, $slots[0]['y']);
        $this->assertGreaterThanOrEqual(401, $slots[0]['width']);
        $this->assertGreaterThanOrEqual(351, $slots[0]['height']);

        // Pastikan FrameMaskService::buildMask mengembalikan null untuk transparent source agar desain TIDAK dihapus
        $maskService = new FrameMaskService();
        $dummyImg = imagecreatetruecolor(100, 100);
        $mask = $maskService->buildMask($dummyImg, $slots[0], $w, $h);
        imagedestroy($dummyImg);

        $this->assertNull($mask, 'Transparency detection TIDAK boleh menjalankan Smart Clear / remove desain');
    }

    /**
     * Membedakan Full Canvas Background Transparency vs Photo Hole Interior.
     */
    public function test_filters_full_canvas_background_transparency(): void
    {
        $w = 600;
        $h = 900;
        $img = imagecreatetruecolor($w, $h);
        imagealphablending($img, false);
        imagesavealpha($img, true);

        // Seluruh background transparan (touching 4 borders)
        $trans = imagecolorallocatealpha($img, 0, 0, 0, 127);
        imagefilledrectangle($img, 0, 0, $w - 1, $h - 1, $trans);

        // Bingkai dekoratif di tengah (opaque)
        $border = imagecolorallocatealpha($img, 200, 50, 50, 0);
        imagefilledrectangle($img, 50, 50, 550, 850, $border);

        // Lubang foto interior di dalam bingkai dekoratif (transparan)
        imagefilledrectangle($img, 100, 100, 500, 800, $trans);

        $tmp = $this->saveTempPng($img);

        $result = (new TemplateFrameDetector())->detect($tmp);
        @unlink($tmp);

        $this->assertNotNull($result);
        $this->assertSame('transparent', $result['detection_method']);
        $this->assertSame(1, $result['frame_count'], 'Harus membedakan background transparan dan hanya memilih interior photo hole');

        $slot = $result['frame_configuration'][0];
        $this->assertGreaterThanOrEqual(80, $slot['x']);
        $this->assertGreaterThanOrEqual(80, $slot['y']);
    }

    /**
     * Menyaring noise / lubang ornamen transparan kecil.
     */
    public function test_filters_small_ornament_transparent_holes(): void
    {
        $w = 600;
        $h = 900;
        $img = imagecreatetruecolor($w, $h);
        imagealphablending($img, false);
        imagesavealpha($img, true);

        $bg = imagecolorallocatealpha($img, 50, 50, 50, 0);
        imagefilledrectangle($img, 0, 0, $w - 1, $h - 1, $bg);

        $trans = imagecolorallocatealpha($img, 0, 0, 0, 127);
        // 1 Slot foto transparan valid
        imagefilledrectangle($img, 100, 150, 500, 750, $trans);

        // 3 Lubang ornamen kecil 6x6 px (harus diabaikan)
        imagefilledrectangle($img, 30, 30, 36, 36, $trans);
        imagefilledrectangle($img, 550, 30, 556, 36, $trans);
        imagefilledrectangle($img, 30, 850, 36, 856, $trans);

        $tmp = $this->saveTempPng($img);

        $result = (new TemplateFrameDetector())->detect($tmp);
        @unlink($tmp);

        $this->assertNotNull($result);
        $this->assertSame('transparent', $result['detection_method']);
        $this->assertSame(1, $result['frame_count'], 'Lubang ornamen kecil harus diabaikan');
    }

    /**
     * KONDISI 2: PNG tanpa transparansi valid (opaque)
     * -> Fallback ke Smart Clear existing.
     */
    public function test_falls_back_to_smart_clear_when_no_transparency_condition_2(): void
    {
        $w = 700;
        $h = 1000;
        $img = imagecreatetruecolor($w, $h);
        imagealphablending($img, false);
        imagesavealpha($img, true);

        // Background gelap pekat tanpa transparansi (alpha = 0)
        $bg = imagecolorallocatealpha($img, 40, 40, 40, 0);
        imagefilledrectangle($img, 0, 0, $w - 1, $h - 1, $bg);

        // 2 Slot foto putih (opaque)
        $white = imagecolorallocatealpha($img, 240, 240, 240, 0);
        imagefilledrectangle($img, 80, 100, 620, 480, $white);
        imagefilledrectangle($img, 80, 520, 620, 900, $white);

        $tmp = $this->saveTempPng($img);

        $result = (new TemplateFrameDetector())->detect($tmp);
        @unlink($tmp);

        $this->assertNotNull($result);
        $this->assertSame('smart_clear', $result['detection_method'], 'Tidak ada transparansi -> Fallback ke Smart Clear');
        $this->assertSame(2, $result['frame_count']);
        $this->assertSame('smart_clear', $result['frame_configuration'][0]['source']);
    }

    /**
     * KONDISI 2: Gambar JPEG (tidak mendukung transparansi)
     * -> Fallback ke Smart Clear existing.
     */
    public function test_jpeg_falls_back_to_smart_clear(): void
    {
        $w = 600;
        $h = 900;
        $img = imagecreatetruecolor($w, $h);
        $bg = imagecolorallocate($img, 30, 30, 30);
        imagefilledrectangle($img, 0, 0, $w - 1, $h - 1, $bg);

        $white = imagecolorallocate($img, 245, 245, 245);
        imagefilledrectangle($img, 80, 80, 520, 420, $white);
        imagefilledrectangle($img, 80, 480, 520, 820, $white);

        $tmp = $this->saveTempJpg($img);

        $result = (new TemplateFrameDetector())->detect($tmp);
        @unlink($tmp);

        $this->assertNotNull($result);
        $this->assertSame('smart_clear', $result['detection_method']);
        $this->assertSame(2, $result['frame_count']);
    }
}
