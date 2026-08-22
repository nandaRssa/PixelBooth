<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tambah status 'draft' — template baru yang belum dikonfirmasi di
     * Frame Editor dan belum boleh dipakai Photo Session.
     */
    public function up(): void
    {
        if (\Illuminate\Support\Facades\DB::getDriverName() !== 'pgsql') {
            Schema::table('templates', function (Blueprint $table) {
                $table->enum('status', ['draft', 'active', 'inactive'])->default('draft')->change();
            });
        }
    }

    public function down(): void
    {
        if (\Illuminate\Support\Facades\DB::getDriverName() !== 'pgsql') {
            Schema::table('templates', function (Blueprint $table) {
                $table->enum('status', ['active', 'inactive'])->default('active')->change();
            });
        }
    }
};
