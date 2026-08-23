<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

$app = Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // CORS untuk akses dari frontend Vite
        $middleware->statefulApi();

        // Tambahkan header CORS global untuk API
        $middleware->api(append: [
            \Illuminate\Http\Middleware\HandleCors::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Handler exception untuk API — selalu return JSON
        $exceptions->render(function (\Illuminate\Auth\AuthenticationException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json([
                    'message' => 'Tidak terautentikasi. Silakan login terlebih dahulu.',
                ], 401);
            }
        });

        $exceptions->render(function (\Illuminate\Validation\ValidationException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json([
                    'message' => 'Data tidak valid.',
                    'errors' => $e->errors(),
                ], 422);
            }
        });

        $exceptions->render(function (\Symfony\Component\HttpKernel\Exception\NotFoundHttpException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json([
                    'message' => 'Resource tidak ditemukan.',
                ], 404);
            }
        });
    })->create();

// Arahkan storage path ke /tmp/storage saat berjalan di Vercel (read-only environment)
if (env('APP_STORAGE_PATH')) {
    $app->useStoragePath(env('APP_STORAGE_PATH'));
} elseif (isset($_SERVER['VERCEL']) || isset($_ENV['VERCEL']) || (is_dir('/tmp') && !@is_writable(dirname(__DIR__).'/storage'))) {
    $app->useStoragePath('/tmp/storage');
}

return $app;
