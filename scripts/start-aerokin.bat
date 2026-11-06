@echo off
title AEROKIN Windows Server
echo ======================================================
echo           AEROKIN Remote Control Server               
echo      "Move the air. Move your Windows PC."            
echo ======================================================
echo.

cd /d "%~dp0\.."

where pnpm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] pnpm is not installed or not in PATH.
    echo Please install pnpm via: npm install -g pnpm
    pause
    exit /b 1
)

echo [1/2] Verifying FFmpeg provisioning...
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\provision-ffmpeg.ps1

echo [2/2] Launching AEROKIN Server...
pnpm --filter aerokin-server start
pause
