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

        $card = $this->buildCard($qrContent, 'FOTO', 'Scan untuk melihat foto Anda');

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
        $card = $this->buildCard($qrContent, 'GALERI', 'Scan untuk membuka galeri folder', $name);

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
     * Bangun kartu SVG profesional: header brand + QR + keterangan.
     */
    private function buildCard(string $qrSvg, string $brand, string $caption, ?string $subtitle = null): string
    {
        // Ekstrak isi QR, lalu bungkus ulang dengan posisi/ukuran di kartu
        if (preg_match('/<svg[^>]*>(.*)<\/svg>/s', $qrSvg, $m)) {
            $qrInner = $m[1];
        } else {
            $qrInner = $qrSvg;
        }

        // QR 520x520 dari sumber 300x300
        $qr = '<svg xmlns="http://www.w3.org/2000/svg" x="100" y="210" width="520" height="520" viewBox="0 0 300 300">'
            . $qrInner
            . '</svg>';

        $subtitleBlock = $subtitle
            ? '<text x="360" y="140" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="500" letter-spacing="1" fill="#C0C0C0">' . htmlspecialchars($subtitle) . '</text>'
            : '<text x="360" y="140" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="500" letter-spacing="1" fill="#C0C0C0">PHOTOBOOTH</text>';

        return '<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960">
  <defs>
    <linearGradient id="pbHeader" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0A0A0A"/>
      <stop offset="1" stop-color="#262626"/>
    </linearGradient>
    <clipPath id="pbCard"><rect width="720" height="960" rx="28"/></clipPath>
  </defs>
  <g clip-path="url(#pbCard)">
    <rect width="720" height="960" fill="#FFFFFF"/>
    <rect x="1" y="1" width="718" height="958" rx="27" fill="none" stroke="#E8E8E8" stroke-width="2"/>
    <rect y="0" width="720" height="176" fill="url(#pbHeader)"/>
    <text x="360" y="74" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" letter-spacing="6" fill="#8A8A8A">' . htmlspecialchars($brand) . '</text>
    <text x="360" y="118" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="800" letter-spacing="8" fill="#FFFFFF">PIXELBOOTH</text>
    ' . $subtitleBlock . '
    ' . $qr . '
    <line x1="240" y1="778" x2="480" y2="778" stroke="#E8E8E8" stroke-width="2"/>
    <text x="360" y="820" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="#555555">' . htmlspecialchars($caption) . '</text>
    <text x="360" y="858" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" letter-spacing="4" fill="#B0B0B0">PIXELBOOTH</text>
  </g>
</svg>';
    }
}