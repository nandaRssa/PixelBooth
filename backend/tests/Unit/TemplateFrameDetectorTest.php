<?php

namespace Tests\Unit;

use App\Services\TemplateFrameDetector;
use Tests\TestCase;

class TemplateFrameDetectorTest extends TestCase
{
    private function makeTemplateImage(string $path, int $w = 872, int $h = 1429, array $slots = []): void
    {
        $img = imagecreatetruecolor($w, $h);
        $bg = imagecolorallocate($img, 60, 60, 60);
        imagefilledrectangle($img, 0, 0, $w - 1, $h - 1, $bg);

        // Dekorasi tepi agar area foto tidak menyentuh border
        $edge = imagecolorallocate($img, 30, 30, 30);
        imagefilledrectangle($img, 0, 0, $w - 1, 30, $edge);
        imagefilledrectangle($img, 0, $h - 31, $w - 1, $h - 1, $edge);

        $white = imagecolorallocate($img, 240, 240, 240);
        foreach ($slots as $slot) {
            imagefilledrectangle(
                $img,
                (int) $slot[0],
                (int) $slot[1],
                (int) $slot[2],
                (int) $slot[3],
                $white
            );
        }

        imagepng($img, $path);
        imagedestroy($img);
    }

    public function test_detects_three_vertical_frames(): void
    {
        $tmp = tempnam(sys_get_temp_dir(), 'tpl') . '.png';
        $w = 872;
        $h = 1429;
        $this->makeTemplateImage($tmp, $w, $h, [
            [100, 100, 772, 480],
            [100, 500, 772, 880],
            [100, 900, 772, 1280],
        ]);

        $result = (new TemplateFrameDetector())->detect($tmp);
        @unlink($tmp);

        $this->assertNotNull($result, 'Seharusnya 3 bingkai terdeteksi');
        $this->assertSame(3, $result['frame_count']);
        $this->assertCount(3, $result['frame_configuration']);

        // Urut dari atas ke bawah dan berada di dalam area putih
        $slots = $result['frame_configuration'];
        $this->assertLessThan($slots[1]['y'], $slots[0]['y']);
        $this->assertLessThan($slots[2]['y'], $slots[1]['y']);
        foreach ($slots as $slot) {
            $this->assertArrayHasKey('x', $slot);
            $this->assertArrayHasKey('y', $slot);
            $this->assertArrayHasKey('width', $slot);
            $this->assertArrayHasKey('height', $slot);
            $this->assertArrayHasKey('order', $slot);
            $this->assertGreaterThan(0, $slot['width']);
            $this->assertGreaterThan(0, $slot['height']);
            // Slot berada di dalam canvas asli
            $this->assertGreaterThanOrEqual(0, $slot['x']);
            $this->assertLessThanOrEqual($w, $slot['x'] + $slot['width']);
            $this->assertGreaterThanOrEqual(0, $slot['y']);
            $this->assertLessThanOrEqual($h, $slot['y'] + $slot['height']);
        }
    }

    public function test_detects_2x2_grid_frames(): void
    {
        $tmp = tempnam(sys_get_temp_dir(), 'tpl') . '.png';
        $w = 872;
        $h = 1429;
        $this->makeTemplateImage($tmp, $w, $h, [
            // Baris atas: 2 kolom
            [100, 100, 420, 480],
            [452, 100, 772, 480],
            // Baris bawah: 2 kolom
            [100, 520, 420, 900],
            [452, 520, 772, 900],
        ]);

        $result = (new TemplateFrameDetector())->detect($tmp);
        @unlink($tmp);

        $this->assertNotNull($result, 'Seharusnya 4 bingkai terdeteksi');
        $this->assertSame(4, $result['frame_count']);
        $slots = $result['frame_configuration'];
        $this->assertCount(4, $slots);

        // Urut: kiri-atas, kanan-atas, kiri-bawah, kanan-bawah
        $this->assertLessThan($slots[1]['x'], $slots[0]['x']);
        $this->assertSame($slots[0]['y'], $slots[1]['y']);
        $this->assertLessThan($slots[2]['y'], $slots[0]['y']);
        $this->assertLessThan($slots[3]['x'], $slots[2]['x']);
        $this->assertSame($slots[2]['y'], $slots[3]['y']);
    }

    public function test_scales_slots_to_canvas_dimensions(): void
    {
        $tmp = tempnam(sys_get_temp_dir(), 'tpl') . '.png';
        $w = 872;
        $h = 1429;
        $this->makeTemplateImage($tmp, $w, $h, [
            [100, 100, 772, 480],
            [100, 500, 772, 880],
            [100, 900, 772, 1280],
        ]);

        // Canvas 1080x1920 (lebih besar dari ukuran gambar) seperti PhotoRenderService
        $result = (new TemplateFrameDetector())->detect($tmp, 1080, 1920);
        @unlink($tmp);

        $this->assertNotNull($result);
        $this->assertSame(3, $result['frame_count']);
        $slots = $result['frame_configuration'];

        // Slot berada dalam batas canvas dan lebih besar dari koordinat gambar
        foreach ($slots as $slot) {
            $this->assertLessThanOrEqual(1080, $slot['x'] + $slot['width']);
            $this->assertLessThanOrEqual(1920, $slot['y'] + $slot['height']);
            $this->assertGreaterThanOrEqual(100, $slot['width']);
        }
    }

    public function test_returns_null_when_no_white_frames(): void
    {
        $tmp = tempnam(sys_get_temp_dir(), 'tpl') . '.png';
        $this->makeTemplateImage($tmp, 400, 600, []);

        $result = (new TemplateFrameDetector())->detect($tmp);
        @unlink($tmp);

        $this->assertNull($result);
    }

    // ------------------------------------------------------------------
    // Test sistem deteksi berbasis region (Auto Frame Detection v2)
    // ------------------------------------------------------------------

    /** Simpan gambar GD ke file temp dan bersihkan resource. */
    private function saveTemp($img): string
    {
        $path = tempnam(sys_get_temp_dir(), 'tpl') . '.png';
        imagepng($img, $path);
        imagedestroy($img);

        return $path;
    }

    /** Kanvas gelap polos sebagai dasar template uji. */
    private function darkCanvas(int $w, int $h, int $rgb = 40)
    {
        $img = imagecreatetruecolor($w, $h);
        imagefilledrectangle($img, 0, 0, $w - 1, $h - 1, imagecolorallocate($img, $rgb, $rgb, $rgb));

        return $img;
    }

    public function test_mempertahankan_rotasi_slot_miring(): void
    {
        // Slot portrait dimiringkan ~12 derajat — rotasi ASLI harus
        // dipertahankan, tidak di-straighten, dan tetap portrait.
        $w = 600;
        $h = 900;
        $img = $this->darkCanvas($w, $h);

        $angle = deg2rad(12);
        $cx = 300.0;
        $cy = 450.0;
        $hw = 140.0; // setengah lebar slot
        $hh = 230.0; // setengah tinggi slot (portrait)
        $cos = cos($angle);
        $sin = sin($angle);
        $pts = [];
        foreach ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as [$sx, $sy]) {
            $pts[] = $cx + $sx * $hw * $cos - $sy * $hh * $sin;
            $pts[] = $cy + $sx * $hw * $sin + $sy * $hh * $cos;
        }
        imagefilledpolygon($img, $pts, imagecolorallocate($img, 245, 245, 245));
        $tmp = $this->saveTemp($img);

        $result = (new TemplateFrameDetector())->detect($tmp);
        @unlink($tmp);

        $this->assertNotNull($result, 'Slot miring harus terdeteksi');
        $this->assertSame(1, $result['frame_count']);
        $slot = $result['frame_configuration'][0];

        $this->assertGreaterThanOrEqual(7.0, abs($slot['rotation']), 'Rotasi harus terdeteksi');
        $this->assertLessThanOrEqual(17.0, abs($slot['rotation']), 'Rotasi tidak boleh berlebihan');
        $this->assertGreaterThan((float) $slot['width'], (float) $slot['height'], 'Portrait tetap portrait');
        $this->assertGreaterThan(50.0, (float) $slot['confidence']);
    }

    public function test_garis_tipis_konsisten_memisahkan_dua_region(): void
    {
        // Dua area putih dipisahkan garis abu-abu tipis 3px: TIDAK boleh
        // digabung menjadi satu frame hanya karena sama-sama terang.
        $w = 700;
        $h = 500;
        $img = $this->darkCanvas($w, $h);
        $white = imagecolorallocate($img, 240, 240, 240);
        imagefilledrectangle($img, 60, 80, 320, 420, $white);
        imagefilledrectangle($img, 340, 80, 640, 420, $white); // garis x=321..339 abu-abu (bg 40)
        $tmp = $this->saveTemp($img);

        $result = (new TemplateFrameDetector())->detect($tmp);
        @unlink($tmp);

        $this->assertNotNull($result);
        $this->assertSame(2, $result['frame_count'], 'Garis pemisah harus menghasilkan 2 frame');

        $slots = $result['frame_configuration'];
        $this->assertLessThan($slots[1]['x'], $slots[0]['x']);
        // Frame kiri berakhir sebelum garis; frame kanan mulai setelah garis
        $this->assertLessThanOrEqual(340, $slots[0]['x'] + $slots[0]['width'], 'Frame kiri tidak boleh melintasi garis');
        $this->assertGreaterThanOrEqual(300, $slots[1]['x'], 'Frame kanan tidak boleh melintasi garis');
    }

    public function test_bingkai_dekoratif_tidak_dianggap_area_kamera(): void
    {
        // Ring putih dekoratif tebal + celah warna + area foto putih di
        // dalamnya: yang terdeteksi harus AREA DALAM, bukan keseluruhan ring.
        $w = 800;
        $h = 1000;
        $img = $this->darkCanvas($w, $h);
        $white = imagecolorallocate($img, 242, 242, 242);
        // Ring luar putih (border 40px)
        imagefilledrectangle($img, 60, 60, 740, 940, $white);
        // Celah dekoratif (band oranye) menandai boundary
        imagefilledrectangle($img, 100, 100, 700, 900, imagecolorallocate($img, 220, 130, 30));
        // Area foto dalam
        imagefilledrectangle($img, 150, 150, 650, 850, $white);
        $tmp = $this->saveTemp($img);

        $result = (new TemplateFrameDetector())->detect($tmp);
        @unlink($tmp);

        $this->assertNotNull($result);
        $this->assertSame(1, $result['frame_count'], 'Hanya area dalam yang jadi frame');

        $slot = $result['frame_configuration'][0];
        // Frame harus berada DI DALAM ring (tidak menutupi ring)
        $this->assertGreaterThanOrEqual(120, $slot['x']);
        $this->assertGreaterThanOrEqual(120, $slot['y']);
        $this->assertLessThanOrEqual(680, $slot['x'] + $slot['width']);
        $this->assertLessThanOrEqual(880, $slot['y'] + $slot['height']);
    }

    public function test_slot_berwarna_non_putih_terdeteksi(): void
    {
        // Slot biru muda & merah muda pada background gelap: deteksi tidak
        // boleh bergantung pada warna putih.
        $w = 800;
        $h = 600;
        $img = $this->darkCanvas($w, $h);
        imagefilledrectangle($img, 70, 100, 360, 500, imagecolorallocate($img, 175, 214, 245));
        imagefilledrectangle($img, 440, 100, 730, 500, imagecolorallocate($img, 246, 190, 200));
        $tmp = $this->saveTemp($img);

        $result = (new TemplateFrameDetector())->detect($tmp);
        @unlink($tmp);

        $this->assertNotNull($result, 'Slot berwarna harus terdeteksi');
        $this->assertSame(2, $result['frame_count']);
    }

    public function test_frame_ukuran_dan_orientasi_berbeda(): void
    {
        // Portrait + landscape dengan ukuran beda: keduanya valid.
        $w = 900;
        $h = 900;
        $img = $this->darkCanvas($w, $h);
        $white = imagecolorallocate($img, 238, 238, 238);
        imagefilledrectangle($img, 70, 150, 330, 750, $white);   // portrait tinggi
        imagefilledrectangle($img, 430, 300, 830, 560, $white);  // landscape lebar
        $tmp = $this->saveTemp($img);

        $result = (new TemplateFrameDetector())->detect($tmp);
        @unlink($tmp);

        $this->assertNotNull($result);
        $this->assertSame(2, $result['frame_count']);

        [$a, $b] = $result['frame_configuration'];
        $portrait = $a['height'] > $a['width'] ? $a : $b;
        $landscape = $portrait === $a ? $b : $a;
        $this->assertGreaterThan((float) $portrait['width'], (float) $portrait['height']);
        $this->assertGreaterThan((float) $landscape['height'], (float) $landscape['width']);
    }

    public function test_ornamen_kecil_bukan_frame(): void
    {
        // Hanya kotak-kotak kecil (ikon/ornamen): tidak boleh ada frame.
        $w = 800;
        $h = 1000;
        $img = $this->darkCanvas($w, $h);
        $white = imagecolorallocate($img, 240, 240, 240);
        foreach ([[100, 100], [400, 200], [200, 500], [600, 700], [350, 850]] as [$x, $y]) {
            imagefilledrectangle($img, $x, $y, $x + 26, $y + 26, $white);
        }
        $tmp = $this->saveTemp($img);

        $result = (new TemplateFrameDetector())->detect($tmp);
        @unlink($tmp);

        $this->assertNull($result, 'Ornamen kecil tidak boleh dianggap frame');
    }

    public function test_area_terhalang_di_tengah_bukan_slot_foto(): void
    {
        // Slot putih dengan objek warna berbeda MENGHALANGI di tengahnya:
        // bukan slot foto -> hasil deteksi harus kosong.
        $w = 800;
        $h = 1000;
        $img = $this->darkCanvas($w, $h);
        imagefilledrectangle($img, 150, 250, 650, 750, imagecolorallocate($img, 242, 242, 242));
        // Objek penghalang di tengah slot
        imagefilledrectangle($img, 320, 420, 480, 580, imagecolorallocate($img, 200, 40, 40));
        $tmp = $this->saveTemp($img);

        $result = (new TemplateFrameDetector())->detect($tmp);
        @unlink($tmp);

        $this->assertNull($result, 'Area dengan penghalang di tengah bukan slot foto');
    }

    public function test_kotak_miring_40_derajat_akurat(): void
    {
        // Kotak (mendekati persegi) miring 40°: rotasi HARUS ~40° dan ukuran
        // frame mengikuti bentuk yang dirender — bukan 30° atau 0°.
        $w = 800;
        $h = 800;
        $img = $this->darkCanvas($w, $h);

        $angle = deg2rad(40);
        $cx = 400.0;
        $cy = 400.0;
        $hw = 165.0; // 330 lebar
        $hh = 175.0; // 350 tinggi (mendekati persegi)
        $cos = cos($angle);
        $sin = sin($angle);
        $pts = [];
        foreach ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as [$sx, $sy]) {
            $pts[] = $cx + $sx * $hw * $cos - $sy * $hh * $sin;
            $pts[] = $cy + $sx * $hw * $sin + $sy * $hh * $cos;
        }
        imagefilledpolygon($img, $pts, imagecolorallocate($img, 248, 248, 248));
        $tmp = $this->saveTemp($img);

        $result = (new TemplateFrameDetector())->detect($tmp);
        @unlink($tmp);

        $this->assertNotNull($result, 'Kotak miring harus terdeteksi');
        $this->assertSame(1, $result['frame_count']);
        $slot = $result['frame_configuration'][0];

        $this->assertGreaterThanOrEqual(36.0, abs($slot['rotation']), 'Rotasi 40° tidak boleh terbaca jauh lebih kecil');
        $this->assertLessThanOrEqual(44.0, abs($slot['rotation']));
        // Ukuran mengikuti bentuk yang dirender — full wrap sampai boundary
        // warna nyata (toleransi ketat ±7%)
        $this->assertGreaterThan(330 * 0.93, (float) $slot['width'], 'Lebar frame harus seukuran kotak yang dirender');
        $this->assertLessThan(330 * 1.07, (float) $slot['width']);
        $this->assertGreaterThan(350 * 0.93, (float) $slot['height'], 'Tinggi frame harus seukuran kotak yang dirender');
        $this->assertLessThan(350 * 1.07, (float) $slot['height']);
    }

    public function test_rotasi_negatif_25_derajat_akurat(): void
    {
        // Rect landscape miring -25°: arah dan besaran rotasi harus akurat.
        $w = 900;
        $h = 700;
        $img = $this->darkCanvas($w, $h);

        $angle = deg2rad(-25);
        $cx = 450.0;
        $cy = 350.0;
        $hw = 210.0; // 420 lebar
        $hh = 130.0; // 260 tinggi
        $cos = cos($angle);
        $sin = sin($angle);
        $pts = [];
        foreach ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as [$sx, $sy]) {
            $pts[] = $cx + $sx * $hw * $cos - $sy * $hh * $sin;
            $pts[] = $cy + $sx * $hw * $sin + $sy * $hh * $cos;
        }
        imagefilledpolygon($img, $pts, imagecolorallocate($img, 244, 244, 244));
        $tmp = $this->saveTemp($img);

        $result = (new TemplateFrameDetector())->detect($tmp);
        @unlink($tmp);

        $this->assertNotNull($result);
        $this->assertSame(1, $result['frame_count']);
        $slot = $result['frame_configuration'][0];

        $this->assertGreaterThanOrEqual(-29.0, $slot['rotation'], 'Rotasi -25° harus akurat');
        $this->assertLessThanOrEqual(-21.0, $slot['rotation']);
        $this->assertGreaterThan(420 * 0.93, (float) $slot['width'], 'Full wrap: lebar sesuai bentuk dirender');
        $this->assertGreaterThan(260 * 0.93, (float) $slot['height'], 'Full wrap: tinggi sesuai bentuk dirender');
    }
}
