<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Folder;
use App\Models\Photo;
use Illuminate\Http\JsonResponse;

class QrController extends Controller
{
    /**
     * Info QR code untuk satu foto (token-based).
     */
    public function photoQr(string $token): JsonResponse
    {
        $photo = Photo::where('unique_token', $token)
            ->where('is_final', true)
            ->first();

        if (! $photo) {
            return response()->json([
                'message' => 'Foto tidak ditemukan.',
            ], 404);
        }

        return response()->json([
            'data' => [
                'token' => $photo->unique_token,
                'url' => $photo->url,
                'qr_url' => $photo->qr_url,
                'public_url' => config('app.frontend_url') . "/photo/{$photo->unique_token}",
            ],
        ]);
    }

    /**
     * Info QR code untuk satu folder (token-based).
     */
    public function folderQr(string $token): JsonResponse
    {
        $folder = Folder::where('unique_token', $token)->first();

        if (! $folder) {
            return response()->json([
                'message' => 'Folder tidak ditemukan.',
            ], 404);
        }

        return response()->json([
            'data' => [
                'token' => $folder->unique_token,
                'qr_url' => $folder->qr_url,
                'public_url' => config('app.frontend_url') . "/folder/{$folder->unique_token}",
            ],
        ]);
    }
}