<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Template;
use App\Services\TemplateFrameDetector;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Storage;

class TemplateController extends Controller
{
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
     * Upload template baru.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'template_file' => ['required', 'file', 'mimes:jpg,jpeg,png,webp', 'max:20480'],
            'preview_file' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'canvas_width' => ['required', 'integer', 'min:100'],
            'canvas_height' => ['required', 'integer', 'min:100'],
            'frame_count' => ['required', 'integer', 'min:1', 'max:10'],
            'frame_configuration' => ['nullable', 'json'],
        ]);

        $slug = Str::slug($request->name) . '-' . Str::random(6);

        $templatePath = $request->file('template_file')->store("templates/{$slug}", 'public');
        $previewPath = null;

        if ($request->hasFile('preview_file')) {
            $previewPath = $request->file('preview_file')->store("templates/{$slug}/preview", 'public');
        }

        $frameConfig = $request->frame_configuration
            ? json_decode($request->frame_configuration, true)
            : null;

        // Deteksi otomatis bingkai bila konfigurasi tidak diberikan manual
        $detected = null;
        if (! is_array($frameConfig) || count($frameConfig) === 0) {
            $detector = new TemplateFrameDetector();
            $detected = $detector->detect(
                Storage::disk('public')->path($templatePath),
                (int) $request->canvas_width,
                (int) $request->canvas_height
            );
        }

        $template = Template::create([
            'name' => $request->name,
            'slug' => $slug,
            'template_file' => $templatePath,
            'preview_file' => $previewPath,
            'canvas_width' => $request->canvas_width,
            'canvas_height' => $request->canvas_height,
            'frame_count' => $detected['frame_count'] ?? $request->frame_count,
            'frame_configuration' => $detected['frame_configuration'] ?? $frameConfig,
            'status' => 'active',
        ]);

        return response()->json([
            'message' => $detected
                ? "Template berhasil diunggah. {$detected['frame_count']} bingkai terdeteksi otomatis."
                : 'Template berhasil diunggah.',
            'data' => $template,
        ], 201);
    }

    /**
     * Deteksi ulang bingkai pada template yang sudah ada.
     */
    public function detectFrames(Template $template): JsonResponse
    {
        if (! $template->template_file || ! Storage::disk('public')->exists($template->template_file)) {
            return response()->json([
                'message' => 'File template tidak ditemukan.',
            ], 404);
        }

        $detector = new TemplateFrameDetector();
        $detected = $detector->detect(
            Storage::disk('public')->path($template->template_file),
            $template->canvas_width,
            $template->canvas_height
        );

        if (! $detected) {
            return response()->json([
                'message' => 'Tidak ada bingkai foto yang terdeteksi pada template ini.',
                'data' => $template->fresh(),
            ]);
        }

        $template->update([
            'frame_count' => $detected['frame_count'],
            'frame_configuration' => $detected['frame_configuration'],
        ]);

        return response()->json([
            'message' => "Deteksi selesai: {$detected['frame_count']} bingkai ditemukan.",
            'data' => $template->fresh(),
        ]);
    }

    /**
     * Update konfigurasi frame template.
     */
    public function update(Request $request, Template $template): JsonResponse
    {
        $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'frame_configuration' => ['sometimes'],
            'frame_count' => ['sometimes', 'integer', 'min:1', 'max:10'],
            'status' => ['sometimes', 'in:active,inactive'],
        ]);

        $data = $request->only(['name', 'frame_count', 'status']);

        // frame_configuration bisa dikirim sebagai array atau JSON string
        if ($request->has('frame_configuration')) {
            $config = $request->input('frame_configuration');
            $data['frame_configuration'] = is_string($config)
                ? json_decode($config, true)
                : $config;
        }

        $template->update($data);

        return response()->json([
            'message' => 'Template berhasil diperbarui.',
            'data' => $template->fresh(),
        ]);
    }

    /**
     * Hapus template.
     */
    public function destroy(Template $template): JsonResponse
    {
        // Hapus file template dari storage
        if ($template->template_file) {
            Storage::disk('public')->deleteDirectory(dirname($template->template_file));
        }

        $template->delete();

        return response()->json(['message' => 'Template berhasil dihapus.']);
    }
}
