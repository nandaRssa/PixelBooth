<?php

namespace Tests\Feature;

use App\Models\Folder;
use App\Models\Photo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerTest extends TestCase
{
    use RefreshDatabase;

    public function test_halaman_photo_public_berdasarkan_token(): void
    {
        $photo = Photo::create([
            'filename' => 'foto-final.jpg',
            'storage_path' => 'photos/foto-final.jpg',
            'is_final' => true,
            'is_temporary' => false,
        ]);

        $this->getJson("/api/public/photo/{$photo->unique_token}")
            ->assertOk()
            ->assertJsonPath('data.id', $photo->unique_token)
            ->assertJsonStructure(['data' => ['url', 'thumbnail_url', 'qr_url']]);
    }

    public function test_halaman_photo_tidak_menampilkan_foto_temporary(): void
    {
        $photo = Photo::create([
            'filename' => 'foto-temp.jpg',
            'storage_path' => 'photos/foto-temp.jpg',
            'is_final' => false,
            'is_temporary' => true,
        ]);

        $this->getJson("/api/public/photo/{$photo->unique_token}")
            ->assertStatus(404);
    }

    public function test_halaman_photo_token_tidak_valid_menghasilkan_404(): void
    {
        $this->getJson('/api/public/photo/token-tidak-ada')
            ->assertStatus(404);
    }

    public function test_halaman_folder_public_menampilkan_semua_foto(): void
    {
        $folder = Folder::create(['name' => 'Wedding A']);
        Photo::create([
            'folder_id' => $folder->id,
            'filename' => 'foto-1.jpg',
            'storage_path' => 'photos/foto-1.jpg',
            'is_final' => true,
            'is_temporary' => false,
        ]);
        Photo::create([
            'folder_id' => $folder->id,
            'filename' => 'foto-2.jpg',
            'storage_path' => 'photos/foto-2.jpg',
            'is_final' => true,
            'is_temporary' => false,
        ]);

        $this->getJson("/api/public/folder/{$folder->unique_token}")
            ->assertOk()
            ->assertJsonPath('data.name', 'Wedding A')
            ->assertJsonCount(2, 'data.photos');
    }

    public function test_halaman_folder_token_tidak_valid_menghasilkan_404(): void
    {
        $this->getJson('/api/public/folder/token-tidak-ada')
            ->assertStatus(404);
    }

    public function test_qr_photo_menampilkan_link_public(): void
    {
        $photo = Photo::create([
            'filename' => 'foto-final.jpg',
            'storage_path' => 'photos/foto-final.jpg',
            'is_final' => true,
            'is_temporary' => false,
        ]);

        $this->getJson("/api/qr/photo/{$photo->unique_token}")
            ->assertOk()
            ->assertJsonPath('data.token', $photo->unique_token)
            ->assertJsonStructure(['data' => ['public_url', 'qr_url']]);
    }

    public function test_qr_folder_menampilkan_link_public(): void
    {
        $folder = Folder::create(['name' => 'Wedding A']);

        $this->getJson("/api/qr/folder/{$folder->unique_token}")
            ->assertOk()
            ->assertJsonStructure(['data' => ['public_url', 'qr_url']]);
    }
}