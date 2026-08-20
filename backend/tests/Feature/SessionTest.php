<?php

namespace Tests\Feature;

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

    private function makeTemplate(int $frames = 3): Template
    {
        return Template::create([
            'name' => 'Template Demo',
            'slug' => 'template-demo',
            'template_file' => 'templates/demo.png',
            'canvas_width' => 1080,
            'canvas_height' => 1920,
            'frame_count' => $frames,
            'frame_configuration' => [],
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

    public function test_capture_dan_next_frame_berjalan(): void
    {
        $template = $this->makeTemplate(2);

        $session = $this->postJson('/api/sessions', ['template_id' => $template->id], $this->headers())
            ->json('data');

        // Capture frame 1
        $this->postJson("/api/sessions/{$session['id']}/capture", [
            'image_base64' => $this->base64Png(),
        ], $this->headers())
            ->assertOk();

        // Lanjut ke frame 2
        $this->postJson("/api/sessions/{$session['id']}/next-frame", [], $this->headers())
            ->assertOk()
            ->assertJsonPath('data.current_frame', 2);

        // Capture frame 2
        $this->postJson("/api/sessions/{$session['id']}/capture", [
            'image_base64' => $this->base64Png(),
        ], $this->headers())
            ->assertOk();

        // Next-frame terakhir → all_done
        $this->postJson("/api/sessions/{$session['id']}/next-frame", [], $this->headers())
            ->assertOk()
            ->assertJsonPath('all_done', true);
    }

    public function test_complete_menghasilkan_foto_final_dan_qr(): void
    {
        $template = $this->makeTemplate(1);

        $session = $this->postJson('/api/sessions', ['template_id' => $template->id], $this->headers())
            ->json('data');

        $this->postJson("/api/sessions/{$session['id']}/capture", [
            'image_base64' => $this->base64Png(),
        ], $this->headers())
            ->assertOk();

        $this->postJson("/api/sessions/{$session['id']}/next-frame", [], $this->headers())
            ->assertOk()
            ->assertJsonPath('all_done', true);

        $response = $this->postJson("/api/sessions/{$session['id']}/complete", [], $this->headers());

        $response->assertOk()
            ->assertJsonPath('data.photo.is_final', true);

        $this->assertNotNull($response->json('data.photo.qr_path'));

        $this->assertDatabaseHas('photo_sessions', [
            'id' => $session['id'],
            'status' => 'complete',
        ]);
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