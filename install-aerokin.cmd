@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-aerokin.ps1" %*
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Installation exited with code %ERRORLEVEL%.
    pause
    exit /b %ERRORLEVEL%
)
endlocal
