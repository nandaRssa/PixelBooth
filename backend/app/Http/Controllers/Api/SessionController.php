<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Photo;
use App\Models\PhotoSession;
use App\Models\SessionCapture;
use App\Models\Template;
use App\Services\PhotoRenderService;
use App\Services\QrCodeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SessionController extends Controller
{
    public function __construct(
        private readonly QrCodeService $qrCodeService,
        private readonly PhotoRenderService $photoRenderService
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

        // Template draft belum dikonfirmasi di Frame Editor — tidak boleh dipakai.
        if ($template->status !== 'active') {
            return response()->json([
                'message' => 'Template belum dikonfigurasi. Selesaikan Frame Editor dan Confirm Template terlebih dahulu.',
            ], 422);
        }

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
        if (! in_array($session->status, ['active', 'complete'], true)) {
            return response()->json([
                'message' => 'Sesi ini sudah tidak aktif.',
            ], 422);
        }

        if ($session->status === 'complete') {
            $session->update(['status' => 'active']);
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
            ->whereIn('status', ['captured', 'approved'])
            ->update(['status' => 'retaken']);

        // Simpan capture baru
        $capture = SessionCapture::create([
            'session_id' => $session->id,
            'frame_number' => $frameNumber,
            'photo_path' => $path,
            'status' => 'captured',
        ]);

        // Approve otomatis: capture langsung sah tanpa tombol "Lanjutkan"
        SessionCapture::where('session_id', $session->id)
            ->where('frame_number', $frameNumber)
            ->where('status', 'captured')
            ->update(['status' => 'approved']);

        // Auto-advance: pindah ke frame berikutnya yang belum difoto.
        // Jika semua frame sudah approved, tandai all_done (menunggu /complete).
        $approvedFrames = SessionCapture::where('session_id', $session->id)
            ->where('status', 'approved')
            ->pluck('frame_number')
            ->all();

        $nextFrame = null;
        for ($i = 1; $i <= $session->total_frames; $i++) {
            if (! in_array($i, $approvedFrames, true)) {
                $nextFrame = $i;
                break;
            }
        }

        if ($nextFrame === null) {
            $session->update(['current_frame' => $session->total_frames]);
            $allDone = true;
        } else {
            $session->update(['current_frame' => $nextFrame]);
            $allDone = false;
        }

        return response()->json([
            'message' => "Frame {$frameNumber} berhasil di-capture.",
            'data' => [
                'capture' => $capture->fresh(),
                'session' => $session->fresh()->load('template', 'folder', 'captures'),
                'all_done' => $allDone,
            ],
        ]);
    }

    /**
     * Pindahkan kamera ke frame tertentu untuk mengambil ulang foto.
     */
    public function retake(Request $request, PhotoSession $session): JsonResponse
    {
        if (! in_array($session->status, ['active', 'complete'], true)) {
            return response()->json(['message' => 'Sesi tidak aktif.'], 422);
        }

        $request->validate([
            'frame_number' => ['required', 'integer', 'min:1', "max:{$session->total_frames}"],
        ]);

        // Re-activate session if it was previously completed
        $session->update([
            'status' => 'active',
            'current_frame' => (int) $request->frame_number,
        ]);

        return response()->json([
            'message' => "Kamera kembali ke frame {$session->current_frame} untuk pengambilan ulang.",
            'data' => $session->fresh()->load('template', 'folder', 'captures'),
        ]);
    }

    /**
     * Ulangi sesi dari awal: reset semua capture dan set current_frame = 1.
     */
    public function restart(PhotoSession $session): JsonResponse
    {
        if (! in_array($session->status, ['active', 'complete'], true)) {
            return response()->json(['message' => 'Sesi tidak aktif.'], 422);
        }

        // Tandai semua capture sebelumnya sebagai retaken
        SessionCapture::where('session_id', $session->id)
            ->whereIn('status', ['captured', 'approved'])
            ->update(['status' => 'retaken']);

        $session->update([
            'status' => 'active',
            'current_frame' => 1,
        ]);

        return response()->json([
            'message' => 'Sesi diulangi dari awal (Frame 1).',
            'data' => $session->fresh()->load('template', 'folder', 'captures'),
        ]);
    }

    /**
     * Selesaikan sesi dan render foto final.
     */
    public function complete(Request $request, PhotoSession $session): JsonResponse
    {
        if (! in_array($session->status, ['active', 'complete'], true)) {
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

        // Render foto final: gabungkan capture frame ke template
        [$finalPath, $fileSize] = $this->photoRenderService->renderFinal($session);
        $thumbnailPath = $this->photoRenderService->renderThumbnail($session, $finalPath);

        // Generate custom filename: PixelBooth-{Event/Folder/Template}-{Number}.jpg
        $scopeName = 'Photo';
        if ($session->folder && !empty($session->folder->name)) {
            $cleanName = preg_replace('/[^A-Za-z0-9]/', '', $session->folder->name);
            $scopeName = !empty($cleanName) ? $cleanName : 'Photo';
        } elseif ($session->template && !empty($session->template->name)) {
            $cleanName = preg_replace('/[^A-Za-z0-9]/', '', $session->template->name);
            $scopeName = !empty($cleanName) ? $cleanName : 'Photo';
        }

        $photoCount = Photo::where('folder_id', $session->folder_id)->where('is_final', true)->count() + 1;
        $formattedFilename = "PixelBooth-{$scopeName}-{$photoCount}.jpg";

        // Update atau buat data Photo final
        $photo = Photo::updateOrCreate(
            ['session_id' => $session->id, 'is_final' => true],
            [
                'folder_id' => $session->folder_id,
                'filename' => $formattedFilename,
                'storage_path' => $finalPath,
                'thumbnail_path' => $thumbnailPath ?: null,
                'is_temporary' => false,
                'file_size' => $fileSize,
                'mime_type' => 'image/jpeg',
            ]
        );

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
            'folder_id' => ['nullable', 'exists:folders,id'],
        ]);

        $session->update(['folder_id' => $request->folder_id]);

        return response()->json([
            'message' => 'Folder tujuan berhasil diatur.',
            'data' => $session->fresh()->load('folder'),
        ]);
    }
}
