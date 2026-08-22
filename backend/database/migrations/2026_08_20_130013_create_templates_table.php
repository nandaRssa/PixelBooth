<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tabel templates untuk menyimpan desain photobooth dari Canva atau upload.
     */
    public function up(): void
    {
        Schema::create('templates', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('template_file');         // path file template (PNG/JPG)
            $table->string('preview_file')->nullable(); // path thumbnail preview
            $table->integer('canvas_width')->default(1080);
            $table->integer('canvas_height')->default(1920);
            $table->integer('frame_count')->default(1);
            $table->jsonb('frame_configuration')->nullable(); // array konfigurasi frame
            $table->string('detection_method')->default('transparent'); // 'transparent' atau 'white-detection'
            $table->enum('status', ['draft', 'active', 'inactive'])->default('draft');
            $table->timestamps();

            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('templates');
    }
};
