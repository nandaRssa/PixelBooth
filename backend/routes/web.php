<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json(['status' => 'ok', 'app' => config('app.name')]);
});

Route::get('/debug-route', function (\Illuminate\Http\Request $request) {
    return response()->json([
        'uri' => $request->getRequestUri(),
        'path' => $request->path(),
        'fullUrl' => $request->fullUrl(),
        'server_request_uri' => $_SERVER['REQUEST_URI'] ?? null,
        'server_path_info' => $_SERVER['PATH_INFO'] ?? null,
        'server_script_name' => $_SERVER['SCRIPT_NAME'] ?? null,
        'server_php_self' => $_SERVER['PHP_SELF'] ?? null,
    ]);
});

// Explicit API route group for serverless environments (Vercel)
Route::prefix('api')->group(base_path('routes/api.php'));

Route::get('/storage/{path}', function ($path) {
    $fullPath = storage_path('app/public/' . $path);
    if (! file_exists($fullPath)) {
        abort(404);
    }
    $mime = mime_content_type($fullPath) ?: 'image/png';
    return response()->file($fullPath, [
        'Access-Control-Allow-Origin' => '*',
        'Access-Control-Allow-Methods' => 'GET, OPTIONS',
        'Access-Control-Allow-Headers' => '*',
        'Content-Type' => $mime,
        'Cache-Control' => 'public, max-age=86400',
    ]);
})->where('path', '.*');
