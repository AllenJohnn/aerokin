<#
.SYNOPSIS
    AeroKin User-Level Shortcut & Autostart Uninstaller.
.DESCRIPTION
    Removes exactly the Desktop, Start Menu, and Startup folder shortcuts created by install-aerokin.
    Operates strictly within user profile privileges (no admin required).
    Supports -TargetDir and -DryRun for test isolation (Rule S7).
#>

param(
    [string]$TargetDir = "",
    [switch]$DryRun = $false
)

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "          AEROKIN Shortcut & Autostart Removal        " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

if ($TargetDir) {
    $DesktopDir = Join-Path $TargetDir "Desktop"
    $StartMenuDir = Join-Path $TargetDir "StartMenu"
    $StartupDir = Join-Path $TargetDir "Startup"
} else {
    $DesktopDir = [Environment]::GetFolderPath('Desktop')
    $StartMenuDir = Join-Path [Environment]::GetFolderPath('Programs') "AeroKin"
    $StartupDir = [Environment]::GetFolderPath('Startup')
}

$Targets = @(
    @{ Name = "Desktop Shortcut"; Path = (Join-Path $DesktopDir "AeroKin.lnk") },
    @{ Name = "Start Menu Shortcut"; Path = (Join-Path $StartMenuDir "AeroKin.lnk") },
    @{ Name = "Startup Folder Shortcut"; Path = (Join-Path $StartupDir "AeroKin.lnk") },
    @{ Name = "Legacy Startup Script"; Path = (Join-Path $StartupDir "AeroKin.cmd") }
)

if ($DryRun) {
    Write-Host "[DryRun] Would remove the following shortcuts if present:" -ForegroundColor Yellow
    foreach ($t in $Targets) {
        $exists = Test-Path $t.Path
        Write-Host "  • [$($t.Name)] ($($t.Path)) - Exists: $exists" -ForegroundColor Yellow
    }
    exit 0
}

$RemovedCount = 0

foreach ($t in $Targets) {
    if (Test-Path $t.Path) {
        try {
            Remove-Item -Path $t.Path -Force -ErrorAction Stop
            Write-Host "[OK] Removed $($t.Name): $($t.Path)" -ForegroundColor Green
            $RemovedCount++
        } catch {
            Write-Host "[WARN] Could not remove $($t.Name): $_" -ForegroundColor Yellow
        }
    }
}

# Remove empty Start Menu subfolder if applicable
if (-not $TargetDir -and (Test-Path $StartMenuDir)) {
    $remaining = Get-ChildItem -Path $StartMenuDir -Force -ErrorAction SilentlyContinue
    if (-not $remaining) {
        try {
            Remove-Item -Path $StartMenuDir -Force -Recurse -ErrorAction SilentlyContinue
        } catch {}
    }
}

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "Uninstall complete. Removed $RemovedCount shortcut(s)." -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Cyan
