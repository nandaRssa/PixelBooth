<?php

namespace App\Services;

/**
 * Smart Color Service — utilitas warna perceptual untuk Smart Remove v2.
 *
 * Menyediakan:
 *  - Konversi sRGB → CIELAB (melalui XYZ D65)
 *  - Jarak warna perceptual deltaE76 (CIELAB Euclidean)
 *  - Estimasi standar deviasi LAB pada seed zone
 *  - Kernel Gaussian 1D (untuk Gaussian Feather)
 *  - Magnitude gradient Sobel per piksel (untuk Guided Edge Refinement)
 */
class SmartColorService
{
    // =====================================================================
    // CIELAB CONVERSION
    // =====================================================================

    /**
     * Konversi sRGB (0–255) ke CIELAB D65.
     *
     * @param  int $r 0–255
     * @param  int $g 0–255
     * @param  int $b 0–255
     * @return array{0: float, 1: float, 2: float} [L*, a*, b*]
     */
    public static function rgbToLab(int $r, int $g, int $b): array
    {
        // sRGB → Linear (gamma-koreksi IEC 61966-2-1)
        $rl = self::srgbToLinear($r / 255.0);
        $gl = self::srgbToLinear($g / 255.0);
        $bl = self::srgbToLinear($b / 255.0);

        // Linear sRGB → XYZ D65 (matrix Bradford)
        $X = $rl * 0.4124564 + $gl * 0.3575761 + $bl * 0.1804375;
        $Y = $rl * 0.2126729 + $gl * 0.7151522 + $bl * 0.0721750;
        $Z = $rl * 0.0193339 + $gl * 0.1191920 + $bl * 0.9503041;

        // XYZ → LAB (D65 illuminant: Xn=0.95047, Yn=1.00000, Zn=1.08883)
        $fx = self::labF($X / 0.95047);
        $fy = self::labF($Y / 1.00000);
        $fz = self::labF($Z / 1.08883);

        $L = 116.0 * $fy - 16.0;
        $a = 500.0 * ($fx - $fy);
        $bStar = 200.0 * ($fy - $fz);

        return [$L, $a, $bStar];
    }

    /**
     * Jarak warna perceptual CIE76 (Euclidean dalam ruang CIELAB).
     *
     * @param  array{0: float, 1: float, 2: float} $lab1
     * @param  array{0: float, 1: float, 2: float} $lab2
     * @return float deltaE (0 = identik, ~5 = hampir sama, >20 = sangat beda)
     */
    public static function deltaE76(array $lab1, array $lab2): float
    {
        $dL = $lab1[0] - $lab2[0];
        $da = $lab1[1] - $lab2[1];
        $db = $lab1[2] - $lab2[2];
        return sqrt($dL * $dL + $da * $da + $db * $db);
    }

    // =====================================================================
    // SEED STATISTICS
    // =====================================================================

    /**
     * Hitung mean + standar deviasi LAB dari sekumpulan piksel seed.
     *
     * @param  array<int, array{0: float, 1: float, 2: float}> $labs array of [L, a, b]
     * @return array{mean: array{0: float, 1: float, 2: float}, stddev: float}
     */
    public static function seedStats(array $labs): array
    {
        $n = count($labs);
        if ($n === 0) {
            return ['mean' => [0.0, 0.0, 0.0], 'stddev' => 5.0];
        }

        $sumL = $sumA = $sumB = 0.0;
        foreach ($labs as [$L, $a, $b]) {
            $sumL += $L;
            $sumA += $a;
            $sumB += $b;
        }
        $meanL = $sumL / $n;
        $meanA = $sumA / $n;
        $meanB = $sumB / $n;

        $varSum = 0.0;
        foreach ($labs as [$L, $a, $b]) {
            $dL = $L - $meanL;
            $da = $a - $meanA;
            $db = $b - $meanB;
            $varSum += $dL * $dL + $da * $da + $db * $db;
        }
        $stddev = sqrt($varSum / $n);

        return ['mean' => [$meanL, $meanA, $meanB], 'stddev' => max(2.0, $stddev)];
    }

    // =====================================================================
    // GAUSSIAN KERNEL
    // =====================================================================

    /**
     * Buat kernel Gaussian 1D yang sudah dinormalisasi.
     *
     * @param  float $sigma  Standar deviasi (px)
     * @param  int   $radius Radius kernel (ukuran = 2*radius+1)
     * @return float[]
     */
    public static function gaussianKernel(float $sigma, int $radius): array
    {
        if ($sigma <= 0.0 || $radius <= 0) {
            return [1.0];
        }

        $kernel = [];
        $sum = 0.0;
        $twoSigSq = 2.0 * $sigma * $sigma;
        for ($i = -$radius; $i <= $radius; $i++) {
            $v = exp(-($i * $i) / $twoSigSq);
            $kernel[] = $v;
            $sum += $v;
        }
        // Normalisasi
        for ($i = 0; $i < count($kernel); $i++) {
            $kernel[$i] /= $sum;
        }
        return $kernel;
    }

    // =====================================================================
    // SOBEL GRADIENT
    // =====================================================================

    /**
     * Hitung magnitude Sobel gradient pada piksel (gx, gy) dalam gambar GD.
     *
     * Menggunakan kernel Sobel 3×3 pada luminansi (0.299R + 0.587G + 0.114B).
     * Nilai dikembalikan dalam rentang [0, 1].
     *
     * @param  \GdImage $img
     * @param  int      $gx  Kolom piksel
     * @param  int      $gy  Baris piksel
     * @param  int      $imgW Lebar gambar
     * @param  int      $imgH Tinggi gambar
     * @return float 0.0 = tidak ada gradient (area datar), 1.0 = tepi tajam
     */
    public static function sobelGradient(\GdImage $img, int $gx, int $gy, int $imgW, int $imgH): float
    {
        // Ambil luma 3×3 neighborhood (clamp ke border)
        $L = [];
        for ($dy = -1; $dy <= 1; $dy++) {
            for ($dx = -1; $dx <= 1; $dx++) {
                $nx = max(0, min($imgW - 1, $gx + $dx));
                $ny = max(0, min($imgH - 1, $gy + $dy));
                $c  = imagecolorat($img, $nx, $ny);
                $r  = ($c >> 16) & 0xFF;
                $g  = ($c >> 8) & 0xFF;
                $b  = $c & 0xFF;
                $L[] = 0.299 * $r + 0.587 * $g + 0.114 * $b;
            }
        }
        // Gx = [-1,0,+1; -2,0,+2; -1,0,+1] · L
        $Gx = -$L[0] + $L[2] - 2 * $L[3] + 2 * $L[5] - $L[6] + $L[8];
        // Gy = [-1,-2,-1; 0,0,0; +1,+2,+1] · L
        $Gy = -$L[0] - 2 * $L[1] - $L[2] + $L[6] + 2 * $L[7] + $L[8];

        $mag = sqrt($Gx * $Gx + $Gy * $Gy);
        // Maksimum teoritis Sobel pada gambar 8-bit ≈ 255 * 4√2 ≈ 1443
        return min(1.0, $mag / 1443.0);
    }

    /**
     * Hitung magnitude Sobel gradient dari array piksel RGB mentah (ruang kerja).
     *
     * @param  array<int, array{int, int, int}> $pixels Flat array [idx => [r,g,b]]
     * @param  int $gx   Kolom piksel di ruang kerja
     * @param  int $gy   Baris piksel di ruang kerja
     * @param  int $imgW Lebar ruang kerja
     * @param  int $imgH Tinggi ruang kerja
     * @return float 0.0–1.0
     */
    public static function sobelFromPixels(array $pixels, int $gx, int $gy, int $imgW, int $imgH): float
    {
        $L = [];
        for ($dy = -1; $dy <= 1; $dy++) {
            for ($dx = -1; $dx <= 1; $dx++) {
                $nx  = max(0, min($imgW - 1, $gx + $dx));
                $ny  = max(0, min($imgH - 1, $gy + $dy));
                [$r, $g, $b] = $pixels[$ny * $imgW + $nx] ?? [0, 0, 0];
                $L[] = 0.299 * $r + 0.587 * $g + 0.114 * $b;
            }
        }
        $Gx = -$L[0] + $L[2] - 2 * $L[3] + 2 * $L[5] - $L[6] + $L[8];
        $Gy = -$L[0] - 2 * $L[1] - $L[2] + $L[6] + 2 * $L[7] + $L[8];
        return min(1.0, sqrt($Gx * $Gx + $Gy * $Gy) / 1443.0);
    }

    // =====================================================================
    // GAUSSIAN BLUR (separable, untuk Float array)
    // =====================================================================

    /**
     * Gaussian blur separable dua-pass untuk Float32 grid (holeGrid).
     *
     * Lebih natural dari box blur: tidak ada kotak artifact di tepi,
     * weight mengikuti distribusi Gaussian (pusat lebih kuat dari perifer).
     *
     * @param  float[] $grid  Array 1D [w*h] nilai 0.0–1.0
     * @param  int     $w     Lebar grid
     * @param  int     $h     Tinggi grid
     * @param  int     $r     Radius blur (px ruang kerja)
     * @return float[]
     */
    public static function gaussianBlur(array $grid, int $w, int $h, int $r): array
    {
        if ($r <= 0 || $w <= 0 || $h <= 0) {
            return $grid;
        }

        $sigma  = max(0.5, $r / 2.5);
        $kernel = self::gaussianKernel($sigma, $r);
        $kLen   = count($kernel);

        // Pass horizontal
        $tmp = array_fill(0, $w * $h, 0.0);
        for ($y = 0; $y < $h; $y++) {
            $base = $y * $w;
            for ($x = 0; $x < $w; $x++) {
                $sum = 0.0;
                for ($k = 0; $k < $kLen; $k++) {
                    $sx = max(0, min($w - 1, $x + ($k - $r)));
                    $sum += ($grid[$base + $sx] ?? 0.0) * $kernel[$k];
                }
                $tmp[$base + $x] = $sum;
            }
        }

        // Pass vertikal
        $out = array_fill(0, $w * $h, 0.0);
        for ($x = 0; $x < $w; $x++) {
            for ($y = 0; $y < $h; $y++) {
                $sum = 0.0;
                for ($k = 0; $k < $kLen; $k++) {
                    $sy = max(0, min($h - 1, $y + ($k - $r)));
                    $sum += ($tmp[$sy * $w + $x] ?? 0.0) * $kernel[$k];
                }
                $out[$y * $w + $x] = $sum;
            }
        }

        return $out;
    }

    // =====================================================================
    // PRIVATE HELPERS
    // =====================================================================

    /** sRGB component → linear (IEC 61966-2-1). */
    private static function srgbToLinear(float $v): float
    {
        return $v <= 0.04045
            ? $v / 12.92
            : (($v + 0.055) / 1.055) ** 2.4;
    }

    /** Fungsi f() untuk konversi XYZ → LAB (CIELAB). */
    private static function labF(float $t): float
    {
        $delta = 6.0 / 29.0;
        return $t > $delta ** 3
            ? $t ** (1.0 / 3.0)
            : $t / (3.0 * $delta * $delta) + 4.0 / 29.0;
    }
}
