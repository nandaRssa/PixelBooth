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

    public function test_complete_merender_foto_mengikuti_bentuk_lingkaran(): void
    {
        // Template PNG 800x1200: bg gelap pekat + lubang transparan lingkaran
        // di tengah (r=100). Alpha template harus menjadi mask foto.
        $w = 800;
        $h = 1200;
        $img = imagecreatetruecolor($w, $h);
        imagealphablending($img, false);
        imagesavealpha($img, true);
        $bg = imagecolorallocatealpha($img, 40, 40, 40, 0);
        imagefilledrectangle($img, 0, 0, $w - 1, $h - 1, $bg);
        $t = imagecolorallocatealpha($img, 0, 0, 0, 127);
        imagefilledellipse($img, 400, 600, 200, 200, $t);
        ob_start();
        imagepng($img);
        $pngData = ob_get_clean();
        imagedestroy($img);
        Storage::disk('public')->put('templates/circle.png', $pngData);

        $cx = 300;
        $cy = 500;
        $diameter = 200;
        $mask = [];
        for ($i = 0; $i < 48; $i++) {
            $a = 2 * M_PI * $i / 48;
            $mask[] = [
                (int) round(($cx + $diameter / 2) + ($diameter / 2) * cos($a)),
                (int) round(($cy + $diameter / 2) + ($diameter / 2) * sin($a))
            ];
        }

        $template = Template::create([
            'name' => 'Template Lingkaran',
            'slug' => 'template-lingkaran',
            'template_file' => 'templates/circle.png',
            'canvas_width' => $w,
            'canvas_height' => $h,
            'frame_count' => 1,
            'frame_configuration' => [[
                'id' => 1,
                'order' => 0,
                'shape' => 'circle',
                'x' => $cx,
                'y' => $cy,
                'width' => $diameter,
                'height' => $diameter,
                'position' => ['x' => $cx, 'y' => $cy],
                'size' => ['width' => $diameter, 'height' => $diameter],
                'mask' => $mask,
                'radius' => 100,
                'radius_y' => 100,
                'corner_radius' => null,
                'fill_ratio' => 0.785,
                'source' => 'alpha',
            ]],
            'status' => 'active',
        ]);

        // Foto capture: merah solid
        $photo = imagecreatetruecolor(200, 200);
        $red = imagecolorallocate($photo, 255, 0, 0);
        imagefilledrectangle($photo, 0, 0, 199, 199, $red);
        ob_start();
        imagejpeg($photo, null, 90);
        $photoData = ob_get_clean();
        imagedestroy($photo);
        $photoBase64 = 'data:image/jpeg;base64,' . base64_encode($photoData);

        $session = $this->postJson('/api/sessions', [
            'template_id' => $template->id,
        ], $this->headers())->json('data');

        $this->postJson("/api/sessions/{$session['id']}/capture", [
            'image_base64' => $photoBase64,
        ], $this->headers())
            ->assertOk()
            ->assertJsonPath('data.all_done', true);

        $response = $this->postJson("/api/sessions/{$session['id']}/complete", [], $this->headers());
        $response->assertOk();

        $finalPath = Storage::disk('public')->path($response->json('data.photo.storage_path'));
        $final = imagecreatefromjpeg($finalPath);

        $center = imagecolorat($final, 400, 600);
        $this->assertGreaterThan(200, ($center >> 16) & 0xFF, 'Tengah lingkaran harus berisi foto merah');
        $this->assertLessThan(120, ($center >> 8) & 0xFF, 'Tengah lingkaran harus merah, bukan hijau');

        $corner = imagecolorat($final, 30, 30);
        $this->assertLessThan(80, ($corner >> 16) & 0xFF, 'Di luar lingkaran harus tetap template gelap');

        imagedestroy($final);
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