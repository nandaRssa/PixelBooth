<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Folder;
use App\Services\QrCodeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
     * Hapus folder beserta semua isinya.
     */
    public function destroy(Folder $folder): JsonResponse
    {
        // Tidak izinkan hapus folder yang ada sub-folder
        if ($folder->children()->exists()) {
            return response()->json([
                'message' => 'Folder tidak dapat dihapus karena memiliki sub-folder. Hapus sub-folder terlebih dahulu.',
            ], 422);
        }

        $folder->delete();

        return response()->json(['message' => 'Folder berhasil dihapus.']);
    }
}
