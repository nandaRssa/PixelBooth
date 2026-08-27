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
            ->when($request->boolean('uncategorized'), fn($q) => $q->whereNull('folder_id'))
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
        // Kumpulkan file yang perlu dihapus (foto final, thumbnail, QR, & session captures jika ada)
        $filesToDelete = array_filter([
            $photo->storage_path,
            $photo->thumbnail_path,
            $photo->qr_path,
        ]);

        if ($photo->session_id) {
            $captures = \App\Models\SessionCapture::where('session_id', $photo->session_id)->pluck('photo_path')->filter()->all();
            $filesToDelete = array_merge($filesToDelete, $captures);
        }

        // Hapus file secara asinkron di background
        \App\Services\CloudStorageService::deleteAsync($filesToDelete);

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
            'folder_id' => ['nullable', 'integer', 'exists:folders,id'],
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
        $filesToDelete = [];
        $sessionIds = [];

        foreach ($photos as $photo) {
            $filesToDelete[] = $photo->storage_path;
            $filesToDelete[] = $photo->thumbnail_path;
            $filesToDelete[] = $photo->qr_path;
            if ($photo->session_id) {
                $sessionIds[] = $photo->session_id;
            }
            $photo->delete();
        }

        if (!empty($sessionIds)) {
            $captures = \App\Models\SessionCapture::whereIn('session_id', array_unique($sessionIds))->pluck('photo_path')->filter()->all();
            $filesToDelete = array_merge($filesToDelete, $captures);
        }

        \App\Services\CloudStorageService::deleteAsync(array_filter($filesToDelete));

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
            'folder_id' => ['nullable', 'integer', 'exists:folders,id'],
        ]);

        Photo::whereIn('id', $request->photo_ids)->update([
            'folder_id' => $request->folder_id,
        ]);

        return response()->json([
            'message' => count($request->photo_ids) . ' foto berhasil dipindahkan.',
        ]);
    }
}
