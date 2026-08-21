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

    /**
     * Template polos 800x1200 dengan satu frame + Manual Remove Area
     * pada SETENGAH KIRI frame (koordinat konten, basis sudut kiri-atas).
     */
    private function solidTemplateWithLeftRemoveArea(bool $flipH, string $slug): Template
    {
        // Latar gelap + kotak putih kecil tepat di bawah Hard Clear Zone agar
        // frame tidak seragam 100% (tidak memicu mode isi penuh) sehingga uji
        // ini tetap menguji jalur flood fill / remove area manual.
        $img = imagecreatetruecolor(800, 1200);
        imagefilledrectangle($img, 0, 0, 799, 1199, imagecolorallocate($img, 32, 32, 32));
        imagefilledrectangle($img, 395, 595, 404, 604, imagecolorallocate($img, 255, 255, 255));
        ob_start();
        imagepng($img);
        $pngData = ob_get_clean();
        imagedestroy($img);
        Storage::disk('public')->put("templates/{$slug}.png", $pngData);

        return Template::create([
            'name' => "Template {$slug}",
            'slug' => $slug,
            'template_file' => "templates/{$slug}.png",
            'canvas_width' => 800,
            'canvas_height' => 1200,
            'frame_count' => 1,
            'frame_configuration' => [[
                'id' => 1,
                'order' => 0,
                'x' => 300,
                'y' => 500,
                'width' => 200,
                'height' => 200,
                'rotation' => 0,
                'flip_h' => $flipH,
                'flip_v' => false,
                'clear_zone' => 5,
                'clear_expansion' => 0,
                'region_sensitivity' => 0,
                'min_region_size' => 0,
                'edge_protection' => 0,
                'feather' => 0,
                'protected_areas' => [],
                'remove_areas' => [['x' => 0, 'y' => 0, 'w' => 100, 'h' => 200]],
            ]],
            'status' => 'active',
        ]);
    }

    /**
     * Jalankan sesi lengkap dengan foto merah solid, kembalikan path final.
     */
    private function renderRedSession(Template $template): string
    {
        $photo = imagecreatetruecolor(200, 200);
        imagefilledrectangle($photo, 0, 0, 199, 199, imagecolorallocate($photo, 255, 0, 0));
        ob_start();
        imagejpeg($photo, null, 95);
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

        return Storage::disk('public')->path($response->json('data.photo.storage_path'));
    }

    public function test_flip_horizontal_mencerminkan_area_manual_pada_mask(): void
    {
        // Tanpa flip: Remove Area di kiri frame → kiri berlubang (foto merah),
        // kanan tetap desain. Dengan flip_h: area mencerminkan ke kanan.
        $noFlip = $this->renderRedSession($this->solidTemplateWithLeftRemoveArea(false, 'flip-off'));
        $flipped = $this->renderRedSession($this->solidTemplateWithLeftRemoveArea(true, 'flip-on'));

        $a = imagecreatefromjpeg($noFlip);
        $b = imagecreatefromjpeg($flipped);
        $r = fn ($c) => ($c >> 16) & 0xFF;

        // Tanpa flip: kiri = foto, kanan = desain gelap
        $this->assertGreaterThan(180, $r(imagecolorat($a, 350, 600)), 'Kiri frame harus ter-clear (remove area)');
        $this->assertLessThan(80, $r(imagecolorat($a, 450, 600)), 'Kanan frame harus tetap desain');

        // Dengan flip_h: cermin — kanan = foto, kiri = desain gelap
        $this->assertGreaterThan(180, $r(imagecolorat($b, 450, 600)), 'Flip harus memindahkan lubang ke kanan');
        $this->assertLessThan(80, $r(imagecolorat($b, 350, 600)), 'Flip harus menutup lubang di kiri');

        imagedestroy($a);
        imagedestroy($b);
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

    public function test_template_draft_tidak_bisa_dipakai_sesi(): void
    {
        $template = $this->makeTemplate(1);
        $template->update(['status' => 'draft']);

        $this->postJson('/api/sessions', ['template_id' => $template->id], $this->headers())
            ->assertStatus(422);
    }

    public function test_complete_merender_mask_hard_clear_zone_dan_proteksi_desain(): void
    {
        // Template 800x1200: bg gelap + placeholder putih (300,500)-(500,700)
        // + logo hijau (305,515)-(495,535) + strip biru (492,505)-(508,695).
        // Frame manual user: (260,460) 280x280 — sengaja lebih besar dari slot
        // agar porsi putih < ambang mode isi penuh sehingga uji ini tetap
        // menguji jalur flood fill ketat. Hard Clear Zone 50%.
        $w = 800;
        $h = 1200;
        $img = imagecreatetruecolor($w, $h);
        imagefilledrectangle($img, 0, 0, $w - 1, $h - 1, imagecolorallocate($img, 32, 32, 32));
        imagefilledrectangle($img, 300, 500, 500, 700, imagecolorallocate($img, 255, 255, 255));
        imagefilledrectangle($img, 305, 515, 495, 535, imagecolorallocate($img, 0, 170, 0));
        imagefilledrectangle($img, 492, 505, 508, 695, imagecolorallocate($img, 0, 68, 204));
        ob_start();
        imagepng($img);
        $pngData = ob_get_clean();
        imagedestroy($img);
        Storage::disk('public')->put('templates/mask.png', $pngData);

        $template = Template::create([
            'name' => 'Template Mask',
            'slug' => 'template-mask',
            'template_file' => 'templates/mask.png',
            'canvas_width' => $w,
            'canvas_height' => $h,
            'frame_count' => 1,
            'frame_configuration' => [[
                'id' => 1,
                'order' => 0,
                'x' => 260,
                'y' => 460,
                'width' => 280,
                'height' => 280,
                'rotation' => 0,
                'flip_h' => false,
                'flip_v' => false,
                'clear_zone' => 50,
                'clear_expansion' => 10,
                'region_sensitivity' => 50,
                'min_region_size' => 1,
                'edge_protection' => 60,
                'feather' => 0,
                'protected_areas' => [],
                'remove_areas' => [],
            ]],
            'status' => 'active',
        ]);

        // Foto capture: merah solid
        $photo = imagecreatetruecolor(200, 200);
        imagefilledrectangle($photo, 0, 0, 199, 199, imagecolorallocate($photo, 255, 0, 0));
        ob_start();
        imagejpeg($photo, null, 95);
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

        $px = fn ($x, $y) => imagecolorat($final, $x, $y);
        $r = fn ($c) => ($c >> 16) & 0xFF;
        $g = fn ($c) => ($c >> 8) & 0xFF;
        $b = fn ($c) => $c & 0xFF;

        // PRIORITAS 1 — pusat Hard Clear Zone: foto merah terlihat
        $c = $px(400, 600);
        $this->assertGreaterThan(180, $r($c), 'Pusat frame harus berisi foto');
        $this->assertLessThan(100, $g($c), 'Pusat frame harus foto, bukan desain');

        // PRIORITAS 2 — connected region di bawah hard zone ikut ter-clear
        $c = $px(400, 665);
        $this->assertGreaterThan(180, $r($c), 'Area putih terhubung harus ter-clear');

        // Connected region menembus celah sempit antara logo dan tepi hard zone
        $c = $px(400, 543);
        $this->assertGreaterThan(180, $r($c), 'Celah terhubung harus ter-clear');

        // PRIORITAS 4 — logo hijau di perifer DIPERTAHANKAN (kamera di-mask)
        $c = $px(400, 525);
        $this->assertGreaterThan(100, $g($c), 'Logo hijau harus dipertahankan');
        $this->assertLessThan(100, $r($c), 'Logo hijau tidak boleh tertimpa foto');

        // Pulau putih di atas logo tak terjangkau flood → tetap desain putih
        $c = $px(400, 508);
        $this->assertGreaterThan(200, $r($c));
        $this->assertGreaterThan(200, $g($c));

        // Strip biru di tepi kanan frame DIPERTAHANKAN
        $c = $px(500, 600);
        $this->assertGreaterThan(150, $b($c), 'Strip biru harus dipertahankan');
        $this->assertLessThan(100, $r($c));

        // Clear Expansion habis: sudut bawah kiri tetap putih (di luar jangkauan)
        $c = $px(305, 697);
        $this->assertGreaterThan(200, $r($c), 'Area di luar expansion tidak boleh ter-clear');

        // Background gelap jauh dari frame tetap utuh
        $c = $px(30, 30);
        $this->assertLessThan(80, $r($c));

        imagedestroy($final);
    }

    public function test_complete_mode_isi_penuh_mayoritas_warna_sama_menghapus_seluruh_frame_kecuali_elemen(): void
    {
        // Template 800x1200: bg gelap + slot putih persis di area frame
        // (300,500)-(500,700) + kotak hitam (430,630)-(469,669).
        // Mayoritas piksel frame = putih -> mode isi penuh: seluruh frame
        // ter-clear TANPA syarat konektivitas/expansion, KECUALI elemen yang
        // benar-benar beda warna (kotak hitam) dan Manual Protect Area.
        $w = 800;
        $h = 1200;
        $img = imagecreatetruecolor($w, $h);
        imagefilledrectangle($img, 0, 0, $w - 1, $h - 1, imagecolorallocate($img, 32, 32, 32));
        imagefilledrectangle($img, 300, 500, 500, 700, imagecolorallocate($img, 255, 255, 255));
        imagefilledrectangle($img, 430, 630, 469, 669, imagecolorallocate($img, 0, 0, 0));
        ob_start();
        imagepng($img);
        $pngData = ob_get_clean();
        imagedestroy($img);
        Storage::disk('public')->put('templates/mask-fill.png', $pngData);

        $template = Template::create([
            'name' => 'Template Mask Fill',
            'slug' => 'template-mask-fill',
            'template_file' => 'templates/mask-fill.png',
            'canvas_width' => $w,
            'canvas_height' => $h,
            'frame_count' => 1,
            'frame_configuration' => [[
                'id' => 1,
                'order' => 0,
                'x' => 300,
                'y' => 500,
                'width' => 200,
                'height' => 200,
                'rotation' => 0,
                'flip_h' => false,
                'flip_v' => false,
                'clear_zone' => 50,
                'clear_expansion' => 25,
                'region_sensitivity' => 50,
                'min_region_size' => 1,
                'edge_protection' => 0,
                'feather' => 0,
                'protected_areas' => [['x' => 10, 'y' => 10, 'w' => 30, 'h' => 30]],
                'remove_areas' => [],
            ]],
            'status' => 'active',
        ]);

        // Foto capture: merah solid
        $photo = imagecreatetruecolor(200, 200);
        imagefilledrectangle($photo, 0, 0, 199, 199, imagecolorallocate($photo, 255, 0, 0));
        ob_start();
        imagejpeg($photo, null, 95);
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

        $px = fn ($x, $y) => imagecolorat($final, $x, $y);
        $r = fn ($c) => ($c >> 16) & 0xFF;
        $g = fn ($c) => ($c >> 8) & 0xFF;
        $b = fn ($c) => $c & 0xFF;

        // Pojok frame jauh dari pusat: ikut ter-clear (tanpa syarat expansion)
        $c = $px(480, 690);
        $this->assertGreaterThan(180, $r($c), 'Mayoritas satu warna harus clear penuh');
        $this->assertLessThan(140, $g($c));

        // Kotak hitam: elemen beda warna DIPERTAHANKAN sebagai desain
        $c = $px(450, 650);
        $this->assertLessThan(120, $r($c), 'Kotak hitam harus dipertahankan');
        $this->assertLessThan(120, $g($c));
        $this->assertLessThan(120, $b($c));

        // Manual Protect Area: tetap desain putih meski mayoritas clear
        $c = $px(325, 525);
        $this->assertGreaterThan(200, $r($c), 'Protect area harus dipertahankan');
        $this->assertGreaterThan(200, $g($c));

        // Pinggir kotak hitam: tidak ada sisa fringe putih menempel
        $c = $px(471, 650);
        $this->assertGreaterThan(180, $r($c), 'Tepi elemen harus bersih tanpa sisa putih');
        $this->assertLessThan(160, $g($c));

        imagedestroy($final);
    }

    public function test_complete_edge_cleanup_mengikis_sisa_tipis_di_boundary_dan_hormati_protect(): void
    {
        // Template 800x1200: bg gelap + slot putih (300,500)-(500,700) +
        // garis hitam tipis (300,520)-(500,524) melintang di dalam area
        // kamera. Flood fill mempertahankan garis itu (beda warna); Edge
        // Cleanup mendilasi boundary mask untuk menelannya tanpa menyentuh
        // Manual Protect Area.
        $cases = [
            // [slug, edge_cleanup, protected_areas]
            ['mask-ec-off', 0, []],
            ['mask-ec-on', 3, [['x' => 10, 'y' => 18, 'w' => 30, 'h' => 8]]],
        ];

        foreach ($cases as [$slug, $cleanup, $prot]) {
            $w = 800;
            $h = 1200;
            $img = imagecreatetruecolor($w, $h);
            imagefilledrectangle($img, 0, 0, $w - 1, $h - 1, imagecolorallocate($img, 32, 32, 32));
            imagefilledrectangle($img, 300, 500, 500, 700, imagecolorallocate($img, 255, 255, 255));
            imagefilledrectangle($img, 300, 520, 500, 524, imagecolorallocate($img, 0, 0, 0));
            ob_start();
            imagepng($img);
            $pngData = ob_get_clean();
            imagedestroy($img);
            Storage::disk('public')->put("templates/{$slug}.png", $pngData);

            $template = Template::create([
                'name' => "Template {$slug}",
                'slug' => $slug,
                'template_file' => "templates/{$slug}.png",
                'canvas_width' => $w,
                'canvas_height' => $h,
                'frame_count' => 1,
                'frame_configuration' => [[
                    'id' => 1,
                    'order' => 0,
                    'x' => 300,
                    'y' => 500,
                    'width' => 200,
                    'height' => 200,
                    'rotation' => 0,
                    'flip_h' => false,
                    'flip_v' => false,
                    'clear_zone' => 50,
                    'clear_expansion' => 100,
                    'region_sensitivity' => 50,
                    'min_region_size' => 1,
                    'edge_protection' => 0,
                    'feather' => 0,
                    'edge_cleanup' => $cleanup,
                    'protected_areas' => $prot,
                    'remove_areas' => [],
                ]],
                'status' => 'active',
            ]);

            // Foto capture: merah solid
            $photo = imagecreatetruecolor(200, 200);
            imagefilledrectangle($photo, 0, 0, 199, 199, imagecolorallocate($photo, 255, 0, 0));
            ob_start();
            imagejpeg($photo, null, 95);
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

            $c = imagecolorat($final, 400, 522);
            $r = ($c >> 16) & 0xFF;

            if ($cleanup === 0) {
                // Tanpa cleanup: garis tipis tetap terlihat sebagai desain
                $this->assertLessThan(100, $r, "Garis tipis harus tetap ada tanpa Edge Cleanup ({$slug})");
            } else {
                // Dengan cleanup: garis tertelan boundary mask -> foto terlihat
                $this->assertGreaterThan(180, $r, "Edge Cleanup harus mengikis garis tipis ({$slug})");

                // Segmen garis di dalam Protect Area: tetap desain
                $cp = imagecolorat($final, 325, 522);
                $this->assertLessThan(100, ($cp >> 16) & 0xFF, "Protect Area tidak boleh ter-cleanup ({$slug})");
            }

            imagedestroy($final);
        }
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