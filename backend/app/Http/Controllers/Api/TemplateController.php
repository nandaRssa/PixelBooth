<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Template;
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

        $template = Template::create([
            'name' => $request->name,
            'slug' => $slug,
            'template_file' => $templatePath,
            'preview_file' => $previewPath,
            'canvas_width' => $request->canvas_width,
            'canvas_height' => $request->canvas_height,
            'frame_count' => $request->frame_count,
            'frame_configuration' => $frameConfig,
            'status' => 'active',
        ]);

        return response()->json([
            'message' => 'Template berhasil diunggah.',
            'data' => $template,
        ], 201);
    }

    /**
     * Update konfigurasi frame template.
     */
    public function update(Request $request, Template $template): JsonResponse
    {
        $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'frame_configuration' => ['sometimes', 'array'],
            'frame_count' => ['sometimes', 'integer', 'min:1', 'max:10'],
            'status' => ['sometimes', 'in:active,inactive'],
        ]);

        $template->update($request->only(['name', 'frame_configuration', 'frame_count', 'status']));

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
