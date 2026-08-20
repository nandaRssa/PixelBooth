<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Folder extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'parent_folder_id',
        'unique_token',
        'qr_path',
        'google_drive_id',
    ];

    protected $appends = ['qr_url', 'photo_count'];

    /**
     * Generate unique_token otomatis saat folder dibuat.
     */
    protected static function booted(): void
    {
        static::creating(function (Folder $folder) {
            if (empty($folder->unique_token)) {
                $folder->unique_token = Str::uuid()->toString();
            }
        });
    }

    public function getQrUrlAttribute(): ?string
    {
        return $this->qr_path
            ? asset('storage/' . $this->qr_path)
            : null;
    }

    public function getPhotoCountAttribute(): int
    {
        return $this->photos()->count();
    }

    /**
     * Folder parent (untuk nested folder).
     */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(Folder::class, 'parent_folder_id');
    }

    /**
     * Sub-folder dalam folder ini.
     */
    public function children(): HasMany
    {
        return $this->hasMany(Folder::class, 'parent_folder_id');
    }

    /**
     * Semua foto yang ada dalam folder ini.
     */
    public function photos(): HasMany
    {
        return $this->hasMany(Photo::class)->where('is_final', true);
    }

    /**
     * Semua sesi foto yang ditargetkan ke folder ini.
     */
    public function sessions(): HasMany
    {
        return $this->hasMany(PhotoSession::class);
    }
}
