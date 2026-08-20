<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tabel folders untuk manajemen galeri foto.
     * Mendukung struktur nested folder (parent_folder_id).
     */
    public function up(): void
    {
        Schema::create('folders', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->foreignId('parent_folder_id')->nullable()->constrained('folders')->nullOnDelete();
            $table->uuid('unique_token')->unique();   // token untuk QR code (immutable)
            $table->string('qr_path')->nullable();    // path file QR code image
            $table->string('google_drive_id')->nullable(); // Google Drive folder ID
            $table->timestamps();

            $table->index('unique_token');
            $table->index('parent_folder_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('folders');
    }
};
