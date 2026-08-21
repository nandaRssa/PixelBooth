<?php

namespace App\Services;

/**
 * Intelligent Template Analyzer untuk template photobooth.
 *
 * Pipeline deteksi frame foto dengan urutan prioritas:
 *   1. Alpha/Transparency detection — lubang transparan pada PNG/WEBP
 *      dijadikan frame persis sesuai bentuk aslinya (tanpa menebak warna).
 *   2. Connected Components — memisahkan tiap area transparan yang terpisah.
 *   3. Contour & Shape detection — boundary tracing + convex hull untuk
 *      menghasilkan mask poligon & klasifikasi bentuk.
 *   4. Color/Contrast detection — fallback berbasis kecerahan (placeholder
 *      putih) dengan shape refinement.
 *
 * Bentuk yang dikenali: rectangle, square, rounded-rectangle, circle, oval,
 * triangle, polygon, custom (mengikuti outline asli).
 *
 * Setiap frame memiliki mask poligon (koordinat canvas absolut) yang
 * mempertahankan bentuk asli area — bukan sekadar bounding box.
 */
class TemplateAnalyzerService
{
    /** Ambang alpha: nilai alpha >= ini dianggap transparan (lubang). */
    private const ALPHA_THRESHOLD = 110;

    /** Dimensi maksimal grid kerja (di-downscale untuk performa). */
    private const MAX_SCALE_DIM = 480;

    /** Fraksi luas minimum sebuah komponen agar dianggap frame (0.4%). */
    private const MIN_COMPONENT_AREA_FRAC = 0.004;

    /** Fraksi dimensi minimum komponen terhadap dimensi gambar (3%). */
    private const MIN_COMPONENT_DIM_FRAC = 0.03;

    /**
     * Analisis template dan kembalikan daftar frame yang terdeteksi.
     *
     * @return array{
     *     frame_count: int,
     *     method: 'alpha'|'color',
     *     frames: array<int, array<string, mixed>>
     * }|null
     */
    public function analyze(string $filePath, ?int $canvasWidth = null, ?int $canvasHeight = null): ?array
    {
        if (! is_file($filePath)) {
            return null;
        }

        $info = @getimagesize($filePath);
        if (! $info || ! in_array($info[2], [IMAGETYPE_PNG, IMAGETYPE_JPEG, IMAGETYPE_WEBP], true)) {
            return null;
        }

        $targetW = $canvasWidth ?? $info[0];
        $targetH = $canvasHeight ?? $info[1];

        // 1) Cek apakah template memiliki transparency / alpha channel
        $hasAlpha = false;
        if (in_array($info[2], [IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) {
            $hasAlpha = $this->hasTransparency($filePath);
        }

        if ($hasAlpha) {
            // Gunakan deteksi alpha, JANGAN JALANKAN deteksi warna putih
            $alpha = $this->detectAlphaFrames($filePath, $targetW, $targetH);
            if ($alpha !== null) {
                $alpha['detection_method'] = 'transparent';
                return $this->finalize($alpha);
            }

            // Fallback: Jika ada transparansi tetapi disaring (terlalu kecil/dekoratif),
            // buat satu slot default transparan penuh seukuran canvas agar tetap bernilai 'transparent'.
            $fallback = [
                'frame_count' => 1,
                'method' => 'alpha',
                'frames' => [
                    [
                        'id' => 1,
                        'order' => 0,
                        'shape' => 'rectangle',
                        'x' => 0,
                        'y' => 0,
                        'width' => $targetW,
                        'height' => $targetH,
                        'position' => ['x' => 0, 'y' => 0],
                        'size' => ['width' => $targetW, 'height' => $targetH],
                        'mask' => [
                            [0, 0],
                            [$targetW, 0],
                            [$targetW, $targetH],
                            [0, $targetH],
                        ],
                        'corner_radius' => null,
                        'radius' => null,
                        'radius_y' => null,
                        'fill_ratio' => 1.0,
                        'source' => 'alpha',
                    ]
                ],
                'detection_method' => 'transparent',
            ];
            return $this->finalize($fallback);
        }

        // 2) Gunakan deteksi warna putih hanya jika template tidak memiliki area transparan
        $color = $this->detectColorFrames($filePath, $targetW, $targetH);
        if ($color !== null) {
            $color['detection_method'] = 'white-detection';
            return $this->finalize($color);
        }

        return null;
    }

    /**
     * Cek apakah gambar memiliki alpha channel / pixel transparan (alpha < 127).
     */
    private function hasTransparency(string $filePath): bool
    {
        $info = @getimagesize($filePath);
        if (! $info || ! in_array($info[2], [IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) {
            return false;
        }

        $src = match ($info[2]) {
            IMAGETYPE_PNG => @imagecreatefrompng($filePath),
            IMAGETYPE_WEBP => @imagecreatefromwebp($filePath),
            default => null,
        };

        if (! $src) {
            return false;
        }

        $w = imagesx($src);
        $h = imagesy($src);

        // Downscale untuk memangkas waktu scanning pixel
        $scale = min(1.0, 300 / max($w, $h));
        $sw = max(1, (int) round($w * $scale));
        $sh = max(1, (int) round($h * $scale));

        $img = imagecreatetruecolor($sw, $sh);
        imagealphablending($img, false);
        imagesavealpha($img, true);
        imagecopyresampled($img, $src, 0, 0, 0, 0, $sw, $sh, $w, $h);
        imagedestroy($src);

        $hasAlpha = false;
        for ($y = 0; $y < $sh; $y++) {
            for ($x = 0; $x < $sw; $x++) {
                $rgba = imagecolorat($img, $x, $y);
                $alpha = ($rgba >> 24) & 0x7F; // 0 = opaque, 127 = fully transparent
                if ($alpha > 10) {
                    $hasAlpha = true;
                    break 2;
                }
            }
        }
        imagedestroy($img);
        return $hasAlpha;
    }

    /**
     * Stage 1: deteksi berdasarkan alpha channel.
     *
     * Setiap komponen terhubung dari area transparan dijadikan kandidat frame.
     * Area transparan kecil (dekorasi) disaring lewat ukuran & posisi.
     *
     * @return array{frame_count:int, method:string, frames:array}|null
     */
    private function detectAlphaFrames(string $filePath, int $targetW, int $targetH): ?array
    {
        $src = $this->loadImage($filePath);
        if (! $src) {
            return null;
        }

        $srcW = imagesx($src);
        $srcH = imagesy($src);
        $scale = min(1, self::MAX_SCALE_DIM / max($srcW, $srcH));
        $w = max(1, (int) round($srcW * $scale));
        $h = max(1, (int) round($srcH * $scale));

        imagealphablending($src, false);
        imagesavealpha($src, true);
        $img = imagecreatetruecolor($w, $h);
        imagealphablending($img, false);
        imagesavealpha($img, true);
        imagecopyresampled($img, $src, 0, 0, 0, 0, $w, $h, $srcW, $srcH);
        imagedestroy($src);

        // Biner: 1 = transparan (area foto yang menembus template)
        $binary = [];
        for ($y = 0; $y < $h; $y++) {
            $row = [];
            for ($x = 0; $x < $w; $x++) {
                $rgba = imagecolorat($img, $x, $y);
                $alpha = ($rgba >> 24) & 0x7F;
                $row[] = $alpha >= self::ALPHA_THRESHOLD ? 1 : 0;
            }
            $binary[] = $row;
        }
        imagedestroy($img);

        $components = $this->connectedComponents($binary, $w, $h);
        $areaTotal = $w * $h;
        $minDim = min($w, $h);

        // Komponen interior (tidak menyentuh border) = lubang foto.
        $selected = [];
        foreach ($components as $comp) {
            $bbox = $comp['bbox'];
            $touchesBorder = $bbox['x'] <= 0
                || $bbox['y'] <= 0
                || ($bbox['x'] + $bbox['w']) >= $w - 1
                || ($bbox['y'] + $bbox['h']) >= $h - 1;
            if ($touchesBorder) {
                continue;
            }
            if ($comp['area'] / $areaTotal < self::MIN_COMPONENT_AREA_FRAC) {
                continue;
            }
            if (min($bbox['w'], $bbox['h']) < $minDim * self::MIN_COMPONENT_DIM_FRAC) {
                continue;
            }
            $selected[] = $comp;
        }

        // Fallback: satu komponen besar yang menyentuh border & menutupi sebagian
        // besar canvas => template berlatar transparan penuh (foto = seluruh canvas).
        if (empty($selected)) {
            $largeBorder = null;
            foreach ($components as $comp) {
                $bbox = $comp['bbox'];
                $touchesBorder = $bbox['x'] <= 0
                    || $bbox['y'] <= 0
                    || ($bbox['x'] + $bbox['w']) >= $w - 1
                    || ($bbox['y'] + $bbox['h']) >= $h - 1;
                if ($touchesBorder && $comp['area'] / $areaTotal > 0.5) {
                    if ($largeBorder === null || $comp['area'] > $largeBorder['area']) {
                        $largeBorder = $comp;
                    }
                }
            }
            if ($largeBorder !== null) {
                $selected = [$largeBorder];
            }
        }

        if (empty($selected)) {
            return null;
        }

        $frames = [];
        foreach ($selected as $comp) {
            $frame = $this->buildFrameFromComponent($comp, $binary, $w, $h, $targetW, $targetH, 'alpha');
            if ($frame !== null) {
                $frames[] = $frame;
            }
        }
        if (empty($frames)) {
            return null;
        }

        return [
            'frame_count' => count($frames),
            'method' => 'alpha',
            'frames' => $this->sortRowMajor($frames),
        ];
    }

    /**
     * Stage 4: deteksi warna/kontras (placeholder putih) sebagai fallback.
     *
     * Menggunakan TemplateFrameDetector untuk menemukan slot kasar, lalu
     * memperhalus bentuk via connected components piksel terang di dalam slot
     * sehingga lingkaran/oval/triangle juga dikenali di template non-alpha.
     */
    private function detectColorFrames(string $filePath, int $targetW, int $targetH): ?array
    {
        $src = $this->loadImage($filePath);
        if (! $src) {
            return null;
        }

        $srcW = imagesx($src);
        $srcH = imagesy($src);
        $scale = min(1, self::MAX_SCALE_DIM / max($srcW, $srcH));
        $w = max(1, (int) round($srcW * $scale));
        $h = max(1, (int) round($srcH * $scale));

        $img = imagecreatetruecolor($w, $h);
        imagecopyresampled($img, $src, 0, 0, 0, 0, $w, $h, $srcW, $srcH);
        imagedestroy($src);

        // 1. Grayscale & Gradient
        $gray = $this->buildGrayscaleGrid($img, $w, $h);
        $gradient = $this->buildGradientGrid($gray, $w, $h);
        imagedestroy($img);

        // 2. Binary grids
        $binaryEdge15 = [];
        $binaryEdge30 = [];
        $binaryEdge50 = [];
        $binaryBright = [];
        $binaryDark = [];

        for ($y = 0; $y < $h; $y++) {
            $row15 = [];
            $row30 = [];
            $row50 = [];
            $rowBright = [];
            $rowDark = [];
            for ($x = 0; $x < $w; $x++) {
                $gVal = $gradient[$y][$x];
                $row15[] = ($gVal < 15) ? 1 : 0;
                $row30[] = ($gVal < 30) ? 1 : 0;
                $row50[] = ($gVal < 50) ? 1 : 0;
                $rowBright[] = ($gray[$y][$x] > 200) ? 1 : 0;
                $rowDark[] = ($gray[$y][$x] < 55) ? 1 : 0;
            }
            $binaryEdge15[] = $row15;
            $binaryEdge30[] = $row30;
            $binaryEdge50[] = $row50;
            $binaryBright[] = $rowBright;
            $binaryDark[] = $rowDark;
        }

        // 3. Collect candidates
        $candidates = [];
        $grids = [
            ['binary' => $binaryEdge15, 'threshold' => 15],
            ['binary' => $binaryEdge30, 'threshold' => 30],
            ['binary' => $binaryEdge50, 'threshold' => 50],
            ['binary' => $binaryBright, 'threshold' => 200],
            ['binary' => $binaryDark, 'threshold' => 55],
        ];

        foreach ($grids as $gInfo) {
            $bin = $gInfo['binary'];
            $comps = $this->connectedComponents($bin, $w, $h);
            foreach ($comps as $comp) {
                $score = $this->scoreCandidate($comp, $gray, $gradient, $w, $h);
                if ($score < 0.25) {
                    continue;
                }

                $frame = $this->buildFrameFromComponent($comp, $bin, $w, $h, $targetW, $targetH, 'color');
                if ($frame) {
                    $frame['score'] = $score;
                    $candidates[] = $frame;
                }
            }
        }

        // Fallback for single large frame (only if it covers between 40% and 95% of the canvas)
        if (empty($candidates)) {
            $comps = $this->connectedComponents($binaryEdge30, $w, $h);
            $bestComp = null;
            $bestArea = 0;
            foreach ($comps as $comp) {
                $areaFrac = $comp['area'] / ($w * $h);
                if ($areaFrac > 0.4 && $areaFrac < 0.95 && $comp['area'] > $bestArea) {
                    $bestComp = $comp;
                    $bestArea = $comp['area'];
                }
            }
            if ($bestComp) {
                $frame = $this->buildFrameFromComponent($bestComp, $binaryEdge30, $w, $h, $targetW, $targetH, 'color');
                if ($frame) {
                    $frame['score'] = 1.0;
                    $candidates[] = $frame;
                }
            }
        }

        if (empty($candidates)) {
            return null;
        }

        // 4. Deduplicate (Non-Maximum Suppression by score and overlap)
        usort($candidates, fn($a, $b) => $b['score'] <=> $a['score']);

        $filtered = [];
        foreach ($candidates as $cand) {
            $isDuplicate = false;
            foreach ($filtered as $selected) {
                if ($this->isOverlap($cand, $selected)) {
                    $isDuplicate = true;
                    break;
                }
            }
            if (!$isDuplicate) {
                $filtered[] = $cand;
            }
        }

        return [
            'frame_count' => count($filtered),
            'method' => 'color',
            'frames' => $this->sortRowMajor($filtered),
        ];
    }

    private function buildGrayscaleGrid($img, int $w, int $h): array
    {
        $grid = [];
        for ($y = 0; $y < $h; $y++) {
            $row = [];
            for ($x = 0; $x < $w; $x++) {
                $rgb = imagecolorat($img, $x, $y);
                $r = ($rgb >> 16) & 0xFF;
                $g = ($rgb >> 8) & 0xFF;
                $b = $rgb & 0xFF;
                $row[] = (int) round(0.299 * $r + 0.587 * $g + 0.114 * $b);
            }
            $grid[] = $row;
        }
        return $grid;
    }

    private function buildGradientGrid(array $gray, int $w, int $h): array
    {
        $gradient = array_fill(0, $h, array_fill(0, $w, 0));
        for ($y = 1; $y < $h - 1; $y++) {
            for ($x = 1; $x < $w - 1; $x++) {
                $gx = ($gray[$y - 1][$x + 1] + 2 * $gray[$y][$x + 1] + $gray[$y + 1][$x + 1]) -
                      ($gray[$y - 1][$x - 1] + 2 * $gray[$y][$x - 1] + $gray[$y + 1][$x - 1]);
                $gy = ($gray[$y + 1][$x - 1] + 2 * $gray[$y + 1][$x] + $gray[$y + 1][$x + 1]) -
                      ($gray[$y - 1][$x - 1] + 2 * $gray[$y - 1][$x] + $gray[$y - 1][$x + 1]);
                $gradient[$y][$x] = (int) round(sqrt($gx * $gx + $gy * $gy));
            }
        }
        return $gradient;
    }

    private function scoreCandidate(array $comp, array $gray, array $gradient, int $w, int $h): float
    {
        $bbox = $comp['bbox'];
        $bw = $bbox['w'];
        $bh = $bbox['h'];
        $area = $comp['area'];
        $totalArea = $w * $h;
        $areaFrac = $area / $totalArea;

        if ($areaFrac < self::MIN_COMPONENT_AREA_FRAC || $areaFrac > 0.75) {
            return -999.0;
        }

        if ($bw < $w * self::MIN_COMPONENT_DIM_FRAC || $bh < $h * self::MIN_COMPONENT_DIM_FRAC) {
            return -999.0;
        }

        $aspect = $bw / $bh;
        if ($aspect < 0.1 || $aspect > 10.0) {
            return -999.0;
        }

        $touchesLeft = $bbox['x'] <= 1;
        $touchesRight = ($bbox['x'] + $bw) >= $w - 2;
        $touchesTop = $bbox['y'] <= 1;
        $touchesBottom = ($bbox['y'] + $bh) >= $h - 2;

        $borderTouches = ($touchesLeft ? 1 : 0) + ($touchesRight ? 1 : 0) + ($touchesTop ? 1 : 0) + ($touchesBottom ? 1 : 0);
        if ($borderTouches >= 3 && $areaFrac > 0.45) {
            return -999.0;
        }

        $pixels = $comp['pixels'] ?? [];
        if (empty($pixels)) {
            return -999.0;
        }

        $sum = 0;
        foreach ($pixels as [$px, $py]) {
            $sum += $gray[$py][$px];
        }
        $mean = $sum / $area;

        $variance = 0;
        foreach ($pixels as [$px, $py]) {
            $diff = $gray[$py][$px] - $mean;
            $variance += $diff * $diff;
        }
        $stdDev = sqrt($variance / $area);

        $uniformity = 1.0 - min(1.0, $stdDev / 50.0);

        $insideMap = [];
        foreach ($pixels as [$px, $py]) {
            $insideMap["{$px},{$py}"] = true;
        }

        $boundaryGradients = [];
        $outerPixels = [];
        foreach ($pixels as [$px, $py]) {
            $isBoundary = false;
            foreach ([[-1, 0], [1, 0], [0, -1], [0, 1]] as [$dx, $dy]) {
                $nx = $px + $dx;
                $ny = $py + $dy;
                if ($nx < 0 || $nx >= $w || $ny < 0 || $ny >= $h || !isset($insideMap["{$nx},{$ny}"])) {
                    $isBoundary = true;
                    if ($nx >= 0 && $nx < $w && $ny >= 0 && $ny < $h) {
                        $outerPixels["{$nx},{$ny}"] = $gray[$ny][$nx];
                    }
                }
            }
            if ($isBoundary) {
                $boundaryGradients[] = $gradient[$py][$px];
            }
        }

        $avgBoundaryGradient = count($boundaryGradients) > 0 ? array_sum($boundaryGradients) / count($boundaryGradients) : 0.0;
        $edgeScore = min(1.0, $avgBoundaryGradient / 25.0);

        $avgOuter = count($outerPixels) > 0 ? array_sum($outerPixels) / count($outerPixels) : 128.0;
        $contrast = abs($mean - $avgOuter);
        $contrastScore = min(1.0, $contrast / 75.0);

        if ($areaFrac >= 0.05 && $areaFrac <= 0.45) {
            $sizeScore = 1.0;
        } elseif ($areaFrac < 0.05) {
            $sizeScore = $areaFrac / 0.05;
        } else {
            $sizeScore = (0.75 - $areaFrac) / (0.75 - 0.45);
        }

        return (0.35 * $edgeScore) + (0.25 * $uniformity) + (0.2 * $contrastScore) + (0.2 * $sizeScore);
    }

    private function isOverlap(array $frameA, array $frameB): bool
    {
        $xA = max($frameA['x'], $frameB['x']);
        $yA = max($frameA['y'], $frameB['y']);
        $xB = min($frameA['x'] + $frameA['width'], $frameB['x'] + $frameB['width']);
        $yB = min($frameA['y'] + $frameA['height'], $frameB['y'] + $frameB['height']);

        $interArea = max(0, $xB - $xA) * max(0, $yB - $yA);
        if ($interArea <= 0) {
            return false;
        }

        $areaA = $frameA['width'] * $frameA['height'];
        $areaB = $frameB['width'] * $frameB['height'];

        $unionArea = $areaA + $areaB - $interArea;
        $iou = $interArea / $unionArea;

        $overlapA = $interArea / $areaA;
        $overlapB = $interArea / $areaB;

        return $iou > 0.45 || $overlapA > 0.85 || $overlapB > 0.85;
    }

    /**
     * Bangun satu frame dari komponen terhubung pada grid biner.
     *
     * @return array<string, mixed>|null
     */
    private function buildFrameFromComponent(array $comp, array $binary, int $gridW, int $gridH, int $targetW, int $targetH, string $source): ?array
    {
        $bbox = $comp['bbox'];
        $bw = $bbox['w'];
        $bh = $bbox['h'];
        if ($bw <= 0 || $bh <= 0) {
            return null;
        }

        $fillRatio = $comp['area'] / ($bw * $bh);
        $points = $this->traceBoundary($binary, $gridW, $gridH, $bbox);
        if (count($points) < 3) {
            $points = [
                [$bbox['x'], $bbox['y']],
                [$bbox['x'] + $bw - 1, $bbox['y']],
                [$bbox['x'] + $bw - 1, $bbox['y'] + $bh - 1],
                [$bbox['x'], $bbox['y'] + $bh - 1],
            ];
        }

        $tol = max(2, (int) round(min($gridW, $gridH) * 0.008));
        $simplified = $this->simplifyPoints($points, $tol);

        $class = $this->classify($binary, $gridW, $gridH, $bbox, $comp['area'], $fillRatio, $simplified);
        $mask = $this->buildMask($class, $simplified, $bbox, $targetW, $targetH, $gridW, $gridH);

        $x = max(0, (int) round($bbox['x'] * $targetW / $gridW));
        $y = max(0, (int) round($bbox['y'] * $targetH / $gridH));
        $w = (int) round($bw * $targetW / $gridW);
        $h = (int) round($bh * $targetH / $gridH);
        if ($x + $w > $targetW) {
            $w = max(1, $targetW - $x);
        }
        if ($y + $h > $targetH) {
            $h = max(1, $targetH - $y);
        }

        $shape = $class['shape'];

        return [
            'id' => 0,
            'order' => 0,
            'shape' => $shape,
            'x' => $x,
            'y' => $y,
            'width' => $w,
            'height' => $h,
            'position' => ['x' => $x, 'y' => $y],
            'size' => ['width' => $w, 'height' => $h],
            'mask' => $mask,
            'corner_radius' => $class['corner_radius'] ?? null,
            'radius' => $class['radius'] ?? null,
            'radius_y' => $class['radius_y'] ?? null,
            'fill_ratio' => round($fillRatio, 4),
            'source' => $source,
        ];
    }

    /**
     * Klasifikasi bentuk dari komponen: rectangle/square/rounded-rectangle/
     * circle/oval/triangle/polygon/custom.
     *
     * @return array{shape:string, corner_radius?:int|null, radius?:int|null, radius_y?:int|null}
     */
    private function classify(array $binary, int $gridW, int $gridH, array $bbox, int $area, float $fillRatio, array $points): array
    {
        $bw = $bbox['w'];
        $bh = $bbox['h'];
        $minDim = max(1, min($bw, $bh));
        $aspect = abs($bw - $bh) / max(1, max($bw, $bh));

        $hull = $this->convexHull($points);
        $hullArea = $this->polygonArea($hull);
        $solidness = $hullArea > 0 ? $area / $hullArea : 0;

        // Segitiga: hull 3 titik & hampir semua area dalam hull terisi.
        if (count($hull) === 3 && $solidness > 0.9) {
            return ['shape' => 'triangle'];
        }

        // Okupansi sudut bounding box: cek piksel di keempat sudut sebenarnya
        // (region 3x3). Sudut tajam => terisi; sudut membulat/elips => kosong.
        $cornerFilled = 0;
        foreach ([
            [$bbox['x'], $bbox['y']],
            [$bbox['x'] + $bw - 1, $bbox['y']],
            [$bbox['x'], $bbox['y'] + $bh - 1],
            [$bbox['x'] + $bw - 1, $bbox['y'] + $bh - 1],
        ] as [$cx, $cy]) {
            $filled = 0;
            for ($dy = -1; $dy <= 1; $dy++) {
                for ($dx = -1; $dx <= 1; $dx++) {
                    if ($this->isInBinary($binary, $gridW, $gridH, $cx + $dx, $cy + $dy)) {
                        $filled++;
                    }
                }
            }
            if ($filled >= 5) {
                $cornerFilled++;
            }
        }

        // Persegi / persegi panjang
        if ($cornerFilled >= 3 && $fillRatio > 0.90) {
            $shape = $aspect < 0.06 ? 'square' : 'rectangle';
            return ['shape' => $shape];
        }

        // Persegi dengan sudut membulat
        if ($cornerFilled <= 1 && $fillRatio > 0.85) {
            $cornerRadius = $this->estimateCornerRadius($binary, $gridW, $gridH, $bbox);
            if ($cornerRadius >= max(2, $minDim * 0.02)) {
                return ['shape' => 'rounded-rectangle', 'corner_radius' => $cornerRadius];
            }
            return ['shape' => 'rectangle'];
        }

        // Lingkaran / oval (fill ratio ≈ π/4 ≈ 0.785) dengan simetri radial
        if ($fillRatio >= 0.66 && $fillRatio <= 0.90) {
            if ($this->isRadialEllipse($binary, $gridW, $gridH, $bbox)) {
                if ($aspect < 0.08) {
                    return ['shape' => 'circle', 'radius' => (int) round($bw / 2)];
                }
                return [
                    'shape' => 'oval',
                    'radius' => (int) round($bw / 2),
                    'radius_y' => (int) round($bh / 2),
                ];
            }
        }

        // Poligon: solid dengan beberapa sisi lurus
        if ($solidness > 0.72 && count($hull) >= 4 && count($hull) <= 12) {
            return ['shape' => 'polygon'];
        }

        return ['shape' => 'custom'];
    }

    /**
     * Bangun poligon mask (koordinat canvas absolut) dari klasifikasi bentuk.
     *
     * @return array<int, array{0:int, 1:int}>
     */
    private function buildMask(array $class, array $points, array $bbox, int $targetW, int $targetH, int $gridW, int $gridH): array
    {
        $scaleX = $targetW / $gridW;
        $scaleY = $targetH / $gridH;
        $shape = $class['shape'];

        // Lingkaran/oval: sampel elips matematis agar tepi halus
        if ($shape === 'circle' || $shape === 'oval') {
            $cx = ($bbox['x'] + $bbox['w'] / 2) * $scaleX;
            $cy = ($bbox['y'] + $bbox['h'] / 2) * $scaleY;
            $rx = ($bbox['w'] / 2) * $scaleX;
            $ry = ($bbox['h'] / 2) * $scaleY;
            $mask = [];
            $steps = 48;
            for ($i = 0; $i < $steps; $i++) {
                $t = 2 * M_PI * $i / $steps;
                $mask[] = [(int) round($cx + $rx * cos($t)), (int) round($cy + $ry * sin($t))];
            }
            return $mask;
        }

        // Segitiga / poligon: gunakan vertex convex hull agar sisi lurus presisi
        if ($shape === 'triangle' || $shape === 'polygon') {
            $hull = $this->convexHull($points);
            $mask = [];
            foreach ($hull as $p) {
                $mask[] = [(int) round($p[0] * $scaleX), (int) round($p[1] * $scaleY)];
            }
            return $mask;
        }

        // Persegi / rounded / custom: ikuti outline yang telah dilacak
        if ($shape === 'rectangle' || $shape === 'square') {
            return [
                [(int) round($bbox['x'] * $scaleX), (int) round($bbox['y'] * $scaleY)],
                [(int) round(($bbox['x'] + $bbox['w']) * $scaleX), (int) round($bbox['y'] * $scaleY)],
                [(int) round(($bbox['x'] + $bbox['w']) * $scaleX), (int) round(($bbox['y'] + $bbox['h']) * $scaleY)],
                [(int) round($bbox['x'] * $scaleX), (int) round(($bbox['y'] + $bbox['h']) * $scaleY)],
            ];
        }

        $mask = [];
        foreach ($points as $p) {
            $mask[] = [(int) round($p[0] * $scaleX), (int) round($p[1] * $scaleY)];
        }
        if (count($mask) < 3) {
            $mask = [
                [(int) round($bbox['x'] * $scaleX), (int) round($bbox['y'] * $scaleY)],
                [(int) round(($bbox['x'] + $bbox['w']) * $scaleX), (int) round($bbox['y'] * $scaleY)],
                [(int) round(($bbox['x'] + $bbox['w']) * $scaleX), (int) round(($bbox['y'] + $bbox['h']) * $scaleY)],
                [(int) round($bbox['x'] * $scaleX), (int) round(($bbox['y'] + $bbox['h']) * $scaleY)],
            ];
        }

        return $mask;
    }

    /**
     * Frame persegi dari slot (untuk fallback frame_configuration lama).
     *
     * @return array<string, mixed>
     */
    private function rectFrame(array $slot, string $source): array
    {
        $x = (int) $slot['x'];
        $y = (int) $slot['y'];
        $w = (int) $slot['width'];
        $h = (int) $slot['height'];

        return [
            'id' => 0,
            'order' => 0,
            'shape' => 'rectangle',
            'x' => $x,
            'y' => $y,
            'width' => $w,
            'height' => $h,
            'position' => ['x' => $x, 'y' => $y],
            'size' => ['width' => $w, 'height' => $h],
            'mask' => [
                [$x, $y],
                [$x + $w, $y],
                [$x + $w, $y + $h],
                [$x, $y + $h],
            ],
            'corner_radius' => null,
            'radius' => null,
            'radius_y' => null,
            'fill_ratio' => 1.0,
            'source' => $source,
        ];
    }

    /**
     * Beri id/order final pada frame.
     */
    private function finalize(array $result): array
    {
        $frames = $result['frames'];
        foreach ($frames as $i => $frame) {
            $frames[$i]['id'] = $i + 1;
            $frames[$i]['order'] = $i;
        }
        $result['frames'] = $frames;
        $result['frame_count'] = count($frames);

        return $result;
    }

    // ==============================================================
    // Connected Components
    // ==============================================================

    /**
     * Temukan semua komponen terhubung (4-connectivity).
     *
     * @return array<int, array{area:int, bbox:array{x:int,y:int,w:int,h:int}}>
     */
    private function connectedComponents(array $binary, int $w, int $h): array
    {
        $visited = array_fill(0, $h, array_fill(0, $w, false));
        $components = [];

        for ($y = 0; $y < $h; $y++) {
            for ($x = 0; $x < $w; $x++) {
                if (! $binary[$y][$x] || $visited[$y][$x]) {
                    continue;
                }
                $comp = $this->floodFill($binary, $visited, $w, $h, $x, $y);
                if ($comp['area'] > 0) {
                    $components[] = $comp;
                }
            }
        }

        return $components;
    }

    /**
     * Flood fill satu komponen terhubung.
     *
     * @return array{area:int, bbox:array{x:int,y:int,w:int,h:int}, pixels:array}
     */
    private function floodFill(array $binary, array &$visited, int $w, int $h, int $sx, int $sy): array
    {
        $queue = [[$sx, $sy]];
        $visited[$sy][$sx] = true;
        $area = 0;
        $minX = $sx;
        $maxX = $sx;
        $minY = $sy;
        $maxY = $sy;
        $pixels = [];

        while ($queue) {
            [$px, $py] = array_pop($queue);
            $area++;
            $pixels[] = [$px, $py];
            if ($px < $minX) {
                $minX = $px;
            }
            if ($px > $maxX) {
                $maxX = $px;
            }
            if ($py < $minY) {
                $minY = $py;
            }
            if ($py > $maxY) {
                $maxY = $py;
            }

            foreach ([[$px - 1, $py], [$px + 1, $py], [$px, $py - 1], [$px, $py + 1]] as [$nx, $ny]) {
                if ($nx >= 0 && $nx < $w && $ny >= 0 && $ny < $h
                    && $binary[$ny][$nx] && ! $visited[$ny][$nx]) {
                    $visited[$ny][$nx] = true;
                    $queue[] = [$nx, $ny];
                }
            }
        }

        return [
            'area' => $area,
            'bbox' => ['x' => $minX, 'y' => $minY, 'w' => $maxX - $minX + 1, 'h' => $maxY - $minY + 1],
            'pixels' => $pixels,
        ];
    }

    // ==============================================================
    // Boundary tracing (Moore) + simplification
    // ==============================================================

    /**
     * Lacak boundary komponen menggunakan Moore neighbor tracing.
     * Mengembalikan titik boundary berurutan (koordinat absolut grid).
     *
     * @return array<int, array{0:int, 1:int}>
     */
    private function traceBoundary(array $binary, int $gridW, int $gridH, array $bbox): array
    {
        // Titik awal: piksel paling atas, lalu paling kiri di dalam bbox
        $start = null;
        for ($yy = 0; $yy < $bbox['h']; $yy++) {
            for ($xx = 0; $xx < $bbox['w']; $xx++) {
                if ($binary[$bbox['y'] + $yy][$bbox['x'] + $xx]) {
                    $start = [$bbox['x'] + $xx, $bbox['y'] + $yy];
                    break 2;
                }
            }
        }
        if ($start === null) {
            return [];
        }

        // Urutan searah jarum jam (koordinat y ke bawah): E, SE, S, SW, W, NW, N, NE
        $dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

        $points = [$start];
        $b = $start;
        // Backtrack awal = piksel di sebelah barat titik mulai
        $c = [$start[0] - 1, $start[1]];
        $maxIter = $gridW * $gridH + 64;

        for ($iter = 0; $iter < $maxIter; $iter++) {
            $cIdx = $this->dirIndex($dirs, $b, $c);
            if ($cIdx === -1) {
                break;
            }

            $found = null;
            $foundIdx = -1;
            for ($k = 1; $k <= 8; $k++) {
                $idx = ($cIdx + $k) % 8;
                $nx = $b[0] + $dirs[$idx][0];
                $ny = $b[1] + $dirs[$idx][1];
                if ($nx >= 0 && $nx < $gridW && $ny >= 0 && $ny < $gridH && $binary[$ny][$nx]) {
                    $found = [$nx, $ny];
                    $foundIdx = $idx;
                    break;
                }
            }
            if ($found === null) {
                break;
            }

            // Backtrack baru = tetangga satu langkah berlawanan arah jarum jam dari titik yang ditemukan
            $cIdx2 = ($foundIdx - 1 + 8) % 8;
            $c = [$b[0] + $dirs[$cIdx2][0], $b[1] + $dirs[$cIdx2][1]];

            // Kembali ke titik awal = contour tertutup
            if ($found[0] === $start[0] && $found[1] === $start[1] && count($points) > 1) {
                break;
            }

            $b = $found;
            $points[] = $b;
        }

        return $points;
    }

    /**
     * Indeks arah c relatif terhadap b pada daftar arah.
     */
    private function dirIndex(array $dirs, array $b, array $c): int
    {
        $dx = $c[0] - $b[0];
        $dy = $c[1] - $b[1];
        foreach ($dirs as $i => $d) {
            if ($d[0] === $dx && $d[1] === $dy) {
                return $i;
            }
        }
        return -1;
    }

    /**
     * Penyederhanaan poligon (Ramer-Douglas-Peucker) dengan perlakuan tertutup.
     *
     * @return array<int, array{0:int, 1:int}>
     */
    private function simplifyPoints(array $points, int $tolerance): array
    {
        $count = count($points);
        if ($count <= 4) {
            return $points;
        }

        $closed = $points;
        $closed[] = $points[0];

        $simplified = $this->douglasPeucker($closed, 0, count($closed) - 1, $tolerance);

        $first = $simplified[0];
        $last = $simplified[count($simplified) - 1];
        if ($last[0] === $first[0] && $last[1] === $first[1]) {
            array_pop($simplified);
        }

        if (count($simplified) < 3) {
            return $points;
        }

        return $simplified;
    }

    /**
     * Rekursi Douglas-Peucker.
     *
     * @return array<int, array{0:int, 1:int}>
     */
    private function douglasPeucker(array $points, int $start, int $end, int $tolerance): array
    {
        $maxDist = 0;
        $index = -1;
        [$ax, $ay] = $points[$start];
        [$bx, $by] = $points[$end];

        for ($i = $start + 1; $i < $end; $i++) {
            $d = $this->perpendicularDistance($points[$i][0], $points[$i][1], $ax, $ay, $bx, $by);
            if ($d > $maxDist) {
                $maxDist = $d;
                $index = $i;
            }
        }

        if ($maxDist > $tolerance && $index !== -1) {
            $left = $this->douglasPeucker($points, $start, $index, $tolerance);
            $right = $this->douglasPeucker($points, $index, $end, $tolerance);
            return array_merge(array_slice($left, 0, -1), $right);
        }

        return [$points[$start], $points[$end]];
    }

    private function perpendicularDistance(int $x, int $y, int $x1, int $y1, int $x2, int $y2): float
    {
        $dx = $x2 - $x1;
        $dy = $y2 - $y1;
        $len = sqrt($dx * $dx + $dy * $dy);
        if ($len <= 0) {
            return abs($x - $x1) + abs($y - $y1);
        }
        return abs($dy * $x - $dx * $y + $x2 * $y1 - $y2 * $x1) / $len;
    }

    // ==============================================================
    // Convex hull & area
    // ==============================================================

    /**
     * Convex hull (Andrew monotone chain), urutan counter-clockwise.
     *
     * @return array<int, array{0:int, 1:int}>
     */
    private function convexHull(array $points): array
    {
        $n = count($points);
        if ($n <= 3) {
            return $points;
        }

        $pts = $points;
        usort($pts, function ($a, $b) {
            return $a[0] <=> $b[0] ?: $a[1] <=> $b[1];
        });

        $cross = function ($o, $a, $b) {
            return ($a[0] - $o[0]) * ($b[1] - $o[1]) - ($a[1] - $o[1]) * ($b[0] - $o[0]);
        };

        $lower = [];
        foreach ($pts as $p) {
            while (count($lower) >= 2 && $cross($lower[count($lower) - 2], $lower[count($lower) - 1], $p) <= 0) {
                array_pop($lower);
            }
            $lower[] = $p;
        }

        $upper = [];
        foreach (array_reverse($pts) as $p) {
            while (count($upper) >= 2 && $cross($upper[count($upper) - 2], $upper[count($upper) - 1], $p) <= 0) {
                array_pop($upper);
            }
            $upper[] = $p;
        }

        array_pop($lower);
        array_pop($upper);

        return array_merge($lower, $upper);
    }

    /**
     * Luas poligon (shoelace), nilai absolut.
     */
    private function polygonArea(array $points): float
    {
        $n = count($points);
        if ($n < 3) {
            return 0;
        }
        $sum = 0;
        for ($i = 0; $i < $n; $i++) {
            [$x1, $y1] = $points[$i];
            [$x2, $y2] = $points[($i + 1) % $n];
            $sum += $x1 * $y2 - $x2 * $y1;
        }
        return abs($sum) / 2;
    }

    // ==============================================================
    // Shape helpers
    // ==============================================================

    private function isInBinary(array $binary, int $gridW, int $gridH, int $x, int $y): bool
    {
        if ($x < 0 || $x >= $gridW || $y < 0 || $y >= $gridH) {
            return false;
        }
        return (bool) $binary[$y][$x];
    }

    /**
     * Estimasi radius sudut membulat menggunakan jarak diagonal dari sudut
     * bounding box ke piksel terisi pertama (r ≈ d / (2 - √2)).
     */
    private function estimateCornerRadius(array $binary, int $gridW, int $gridH, array $bbox): int
    {
        $x0 = $bbox['x'];
        $y0 = $bbox['y'];
        $bw = $bbox['w'];
        $bh = $bbox['h'];
        $maxSteps = (int) min($bw, $bh) * 0.4;

        $distances = [];
        $corners = [[$x0, $y0, 1, 1]];
        foreach ($corners as [$cx, $cy, $sx, $sy]) {
            $d = 0;
            for ($i = 1; $i <= $maxSteps; $i++) {
                $px = $cx + $sx * $i;
                $py = $cy + $sy * $i;
                if ($this->isInBinary($binary, $gridW, $gridH, $px, $py)) {
                    $d = $i;
                    break;
                }
            }
            if ($d > 0) {
                $distances[] = $d;
            }
        }

        if (empty($distances)) {
            return 0;
        }

        $d = array_sum($distances) / count($distances);
        $r = (int) round($d / 0.586);

        return max(1, $r);
    }

    /**
     * Uji apakah bentuk sesuai elips (circle/oval) lewat perbandingan jarak
     * radial terhadap persamaan elips.
     */
    private function isRadialEllipse(array $binary, int $gridW, int $gridH, array $bbox): bool
    {
        $cx = $bbox['x'] + $bbox['w'] / 2;
        $cy = $bbox['y'] + $bbox['h'] / 2;
        $rx = $bbox['w'] / 2;
        $ry = $bbox['h'] / 2;
        if ($rx <= 0 || $ry <= 0) {
            return false;
        }

        $errors = [];
        $angles = 12;
        for ($i = 0; $i < $angles; $i++) {
            $a = 2 * M_PI * $i / $angles;
            $dirX = cos($a);
            $dirY = sin($a);

            // Jarak radial elips pada sudut a
            $denom = sqrt(($ry * $dirX) ** 2 + ($rx * $dirY) ** 2);
            if ($denom <= 0) {
                continue;
            }
            $expected = ($rx * $ry) / $denom;

            // Cari jarak ke boundary: scan dari luar ke dalam, ambil piksel
            // foreground terluar pertama pada sinar.
            $measured = null;
            $maxT = max($rx, $ry) + 2;
            for ($t = $maxT; $t >= 1; $t--) {
                $px = (int) round($cx + $dirX * $t);
                $py = (int) round($cy + $dirY * $t);
                if ($this->isInBinary($binary, $gridW, $gridH, $px, $py)) {
                    $measured = $t;
                    break;
                }
            }
            if ($measured === null) {
                return false;
            }

            $errors[] = abs($measured - $expected) / $expected;
        }

        if (empty($errors)) {
            return false;
        }

        return (array_sum($errors) / count($errors)) < 0.18;
    }

    /**
     * Urutkan frame berdasarkan posisi visual: atas ke bawah, lalu kiri ke kanan
     * (dikelompokkan per baris).
     */
    private function sortRowMajor(array $frames): array
    {
        $count = count($frames);
        if ($count <= 1) {
            return $frames;
        }

        $minH = PHP_INT_MAX;
        foreach ($frames as $f) {
            $minH = min($minH, $f['height']);
        }
        $tol = max(1, $minH * 0.45);

        $items = [];
        foreach ($frames as $i => $f) {
            $items[] = [
                'i' => $i,
                'cy' => $f['y'] + $f['height'] / 2,
                'cx' => $f['x'] + $f['width'] / 2,
            ];
        }

        $rows = [];
        foreach ($items as $it) {
            $placed = false;
            foreach ($rows as $ri => $row) {
                if (abs($row['cy'] - $it['cy']) <= $tol) {
                    $rows[$ri]['cy'] = ($row['cy'] + $it['cy']) / 2;
                    $rows[$ri]['items'][] = $it;
                    $placed = true;
                    break;
                }
            }
            if (! $placed) {
                $rows[] = ['cy' => $it['cy'], 'items' => [$it]];
            }
        }

        usort($rows, fn ($a, $b) => $a['cy'] <=> $b['cy']);

        $out = [];
        foreach ($rows as $row) {
            $items = $row['items'];
            usort($items, fn ($a, $b) => $a['cx'] <=> $b['cx']);
            foreach ($items as $it) {
                $out[] = $frames[$it['i']];
            }
        }

        return $out;
    }

    // ==============================================================
    // Image helpers
    // ==============================================================

    private function loadImage(string $path)
    {
        $info = @getimagesize($path);
        if (! $info) {
            return false;
        }

        return match ($info[2]) {
            IMAGETYPE_JPEG => @imagecreatefromjpeg($path),
            IMAGETYPE_PNG => @imagecreatefrompng($path),
            IMAGETYPE_WEBP => @imagecreatefromwebp($path),
            default => false,
        };
    }
}