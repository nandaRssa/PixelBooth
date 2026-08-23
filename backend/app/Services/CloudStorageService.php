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
     * @param string $filename
     * @return string Public URL or relative path
     */
    public static function upload(UploadedFile|string $file, string $folder = 'templates', ?string $filename = null): string
    {
        $cloudName = env('CLOUDINARY_CLOUD_NAME');
        $apiKey = env('CLOUDINARY_API_KEY');
        $apiSecret = env('CLOUDINARY_API_SECRET');
        $cloudinaryUrl = env('CLOUDINARY_URL');

        // Parse CLOUDINARY_URL if cloudName is not explicitly set (format: cloudinary://api_key:api_secret@cloud_name)
        if (! $cloudName && $cloudinaryUrl) {
            $parsed = parse_url($cloudinaryUrl);
            if ($parsed) {
                $cloudName = $parsed['host'] ?? null;
                $apiKey = $parsed['user'] ?? null;
                $apiSecret = $parsed['pass'] ?? null;
            }
        }

        // 1. Try uploading to Cloudinary if credentials are present
        if ($cloudName && $apiKey && $apiSecret) {
            try {
                $filePath = $file instanceof UploadedFile ? $file->getRealPath() : $file;
                $timestamp = time();
                $publicId = $filename ?: Str::random(12);
                $folderPath = "pixelbooth/{$folder}";

                // Signature string: alphabetical order of params
                $paramsToSign = "folder={$folderPath}&public_id={$publicId}&timestamp={$timestamp}";
                $signature = sha1($paramsToSign . $apiSecret);

                $response = Http::asMultipart()->post("https://api.cloudinary.com/v1_1/{$cloudName}/image/upload", [
                    'file' => fopen($filePath, 'r'),
                    'folder' => $folderPath,
                    'public_id' => $publicId,
                    'timestamp' => $timestamp,
                    'api_key' => $apiKey,
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
            return $file->store("{$folder}/" . ($filename ?: Str::random(8)), 'public');
        }

        return $file;
    }
}
