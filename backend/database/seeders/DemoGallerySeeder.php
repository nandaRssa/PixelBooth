<?php

namespace Database\Seeders;

use App\Models\Folder;
use App\Models\Photo;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class DemoGallerySeeder extends Seeder
{
    /**
     * Seeder opsional untuk data demo galeri.
     * Membuat folder contoh dan beberapa foto placeholder
     * agar tampilan galeri langsung terlihat saat development.
     */
    public function run(): void
    {
        if (! extension_loaded('gd')) {
            $this->command->warn('⚠️  Ekstensi GD tidak tersedia, seeder demo galeri dilewati.');
            return;
        }

        $this->command->info('Menyiapkan demo galeri...');

        // ==========================================
        // 1. Buat folder contoh
        // ==========================================
        $weddingFolder = Folder::firstOrCreate(
            ['name' => 'Pernikahan Andi & Sari'],
            ['name' => 'Pernikahan Andi & Sari']
        );

        $birthdayFolder = Folder::firstOrCreate(
            ['name' => 'Ulang Tahun Raka'],
            ['name' => 'Ulang Tahun Raka']
        );

        $studioFolder = Folder::firstOrCreate(
            ['name' => 'Studio'],
            ['name' => 'Studio']
        );

        // Sub-folder di dalam Studio
        $studioPortrait = Folder::firstOrCreate(
            ['name' => 'Portrait', 'parent_folder_id' => $studioFolder->id],
            ['name' => 'Portrait', 'parent_folder_id' => $studioFolder->id]
        );

        // ==========================================
        // 2. Generate foto placeholder
        // ==========================================
        $demoPhotos = [
            ['folder' => $weddingFolder, 'count' => 6, 'label' => 'Wedding', 'hue' => [20, 30]],
            ['folder' => $birthdayFolder, 'count' => 4, 'label' => 'Birthday', 'hue' => [45, 55]],
            ['folder' => $studioPortrait, 'count' => 5, 'label' => 'Studio', 'hue' => [220, 240]],
        ];

        foreach ($demoPhotos as $demo) {
            $folder = $demo['folder'];
            for ($i = 1; $i <= $demo['count']; $i++) {
                $this->createDemoPhoto($folder, $demo['label'], $demo['hue'], $i);
            }
        }

        $this->command->info('✅ Demo galeri berhasil dibuat.');
    }

    private function createDemoPhoto(Folder $folder, string $label, array $hueRange, int $index): void
    {
        $token = Str::uuid()->toString();
        $filename = sprintf(
            '%s-%02d-%s.png',
            Str::slug($folder->name),
            $index,
            substr($token, 0, 8)
        );

        $fullPath = "demo/photos/{$folder->id}/{$filename}";
        $thumbPath = "demo/photos/{$folder->id}/thumbs/{$filename}";

        // Generate gambar utama (1600x1200)
        $image = $this->generatePlaceholder(1600, 1200, $label, $hueRange, $index);
        Storage::disk('public')->put($fullPath, $image);

        // Generate thumbnail (400x300)
        $thumb = $this->generatePlaceholder(400, 300, $label, $hueRange, $index);
        Storage::disk('public')->put($thumbPath, $thumb);

        Photo::firstOrCreate(
            ['filename' => $filename],
            [
                'folder_id' => $folder->id,
                'filename' => $filename,
                'storage_path' => $fullPath,
                'thumbnail_path' => $thumbPath,
                'unique_token' => $token,
                'is_final' => true,
                'is_temporary' => false,
                'file_size' => 0,
                'mime_type' => 'image/png',
            ]
        );
    }

    /**
     * Generate gambar placeholder gradient dengan GD.
     */
    private function generatePlaceholder(int $width, int $height, string $label, array $hueRange, int $index): string
    {
        $img = imagecreatetruecolor($width, $height);

        $hue = $hueRange[0] + (($index - 1) * 8) % (($hueRange[1] - $hueRange[0]) ?: 1);
        $sat = 18;
        $light = 22;

        $top = $this->hslToRgb($hue, $sat, min(100, $light + 10));
        $bottom = $this->hslToRgb($hue, $sat, max(0, $light - 10));

        // Gradient vertikal
        for ($y = 0; $y < $height; $y++) {
            $ratio = $y / max(1, $height - 1);
            $color = $this->blend($top, $bottom, $ratio);
            $col = imagecolorallocate($img, $color[0], $color[1], $color[2]);
            imageline($img, 0, $y, $width, $y, $col);
        }

        // Overlay grid halus
        $gridColor = imagecolorallocate($img, 255, 255, 255);
        for ($x = 0; $x < $width; $x += 32) {
            imageline($img, $x, 0, $x, $height, $gridColor);
        }
        for ($y = 0; $y < $height; $y += 32) {
            imageline($img, 0, $y, $width, $y, $gridColor);
        }

        // Teks label
        $fontSize = (int) round(min($width, $height) * 0.06);
        $fontFile = $this->findFont();
        if ($fontFile) {
            $textColor = imagecolorallocate($img, 250, 250, 250);
            $bbox = imagettfbbox($fontSize, 0, $fontFile, $label);
            $textWidth = abs($bbox[2] - $bbox[0]);
            $textHeight = abs($bbox[7] - $bbox[1]);
            imagettftext(
                $img,
                $fontSize,
                0,
                (int) (($width - $textWidth) / 2),
                (int) (($height + $textHeight) / 2),
                $textColor,
                $fontFile,
                $label
            );
        }

        ob_start();
        imagepng($img);
        $data = ob_get_clean();
        imagedestroy($img);

        return $data;
    }

    /**
     * Cari font TTF yang tersedia di sistem Windows.
     */
    private function findFont(): ?string
    {
        $candidates = [
            'C:\Windows\Fonts\arial.ttf',
            'C:\Windows\Fonts\segoeui.ttf',
            'C:\Windows\Fonts\calibri.ttf',
        ];

        foreach ($candidates as $font) {
            if (file_exists($font)) {
                return $font;
            }
        }

        return null;
    }

    private function hslToRgb(float $h, float $s, float $l): array
    {
        $s /= 100;
        $l /= 100;
        $k = fn(float $n): float => ($n + $h / 30) % 12;
        $a = $s * min($l, 1 - $l);
        $f = fn(float $n): float => $l - $a * max(-1, min($k($n) - 3, min(9 - $k($n), 1)));

        return [
            (int) round(255 * $f(0)),
            (int) round(255 * $f(8)),
            (int) round(255 * $f(4)),
        ];
    }

    private function blend(array $c1, array $c2, float $ratio): array
    {
        return [
            (int) round($c1[0] + ($c2[0] - $c1[0]) * $ratio),
            (int) round($c1[1] + ($c2[1] - $c1[1]) * $ratio),
            (int) round($c1[2] + ($c2[2] - $c1[2]) * $ratio),
        ];
    }
}