<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tabel photo_sessions untuk menyimpan sesi pemotretan.
     * Setiap sesi terhubung ke template dan opsional ke folder tujuan.
     */
    public function up(): void
    {
        Schema::create('photo_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('template_id')->constrained('templates')->cascadeOnDelete();
            $table->foreignId('folder_id')->nullable()->constrained('folders')->nullOnDelete();
            $table->enum('status', ['active', 'complete', 'cancelled'])->default('active');
            $table->integer('current_frame')->default(1);
            $table->integer('total_frames')->default(1);
            $table->uuid('session_token')->unique(); // token unik per sesi
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index('status');
            $table->index('session_token');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('photo_sessions');
    }
};
