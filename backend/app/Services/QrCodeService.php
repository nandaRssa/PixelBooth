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

        $thumb = $this->photoThumbnailDataUri($photo);
        $card = $this->buildCard($qrContent, 'FOTO', 'Scan untuk melihat foto Anda', $thumb);

        Storage::disk('public')->put($path, $card);

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

        $name = mb_strimwidth($folder->name, 0, 26, '…');
        $card = $this->buildCard($qrContent, 'GALERI', 'Scan untuk membuka galeri folder');

        // Tambahkan nama folder di area thumbnail
        $card = str_replace(
            '<!-- FOLDER_NAME -->',
            '<text x="360" y="292" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="600" fill="#333333">' . htmlspecialchars($name) . '</text>',
            $card
        );

        Storage::disk('public')->put($path, $card);

        return $path;
    }

    /**
     * Ambil URL publik QR code foto.
     */
    public function getPhotoQrUrl(Photo $photo): string
    {
        return '/storage/qr/photos/' . $photo->unique_token . '.svg';
    }

    /**
     * Ambil URL publik QR code folder.
     */
    public function getFolderQrUrl(Folder $folder): string
    {
        return '/storage/qr/folders/' . $folder->unique_token . '.svg';
    }

    /**
     * Baca thumbnail foto sebagai data URI untuk disisipkan di kartu QR.
     */
    private function photoThumbnailDataUri(Photo $photo): ?string
    {
        $path = $photo->thumbnail_path ?? $photo->storage_path;
        if (! $path || ! Storage::disk('public')->exists($path)) {
            return null;
        }

        $data = Storage::disk('public')->get($path);
        $mime = Storage::disk('public')->mimeType($path) ?? 'image/png';

        return 'data:' . $mime . ';base64,' . base64_encode($data);
    }

    /**
     * Bangun kartu SVG profesional: header brand + QR + keterangan.
     */
    private function buildCard(string $qrSvg, string $brand, string $caption, ?string $thumb = null): string
    {
        // Ekstrak isi QR, lalu bungkus ulang dengan posisi/ukuran di kartu
        if (preg_match('/<svg[^>]*>(.*)<\/svg>/s', $qrSvg, $m)) {
            $qrInner = $m[1];
        } else {
            $qrInner = $qrSvg;
        }

        $qr = '<svg xmlns="http://www.w3.org/2000/svg" x="140" y="384" width="440" height="440" viewBox="0 0 300 300">'
            . $qrInner
            . '</svg>';

        $thumbBlock = $thumb
            ? '<image x="280" y="232" width="160" height="160" rx="20" preserveAspectRatio="xMidYMid slice" href="' . $thumb . '"/>'
            : '<!-- FOLDER_NAME -->';

        return '<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1000" viewBox="0 0 720 1000">
  <defs>
    <linearGradient id="pbHeader" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0A0A0A"/>
      <stop offset="1" stop-color="#262626"/>
    </linearGradient>
    <clipPath id="pbCard"><rect width="720" height="1000" rx="28"/></clipPath>
  </defs>
  <g clip-path="url(#pbCard)">
    <rect width="720" height="1000" fill="#FFFFFF"/>
    <rect x="1" y="1" width="718" height="998" rx="27" fill="none" stroke="#E8E8E8" stroke-width="2"/>
    <rect y="0" width="720" height="216" fill="url(#pbHeader)"/>
    <rect y="196" width="720" height="20" fill="url(#pbHeader)"/>
    <text x="360" y="78" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" letter-spacing="6" fill="#8A8A8A">' . htmlspecialchars($brand) . '</text>
    <text x="360" y="128" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="800" letter-spacing="8" fill="#FFFFFF">PIXELBOOTH</text>
    <rect x="300" y="150" width="120" height="3" rx="1.5" fill="#3D3D3D"/>
    ' . $thumbBlock . '
    ' . $qr . '
    <text x="360" y="902" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="#555555">' . htmlspecialchars($caption) . '</text>
    <text x="360" y="940" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" letter-spacing="4" fill="#B0B0B0">PIXELBOOTH</text>
  </g>
</svg>';
    }
}