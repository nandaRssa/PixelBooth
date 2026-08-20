<?php

namespace Tests\Feature;

use App\Models\Folder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class FolderTest extends TestCase
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

    public function test_admin_dapat_membuat_folder(): void
    {
        $response = $this->postJson('/api/folders', ['name' => 'Pernikahan Andi & Sari'], $this->headers());

        $response->assertStatus(201)
            ->assertJsonPath('data.name', 'Pernikahan Andi & Sari')
            ->assertJsonPath('data.photo_count', 0);

        $this->assertDatabaseHas('folders', ['name' => 'Pernikahan Andi & Sari']);
        $this->assertNotNull(Folder::first()->unique_token);
    }

    public function test_admin_dapat_membuat_sub_folder(): void
    {
        $parent = Folder::create(['name' => 'Studio']);

        $this->postJson('/api/folders', [
            'name' => 'Portrait',
            'parent_folder_id' => $parent->id,
        ], $this->headers())
            ->assertStatus(201)
            ->assertJsonPath('data.parent_folder_id', $parent->id);
    }

    public function test_folder_tanpa_autentikasi_ditolak(): void
    {
        $this->postJson('/api/folders', ['name' => 'Tanpa Auth'])->assertStatus(401);
    }

    public function test_validasi_nama_folder_wajib(): void
    {
        $this->postJson('/api/folders', ['name' => ''], $this->headers())->assertStatus(422);
    }

    public function test_admin_dapat_rename_folder(): void
    {
        $folder = Folder::create(['name' => 'Nama Lama']);

        $this->putJson("/api/folders/{$folder->id}", ['name' => 'Nama Baru'], $this->headers())
            ->assertOk()
            ->assertJsonPath('data.name', 'Nama Baru');
    }

    public function test_folder_dengan_sub_folder_tidak_dapat_dihapus(): void
    {
        $parent = Folder::create(['name' => 'Parent']);
        Folder::create(['name' => 'Child', 'parent_folder_id' => $parent->id]);

        $this->deleteJson("/api/folders/{$parent->id}", [], $this->headers())
            ->assertStatus(422);
    }

    public function test_admin_dapat_menghapus_folder(): void
    {
        $folder = Folder::create(['name' => 'Hapus Folder']);

        $this->deleteJson("/api/folders/{$folder->id}", [], $this->headers())
            ->assertOk();

        $this->assertDatabaseMissing('folders', ['id' => $folder->id]);
    }
}