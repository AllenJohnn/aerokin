@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-aerokin.ps1" %*
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Update encountered an error.
    pause
    exit /b %ERRORLEVEL%
)
endlocal
