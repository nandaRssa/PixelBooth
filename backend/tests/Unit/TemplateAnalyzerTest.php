<?php

namespace Tests\Unit;

use App\Services\TemplateAnalyzerService;
use Tests\TestCase;

class TemplateAnalyzerTest extends TestCase
{
    /**
     * Buat PNG template dengan background gelap dan lubang transparan berbentuk tertentu.
     */
    private function makeAlphaTemplate(string $path, int $w, int $h, array $shapes): void
    {
        $img = imagecreatetruecolor($w, $h);
        imagealphablending($img, false);
        imagesavealpha($img, true);

        $bg = imagecolorallocatealpha($img, 40, 40, 40, 0);
        imagefilledrectangle($img, 0, 0, $w - 1, $h - 1, $bg);

        $t = imagecolorallocatealpha($img, 0, 0, 0, 127);
        foreach ($shapes as $s) {
            switch ($s['type']) {
                case 'rect':
                    imagefilledrectangle($img, $s['x'], $s['y'], $s['x'] + $s['w'] - 1, $s['y'] + $s['h'] - 1, $t);
                    break;
                case 'ellipse':
                    imagefilledellipse($img, (int) $s['cx'], (int) $s['cy'], (int) ($s['rx'] * 2), (int) ($s['ry'] * 2), $t);
                    break;
                case 'triangle':
                    imagefilledpolygon($img, [
                        $s['x1'], $s['y1'], $s['x2'], $s['y2'], $s['x3'], $s['y3'],
                    ], 3, $t);
                    break;
                case 'rounded':
                    $r = $s['r'];
                    $x = $s['x'];
                    $y = $s['y'];
                    $ww = $s['w'];
                    $hh = $s['h'];
                    imagefilledrectangle($img, $x + $r, $y, $x + $ww - $r - 1, $y + $hh - 1, $t);
                    imagefilledrectangle($img, $x, $y + $r, $x + $ww - 1, $y + $hh - $r - 1, $t);
                    imagefilledellipse($img, $x + $r, $y + $r, $r * 2, $r * 2, $t);
                    imagefilledellipse($img, $x + $ww - $r - 1, $y + $r, $r * 2, $r * 2, $t);
                    imagefilledellipse($img, $x + $r, $y + $hh - $r - 1, $r * 2, $r * 2, $t);
                    imagefilledellipse($img, $x + $ww - $r - 1, $y + $hh - $r - 1, $r * 2, $r * 2, $t);
                    break;
            }
        }

        imagepng($img, $path);
        imagedestroy($img);
    }

    public function test_detects_circle_grid_via_alpha(): void
    {
        $tmp = tempnam(sys_get_temp_dir(), 'tpl') . '.png';
        $this->makeAlphaTemplate($tmp, 800, 1200, [
            ['type' => 'ellipse', 'cx' => 210, 'cy' => 250, 'rx' => 160, 'ry' => 160],
            ['type' => 'ellipse', 'cx' => 590, 'cy' => 250, 'rx' => 160, 'ry' => 160],
            ['type' => 'ellipse', 'cx' => 210, 'cy' => 800, 'rx' => 160, 'ry' => 160],
            ['type' => 'ellipse', 'cx' => 590, 'cy' => 800, 'rx' => 160, 'ry' => 160],
        ]);

        $result = (new TemplateAnalyzerService())->analyze($tmp, 1080, 1920);
        @unlink($tmp);

        $this->assertNotNull($result, 'Lubang transparan harus terdeteksi');
        $this->assertSame('alpha', $result['method']);
        $this->assertSame(4, $result['frame_count']);
        $this->assertCount(4, $result['frames']);

        foreach ($result['frames'] as $frame) {
            $this->assertSame('circle', $frame['shape']);
            $this->assertCount(48, $frame['mask']);
            // Mask dalam koordinat canvas 1080x1920
            foreach ($frame['mask'] as [$mx, $my]) {
                $this->assertGreaterThanOrEqual(0, $mx);
                $this->assertLessThanOrEqual(1080, $mx);
                $this->assertGreaterThanOrEqual(0, $my);
                $this->assertLessThanOrEqual(1920, $my);
            }
        }
    }

    public function test_detects_oval_and_rounded_rectangle(): void
    {
        $tmp = tempnam(sys_get_temp_dir(), 'tpl') . '.png';
        $this->makeAlphaTemplate($tmp, 800, 1200, [
            ['type' => 'ellipse', 'cx' => 250, 'cy' => 300, 'rx' => 200, 'ry' => 120],
            ['type' => 'rounded', 'x' => 150, 'y' => 700, 'w' => 500, 'h' => 350, 'r' => 60],
        ]);

        $result = (new TemplateAnalyzerService())->analyze($tmp, 1080, 1920);
        @unlink($tmp);

        $this->assertNotNull($result);
        $this->assertSame(2, $result['frame_count']);
        $shapes = array_column($result['frames'], 'shape');
        $this->assertContains('oval', $shapes);
        $this->assertContains('rounded-rectangle', $shapes);
    }

    public function test_detects_triangle_shape(): void
    {
        $tmp = tempnam(sys_get_temp_dir(), 'tpl') . '.png';
        $this->makeAlphaTemplate($tmp, 800, 1200, [
            ['type' => 'triangle', 'x1' => 250, 'y1' => 150, 'x2' => 550, 'y2' => 550, 'x3' => 100, 'y3' => 550],
        ]);

        $result = (new TemplateAnalyzerService())->analyze($tmp, 1080, 1920);
        @unlink($tmp);

        $this->assertNotNull($result);
        $this->assertSame(1, $result['frame_count']);
        $this->assertSame('triangle', $result['frames'][0]['shape']);
        $this->assertCount(3, $result['frames'][0]['mask']);
    }

    public function test_filters_small_decorative_holes(): void
    {
        $tmp = tempnam(sys_get_temp_dir(), 'tpl') . '.png';
        $this->makeAlphaTemplate($tmp, 800, 1200, [
            ['type' => 'rect', 'x' => 80, 'y' => 80, 'w' => 640, 'h' => 280],
            ['type' => 'rect', 'x' => 80, 'y' => 400, 'w' => 640, 'h' => 300],
            ['type' => 'rect', 'x' => 80, 'y' => 740, 'w' => 640, 'h' => 340],
            // Dekorasi kecil (harus disaring)
            ['type' => 'rect', 'x' => 700, 'y' => 1100, 'w' => 40, 'h' => 40],
        ]);

        $result = (new TemplateAnalyzerService())->analyze($tmp, 1080, 1920);
        @unlink($tmp);

        $this->assertNotNull($result);
        $this->assertSame(3, $result['frame_count']);
    }

    public function test_orders_frames_top_down_then_left_right(): void
    {
        $tmp = tempnam(sys_get_temp_dir(), 'tpl') . '.png';
        $this->makeAlphaTemplate($tmp, 800, 1200, [
            ['type' => 'rect', 'x' => 520, 'y' => 80, 'w' => 200, 'h' => 300],  // kanan-atas
            ['type' => 'rect', 'x' => 80, 'y' => 80, 'w' => 200, 'h' => 300],   // kiri-atas
            ['type' => 'rect', 'x' => 80, 'y' => 500, 'w' => 200, 'h' => 300],  // kiri-bawah
            ['type' => 'rect', 'x' => 520, 'y' => 500, 'w' => 200, 'h' => 300], // kanan-bawah
        ]);

        $result = (new TemplateAnalyzerService())->analyze($tmp, 1080, 1920);
        @unlink($tmp);

        $this->assertNotNull($result);
        $this->assertSame(4, $result['frame_count']);
        $ids = array_column($result['frames'], 'id');
        $this->assertSame([1, 2, 3, 4], $ids);

        $first = $result['frames'][0];
        $second = $result['frames'][1];
        $third = $result['frames'][2];
        $this->assertLessThan($second['x'], $first['x']);
        $this->assertLessThan($third['y'], $first['y']);
    }

    public function test_frame_structure_contains_required_keys(): void
    {
        $tmp = tempnam(sys_get_temp_dir(), 'tpl') . '.png';
        $this->makeAlphaTemplate($tmp, 800, 1200, [
            ['type' => 'rect', 'x' => 100, 'y' => 100, 'w' => 600, 'h' => 400],
        ]);

        $result = (new TemplateAnalyzerService())->analyze($tmp, 1080, 1920);
        @unlink($tmp);

        $this->assertNotNull($result);
        $frame = $result['frames'][0];

        $this->assertSame(1, $frame['id']);
        $this->assertSame(0, $frame['order']);
        $this->assertSame('rectangle', $frame['shape']);
        $this->assertArrayHasKey('position', $frame);
        $this->assertArrayHasKey('size', $frame);
        $this->assertArrayHasKey('mask', $frame);
        $this->assertArrayHasKey('x', $frame);
        $this->assertArrayHasKey('y', $frame);
        $this->assertArrayHasKey('width', $frame);
        $this->assertArrayHasKey('height', $frame);
        $this->assertArrayHasKey('source', $frame);
        $this->assertSame('alpha', $frame['source']);

        // Backward-compat: x/y/width/height = position/size
        $this->assertSame($frame['position']['x'], $frame['x']);
        $this->assertSame($frame['size']['width'], $frame['width']);
    }

    public function test_returns_null_when_no_transparent_or_bright_frames(): void
    {
        $tmp = tempnam(sys_get_temp_dir(), 'tpl') . '.png';
        $img = imagecreatetruecolor(400, 600);
        $bg = imagecolorallocate($img, 40, 40, 40);
        imagefilledrectangle($img, 0, 0, 399, 599, $bg);
        imagepng($img, $tmp);
        imagedestroy($img);

        $result = (new TemplateAnalyzerService())->analyze($tmp, 1080, 1920);
        @unlink($tmp);

        $this->assertNull($result);
    }
}