/**
 * AEROKIN Power & Session Safety Subsystem
 *
 * S1/S2 SAFETY CONTRACT:
 * Real power, session, and machine-state transitions (shutdown, restart, sleep,
 * hibernate, logoff, lock) are strictly isolated behind this single executor.
 *
 * The real implementation can ONLY be constructed when process.env.AEROKIN_ALLOW_POWER_ACTIONS === '1'.
 * Under Vitest, NODE_ENV=test, or CI, the real implementation throws immediately upon construction.
 * In development, dry-run mode (NoOpPowerActionExecutor) logs safety warnings and simulates success.
 */

import { exec } from 'node:child_process';
import koffi from 'koffi';
import { serverLogger } from '../logger.js';

export type PowerAction =
  'shutdown' | 'restart' | 'sign_out' | 'sleep' | 'lock' | 'cancel_shutdown';

export interface PowerActionOptions {
  delaySeconds?: number;
  comment?: string;
}

export interface PowerActionResult {
  success: boolean;
  action: PowerAction;
  executed: boolean;
  message?: string;
  error?: string;
}

export interface PowerActionExecutor {
  execute(action: PowerAction, options?: PowerActionOptions): Promise<PowerActionResult>;
  cancelShutdown(): Promise<PowerActionResult>;
}

/**
 * Checks whether the current process is running inside an automated test or CI environment.
 */
export function isTestOrCiEnvironment(): boolean {
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.VITEST === 'true' ||
    Boolean(process.env.VITEST) ||
    Boolean(process.env.CI)
  );
}

/**
 * Real Win32 power action executor.
 * STRICTLY FORBIDDEN from being instantiated under test, CI, or without explicit environment opt-in.
 */
export class RealPowerActionExecutor implements PowerActionExecutor {
  private lockWorkStationFn: any = null;

  constructor() {
    if (isTestOrCiEnvironment()) {
      throw new Error(
        'FATAL: RealPowerActionExecutor cannot be constructed under vitest / test / CI environment.'
      );
    }
    if (process.env.AEROKIN_ALLOW_POWER_ACTIONS !== '1') {
      throw new Error(
        'FATAL: RealPowerActionExecutor requires process.env.AEROKIN_ALLOW_POWER_ACTIONS === "1".'
      );
    }

    if (process.platform === 'win32') {
      try {
        const user32 = koffi.load('user32.dll');
        this.lockWorkStationFn = user32.func('bool __stdcall LockWorkStation()');
      } catch (err) {
        serverLogger.warn('security', `Failed to bind user32 LockWorkStation: ${err}`);
      }
    }
  }

  public async execute(
    action: PowerAction,
    options?: PowerActionOptions
  ): Promise<PowerActionResult> {
    if (process.platform !== 'win32') {
      return {
        success: true,
        action,
        executed: false,
        message: `Simulated ${action} (non-Windows platform)`,
      };
    }

    const delay = options?.delaySeconds ?? 0;
    const sanitizedComment = options?.comment ? ` /c "${options.comment.replace(/"/g, '')}"` : '';

    return new Promise((resolve) => {
      switch (action) {
        case 'shutdown': {
          exec(`shutdown.exe /s /t ${delay}${sanitizedComment}`, (err) => {
            if (err) {
              resolve({ success: false, action, executed: true, error: err.message });
            } else {
              resolve({ success: true, action, executed: true });
            }
          });
          break;
        }

        case 'restart': {
          exec(`shutdown.exe /r /t ${delay}${sanitizedComment}`, (err) => {
            if (err) {
              resolve({ success: false, action, executed: true, error: err.message });
            } else {
              resolve({ success: true, action, executed: true });
            }
          });
          break;
        }

        case 'sign_out': {
          exec('shutdown.exe /l', (err) => {
            if (err) {
              resolve({ success: false, action, executed: true, error: err.message });
            } else {
              resolve({ success: true, action, executed: true });
            }
          });
          break;
        }

        case 'sleep': {
          exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0', (err) => {
            if (err) {
              resolve({ success: false, action, executed: true, error: err.message });
            } else {
              resolve({ success: true, action, executed: true });
            }
          });
          break;
        }

        case 'lock': {
          if (this.lockWorkStationFn) {
            try {
              const ok = this.lockWorkStationFn();
              resolve({ success: Boolean(ok), action, executed: true });
            } catch (err: any) {
              resolve({ success: false, action, executed: true, error: err?.message });
            }
          } else {
            resolve({
              success: false,
              action,
              executed: true,
              error: 'LockWorkStation API unavailable',
            });
          }
          break;
        }

        case 'cancel_shutdown': {
          exec('shutdown.exe /a', (err) => {
            if (err) {
              resolve({ success: false, action, executed: true, error: err.message });
            } else {
              resolve({ success: true, action, executed: true });
            }
          });
          break;
        }

        default:
          resolve({
            success: false,
            action,
            executed: false,
            error: `Unknown power action: ${action}`,
          });
      }
    });
  }

  public async cancelShutdown(): Promise<PowerActionResult> {
    return this.execute('cancel_shutdown');
  }
}

/**
 * No-Op power action executor.
 * Safely blocks all real calls, logs warnings, and returns success to callers.
 */
export class NoOpPowerActionExecutor implements PowerActionExecutor {
  public async execute(
    action: PowerAction,
    _options?: PowerActionOptions
  ): Promise<PowerActionResult> {
    serverLogger.warn('actions', `power action blocked (dry run): ${action}`);
    return {
      success: true,
      action,
      executed: false,
      message: `power action blocked (dry run): ${action}`,
    };
  }

  public async cancelShutdown(): Promise<PowerActionResult> {
    serverLogger.warn('actions', 'power action blocked (dry run): cancel_shutdown');
    return {
      success: true,
      action: 'cancel_shutdown',
      executed: false,
      message: 'power action blocked (dry run): cancel_shutdown',
    };
  }
}

export interface RecordedPowerAction {
  action: PowerAction;
  options?: PowerActionOptions;
  timestamp: number;
}

/**
 * Recording fake power action executor for tests.
 */
export class RecordingPowerActionExecutor implements PowerActionExecutor {
  public recorded: RecordedPowerAction[] = [];

  public async execute(
    action: PowerAction,
    options?: PowerActionOptions
  ): Promise<PowerActionResult> {
    this.recorded.push({
      action,
      options,
      timestamp: Date.now(),
    });
    return {
      success: true,
      action,
      executed: false,
      message: `recorded power action: ${action}`,
    };
  }

  public async cancelShutdown(): Promise<PowerActionResult> {
    this.recorded.push({
      action: 'cancel_shutdown',
      timestamp: Date.now(),
    });
    return {
      success: true,
      action: 'cancel_shutdown',
      executed: false,
      message: 'recorded power action: cancel_shutdown',
    };
  }

  public clear(): void {
    this.recorded = [];
  }
}

/**
 * Factory for obtaining the active PowerActionExecutor.
 * Never constructs the real executor in test/CI or without AEROKIN_ALLOW_POWER_ACTIONS=1.
 */
export function createPowerActionExecutor(): PowerActionExecutor {
  if (isTestOrCiEnvironment()) {
    return new NoOpPowerActionExecutor();
  }
  if (process.env.AEROKIN_ALLOW_POWER_ACTIONS === '1') {
    return new RealPowerActionExecutor();
  }
  return new NoOpPowerActionExecutor();
}
