<?php

namespace App\Services;

use App\Models\PhotoSession;
use App\Models\SessionCapture;
use App\Models\Template;
use Illuminate\Support\Facades\Storage;

/**
 * Merender foto final photobooth:
 * menggabungkan capture frame ke template sesuai frame configuration.
 */
class PhotoRenderService
{
    /**
     * Render foto final dari sesi.
     *
     * @return array{0: string, 1: int} [storage_path final, file_size]
     */
    public function renderFinal(PhotoSession $session): array
    {
        $template = $session->template;
        $canvasW = $template->canvas_width;
        $canvasH = $template->canvas_height;

        $canvas = imagecreatetruecolor($canvasW, $canvasH);
        if (! $canvas) {
            throw new \RuntimeException('Gagal membuat canvas foto final.');
        }

        $captures = SessionCapture::where('session_id', $session->id)
            ->where('status', 'approved')
            ->orderBy('frame_number')
            ->get();

        $slots = $this->resolveSlots($template, $captures->count());

        $templatePath = $template->template_file ? Storage::disk('public')->path($template->template_file) : null;
        if (!$templatePath || !is_file($templatePath)) {
            throw new \RuntimeException('File template tidak ditemukan.');
        }

        $templateImg = $this->loadImage($templatePath);
        if (!$templateImg) {
            throw new \RuntimeException('Gagal memuat gambar template.');
        }

        $w = imagesx($templateImg);
        $h = imagesy($templateImg);

        // Buat salinan template yang mendukung alpha channel
        $templateWithHoles = imagecreatetruecolor($w, $h);
        imagealphablending($templateWithHoles, false);
        imagesavealpha($templateWithHoles, true);
        imagecopy($templateWithHoles, $templateImg, 0, 0, 0, 0, $w, $h);
        imagedestroy($templateImg);

        // Buat lubang transparan (alpha = 127) pada salinan template mengikuti mask tiap frame
        $transparent = imagecolorallocatealpha($templateWithHoles, 0, 0, 0, 127);
        foreach ($slots as $slot) {
            $points = $slot['mask'] ?? null;
            if (is_array($points) && count($points) >= 3) {
                $flat = [];
                foreach ($points as $p) {
                    $px = (int) round($p[0] * $w / $canvasW);
                    $py = (int) round($p[1] * $h / $canvasH);
                    $flat[] = $px;
                    $flat[] = $py;
                }
                imagefilledpolygon($templateWithHoles, $flat, count($flat) / 2, $transparent);
            } else {
                $x = (int) round($slot['x'] * $w / $canvasW);
                $y = (int) round($slot['y'] * $h / $canvasH);
                $sw = (int) round($slot['width'] * $w / $canvasW);
                $sh = (int) round($slot['height'] * $h / $canvasH);
                imagefilledrectangle($templateWithHoles, $x, $y, $x + $sw - 1, $y + $sh - 1, $transparent);
            }
        }

        // 1. Gambar latar belakang pada canvas utama
        $bg = imagecolorallocate($canvas, 18, 18, 18);
        imagefilledrectangle($canvas, 0, 0, $canvasW - 1, $canvasH - 1, $bg);

        // 2. Tempel dan clip setiap capture foto di bawah slot masing-masing
        foreach ($captures as $index => $capture) {
            $slot = $slots[$index] ?? null;
            if (! $slot || ! $capture->photo_path) {
                continue;
            }
            $frameImg = $this->loadCaptureImage($capture);
            if (! $frameImg) {
                continue;
            }
            $this->pasteFrame($canvas, $frameImg, $slot);
            imagedestroy($frameImg);
        }

        // 3. Gambar template dengan lubang transparan di atas canvas utama
        imagealphablending($canvas, true);
        imagecopyresampled(
            $canvas,
            $templateWithHoles,
            0,
            0,
            0,
            0,
            $canvasW,
            $canvasH,
            $w,
            $h
        );
        imagedestroy($templateWithHoles);

        // Simpan file final
        $storagePath = "sessions/{$session->session_token}/final.jpg";
        $tmpPath = tempnam(sys_get_temp_dir(), 'pixfinal');

        imagejpeg($canvas, $tmpPath, 92);
        $fileSize = filesize($tmpPath);
        Storage::disk('public')->put($storagePath, (string) file_get_contents($tmpPath));

        unlink($tmpPath);
        imagedestroy($canvas);

        return [$storagePath, $fileSize];
    }

    /**
     * Render thumbnail foto final dan simpan ke storage.
     *
     * @return string path thumbnail
     */
    public function renderThumbnail(PhotoSession $session, string $finalPath): string
    {
        $sourcePath = Storage::disk('public')->path($finalPath);
        if (! is_file($sourcePath)) {
            return '';
        }

        $src = $this->loadImage($sourcePath);
        if (! $src) {
            return '';
        }

        $srcW = imagesx($src);
        $srcH = imagesy($src);
        $thumbW = 480;
        $thumbH = max(1, (int) round($thumbW * $srcH / $srcW));

        $thumb = imagecreatetruecolor($thumbW, $thumbH);
        imagecopyresampled($thumb, $src, 0, 0, 0, 0, $thumbW, $thumbH, $srcW, $srcH);

        $storagePath = "sessions/{$session->session_token}/thumb.jpg";
        $tmpPath = tempnam(sys_get_temp_dir(), 'pixthumb');

        imagejpeg($thumb, $tmpPath, 80);
        Storage::disk('public')->put($storagePath, (string) file_get_contents($tmpPath));

        unlink($tmpPath);
        imagedestroy($thumb);
        imagedestroy($src);

        return $storagePath;
    }



    /**
     * Muat capture frame dari storage.
     */
    private function loadCaptureImage(SessionCapture $capture)
    {
        $framePath = Storage::disk('public')->path($capture->photo_path);
        if (! is_file($framePath)) {
            return false;
        }
        return $this->loadImage($framePath);
    }

    /**
     * Tempel foto yang di-clip mengikuti mask bentuk frame (non-alpha path).
     */
    private function pasteFrame($canvas, $src, array $slot): void
    {
        $dstX = (int) $slot['x'];
        $dstY = (int) $slot['y'];
        $dstW = (int) $slot['width'];
        $dstH = (int) $slot['height'];
        if ($dstW <= 0 || $dstH <= 0) {
            return;
        }

        $maskImg = $this->rasterizeShape($slot, $dstX, $dstY, $dstW, $dstH);
        if (! $maskImg) {
            $this->pasteCover($canvas, $src, $dstX, $dstY, $dstW, $dstH);
            return;
        }

        $photo = imagecreatetruecolor($dstW, $dstH);
        imagealphablending($photo, false);
        imagesavealpha($photo, true);
        $this->resizeCoverInto($photo, $src);

        for ($y = 0; $y < $dstH; $y++) {
            for ($x = 0; $x < $dstW; $x++) {
                $ma = (imagecolorat($maskImg, $x, $y) >> 24) & 0x7F;
                if ($ma >= 110) {
                    continue;
                }
                $c = imagecolorat($photo, $x, $y);
                imagesetpixel($canvas, $dstX + $x, $dstY + $y, $c);
            }
        }

        imagedestroy($photo);
        imagedestroy($maskImg);
    }

    /**
     * Rasterisasi mask bentuk frame menjadi gambar alpha (bbox size).
     * Tanpa mask → persegi penuh.
     *
     * @return \GdImage|false
     */
    private function rasterizeShape(array $slot, int $dstX, int $dstY, int $dstW, int $dstH)
    {
        if ($dstW <= 0 || $dstH <= 0) {
            return false;
        }

        $img = imagecreatetruecolor($dstW, $dstH);
        imagealphablending($img, false);
        imagesavealpha($img, true);
        $transparent = imagecolorallocatealpha($img, 0, 0, 0, 127);
        imagefilledrectangle($img, 0, 0, $dstW - 1, $dstH - 1, $transparent);

        $points = $slot['mask'] ?? null;
        if (! is_array($points) || count($points) < 3) {
            $points = [
                [$dstX, $dstY],
                [$dstX + $dstW, $dstY],
                [$dstX + $dstW, $dstY + $dstH],
                [$dstX, $dstY + $dstH],
            ];
        }

        $opaque = imagecolorallocatealpha($img, 255, 255, 255, 0);
        $flat = [];
        foreach ($points as $p) {
            $flat[] = (int) round($p[0] - $dstX);
            $flat[] = (int) round($p[1] - $dstY);
        }
        if (count($flat) >= 6) {
            imagefilledpolygon($img, $flat, (int) (count($flat) / 2), $opaque);
        }

        return $img;
    }

    /**
     * Gambar dasar canvas — template bila file-nya ada, selain itu background gelap.
     */
    private function drawBase($canvas, Template $template): void
    {
        $canvasW = imagesx($canvas);
        $canvasH = imagesy($canvas);

        // Background gelap
        $bg = imagecolorallocate($canvas, 18, 18, 18);
        imagefilledrectangle($canvas, 0, 0, $canvasW - 1, $canvasH - 1, $bg);

        // Template image bila tersedia
        if ($template->template_file && Storage::disk('public')->exists($template->template_file)) {
            $templateImg = $this->loadImage(Storage::disk('public')->path($template->template_file));
            if ($templateImg) {
                imagecopyresampled(
                    $canvas,
                    $templateImg,
                    0,
                    0,
                    0,
                    0,
                    $canvasW,
                    $canvasH,
                    imagesx($templateImg),
                    imagesy($templateImg)
                );
                imagedestroy($templateImg);
            }
        }
    }

    /**
     * Tentukan slot frame: pakai frame_configuration jika valid, jika tidak auto layout.
     */
    private function resolveSlots(Template $template, int $count): array
    {
        if ($count <= 0) {
            return [];
        }

        $config = $template->frame_configuration;
        if (is_array($config) && count($config) > 0) {
            $slots = array_values(array_filter($config, function ($slot) {
                return isset($slot['x'], $slot['y'], $slot['width'], $slot['height'])
                    && (int) $slot['width'] > 0
                    && (int) $slot['height'] > 0;
            }));

            // Urutkan berdasarkan order bila ada
            usort($slots, function ($a, $b) {
                $oa = $a['order'] ?? 0;
                $ob = $b['order'] ?? 0;
                return $oa <=> $ob;
            });

            if (count($slots) >= $count) {
                return array_slice($slots, 0, $count);
            }
        }

        return $this->autoLayout($template->canvas_width, $template->canvas_height, $count);
    }

    /**
     * Auto layout sederhana:
     * - 1 frame: penuh
     * - 2-3 frame: strip vertikal (fotobooth klasik)
     * - 4+ frame: grid
     */
    private function autoLayout(int $canvasW, int $canvasH, int $count): array
    {
        $margin = (int) round(min($canvasW, $canvasH) * 0.04);

        if ($count === 1) {
            return [[
                'x' => $margin,
                'y' => $margin,
                'width' => $canvasW - ($margin * 2),
                'height' => $canvasH - ($margin * 2),
            ]];
        }

        // Strip vertikal untuk 2-3 frame
        if ($count <= 3) {
            $slotH = (int) (($canvasH - ($margin * ($count + 1))) / $count);
            $slots = [];
            for ($i = 0; $i < $count; $i++) {
                $slots[] = [
                    'x' => $margin,
                    'y' => $margin + ($i * ($slotH + $margin)),
                    'width' => $canvasW - ($margin * 2),
                    'height' => $slotH,
                ];
            }
            return $slots;
        }

        // Grid untuk 4+ frame
        $cols = (int) ceil(sqrt($count));
        $rows = (int) ceil($count / $cols);
        $slotW = (int) (($canvasW - ($margin * ($cols + 1))) / $cols);
        $slotH = (int) (($canvasH - ($margin * ($rows + 1))) / $rows);

        $slots = [];
        for ($i = 0; $i < $count; $i++) {
            $r = intdiv($i, $cols);
            $c = $i % $cols;
            $slots[] = [
                'x' => $margin + ($c * ($slotW + $margin)),
                'y' => $margin + ($r * ($slotH + $margin)),
                'width' => $slotW,
                'height' => $slotH,
            ];
        }
        return $slots;
    }

    /**
     * Muat gambar (jpg/png/webp) ke resource GD.
     *
     * @return \GdImage|false
     */
    private function loadImage(string $path)
    {
        $info = @getimagesize($path);
        if (! $info) {
            return false;
        }

        return match ($info[2]) {
            IMAGETYPE_JPEG => imagecreatefromjpeg($path),
            IMAGETYPE_PNG => imagecreatefrompng($path),
            IMAGETYPE_WEBP => imagecreatefromwebp($path),
            default => false,
        };
    }

    /**
     * Tempel gambar menutupi slot (cover): crop sesuai rasio lalu resize ke ukuran slot.
     */
    private function pasteCover($canvas, $src, int $dstX, int $dstY, int $dstW, int $dstH): void
    {
        if ($src === false || $dstW <= 0 || $dstH <= 0) {
            return;
        }

        $tmp = imagecreatetruecolor($dstW, $dstH);
        $this->resizeCoverInto($tmp, $src);
        imagecopy($canvas, $tmp, $dstX, $dstY, 0, 0, $dstW, $dstH);
        imagedestroy($tmp);
    }

    /**
     * Resize gambar sumber menutupi (cover) ke dalam gambar tujuan berukuran slot.
     */
    private function resizeCoverInto($dst, $src): void
    {
        $dstW = imagesx($dst);
        $dstH = imagesy($dst);
        $srcW = imagesx($src);
        $srcH = imagesy($src);

        if ($srcW <= 0 || $srcH <= 0 || $dstW <= 0 || $dstH <= 0) {
            return;
        }

        $srcRatio = $srcW / $srcH;
        $dstRatio = $dstW / $dstH;

        $cropW = $srcW;
        $cropH = $srcH;
        $cropX = 0;
        $cropY = 0;

        if ($srcRatio > $dstRatio) {
            // Gambar lebih lebar — potong sisi kiri-kanan
            $cropW = (int) ($srcH * $dstRatio);
            $cropX = intdiv($srcW - $cropW, 2);
        } else {
            // Gambar lebih tinggi — potong atas-bawah
            $cropH = (int) ($srcW / $dstRatio);
            $cropY = intdiv($srcH - $cropH, 2);
        }

        imagecopyresampled(
            $dst,
            $src,
            0,
            0,
            $cropX,
            $cropY,
            $dstW,
            $dstH,
            $cropW,
            $cropH
        );
    }
}