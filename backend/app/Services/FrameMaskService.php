<?php

namespace App\Services;

/**
 * Mesin mask kamera per-frame berbasis konfigurasi MANUAL dari user (Frame Editor).
 *
 * Prinsip:
 * - Frame buatan user adalah sumber kebenaran. TIDAK ADA deteksi warna putih,
 *   transparansi, border, atau tebakan otomatis lainnya.
 * - Hard Clear Zone (tengah frame, default 50%) = seed yang WAJIB di-clear.
 *   Elemen desain apa pun di dalamnya dianggap bagian area kamera.
 * - Clear meluas ke Connected Region: area di sekitar seed yang masih kontinu
 *   (serupa warna rata-rata seed) ikut di-clear, dibatasi Clear Expansion,
 *   Region Sensitivity, dan Edge Protection.
 * - Elemen desain di perifer (di luar Hard Clear Zone) DIPERTAHANKAN — kamera
 *   yang berada di bawahnya yang di-mask.
 * - Manual Protect Area menahan clear; Manual Remove Area memaksa clear.
 */
class FrameMaskService
{
    /** Resolusi kerja maksimal (sisi terpanjang grid analisis). */
    public const WORK_MAX = 480;

    /**
     * Normalisasi satu frame dari input API/user menjadi struktur lengkap ber-default.
     * Setiap frame sepenuhnya independen.
     */
    public function normalizeFrame(array $frame): array
    {
        $areas = function ($v): array {
            if (! is_array($v)) {
                return [];
            }
            $out = [];
            foreach ($v as $a) {
                if (! is_array($a)) {
                    continue;
                }
                $w = (float) ($a['w'] ?? $a['width'] ?? 0);
                $h = (float) ($a['h'] ?? $a['height'] ?? 0);
                if ($w <= 0 || $h <= 0) {
                    continue;
                }
                $out[] = [
                    'x' => (float) ($a['x'] ?? 0),
                    'y' => (float) ($a['y'] ?? 0),
                    'w' => $w,
                    'h' => $h,
                ];
            }
            return $out;
        };

        return [
            'id' => (int) ($frame['id'] ?? 0),
            'order' => (int) ($frame['order'] ?? 0),
            'x' => (float) ($frame['x'] ?? 0),
            'y' => (float) ($frame['y'] ?? 0),
            'width' => max(1.0, (float) ($frame['width'] ?? 1)),
            'height' => max(1.0, (float) ($frame['height'] ?? 1)),
            'rotation' => (float) ($frame['rotation'] ?? 0),
            'flip_h' => (bool) ($frame['flip_h'] ?? false),
            'flip_v' => (bool) ($frame['flip_v'] ?? false),
            'clear_zone' => min(100.0, max(5.0, (float) ($frame['clear_zone'] ?? 60))),
            'clear_expansion' => min(200.0, max(0.0, (float) ($frame['clear_expansion'] ?? 25))),
            'region_sensitivity' => min(100.0, max(0.0, (float) ($frame['region_sensitivity'] ?? 50))),
            'min_region_size' => min(50.0, max(0.0, (float) ($frame['min_region_size'] ?? 1))),
            'edge_protection' => min(100.0, max(0.0, (float) ($frame['edge_protection'] ?? 60))),
            'feather' => min(20.0, max(0.0, (float) ($frame['feather'] ?? 2))),
            'protected_areas' => $areas($frame['protected_areas'] ?? null),
            'remove_areas' => $areas($frame['remove_areas'] ?? null),
        ];
    }

    /**
     * Bangun mask lubang kamera untuk satu frame.
     *
     * @param  \GdImage $templateImg gambar template resolusi asli
     * @param  array    $frame       konfigurasi frame (koordinat canvas)
     * @param  int      $canvasW     lebar canvas template
     * @param  int      $canvasH     tinggi canvas template
     * @return array{image: \GdImage, bbox: int[]}|null alpha GD per piksel bbox:
     *         127 = lubang (area kamera terlihat), 0 = desain dipertahankan.
     */
    public function buildMask($templateImg, array $frame, int $canvasW, int $canvasH): ?array
    {
        $f = $this->normalizeFrame($frame);

        $scale = min(1.0, self::WORK_MAX / max($canvasW, $canvasH));
        $gw = max(1, (int) round($canvasW * $scale));
        $gh = max(1, (int) round($canvasH * $scale));

        // Salinan template pada resolusi kerja untuk sampling warna
        $work = imagecreatetruecolor($gw, $gh);
        imagecopyresampled($work, $templateImg, 0, 0, 0, 0, $gw, $gh, imagesx($templateImg), imagesy($templateImg));

        // Geometri frame pada ruang kerja
        $fx = $f['x'] * $scale;
        $fy = $f['y'] * $scale;
        $fw = max(2.0, $f['width'] * $scale);
        $fh = max(2.0, $f['height'] * $scale);
        $rot = deg2rad($f['rotation']);
        $cos = cos($rot);
        $sin = sin($rot);
        $cx = $fx + $fw / 2;
        $cy = $fy + $fh / 2;
        $hw = $fw / 2;
        $hh = $fh / 2;

        // Hard Clear Zone (ukuran setengah pada ruang lokal frame)
        $hzW = $fw * $f['clear_zone'] / 200;
        $hzH = $fh * $f['clear_zone'] / 200;
        $dHard = sqrt($hzW * $hzW + $hzH * $hzH);
        $expPx = $f['clear_expansion'] / 100 * min($fw, $fh);
        $dMax = $dHard + $expPx;

        // Sangat peka warna: perubahan warna sekecil apa pun dipertahankan.
        // Default sens 50 -> tol 10. Harus identik dengan frontend.
        $tol = 1 + $f['region_sensitivity'] * 0.18;
        $ep = $f['edge_protection'] / 100;

        // Area manual disimpan dalam koordinat lokal frame dari sudut kiri-atas.
        // Konversi ke basis pusat agar konsisten dengan klasifikasi grid, dan
        // karena area adalah KONTEN frame, posisinya ikut dicerminkan flip.
        $fxs = $f['flip_h'] ? -1 : 1;
        $fys = $f['flip_v'] ? -1 : 1;
        $protLocal = [];
        foreach ($f['protected_areas'] as $a) {
            $protLocal[] = [$a['x'] * $scale - $hw, $a['y'] * $scale - $hh, $a['w'] * $scale, $a['h'] * $scale];
        }
        $remLocal = [];
        foreach ($f['remove_areas'] as $a) {
            $remLocal[] = [$a['x'] * $scale - $hw, $a['y'] * $scale - $hh, $a['w'] * $scale, $a['h'] * $scale];
        }

        // Bounding box axis-aligned dari frame yang dirotasi (clamp ke canvas)
        $xs = [];
        $ys = [];
        foreach ([[-$hw, -$hh], [$hw, -$hh], [$hw, $hh], [-$hw, $hh]] as [$lx, $ly]) {
            $xs[] = $cx + $lx * $cos - $ly * $sin;
            $ys[] = $cy + $lx * $sin + $ly * $cos;
        }
        $bx0 = max(0, (int) floor(min($xs)) - 1);
        $by0 = max(0, (int) floor(min($ys)) - 1);
        $bx1 = min($gw - 1, (int) ceil(max($xs)) + 1);
        $by1 = min($gh - 1, (int) ceil(max($ys)) + 1);
        $bw = $bx1 - $bx0 + 1;
        $bh = $by1 - $by0 + 1;
        if ($bw <= 0 || $bh <= 0) {
            imagedestroy($work);
            return null;
        }

        // Klasifikasi sel grid: inside frame / seed hard zone / protect / remove
        $inside = [];
        $seed = [];
        $prot = [];
        $rem = [];
        for ($gy = $by0; $gy <= $by1; $gy++) {
            for ($gx = $bx0; $gx <= $bx1; $gx++) {
                $dx = ($gx + 0.5) - $cx;
                $dy = ($gy + 0.5) - $cy;
                $lx = $dx * $cos + $dy * $sin;
                $ly = -$dx * $sin + $dy * $cos;
                if (abs($lx) > $hw || abs($ly) > $hh) {
                    continue;
                }
                $idx = ($gy - $by0) * $bw + ($gx - $bx0);
                $inside[$idx] = 1;
                if (abs($lx) <= $hzW && abs($ly) <= $hzH) {
                    $seed[$idx] = 1;
                }
                // Area manual = konten frame: uji pada koordinat lokal yang
                // sudah dicerminkan sesuai flip (sejalan dengan pasteRotatedCover)
                $alx = $lx * $fxs;
                $aly = $ly * $fys;
                foreach ($protLocal as [$ax, $ay, $aw, $ah]) {
                    if ($alx >= $ax && $alx <= $ax + $aw && $aly >= $ay && $aly <= $ay + $ah) {
                        $prot[$idx] = 1;
                        break;
                    }
                }
                foreach ($remLocal as [$ax, $ay, $aw, $ah]) {
                    if ($alx >= $ax && $alx <= $ax + $aw && $aly >= $ay && $aly <= $ay + $ah) {
                        $rem[$idx] = 1;
                        break;
                    }
                }
            }
        }

        if (count($seed) === 0) {
            imagedestroy($work);
            return null;
        }

        // Warna rata-rata seed = referensi kontinuitas connected region
        $rs = $gs = $bs = 0;
        $n = count($seed);
        foreach ($seed as $idx => $_) {
            $c = imagecolorat($work, $bx0 + ($idx % $bw), $by0 + intdiv($idx, $bw));
            $rs += ($c >> 16) & 0xFF;
            $gs += ($c >> 8) & 0xFF;
            $bs += $c & 0xFF;
        }
        $avgR = (int) round($rs / $n);
        $avgG = (int) round($gs / $n);
        $avgB = (int) round($bs / $n);

        // Tiga strategi clear:
        // 1. Full Clear (clear_zone >= 100): bolong seluruh frame tanpa syarat.
        // 2. MODE ISI PENUH: bila mayoritas area frame satu warna (rasio
        //    piksel mirip warna seed >= 55%), bolong seluruh frame sekaligus
        //    tanpa syarat konektivitas - noise/gradasi halus tidak memecah
        //    lubang - kecuali piksel yang benar-benar beda warna (elemen)
        //    dan area protect.
        // 3. FRAME RAMAI: hard zone ternoda warna + BFS flood fill ketat.
        $fullClear = $f['clear_zone'] >= 100;
        $tolHard = max($tol * 2, 12);
        $tolFill = max($tol * 4, 28);
        $fillRatio = 0.55;

        $diffs = [];
        $insideCount = 0;
        $sameCount = 0;
        foreach ($inside as $idx => $_) {
            $c = imagecolorat($work, $bx0 + ($idx % $bw), $by0 + intdiv($idx, $bw));
            $diffs[$idx] = max(
                abs((($c >> 16) & 0xFF) - $avgR),
                abs((($c >> 8) & 0xFF) - $avgG),
                abs(($c & 0xFF) - $avgB)
            );
            $insideCount++;
            if ($diffs[$idx] <= $tolFill) {
                $sameCount++;
            }
        }

        $cleared = [];
        $queue = [];
        $fillMode = false;

        if ($fullClear) {
            foreach (array_keys($inside) as $idx) {
                $cleared[$idx] = 1;
            }
        } elseif ($insideCount > 0 && $sameCount / $insideCount >= $fillRatio) {
            $fillMode = true;
            foreach ($diffs as $idx => $diff) {
                if ($diff <= $tolFill && ! isset($prot[$idx])) {
                    $cleared[$idx] = 1;
                }
            }
        } else {
            foreach (array_keys($seed) as $idx) {
                if (isset($prot[$idx])) {
                    continue; // Protect menang meski di dalam hard zone
                }
                if ($diffs[$idx] <= $tolHard) {
                    $cleared[$idx] = 1;
                    $queue[] = $idx;
                }
            }
        }
        if (! $fillMode) {
            for ($qi = 0; $qi < count($queue); $qi++) {
            $idx = $queue[$qi];
            $gx = $bx0 + ($idx % $bw);
            $gy = $by0 + intdiv($idx, $bw);
            foreach ([[-1, 0], [1, 0], [0, -1], [0, 1]] as [$ox, $oy]) {
                $nx = $gx + $ox;
                $ny = $gy + $oy;
                if ($nx < $bx0 || $ny < $by0 || $nx > $bx1 || $ny > $by1) {
                    continue;
                }
                $nidx = ($ny - $by0) * $bw + ($nx - $bx0);
                if (isset($cleared[$nidx]) || ! isset($inside[$nidx])) {
                    continue;
                }
                if (isset($prot[$nidx])) {
                    continue; // Protect Area menahan automatic clearing
                }
                $ndx = ($nx + 0.5) - $cx;
                $ndy = ($ny + 0.5) - $cy;
                $dist = sqrt($ndx * $ndx + $ndy * $ndy);
                if ($dist > $dMax) {
                    continue; // Clear Expansion habis
                }
                // Edge Protection: makin jauh dari pusat, toleransi makin ketat
                $r = $dMax > $dHard ? ($dist - $dHard) / ($dMax - $dHard) : 0.0;
                $effTol = $tol * (1 - 0.85 * $ep * $r);
                $c = imagecolorat($work, $nx, $ny);
                $diff = max(
                    abs((($c >> 16) & 0xFF) - $avgR),
                    abs((($c >> 8) & 0xFF) - $avgG),
                    abs(($c & 0xFF) - $avgB)
                );
                if ($diff > $effTol) {
                    continue; // elemen desain di perifer — pertahankan
                }
                $cleared[$nidx] = 1;
                $queue[] = $nidx;
            }
            }
        }

        // PEMBERSIHAN TEPI (anti-fringe): serap pita transisi anti-alias di
        // batas antara area clear dan warna kuat di seberangnya, sehingga
        // tidak ada sisa tipis warna slot yang menempel di pinggiran elemen.
        // Kandidat = piksel ber-diff MENENGAH (di atas ambang clear, di bawah
        // STRONG) yang bersinggungan dengan area clear dan berbatasan langsung
        // dengan warna kuat dua langkah lebih jauh. Inti warna kuat (hitam
        // pekal dsb.) tidak disentuh. Harus identik dengan frameMask.ts.
        $strong = 150;
        for ($pass = 0; $pass < 2; $pass++) {
            $snap = $cleared;
            foreach ($inside as $idx => $_) {
                if (isset($snap[$idx]) || isset($prot[$idx])) {
                    continue;
                }
                $dP = $diffs[$idx];
                if ($dP <= $tolFill || $dP >= $strong) {
                    continue; // bukan pita transisi
                }
                $gx = $bx0 + ($idx % $bw);
                $gy = $by0 + intdiv($idx, $bw);
                foreach ([[-1, 0], [1, 0], [0, -1], [0, 1]] as [$ox, $oy]) {
                    $nx = $gx + $ox;
                    $ny = $gy + $oy;
                    if ($nx < $bx0 || $ny < $by0 || $nx > $bx1 || $ny > $by1) {
                        continue;
                    }
                    $nidx = ($ny - $by0) * $bw + ($nx - $bx0);
                    if (! isset($snap[$nidx])) {
                        continue; // harus bersinggungan dengan area clear
                    }
                    $qx = 2 * $gx - $nx;
                    $qy = 2 * $gy - $ny;
                    if ($qx < $bx0 || $qy < $by0 || $qx > $bx1 || $qy > $by1) {
                        continue;
                    }
                    $qidx = ($qy - $by0) * $bw + ($qx - $bx0);
                    if (! isset($inside[$qidx]) || $diffs[$qidx] < $strong) {
                        continue;
                    }
                    $cleared[$idx] = 1; // pita transisi -> ikut clear sampai warna kuat
                    break;
                }
            }
        }

        // Manual Remove Area: paksa clear (Protect Area tetap menang bila bentrok)
        foreach ($rem as $idx => $_) {
            if (! isset($prot[$idx]) && isset($inside[$idx])) {
                $cleared[$idx] = 1;
            }
        }

        // Minimum Region Size: buang pulau clear kecil yang tidak memuat seed
        // (tidak relevan di mode isi penuh - lubang memang satu keseluruhan)
        $minArea = $f['min_region_size'] / 100 * $fw * $fh;
        if (! $fillMode && $minArea > 1) {
            $this->dropSmallIslands($cleared, $seed, $bw, $bx0, $by0, $bx1, $by1, $minArea);
        }

        // Feather: box blur peta hole agar tepi compositing halus
        $holeGrid = [];
        foreach ($cleared as $idx => $_) {
            $holeGrid[$idx] = 1.0;
        }
        $fr = (int) round($f['feather'] * $scale);
        if ($fr > 0) {
            $holeGrid = $this->boxBlur($holeGrid, $bw, $bh, $fr);
        }

        // GD mask kecil (alpha = jumlah lubang) lalu upscale ke resolusi canvas
        $small = imagecreatetruecolor($bw, $bh);
        imagealphablending($small, false);
        imagesavealpha($small, true);
        for ($gy = 0; $gy < $bh; $gy++) {
            for ($gx = 0; $gx < $bw; $gx++) {
                $hole = min(1.0, max(0.0, $holeGrid[$gy * $bw + $gx] ?? 0.0));
                imagesetpixel($small, $gx, $gy, imagecolorallocatealpha($small, 0, 0, 0, (int) round(127 * $hole)));
            }
        }
        imagedestroy($work);

        $inv = 1.0 / $scale;
        $bigW = max(1, (int) ceil($bw * $inv));
        $bigH = max(1, (int) ceil($bh * $inv));
        $big = imagecreatetruecolor($bigW, $bigH);
        imagealphablending($big, false);
        imagesavealpha($big, true);
        imagecopyresampled($big, $small, 0, 0, 0, 0, $bigW, $bigH, $bw, $bh);
        imagedestroy($small);

        return [
            'image' => $big,
            'bbox' => [(int) floor($bx0 * $inv), (int) floor($by0 * $inv), $bigW, $bigH],
        ];
    }

    /**
     * Hapus komponen clear kecil (di bawah Minimum Region Size) yang tidak
     * memuat sel seed Hard Clear Zone.
     */
    private function dropSmallIslands(
        array &$cleared,
        array $seed,
        int $bw,
        int $bx0,
        int $by0,
        int $bx1,
        int $by1,
        float $minArea
    ): void {
        $comp = [];
        foreach (array_keys($cleared) as $start) {
            if (isset($comp[$start])) {
                continue;
            }
            $members = [$start];
            $comp[$start] = 1;
            for ($mi = 0; $mi < count($members); $mi++) {
                $idx = $members[$mi];
                $gx = $bx0 + ($idx % $bw);
                $gy = $by0 + intdiv($idx, $bw);
                foreach ([[-1, 0], [1, 0], [0, -1], [0, 1]] as [$ox, $oy]) {
                    $nx = $gx + $ox;
                    $ny = $gy + $oy;
                    if ($nx < $bx0 || $ny < $by0 || $nx > $bx1 || $ny > $by1) {
                        continue;
                    }
                    $nidx = ($ny - $by0) * $bw + ($nx - $bx0);
                    if (isset($cleared[$nidx]) && ! isset($comp[$nidx])) {
                        $comp[$nidx] = 1;
                        $members[] = $nidx;
                    }
                }
            }
            if (count($members) >= $minArea) {
                continue;
            }
            $hasSeed = false;
            foreach ($members as $midx) {
                if (isset($seed[$midx])) {
                    $hasSeed = true;
                    break;
                }
            }
            if (! $hasSeed) {
                foreach ($members as $midx) {
                    unset($cleared[$midx]);
                }
            }
        }
    }

    /**
     * Box blur separable dua-pass (sliding window) untuk peta hole.
     */
    private function boxBlur(array $grid, int $w, int $h, int $r): array
    {
        $div = 2 * $r + 1;

        $tmp = [];
        for ($y = 0; $y < $h; $y++) {
            $base = $y * $w;
            $sum = 0.0;
            for ($k = -$r; $k <= $r; $k++) {
                $sum += $grid[$base + min($w - 1, max(0, $k))] ?? 0.0;
            }
            for ($x = 0; $x < $w; $x++) {
                $v = $sum / $div;
                if ($v > 0) {
                    $tmp[$base + $x] = $v;
                }
                $sum += ($grid[$base + min($w - 1, $x + $r + 1)] ?? 0.0)
                    - ($grid[$base + max(0, $x - $r)] ?? 0.0);
            }
        }

        $out = [];
        for ($x = 0; $x < $w; $x++) {
            $sum = 0.0;
            for ($k = -$r; $k <= $r; $k++) {
                $sum += $tmp[min($h - 1, max(0, $k)) * $w + $x] ?? 0.0;
            }
            for ($y = 0; $y < $h; $y++) {
                $v = $sum / $div;
                if ($v > 0) {
                    $out[$y * $w + $x] = $v;
                }
                $sum += ($tmp[min($h - 1, $y + $r + 1) * $w + $x] ?? 0.0)
                    - ($tmp[max(0, $y - $r) * $w + $x] ?? 0.0);
            }
        }
        return $out;
    }
}
