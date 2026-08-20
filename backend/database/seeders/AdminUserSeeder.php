<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    /**
     * Buat user admin default untuk PixelBooth.
     */
    public function run(): void
    {
        // Admin utama
        User::firstOrCreate(
            ['email' => 'admin@pixelbooth.com'],
            [
                'name' => 'Admin PixelBooth',
                'email' => 'admin@pixelbooth.com',
                'password' => Hash::make('admin123'),
                'role' => 'admin',
            ]
        );

        $this->command->info('✅ Admin user berhasil dibuat:');
        $this->command->info('   Email    : admin@pixelbooth.com');
        $this->command->info('   Password : admin123');
        $this->command->warn('   ⚠️  Ganti password setelah pertama kali login!');
    }
}
