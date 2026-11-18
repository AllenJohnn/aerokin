<#
.SYNOPSIS
    AeroKin Windows CLI Management Utility.
.DESCRIPTION
    Provides unified management commands:
    aerokin autostart on|off|status
    aerokin start|stop|restart|status|logs|update
#>

param(
    [Parameter(Position = 0)]
    [string]$Command = "help",

    [Parameter(Position = 1)]
    [string]$SubCommand = "",

    [string]$TargetDir = "",
    [switch]$DryRun = $false
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir = [System.IO.Path]::GetFullPath((Split-Path -Parent $ScriptDir))

$UserDataDir = Join-Path $env:LOCALAPPDATA "AeroKin"
$LogDir = Join-Path $UserDataDir "logs"
$LogFile = Join-Path $LogDir "aerokin.log"
$QuitSignalFile = Join-Path $UserDataDir "quit.signal"
$RestartSignalFile = Join-Path $UserDataDir "restart.signal"

if ($TargetDir) {
    $StartupDir = Join-Path $TargetDir "Startup"
} else {
    $StartupDir = [Environment]::GetFolderPath('Startup')
}
$StartupShortcut = Join-Path $StartupDir "AeroKin.lnk"
$StartupCmd = Join-Path $StartupDir "AeroKin.cmd"

function Get-AutostartStatus {
    $hasLnk = Test-Path $StartupShortcut
    $hasCmd = Test-Path $StartupCmd
    if ($hasLnk) {
        return @{ Enabled = $true; Path = $StartupShortcut; Type = "Shortcut (.lnk)" }
    } elseif ($hasCmd) {
        return @{ Enabled = $true; Path = $StartupCmd; Type = "Legacy Script (.cmd)" }
    } else {
        return @{ Enabled = $false; Path = $StartupShortcut; Type = "None" }
    }
}

switch ($Command.ToLower()) {
    "autostart" {
        switch ($SubCommand.ToLower()) {
            "on" {
                if ($DryRun) {
                    Write-Host "[DryRun] Would enable autostart at: $StartupShortcut" -ForegroundColor Yellow
                    exit 0
                }
                if (-not (Test-Path $StartupDir)) {
                    New-Item -ItemType Directory -Path $StartupDir -Force | Out-Null
                }
                $VbsPath = Join-Path $RepoDir "start-aerokin-hidden.vbs"
                if (-not (Test-Path $VbsPath)) {
                    $VbsPath = Join-Path $RepoDir "scripts\start-aerokin-hidden.vbs"
                }
                $IconPath = Join-Path $RepoDir "server\public\favicon.ico"
                $WscriptExe = Join-Path $env:SystemRoot "System32\wscript.exe"

                $WshShell = New-Object -ComObject WScript.Shell
                $Shortcut = $WshShell.CreateShortcut($StartupShortcut)
                $Shortcut.TargetPath = $WscriptExe
                $Shortcut.Arguments = "`"$VbsPath`""
                $Shortcut.WorkingDirectory = $RepoDir
                $Shortcut.Description = "AeroKin Remote Control Server"
                if (Test-Path $IconPath) {
                    $Shortcut.IconLocation = "$IconPath,0"
                }
                $Shortcut.Save()
                Write-Host "[OK] AeroKin autostart enabled: $StartupShortcut" -ForegroundColor Green
            }
            "off" {
                if ($DryRun) {
                    Write-Host "[DryRun] Would disable autostart by removing: $StartupShortcut and $StartupCmd" -ForegroundColor Yellow
                    exit 0
                }
                $removed = $false
                if (Test-Path $StartupShortcut) {
                    Remove-Item $StartupShortcut -Force -ErrorAction SilentlyContinue
                    $removed = $true
                }
                if (Test-Path $StartupCmd) {
                    Remove-Item $StartupCmd -Force -ErrorAction SilentlyContinue
                    $removed = $true
                }
                if ($removed) {
                    Write-Host "[OK] AeroKin autostart disabled." -ForegroundColor Green
                } else {
                    Write-Host "[OK] AeroKin autostart was already disabled." -ForegroundColor Gray
                }
            }
            "status" {
                $st = Get-AutostartStatus
                if ($st.Enabled) {
                    Write-Host "AeroKin Autostart: ENABLED ($($st.Type))" -ForegroundColor Green
                    Write-Host "Entry path:        $($st.Path)"
                } else {
                    Write-Host "AeroKin Autostart: DISABLED" -ForegroundColor Yellow
                }
            }
            default {
                Write-Host "Usage: aerokin autostart on | off | status" -ForegroundColor Yellow
            }
        }
    }

    "start" {
        $VbsPath = Join-Path $RepoDir "start-aerokin-hidden.vbs"
        Start-Process "wscript.exe" -ArgumentList "`"$VbsPath`""
        Write-Host "AeroKin server launched in background." -ForegroundColor Green
    }

    "stop" {
        Set-Content -Path $QuitSignalFile -Value "quit" -Force
        # Also attempt loopback HTTP quit
        try {
            [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
            Invoke-RestMethod -Uri "https://127.0.0.1:8443/api/dashboard/quit" -Method Post -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
        } catch {}
        Write-Host "Stop signal sent to AeroKin server." -ForegroundColor Yellow
    }

    "restart" {
        Set-Content -Path $RestartSignalFile -Value "restart" -Force
        try {
            [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
            Invoke-RestMethod -Uri "https://127.0.0.1:8443/api/dashboard/restart" -Method Post -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
        } catch {}
        Write-Host "Restart signal sent to AeroKin server." -ForegroundColor Green
    }

    "status" {
        try {
            [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
            $res = Invoke-RestMethod -Uri "https://127.0.0.1:8443/health" -Method Get -TimeoutSec 2
            Write-Host "AeroKin Server: RUNNING" -ForegroundColor Green
            Write-Host "Dashboard:      https://localhost:8443/dashboard"
        } catch {
            Write-Host "AeroKin Server: NOT RUNNING" -ForegroundColor Red
        }
    }

    "logs" {
        if (Test-Path $LogDir) {
            [System.Diagnostics.Process]::Start("explorer.exe", $LogDir) | Out-Null
        } else {
            Write-Host "Logs folder not created yet ($LogDir)." -ForegroundColor Gray
        }
    }

    "update" {
        & "$RepoDir\scripts\update-aerokin.ps1"
    }

    default {
        Write-Host "======================================================" -ForegroundColor Cyan
        Write-Host "                 AEROKIN CLI Control                  " -ForegroundColor Cyan
        Write-Host "======================================================" -ForegroundColor Cyan
        Write-Host "Usage: aerokin <command> [options]"
        Write-Host ""
        Write-Host "Commands:"
        Write-Host "  autostart on      Enable automatic launch at Windows login"
        Write-Host "  autostart off     Disable automatic launch at login"
        Write-Host "  autostart status  Display autostart state"
        Write-Host "  start             Start AeroKin hidden in background"
        Write-Host "  stop              Stop running AeroKin server and tray"
        Write-Host "  restart           Restart running AeroKin server"
        Write-Host "  status            Check whether AeroKin server is responding"
        Write-Host "  logs              Open local log files directory"
        Write-Host "  update            Pull latest code, rebuild, and restart"
        Write-Host "======================================================" -ForegroundColor Cyan
    }
}
