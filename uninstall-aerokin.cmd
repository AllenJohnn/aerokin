@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\uninstall-aerokin.ps1" %*
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Uninstallation exited with code %ERRORLEVEL%.
    pause
    exit /b %ERRORLEVEL%
)
endlocal
