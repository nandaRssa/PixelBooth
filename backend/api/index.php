<?php

// Check if request is debug dump
if (isset($_GET['__dump_server'])) {
    header('Content-Type: application/json');
    echo json_encode($_SERVER, JSON_PRETTY_PRINT);
    exit;
}

// Setup writable storage and bootstrap cache dirs in /tmp for serverless
$tmpDirs = [
    '/tmp/storage/framework/views',
    '/tmp/storage/framework/cache/data',
    '/tmp/storage/framework/sessions',
    '/tmp/storage/logs',
    '/tmp/bootstrap/cache',
];
foreach ($tmpDirs as $dir) {
    if (!is_dir($dir)) {
        @mkdir($dir, 0777, true);
    }
}

$_SERVER['SCRIPT_NAME'] = '/index.php';

// Forward all Vercel Serverless Function requests to Laravel's public/index.php
require __DIR__ . '/../public/index.php';
