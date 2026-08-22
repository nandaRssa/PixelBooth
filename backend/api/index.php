<?php

// Restore original requested URI from ?url= rewrite query parameter
if (!empty($_GET['url'])) {
    $url = '/' . ltrim($_GET['url'], '/');
    $_SERVER['REQUEST_URI'] = $url;
    $_SERVER['PATH_INFO'] = $url;
}

$_SERVER['SCRIPT_NAME'] = '/index.php';

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

// Forward all Vercel Serverless Function requests to Laravel's public/index.php
require __DIR__ . '/../public/index.php';
