<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Folder;
use App\Models\Photo;
use Illuminate\Http\JsonResponse;

class CustomerController extends Controller
{
    /**
     * Halaman foto customer — akses via QR token.
     * Tidak memerlukan autentikasi.
     */
    public function showPhoto(string $token): JsonResponse
    {
        $photo = Photo::where('unique_token', $token)
            ->where('is_final', true)
            ->with(['folder'])
            ->first();

        if (! $photo) {
            return response()->json([
                'message' => 'Foto tidak ditemukan.',
            ], 404);
        }

        return response()->json([
            'data' => [
                'id' => $photo->unique_token,
                'url' => $photo->url,
                'thumbnail_url' => $photo->thumbnail_url,
                'qr_url' => $photo->qr_url,
                'folder' => $photo->folder ? [
                    'name' => $photo->folder->name,
                    'token' => $photo->folder->unique_token,
                ] : null,
                'created_at' => $photo->created_at->toDateString(),
            ],
        ]);
    }

    /**
     * Halaman folder customer — akses via QR token.
     * Menampilkan semua foto final dalam folder.
     */
    public function showFolder(string $token): JsonResponse
    {
        $folder = Folder::where('unique_token', $token)
            ->with(['photos' => function ($q) {
                $q->orderBy('created_at', 'desc');
            }])
            ->first();

        if (! $folder) {
            return response()->json([
                'message' => 'Folder tidak ditemukan.',
            ], 404);
        }

        return response()->json([
            'data' => [
                'id' => $folder->unique_token,
                'name' => $folder->name,
                'qr_url' => $folder->qr_url,
                'photo_count' => $folder->photos->count(),
                'photos' => $folder->photos->map(fn($p) => [
                    'token' => $p->unique_token,
                    'url' => $p->url,
                    'thumbnail_url' => $p->thumbnail_url,
                    'qr_url' => $p->qr_url,
                    'created_at' => $p->created_at->toDateString(),
                ]),
            ],
        ]);
    }

    /**
     * Hapus foto via unique_token (QR Customer).
     */
    public function deletePhoto(string $token): JsonResponse
    {
        $photo = Photo::where('unique_token', $token)->first();

        if (! $photo) {
            return response()->json([
                'message' => 'Foto tidak ditemukan.',
            ], 404);
        }

        \Illuminate\Support\Facades\Storage::disk('public')->delete(array_filter([
            $photo->storage_path,
            $photo->thumbnail_path,
            $photo->qr_path,
        ]));

        $photo->delete();

        return response()->json(['message' => 'Foto berhasil dihapus.']);
    }

    /**
     * Bulk delete foto via token (QR Customer Folder).
     */
    public function bulkDeletePhotos(\Illuminate\Http\Request $request): JsonResponse
    {
        $request->validate([
            'tokens' => ['required', 'array'],
            'tokens.*' => ['string'],
        ]);

        $photos = Photo::whereIn('unique_token', $request->tokens)->get();

        foreach ($photos as $photo) {
            \Illuminate\Support\Facades\Storage::disk('public')->delete(array_filter([
                $photo->storage_path,
                $photo->thumbnail_path,
                $photo->qr_path,
            ]));
            $photo->delete();
        }

        return response()->json(['message' => count($photos) . ' foto berhasil dihapus.']);
    }
}
