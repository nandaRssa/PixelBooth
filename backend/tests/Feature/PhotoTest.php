<?php

namespace Tests\Feature;

use App\Models\Folder;
use App\Models\Photo;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PhotoTest extends TestCase
{
    use RefreshDatabase;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();

        $user = User::factory()->create(['role' => 'admin']);
        $this->token = $user->createToken('test-token')->plainTextToken;
    }

    private function headers(): array
    {
        return ['Authorization' => "Bearer {$this->token}"];
    }

    private function makePhoto(Folder $folder = null): Photo
    {
        return Photo::create([
            'folder_id' => $folder?->id,
            'filename' => 'foto-demo.jpg',
            'storage_path' => 'photos/foto-demo.jpg',
            'is_final' => true,
            'is_temporary' => false,
        ]);
    }

    public function test_daftar_foto_hanya_menampilkan_foto_final(): void
    {
        $this->makePhoto();
        Photo::create([
            'filename' => 'temp.jpg',
            'storage_path' => 'photos/temp.jpg',
            'is_final' => false,
            'is_temporary' => true,
        ]);

        $response = $this->getJson('/api/photos', $this->headers());

        $response->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_admin_dapat_memindahkan_foto_ke_folder_lain(): void
    {
        $folderA = Folder::create(['name' => 'Folder A']);
        $folderB = Folder::create(['name' => 'Folder B']);
        $photo = $this->makePhoto($folderA);

        $this->postJson("/api/photos/{$photo->id}/move", [
            'folder_id' => $folderB->id,
        ], $this->headers())
            ->assertOk()
            ->assertJsonPath('data.folder_id', $folderB->id);
    }

    public function test_bulk_move_memindahkan_banyak_foto(): void
    {
        $folderA = Folder::create(['name' => 'Folder A']);
        $folderB = Folder::create(['name' => 'Folder B']);
        $photo1 = $this->makePhoto($folderA);
        $photo2 = $this->makePhoto($folderA);

        $this->postJson('/api/photos/bulk-move', [
            'photo_ids' => [$photo1->id, $photo2->id],
            'folder_id' => $folderB->id,
        ], $this->headers())
            ->assertOk();

        $this->assertDatabaseHas('photos', ['id' => $photo1->id, 'folder_id' => $folderB->id]);
        $this->assertDatabaseHas('photos', ['id' => $photo2->id, 'folder_id' => $folderB->id]);
    }

    public function test_bulk_delete_menghapus_banyak_foto(): void
    {
        $photo1 = $this->makePhoto();
        $photo2 = $this->makePhoto();

        $this->postJson('/api/photos/bulk-delete', [
            'photo_ids' => [$photo1->id, $photo2->id],
        ], $this->headers())
            ->assertOk();

        $this->assertDatabaseMissing('photos', ['id' => $photo1->id]);
        $this->assertDatabaseMissing('photos', ['id' => $photo2->id]);
    }

    public function test_admin_dapat_menghapus_foto(): void
    {
        $photo = $this->makePhoto();

        $this->deleteJson("/api/photos/{$photo->id}", [], $this->headers())
            ->assertOk();

        $this->assertDatabaseMissing('photos', ['id' => $photo->id]);
    }
}