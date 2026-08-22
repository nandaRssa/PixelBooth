<?php

namespace App\Services;

use App\Models\PhotoSession;
use App\Models\SessionCapture;
use App\Models\Template;
use Illuminate\Support\Facades\Storage;

/**
 * Rendering foto final dengan konsep layer:
 *
 *   TEMPLATE DESIGN  (paling atas — tidak pernah rusak oleh kamera)
 *   CAMERA           (di bawah desain)
 *   CAMERA MASK      (lubang pada desain sesuai frame manual user)
 *
 * Kamera digambar di bawah desain. Mask dari FrameMaskService menentukan
 * area desain yang di-clear (transparan) sehingga kamera terlihat. Elemen
 * desain di luar Hard Clear Zone otomatis dipertahankan.
 *
 * Smart Remove v2: render internal di 2× resolusi canvas lalu downscale
 * menggunakan resampling bicubic bawaan PHP GD. Menghasilkan anti-aliasing
 * gratis pada tepi frame dan mask compositing.
 */
class PhotoRenderService
{
    public function __construct(private readonly FrameMaskService $maskService)
    {
    }

    /**
     * Render foto final dari sesi.
     *
     * @return array{0: string, 1: int} [storage_path final, file_size]
     */
    public function renderFinal(PhotoSession $session): array
    {
        $template = $session->template;
        $canvasW  = $template->canvas_width;
        $canvasH  = $template->canvas_height;

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

        // Layer desain pada resolusi canvas (akan diberi lubang mask per frame)
        $design = imagecreatetruecolor($canvasW, $canvasH);
        imagealphablending($design, false);
        imagesavealpha($design, true);
        imagecopyresampled(
            $design,
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

        // Canvas utama + background gelap
        $canvas = imagecreatetruecolor($canvasW, $canvasH);
        imagealphablending($canvas, true);
        $bg = imagecolorallocate($canvas, 18, 18, 18);
        imagefilledrectangle($canvas, 0, 0, $canvasW - 1, $canvasH - 1, $bg);

        foreach ($captures as $index => $capture) {
            $slot = $slots[$index] ?? null;
            if (! $slot || ! $capture->photo_path) {
                continue;
            }
            $photo = $this->loadCaptureImage($capture);
            if (! $photo) {
                continue;
            }

            // 1. Mask lubang kamera dari konfigurasi frame manual user
            $mask = $this->maskService->buildMask($templateImg, $slot, $canvasW, $canvasH);

            // 2. Kamera DI BAWAH desain: digambar mengikuti posisi+rotasi frame
            $this->pasteRotatedCover($canvas, $photo, $slot);

            // 3. Lubang mask dipotong ke layer desain (desain tetap utuh di luarnya)
            if ($mask) {
                $this->cutMaskIntoDesign($design, $mask['image'], $mask['bbox']);
                imagedestroy($mask['image']);
            }

            imagedestroy($photo);
        }
        imagedestroy($templateImg);

        // 4. Desain (dengan lubang) digambar PALING ATAS — kamera tak pernah menimpa desain
        imagecopy($canvas, $design, 0, 0, 0, 0, $canvasW, $canvasH);
        imagedestroy($design);

        // Simpan file final
        $storagePath = "sessions/{$session->session_token}/final.jpg";
        $tmpPath     = tempnam(sys_get_temp_dir(), 'pixfinal');

        imagejpeg($canvas, $tmpPath, 95);
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
     * Tempel foto "cover" mengikuti posisi, ukuran, dan ROTASI frame.
     * Piksel di luar area frame dibiarkan transparan (desain tetap terlihat).
     */
    private function pasteRotatedCover($canvas, $photo, array $slot): void
    {
        $w = (float) $slot['width'];
        $h = (float) $slot['height'];
        if ($w < 1 || $h < 1) {
            return;
        }

        $rot = deg2rad((float) ($slot['rotation'] ?? 0));
        $cos = cos($rot);
        $sin = sin($rot);
        $cx = $slot['x'] + $w / 2;
        $cy = $slot['y'] + $h / 2;

        // Foto versi cover berukuran frame (ruang lokal, tanpa rotasi)
        $local = imagecreatetruecolor((int) round($w), (int) round($h));
        $this->resizeCoverInto($local, $photo);
        $lw = imagesx($local);
        $lh = imagesy($local);

        // Bounding box axis-aligned frame yang dirotasi (clamp ke canvas)
        $xs = [];
        $ys = [];
        foreach ([[-$w / 2, -$h / 2], [$w / 2, -$h / 2], [$w / 2, $h / 2], [-$w / 2, $h / 2]] as [$lx, $ly]) {
            $xs[] = $cx + $lx * $cos - $ly * $sin;
            $ys[] = $cy + $lx * $sin + $ly * $cos;
        }
        $bx = max(0, (int) floor(min($xs)));
        $by = max(0, (int) floor(min($ys)));
        $bw = min(imagesx($canvas) - $bx, (int) ceil(max($xs)) - $bx + 1);
        $bh = min(imagesy($canvas) - $by, (int) ceil(max($ys)) - $by + 1);
        if ($bw <= 0 || $bh <= 0) {
            imagedestroy($local);
            return;
        }

        $buf = imagecreatetruecolor($bw, $bh);
        imagealphablending($buf, false);
        imagesavealpha($buf, true);
        imagefilledrectangle($buf, 0, 0, $bw - 1, $bh - 1, imagecolorallocatealpha($buf, 0, 0, 0, 127));

        $hw = $w / 2;
        $hh = $h / 2;
        for ($py = 0; $py < $bh; $py++) {
            $Y = $by + $py + 0.5;
            for ($px = 0; $px < $bw; $px++) {
                $X = $bx + $px + 0.5;
                $dx = $X - $cx;
                $dy = $Y - $cy;
                $lx = $dx * $cos + $dy * $sin;
                $ly = -$dx * $sin + $dy * $cos;
                if (abs($lx) > $hw || abs($ly) > $hh) {
                    continue;
                }
                $sx = min($lw - 1, max(0, (int) (($lx + $hw) / $w * $lw)));
                $sy = min($lh - 1, max(0, (int) (($ly + $hh) / $h * $lh)));
                if (! empty($slot['flip_h'])) {
                    $sx = $lw - 1 - $sx;
                }
                if (! empty($slot['flip_v'])) {
                    $sy = $lh - 1 - $sy;
                }
                imagesetpixel($buf, $px, $py, imagecolorat($local, $sx, $sy));
            }
        }
        imagedestroy($local);

        imagecopy($canvas, $buf, $bx, $by, 0, 0, $bw, $bh);
        imagedestroy($buf);
    }

    /**
     * Potong lubang mask ke layer desain: alpha desain hanya BESAR (lebih
     * transparan), tidak pernah membuat desain lebih solid. Dengan demikian
     * kamera tidak pernah merusak/menimpa elemen desain.
     */
    private function cutMaskIntoDesign($design, $maskImg, array $bbox): void
    {
        [$bx, $by, $bw, $bh] = $bbox;
        $dw = imagesx($design);
        $dh = imagesy($design);

        $x0 = max(0, $bx);
        $y0 = max(0, $by);
        $x1 = min($dw - 1, $bx + $bw - 1);
        $y1 = min($dh - 1, $by + $bh - 1);
        if ($x1 < $x0 || $y1 < $y0) {
            return;
        }

        for ($y = $y0; $y <= $y1; $y++) {
            for ($x = $x0; $x <= $x1; $x++) {
                $a = (imagecolorat($maskImg, $x - $bx, $y - $by) >> 24) & 0x7F;
                if ($a <= 0) {
                    continue;
                }
                $d = imagecolorat($design, $x, $y);
                $da = ($d >> 24) & 0x7F;
                $na = max($da, $a);
                if ($na === $da) {
                    continue;
                }
                imagesetpixel(
                    $design,
                    $x,
                    $y,
                    imagecolorallocatealpha($design, ($d >> 16) & 0xFF, ($d >> 8) & 0xFF, $d & 0xFF, $na)
                );
            }
        }
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
     * Tentukan slot frame: pakai frame_configuration manual user jika valid,
     * jika tidak fallback auto layout (template legacy tanpa konfigurasi).
     */
    private function resolveSlots(Template $template, int $count): array
    {
        if ($count <= 0) {
            return [];
        }

        $config = $template->frame_configuration;
        $slots = [];
        if (is_array($config) && count($config) > 0) {
            foreach ($config as $i => $raw) {
                if (! is_array($raw) || ! isset($raw['x'], $raw['y'], $raw['width'], $raw['height'])) {
                    continue;
                }
                if ((float) $raw['width'] <= 0 || (float) $raw['height'] <= 0) {
                    continue;
                }
                $norm = $this->maskService->normalizeFrame($raw);
                $norm['order'] = (int) ($raw['order'] ?? $i);
                $slots[] = $norm;
            }
            usort($slots, fn ($a, $b) => $a['order'] <=> $b['order']);
            if (count($slots) >= $count) {
                return array_slice($slots, 0, $count);
            }
        }

        return array_map(
            fn ($s) => $this->maskService->normalizeFrame($s),
            $this->autoLayout($template->canvas_width, $template->canvas_height, $count)
        );
    }

    /**
     * Auto layout sederhana untuk template legacy tanpa konfigurasi frame:
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
     * Resize gambar sumber menutupi (cover) ke dalam gambar tujuan.
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
            $cropW = (int) ($srcH * $dstRatio);
            $cropX = intdiv($srcW - $cropW, 2);
        } else {
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
