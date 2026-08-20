<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SessionCapture extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'session_id',
        'frame_number',
        'photo_path',
        'status',
        'captured_at',
    ];

    protected $casts = [
        'frame_number' => 'integer',
        'captured_at' => 'datetime',
    ];

    protected $appends = ['photo_url'];

    public function getPhotoUrlAttribute(): string
    {
        return asset('storage/' . $this->photo_path);
    }

    /**
     * Sesi foto induk dari capture ini.
     */
    public function session(): BelongsTo
    {
        return $this->belongsTo(PhotoSession::class, 'session_id');
    }

    /**
     * Scope untuk capture yang sudah diapprove.
     */
    public function scopeApproved($query)
    {
        return $query->where('status', 'approved');
    }
}
