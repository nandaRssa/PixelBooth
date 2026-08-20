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

        // 1. Gambar dasar: template image bila ada, jika tidak gunakan background polos
        $this->drawBase($canvas, $template);

        // 2. Ambil capture yang sudah di-approve, urutkan per frame
        $captures = SessionCapture::where('session_id', $session->id)
            ->where('status', 'approved')
            ->orderBy('frame_number')
            ->get();

        // 3. Tentukan slot posisi tiap frame
        $slots = $this->resolveSlots($template, $captures->count());

        // 4. Tempel setiap capture ke slot masing-masing
        foreach ($captures as $index => $capture) {
            $slot = $slots[$index] ?? null;
            if (! $slot || ! $capture->photo_path) {
                continue;
            }

            $framePath = Storage::disk('public')->path($capture->photo_path);
            if (! is_file($framePath)) {
                continue;
            }

            $frameImg = $this->loadImage($framePath);
            if (! $frameImg) {
                continue;
            }

            $this->pasteCover(
                $canvas,
                $frameImg,
                (int) $slot['x'],
                (int) $slot['y'],
                (int) $slot['width'],
                (int) $slot['height']
            );

            imagedestroy($frameImg);
        }

        // 5. Simpan file final
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
            $canvas,
            $src,
            $dstX,
            $dstY,
            $cropX,
            $cropY,
            $dstW,
            $dstH,
            $cropW,
            $cropH
        );
    }
}