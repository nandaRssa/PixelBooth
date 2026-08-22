<?php

namespace App\Console\Commands;

use App\Models\Folder;
use App\Models\Photo;
use App\Services\QrCodeService;
use Illuminate\Console\Command;

class RegenerateQrCodes extends Command
{
    /**
     * Regenerasi semua QR code foto & folder dengan FRONTEND_URL saat ini.
     * QR lama yang dibuat sebelum FRONTEND_URL diubah (mis. masih localhost)
     * akan ditimpa dengan URL yang benar.
     */
    protected $signature = 'qr:regenerate';

    protected $description = 'Regenerasi semua QR code (foto & folder) dengan FRONTEND_URL aktif';

    public function handle(QrCodeService $qr): int
    {
        $photoCount = 0;
        Photo::chunkById(100, function ($photos) use ($qr, &$photoCount) {
            foreach ($photos as $photo) {
                $qr->generatePhotoQr($photo);
                $photoCount++;
            }
        });

        $folderCount = 0;
        Folder::chunkById(100, function ($folders) use ($qr, &$folderCount) {
            foreach ($folders as $folder) {
                $qr->generateFolderQr($folder);
                $folderCount++;
            }
        });

        $this->info("QR foto diregenerasi: {$photoCount}");
        $this->info("QR folder diregenerasi: {$folderCount}");
        $this->info('FRONTEND_URL: ' . rtrim(config('app.frontend_url'), '/'));

        return self::SUCCESS;
    }
}
