<?php

// Setup writable storage and bootstrap cache dirs in /tmp for serverless
$tmpDirs = [
    '/tmp/storage',
    '/tmp/storage/app',
    '/tmp/storage/app/public',
    '/tmp/storage/app/public/templates',
    '/tmp/storage/app/public/photos',
    '/tmp/storage/app/public/qr',
    '/tmp/storage/framework',
    '/tmp/storage/framework/views',
    '/tmp/storage/framework/cache',
    '/tmp/storage/framework/cache/data',
    '/tmp/storage/framework/sessions',
    '/tmp/storage/logs',
    '/tmp/bootstrap',
    '/tmp/bootstrap/cache',
];
foreach ($tmpDirs as $dir) {
    if (!is_dir($dir)) {
        @mkdir($dir, 0777, true);
    }
}

// Normalize server environment for Laravel routing on Vercel
$_SERVER['SCRIPT_NAME'] = '/index.php';
$_SERVER['SCRIPT_FILENAME'] = __DIR__ . '/../public/index.php';

// Forward all Vercel Serverless Function requests to Laravel's public/index.php
require __DIR__ . '/../public/index.php';
