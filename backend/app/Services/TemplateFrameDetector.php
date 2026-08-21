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
                $slots[] = $slot;
            }
        }
        if (! $slots) {
            return null;
        }

        $slots = $this->sortSlots($slots);

        // Koordinat diskalakan ke ruang canvas (PhotoRenderService meregangkan
        // gambar template ke ukuran canvas).
        $targetW = $canvasWidth ?? $info[0];
        $targetH = $canvasHeight ?? $info[1];

        return $this->buildResult($slots, $targetW, $targetH, $width, $height);
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
     * Position (+ Similarity terhadap region referensi). Region yang
     * menempel >=3 sisi canvas dianggap background/bingkai dekoratif dan
     * langsung ditolak.
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
                continue;
            }

            // Background / bingkai penuh: menempel >= 3 sisi canvas.
            if ($stats['edgesTouched'] >= 3) {
                continue;
            }

            $relArea = $stats['area'] / $canvasArea;
            if ($relArea > 0.88) {
                continue; // hampir seluruh canvas = background
            }

            // Region yang membentang hampir penuh canvas adalah background,
            // bukan slot foto (slot foto punya margin desain).
            $fracW = $stats['bw'] / $w;
            $fracH = $stats['bh'] / $h;
            if (($fracW >= 0.96 && $fracH >= 0.9) || ($fracH >= 0.96 && $fracW >= 0.9)) {
                continue;
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
            ];
        }

        if (! $candidates) {
            return [];
        }

        // Reference signature: kandidat terkuat menjadi acuan kemiripan.
        usort($candidates, fn ($a, $b) => $b['confidence'] <=> $a['confidence']);
        $ref = $candidates[0]['stats'];

        foreach ($candidates as $i => &$cand) {
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
        if ($area < max(40, (int) round(0.0015 * $w * $h))) {
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
        ];
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

        // Buang kandidat "surround" (background/bingkai dekoratif): bbox-nya
        // memuat bbox kandidat lain yang jauh lebih kecil, dan dirinya
        // berbentuk cincin/melukit (fill rendah) atau menempel >= 2 sisi
        // canvas. Area foto sejati ada di DALAM struktur tersebut.
        $rejected = [];
        foreach ($candidates as $ia => $a) {
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
     * Fit region menjadi frame: pusat + extent di sepanjang sumbu utama
     * (PCA via image moments). Kemiringan asli DIPERTAHANKAN — tidak ada
     * auto-straighten. Rotasi dinormalisasi ke (-45, 45] dan di-snap ke 0
     * bila |θ| < 1.5° (sekadar meredam noise, bukan memaksa tegak).
     *
     * @param array<string, mixed> $cand
     * @param array<int, int> $pixels
     * @return array{x:float,y:float,width:float,height:float,rotation:float,confidence:float}|null
     */
    private function fitRegion(array $cand, array $pixels): ?array
    {
        $w = $cand['region']['w'];
        $h = $cand['region']['h'];
        $n = count($pixels);
        if ($n < 4) {
            return null;
        }

        $step = max(1, (int) floor(sqrt($n / 20000)));
        $m20 = $m02 = $m11 = 0.0;
        $cx = 0.0;
        $cy = 0.0;
        $cnt = 0;
        $sampled = [];
        for ($i = 0; $i < $n; $i += $step) {
            $idx = $pixels[$i];
            $x = $idx % $w;
            $y = intdiv($idx, $w);
            $sampled[] = [$x, $y];
            $cx += $x;
            $cy += $y;
            $cnt++;
        }
        if ($cnt < 4) {
            return null;
        }
        $cx /= $cnt;
        $cy /= $cnt;

        foreach ($sampled as [$x, $y]) {
            $dx = $x - $cx;
            $dy = $y - $cy;
            $m20 += $dx * $dx;
            $m02 += $dy * $dy;
            $m11 += $dx * $dy;
        }
        $m20 /= $cnt;
        $m02 /= $cnt;
        $m11 /= $cnt;

        // Anisotropi rendah (blob mendekati bulat/persegi) -> anggap tegak.
        $trace = $m20 + $m02;
        $anisotropy = sqrt(max(0.0, ($m20 - $m02) * ($m20 - $m02) + 4 * $m11 * $m11));
        if ($trace <= 0 || $anisotropy < 0.15 * $trace) {
            $theta = 0.0;
        } else {
            $theta = 0.5 * atan2(2 * $m11, $m20 - $m02);
        }

        // Normalisasi ke (-45, 45]: arah sumbu-x frame, bukan paksaan simetri.
        $deg = rad2deg($theta);
        while ($deg > 45) {
            $deg -= 90;
        }
        while ($deg <= -45) {
            $deg += 90;
        }
        if (abs($deg) < 1.5) {
            $deg = 0.0;
        }
        $rad = deg2rad($deg);
        $cos = cos($rad);
        $sin = sin($rad);

        // Proyeksi piksel ke sumbu utama -> width/height sesuai bentuk asli.
        $uMin = $vMin = INF;
        $uMax = $vMax = -INF;
        foreach ($sampled as [$x, $y]) {
            $dx = $x - $cx;
            $dy = $y - $cy;
            $u = $dx * $cos + $dy * $sin;
            $v = -$dx * $sin + $dy * $cos;
            if ($u < $uMin) {
                $uMin = $u;
            }
            if ($u > $uMax) {
                $uMax = $u;
            }
            if ($v < $vMin) {
                $vMin = $v;
            }
            if ($v > $vMax) {
                $vMax = $v;
            }
        }

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
     * @return array{frame_count: int, frame_configuration: array}
     */
    private function buildResult(array $slots, int $origW, int $origH, int $width, int $height): array
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
                'x' => (int) round($x),
                'y' => (int) round($y),
                'width' => (int) round($w),
                'height' => (int) round($h),
                'rotation' => (float) $slot['rotation'],
                'confidence' => (float) $slot['confidence'],
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
