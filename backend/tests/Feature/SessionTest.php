<?php

namespace Tests\Feature;

use App\Models\Folder;
use App\Models\Template;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SessionTest extends TestCase
{
    use RefreshDatabase;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');

        $user = User::factory()->create(['role' => 'admin']);
        $this->token = $user->createToken('test-token')->plainTextToken;
    }

    private function headers(): array
    {
        return ['Authorization' => "Bearer {$this->token}"];
    }

    private function makeTemplate(int $frames = 3, ?array $frameConfig = null): Template
    {
        // Buat file template image nyata di storage
        $img = imagecreatetruecolor(100, 100);
        $white = imagecolorallocate($img, 200, 200, 200);
        imagefill($img, 0, 0, $white);
        ob_start();
        imagepng($img);
        $pngData = ob_get_clean();
        imagedestroy($img);
        Storage::disk('public')->put('templates/demo.png', $pngData);

        return Template::create([
            'name' => 'Template Demo',
            'slug' => 'template-demo',
            'template_file' => 'templates/demo.png',
            'canvas_width' => 1080,
            'canvas_height' => 1920,
            'frame_count' => $frames,
            'frame_configuration' => $frameConfig ?? [],
            'status' => 'active',
        ]);
    }

    private function base64Png(): string
    {
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    }

    public function test_admin_dapat_membuat_sesi_foto(): void
    {
        $template = $this->makeTemplate();

        $response = $this->postJson('/api/sessions', [
            'template_id' => $template->id,
        ], $this->headers());

        $response->assertStatus(201)
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.current_frame', 1)
            ->assertJsonPath('data.total_frames', 3);
    }

    public function test_sesi_dengan_template_tidak_valid_ditolak(): void
    {
        $this->postJson('/api/sessions', ['template_id' => 999], $this->headers())
            ->assertStatus(422);
    }

    public function test_capture_berjalan_dengan_auto_advance(): void
    {
        $template = $this->makeTemplate(2);

        $session = $this->postJson('/api/sessions', ['template_id' => $template->id], $this->headers())
            ->json('data');

        // Capture frame 1 → otomatis lanjut ke frame 2
        $this->postJson("/api/sessions/{$session['id']}/capture", [
            'image_base64' => $this->base64Png(),
        ], $this->headers())
            ->assertOk()
            ->assertJsonPath('data.session.current_frame', 2)
            ->assertJsonPath('data.all_done', false)
            ->assertJsonPath('data.session.template.id', $template->id);

        // Capture frame 2 → semua frame selesai
        $this->postJson("/api/sessions/{$session['id']}/capture", [
            'image_base64' => $this->base64Png(),
        ], $this->headers())
            ->assertOk()
            ->assertJsonPath('data.all_done', true);
    }

    public function test_retake_mengembalikan_kamera_ke_frame_tertentu(): void
    {
        $template = $this->makeTemplate(3);

        $session = $this->postJson('/api/sessions', ['template_id' => $template->id], $this->headers())
            ->json('data');

        // Capture semua frame (auto-advance)
        for ($i = 1; $i <= 3; $i++) {
            $this->postJson("/api/sessions/{$session['id']}/capture", [
                'image_base64' => $this->base64Png(),
            ], $this->headers())->assertOk();
        }

        // Retake frame 2 → kamera kembali ke frame 2
        $this->postJson("/api/sessions/{$session['id']}/retake", [
            'frame_number' => 2,
        ], $this->headers())
            ->assertOk()
            ->assertJsonPath('data.current_frame', 2);

        // Capture ulang frame 2 → semua frame approved lagi → all_done
        $this->postJson("/api/sessions/{$session['id']}/capture", [
            'image_base64' => $this->base64Png(),
        ], $this->headers())
            ->assertOk()
            ->assertJsonPath('data.all_done', true);
    }

    public function test_complete_menghasilkan_foto_final_dan_qr(): void
    {
        $template = $this->makeTemplate(1);
        $folder = Folder::create(['name' => 'Folder Tes', 'unique_token' => 'folder-token-1']);

        $session = $this->postJson('/api/sessions', [
            'template_id' => $template->id,
            'folder_id' => $folder->id,
        ], $this->headers())->json('data');

        $this->postJson("/api/sessions/{$session['id']}/capture", [
            'image_base64' => $this->base64Png(),
        ], $this->headers())
            ->assertOk()
            ->assertJsonPath('data.all_done', true);

        $response = $this->postJson("/api/sessions/{$session['id']}/complete", [], $this->headers());

        $response->assertOk()
            ->assertJsonPath('data.photo.is_final', true);

        // QR code digenerate
        $this->assertNotNull($response->json('data.photo.qr_path'));

        // File final benar-benar tersimpan (bukan placeholder)
        $storagePath = $response->json('data.photo.storage_path');
        Storage::disk('public')->assertExists($storagePath);
        $this->assertGreaterThan(0, $response->json('data.photo.file_size'));
        $this->assertSame('image/jpeg', $response->json('data.photo.mime_type'));

        // Foto tersimpan ke folder yang dipilih
        $this->assertDatabaseHas('photos', [
            'id' => $response->json('data.photo.id'),
            'folder_id' => $folder->id,
        ]);

        $this->assertDatabaseHas('photo_sessions', [
            'id' => $session['id'],
            'status' => 'complete',
        ]);
    }

    public function test_complete_merender_frame_ke_template(): void
    {
        $template = $this->makeTemplate(3, [
            ['id' => 1, 'x' => 60, 'y' => 150, 'width' => 960, 'height' => 500, 'order' => 1],
            ['id' => 2, 'x' => 60, 'y' => 700, 'width' => 960, 'height' => 500, 'order' => 2],
            ['id' => 3, 'x' => 60, 'y' => 1250, 'width' => 960, 'height' => 500, 'order' => 3],
        ]);

        $session = $this->postJson('/api/sessions', [
            'template_id' => $template->id,
        ], $this->headers())->json('data');

        // Capture semua 3 frame (auto-advance)
        for ($i = 1; $i <= 3; $i++) {
            $this->postJson("/api/sessions/{$session['id']}/capture", [
                'image_base64' => $this->base64Png(),
            ], $this->headers())->assertOk();
        }

        $response = $this->postJson("/api/sessions/{$session['id']}/complete", [], $this->headers());
        $response->assertOk();

        // Verifikasi ukuran file final sesuai dimensi canvas template
        $finalPath = Storage::disk('public')->path($response->json('data.photo.storage_path'));
        $this->assertFileExists($finalPath);

        $info = getimagesize($finalPath);
        $this->assertNotFalse($info);
        $this->assertSame($template->canvas_width, $info[0]);
        $this->assertSame($template->canvas_height, $info[1]);
    }

    public function test_complete_ditolak_jika_frame_belum_lengkap(): void
    {
        $template = $this->makeTemplate(2);

        $session = $this->postJson('/api/sessions', ['template_id' => $template->id], $this->headers())
            ->json('data');

        $this->postJson("/api/sessions/{$session['id']}/complete", [], $this->headers())
            ->assertStatus(422);
    }

    public function test_cancel_menghapus_sesi_dan_file_temporary(): void
    {
        $template = $this->makeTemplate();

        $session = $this->postJson('/api/sessions', ['template_id' => $template->id], $this->headers())
            ->json('data');

        $this->postJson("/api/sessions/{$session['id']}/capture", [
            'image_base64' => $this->base64Png(),
        ], $this->headers())
            ->assertOk();

        $this->postJson("/api/sessions/{$session['id']}/cancel", [], $this->headers())
            ->assertOk();

        $this->assertDatabaseHas('photo_sessions', [
            'id' => $session['id'],
            'status' => 'cancelled',
        ]);
    }
}