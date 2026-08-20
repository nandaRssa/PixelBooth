<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_berhasil_mengembalikan_token(): void
    {
        User::factory()->create([
            'email' => 'admin@pixelbooth.com',
            'password' => 'password',
            'role' => 'admin',
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'admin@pixelbooth.com',
            'password' => 'password',
        ]);

        $response->assertOk()
            ->assertJsonStructure([
                'message',
                'token',
                'user' => ['id', 'name', 'email', 'role'],
            ])
            ->assertJsonPath('user.role', 'admin');
    }

    public function test_login_dengan_password_salah_ditolak(): void
    {
        User::factory()->create([
            'email' => 'admin@pixelbooth.com',
            'password' => 'password',
            'role' => 'admin',
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'admin@pixelbooth.com',
            'password' => 'password-salah',
        ]);

        $response->assertStatus(422);
    }

    public function test_endpoint_protected_membutuhkan_token(): void
    {
        $this->getJson('/api/auth/me')->assertStatus(401);
        $this->getJson('/api/folders')->assertStatus(401);
    }

    public function test_logout_menonaktifkan_token(): void
    {
        $user = User::factory()->create(['role' => 'admin']);
        $token = $user->createToken('test-token')->plainTextToken;
        $tokenId = $user->tokens()->first()->id;

        $this->withToken($token)
            ->postJson('/api/auth/logout')
            ->assertOk();

        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $tokenId]);

        // Reset guard agar request berikutnya meng-autentikasi ulang terhadap DB
        $this->app['auth']->forgetGuards();

        $this->withToken($token)
            ->getJson('/api/auth/me')
            ->assertStatus(401);
    }
}