<#
.SYNOPSIS
    AEROKIN Windows System Tray Indicator & Quick Controls Sidecar.
.DESCRIPTION
    Runs a NotifyIcon in the Windows system notification area.
    Provides 1-click access to open dashboard, show pairing code, generate new code,
    toggle trusted network mode, toggle remote input pause switch, open logs folder,
    restart AeroKin, and quit.
#>

param(
    [int]$Port = 8443,
    [string]$LanIp = "127.0.0.1",
    [string]$Hostname = ""
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

$BaseUrl = "https://127.0.0.1:$Port"
$DashUrl = "$BaseUrl/dashboard"
$UserDataDir = Join-Path $env:LOCALAPPDATA "AeroKin"
$LogDir = Join-Path $UserDataDir "logs"
$QuitSignalFile = Join-Path $UserDataDir "quit.signal"
$RestartSignalFile = Join-Path $UserDataDir "restart.signal"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# Allow self-signed certificates for local loopback queries
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$NotifyIcon = New-Object System.Windows.Forms.NotifyIcon
$NotifyIcon.Text = "AEROKIN Remote Control"

# Resolve AeroKin icon
$IconFound = $false
$IconCandidates = @(
    (Join-Path $PSScriptRoot "..\public\favicon.ico"),
    (Join-Path $PSScriptRoot "..\..\server\public\favicon.ico"),
    (Join-Path $PSScriptRoot "..\..\pwa\public\favicon.ico")
)
foreach ($cand in $IconCandidates) {
    if (Test-Path $cand) {
        try {
            $NotifyIcon.Icon = New-Object System.Drawing.Icon([System.IO.Path]::GetFullPath($cand))
            $IconFound = $true
            break
        } catch {}
    }
}
if (-not $IconFound) {
    $NotifyIcon.Icon = [System.Drawing.SystemIcons]::Application
}
$NotifyIcon.Visible = $true

# Helper for hardened loopback requests with custom header
function Invoke-AeroKinApi([string]$Path, [string]$Method = "GET", [object]$Body = $null) {
    try {
        $Headers = @{
            "X-AeroKin-Local" = "1"
        }
        $Params = @{
            Uri = "$BaseUrl$Path"
            Method = $Method
            UseBasicParsing = $true
            TimeoutSec = 3
            Headers = $Headers
        }
        if ($Body) {
            $Params["Body"] = ($Body | ConvertTo-Json -Compress)
            $Params["ContentType"] = "application/json"
        }
        $Response = Invoke-WebRequest @Params
        return ($Response.Content | ConvertFrom-Json)
    } catch {
        return $null
    }
}

# Context Menu setup
$ContextMenu = New-Object System.Windows.Forms.ContextMenuStrip

$MenuDash = New-Object System.Windows.Forms.ToolStripMenuItem("Open Dashboard")
$MenuPair = New-Object System.Windows.Forms.ToolStripMenuItem("Show Pairing Code")
$MenuNewCode = New-Object System.Windows.Forms.ToolStripMenuItem("New Pairing Code")
$MenuTrusted = New-Object System.Windows.Forms.ToolStripMenuItem("Trusted Network Mode")
$MenuPause = New-Object System.Windows.Forms.ToolStripMenuItem("Pause Remote Input")
$MenuLogs = New-Object System.Windows.Forms.ToolStripMenuItem("Open Logs Folder")
$MenuRestart = New-Object System.Windows.Forms.ToolStripMenuItem("Restart AeroKin")
$MenuSeparator = New-Object System.Windows.Forms.ToolStripSeparator
$MenuExit = New-Object System.Windows.Forms.ToolStripMenuItem("Quit")

$ContextMenu.Items.Add($MenuDash) | Out-Null
$ContextMenu.Items.Add($MenuPair) | Out-Null
$ContextMenu.Items.Add($MenuNewCode) | Out-Null
$ContextMenu.Items.Add($MenuTrusted) | Out-Null
$ContextMenu.Items.Add($MenuPause) | Out-Null
$ContextMenu.Items.Add($MenuLogs) | Out-Null
$ContextMenu.Items.Add($MenuRestart) | Out-Null
$ContextMenu.Items.Add($MenuSeparator) | Out-Null
$ContextMenu.Items.Add($MenuExit) | Out-Null

$NotifyIcon.ContextMenuStrip = $ContextMenu

# Open Dashboard Click & Double Click
$MenuDash.add_Click({
    [System.Diagnostics.Process]::Start($DashUrl) | Out-Null
})

$NotifyIcon.add_DoubleClick({
    [System.Diagnostics.Process]::Start($DashUrl) | Out-Null
})

# Show Pairing Code
$MenuPair.add_Click({
    $Status = Invoke-AeroKinApi -Path "/api/dashboard/status"
    $ActiveCode = if ($Status -and $Status.pairing) { $Status.pairing.code } else { $null }
    $SecRemaining = if ($Status -and $Status.pairing) { $Status.pairing.expiresInSeconds } else { 0 }
    if (-not $ActiveCode) {
        $Regen = Invoke-AeroKinApi -Path "/api/pair/regenerate" -Method "POST"
        if ($Regen -and $Regen.code) {
            $ActiveCode = $Regen.code
            $SecRemaining = $Regen.expiresInSeconds
        }
    }
    if ($ActiveCode) {
        $NotifyIcon.ShowBalloonTip(6000, "AeroKin Pairing Code", "8-digit Code: $ActiveCode (${SecRemaining}s remaining)`nEnter this code on your phone when trusted mode is OFF.", [System.Windows.Forms.ToolTipIcon]::Info)
    } else {
        $NotifyIcon.ShowBalloonTip(4000, "AeroKin Pairing", "Server starting or offline. Open dashboard to view status.", [System.Windows.Forms.ToolTipIcon]::Warning)
    }
})

# Generate New Pairing Code
$MenuNewCode.add_Click({
    $Regen = Invoke-AeroKinApi -Path "/api/pair/regenerate" -Method "POST"
    if ($Regen -and $Regen.code) {
        $NotifyIcon.ShowBalloonTip(6000, "New Pairing Code Generated", "New 8-digit Code: $($Regen.code) (valid for $($Regen.expiresInSeconds)s)`nEnter this code on your phone to connect.", [System.Windows.Forms.ToolTipIcon]::Info)
    }
})

# Toggle Trusted Network Mode
$MenuTrusted.add_Click({
    $Current = Invoke-AeroKinApi -Path "/api/dashboard/trusted-mode"
    $NewState = -not ($Current.trustedMode -eq $true)
    $Res = Invoke-AeroKinApi -Path "/api/dashboard/trusted-mode" -Method "POST" -Body @{ trustedMode = $NewState }
    if ($Res) {
        $MenuTrusted.Checked = $NewState
        $StatusText = if ($NewState) { "ENABLED (Instant auto-connect on local network)" } else { "DISABLED (8-digit code required)" }
        $NotifyIcon.ShowBalloonTip(4000, "AeroKin Trusted Mode", "Trusted-Network Mode is now $StatusText.", [System.Windows.Forms.ToolTipIcon]::Info)
    }
})

# Toggle Pause
$MenuPause.add_Click({
    $Current = Invoke-AeroKinApi -Path "/api/dashboard/pause"
    $NewState = -not ($Current.paused -eq $true)
    $Res = Invoke-AeroKinApi -Path "/api/dashboard/pause" -Method "POST" -Body @{ paused = $NewState }
    if ($Res) {
        $MenuPause.Checked = $NewState
        $StatusText = if ($NewState) { "PAUSED" } else { "RESUMED" }
        $NotifyIcon.ShowBalloonTip(3000, "AEROKIN Remote Control", "Remote input has been $StatusText.", [System.Windows.Forms.ToolTipIcon]::Info)
    }
})

# Open Logs Folder
$MenuLogs.add_Click({
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    [System.Diagnostics.Process]::Start("explorer.exe", $LogDir) | Out-Null
})

# Restart AeroKin
$MenuRestart.add_Click({
    try {
        Set-Content -Path $RestartSignalFile -Value "restart" -Force
        # Request server restart via loopback API
        Invoke-AeroKinApi -Path "/api/dashboard/restart" -Method "POST" | Out-Null
    } catch {}
    $NotifyIcon.Visible = $false
    $NotifyIcon.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

# Quit
$MenuExit.add_Click({
    try {
        Set-Content -Path $QuitSignalFile -Value "quit" -Force
        # Request server shutdown via loopback API
        Invoke-AeroKinApi -Path "/api/dashboard/quit" -Method "POST" | Out-Null
    } catch {}
    $NotifyIcon.Visible = $false
    $NotifyIcon.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

# Timer to sync pause and trusted mode state every 5 seconds
$SyncTimer = New-Object System.Windows.Forms.Timer
$SyncTimer.Interval = 5000
$SyncTimer.add_Tick({
    $PauseStatus = Invoke-AeroKinApi -Path "/api/dashboard/pause"
    if ($PauseStatus) {
        $MenuPause.Checked = ($PauseStatus.paused -eq $true)
    }
    $TrustStatus = Invoke-AeroKinApi -Path "/api/dashboard/trusted-mode"
    if ($TrustStatus) {
        $MenuTrusted.Checked = ($TrustStatus.trustedMode -eq $true)
    }
})
$SyncTimer.Start()

# Initial sync
$InitialPause = Invoke-AeroKinApi -Path "/api/dashboard/pause"
if ($InitialPause) {
    $MenuPause.Checked = ($InitialPause.paused -eq $true)
}
$InitialTrust = Invoke-AeroKinApi -Path "/api/dashboard/trusted-mode"
if ($InitialTrust) {
    $MenuTrusted.Checked = ($InitialTrust.trustedMode -eq $true)
}

# Startup balloon showing primary phone URL and LAN IP fallback
if (-not $Hostname) {
    try {
        $Hostname = [System.Net.Dns]::GetHostName()
    } catch {
        $Hostname = "aerokin"
    }
}
$HostClean = $Hostname.ToLower()
$PhoneUrl = "https://$($HostClean).local:$Port"
$FallbackUrl = "https://${LanIp}:$Port"
$NotifyIcon.ShowBalloonTip(7000, "AeroKin Running", "Phone: $PhoneUrl`nFallback: $FallbackUrl", [System.Windows.Forms.ToolTipIcon]::Info)

# Clicking the balloon opens the dashboard
$NotifyIcon.add_BalloonTipClicked({
    [System.Diagnostics.Process]::Start($DashUrl) | Out-Null
})

try {
    [System.Windows.Forms.Application]::Run()
} catch {
    # If the tray fails, exit quietly without disturbing the server
}
