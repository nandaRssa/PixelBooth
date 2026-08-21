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
}
