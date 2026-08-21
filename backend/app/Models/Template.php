<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Template extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'slug',
        'template_file',
        'preview_file',
        'canvas_width',
        'canvas_height',
        'frame_count',
        'frame_configuration',
        'detection_method',
        'status',
    ];

    protected $casts = [
        'frame_configuration' => 'array',
        'canvas_width' => 'integer',
        'canvas_height' => 'integer',
        'frame_count' => 'integer',
    ];

    /**
     * Append URL atribut untuk template dan preview file.
     */
    protected $appends = ['template_url', 'preview_url'];

    public function getTemplateUrlAttribute(): ?string
    {
        return $this->template_file
            ? '/storage/' . ltrim($this->template_file, '/')
            : null;
    }

    public function getPreviewUrlAttribute(): ?string
    {
        return $this->preview_file
            ? '/storage/' . ltrim($this->preview_file, '/')
            : null;
    }

    /**
     * Relasi ke sesi foto yang menggunakan template ini.
     */
    public function sessions(): HasMany
    {
        return $this->hasMany(PhotoSession::class);
    }

    /**
     * Scope untuk template yang aktif.
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }
}
