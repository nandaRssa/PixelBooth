<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Template;
use App\Services\FrameMaskService;
use App\Services\TemplateFrameDetector;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Storage;

class TemplateController extends Controller
{
    public function __construct(private readonly FrameMaskService $maskService)
    {
    }

    /**
     * Daftar semua template aktif.
     */
    public function index(Request $request): JsonResponse
    {
        $templates = Template::query()
            ->when($request->status, fn($q) => $q->where('status', $request->status))
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['data' => $templates]);
    }

    /**
     * Detail satu template.
     */
    public function show(Template $template): JsonResponse
    {
        return response()->json(['data' => $template]);
    }

    /**
     * Upload template baru. TIDAK ADA deteksi otomatis — frame sepenuhnya
     * ditentukan manual oleh user melalui Frame Editor setelah upload.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'template_file' => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'max:20480'],
            'preview_file' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'canvas_width' => ['required', 'integer', 'min:100'],
            'canvas_height' => ['required', 'integer', 'min:100'],
            'frame_count' => ['nullable', 'integer', 'min:1', 'max:20'],
            'frame_configuration' => ['nullable', 'json'],
        ]);

        $slug = Str::slug($request->name) . '-' . Str::random(6);

        $templatePath = $request->file('template_file')->store("templates/{$slug}", 'public');
        $previewPath = null;

        if ($request->hasFile('preview_file')) {
            $previewPath = $request->file('preview_file')->store("templates/{$slug}/preview", 'public');
        }

        $frameConfig = $this->sanitizeFrames(
            $request->frame_configuration ? json_decode($request->frame_configuration, true) : null
        );

        $template = Template::create([
            'name' => $request->name,
            'slug' => $slug,
            'template_file' => $templatePath,
            'preview_file' => $previewPath,
            'canvas_width' => $request->canvas_width,
            'canvas_height' => $request->canvas_height,
            'frame_count' => max(1, count($frameConfig) ?: (int) $request->input('frame_count', 1)),
            'frame_configuration' => $frameConfig,
            // Template baru = draft: wajib lewat Frame Editor + Confirm Template
            // sebelum siap dipakai Photo Session.
            'status' => 'draft',
        ]);

        return response()->json([
            'message' => 'Template berhasil diunggah. Atur posisi kamera pada Frame Editor.',
            'data' => $template,
        ], 201);
    }

    /**
     * Update konfigurasi frame template (hasil Confirm Template dari editor).
     */
    public function update(Request $request, Template $template): JsonResponse
    {
        $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'frame_configuration' => ['sometimes'],
            'frame_count' => ['sometimes', 'integer', 'min:1', 'max:20'],
            'status' => ['sometimes', 'in:draft,active,inactive'],
        ]);

        $data = $request->only(['name', 'frame_count', 'status']);

        if ($request->has('frame_configuration')) {
            $config = $request->input('frame_configuration');
            $config = is_string($config) ? json_decode($config, true) : $config;
            $config = $this->sanitizeFrames($config);
            $data['frame_configuration'] = $config;
            if (! $request->has('frame_count') && count($config) > 0) {
                $data['frame_count'] = count($config);
            }
        }

        $template->update($data);

        return response()->json([
            'message' => 'Template berhasil diperbarui.',
            'data' => $template->fresh(),
        ]);
    }

    /**
     * Deteksi otomatis area foto pada template (mode Auto Render).
     * Mengembalikan frame hasil deteksi TANPA menyimpan — user masih bisa
     * menilai hasilnya di Frame Editor (bandingkan dengan mode Manual),
     * lalu menyimpan lewat Confirm Template.
     */
    public function detectFrames(Template $template): JsonResponse
    {
        if (! $template->template_file || ! Storage::disk('public')->exists($template->template_file)) {
            return response()->json(['message' => 'File template tidak ditemukan.'], 404);
        }

        $result = (new TemplateFrameDetector())->detect(
            Storage::disk('public')->path($template->template_file),
            $template->canvas_width,
            $template->canvas_height
        );

        $frames = [];
        foreach (($result['frame_configuration'] ?? []) as $i => $slot) {
            $norm = $this->maskService->normalizeFrame($slot);
            $norm['id'] = $i + 1;
            $norm['order'] = $i;
            $frames[] = $norm;
        }

        return response()->json([
            'message' => count($frames) > 0
                ? 'Frames Detected: ' . count($frames) . ' bingkai.'
                : 'Tidak ada area foto yang terdeteksi pada template ini.',
            'data' => [
                'frame_count' => count($frames),
                'frames' => $frames,
            ],
        ]);
    }

    /**
     * Hapus template.
     */
    public function destroy(Template $template): JsonResponse
    {
        if ($template->template_file) {
            Storage::disk('public')->deleteDirectory(dirname($template->template_file));
        }

        $template->delete();

        return response()->json(['message' => 'Template berhasil dihapus.']);
    }

    /**
     * Normalisasi & validasi ringan daftar frame manual dari user.
     * Setiap frame dinormalisasi via FrameMaskService (default lengkap).
     */
    private function sanitizeFrames($frames): array
    {
        if (! is_array($frames)) {
            return [];
        }

        $out = [];
        foreach (array_slice($frames, 0, 20) as $i => $raw) {
            if (! is_array($raw) || ! isset($raw['x'], $raw['y'], $raw['width'], $raw['height'])) {
                continue;
            }
            $norm = $this->maskService->normalizeFrame($raw);
            $norm['id'] = $norm['id'] ?: ($i + 1);
            $norm['order'] = $raw['order'] ?? $i;
            $out[] = $norm;
        }

        usort($out, fn ($a, $b) => $a['order'] <=> $b['order']);

        return array_values($out);
    }
}
