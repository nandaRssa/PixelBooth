<?php

// Fix Vercel Serverless SCRIPT_NAME so Laravel parses /api routes correctly
$_SERVER['SCRIPT_NAME'] = '/index.php';

// Forward all Vercel Serverless Function requests to Laravel's public/index.php
require __DIR__ . '/../public/index.php';
