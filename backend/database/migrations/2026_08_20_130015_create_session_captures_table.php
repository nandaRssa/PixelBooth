<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tabel session_captures untuk menyimpan foto per frame dalam satu sesi.
     * Mendukung retake — satu frame bisa dicapture berkali-kali.
     */
    public function up(): void
    {
        Schema::create('session_captures', function (Blueprint $table) {
            $table->id();
            $table->foreignId('session_id')->constrained('photo_sessions')->cascadeOnDelete();
            $table->integer('frame_number');           // frame ke-berapa (1-based)
            $table->string('photo_path');              // path file temporary capture
            $table->enum('status', ['captured', 'approved', 'retaken'])->default('captured');
            $table->timestamp('captured_at')->useCurrent();

            $table->index(['session_id', 'frame_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('session_captures');
    }
};
