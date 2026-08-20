<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;

class PhotoSession extends Model
{
    use HasFactory;

    protected $fillable = [
        'template_id',
        'folder_id',
        'status',
        'current_frame',
        'total_frames',
        'session_token',
        'completed_at',
    ];

    protected $casts = [
        'current_frame' => 'integer',
        'total_frames' => 'integer',
        'completed_at' => 'datetime',
    ];

    /**
     * Generate session_token otomatis saat sesi dibuat.
     */
    protected static function booted(): void
    {
        static::creating(function (PhotoSession $session) {
            if (empty($session->session_token)) {
                $session->session_token = Str::uuid()->toString();
            }
        });
    }

    /**
     * Template yang digunakan dalam sesi ini.
     */
    public function template(): BelongsTo
    {
        return $this->belongsTo(Template::class);
    }

    /**
     * Folder tujuan penyimpanan foto dari sesi ini.
     */
    public function folder(): BelongsTo
    {
        return $this->belongsTo(Folder::class);
    }

    /**
     * Semua capture foto dalam sesi ini (termasuk retake).
     */
    public function captures(): HasMany
    {
        return $this->hasMany(SessionCapture::class, 'session_id');
    }

    /**
     * Foto final hasil render sesi ini.
     */
    public function finalPhoto(): HasOne
    {
        return $this->hasOne(Photo::class, 'session_id')->where('is_final', true);
    }

    /**
     * Cek apakah sesi sudah selesai semua frame.
     */
    public function isAllFramesCaptured(): bool
    {
        $approvedCaptures = $this->captures()
            ->where('status', 'approved')
            ->count();

        return $approvedCaptures >= $this->total_frames;
    }

    /**
     * Scope sesi yang masih aktif.
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }
}
