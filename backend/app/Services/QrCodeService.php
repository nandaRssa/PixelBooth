<?php

namespace App\Services;

use App\Models\Folder;
use App\Models\Photo;
use Illuminate\Support\Facades\Storage;
use SimpleSoftwareIO\QrCode\Facades\QrCode;

class QrCodeService
{
    /**
     * Base URL aplikasi frontend untuk halaman customer.
     */
    private function frontendUrl(): string
    {
        return rtrim(config('app.frontend_url', 'http://localhost:5173'), '/');
    }

    /**
     * Generate QR code untuk foto dan simpan ke storage.
     *
     * @return string path file QR code
     */
    public function generatePhotoQr(Photo $photo): string
    {
        $url = "{$this->frontendUrl()}/photo/{$photo->unique_token}";
        $path = "qr/photos/{$photo->unique_token}.svg";

        $qrContent = QrCode::format('svg')
            ->size(300)
            ->errorCorrection('H')
            ->generate($url);

        Storage::disk('public')->put($path, $qrContent);

        return $path;
    }

    /**
     * Generate QR code untuk folder dan simpan ke storage.
     *
     * @return string path file QR code
     */
    public function generateFolderQr(Folder $folder): string
    {
        $url = "{$this->frontendUrl()}/folder/{$folder->unique_token}";
        $path = "qr/folders/{$folder->unique_token}.svg";

        $qrContent = QrCode::format('svg')
            ->size(300)
            ->errorCorrection('H')
            ->generate($url);

        Storage::disk('public')->put($path, $qrContent);

        return $path;
    }

    /**
     * Ambil URL publik QR code foto.
     */
    public function getPhotoQrUrl(Photo $photo): string
    {
        return asset("storage/qr/photos/{$photo->unique_token}.svg");
    }

    /**
     * Ambil URL publik QR code folder.
     */
    public function getFolderQrUrl(Folder $folder): string
    {
        return asset("storage/qr/folders/{$folder->unique_token}.svg");
    }
}
