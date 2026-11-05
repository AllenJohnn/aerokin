# AEROKIN Universal Windows Media Sidecar (Media 2.0)
# Communicates via JSON-lines over stdin/stdout
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media, ContentType = WindowsRuntime]

# Helper for WinRT async calls in PowerShell 5.1
$asTaskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | 
    Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | 
    Select-Object -First 1

$mgrGeneric = $asTaskMethod.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$propsGeneric = $asTaskMethod.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
$boolGeneric = $asTaskMethod.MakeGenericMethod([System.Boolean])

# Master Volume Audio Endpoint C# Definition
$volCode = @"
using System;
using System.Runtime.InteropServices;

namespace AerokinNative {
    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioEndpointVolume {
        int RegisterControlChangeNotify(IntPtr pNotify);
        int UnregisterControlChangeNotify(IntPtr pNotify);
        int GetChannelCount(out uint pnChannelCount);
        int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
        int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
        int GetMasterVolumeLevel(out float pfLevelDB);
        int GetMasterVolumeLevelScalar(out float pfLevel);
        int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
        int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
        int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
        int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
        int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice {
        int Activate(ref Guid id, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object aev);
        int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
        int GetState(out int pdwState);
    }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    public class MMDeviceEnumeratorCom {}

    public static class MasterVolume {
        private static IAudioEndpointVolume GetVolumeControl() {
            var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCom());
            IMMDevice dev;
            enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
            var iid = typeof(IAudioEndpointVolume).GUID;
            object epvObj;
            dev.Activate(ref iid, 1, IntPtr.Zero, out epvObj);
            return (IAudioEndpointVolume)epvObj;
        }

        public static float GetVolume() {
            try {
                float v;
                GetVolumeControl().GetMasterVolumeLevelScalar(out v);
                return v;
            } catch {
                return 0.5f;
            }
        }

        public static void SetVolume(float level) {
            try {
                Guid g = Guid.Empty;
                GetVolumeControl().SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, level)), ref g);
            } catch {}
        }

        public static bool GetMute() {
            try {
                bool m;
                GetVolumeControl().GetMute(out m);
                return m;
            } catch {
                return false;
            }
        }

        public static void SetMute(bool mute) {
            try {
                Guid g = Guid.Empty;
                GetVolumeControl().SetMute(mute, ref g);
            } catch {}
        }
    }
}
"@

try {
    Add-Type -TypeDefinition $volCode -ErrorAction SilentlyContinue
} catch {}

# Request SMTC Manager
$mgrOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
$mgr = $mgrGeneric.Invoke($null, @($mgrOp)).GetAwaiter().GetResult()

$selectedSessionId = $null

function Get-ActiveSession {
    param ($manager, $preferredId)
    $sessions = $manager.GetSessions()
    if ($preferredId) {
        foreach ($s in $sessions) {
            if ($s.SourceAppUserModelId -eq $preferredId) {
                return $s
            }
        }
    }
    return $manager.GetCurrentSession()
}

function Extract-Capabilities {
    param ($playbackInfo)
    $ctrl = if ($playbackInfo) { $playbackInfo.Controls } else { $null }
    return @{
        canPlay = if ($ctrl) { [bool]$ctrl.IsPlayEnabled } else { $true }
        canPause = if ($ctrl) { [bool]$ctrl.IsPauseEnabled } else { $true }
        canTogglePlayPause = $true
        canNext = if ($ctrl) { [bool]$ctrl.IsNextEnabled } else { $true }
        canPrev = if ($ctrl) { [bool]$ctrl.IsPreviousEnabled } else { $true }
        canStop = if ($ctrl) { [bool]$ctrl.IsStopEnabled } else { $false }
        canSeek = if ($ctrl) { [bool]$ctrl.IsPlaybackPositionEnabled } else { $false }
        canSetPosition = if ($ctrl) { [bool]$ctrl.IsPlaybackPositionEnabled } else { $false }
        canShuffle = if ($ctrl) { [bool]$ctrl.IsShuffleEnabled } else { $false }
        canRepeat = if ($ctrl) { [bool]$ctrl.IsRepeatEnabled } else { $false }
        canRate = $false
    }
}

function Get-NowPlayingData {
    param ($manager, $preferredId)
    $session = Get-ActiveSession $manager $preferredId
    $allSessions = @()

    foreach ($s in $manager.GetSessions()) {
        $sId = $s.SourceAppUserModelId
        $sTitle = ""
        $sPb = $null
        try { $sPb = $s.GetPlaybackInfo() } catch {}
        try {
            $sPropOp = $s.TryGetMediaPropertiesAsync()
            $sProps = $propsGeneric.Invoke($null, @($sPropOp)).GetAwaiter().GetResult()
            if ($sProps) { $sTitle = $sProps.Title }
        } catch {}

        $caps = Extract-Capabilities $sPb

        $allSessions += @{
            id = $sId
            app = $sId
            title = $sTitle
            current = ($session -ne $null -and $sId -eq $session.SourceAppUserModelId)
            capabilities = $caps
        }
    }

    if (-not $session) {
        return @{
            sessions = $allSessions
            nowPlaying = @{
                status = "none"
            }
            volume = [Math]::Round(([AerokinNative.MasterVolume]::GetVolume() * 100), 1)
            muted = [AerokinNative.MasterVolume]::GetMute()
        }
    }

    $propOp = $session.TryGetMediaPropertiesAsync()
    $props = $null
    try {
        $props = $propsGeneric.Invoke($null, @($propOp)).GetAwaiter().GetResult()
    } catch {}

    $timeline = $null
    try {
        $timeline = $session.GetTimelineProperties()
    } catch {}

    $pb = $null
    try {
        $pb = $session.GetPlaybackInfo()
    } catch {}

    $statusStr = "paused"
    if ($pb) {
        switch ($pb.PlaybackStatus) {
            "Playing" { $statusStr = "playing" }
            "Paused" { $statusStr = "paused" }
            "Stopped" { $statusStr = "stopped" }
            Default { $statusStr = "paused" }
        }
    }

    $posSec = 0
    $durSec = 0
    if ($timeline) {
        $posSec = [Math]::Round($timeline.Position.TotalSeconds, 2)
        $durSec = [Math]::Round($timeline.EndTime.TotalSeconds, 2)
    }

    $sessionCaps = Extract-Capabilities $pb

    $nowPlaying = @{
        id = $session.SourceAppUserModelId
        app = $session.SourceAppUserModelId
        title = if ($props) { $props.Title } else { "" }
        artist = if ($props) { $props.Artist } else { "" }
        status = $statusStr
        position = $posSec
        duration = $durSec
        canSeek = $sessionCaps.canSeek
        canNext = $sessionCaps.canNext
        canPrev = $sessionCaps.canPrev
        capabilities = $sessionCaps
    }

    return @{
        sessions = $allSessions
        nowPlaying = $nowPlaying
        volume = [Math]::Round(([AerokinNative.MasterVolume]::GetVolume() * 100), 1)
        muted = [AerokinNative.MasterVolume]::GetMute()
    }
}

# Ready signal
$readyMsg = @{ type = "ready"; ok = $true }
[Console]::WriteLine((ConvertTo-Json $readyMsg -Compress))

# Main stdin command loop
while ($line = [Console]::ReadLine()) {
    if (-not $line) { continue }
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    try {
        $cmdObj = ConvertFrom-Json $line
        $cmd = $cmdObj.cmd
        $targetId = if ($cmdObj.targetSessionId) { $cmdObj.targetSessionId } else { $selectedSessionId }
        $session = Get-ActiveSession $mgr $targetId

        $res = @{ ok = $true }

        switch ($cmd) {
            "status" {
                $data = Get-NowPlayingData $mgr $selectedSessionId
                $res.data = $data
            }
            "play" {
                if ($session) {
                    $op = $session.TryPlayAsync()
                    $res.handled = $boolGeneric.Invoke($null, @($op)).GetAwaiter().GetResult()
                } else {
                    $res.handled = $false
                }
            }
            "pause" {
                if ($session) {
                    $op = $session.TryPauseAsync()
                    $res.handled = $boolGeneric.Invoke($null, @($op)).GetAwaiter().GetResult()
                } else {
                    $res.handled = $false
                }
            }
            "playpause" {
                if ($session) {
                    $op = $session.TryTogglePlayPauseAsync()
                    $res.handled = $boolGeneric.Invoke($null, @($op)).GetAwaiter().GetResult()
                } else {
                    $res.handled = $false
                }
            }
            "next" {
                if ($session) {
                    $op = $session.TrySkipNextAsync()
                    $res.handled = $boolGeneric.Invoke($null, @($op)).GetAwaiter().GetResult()
                } else {
                    $res.handled = $false
                }
            }
            "prev" {
                if ($session) {
                    $op = $session.TrySkipPreviousAsync()
                    $res.handled = $boolGeneric.Invoke($null, @($op)).GetAwaiter().GetResult()
                } else {
                    $res.handled = $false
                }
            }
            "stop" {
                if ($session) {
                    $op = $session.TryStopAsync()
                    $res.handled = $boolGeneric.Invoke($null, @($op)).GetAwaiter().GetResult()
                } else {
                    $res.handled = $false
                }
            }
            "seekby" {
                $secs = [double]$cmdObj.seconds
                if ($session) {
                    $timeline = $session.GetTimelineProperties()
                    $currentPos = $timeline.Position.TotalSeconds
                    $dur = $timeline.EndTime.TotalSeconds
                    $targetSec = [Math]::Max(0, [Math]::Min($dur, $currentPos + $secs))
                    $ticks = [long]($targetSec * 10000000)
                    $op = $session.TryChangePlaybackPositionAsync($ticks)
                    $res.handled = $boolGeneric.Invoke($null, @($op)).GetAwaiter().GetResult()
                    $res.target = $targetSec
                } else {
                    $res.handled = $false
                }
            }
            "seekto" {
                $targetSec = [double]$cmdObj.position
                if ($session) {
                    $ticks = [long]($targetSec * 10000000)
                    $op = $session.TryChangePlaybackPositionAsync($ticks)
                    $res.handled = $boolGeneric.Invoke($null, @($op)).GetAwaiter().GetResult()
                } else {
                    $res.handled = $false
                }
            }
            "session" {
                $selectedSessionId = $cmdObj.id
                $res.selectedId = $selectedSessionId
            }
            "setvolume" {
                $lvl = [float]$cmdObj.level
                [AerokinNative.MasterVolume]::SetVolume($lvl / 100.0)
                $res.volume = [AerokinNative.MasterVolume]::GetVolume() * 100
            }
            "getvolume" {
                $res.volume = [AerokinNative.MasterVolume]::GetVolume() * 100
                $res.muted = [AerokinNative.MasterVolume]::GetMute()
            }
            "mute" {
                $currentMute = [AerokinNative.MasterVolume]::GetMute()
                [AerokinNative.MasterVolume]::SetMute(-not $currentMute)
                $res.muted = [AerokinNative.MasterVolume]::GetMute()
            }
            Default {
                $res.ok = $false
                $res.error = "Unknown command: $cmd"
            }
        }

        $sw.Stop()
        $res.latencyMs = [Math]::Round($sw.Elapsed.TotalMilliseconds, 2)
        [Console]::WriteLine((ConvertTo-Json $res -Depth 10 -Compress))
    } catch {
        $sw.Stop()
        $errRes = @{
            ok = $false
            error = $_.Exception.Message
            latencyMs = [Math]::Round($sw.Elapsed.TotalMilliseconds, 2)
        }
        [Console]::WriteLine((ConvertTo-Json $errRes -Depth 10 -Compress))
    }
}
