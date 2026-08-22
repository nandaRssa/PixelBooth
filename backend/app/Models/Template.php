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
        if (! $this->template_file) {
            return null;
        }
        if (str_starts_with($this->template_file, 'http://') || str_starts_with($this->template_file, 'https://')) {
            return $this->template_file;
        }
        return url('storage/' . ltrim($this->template_file, '/'));
    }

    public function getPreviewUrlAttribute(): ?string
    {
        if (! $this->preview_file) {
            return null;
        }
        if (str_starts_with($this->preview_file, 'http://') || str_starts_with($this->preview_file, 'https://')) {
            return $this->preview_file;
        }
        return url('storage/' . ltrim($this->preview_file, '/'));
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
