<?php

namespace Database\Seeders;

use App\Models\Template;
use Illuminate\Database\Seeder;

class TemplateSeeder extends Seeder
{
    /**
     * Seed template demo untuk pengembangan awal.
     */
    public function run(): void
    {
        $templates = [
            [
                'name' => 'Classic Strip 3 Frame',
                'slug' => 'classic-strip-3-frame',
                'template_file' => 'templates/demo/classic-strip.jpg',
                'canvas_width' => 1080,
                'canvas_height' => 1920,
                'frame_count' => 3,
                'frame_configuration' => [
                    ['id' => 1, 'x' => 60, 'y' => 150, 'width' => 960, 'height' => 500, 'order' => 1],
                    ['id' => 2, 'x' => 60, 'y' => 700, 'width' => 960, 'height' => 500, 'order' => 2],
                    ['id' => 3, 'x' => 60, 'y' => 1250, 'width' => 960, 'height' => 500, 'order' => 3],
                ],
                'status' => 'active',
            ],
            [
                'name' => 'Single Frame Wide',
                'slug' => 'single-frame-wide',
                'template_file' => 'templates/demo/single-wide.jpg',
                'canvas_width' => 1920,
                'canvas_height' => 1080,
                'frame_count' => 1,
                'frame_configuration' => [
                    ['id' => 1, 'x' => 100, 'y' => 100, 'width' => 1720, 'height' => 880, 'order' => 1],
                ],
                'status' => 'active',
            ],
            [
                'name' => 'Grid 4 Frame',
                'slug' => 'grid-4-frame',
                'template_file' => 'templates/demo/grid-4.jpg',
                'canvas_width' => 1080,
                'canvas_height' => 1080,
                'frame_count' => 4,
                'frame_configuration' => [
                    ['id' => 1, 'x' => 20, 'y' => 20, 'width' => 510, 'height' => 510, 'order' => 1],
                    ['id' => 2, 'x' => 550, 'y' => 20, 'width' => 510, 'height' => 510, 'order' => 2],
                    ['id' => 3, 'x' => 20, 'y' => 550, 'width' => 510, 'height' => 510, 'order' => 3],
                    ['id' => 4, 'x' => 550, 'y' => 550, 'width' => 510, 'height' => 510, 'order' => 4],
                ],
                'status' => 'active',
            ],
        ];

        foreach ($templates as $template) {
            Template::firstOrCreate(
                ['slug' => $template['slug']],
                $template
            );
        }

        $this->command->info('✅ Template demo berhasil dibuat: ' . count($templates) . ' template.');
    }
}
