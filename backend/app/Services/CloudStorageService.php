<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class CloudStorageService
{
    /**
     * Upload an uploaded file or path to permanent storage (Cloudinary or local storage fallback).
     *
     * @param UploadedFile|string $file
     * @param string $folder e.g. 'templates' or 'photos'
     * @param string|null $filename
     * @return string Public URL or relative path
     */
    public static function upload(UploadedFile|string $file, string $folder = 'templates', ?string $filename = null): string
    {
        $cloudConfig = self::getCloudinaryConfig();

        // 1. Try uploading to Cloudinary if credentials are present
        if ($cloudConfig) {
            try {
                $filePath = $file instanceof UploadedFile ? $file->getRealPath() : $file;
                $timestamp = time();
                $publicId = $filename ?: Str::random(12);
                $folderPath = "pixelbooth/{$folder}";

                // Signature string: alphabetical order of params
                $paramsToSign = "folder={$folderPath}&public_id={$publicId}&timestamp={$timestamp}";
                $signature = sha1($paramsToSign . $cloudConfig['api_secret']);

                $response = Http::asMultipart()->post("https://api.cloudinary.com/v1_1/{$cloudConfig['cloud_name']}/image/upload", [
                    'file' => fopen($filePath, 'r'),
                    'folder' => $folderPath,
                    'public_id' => $publicId,
                    'timestamp' => $timestamp,
                    'api_key' => $cloudConfig['api_key'],
                    'signature' => $signature,
                ]);

                if ($response->successful()) {
                    $json = $response->json();
                    $secureUrl = $json['secure_url'] ?? $json['url'] ?? null;
                    if ($secureUrl) {
                        return $secureUrl;
                    }
                } else {
                    Log::warning('Cloudinary upload failed: ' . $response->body());
                }
            } catch (\Throwable $e) {
                Log::error('Cloudinary upload exception: ' . $e->getMessage());
            }
        }

        // 2. On Vercel / serverless without working Cloudinary: convert small/medium images (< 4MB) to permanent Data URL
        $isVercel = isset($_SERVER['VERCEL']) || isset($_ENV['VERCEL']) || (is_dir('/tmp') && !@is_writable(base_path('storage')));
        if ($isVercel) {
            try {
                $content = $file instanceof UploadedFile ? file_get_contents($file->getRealPath()) : (file_exists($file) ? file_get_contents($file) : null);
                if ($content && strlen($content) < 4 * 1024 * 1024) {
                    $mime = $file instanceof UploadedFile ? $file->getMimeType() : (@mime_content_type($file) ?: 'image/png');
                    return 'data:' . $mime . ';base64,' . base64_encode($content);
                }
            } catch (\Throwable $e) {
                Log::error('Data URI conversion failed: ' . $e->getMessage());
            }
        }

        // 3. Fallback to standard Laravel public storage disk
        if ($file instanceof UploadedFile) {
            return $file->storeAs($folder, ($filename ?: Str::random(8)) . '.' . ($file->getClientOriginalExtension() ?: 'jpg'), 'public');
        }

        if (is_string($file) && file_exists($file)) {
            $ext = pathinfo($file, PATHINFO_EXTENSION) ?: 'jpg';
            $targetName = ($filename ?: Str::random(8)) . '.' . $ext;
            $relativeDir = "{$folder}";
            
            // Simpan ke storage disk public
            Storage::disk('public')->putFileAs($relativeDir, new \Illuminate\Http\File($file), $targetName);
            return "{$relativeDir}/{$targetName}";
        }

        return $file;
    }

    /**
     * Hapus file di background setelah respon HTTP dikirim ke client (non-blocking).
     *
     * @param string|array|null $pathsOrUrls
     */
    public static function deleteAsync(string|array|null $pathsOrUrls): void
    {
        if (empty($pathsOrUrls)) {
            return;
        }

        $items = is_array($pathsOrUrls) ? $pathsOrUrls : [$pathsOrUrls];

        app()->terminating(function () use ($items) {
            self::delete($items);
        });
    }

    /**
     * Hapus file secara menyeluruh: lokal disk storage dan Cloudinary jika ada.
     *
     * @param string|array|null $pathsOrUrls
     */
    public static function delete(string|array|null $pathsOrUrls): void
    {
        if (empty($pathsOrUrls)) {
            return;
        }

        $items = is_array($pathsOrUrls) ? $pathsOrUrls : [$pathsOrUrls];
        $cloudConfig = self::getCloudinaryConfig();

        foreach ($items as $item) {
            if (! $item || ! is_string($item)) {
                continue;
            }

            try {
                // 1. Hapus dari Cloudinary jika berupa Cloudinary URL atau Public ID
                if ($cloudConfig) {
                    $publicId = self::extractCloudinaryPublicId($item);
                    if ($publicId) {
                        self::destroyCloudinary($publicId, $cloudConfig);
                    }
                }

                // 2. Hapus dari Laravel Public Storage Disk
                $cleanLocalPath = ltrim(preg_replace('#^/storage/#', '', $item), '/');
                if (Storage::disk('public')->exists($cleanLocalPath)) {
                    Storage::disk('public')->delete($cleanLocalPath);
                }

                // 3. Cek apakah ada file fisik langsung
                $fullLocalPath = storage_path('app/public/' . $cleanLocalPath);
                if (file_exists($fullLocalPath) && ! is_dir($fullLocalPath)) {
                    @unlink($fullLocalPath);
                }

                if (file_exists($item) && ! is_dir($item)) {
                    @unlink($item);
                }
            } catch (\Throwable $e) {
                Log::warning("Gagal menghapus file [{$item}]: " . $e->getMessage());
            }
        }
    }

    /**
     * Ekstrak public_id Cloudinary dari URL atau path.
     */
    public static function extractCloudinaryPublicId(string $item): ?string
    {
        // Contoh URL Cloudinary:
        // https://res.cloudinary.com/demo/image/upload/v1612345678/pixelbooth/photos/PixelBooth-Event-1.jpg
        // https://res.cloudinary.com/demo/image/upload/pixelbooth/photos/PixelBooth-Event-1.jpg
        if (str_contains($item, 'cloudinary.com')) {
            if (preg_match('#/upload/(?:v\d+/)?(.+?)(?:\.[a-zA-Z0-9]+)?$#', $item, $matches)) {
                return $matches[1];
            }
        }

        // Jika diawali pixelbooth/
        if (str_starts_with($item, 'pixelbooth/')) {
            return preg_replace('/\.[a-zA-Z0-9]+$/', '', $item);
        }

        return null;
    }

    /**
     * Panggil Cloudinary Destroy API.
     */
    private static function destroyCloudinary(string $publicId, array $config): bool
    {
        try {
            $timestamp = time();
            $paramsToSign = "public_id={$publicId}&timestamp={$timestamp}";
            $signature = sha1($paramsToSign . $config['api_secret']);

            $response = Http::asMultipart()->post("https://api.cloudinary.com/v1_1/{$config['cloud_name']}/image/destroy", [
                'public_id' => $publicId,
                'timestamp' => $timestamp,
                'api_key' => $config['api_key'],
                'signature' => $signature,
            ]);

            if ($response->successful()) {
                $result = $response->json();
                return ($result['result'] ?? '') === 'ok';
            }

            Log::warning("Cloudinary destroy response [{$publicId}]: " . $response->body());
        } catch (\Throwable $e) {
            Log::error("Cloudinary destroy error [{$publicId}]: " . $e->getMessage());
        }

        return false;
    }

    /**
     * Ambil konfigurasi Cloudinary dari env.
     */
    private static function getCloudinaryConfig(): ?array
    {
        if (app()->runningUnitTests() || app()->environment('testing')) {
            return null;
        }

        $cloudName = env('CLOUDINARY_CLOUD_NAME');
        $apiKey = env('CLOUDINARY_API_KEY');
        $apiSecret = env('CLOUDINARY_API_SECRET');
        $cloudinaryUrl = env('CLOUDINARY_URL');

        if (! $cloudName && $cloudinaryUrl) {
            $parsed = parse_url($cloudinaryUrl);
            if ($parsed) {
                $cloudName = $parsed['host'] ?? null;
                $apiKey = $parsed['user'] ?? null;
                $apiSecret = $parsed['pass'] ?? null;
            }
        }

        if ($cloudName && $apiKey && $apiSecret) {
            return [
                'cloud_name' => $cloudName,
                'api_key' => $apiKey,
                'api_secret' => $apiSecret,
            ];
        }

        return null;
    }
}
