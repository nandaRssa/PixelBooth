@echo off
title PixelBooth - Cloudflare Tunnel HTTPS
echo ========================================================
echo   PixelBooth - Cloudflare HTTPS Tunnel untuk iPad & Web
echo ========================================================
echo.
echo Menghubungkan Backend Laravel Lokal ke Cloudflare HTTPS...
echo.
cloudflared.exe tunnel --url http://127.0.0.1:8000
pause
