<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Folder;
use App\Models\Photo;
use App\Services\QrCodeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class FolderController extends Controller
{
    public function __construct(
        private readonly QrCodeService $qrCodeService
    ) {}

    /**
     * Daftar semua folder (root level atau berdasarkan parent).
     */
    public function index(Request $request): JsonResponse
    {
        $folders = Folder::query()
            ->when(
                $request->parent_id,
                fn($q) => $q->where('parent_folder_id', $request->parent_id),
                fn($q) => $q->whereNull('parent_folder_id')
            )
            ->with(['children'])
            ->withCount(['photos'])
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $folders]);
    }

    /**
     * Detail folder beserta foto di dalamnya.
     */
    public function show(Folder $folder): JsonResponse
    {
        $folder->load(['photos', 'children']);

        return response()->json(['data' => $folder]);
    }

    /**
     * Buat folder baru dan generate QR code-nya.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'parent_folder_id' => ['nullable', 'exists:folders,id'],
        ]);

        $folder = Folder::create([
            'name' => $request->name,
            'parent_folder_id' => $request->parent_folder_id,
        ]);

        // Generate QR code untuk folder ini
        $qrPath = $this->qrCodeService->generateFolderQr($folder);
        $folder->update(['qr_path' => $qrPath]);

        return response()->json([
            'message' => 'Folder berhasil dibuat.',
            'data' => $folder->fresh(),
        ], 201);
    }

    /**
     * Rename folder.
     */
    public function update(Request $request, Folder $folder): JsonResponse
    {
        $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $folder->update(['name' => $request->name]);

        return response()->json([
            'message' => 'Folder berhasil diperbarui.',
            'data' => $folder->fresh(),
        ]);
    }

    /**
     * Hapus folder beserta semua foto di dalamnya.
     */
    public function destroy(Folder $folder): JsonResponse
    {
        // Tidak izinkan hapus folder yang ada sub-folder
        if ($folder->children()->exists()) {
            return response()->json([
                'message' => 'Folder tidak dapat dihapus karena memiliki sub-folder. Hapus sub-folder terlebih dahulu.',
            ], 422);
        }

        // Kumpulkan file foto di dalam folder ini
        $photos = Photo::where('folder_id', $folder->id)->get();
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

        $filesToDelete[] = $folder->qr_path;

        // Hapus file secara asinkron di background
        \App\Services\CloudStorageService::deleteAsync(array_filter($filesToDelete));

        $folder->delete();

        return response()->json([
            'message' => 'Folder beserta isinya berhasil dihapus.',
        ]);
    }

    /**
     * Bulk delete folder.
     */
    public function bulkDelete(Request $request): JsonResponse
    {
        $request->validate([
            'folder_ids' => ['required', 'array'],
            'folder_ids.*' => ['integer', 'exists:folders,id'],
        ]);

        $folders = Folder::whereIn('id', $request->folder_ids)->get();
        $filesToDelete = [];
        $sessionIds = [];

        foreach ($folders as $folder) {
            $photos = Photo::where('folder_id', $folder->id)->get();
            foreach ($photos as $photo) {
                $filesToDelete[] = $photo->storage_path;
                $filesToDelete[] = $photo->thumbnail_path;
                $filesToDelete[] = $photo->qr_path;
                if ($photo->session_id) {
                    $sessionIds[] = $photo->session_id;
                }
                $photo->delete();
            }
            $filesToDelete[] = $folder->qr_path;
            $folder->delete();
        }

        if (!empty($sessionIds)) {
            $captures = \App\Models\SessionCapture::whereIn('session_id', array_unique($sessionIds))->pluck('photo_path')->filter()->all();
            $filesToDelete = array_merge($filesToDelete, $captures);
        }

        \App\Services\CloudStorageService::deleteAsync(array_filter($filesToDelete));

        return response()->json([
            'message' => count($request->folder_ids) . ' folder berhasil dihapus.',
        ]);
    }

    /**
     * Bulk move folder (ubah parent folder).
     */
    public function bulkMove(Request $request): JsonResponse
    {
        $request->validate([
            'folder_ids' => ['required', 'array'],
            'folder_ids.*' => ['integer', 'exists:folders,id'],
            'parent_folder_id' => ['nullable', 'integer', 'exists:folders,id'],
        ]);

        $targetParentId = $request->parent_folder_id;
        if ($targetParentId && in_array($targetParentId, $request->folder_ids)) {
            return response()->json([
                'message' => 'Folder tujuan tidak valid.',
            ], 422);
        }

        Folder::whereIn('id', $request->folder_ids)->update([
            'parent_folder_id' => $targetParentId,
        ]);

        return response()->json([
            'message' => count($request->folder_ids) . ' folder berhasil dipindahkan.',
        ]);
    }
}
