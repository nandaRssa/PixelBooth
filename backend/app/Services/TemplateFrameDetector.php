<?php

namespace App\Services;

/**
 * Auto Frame Detection berbasis REGION (bukan proyeksi kotak).
 *
 * Paradigma: analisis seluruh template menjadi region-region visual yang
 * dipisahkan oleh boundary warna, lalu nilai setiap region sebagai kandidat
 * slot foto menggunakan kombinasi ukuran, konsistensi warna/tekstur,
 * kejelasan boundary, bentuk, posisi, dan kemiripan dengan region referensi.
 *
 * Prinsip penting:
 *  - Frame TIDAK harus persegi/simetris/tegak lurus. Kemiringan asli
 *    dipertahankan lewat estimasi orientasi (image moments) dan disimpan
 *    pada field `rotation`.
 *  - Warna bukan satu-satunya indikator; slot putih, biru muda, atau warna
 *    lain sama-sama valid selalu karakteristiknya kuat.
 *  - Boundary konsisten (garis tipis sekalipun) memisahkan region — region
 *    tidak "bocor" melewati garis hanya karena warnanya mirip.
 *  - Bingkai dekoratif / background yang menempel tepi canvas ditolak;
 *    yang dipilih area foto di dalamnya.
 *  - Jumlah frame mengikuti hasil analisis, tanpa batas asumsi.
 *
 * Hasil berupa frame_configuration (x, y, width, height, rotation,
 * confidence, order) yang siap dipakai PhotoRenderService; bentuk asli
 * region dipertahankan oleh engine mask (smart clear mengikuti warna).
 */
class TemplateFrameDetector
{
    /** Resolusi kerja maksimum (sisi terpanjang). */
    private const WORK_MAX = 400;

    /** Ambang gradien warna yang menandai piksel boundary (sangat sensitif). */
    private const EDGE_T = 12;

    /** Jarak warna Euclid maksimum antar piksel tetangga agar satu region. */
    private const MERGE_T = 16.0;

    /** Confidence minimum agar region dijadikan frame (0..1). */
    private const MIN_CONFIDENCE = 0.55;

    /** Reclaim tepi: langkah & jarak maksimum jalan keluar (px kerja). */
    private const RECLAIM_STEP = 0.5;
    private const RECLAIM_MAX = 8.0;

    /** Berhenti bila menemui warna DATAR yang beda >90 dari warna tepi. */
    private const RECLAIM_STOP_T = 90.0;

    /** Dua sampel berjarak 1px saling mirip <=24 = warna datar (bukan pita AA). */
    private const RECLAIM_FLAT_T = 24.0;

    /**
     * Deteksi slot foto pada file template.
     *
     * @param string|null $canvasWidth  Lebar canvas tempat template dirender
     *                                  (bila berbeda dari ukuran file gambar).
     * @param string|null $canvasHeight Tinggi canvas tempat template dirender.
     * @return array{detection_method: string, frame_count: int, frame_configuration: array}|null
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

        $targetW = $canvasWidth ?? $info[0];
        $targetH = $canvasHeight ?? $info[1];

        // ==================================================
        // KONDISI 1 — TEMPLATE MEMILIKI TRANSPARANSI
        // ==================================================
        if (in_array($info[2], [IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) {
            $transparentResult = $this->detectTransparentRegions($filePath, $targetW, $targetH);
            if ($transparentResult !== null && $transparentResult['frame_count'] > 0) {
                return $transparentResult;
            }
        }

        // ==================================================
        // KONDISI 2 — TIDAK ADA TRANSPARANSI (SMART CLEAR EXISTING)
        // ==================================================
        return $this->detectSmartClear($filePath, $info, $targetW, $targetH);
    }

    /**
     * KONDISI 1: Deteksi frame berbasis area transparan / lubang transparan (PNG/WEBP).
     *
     * 1 VALID TRANSPARENT REGION = 1 CAMERA FRAME
     * - Membedakan background transparan (full canvas) vs photo hole interior.
     * - Mengabaikan noise, anti-aliasing edge, dan ornament/logo hole kecil.
     * - 100% COVER TRANSPARENCY + SLIGHT OVERSCAN (kamera sedikit lebih besar dari lubang).
     * - JANGAN MENGHAPUS DESAIN (source = 'transparent').
     *
     * @return array{detection_method: string, frame_count: int, frame_configuration: array}|null
     */
    private function detectTransparentRegions(string $filePath, int $targetW, int $targetH): ?array
    {
        $type = @getimagesize($filePath)[2] ?? null;
        $src = null;
        if ($type === IMAGETYPE_PNG && function_exists('imagecreatefrompng')) {
            $src = @imagecreatefrompng($filePath);
        } elseif ($type === IMAGETYPE_WEBP && function_exists('imagecreatefromwebp')) {
            $src = @imagecreatefromwebp($filePath);
        }

        if (! $src) {
            return null;
        }

        $srcW = imagesx($src);
        $srcH = imagesy($src);
        if ($srcW <= 0 || $srcH <= 0) {
            imagedestroy($src);
            return null;
        }

        $scale = min(1.0, self::WORK_MAX / max($srcW, $srcH));
        $w = max(1, (int) round($srcW * $scale));
        $h = max(1, (int) round($srcH * $scale));

        imagealphablending($src, false);
        imagesavealpha($src, true);
        $img = imagecreatetruecolor($w, $h);
        imagealphablending($img, false);
        imagesavealpha($img, true);
        imagecopyresampled($img, $src, 0, 0, 0, 0, $w, $h, $srcW, $srcH);
        imagedestroy($src);

        // Biner transparansi: 1 jika GD alpha >= 24 (lubang transparan)
        $binary = [];
        $transparentCount = 0;
        for ($y = 0; $y < $h; $y++) {
            $row = [];
            for ($x = 0; $x < $w; $x++) {
                $rgba = imagecolorat($img, $x, $y);
                $alpha = ($rgba >> 24) & 0x7F; // GD alpha: 0 = opaque, 127 = fully transparent
                $isTransparent = ($alpha >= 24) ? 1 : 0;
                if ($isTransparent) {
                    $transparentCount++;
                }
                $row[] = $isTransparent;
            }
            $binary[] = $row;
        }
        imagedestroy($img);

        $totalArea = $w * $h;
        if ($transparentCount < max(40, (int) round(0.003 * $totalArea))) {
            return null; // Tidak ada transparansi signifikan
        }

        // Connected Components (4-connectivity)
        $visited = array_fill(0, $h, array_fill(0, $w, false));
        $components = [];

        for ($y = 0; $y < $h; $y++) {
            for ($x = 0; $x < $w; $x++) {
                if (! $binary[$y][$x] || $visited[$y][$x]) {
                    continue;
                }

                // Flood fill satu region transparan terhubung
                $queue = [[$x, $y]];
                $visited[$y][$x] = true;
                $pixels = [];
                $minX = $x; $maxX = $x;
                $minY = $y; $maxY = $y;

                while ($queue) {
                    [$px, $py] = array_pop($queue);
                    $pixels[] = [$px, $py];
                    if ($px < $minX) $minX = $px;
                    if ($px > $maxX) $maxX = $px;
                    if ($py < $minY) $minY = $py;
                    if ($py > $maxY) $maxY = $py;

                    foreach ([[$px - 1, $py], [$px + 1, $py], [$px, $py - 1], [$px, $py + 1]] as [$nx, $ny]) {
                        if ($nx >= 0 && $nx < $w && $ny >= 0 && $ny < $h
                            && $binary[$ny][$nx] && ! $visited[$ny][$nx]) {
                            $visited[$ny][$nx] = true;
                            $queue[] = [$nx, $ny];
                        }
                    }
                }

                $area = count($pixels);
                $bw = $maxX - $minX + 1;
                $bh = $maxY - $minY + 1;

                $touchesLeft = ($minX <= 1);
                $touchesRight = ($maxX >= $w - 2);
                $touchesTop = ($minY <= 1);
                $touchesBottom = ($maxY >= $h - 2);
                $borderTouches = ($touchesLeft ? 1 : 0) + ($touchesRight ? 1 : 0)
                               + ($touchesTop ? 1 : 0) + ($touchesBottom ? 1 : 0);

                $components[] = [
                    'area' => $area,
                    'minX' => $minX,
                    'maxX' => $maxX,
                    'minY' => $minY,
                    'maxY' => $maxY,
                    'bw' => $bw,
                    'bh' => $bh,
                    'pixels' => $pixels,
                    'borderTouches' => $borderTouches,
                ];
            }
        }

        if (empty($components)) {
            return null;
        }

        // Filter: Pisahkan Background Transparan vs Photo Hole
        $selected = [];
        foreach ($components as $comp) {
            $relArea = $comp['area'] / $totalArea;
            $bw = $comp['bw'];
            $bh = $comp['bh'];

            // Background transparan (menyentuh >= 3 tepi canvas, atau menyentuh >=2 tepi dan menutupi > 65% canvas)
            if ($comp['borderTouches'] >= 3) {
                continue;
            }
            if ($comp['borderTouches'] >= 2 && $relArea > 0.65) {
                continue;
            }

            // Saring noise, anti-aliasing, lubang ornamen kecil
            if ($relArea < 0.003) {
                continue; // Terlalu kecil (< 0.3% canvas)
            }
            $minDim = min($w, $h);
            if (min($bw, $bh) < $minDim * 0.025) {
                continue; // Dimensi terlalu sempit (< 2.5%)
            }

            $selected[] = $comp;
        }

        if (empty($selected)) {
            return null;
        }

        // Bangun slot frame dengan 100% COVER TRANSPARENCY + SLIGHT OVERSCAN
        $scaleX = $targetW / $w;
        $scaleY = $targetH / $h;
        $slots = [];

        foreach ($selected as $comp) {
            $bw = $comp['bw'];
            $bh = $comp['bh'];
            $minX = $comp['minX'];
            $minY = $comp['minY'];

            // SEDIKIT OVERSCAN: perluasan kecil ~1.8% dari dimensi slot (min 2.5 px kerja)
            $overscanW = max(2.5, $bw * 0.018);
            $overscanH = max(2.5, $bh * 0.018);

            $workX = max(0.0, $minX - $overscanW);
            $workY = max(0.0, $minY - $overscanH);
            $workW = min((float) $w - $workX, $bw + 2 * $overscanW);
            $workH = min((float) $h - $workY, $bh + 2 * $overscanH);

            $finalX = max(0, (int) round($workX * $scaleX));
            $finalY = max(0, (int) round($workY * $scaleY));
            $finalW = (int) round($workW * $scaleX);
            $finalH = (int) round($workH * $scaleY);

            if ($finalX + $finalW > $targetW) {
                $finalW = max(1, $targetW - $finalX);
            }
            if ($finalY + $finalH > $targetH) {
                $finalH = max(1, $targetH - $finalY);
            }

            // Estimasi bentuk sederhana
            $fillRatio = $comp['area'] / max(1, $bw * $bh);
            $aspect = abs($bw - $bh) / max(1, max($bw, $bh));
            $shape = 'rectangle';
            if ($fillRatio > 0.88) {
                $shape = ($aspect < 0.06) ? 'square' : 'rectangle';
            } elseif ($fillRatio >= 0.65 && $fillRatio <= 0.88) {
                $shape = ($aspect < 0.08) ? 'circle' : 'oval';
            } else {
                $shape = 'polygon';
            }

            $slots[] = [
                'x' => (float) $finalX,
                'y' => (float) $finalY,
                'width' => (float) $finalW,
                'height' => (float) $finalH,
                'rotation' => 0.0,
                'confidence' => 100.0,
                'source' => 'transparent',
                'detection_method' => 'transparent',
                'shape' => $shape,
                'clear_zone' => 100,
            ];
        }

        if (empty($slots)) {
            return null;
        }

        $slots = $this->sortSlots($slots);

        $configuration = [];
        foreach (array_values($slots) as $index => $slot) {
            $slot['order'] = $index;
            $slot['id'] = $index + 1;
            $configuration[] = $slot;
        }

        return [
            'detection_method' => 'transparent',
            'frame_count' => count($configuration),
            'frame_configuration' => $configuration,
        ];
    }

    /**
     * KONDISI 2: Deteksi slot foto berbasis Smart Clear (region & warna).
     *
     * @return array{detection_method: string, frame_count: int, frame_configuration: array}|null
     */
    private function detectSmartClear(string $filePath, array $info, int $targetW, int $targetH): ?array
    {
        $src = $this->load($filePath, $info[2]);
        if (! $src) {
            return null;
        }

        [$pixels, $width, $height] = $this->buildWorkImage($src);
        imagedestroy($src);
        $this->workPx = $pixels;

        // 1) Segmentasi: boundary map + connected components per region warna
        $regions = $this->segmentRegions($pixels, $width, $height);
        if (! $regions) {
            return null;
        }

        // 2) Skoring kandidat + reference signature + similarity boost
        $canvasArea = $width * $height;
        $candidates = $this->scoreRegions($regions, $width, $height, $canvasArea);
        if (! $candidates) {
            return null;
        }

        // 3) Seleksi confidence tinggi, buang duplikat nested & background
        $selected = $this->selectFrames($candidates);
        if (! $selected) {
            return null;
        }

        // 4) Geometri akhir: rotasi momen + proyeksi sumbu utama
        $slots = [];
        foreach ($selected as $cand) {
            $slot = $this->fitRegion($cand, $cand['region']['pixels']);
            if ($slot) {
                $slot['source'] = 'smart_clear';
                $slots[] = $slot;
            }
        }
        if (! $slots) {
            return null;
        }

        $slots = $this->sortSlots($slots);

        return $this->buildResult($slots, $targetW, $targetH, $width, $height, 'smart_clear');
    }

    // ------------------------------------------------------------------
    // Persiapan citra kerja
    // ------------------------------------------------------------------

    /**
     * Downscale + blur ringan (redam noise JPEG) + ekstrak RGB per piksel.
     *
     * @return array{0: array<int, array<int, array{0:int,1:int,2:int}>>, 1: int, 2: int}
     */
    private function buildWorkImage($src): array
    {
        $srcW = imagesx($src);
        $srcH = imagesy($src);
        $scale = min(1, self::WORK_MAX / max($srcW, $srcH));
        $width = max(1, (int) round($srcW * $scale));
        $height = max(1, (int) round($srcH * $scale));

        $img = imagecreatetruecolor($width, $height);
        imagecopyresampled($img, $src, 0, 0, 0, 0, $width, $height, $srcW, $srcH);

        // Blur box 3x3 sekali — noise JPEG hilang, boundary lebar >=2px tetap ada.
        $blurred = imagecreatetruecolor($width, $height);
        imagecopy($blurred, $img, 0, 0, 0, 0, $width, $height);
        for ($y = 0; $y < $height; $y++) {
            for ($x = 0; $x < $width; $x++) {
                $r = $g = $b = $n = 0;
                for ($dy = -1; $dy <= 1; $dy++) {
                    $sy = $y + $dy;
                    if ($sy < 0 || $sy >= $height) {
                        continue;
                    }
                    for ($dx = -1; $dx <= 1; $dx++) {
                        $sx = $x + $dx;
                        if ($sx < 0 || $sx >= $width) {
                            continue;
                        }
                        $c = imagecolorat($img, $sx, $sy);
                        $r += ($c >> 16) & 0xFF;
                        $g += ($c >> 8) & 0xFF;
                        $b += $c & 0xFF;
                        $n++;
                    }
                }
                imagesetpixel($blurred, $x, $y, imagecolorallocate($blurred, (int) round($r / $n), (int) round($g / $n), (int) round($b / $n)));
            }
        }

        $pixels = [];
        for ($y = 0; $y < $height; $y++) {
            $row = [];
            for ($x = 0; $x < $width; $x++) {
                $rgb = imagecolorat($blurred, $x, $y);
                $row[$x] = [($rgb >> 16) & 0xFF, ($rgb >> 8) & 0xFF, $rgb & 0xFF];
            }
            $pixels[$y] = $row;
        }
        imagedestroy($img);
        imagedestroy($blurred);

        return [$pixels, $width, $height];
    }

    // ------------------------------------------------------------------
    // Segmentasi region berbasis boundary
    // ------------------------------------------------------------------

    /**
     * Hitung peta gradien (perbedaan warna antar piksel tetangga).
     * Sangat sensitif: perubahan warna kecil pun tercatat.
     *
     * @return array<int, array<int, float>>
     */
    private function gradientMap(array $px, int $w, int $h): array
    {
        $grad = [];
        for ($y = 0; $y < $h; $y++) {
            $row = [];
            for ($x = 0; $x < $w; $x++) {
                $g = 0.0;
                if ($x + 1 < $w) {
                    $g = max($g, $this->channelDiff($px[$y][$x], $px[$y][$x + 1]));
                }
                if ($y + 1 < $h) {
                    $g = max($g, $this->channelDiff($px[$y][$x], $px[$y + 1][$x]));
                }
                $row[$x] = $g;
            }
            $grad[$y] = $row;
        }

        return $grad;
    }

    /** Selisih maksimum antar kanal (lebih peka daripada luma saja). */
    private function channelDiff(array $a, array $b): float
    {
        return (float) max(abs($a[0] - $b[0]), abs($a[1] - $b[1]), abs($a[2] - $b[2]));
    }

    /** Jarak Euclid RGB. */
    private function colorDist(array $a, array $b): float
    {
        $dr = $a[0] - $b[0];
        $dg = $a[1] - $b[1];
        $db = $a[2] - $b[2];

        return sqrt($dr * $dr + $dg * $dg + $db * $db);
    }

    /**
     * Segmentasi: piksel boundary (gradien > EDGE_T, didilasi 1px untuk
     * menutup celah) tidak pernah dilewati flood — region tidak bocor.
     * Flood juga mensyaratkan warna tetangga mirip (anti penggabungan
     * area berbeda warna walau batasnya lembut).
     *
     * @return array<int, array{id:int, pixels:array<int,int>, w:int, h:int}>
     *         pixels berisi index y*w+x.
     */
    private function segmentRegions(array $px, int $w, int $h): array
    {
        $grad = $this->gradientMap($px, $w, $h);

        // Boundary + dilasi 1 iterasi (8-tetangga) supaya garis putus-putus
        // akibat noise tetap jadi pemisah.
        $boundary = [];
        for ($y = 0; $y < $h; $y++) {
            for ($x = 0; $x < $w; $x++) {
                if ($grad[$y][$x] > self::EDGE_T) {
                    for ($dy = -1; $dy <= 1; $dy++) {
                        $ny = $y + $dy;
                        if ($ny < 0 || $ny >= $h) {
                            continue;
                        }
                        for ($dx = -1; $dx <= 1; $dx++) {
                            $nx = $x + $dx;
                            if ($nx < 0 || $nx >= $w) {
                                continue;
                            }
                            $boundary[$ny * $w + $nx] = true;
                        }
                    }
                }
            }
        }

        // Connected component labeling (8-connectivity) pada non-boundary.
        $labels = [];
        $regions = [];
        $id = 0;
        for ($start = 0; $start < $w * $h; $start++) {
            if (isset($labels[$start]) || isset($boundary[$start])) {
                continue;
            }
            $id++;
            $stack = [$start];
            $labels[$start] = $id;
            $members = [$start];
            while ($stack) {
                $cur = array_pop($stack);
                $cx = $cur % $w;
                $cy = intdiv($cur, $w);
                $curPx = $px[$cy][$cx];
                for ($dy = -1; $dy <= 1; $dy++) {
                    $ny = $cy + $dy;
                    if ($ny < 0 || $ny >= $h) {
                        continue;
                    }
                    for ($dx = -1; $dx <= 1; $dx++) {
                        $nx = $cx + $dx;
                        if (($dx === 0 && $dy === 0) || $nx < 0 || $nx >= $w) {
                            continue;
                        }
                        $ni = $ny * $w + $nx;
                        if (isset($labels[$ni]) || isset($boundary[$ni])) {
                            continue;
                        }
                        if ($this->colorDist($curPx, $px[$ny][$nx]) > self::MERGE_T) {
                            continue;
                        }
                        $labels[$ni] = $id;
                        $stack[] = $ni;
                        $members[] = $ni;
                    }
                }
            }
            $regions[] = ['id' => $id, 'pixels' => $members, 'w' => $w, 'h' => $h];
        }

        return $regions;
    }

    // ------------------------------------------------------------------
    // Skoring kandidat
    // ------------------------------------------------------------------

    /**
     * Hitung statistik + confidence tiap region.
     * Confidence = kombinasi Size + Color Consistency + Boundary + Shape +
     * Position (+ Similarity terhadap region referensi).
     *
     * Penolakan diberi alasan (tetap masuk daftar untuk analisis konteks):
     *  - 'background': menempel >=3 sisi canvas / membentang hampir penuh.
     *  - 'obstructed': ADA SESUATU MENGHALANGI DI TENGAH (warna berbeda
     *    menutupi zona tengah bbox) -> bukan slot foto. Isi yang berada di
     *    dalamnya juga ditolak (lihat selectFrames).
     *
     * @param array<int, array{id:int,pixels:array<int,int>,w:int,h:int}> $regions
     * @return array<int, array<string, mixed>>
     */
    private function scoreRegions(array $regions, int $w, int $h, int $canvasArea): array
    {
        $candidates = [];
        foreach ($regions as $region) {
            $stats = $this->regionStats($region, $w, $h);
            if ($stats === null) {
                continue; // terlalu kecil = detail dekorasi
            }

            $reject = null;

            // Background / bingkai penuh: menempel >= 3 sisi canvas.
            if ($stats['edgesTouched'] >= 3) {
                $reject = 'background';
            }

            $relArea = $stats['area'] / $canvasArea;
            if ($reject === null && $relArea > 0.88) {
                $reject = 'background'; // hampir seluruh canvas = background
            }

            // Region yang membentang hampir penuh canvas adalah background,
            // bukan slot foto (slot foto punya margin desain).
            if ($reject === null) {
                $fracW = $stats['bw'] / $w;
                $fracH = $stats['bh'] / $h;
                if (($fracW >= 0.96 && $fracH >= 0.9) || ($fracH >= 0.96 && $fracW >= 0.9)) {
                    $reject = 'background';
                }
            }

            // ATURAN TERHALANG TENGAH: jika zona tengah bbox tidak didominasi
            // region ini sendiri, ada objek/warna lain di tengahnya -> itu
            // struktur cincin/surround, bukan slot foto.
            if ($reject === null) {
                $coverage = $this->centerCoverage(
                    $stats['set'],
                    $stats['bx'],
                    $stats['by'],
                    $stats['bw'],
                    $stats['bh'],
                    $w,
                    $h
                );
                if ($coverage < 0.6) {
                    $reject = 'obstructed';
                }
            }

            // Ukuran relatif: indikator terkuat slot foto vs ornamen.
            $sizeScore = min(1.0, $relArea / 0.03);

            // Konsistensi warna/tekstur dalam region.
            $consistencyScore = max(0.0, min(1.0, 1.0 - $stats['std'] / 50));

            // Kejelasan boundary di keliling region.
            $boundaryScore = max(0.0, min(1.0, $stats['perimGrad'] / 45));

            // Bentuk: seberapa solid region terhadap bbox-nya (tidak wajib
            // rectangle — trapesium/asimetris tetap dapat nilai baik).
            $bboxArea = max(1, $stats['bw'] * $stats['bh']);
            $fill = $stats['area'] / $bboxArea;
            $rectScore = max(0.0, min(1.0, ($fill - 0.45) / 0.45));

            // Rasio sisi ekstrem: garis/garis tipis bukan slot foto.
            $minSide = min($stats['bw'], $stats['bh']);
            $maxSide = max($stats['bw'], $stats['bh']);
            $sideRatio = $minSide / max(1, $maxSide);
            $aspectScore = $sideRatio >= 0.18 ? 1.0 : ($sideRatio / 0.18) * 0.7;

            // Posisi: penalti lembut menempel tepi (slot biasanya interior).
            $positionScore = max(0.0, 1.0 - 0.35 * $stats['edgesTouched']);

            $confidence = 0.28 * $sizeScore
                + 0.18 * $consistencyScore
                + 0.17 * $boundaryScore
                + 0.12 * $rectScore
                + 0.13 * $positionScore
                + 0.07 * $aspectScore;

            $candidates[] = [
                'region' => $region,
                'stats' => $stats,
                'confidence' => $confidence,
                'reject' => $reject,
            ];
        }

        if (! $candidates) {
            return [];
        }

        // Reference signature: kandidat NON-tertolak terkuat jadi acuan.
        usort($candidates, fn ($a, $b) => $b['confidence'] <=> $a['confidence']);
        $ref = null;
        foreach ($candidates as $cand) {
            if ($cand['reject'] === null) {
                $ref = $cand['stats'];
                break;
            }
        }
        if ($ref === null) {
            return $candidates;
        }

        foreach ($candidates as $i => &$cand) {
            if ($cand['reject'] !== null) {
                continue; // yang ditolak tidak perlu boost
            }
            $st = $cand['stats'];
            $dColor = $this->colorDist($st['avg'], $ref['avg']);
            $simColor = max(0.0, 1.0 - $dColor / 160);
            $simVar = max(0.0, 1.0 - abs($st['std'] - $ref['std']) / 60);
            $sizeA = $st['area'];
            $sizeB = $ref['area'];
            $simSize = min($sizeA, $sizeB) / max(1, max($sizeA, $sizeB));
            $similarity = $simColor * (0.6 + 0.4 * $simVar) * (0.5 + 0.5 * $simSize);
            $cand['similarity'] = $similarity;
            $cand['confidence'] = min(0.99, $cand['confidence'] + 0.06 * $similarity);
        }
        unset($cand);

        return $candidates;
    }

    /** Citra kerja RGB (di-set detect(), dipakai saat skoring). */
    private array $workPx = [];

    /**
     * Statistik region: luas, bbox, rata-rata & simpangan warna, sisi canvas
     * yang disentuh, gradien rata-rata keliling.
     *
     * @param array{id:int,pixels:array<int,int>,w:int,h:int} $region
     * @return array<string, mixed>|null
     */
    private function regionStats(array $region, int $w, int $h): ?array
    {
        $pixels = $region['pixels'];
        $area = count($pixels);
        // Floor kandidat 3% canvas: slot foto selalu relatif besar; elemen
        // di bawah ini adalah ornamen/objek penghalang, bukan kandidat.
        if ($area < max(40, (int) round(0.03 * $w * $h))) {
            return null; // detail dekorasi, bukan kandidat
        }

        $memberSet = array_fill_keys($pixels, true);
        $sumR = $sumG = $sumB = 0;
        $sqR = $sqG = $sqB = 0;
        $minX = $w;
        $maxX = -1;
        $minY = $h;
        $maxY = -1;
        $gradSum = 0.0;
        $gradN = 0;

        foreach ($pixels as $idx) {
            $x = $idx % $w;
            $y = intdiv($idx, $w);
            [$r, $g, $b] = $this->workPx[$y][$x];
            $sumR += $r;
            $sumG += $g;
            $sumB += $b;
            $sqR += $r * $r;
            $sqG += $g * $g;
            $sqB += $b * $b;
            if ($x < $minX) {
                $minX = $x;
            }
            if ($x > $maxX) {
                $maxX = $x;
            }
            if ($y < $minY) {
                $minY = $y;
            }
            if ($y > $maxY) {
                $maxY = $y;
            }

            // Piksel keliling: punya tetangga di luar region.
            $isPerimeter = false;
            foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$ox, $oy]) {
                $nx = $x + $ox;
                $ny = $y + $oy;
                if ($nx < 0 || $ny < 0 || $nx >= $w || $ny >= $h || ! isset($memberSet[$ny * $w + $nx])) {
                    $isPerimeter = true;
                    break;
                }
            }
            if ($isPerimeter) {
                $gradSum += $this->neighborGrad($region, $x, $y, $w, $h, $memberSet);
                $gradN++;
            }
        }

        $n = (float) $area;
        $avgR = $sumR / $n;
        $avgG = $sumG / $n;
        $avgB = $sumB / $n;
        $varR = max(0.0, $sqR / $n - $avgR * $avgR);
        $varG = max(0.0, $sqG / $n - $avgG * $avgG);
        $varB = max(0.0, $sqB / $n - $avgB * $avgB);
        $std = (sqrt($varR) + sqrt($varG) + sqrt($varB)) / 3;

        $edgesTouched = 0;
        if ($minX <= 1) {
            $edgesTouched++;
        }
        if ($maxX >= $w - 2) {
            $edgesTouched++;
        }
        if ($minY <= 1) {
            $edgesTouched++;
        }
        if ($maxY >= $h - 2) {
            $edgesTouched++;
        }

        return [
            'area' => $area,
            'bx' => $minX,
            'by' => $minY,
            'bw' => $maxX - $minX + 1,
            'bh' => $maxY - $minY + 1,
            'avg' => [$avgR, $avgG, $avgB],
            'std' => $std,
            'edgesTouched' => $edgesTouched,
            'perimGrad' => $gradN > 0 ? $gradSum / $gradN : 0.0,
            'set' => $memberSet,
        ];
    }

    /**
     * Fraksi sampel grid 7x7 di ZONA TENGAH bbox (36% x 36% terpusat) yang
     * merupakan anggota region. Rendah = ada warna lain menghalangi tengah.
     */
    private function centerCoverage(array $set, int $bx, int $by, int $bw, int $bh, int $w, int $h): float
    {
        $zx0 = $bx + (int) floor($bw * 0.32);
        $zy0 = $by + (int) floor($bh * 0.32);
        $zx1 = $bx + (int) ceil($bw * 0.68);
        $zy1 = $by + (int) ceil($bh * 0.68);
        $zw = max(1, $zx1 - $zx0);
        $zh = max(1, $zy1 - $zy0);

        $hits = 0;
        $total = 0;
        for ($gy = 0; $gy < 7; $gy++) {
            for ($gx = 0; $gx < 7; $gx++) {
                $px = min($w - 1, $zx0 + (int) round(($gx / 6) * ($zw - 1)));
                $py = min($h - 1, $zy0 + (int) round(($gy / 6) * ($zh - 1)));
                $total++;
                if (isset($set[$py * $w + $px])) {
                    $hits++;
                }
            }
        }

        return $total > 0 ? $hits / $total : 0.0;
    }

    /** Gradien maksimum ke tetangga di luar region (kekuatan boundary). */
    private function neighborGrad(array $region, int $x, int $y, int $w, int $h, array $memberSet): float
    {
        $g = 0.0;
        $cur = $this->workPx[$y][$x];
        foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$ox, $oy]) {
            $nx = $x + $ox;
            $ny = $y + $oy;
            if ($nx < 0 || $ny < 0 || $nx >= $w || $ny >= $h) {
                continue;
            }
            if (isset($memberSet[$ny * $w + $nx])) {
                continue; // tetangga masih dalam region
            }
            $g = max($g, $this->channelDiff($cur, $this->workPx[$ny][$nx]));
        }

        return $g;
    }

    // ------------------------------------------------------------------
    // Seleksi frame
    // ------------------------------------------------------------------

    /**
     * Pilih kandidat confidence >= MIN_CONFIDENCE; buang region yang
     * tumpang tindih besar dengan kandidat lebih kuat (hasil split ganda).
     *
     * @param array<int, array<string, mixed>> $candidates
     * @return array<int, array<string, mixed>>
     */
    private function selectFrames(array $candidates): array
    {
        usort($candidates, fn ($a, $b) => $b['confidence'] <=> $a['confidence']);

        // Warisan penolakan: kandidat yang berada DI DALAM surround yang
        // 'obstructed' (ada penghalang di tengahnya) adalah objek penghalang
        // itu sendiri -> ikut ditolak. Surround bertipe 'background' tidak
        // mewariskan apa pun (slot foto memang hidup di atas background).
        foreach ($candidates as $a) {
            if ($a['reject'] !== 'obstructed') {
                continue;
            }
            $sa = $a['stats'];
            foreach ($candidates as $ib => $b) {
                if ($b['reject'] !== null) {
                    continue;
                }
                $sb = $b['stats'];
                if ($sa['area'] < 2 * $sb['area']) {
                    continue;
                }
                $slack = 2;
                $contains = $sb['bx'] >= $sa['bx'] - $slack
                    && $sb['by'] >= $sa['by'] - $slack
                    && $sb['bx'] + $sb['bw'] <= $sa['bx'] + $sa['bw'] + $slack
                    && $sb['by'] + $sb['bh'] <= $sa['by'] + $sa['bh'] + $slack;
                if ($contains) {
                    $candidates[$ib]['reject'] = 'obstruction-content';
                }
            }
        }

        // Buang kandidat "surround" (background/bingkai dekoratif): bbox-nya
        // memuat bbox kandidat lain yang jauh lebih kecil, dan dirinya
        // berbentuk cincin/melukit (fill rendah) atau menempel >= 2 sisi
        // canvas. Area foto sejati ada di DALAM struktur tersebut.
        $rejected = [];
        foreach ($candidates as $ia => $a) {
            if ($a['reject'] !== null) {
                $rejected[$ia] = true;
                continue;
            }
            $sa = $a['stats'];
            $fillA = $sa['area'] / max(1, $sa['bw'] * $sa['bh']);
            if ($fillA >= 0.55 && $sa['edgesTouched'] < 2) {
                continue; // solid & interior — bukan surround
            }
            foreach ($candidates as $ib => $b) {
                if ($ia === $ib || isset($rejected[$ib])) {
                    continue;
                }
                $sb = $b['stats'];
                if ($sa['area'] < 2 * $sb['area']) {
                    continue;
                }
                $slack = 2;
                $contains = $sb['bx'] >= $sa['bx'] - $slack
                    && $sb['by'] >= $sa['by'] - $slack
                    && $sb['bx'] + $sb['bw'] <= $sa['bx'] + $sa['bw'] + $slack
                    && $sb['by'] + $sb['bh'] <= $sa['by'] + $sa['bh'] + $slack;
                if ($contains) {
                    $rejected[$ia] = true;
                    break;
                }
            }
        }

        $selected = [];
        foreach ($candidates as $ci => $cand) {
            if (isset($rejected[$ci])) {
                continue;
            }
            if ($cand['confidence'] < self::MIN_CONFIDENCE) {
                continue;
            }
            $st = $cand['stats'];
            $duplicate = false;
            foreach ($selected as $sel) {
                $ss = $sel['stats'];
                $ix = max(0, min($st['bx'] + $st['bw'], $ss['bx'] + $ss['bw']) - max($st['bx'], $ss['bx']));
                $iy = max(0, min($st['by'] + $st['bh'], $ss['by'] + $ss['bh']) - max($st['by'], $ss['by']));
                $overlap = $ix * $iy;
                if ($overlap > 0.35 * max(1, min($st['area'], $ss['area']))) {
                    $duplicate = true;
                    break;
                }
            }
            if (! $duplicate) {
                $selected[] = $cand;
            }
        }

        return $selected;
    }

    // ------------------------------------------------------------------
    // Geometri: rotasi asli dipertahankan
    // ------------------------------------------------------------------

    /**
     * Fit region menjadi frame: cari orientasi dengan PROJECTION
     * CONCENTRATION — sudut di mana proyeksi piksel ke kedua sumbu lokal
     * paling terkonsentrasi adalah orientasi kotak/rect aslinya. Metode ini
     * akurat untuk SEMUA rasio termasuk persegi (image moments gagal/stabil
     * buruk untuk bentuk mendekati persegi — 40° bisa terbaca 30°).
     * Kemiringan asli DIPERTAHANKAN; tidak ada auto-straighten.
     *
     * @param array<string, mixed> $cand
     * @param array<int, int> $pixels
     * @return array{x:float,y:float,width:float,height:float,rotation:float,confidence:float}|null
     */
    private function fitRegion(array $cand, array $pixels): ?array
    {
        $w = $cand['region']['w'];
        $n = count($pixels);
        if ($n < 4) {
            return null;
        }

        // Centroid dari SELURUH piksel (tanpa sampling agar tidak bias).
        $cx = 0.0;
        $cy = 0.0;
        foreach ($pixels as $idx) {
            $cx += $idx % $w;
            $cy += intdiv($idx, $w);
        }
        $cx /= $n;
        $cy /= $n;

        // Sampel deterministik (hash multiplikatif Knuth) — menghindari bias
        // urutan BFS pada daftar piksel; urutan flood bukan urutan spasial.
        $coarsePts = $this->samplePoints($pixels, $w, 3500);
        $finePts = $this->samplePoints($pixels, $w, 9000);

        $projScore = function (array $pts, float $deg) use ($cx, $cy): float {
            $rad = deg2rad($deg);
            $cos = cos($rad);
            $sin = sin($rad);
            $cu = [];
            $cv = [];
            foreach ($pts as [$x, $y]) {
                $dx = $x - $cx;
                $dy = $y - $cy;
                $u = $dx * $cos + $dy * $sin;
                $v = -$dx * $sin + $dy * $cos;
                $iu = (int) floor($u / 2);
                $iv = (int) floor($v / 2);
                $cu[$iu] = ($cu[$iu] ?? 0) + 1;
                $cv[$iv] = ($cv[$iv] ?? 0) + 1;
            }
            $s = 0.0;
            foreach ($cu as $c) {
                $s += $c * $c;
            }
            foreach ($cv as $c) {
                $s += $c * $c;
            }

            return $s;
        };

        // Sweep kasur -46..46 (langkah 2°), lalu perbaikan halus ±2.5°
        // (langkah 0.25°). Rentang (-45,45] cukup karena rotasi rect punya
        // simetri 90°.
        $bestDeg = 0.0;
        $bestScore = -1.0;
        for ($deg = -46.0; $deg <= 46.0; $deg += 2.0) {
            $sc = $projScore($coarsePts, $deg);
            if ($sc > $bestScore) {
                $bestScore = $sc;
                $bestDeg = $deg;
            }
        }
        for ($deg = $bestDeg - 2.5; $deg <= $bestDeg + 2.5; $deg += 0.25) {
            $sc = $projScore($finePts, $deg);
            if ($sc > $bestScore) {
                $bestScore = $sc;
                $bestDeg = $deg;
            }
        }

        // Blob isotropis (lingkaran/dll): skor datar di segala sudut ->
        // ketajaman puncak rendah -> anggap tegak.
        $sideAvg = ($projScore($finePts, $bestDeg - 8) + $projScore($finePts, $bestDeg + 8)) / 2;
        if ($bestScore <= 0 || ($bestScore - $sideAvg) / $bestScore < 0.015) {
            $bestDeg = 0.0;
        }

        // Normalisasi ke (-45, 45] + snap noise kecil (bukan paksaan tegak).
        $deg = $bestDeg;
        while ($deg > 45) {
            $deg -= 90;
        }
        while ($deg <= -45) {
            $deg += 90;
        }
        if (abs($deg) < 0.8) {
            $deg = 0.0;
        }
        $rad = deg2rad($deg);
        $cos = cos($rad);
        $sin = sin($rad);

        // Extent di sepanjang sumbu final dari SELURUH piksel -> ukuran
        // frame persis sebesar bentuk yang dirender.
        $uMin = $vMin = INF;
        $uMax = $vMax = -INF;
        $vAtUMin = $vAtUMax = $uAtVMin = $uAtVMax = 0.0;
        foreach ($pixels as $idx) {
            $dx = ($idx % $w) - $cx;
            $dy = intdiv($idx, $w) - $cy;
            $u = $dx * $cos + $dy * $sin;
            $v = -$dx * $sin + $dy * $cos;
            if ($u < $uMin) {
                $uMin = $u;
                $vAtUMin = $v;
            }
            if ($u > $uMax) {
                $uMax = $u;
                $vAtUMax = $v;
            }
            if ($v < $vMin) {
                $vMin = $v;
                $uAtVMin = $u;
            }
            if ($v > $vMax) {
                $vMax = $v;
                $uAtVMax = $u;
            }
        }

        // FULL WRAP: segmentasi mengikis tepi region (blur + ambang gradien +
        // dilasi boundary ~2-3px kerja per sisi) sehingga frame lebih kecil
        // dari slot aslinya. Dari tiap titik ekstrem, jalan KELUAR selama
        // warna masih menyambung — pita anti-alias dilewati, dan berhenti
        // tepat saat menemui warna datar yang berbeda (boundary nyata).
        // Aturan: senada warna & tak dibatasi beda warna = ikut ter-wrap.
        $uMin -= $this->reclaimWalk(
            $cx + $uMin * $cos - $vAtUMin * $sin,
            $cy + $uMin * $sin + $vAtUMin * $cos,
            -$cos,
            -$sin
        );
        $uMax += $this->reclaimWalk(
            $cx + $uMax * $cos - $vAtUMax * $sin,
            $cy + $uMax * $sin + $vAtUMax * $cos,
            $cos,
            $sin
        );
        $vMin -= $this->reclaimWalk(
            $cx + $uAtVMin * $cos - $vMin * $sin,
            $cy + $uAtVMin * $sin + $vMin * $cos,
            $sin,
            -$cos
        );
        $vMax += $this->reclaimWalk(
            $cx + $uAtVMax * $cos - $vMax * $sin,
            $cy + $uAtVMax * $sin + $vMax * $cos,
            -$sin,
            $cos
        );

        $fw = max(1.0, $uMax - $uMin);
        $fh = max(1.0, $vMax - $vMin);
        $uMid = ($uMin + $uMax) / 2;
        $vMid = ($vMin + $vMax) / 2;
        $fx = $cx + $uMid * $cos - $vMid * $sin;
        $fy = $cy + $uMid * $sin + $vMid * $cos;

        return [
            'x' => $fx - $fw / 2,
            'y' => $fy - $fh / 2,
            'width' => $fw,
            'height' => $fh,
            'rotation' => round($deg, 1),
            'confidence' => round($cand['confidence'] * 100, 1),
        ];
    }

    /**
     * Sampel titik deterministik dari daftar piksel (maks $cap titik).
     * Acak seragam ber-seed tetap — tidak bias terhadap urutan array yang
     * tersusun BFS (spatially coherent), berbeda dari stride biasa.
     *
     * @param array<int, int> $pixels
     * @return array<int, array{0:float,1:float}>
     */
    private function samplePoints(array $pixels, int $w, int $cap): array
    {
        $n = count($pixels);
        $out = [];
        if ($n <= $cap) {
            foreach ($pixels as $idx) {
                $out[] = [(float) ($idx % $w), (float) intdiv($idx, $w)];
            }

            return $out;
        }
        mt_srand(0x504F544F); // seed tetap -> hasil deterministik
        for ($i = 0; $i < $cap; $i++) {
            $idx = $pixels[mt_rand(0, $n - 1)];
            $out[] = [(float) ($idx % $w), (float) intdiv($idx, $w)];
        }

        return $out;
    }

    /**
     * Jalan keluar dari titik tepi region ke arah (dx, dy): selama warna
     * masih menyambung dengan warna awal tepi, terus maju — pita transisi
     * anti-alias dilewati. Berhenti saat menemui warna DATAR yang berbeda
     * (dua sampel berjarak 1px saling mirip tapi jauh dari warna awal) =
     * boundary nyata milik elemen lain. Return jarak yang aman ditambahkan
     * ke extent (px kerja).
     */
    private function reclaimWalk(float $sx, float $sy, float $dx, float $dy): float
    {
        $start = $this->sampleWorkColor($sx, $sy);
        if ($start === null) {
            return 0.0;
        }
        $lastGood = 0.0;
        for ($t = self::RECLAIM_STEP; $t <= self::RECLAIM_MAX; $t += self::RECLAIM_STEP) {
            $c = $this->sampleWorkColor($sx + $dx * $t, $sy + $dy * $t);
            if ($c === null) {
                break;
            }
            $next = $this->sampleWorkColor($sx + $dx * ($t + 1.0), $sy + $dy * ($t + 1.0));
            $flatOther = $this->colorDist($c, $start) > self::RECLAIM_STOP_T
                && ($next === null || $this->colorDist($c, $next) <= self::RECLAIM_FLAT_T);
            if ($flatOther) {
                break;
            }
            $lastGood = $t;
        }

        return $lastGood;
    }

    /** Warna piksel kerja di koordinat fraksional (nearest), null di luar. */
    private function sampleWorkColor(float $x, float $y): ?array
    {
        $ix = (int) round($x);
        $iy = (int) round($y);
        if ($iy < 0 || $iy >= count($this->workPx)) {
            return null;
        }
        if ($ix < 0 || $ix >= count($this->workPx[$iy])) {
            return null;
        }

        return $this->workPx[$iy][$ix];
    }

    /**
     * Urutkan slot per band vertikal (y), lalu kolom (x) dalam band —
     * urutan baca alami untuk layout photobooth.
     *
     * @param array<int, array{x:float,y:float,width:float,height:float,rotation:float,confidence:float}> $slots
     * @return array<int, array{x:float,y:float,width:float,height:float,rotation:float,confidence:float}>
     */
    private function sortSlots(array $slots): array
    {
        $heights = array_map(fn ($s) => $s['height'], $slots);
        sort($heights);
        $medianH = $heights[intdiv(count($heights), 2)];
        $bandTol = max(8.0, $medianH * 0.5);

        usort($slots, function ($a, $b) use ($bandTol) {
            $bandA = (int) round($a['y'] / $bandTol);
            $bandB = (int) round($b['y'] / $bandTol);
            if ($bandA !== $bandB) {
                return $bandA <=> $bandB;
            }

            return $a['x'] <=> $b['x'];
        });

        return $slots;
    }

    /**
     * Bangun hasil akhir: skala koordinat ke resolusi canvas + beri order.
     *
     * @param array<int, array{x:float,y:float,width:float,height:float,rotation:float,confidence:float}> $slots
     * @return array{detection_method: string, frame_count: int, frame_configuration: array}
     */
    private function buildResult(array $slots, int $origW, int $origH, int $width, int $height, string $detectionMethod = 'smart_clear'): array
    {
        $scaleX = $origW / $width;
        $scaleY = $origH / $height;

        $configuration = [];
        foreach (array_values($slots) as $index => $slot) {
            $x = max(0.0, $slot['x'] * $scaleX);
            $y = max(0.0, $slot['y'] * $scaleY);
            $w = $slot['width'] * $scaleX;
            $h = $slot['height'] * $scaleY;

            // Clamp ke batas canvas
            if ($x + $w > $origW) {
                $w = max(1.0, $origW - $x);
            }
            if ($y + $h > $origH) {
                $h = max(1.0, $origH - $y);
            }

            $configuration[] = [
                'id' => $index + 1,
                'x' => (int) round($x),
                'y' => (int) round($y),
                'width' => (int) round($w),
                'height' => (int) round($h),
                'rotation' => (float) ($slot['rotation'] ?? 0.0),
                'confidence' => (float) ($slot['confidence'] ?? 0.0),
                'source' => $slot['source'] ?? $detectionMethod,
                'order' => $index,
            ];
        }

        return [
            'detection_method' => $detectionMethod,
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
        if ($type === IMAGETYPE_JPEG && function_exists('imagecreatefromjpeg')) {
            return @imagecreatefromjpeg($path);
        }
        if ($type === IMAGETYPE_PNG && function_exists('imagecreatefrompng')) {
            return @imagecreatefrompng($path);
        }
        if ($type === IMAGETYPE_WEBP && function_exists('imagecreatefromwebp')) {
            return @imagecreatefromwebp($path);
        }
        return false;
    }
}
