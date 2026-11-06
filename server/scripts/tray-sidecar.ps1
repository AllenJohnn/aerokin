<#
.SYNOPSIS
    AEROKIN Windows System Tray Indicator & Quick Controls Sidecar.
.DESCRIPTION
    Runs a NotifyIcon in the Windows system notification area.
    Provides 1-click access to open the dashboard, toggle the remote input pause switch,
    and generate pairing codes.
#>

param(
    [int]$Port = 8443,
    [string]$LanIp = "127.0.0.1"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

$BaseUrl = "https://127.0.0.1:$Port"
$DashUrl = "$BaseUrl/dashboard"

# Allow self-signed certificates for local loopback queries
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$NotifyIcon = New-Object System.Windows.Forms.NotifyIcon
$NotifyIcon.Text = "AEROKIN Remote Control"
$NotifyIcon.Icon = [System.Drawing.SystemIcons]::Application
$NotifyIcon.Visible = $true

$ContextMenu = New-Object System.Windows.Forms.ContextMenuStrip

$MenuDash = New-Object System.Windows.Forms.ToolStripMenuItem("Open PC Dashboard")
$MenuPause = New-Object System.Windows.Forms.ToolStripMenuItem("Pause Remote Input")
$MenuPair = New-Object System.Windows.Forms.ToolStripMenuItem("Generate Pairing Code")
$MenuSeparator = New-Object System.Windows.Forms.ToolStripSeparator
$MenuExit = New-Object System.Windows.Forms.ToolStripMenuItem("Exit")

$ContextMenu.Items.Add($MenuDash) | Out-Null
$ContextMenu.Items.Add($MenuPause) | Out-Null
$ContextMenu.Items.Add($MenuPair) | Out-Null
$ContextMenu.Items.Add($MenuSeparator) | Out-Null
$ContextMenu.Items.Add($MenuExit) | Out-Null

$NotifyIcon.ContextMenuStrip = $ContextMenu

# Open Dashboard Click
$MenuDash.add_Click({
    [System.Diagnostics.Process]::Start($DashUrl) | Out-Null
})

$NotifyIcon.add_DoubleClick({
    [System.Diagnostics.Process]::Start($DashUrl) | Out-Null
})

# Helper for loopback requests
function Invoke-AeroKinApi([string]$Path, [string]$Method = "GET", [object]$Body = $null) {
    try {
        $Params = @{
            Uri = "$BaseUrl$Path"
            Method = $Method
            UseBasicParsing = $true
            TimeoutSec = 3
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

# Generate Pairing Code
$MenuPair.add_Click({
    $Res = Invoke-AeroKinApi -Path "/api/pair/regenerate" -Method "POST"
    if ($Res -and $Res.code) {
        $NotifyIcon.ShowBalloonTip(5000, "AEROKIN Pairing Code", "New 8-digit Code: $($Res.code)`nValid for 2 minutes.", [System.Windows.Forms.ToolTipIcon]::Info)
    }
})

# Exit
$MenuExit.add_Click({
    $NotifyIcon.Visible = $false
    $NotifyIcon.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

# Timer to sync pause state every 5 seconds
$SyncTimer = New-Object System.Windows.Forms.Timer
$SyncTimer.Interval = 5000
$SyncTimer.add_Tick({
    $Status = Invoke-AeroKinApi -Path "/api/dashboard/pause"
    if ($Status) {
        $MenuPause.Checked = ($Status.paused -eq $true)
    }
})
$SyncTimer.Start()

# Initial sync
$InitialStatus = Invoke-AeroKinApi -Path "/api/dashboard/pause"
if ($InitialStatus) {
    $MenuPause.Checked = ($InitialStatus.paused -eq $true)
}

[System.Windows.Forms.Application]::Run()
