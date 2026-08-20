<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AdminGuardTest extends TestCase
{
    use RefreshDatabase;

    public function test_hanya_admin_yang_bisa_upload_template(): void
    {
        Storage::fake('public');

        $customer = User::factory()->create(['role' => 'customer']);
        $token = $customer->createToken('test-token')->plainTextToken;

        $response = $this->postJson('/api/templates', [
            'name' => 'Template Rahasia',
            'template_file' => UploadedFile::fake()->image('template.png'),
            'canvas_width' => 1080,
            'canvas_height' => 1920,
            'frame_count' => 1,
        ], [
            'Authorization' => "Bearer {$token}",
        ]);

        $response->assertStatus(403);
    }

    public function test_admin_bisa_upload_template(): void
    {
        Storage::fake('public');

        $admin = User::factory()->create(['role' => 'admin']);
        $token = $admin->createToken('test-token')->plainTextToken;

        $response = $this->postJson('/api/templates', [
            'name' => 'Template Baru',
            'template_file' => UploadedFile::fake()->image('template.png'),
            'canvas_width' => 1080,
            'canvas_height' => 1920,
            'frame_count' => 2,
            'frame_configuration' => json_encode([
                ['id' => 1, 'x' => 100, 'y' => 200, 'width' => 880, 'height' => 500, 'order' => 1],
                ['id' => 2, 'x' => 100, 'y' => 750, 'width' => 880, 'height' => 500, 'order' => 2],
            ]),
        ], [
            'Authorization' => "Bearer {$token}",
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.name', 'Template Baru')
            ->assertJsonPath('data.frame_count', 2);

        $this->assertDatabaseHas('templates', ['name' => 'Template Baru']);
    }
}