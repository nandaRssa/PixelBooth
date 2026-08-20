<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\FolderController;
use App\Http\Controllers\Api\HardwareController;
use App\Http\Controllers\Api\PhotoController;
use App\Http\Controllers\Api\SessionController;
use App\Http\Controllers\Api\TemplateController;
use App\Http\Controllers\Public\CustomerController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| PixelBooth API Routes
|--------------------------------------------------------------------------
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
// Authentication (public)
// ==========================================
Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login'])->name('auth.login');
});

// ==========================================
// Public Routes — Customer QR Access
// Tidak memerlukan autentikasi
// ==========================================
Route::prefix('public')->group(function () {
    Route::get('/photo/{token}', [CustomerController::class, 'showPhoto'])->name('public.photo');
    Route::get('/folder/{token}', [CustomerController::class, 'showFolder'])->name('public.folder');
});

// ==========================================
// Protected Routes — Butuh login
// ==========================================
Route::middleware('auth:sanctum')->group(function () {

    // Auth
    Route::post('/auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
    Route::get('/auth/me', [AuthController::class, 'me'])->name('auth.me');

    // Templates (semua user bisa lihat, hanya admin yang bisa CRUD)
    Route::get('/templates', [TemplateController::class, 'index'])->name('templates.index');
    Route::get('/templates/{template}', [TemplateController::class, 'show'])->name('templates.show');

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
    Route::post('/sessions/{session}/next-frame', [SessionController::class, 'nextFrame'])->name('sessions.next-frame');
    Route::post('/sessions/{session}/complete', [SessionController::class, 'complete'])->name('sessions.complete');
    Route::post('/sessions/{session}/cancel', [SessionController::class, 'cancel'])->name('sessions.cancel');
    Route::post('/sessions/{session}/set-folder', [SessionController::class, 'setFolder'])->name('sessions.set-folder');

    // Hardware Bridge
    Route::get('/hardware/status', [HardwareController::class, 'status'])->name('hardware.status');
    Route::post('/hardware/capture', [HardwareController::class, 'capture'])->name('hardware.capture');
    Route::get('/hardware/latest-photo', [HardwareController::class, 'latestPhoto'])->name('hardware.latest');

    // ========================================
    // Admin Only Routes
    // ========================================
    Route::middleware('admin')->group(function () {
        Route::post('/templates', [TemplateController::class, 'store'])->name('templates.store');
        Route::put('/templates/{template}', [TemplateController::class, 'update'])->name('templates.update');
        Route::delete('/templates/{template}', [TemplateController::class, 'destroy'])->name('templates.destroy');
    });
});
