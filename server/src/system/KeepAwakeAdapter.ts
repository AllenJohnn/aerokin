import { spawn, ChildProcess } from 'node:child_process';

export interface KeepAwakeAdapter {
  enable(): boolean;
  disable(): boolean;
  isEnabled(): boolean;
}

/**
 * Fake Keep-Awake Adapter for unit testing and CI
 */
export class FakeKeepAwakeAdapter implements KeepAwakeAdapter {
  private active = false;

  public enable(): boolean {
    this.active = true;
    return true;
  }

  public disable(): boolean {
    this.active = false;
    return true;
  }

  public isEnabled(): boolean {
    return this.active;
  }
}

/**
 * Windows Keep-Awake Adapter
 *
 * Uses Win32 SetThreadExecutionState via a dedicated lightweight background thread.
 * Flags:
 *   ES_SYSTEM_REQUIRED (0x00000001) - Prevents system idle sleep
 *   ES_CONTINUOUS      (0x80000000) - Informs Windows the state remains in effect
 *
 * NOTE: This strictly manages thread execution state and NEVER alters the Windows power plan.
 * The lock is immediately released on exit or when disabled.
 */
export class WindowsKeepAwakeAdapter implements KeepAwakeAdapter {
  private active = false;
  private child: ChildProcess | null = null;

  public enable(): boolean {
    if (this.active) return true;
    if (process.platform !== 'win32') {
      this.active = true;
      return true;
    }

    try {
      const psCommand = `
        Add-Type -TypeDefinition @"
        using System;
        using System.Runtime.InteropServices;
        public class AeroKinSleepGuard {
          [DllImport("kernel32.dll", SetLastError = true)]
          public static extern uint SetThreadExecutionState(uint esFlags);
        }
"@;
        [AeroKinSleepGuard]::SetThreadExecutionState(0x80000001);
        while ($true) { [System.Threading.Thread]::Sleep(3600000) }
      `;

      this.child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', psCommand],
        {
          windowsHide: true,
          stdio: 'ignore',
        }
      );

      this.child.on('error', () => {
        this.active = false;
        this.child = null;
      });

      this.child.on('exit', () => {
        this.active = false;
        this.child = null;
      });

      this.active = true;
      return true;
    } catch {
      this.active = false;
      return false;
    }
  }

  public disable(): boolean {
    if (this.child) {
      try {
        this.child.kill();
      } catch {}
      this.child = null;
    }
    this.active = false;
    return true;
  }

  public isEnabled(): boolean {
    return this.active;
  }
}
