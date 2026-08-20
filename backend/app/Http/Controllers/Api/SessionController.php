<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Photo;
use App\Models\PhotoSession;
use App\Models\SessionCapture;
use App\Models\Template;
use App\Services\QrCodeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SessionController extends Controller
{
    public function __construct(
        private readonly QrCodeService $qrCodeService
    ) {}

    /**
     * Buat sesi foto baru.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'template_id' => ['required', 'exists:templates,id'],
            'folder_id' => ['nullable', 'exists:folders,id'],
        ]);

        $template = Template::findOrFail($request->template_id);

        $session = PhotoSession::create([
            'template_id' => $template->id,
            'folder_id' => $request->folder_id,
            'status' => 'active',
            'current_frame' => 1,
            'total_frames' => $template->frame_count,
        ]);

        return response()->json([
            'message' => 'Sesi foto dimulai.',
            'data' => $session->load('template', 'folder'),
        ], 201);
    }

    /**
     * Detail sesi foto.
     */
    public function show(PhotoSession $session): JsonResponse
    {
        return response()->json([
            'data' => $session->load('template', 'folder', 'captures', 'finalPhoto'),
        ]);
    }

    /**
     * Simpan capture dari kamera untuk frame aktif.
     * File bisa dari webcam (base64) atau hardware bridge (file upload).
     */
    public function capture(Request $request, PhotoSession $session): JsonResponse
    {
        if ($session->status !== 'active') {
            return response()->json([
                'message' => 'Sesi ini sudah tidak aktif.',
            ], 422);
        }

        $request->validate([
            'image' => ['required_without:image_base64', 'file', 'mimes:jpg,jpeg,png,webp', 'max:20480'],
            'image_base64' => ['required_without:image', 'string'],
        ]);

        $frameNumber = $session->current_frame;
        $storagePath = "sessions/{$session->session_token}/frame-{$frameNumber}";

        // Handle file upload atau base64
        if ($request->hasFile('image')) {
            $path = $request->file('image')->store($storagePath, 'public');
        } else {
            // Decode base64 image dari webcam
            $imageData = base64_decode(preg_replace('#^data:image/\w+;base64,#i', '', $request->image_base64));
            $filename = "frame-{$frameNumber}-" . time() . ".jpg";
            Storage::disk('public')->put("{$storagePath}/{$filename}", $imageData);
            $path = "{$storagePath}/{$filename}";
        }

        // Tandai retake capture sebelumnya jika ada
        SessionCapture::where('session_id', $session->id)
            ->where('frame_number', $frameNumber)
            ->where('status', 'captured')
            ->update(['status' => 'retaken']);

        // Simpan capture baru
        $capture = SessionCapture::create([
            'session_id' => $session->id,
            'frame_number' => $frameNumber,
            'photo_path' => $path,
            'status' => 'captured',
        ]);

        return response()->json([
            'message' => "Frame {$frameNumber} berhasil di-capture.",
            'data' => [
                'capture' => $capture,
                'session' => $session->fresh(),
            ],
        ]);
    }

    /**
     * Approve capture frame aktif dan lanjut ke frame berikutnya.
     */
    public function nextFrame(Request $request, PhotoSession $session): JsonResponse
    {
        if ($session->status !== 'active') {
            return response()->json(['message' => 'Sesi tidak aktif.'], 422);
        }

        // Approve capture frame saat ini
        SessionCapture::where('session_id', $session->id)
            ->where('frame_number', $session->current_frame)
            ->where('status', 'captured')
            ->update(['status' => 'approved']);

        if ($session->current_frame >= $session->total_frames) {
            // Semua frame selesai — tunggu complete()
            return response()->json([
                'message' => 'Semua frame selesai. Panggil /complete untuk mengakhiri sesi.',
                'data' => $session->fresh()->load('captures'),
                'all_done' => true,
            ]);
        }

        // Lanjut ke frame berikutnya
        $session->increment('current_frame');

        return response()->json([
            'message' => "Lanjut ke frame {$session->current_frame}.",
            'data' => $session->fresh()->load('captures'),
            'all_done' => false,
        ]);
    }

    /**
     * Selesaikan sesi dan render foto final.
     */
    public function complete(Request $request, PhotoSession $session): JsonResponse
    {
        if ($session->status !== 'active') {
            return response()->json(['message' => 'Sesi tidak aktif.'], 422);
        }

        if (! $session->isAllFramesCaptured()) {
            return response()->json([
                'message' => 'Belum semua frame di-capture dan di-approve.',
            ], 422);
        }

        // Update status sesi
        $session->update([
            'status' => 'complete',
            'completed_at' => now(),
        ]);

        // TODO Phase 4: Render template + captures menjadi foto final
        // Untuk Phase 1, simpan placeholder final photo
        $photo = Photo::create([
            'session_id' => $session->id,
            'folder_id' => $session->folder_id,
            'filename' => "final-{$session->session_token}.jpg",
            'storage_path' => "sessions/{$session->session_token}/final.jpg",
            'is_final' => true,
            'is_temporary' => false,
            'file_size' => 0,
            'mime_type' => 'image/jpeg',
        ]);

        // Generate QR untuk foto final
        $qrPath = $this->qrCodeService->generatePhotoQr($photo);
        $photo->update(['qr_path' => $qrPath]);

        return response()->json([
            'message' => 'Sesi selesai. Foto berhasil disimpan.',
            'data' => [
                'session' => $session->fresh()->load('template', 'folder'),
                'photo' => $photo->fresh(),
            ],
        ]);
    }

    /**
     * Batalkan sesi dan hapus file temporary.
     */
    public function cancel(PhotoSession $session): JsonResponse
    {
        if ($session->status !== 'active') {
            return response()->json(['message' => 'Sesi tidak aktif.'], 422);
        }

        // Hapus semua file temporary
        $sessionDir = "sessions/{$session->session_token}";
        Storage::disk('public')->deleteDirectory($sessionDir);

        $session->update(['status' => 'cancelled']);

        return response()->json(['message' => 'Sesi dibatalkan dan file temporary telah dihapus.']);
    }

    /**
     * Set folder tujuan untuk sesi.
     */
    public function setFolder(Request $request, PhotoSession $session): JsonResponse
    {
        $request->validate([
            'folder_id' => ['required', 'exists:folders,id'],
        ]);

        $session->update(['folder_id' => $request->folder_id]);

        return response()->json([
            'message' => 'Folder tujuan berhasil diatur.',
            'data' => $session->fresh()->load('folder'),
        ]);
    }
}
