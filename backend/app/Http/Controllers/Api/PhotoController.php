<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Photo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PhotoController extends Controller
{
    /**
     * Daftar foto final dengan filter opsional per folder.
     */
    public function index(Request $request): JsonResponse
    {
        $photos = Photo::final()
            ->when($request->folder_id, fn($q) => $q->where('folder_id', $request->folder_id))
            ->with(['folder'])
            ->orderBy('created_at', 'desc')
            ->paginate(24);

        return response()->json($photos);
    }

    /**
     * Detail foto.
     */
    public function show(Photo $photo): JsonResponse
    {
        return response()->json(['data' => $photo->load('folder', 'session')]);
    }

    /**
     * Hapus foto dari galeri.
     */
    public function destroy(Photo $photo): JsonResponse
    {
        // Hapus file dari storage
        \Illuminate\Support\Facades\Storage::disk('public')->delete(array_filter([
            $photo->storage_path,
            $photo->thumbnail_path,
            $photo->qr_path,
        ]));

        $photo->delete();

        return response()->json(['message' => 'Foto berhasil dihapus.']);
    }

    /**
     * Pindahkan foto ke folder lain.
     * QR token tidak berubah — link tetap valid.
     */
    public function move(Request $request, Photo $photo): JsonResponse
    {
        $request->validate([
            'folder_id' => ['required', 'exists:folders,id'],
        ]);

        $photo->update(['folder_id' => $request->folder_id]);

        return response()->json([
            'message' => 'Foto berhasil dipindahkan.',
            'data' => $photo->fresh()->load('folder'),
        ]);
    }

    /**
     * Bulk delete foto.
     */
    public function bulkDelete(Request $request): JsonResponse
    {
        $request->validate([
            'photo_ids' => ['required', 'array'],
            'photo_ids.*' => ['integer', 'exists:photos,id'],
        ]);

        $photos = Photo::whereIn('id', $request->photo_ids)->get();

        foreach ($photos as $photo) {
            \Illuminate\Support\Facades\Storage::disk('public')->delete(array_filter([
                $photo->storage_path,
                $photo->thumbnail_path,
                $photo->qr_path,
            ]));
            $photo->delete();
        }

        return response()->json([
            'message' => count($request->photo_ids) . ' foto berhasil dihapus.',
        ]);
    }

    /**
     * Bulk move foto ke folder.
     */
    public function bulkMove(Request $request): JsonResponse
    {
        $request->validate([
            'photo_ids' => ['required', 'array'],
            'photo_ids.*' => ['integer', 'exists:photos,id'],
            'folder_id' => ['required', 'exists:folders,id'],
        ]);

        Photo::whereIn('id', $request->photo_ids)->update([
            'folder_id' => $request->folder_id,
        ]);

        return response()->json([
            'message' => count($request->photo_ids) . ' foto berhasil dipindahkan.',
        ]);
    }
}
