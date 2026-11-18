<#
.SYNOPSIS
    AeroKin Safe In-Place Update Script.
.DESCRIPTION
    1. Stops running AeroKin server and tray sidecar
    2. Runs git pull (preserving all local changes)
    3. Runs pnpm install --frozen-lockfile
    4. Compiles all packages (design-system, signaling, server, pwa)
    5. Restarts AeroKin hidden in background
#>

param(
    [switch]$NoRestart = $false
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir = [System.IO.Path]::GetFullPath((Split-Path -Parent $ScriptDir))

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "               AEROKIN Update Helper                  " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "Repository root: $RepoDir"

# 1. Stop existing server
Write-Host "`n[1/5] Stopping active AeroKin processes..." -ForegroundColor Yellow
$UserDataDir = Join-Path $env:LOCALAPPDATA "AeroKin"
$QuitSignalFile = Join-Path $UserDataDir "quit.signal"
try {
    if (-not (Test-Path $UserDataDir)) {
        New-Item -ItemType Directory -Path $UserDataDir -Force | Out-Null
    }
    Set-Content -Path $QuitSignalFile -Value "quit" -Force
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    Invoke-RestMethod -Uri "https://127.0.0.1:8443/api/dashboard/quit" -Method Post -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
} catch {}
Start-Sleep -Seconds 1

# 2. Git Pull (never discard local changes)
Write-Host "[2/5] Pulling latest repository updates (git pull)..." -ForegroundColor Yellow
Push-Location $RepoDir
try {
    $pullOutput = git pull 2>&1
    Write-Host $pullOutput
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n[ERROR] git pull failed. Any local changes were preserved untouched." -ForegroundColor Red
        Write-Host "Please resolve git state or check network connection, then rerun update-aerokin.cmd." -ForegroundColor Red
        Pop-Location
        exit 1
    }
} catch {
    Write-Host "`n[ERROR] Error during git pull: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}

# 3. pnpm install
Write-Host "`n[3/5] Installing package dependencies (pnpm install --frozen-lockfile)..." -ForegroundColor Yellow
try {
    $installOutput = pnpm install --frozen-lockfile 2>&1
    Write-Host $installOutput
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n[ERROR] pnpm install failed. Please check package dependencies." -ForegroundColor Red
        Pop-Location
        exit 1
    }
} catch {
    Write-Host "`n[ERROR] Error during pnpm install: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}

# 4. Rebuild all packages
Write-Host "`n[4/5] Recompiling all AeroKin packages (pnpm run build)..." -ForegroundColor Yellow
try {
    $buildOutput = pnpm run build 2>&1
    Write-Host $buildOutput
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n[ERROR] Build failed. Please inspect build output above." -ForegroundColor Red
        Pop-Location
        exit 1
    }
} catch {
    Write-Host "`n[ERROR] Error during build: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# 5. Restart server hidden
if (-not $NoRestart) {
    Write-Host "`n[5/5] Restarting AeroKin in background..." -ForegroundColor Yellow
    $VbsPath = Join-Path $RepoDir "start-aerokin-hidden.vbs"
    if (Test-Path $VbsPath) {
        Start-Process "wscript.exe" -ArgumentList "`"$VbsPath`""
    } else {
        $Ps1 = Join-Path $RepoDir "scripts\aerokin-launcher.ps1"
        Start-Process "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Ps1`""
    }
    Write-Host "AeroKin restarted successfully!" -ForegroundColor Green
}

Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "Update completed successfully!" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Cyan
