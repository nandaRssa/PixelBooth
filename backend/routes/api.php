<?php

use App\Http\Controllers\Api\FolderController;
use App\Http\Controllers\Api\HardwareController;
use App\Http\Controllers\Api\PhotoController;
use App\Http\Controllers\Api\QrController;
use App\Http\Controllers\Api\SessionController;
use App\Http\Controllers\Api\TemplateController;
use App\Http\Controllers\Public\CustomerController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| PixelBooth API Routes
|--------------------------------------------------------------------------
|
| Fitur login dihapus sesuai kebutuhan operasional kios iPad.
| Semua endpoint dapat diakses tanpa autentikasi.
| Rate limiting tetap aktif untuk mencegah penyalahgunaan.
*/

// ==========================================
// Health Check
// ==========================================
Route::get('/health', fn() => response()->json([
    'status' => 'ok',
    'app' => config('app.name'),
    'version' => '1.0.0',
    'timestamp' => now()->toIso8601String(),
]));

// ==========================================
// Public Routes — Customer QR Access
// ==========================================
Route::prefix('public')->middleware('throttle:60,1')->group(function () {
    Route::get('/photo/{token}', [CustomerController::class, 'showPhoto'])->name('public.photo');
    Route::get('/folder/{token}', [CustomerController::class, 'showFolder'])->name('public.folder');
});

// ==========================================
// Public QR Info — detail QR untuk foto/folder
// ==========================================
Route::prefix('qr')->middleware('throttle:60,1')->group(function () {
    Route::get('/photo/{token}', [QrController::class, 'photoQr'])->name('qr.photo');
    Route::get('/folder/{token}', [QrController::class, 'folderQr'])->name('qr.folder');
});

// ==========================================
// Core Routes — Tanpa autentikasi
// Rate limit diterapkan untuk keamanan dasar
// ==========================================
Route::middleware('throttle:120,1')->group(function () {

    // Templates
    Route::get('/templates', [TemplateController::class, 'index'])->name('templates.index');
    Route::get('/templates/{template}', [TemplateController::class, 'show'])->name('templates.show');
    Route::post('/templates', [TemplateController::class, 'store'])->name('templates.store');
    Route::put('/templates/{template}', [TemplateController::class, 'update'])->name('templates.update');
    Route::post('/templates/{template}/detect-frames', [TemplateController::class, 'detectFrames'])->name('templates.detectFrames');
    Route::delete('/templates/{template}', [TemplateController::class, 'destroy'])->name('templates.destroy');

    // Folders
    Route::get('/folders', [FolderController::class, 'index'])->name('folders.index');
    Route::get('/folders/{folder}', [FolderController::class, 'show'])->name('folders.show');
    Route::post('/folders', [FolderController::class, 'store'])->name('folders.store');
    Route::put('/folders/{folder}', [FolderController::class, 'update'])->name('folders.update');
    Route::delete('/folders/{folder}', [FolderController::class, 'destroy'])->name('folders.destroy');

    // Photos
    Route::get('/photos', [PhotoController::class, 'index'])->name('photos.index');
    Route::get('/photos/{photo}', [PhotoController::class, 'show'])->name('photos.show');
    Route::delete('/photos/{photo}', [PhotoController::class, 'destroy'])->name('photos.destroy');
    Route::post('/photos/{photo}/move', [PhotoController::class, 'move'])->name('photos.move');
    Route::post('/photos/bulk-delete', [PhotoController::class, 'bulkDelete'])->name('photos.bulk-delete');
    Route::post('/photos/bulk-move', [PhotoController::class, 'bulkMove'])->name('photos.bulk-move');

    // Photo Sessions
    Route::post('/sessions', [SessionController::class, 'store'])->name('sessions.store');
    Route::get('/sessions/{session}', [SessionController::class, 'show'])->name('sessions.show');
    Route::post('/sessions/{session}/capture', [SessionController::class, 'capture'])->name('sessions.capture');
    Route::post('/sessions/{session}/retake', [SessionController::class, 'retake'])->name('sessions.retake');
    Route::post('/sessions/{session}/restart', [SessionController::class, 'restart'])->name('sessions.restart');
    Route::post('/sessions/{session}/complete', [SessionController::class, 'complete'])->name('sessions.complete');
    Route::post('/sessions/{session}/cancel', [SessionController::class, 'cancel'])->name('sessions.cancel');
    Route::post('/sessions/{session}/set-folder', [SessionController::class, 'setFolder'])->name('sessions.set-folder');

    // Hardware Bridge
    Route::get('/hardware/status', [HardwareController::class, 'status'])->name('hardware.status');
    Route::post('/hardware/capture', [HardwareController::class, 'capture'])->name('hardware.capture');
    Route::get('/hardware/latest-photo', [HardwareController::class, 'latestPhoto'])->name('hardware.latest');
});