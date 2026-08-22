<?php

// ==========================================
// PIXELBOOTH — Konfigurasi CORS global
// Mengizinkan frontend Vercel & Cloudflare Tunnel
// mengakses API dan file storage (template, foto, QR).
// storage/* wajib agar canvas overlay template tidak
// tertaint CORS saat membangun lubang mask kamera.
// ==========================================

return [

    'paths' => ['api/*', 'storage/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => ['*'],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    // Kredensial (cookie) tidak dipakai — login dihapus.
    // false = kompatibel dengan allowed_origins '*'.
    'supports_credentials' => false,

];
