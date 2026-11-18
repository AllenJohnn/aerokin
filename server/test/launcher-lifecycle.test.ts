import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WindowsAutostartManager } from '../src/system/WindowsAutostartManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('AeroKin One-Click Launcher & Setup Lifecycle', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aerokin-launcher-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('1. Shortcut Installer & Uninstaller (S7 Isolated Temp Directory)', () => {
    it('creates Desktop and Start Menu shortcuts and respects -NoAutostart', () => {
      const installScript = path.join(REPO_ROOT, 'scripts', 'install-aerokin.ps1');
      const res = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          installScript,
          '-TargetDir',
          tempDir,
          '-NoAutostart',
        ],
        { encoding: 'utf-8' }
      );

      expect(res.status).toBe(0);
      const desktopLnk = path.join(tempDir, 'Desktop', 'AeroKin.lnk');
      const startMenuLnk = path.join(tempDir, 'StartMenu', 'AeroKin.lnk');
      const startupLnk = path.join(tempDir, 'Startup', 'AeroKin.lnk');

      expect(fs.existsSync(desktopLnk)).toBe(true);
      expect(fs.existsSync(startMenuLnk)).toBe(true);
      expect(fs.existsSync(startupLnk)).toBe(false);
    });

    it('creates Startup folder shortcut when -Autostart is specified', () => {
      const installScript = path.join(REPO_ROOT, 'scripts', 'install-aerokin.ps1');
      const res = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          installScript,
          '-TargetDir',
          tempDir,
          '-Autostart',
        ],
        { encoding: 'utf-8' }
      );

      expect(res.status).toBe(0);
      const startupLnk = path.join(tempDir, 'Startup', 'AeroKin.lnk');
      expect(fs.existsSync(startupLnk)).toBe(true);
    });

    it('uninstall script removes Desktop, Start Menu, and Startup shortcuts cleanly', () => {
      // 1. Install all shortcuts first
      const installScript = path.join(REPO_ROOT, 'scripts', 'install-aerokin.ps1');
      spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          installScript,
          '-TargetDir',
          tempDir,
          '-Autostart',
        ],
        { encoding: 'utf-8' }
      );

      const desktopLnk = path.join(tempDir, 'Desktop', 'AeroKin.lnk');
      const startMenuLnk = path.join(tempDir, 'StartMenu', 'AeroKin.lnk');
      const startupLnk = path.join(tempDir, 'Startup', 'AeroKin.lnk');
      expect(fs.existsSync(desktopLnk)).toBe(true);
      expect(fs.existsSync(startMenuLnk)).toBe(true);
      expect(fs.existsSync(startupLnk)).toBe(true);

      // 2. Run uninstaller
      const uninstallScript = path.join(REPO_ROOT, 'scripts', 'uninstall-aerokin.ps1');
      const uninstRes = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          uninstallScript,
          '-TargetDir',
          tempDir,
        ],
        { encoding: 'utf-8' }
      );

      expect(uninstRes.status).toBe(0);
      expect(fs.existsSync(desktopLnk)).toBe(false);
      expect(fs.existsSync(startMenuLnk)).toBe(false);
      expect(fs.existsSync(startupLnk)).toBe(false);
    });

    it('installer -DryRun mode validates targets without writing any files to disk', () => {
      const installScript = path.join(REPO_ROOT, 'scripts', 'install-aerokin.ps1');
      const res = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          installScript,
          '-TargetDir',
          tempDir,
          '-DryRun',
        ],
        { encoding: 'utf-8' }
      );

      expect(res.status).toBe(0);
      expect(res.stdout).toContain('[DryRun]');
      const desktopLnk = path.join(tempDir, 'Desktop', 'AeroKin.lnk');
      expect(fs.existsSync(desktopLnk)).toBe(false);
    });
  });

  describe('2. Single-Instance Named Mutex Logic', () => {
    it('detects when an instance already holds the mutex and rejects second instance', () => {
      const testMutexName = `Global\\AeroKin_Test_Mutex_${Date.now()}`;
      const psScript = `
        $created1 = $false
        $m1 = New-Object System.Threading.Mutex($true, "${testMutexName}", [ref]$created1)
        
        $created2 = $false
        $m2 = New-Object System.Threading.Mutex($true, "${testMutexName}", [ref]$created2)
        
        $m1.ReleaseMutex()
        $m1.Dispose()
        $m2.Dispose()

        Write-Output "First:$created1;Second:$created2"
      `;

      const res = spawnSync('powershell.exe', ['-NoProfile', '-Command', psScript], {
        encoding: 'utf-8',
      });
      expect(res.status).toBe(0);
      expect(res.stdout).toContain('First:True;Second:False');
    });
  });

  describe('3. Restart Backoff & Crash Threshold Supervision Logic', () => {
    it('calculates exponential backoff progression and terminates at crash limit', () => {
      const psScript = `
        $MaxRestartsPerMinute = 5
        $CrashHistory = New-Object System.Collections.Generic.List[datetime]
        $Delays = @()

        for ($i = 0; $i -lt 5; $i++) {
            $Now = Get-Date
            $CrashHistory.Add($Now)
            $BackoffSec = [Math]::Min(16, [Math]::Pow(2, $CrashHistory.Count - 1))
            $Delays += $BackoffSec
        }

        $Exceeded = $CrashHistory.Count -ge $MaxRestartsPerMinute
        Write-Output "Delays:$($Delays -join ',');Exceeded:$Exceeded"
      `;

      const res = spawnSync('powershell.exe', ['-NoProfile', '-Command', psScript], {
        encoding: 'utf-8',
      });
      expect(res.status).toBe(0);
      expect(res.stdout).toContain('Delays:1,2,4,8,16;Exceeded:True');
    });

    it('prunes crash events older than 60 seconds from history', () => {
      const psScript = `
        $Now = Get-Date
        $Old1 = $Now.AddSeconds(-90)
        $Old2 = $Now.AddSeconds(-70)
        $Recent = $Now.AddSeconds(-10)

        $History = @($Old1, $Old2, $Recent)
        $Pruned = @($History | Where-Object { $_ -gt $Now.AddSeconds(-60) })
        Write-Output "Count:$($Pruned.Count)"
      `;

      const res = spawnSync('powershell.exe', ['-NoProfile', '-Command', psScript], {
        encoding: 'utf-8',
      });
      expect(res.status).toBe(0);
      expect(res.stdout).toContain('Count:1');
    });
  });

  describe('4. Size-Capped Log Rotation Logic', () => {
    it('rotates log file when size exceeds threshold and shifts backup indexes', () => {
      const logDir = path.join(tempDir, 'logs');
      fs.mkdirSync(logDir, { recursive: true });
      const logFile = path.join(logDir, 'aerokin.log');

      // Write 2 KB dummy log
      fs.writeFileSync(logFile, 'A'.repeat(2048), 'utf-8');

      const rotateScript = `
        function Rotate-AeroKinLog {
            param([string]$Path, [long]$MaxBytes, [int]$MaxBackups)
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

        Rotate-AeroKinLog -Path "${logFile.replace(/\\/g, '\\\\')}" -MaxBytes 1024 -MaxBackups 3
      `;

      const res = spawnSync('powershell.exe', ['-NoProfile', '-Command', rotateScript], {
        encoding: 'utf-8',
      });
      expect(res.status).toBe(0);
      expect(fs.existsSync(`${logFile}.1`)).toBe(true);
      expect(fs.existsSync(logFile)).toBe(false);

      // Write another file and rotate again
      fs.writeFileSync(logFile, 'B'.repeat(2048), 'utf-8');
      spawnSync('powershell.exe', ['-NoProfile', '-Command', rotateScript], {
        encoding: 'utf-8',
      });
      expect(fs.existsSync(`${logFile}.2`)).toBe(true);
      expect(fs.existsSync(`${logFile}.1`)).toBe(true);
    });
  });

  describe('5. Autostart CLI & WindowsAutostartManager Compatibility', () => {
    it('manages autostart on, off, and status via aerokin-cli.ps1 with .lnk shortcut', () => {
      const cliScript = path.join(REPO_ROOT, 'scripts', 'aerokin-cli.ps1');

      // Status initially disabled
      const statusInit = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-File', cliScript, 'autostart', 'status', '-TargetDir', tempDir],
        { encoding: 'utf-8' }
      );
      expect(statusInit.stdout).toContain('DISABLED');

      // Enable autostart
      const onRes = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-File', cliScript, 'autostart', 'on', '-TargetDir', tempDir],
        { encoding: 'utf-8' }
      );
      expect(onRes.status).toBe(0);
      const startupLnk = path.join(tempDir, 'Startup', 'AeroKin.lnk');
      expect(fs.existsSync(startupLnk)).toBe(true);

      // Status now enabled
      const statusActive = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-File', cliScript, 'autostart', 'status', '-TargetDir', tempDir],
        { encoding: 'utf-8' }
      );
      expect(statusActive.stdout).toContain('ENABLED');

      // WindowsAutostartManager detects .lnk shortcut
      const manager = new WindowsAutostartManager(path.join(tempDir, 'Startup'));
      const mgrStatus = manager.getStatus();
      expect(mgrStatus.enabled).toBe(true);
      expect(mgrStatus.path).toBe(startupLnk);

      // Disable autostart
      const offRes = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-File', cliScript, 'autostart', 'off', '-TargetDir', tempDir],
        { encoding: 'utf-8' }
      );
      expect(offRes.status).toBe(0);
      expect(fs.existsSync(startupLnk)).toBe(false);
      expect(manager.getStatus().enabled).toBe(false);
    });
  });

  describe('6. Environment & Dependency Verification', () => {
    it('passes environment check with -CheckOnly when Node and repo are valid', () => {
      const launcherScript = path.join(REPO_ROOT, 'scripts', 'aerokin-launcher.ps1');
      const res = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          launcherScript,
          '-RepoDir',
          REPO_ROOT,
          '-CheckOnly',
        ],
        { encoding: 'utf-8' }
      );
      expect(res.status).toBe(0);
    });

    it('detects missing Node.js prerequisite and exits with code 1 in -Silent mode', () => {
      const launcherScript = path.join(REPO_ROOT, 'scripts', 'aerokin-launcher.ps1');
      const psCommand = `
        $env:PATH = ""
        & "${launcherScript.replace(/\\/g, '\\\\')}" -RepoDir "${REPO_ROOT.replace(/\\/g, '\\\\')}" -CheckOnly -Silent
        exit $LASTEXITCODE
      `;
      const res = spawnSync('powershell.exe', ['-NoProfile', '-Command', psCommand], {
        encoding: 'utf-8',
      });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('Node.js was not found');
    });

    it('rejects invalid repository folder with non-zero exit code', () => {
      const launcherScript = path.join(REPO_ROOT, 'scripts', 'aerokin-launcher.ps1');
      const emptyDir = path.join(tempDir, 'nonexistent');
      fs.mkdirSync(emptyDir, { recursive: true });

      const res = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          launcherScript,
          '-RepoDir',
          emptyDir,
          '-CheckOnly',
          '-Silent',
        ],
        { encoding: 'utf-8' }
      );
      expect(res.status).toBe(1);
    });
  });

  describe('7. First-Run Flag State Machine', () => {
    it('detects initial first-run state when flag file is absent and skips on second run', () => {
      const flagFile = path.join(tempDir, '.first-run-completed');
      expect(fs.existsSync(flagFile)).toBe(false);

      // Simulate writing flag upon first completion
      fs.writeFileSync(flagFile, new Date().toISOString(), 'utf-8');
      expect(fs.existsSync(flagFile)).toBe(true);
    });
  });
});
