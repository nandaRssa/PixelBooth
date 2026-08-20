<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Jalankan semua seeder untuk PixelBooth.
     */
    public function run(): void
    {
        $this->call([
            AdminUserSeeder::class,
            TemplateSeeder::class,
            DemoGallerySeeder::class,
        ]);
    }
}
