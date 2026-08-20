<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class Photo extends Model
{
    use HasFactory;

    protected $fillable = [
        'session_id',
        'folder_id',
        'filename',
        'storage_path',
        'thumbnail_path',
        'unique_token',
        'qr_path',
        'is_final',
        'is_temporary',
        'google_drive_id',
        'google_drive_synced_at',
        'file_size',
        'mime_type',
    ];

    protected $casts = [
        'is_final' => 'boolean',
        'is_temporary' => 'boolean',
        'file_size' => 'integer',
        'google_drive_synced_at' => 'datetime',
    ];

    protected $appends = ['url', 'thumbnail_url', 'qr_url'];

    /**
     * Generate unique_token otomatis saat foto dibuat.
     */
    protected static function booted(): void
    {
        static::creating(function (Photo $photo) {
            if (empty($photo->unique_token)) {
                $photo->unique_token = Str::uuid()->toString();
            }
        });
    }

    public function getUrlAttribute(): string
    {
        return asset('storage/' . $this->storage_path);
    }

    public function getThumbnailUrlAttribute(): ?string
    {
        return $this->thumbnail_path
            ? asset('storage/' . $this->thumbnail_path)
            : null;
    }

    public function getQrUrlAttribute(): ?string
    {
        return $this->qr_path
            ? asset('storage/' . $this->qr_path)
            : null;
    }

    /**
     * Sesi foto yang menghasilkan foto ini.
     */
    public function session(): BelongsTo
    {
        return $this->belongsTo(PhotoSession::class, 'session_id');
    }

    /**
     * Folder tempat foto ini disimpan.
     */
    public function folder(): BelongsTo
    {
        return $this->belongsTo(Folder::class);
    }

    /**
     * Scope untuk foto final saja.
     */
    public function scopeFinal($query)
    {
        return $query->where('is_final', true)->where('is_temporary', false);
    }

    /**
     * Scope untuk foto temporary (belum final).
     */
    public function scopeTemporary($query)
    {
        return $query->where('is_temporary', true);
    }
}
