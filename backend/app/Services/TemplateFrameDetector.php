<?php

namespace App\Services;

/**
 * Mendeteksi slot/area foto (bingkai putih/terang) pada gambar template
 * menggunakan proyeksi baris + kolom dengan ambang adaptif.
 *
 * Hasil berupa frame_configuration yang siap dipakai PhotoRenderService.
 */
class TemplateFrameDetector
{
    /** Daftar delta ambang (relatif ke kecerahan maksimum) yang dicoba. */
    private const DELTAS = [4, 6, 8, 10, 12, 15, 20];

    /**
     * Deteksi slot foto pada file template.
     *
     * @param string|null $canvasWidth  Lebar canvas tempat template dirender
     *                                  (bila berbeda dari ukuran file gambar).
     * @param string|null $canvasHeight Tinggi canvas tempat template dirender.
     * @return array{frame_count: int, frame_configuration: array}|null
     *         null bila tidak ada slot yang terdeteksi secara meyakinkan.
     */
    public function detect(string $filePath, ?int $canvasWidth = null, ?int $canvasHeight = null): ?array
    {
        if (! is_file($filePath)) {
            return null;
        }

        $info = @getimagesize($filePath);
        if (! $info || ! $this->isSupported($info[2])) {
            return null;
        }

        $src = $this->load($filePath, $info[2]);
        if (! $src) {
            return null;
        }

        [$mask, $width, $height, $maxBrightness] = $this->buildMask($src);
        imagedestroy($src);

        if ($maxBrightness < 100) {
            return null;
        }

        // Koordinat hasil diskalakan ke ruang canvas (bila disediakan),
        // karena PhotoRenderService meregangkan gambar template ke ukuran canvas.
        $targetW = $canvasWidth ?? $info[0];
        $targetH = $canvasHeight ?? $info[1];

        // Evaluasi semua ambang, lalu pilih hasil yang "stabil" (disetujui delta tetangga)
        // agar tidak terjebak ambang terlalu selektif yang menghasilkan geometri terfragmentasi.
        $counts = [];
        $candidates = [];
        foreach (self::DELTAS as $delta) {
            $threshold = max(0, $maxBrightness - $delta);
            $slots = $this->detectAtThreshold($mask, $width, $height, $threshold);
            $counts[] = count($slots);
            $candidates[] = $slots;
        }

        $n = count(self::DELTAS);
        for ($i = 0; $i < $n; $i++) {
            if ($counts[$i] < 2) {
                continue;
            }
            $agreesPrev = $i >= 1 && $counts[$i - 1] === $counts[$i];
            $agreesNext = $i < $n - 1 && $counts[$i + 1] === $counts[$i];
            $stable = $i === 0 ? $agreesNext : ($i === $n - 1 ? $agreesPrev : ($agreesPrev && $agreesNext));
            if ($stable) {
                return $this->buildResult($candidates[$i], $targetW, $targetH, $width, $height);
            }
        }

        // Satu slot besar (template 1 bingkai) hanya diterima bila menutupi sebagian besar canvas
        $singleFallback = null;
        foreach (self::DELTAS as $i => $delta) {
            if ($counts[$i] !== 1) {
                continue;
            }
            $slot = $candidates[$i][0];
            $area = $slot['w'] * $slot['h'];
            if ($area < ($width * $height) * 0.45) {
                continue;
            }
            $agreesPrev = $i >= 1 && $counts[$i - 1] === 1;
            $agreesNext = $i < $n - 1 && $counts[$i + 1] === 1;
            if ($agreesPrev || $agreesNext) {
                return $this->buildResult($candidates[$i], $targetW, $targetH, $width, $height);
            }
            $singleFallback = $candidates[$i];
        }

        if ($singleFallback) {
            return $this->buildResult($singleFallback, $targetW, $targetH, $width, $height);
        }

        return null;
    }

    /**
     * Build mask kecerahan (grayscale) + dimensi ter-downscale (maks 400px).
     *
     * @return array{0: array<int, array<int, int>>, 1: int, 2: int, 3: int}
     */
    private function buildMask($src): array
    {
        $srcW = imagesx($src);
        $srcH = imagesy($src);
        $scale = min(1, 400 / max($srcW, $srcH));
        $width = max(1, (int) round($srcW * $scale));
        $height = max(1, (int) round($srcH * $scale));

        $img = imagecreatetruecolor($width, $height);
        imagecopyresampled($img, $src, 0, 0, 0, 0, $width, $height, $srcW, $srcH);

        $mask = [];
        $maxBrightness = 0;
        for ($y = 0; $y < $height; $y++) {
            $mask[$y] = [];
            for ($x = 0; $x < $width; $x++) {
                $rgb = imagecolorat($img, $x, $y);
                $brightness = (int) round(
                    (($rgb >> 16) & 0xFF) * 0.30
                    + (($rgb >> 8) & 0xFF) * 0.59
                    + ($rgb & 0xFF) * 0.11
                );
                $mask[$y][$x] = $brightness;
                if ($brightness > $maxBrightness) {
                    $maxBrightness = $brightness;
                }
            }
        }
        imagedestroy($img);

        return [$mask, $width, $height, $maxBrightness];
    }

    /**
     * Deteksi slot pada satu nilai ambang.
     *
     * @return array<int, array{x: int, y: int, w: int, h: int}>
     */
    private function detectAtThreshold(array $mask, int $width, int $height, int $threshold): array
    {
        $rowFrac = [];
        for ($y = 0; $y < $height; $y++) {
            $count = 0;
            for ($x = 0; $x < $width; $x++) {
                if ($mask[$y][$x] > $threshold) {
                    $count++;
                }
            }
            $rowFrac[$y] = $count / $width;
        }

        // Run baris terang (slot row: sebagian besar lebar terang)
        $runs = [];
        $inRun = false;
        for ($y = 0; $y < $height; $y++) {
            if ($rowFrac[$y] > 0.45) {
                if (! $inRun) {
                    $runs[] = ['start' => $y, 'end' => $y];
                    $inRun = true;
                } else {
                    $runs[count($runs) - 1]['end'] = $y;
                }
            } else {
                $inRun = false;
            }
        }

        // Gabungkan run yang hanya dipisahkan <= 2 baris
        $merged = [];
        foreach ($runs as $run) {
            $last = count($merged) - 1;
            if ($last >= 0 && ($run['start'] - $merged[$last]['end']) <= 2) {
                $merged[$last]['end'] = $run['end'];
            } else {
                $merged[] = $run;
            }
        }

        $slots = [];
        foreach ($merged as $run) {
            $runHeight = $run['end'] - $run['start'] + 1;
            if ($runHeight < $height * 0.05) {
                continue;
            }

            // Ekstent kolom: fraksi terang per kolom dalam run
            $colFrac = [];
            for ($x = 0; $x < $width; $x++) {
                $count = 0;
                for ($y = $run['start']; $y <= $run['end']; $y++) {
                    if ($mask[$y][$x] > $threshold) {
                        $count++;
                    }
                }
                $colFrac[$x] = $count / $runHeight;
            }

            $colRuns = [];
            $in = false;
            for ($x = 0; $x < $width; $x++) {
                if ($colFrac[$x] > 0.6) {
                    if (! $in) {
                        $colRuns[] = ['start' => $x, 'end' => $x];
                        $in = true;
                    } else {
                        $colRuns[count($colRuns) - 1]['end'] = $x;
                    }
                } else {
                    $in = false;
                }
            }
            if (! $colRuns) {
                continue;
            }

            // Gabungkan run kolom yang hanya terpisah <= 2 piksel
            $mergedCols = [];
            foreach ($colRuns as $colRun) {
                $last = count($mergedCols) - 1;
                if ($last >= 0 && ($colRun['start'] - $mergedCols[$last]['end']) <= 2) {
                    $mergedCols[$last]['end'] = $colRun['end'];
                } else {
                    $mergedCols[] = $colRun;
                }
            }

            // Semua sel kolom yang cukup lebar (mendukung grid multi-kolom),
            // bukan hanya yang terlebar. Dekorasi tipis disaring dengan
            // membandingkan lebar sel terhadap sel terbesar dalam baris ini.
            $cells = [];
            foreach ($mergedCols as $colRun) {
                $cellW = $colRun['end'] - $colRun['start'] + 1;
                if ($cellW < $width * 0.08) {
                    continue;
                }
                $cells[] = ['start' => $colRun['start'], 'w' => $cellW];
            }

            if (count($cells) > 1) {
                $maxCellW = max(array_map(fn ($c) => $c['w'], $cells));
                $cells = array_values(array_filter(
                    $cells,
                    fn ($c) => $c['w'] >= $maxCellW * 0.45
                ));
            }

            foreach ($cells as $cell) {
                $slots[] = [
                    'x' => $cell['start'],
                    'y' => $run['start'],
                    'w' => $cell['w'],
                    'h' => $runHeight,
                ];
            }
        }

        usort($slots, fn ($a, $b) => $a['y'] <=> $b['y'] ?: $a['x'] <=> $b['x']);

        return $slots;
    }

    /**
     * Bangun hasil akhir: skala koordinat ke resolusi asli + beri order.
     *
     * @param array<int, array{x: int, y: int, w: int, h: int}> $slots
     * @return array{frame_count: int, frame_configuration: array}
     */
    private function buildResult(array $slots, int $origW, int $origH, int $width, int $height): array
    {
        $scaleX = $origW / $width;
        $scaleY = $origH / $height;

        $configuration = [];
        foreach (array_values($slots) as $index => $slot) {
            $x = max(0, (int) round($slot['x'] * $scaleX));
            $y = max(0, (int) round($slot['y'] * $scaleY));
            $w = (int) round($slot['w'] * $scaleX);
            $h = (int) round($slot['h'] * $scaleY);

            // Clamp ke batas canvas
            if ($x + $w > $origW) {
                $w = max(1, $origW - $x);
            }
            if ($y + $h > $origH) {
                $h = max(1, $origH - $y);
            }

            $configuration[] = [
                'x' => $x,
                'y' => $y,
                'width' => $w,
                'height' => $h,
                'order' => $index,
            ];
        }

        return [
            'frame_count' => count($configuration),
            'frame_configuration' => $configuration,
        ];
    }

    private function isSupported(int $type): bool
    {
        return in_array($type, [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true);
    }

    private function load(string $path, int $type)
    {
        return match ($type) {
            IMAGETYPE_JPEG => @imagecreatefromjpeg($path),
            IMAGETYPE_PNG => @imagecreatefrompng($path),
            IMAGETYPE_WEBP => @imagecreatefromwebp($path),
            default => false,
        };
    }
}
