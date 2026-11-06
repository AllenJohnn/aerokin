<#
.SYNOPSIS
    Provisions and verifies FFmpeg with NVENC / MediaFoundation support for AeroKin.
.DESCRIPTION
    Checks for ffmpeg.exe in tools/ffmpeg/bin or PATH. If missing, downloads and
    extracts the official Gyan.dev FFmpeg Essentials release for Windows.
#>

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$ToolsDir = Join-Path $RootDir "tools"
$FfmpegDir = Join-Path $ToolsDir "ffmpeg"
$BinDir = Join-Path $FfmpegDir "bin"
$FfmpegExe = Join-Path $BinDir "ffmpeg.exe"

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "          AEROKIN FFmpeg Provisioning Tool            " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# 1. Check local tools directory first
if (Test-Path $FfmpegExe) {
    Write-Host "[OK] FFmpeg found at: $FfmpegExe" -ForegroundColor Green
} else {
    # 2. Check PATH
    $PathFfmpeg = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
    if ($PathFfmpeg) {
        Write-Host "[OK] FFmpeg found in PATH: $($PathFfmpeg.Source)" -ForegroundColor Green
        $FfmpegExe = $PathFfmpeg.Source
    } else {
        Write-Host "[!] FFmpeg not found. Provisioning Gyan.dev FFmpeg Essentials..." -ForegroundColor Yellow

        if (-not (Test-Path $BinDir)) {
            New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
        }

        $DownloadUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
        $ZipPath = Join-Path $ToolsDir "ffmpeg-release-essentials.zip"

        Write-Host "Downloading: $DownloadUrl" -ForegroundColor Yellow
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZipPath -UseBasicParsing

        Write-Host "Extracting FFmpeg to $ToolsDir..." -ForegroundColor Yellow
        $ExtractTemp = Join-Path $ToolsDir "ffmpeg-temp"
        Expand-Archive -Path $ZipPath -DestinationPath $ExtractTemp -Force

        # Locate extracted ffmpeg.exe inside subfolder
        $ExtractedExe = Get-ChildItem -Path $ExtractTemp -Filter "ffmpeg.exe" -Recurse | Select-Object -First 1
        if ($ExtractedExe) {
            Copy-Item -Path $ExtractedExe.FullName -Destination $FfmpegExe -Force
            Write-Host "[OK] Installed FFmpeg to: $FfmpegExe" -ForegroundColor Green
        } else {
            throw "Failed to locate ffmpeg.exe inside extracted archive."
        }

        # Cleanup archive and temp folder
        Remove-Item -Path $ZipPath -Force -ErrorAction SilentlyContinue
        Remove-Item -Path $ExtractTemp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# 3. Test hardware encoders
Write-Host "`nChecking encoder capabilities..." -ForegroundColor Cyan
$OldPref = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$EncoderOutput = & $FfmpegExe -encoders 2>&1 | Out-String
$ErrorActionPreference = $OldPref

$HasNvenc = $EncoderOutput -match "h264_nvenc"
$HasMf = $EncoderOutput -match "h264_mf"
$HasX264 = $EncoderOutput -match "libx264"

$nvencText = if ($HasNvenc) { "[SUPPORTED]" } else { "[UNAVAILABLE]" }
$nvencColor = if ($HasNvenc) { "Green" } else { "DarkGray" }

$mfText = if ($HasMf) { "[SUPPORTED]" } else { "[UNAVAILABLE]" }
$mfColor = if ($HasMf) { "Green" } else { "DarkGray" }

$x264Text = if ($HasX264) { "[SUPPORTED]" } else { "[UNAVAILABLE]" }
$x264Color = if ($HasX264) { "Green" } else { "DarkGray" }

Write-Host "  * NVIDIA NVENC (h264_nvenc):         $nvencText" -ForegroundColor $nvencColor
Write-Host "  * MediaFoundation (h264_mf):         $mfText" -ForegroundColor $mfColor
Write-Host "  * Software x264 (libx264):           $x264Text" -ForegroundColor $x264Color

Write-Host "`nFFmpeg is verified and ready for AeroKin Desktop 2.0 streaming.`n" -ForegroundColor Green
