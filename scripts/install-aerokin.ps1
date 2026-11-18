<#
.SYNOPSIS
    AeroKin User-Level Shortcut & Autostart Installer.
.DESCRIPTION
    Installs AeroKin shortcuts for the current Windows user without requiring admin privileges:
    1. Desktop shortcut ("AeroKin")
    2. Start Menu shortcut ("AeroKin")
    3. Startup folder shortcut for automatic login start (skippable via -NoAutostart)
    All shortcuts invoke start-aerokin-hidden.vbs to start the server 100% hidden.
    Supports -TargetDir and -DryRun for test isolation (Rule S7).
#>

param(
    [switch]$NoAutostart = $false,
    [switch]$Autostart = $false,
    [string]$TargetDir = "",
    [switch]$DryRun = $false
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir = [System.IO.Path]::GetFullPath((Split-Path -Parent $ScriptDir))

$VbsPath = Join-Path $RepoDir "start-aerokin-hidden.vbs"
if (-not (Test-Path $VbsPath)) {
    $VbsPath = Join-Path $RepoDir "scripts\start-aerokin-hidden.vbs"
}
$IconPath = Join-Path $RepoDir "server\public\favicon.ico"

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "           AEROKIN One-Click Setup Installer          " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "Repository root: $RepoDir"

# Determine target directories (isolated if -TargetDir passed, e.g. in tests)
if ($TargetDir) {
    $DesktopDir = Join-Path $TargetDir "Desktop"
    $StartMenuDir = Join-Path $TargetDir "StartMenu"
    $StartupDir = Join-Path $TargetDir "Startup"
} else {
    $DesktopDir = [Environment]::GetFolderPath('Desktop')
    $StartMenuDir = Join-Path [Environment]::GetFolderPath('Programs') "AeroKin"
    $StartupDir = [Environment]::GetFolderPath('Startup')
}

# Prompt for autostart if neither switch was explicitly supplied
if (-not $NoAutostart -and -not $Autostart -and -not $TargetDir) {
    if ([Environment]::UserInteractive) {
        $resp = Read-Host "Start AeroKin automatically at Windows login? (Y/n)"
        if ($resp -and $resp.Trim().ToLower() -eq 'n') {
            $NoAutostart = $true
        }
    }
}

$WscriptExe = Join-Path $env:SystemRoot "System32\wscript.exe"

$Operations = @(
    @{ Name = "Desktop"; Path = (Join-Path $DesktopDir "AeroKin.lnk"); Dir = $DesktopDir },
    @{ Name = "Start Menu"; Path = (Join-Path $StartMenuDir "AeroKin.lnk"); Dir = $StartMenuDir }
)

if (-not $NoAutostart) {
    $Operations += @{ Name = "Startup (Auto-login)"; Path = (Join-Path $StartupDir "AeroKin.lnk"); Dir = $StartupDir }
}

if ($DryRun) {
    Write-Host "[DryRun] Validated target shortcuts:" -ForegroundColor Yellow
    foreach ($op in $Operations) {
        Write-Host "  • [$($op.Name)] -> $($op.Path)" -ForegroundColor Yellow
    }
    Write-Host "[DryRun] Target hidden launcher: $VbsPath" -ForegroundColor Yellow
    Write-Host "[DryRun] Target icon: $IconPath" -ForegroundColor Yellow
    exit 0
}

$WshShell = New-Object -ComObject WScript.Shell

foreach ($op in $Operations) {
    if (-not (Test-Path $op.Dir)) {
        New-Item -ItemType Directory -Path $op.Dir -Force | Out-Null
    }
    
    $Shortcut = $WshShell.CreateShortcut($op.Path)
    $Shortcut.TargetPath = $WscriptExe
    $Shortcut.Arguments = "`"$VbsPath`""
    $Shortcut.WorkingDirectory = $RepoDir
    $Shortcut.Description = "AeroKin Remote Control Server"
    if (Test-Path $IconPath) {
        $Shortcut.IconLocation = "$IconPath,0"
    }
    $Shortcut.Save()
    Write-Host "[OK] Created $($op.Name) shortcut: $($op.Path)" -ForegroundColor Green
}

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "AeroKin installation complete!" -ForegroundColor Green
Write-Host "• Double-click the desktop shortcut or start menu shortcut to run AeroKin."
if (-not $NoAutostart) {
    Write-Host "• AeroKin will automatically start hidden whenever you sign in to Windows."
}
Write-Host "• To configure or uninstall: run aerokin autostart status or uninstall-aerokin.cmd."
Write-Host "======================================================" -ForegroundColor Cyan
