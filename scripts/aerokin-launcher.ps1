<#
.SYNOPSIS
    AeroKin Single-Instance Background Server & Supervisor Launcher.
.DESCRIPTION
    Launches the AeroKin server hidden without a terminal window.
    Features:
    - Dynamic repository localization (zero hardcoded paths)
    - Named mutex single-instance enforcement (second launch opens PC dashboard)
    - Node.js & FFmpeg environment verification with native GUI message box
    - First-run check: installs dependencies and builds ONLY if missing (with progress notice)
    - Supervised auto-restart after unexpected crashes with exponential backoff
    - Graceful termination when Quit is selected from tray
    - Size-capped log rotation writing to %LOCALAPPDATA%\AeroKin\logs\aerokin.log
    - First-run onboarding: automatically opens PC dashboard once on initial launch
#>

param(
    [string]$RepoDir = "",
    [switch]$NoTray = $false,
    [switch]$DryRun = $false,
    [int]$MaxRestartsPerMinute = 5,
    [int]$Port = 8443,
    [string]$MutexName = "Global\AeroKin_Server_Launcher_Mutex",
    [switch]$NoFirstRunDashboard = $false,
    [switch]$CheckOnly = $false,
    [switch]$Silent = $false
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

function Show-LauncherDialog(
    [string]$Text,
    [string]$Title,
    [System.Windows.Forms.MessageBoxButtons]$Buttons = [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]$Icon = [System.Windows.Forms.MessageBoxIcon]::Information
) {
    if ($Silent -or -not [Environment]::UserInteractive) {
        [Console]::Error.WriteLine("[$Title] $Text")
        return [System.Windows.Forms.DialogResult]::OK
    }
    return [System.Windows.Forms.MessageBox]::Show($Text, $Title, $Buttons, $Icon)
}

# 1. Resolve repository directory dynamically
if (-not $RepoDir) {
    $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $RepoDir = Split-Path -Parent $ScriptDir
}
$RepoDir = [System.IO.Path]::GetFullPath($RepoDir)

$ServerDir = Join-Path $RepoDir "server"
$ServerPackageJson = Join-Path $ServerDir "package.json"
if (-not (Test-Path $ServerPackageJson)) {
    Show-LauncherDialog `
        -Text "AeroKin repository not found at:`n$RepoDir`n`nPlease verify AeroKin is installed correctly." `
        -Title "AeroKin Launcher Error" `
        -Buttons ([System.Windows.Forms.MessageBoxButtons]::OK) `
        -Icon ([System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    exit 1
}

# 2. Check Node.js and FFmpeg prerequisites
$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
    Show-LauncherDialog `
        -Text "Node.js was not found in your system PATH.`n`nPlease install Node.js (v18+) from https://nodejs.org/ to run AeroKin." `
        -Title "AeroKin Launcher Error" `
        -Buttons ([System.Windows.Forms.MessageBoxButtons]::OK) `
        -Icon ([System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    exit 1
}

$FfmpegCmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
$LocalFfmpeg = Join-Path $RepoDir "tools\ffmpeg\bin\ffmpeg.exe"
if (-not $FfmpegCmd -and -not (Test-Path $LocalFfmpeg)) {
    Show-LauncherDialog `
        -Text "FFmpeg was not found in PATH or tools\ffmpeg\bin.`n`nDesktop streaming requires FFmpeg. You can provision it by running scripts\provision-ffmpeg.ps1." `
        -Title "AeroKin Notice" `
        -Buttons ([System.Windows.Forms.MessageBoxButtons]::OK) `
        -Icon ([System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
}

if ($CheckOnly) {
    exit 0
}

# 3. Setup user data and logging paths
$UserDataDir = Join-Path $env:LOCALAPPDATA "AeroKin"
$LogDir = Join-Path $UserDataDir "logs"
$LogFile = Join-Path $LogDir "aerokin.log"
$QuitSignalFile = Join-Path $UserDataDir "quit.signal"
$RestartSignalFile = Join-Path $UserDataDir "restart.signal"
$FirstRunFlagFile = Join-Path $UserDataDir ".first-run-completed"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Write-AeroKinLog([string]$Message) {
    $Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss.fff")
    $Line = "[$Timestamp] [Launcher] $Message"
    try {
        Add-Content -Path $LogFile -Value $Line -ErrorAction SilentlyContinue
    } catch {}
}

function Rotate-AeroKinLog {
    param(
        [string]$Path,
        [long]$MaxBytes = 5242880, # 5 MB
        [int]$MaxBackups = 3
    )
    if (Test-Path $Path) {
        $file = Get-Item $Path
        if ($file.Length -gt $MaxBytes) {
            for ($i = $MaxBackups - 1; $i -ge 1; $i--) {
                $src = "$Path.$i"
                $dest = "$Path.$($i + 1)"
                if (Test-Path $src) {
                    Move-Item -Path $src -Destination $dest -Force -ErrorAction SilentlyContinue
                }
            }
            Move-Item -Path $Path -Destination "$Path.1" -Force -ErrorAction SilentlyContinue
        }
    }
}

# 4. Enforce Single Instance via Named Mutex & Port check
$createdNew = $false
$Mutex = $null
try {
    $Mutex = New-Object System.Threading.Mutex($true, $MutexName, [ref]$createdNew)
} catch {
    $createdNew = $false
}

if (-not $createdNew) {
    Write-AeroKinLog "Secondary launch detected. An AeroKin instance is already active."
    # Open dashboard in browser for user convenience
    try {
        Start-Process "https://localhost:$Port/dashboard"
    } catch {}
    exit 0
}

# Check if port 8443 or 8080 is in use
$PortsToCheck = @($Port, 8080)
foreach ($p in $PortsToCheck) {
    $conn = $null
    try {
        $conn = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    } catch {}

    if ($conn) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        $procName = if ($proc) { $proc.ProcessName } else { "Unknown Process (PID $($conn.OwningProcess))" }

        # If it's node on port 8443, it's an existing AeroKin instance
        if ($procName -match "node" -and $p -eq $Port) {
            Write-AeroKinLog "Port $p is already in use by active AeroKin node instance. Opening dashboard."
            try {
                Start-Process "https://localhost:$Port/dashboard"
            } catch {}
            exit 0
        } else {
            Write-AeroKinLog "[ERROR] Port $p is already in use by process '$procName' (PID $($conn.OwningProcess))."
            Show-LauncherDialog `
                -Text "Cannot start AeroKin: Port $p is already in use by '$procName' (PID $($conn.OwningProcess)).`n`nPlease close '$procName' or resolve the port conflict to continue." `
                -Title "AeroKin Port Conflict" `
                -Buttons ([System.Windows.Forms.MessageBoxButtons]::OK) `
                -Icon ([System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
            exit 1
        }
    }
}

if ($DryRun) {
    Write-AeroKinLog "Dry-run mode active. Environment verified. Exiting."
    exit 0
}

# 5. Build check: first-run OR stale build detection
$ServerDist = Join-Path $ServerDir "dist\index.js"
$PublicIndex = Join-Path $ServerDir "public\index.html"
$NeedsBuild = (-not (Test-Path $ServerDist)) -or (-not (Test-Path $PublicIndex))

if (-not $NeedsBuild) {
    try {
        $distTime = (Get-Item $ServerDist).LastWriteTimeUtc
        $publicTime = (Get-Item $PublicIndex).LastWriteTimeUtc
        $stamp = if ($distTime -lt $publicTime) { $distTime } else { $publicTime }

        $srcFiles = Get-ChildItem -Path (Join-Path $ServerDir "src"), (Join-Path $RepoDir "pwa\src") -Recurse -File -Include "*.ts","*.tsx","*.js","*.json","*.html" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTimeUtc -Descending |
            Select-Object -First 1

        if ($srcFiles -and $srcFiles.LastWriteTimeUtc -gt $stamp) {
            Write-AeroKinLog "Stale build detected ($($srcFiles.Name) modified after build stamp). Rebuilding..."
            $NeedsBuild = $true
        }
    } catch {}
}

if ($NeedsBuild) {
    Write-AeroKinLog "First-run or unbuilt state detected. Displaying setup notice..."

    $Splash = New-Object System.Windows.Forms.Form
    $Splash.Text = "AeroKin Setup"
    $Splash.Size = New-Object System.Drawing.Size(420, 160)
    $Splash.StartPosition = "CenterScreen"
    $Splash.FormBorderStyle = "FixedDialog"
    $Splash.MaximizeBox = $false
    $Splash.MinimizeBox = $false
    $Splash.TopMost = $true

    $Label = New-Object System.Windows.Forms.Label
    $Label.Text = "AeroKin First-Run Setup`nInstalling dependencies and compiling packages...`nPlease wait a moment."
    $Label.AutoSize = $false
    $Label.Size = New-Object System.Drawing.Size(380, 60)
    $Label.Location = New-Object System.Drawing.Point(20, 20)
    $Label.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Regular)
    $Splash.Controls.Add($Label)

    $ProgressBar = New-Object System.Windows.Forms.ProgressBar
    $ProgressBar.Style = "Marquee"
    $ProgressBar.MarqueeAnimationSpeed = 30
    $ProgressBar.Size = New-Object System.Drawing.Size(360, 20)
    $ProgressBar.Location = New-Object System.Drawing.Point(20, 85)
    $Splash.Controls.Add($ProgressBar)

    $Splash.Show()
    $Splash.Refresh()

    Push-Location $RepoDir
    try {
        Write-AeroKinLog "Executing: pnpm install --frozen-lockfile"
        & pnpm install --frozen-lockfile | Out-Null
        Write-AeroKinLog "Executing: pnpm run build"
        & pnpm run build | Out-Null
        Write-AeroKinLog "First-run compilation complete."
    } catch {
        Write-AeroKinLog "[ERROR] First-run build failed: $_"
        Show-LauncherDialog `
            -Text "AeroKin initial build failed.`nPlease see logs at:`n$LogFile" `
            -Title "AeroKin Build Error" `
            -Buttons ([System.Windows.Forms.MessageBoxButtons]::OK) `
            -Icon ([System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
        exit 1
    } finally {
        Pop-Location
        $Splash.Close()
        $Splash.Dispose()
    }
}

# 6. Clean up any stale signals
Remove-Item $QuitSignalFile -Force -ErrorAction SilentlyContinue
Remove-Item $RestartSignalFile -Force -ErrorAction SilentlyContinue

# 7. Start Tray Sidecar helper
$TrayScript = Join-Path $ServerDir "scripts\tray-sidecar.ps1"
$TrayProcess = $null
function Start-TraySidecar {
    if ($NoTray -or -not (Test-Path $TrayScript)) { return $null }
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "powershell.exe"
        $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$TrayScript`" -Port $Port"
        $psi.WorkingDirectory = $ServerDir
        $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
        $psi.CreateNoWindow = $true
        $psi.UseShellExecute = $true
        return [System.Diagnostics.Process]::Start($psi)
    } catch {
        Write-AeroKinLog "[WARN] Failed to start Tray sidecar: $_"
        return $null
    }
}

$TrayProcess = Start-TraySidecar

# 8. First-Run Dashboard open check
$IsFirstRun = -not (Test-Path $FirstRunFlagFile)
if ($IsFirstRun -and -not $NoFirstRunDashboard) {
    # Start a lightweight background job to open dashboard once server is ready
    Start-Job -ScriptBlock {
        param($Port, $FlagFile)
        # Wait up to 15 seconds for server to respond on loopback
        $deadline = (Get-Date).AddSeconds(15)
        $ready = $false
        while ((Get-Date) -lt $deadline) {
            try {
                $tcp = New-Object System.Net.Sockets.TcpClient
                $iar = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
                $connected = $iar.AsyncWaitHandle.WaitOne(300, $false)
                if ($connected -and $tcp.Connected) {
                    $ready = $true
                    $tcp.EndConnect($iar)
                    $tcp.Close()
                    break
                }
            } catch {}
            Start-Sleep -Milliseconds 400
        }
        if ($ready) {
            Start-Sleep -Milliseconds 500
            try {
                Start-Process "https://localhost:$Port/dashboard"
                Set-Content -Path $FlagFile -Value (Get-Date).ToString("o") -Force
            } catch {}
        }
    } -ArgumentList $Port, $FirstRunFlagFile | Out-Null
}

# 9. Supervised Execution & Auto-Restart Loop
Write-AeroKinLog "Starting AeroKin server supervisor loop (Max restarts/min: $MaxRestartsPerMinute)..."
$CrashHistory = New-Object System.Collections.Generic.List[datetime]

try {
    while ($true) {
        Rotate-AeroKinLog -Path $LogFile -MaxBytes 5242880 -MaxBackups 3

        # Ensure Tray is running if not -NoTray
        if (-not $NoTray -and ($TrayProcess -eq $null -or $TrayProcess.HasExited)) {
            $TrayProcess = Start-TraySidecar
        }

        Write-AeroKinLog "Launching node dist/index.js (working directory: $ServerDir)"

        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $NodeCmd.Source
        $psi.Arguments = "dist/index.js"
        $psi.WorkingDirectory = $ServerDir
        $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
        $psi.CreateNoWindow = $true
        $psi.UseShellExecute = $false
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true

        $ServerProc = New-Object System.Diagnostics.Process
        $ServerProc.StartInfo = $psi

        # Stream output to log file
        $OutHandler = {
            if ($EventArgs.Data) {
                Add-Content -Path $using:LogFile -Value $EventArgs.Data -ErrorAction SilentlyContinue
            }
        }
        $ErrHandler = {
            if ($EventArgs.Data) {
                Add-Content -Path $using:LogFile -Value ("[ERR] " + $EventArgs.Data) -ErrorAction SilentlyContinue
            }
        }

        $ServerProc.EnableRaisingEvents = $true
        Register-ObjectEvent -InputObject $ServerProc -EventName "OutputDataReceived" -Action $OutHandler | Out-Null
        Register-ObjectEvent -InputObject $ServerProc -EventName "ErrorDataReceived" -Action $ErrHandler | Out-Null

        $started = $ServerProc.Start()
        if (-not $started) {
            Write-AeroKinLog "[FATAL] Failed to start node process."
            break
        }

        $ServerProc.BeginOutputReadLine()
        $ServerProc.BeginErrorReadLine()

        Write-AeroKinLog "Server process started with PID: $($ServerProc.Id)"

        $ServerProc.WaitForExit()
        $ExitCode = $ServerProc.ExitCode

        Write-AeroKinLog "Server process exited with code: $ExitCode"

        # Check if user requested Quit from tray
        if (Test-Path $QuitSignalFile) {
            Remove-Item $QuitSignalFile -Force -ErrorAction SilentlyContinue
            Write-AeroKinLog "Quit signal detected from tray. Shutting down AeroKin gracefully."
            if ($TrayProcess -and -not $TrayProcess.HasExited) {
                try { $TrayProcess.Kill() } catch {}
            }
            break
        }

        # Check if user requested Restart from tray
        if (Test-Path $RestartSignalFile) {
            Remove-Item $RestartSignalFile -Force -ErrorAction SilentlyContinue
            Write-AeroKinLog "Restart signal detected from tray. Restarting server immediately."
            $CrashHistory.Clear()
            Start-Sleep -Milliseconds 600
            continue
        }

        # If clean exit (exit code 0), do not restart
        if ($ExitCode -eq 0) {
            Write-AeroKinLog "Server stopped cleanly (exit code 0). Exiting supervisor."
            if ($TrayProcess -and -not $TrayProcess.HasExited) {
                try { $TrayProcess.Kill() } catch {}
            }
            break
        }

        # Unexpected crash: evaluate crash threshold
        $Now = Get-Date
        $Recent = @($CrashHistory | Where-Object { $_ -gt $Now.AddSeconds(-60) })
        $CrashHistory.Clear()
        foreach ($r in $Recent) { $CrashHistory.Add($r) }
        $CrashHistory.Add($Now)

        if ($CrashHistory.Count -ge $MaxRestartsPerMinute) {
            $ErrMsg = "Server crashed $($CrashHistory.Count) times within 60 seconds. Exceeded threshold ($MaxRestartsPerMinute). Stopping supervisor."
            Write-AeroKinLog "[FATAL] $ErrMsg"
            Show-LauncherDialog `
                -Text "AeroKin stopped after repeated crashes.`n`nPlease check the logs at:`n$LogFile" `
                -Title "AeroKin Crashed" `
                -Buttons ([System.Windows.Forms.MessageBoxButtons]::OK) `
                -Icon ([System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
            if ($TrayProcess -and -not $TrayProcess.HasExited) {
                try { $TrayProcess.Kill() } catch {}
            }
            break
        }

        # Exponential backoff: 1s, 2s, 4s, 8s (capped at 16s)
        $BackoffSec = [Math]::Min(16, [Math]::Pow(2, $CrashHistory.Count - 1))
        Write-AeroKinLog "[WARN] Server crashed. Restarting in $BackoffSec s (Crash count: $($CrashHistory.Count)/$MaxRestartsPerMinute)..."
        Start-Sleep -Seconds $BackoffSec
    }
} finally {
    if ($Mutex) {
        try {
            $Mutex.ReleaseMutex()
            $Mutex.Dispose()
        } catch {}
    }
}
