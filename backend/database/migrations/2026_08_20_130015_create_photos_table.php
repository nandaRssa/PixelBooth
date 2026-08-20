<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tabel photos untuk menyimpan semua foto (temporary dan final).
     * Setiap foto memiliki unique_token yang tidak berubah meski dipindahkan.
     */
    public function up(): void
    {
        Schema::create('photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('session_id')->nullable()->constrained('photo_sessions')->nullOnDelete();
            $table->foreignId('folder_id')->nullable()->constrained('folders')->nullOnDelete();
            $table->string('filename');
            $table->string('storage_path');           // path relatif di storage
            $table->string('thumbnail_path')->nullable();
            $table->uuid('unique_token')->unique();   // token untuk QR (tidak berubah saat pindah folder)
            $table->string('qr_path')->nullable();    // path file QR code image
            $table->boolean('is_final')->default(false);     // sudah di-render final
            $table->boolean('is_temporary')->default(true);  // masih sesi aktif
            $table->string('google_drive_id')->nullable();
            $table->timestamp('google_drive_synced_at')->nullable();
            $table->bigInteger('file_size')->default(0);     // ukuran dalam bytes
            $table->string('mime_type')->default('image/jpeg');
            $table->timestamps();

            $table->index('unique_token');
            $table->index('folder_id');
            $table->index('is_final');
            $table->index('is_temporary');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('photos');
    }
};
