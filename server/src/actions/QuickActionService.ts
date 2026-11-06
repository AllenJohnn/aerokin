/**
 * AEROKIN Quick Actions & Safe PC Remote Control Service
 *
 * Implements a strict whitelist enum of safe PC actions.
 * No arbitrary commands reach the shell.
 *
 * Dangerous actions (shutdown, restart, sign_out) are governed by a 10-second
 * cancelable countdown state machine visible both on the mobile client and the PC dashboard.
 *
 * S1/S2/S3 SAFETY COMPLIANCE:
 * All power and session operations are strictly routed through PowerActionExecutor.
 * All input injection operations are strictly routed through InputBackend.
 * Under test/CI environments or without explicit opt-in, dry-run fakes are used.
 *
 * App launcher strictly loads an allow-list file (launcher.json) configured by the PC owner.
 */

import { spawn, exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import koffi from 'koffi';
import { AllowedQuickAction, MAX_TYPE_TEXT_CHARS, MAX_URL_LENGTH } from '../protocol.js';
import {
  PowerActionExecutor,
  createPowerActionExecutor,
  RealPowerActionExecutor,
  isTestOrCiEnvironment,
} from './PowerActionExecutor.js';
import { InputBackend, createInputBackend } from '../input/InputBackend.js';
import { serverLogger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../..');

export interface LauncherEntry {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  path: string;
  args?: string[];
}

export interface CountdownState {
  active: boolean;
  action: 'shutdown' | 'restart' | 'sign_out' | null;
  secondsRemaining: number;
}

export interface ActionResult {
  success: boolean;
  action: string;
  message?: string;
  countdownActive?: boolean;
  secondsRemaining?: number;
  error?: string;
}

// Safe monitor display control (display standby / sleep, not system sleep)
let SendMessageWFn: any = null;

if (process.platform === 'win32') {
  try {
    const user32 = koffi.load('user32.dll');
    SendMessageWFn = user32.func(
      'intptr_t __stdcall SendMessageW(intptr_t hWnd, uint32_t Msg, uintptr_t wParam, intptr_t lParam)'
    );
  } catch (err) {
    serverLogger.warn('actions', `Failed to bind user32 SendMessageW: ${err}`);
  }
}

export class QuickActionService {
  private countdownState: CountdownState = {
    active: false,
    action: null,
    secondsRemaining: 0,
  };

  private countdownTimer: NodeJS.Timeout | null = null;
  private countdownListeners: Array<(state: CountdownState) => void> = [];
  private actionHistory: Array<{ action: string; time: number; success: boolean }> = [];
  private customLauncherPath: string | null = null;

  public readonly powerExecutor: PowerActionExecutor;
  public readonly inputBackend: InputBackend;

  constructor(
    customLauncherPath?: string,
    powerExecutor?: PowerActionExecutor,
    inputBackend?: InputBackend
  ) {
    this.customLauncherPath = customLauncherPath || null;

    if (
      isTestOrCiEnvironment() &&
      powerExecutor &&
      powerExecutor instanceof RealPowerActionExecutor
    ) {
      throw new Error(
        'QuickActionService cannot be constructed with RealPowerActionExecutor under test environment.'
      );
    }

    this.powerExecutor = powerExecutor || createPowerActionExecutor();
    this.inputBackend = inputBackend || createInputBackend();
  }

  public getCountdownState(): CountdownState {
    return { ...this.countdownState };
  }

  public getRecentActions(): Array<{ action: string; time: number; success: boolean }> {
    return [...this.actionHistory];
  }

  public onCountdownChange(listener: (state: CountdownState) => void): () => void {
    this.countdownListeners.push(listener);
    return () => {
      this.countdownListeners = this.countdownListeners.filter((l) => l !== listener);
    };
  }

  private notifyCountdownChange(): void {
    const snapshot = this.getCountdownState();
    for (const listener of this.countdownListeners) {
      try {
        listener(snapshot);
      } catch {
        // Ignored
      }
    }
  }

  private recordAction(action: string, success: boolean): void {
    this.actionHistory.unshift({
      action,
      time: Date.now(),
      success,
    });
    if (this.actionHistory.length > 20) {
      this.actionHistory.pop();
    }
  }

  /**
   * Loads configured launcher allow-list entries from launcher.json or launcher.example.json.
   */
  public getLauncherEntries(): LauncherEntry[] {
    const searchPaths = [
      this.customLauncherPath,
      path.join(ROOT_DIR, 'server', 'launcher.json'),
      path.join(ROOT_DIR, 'launcher.json'),
      path.join(ROOT_DIR, 'server', 'launcher.example.json'),
    ].filter(Boolean) as string[];

    for (const p of searchPaths) {
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return parsed.filter(
              (item) =>
                item &&
                typeof item.id === 'string' &&
                typeof item.name === 'string' &&
                typeof item.path === 'string'
            );
          }
        } catch {
          // Continue to next path on error
        }
      }
    }

    return [];
  }

  /**
   * Starts a 10-second cancelable countdown for dangerous PC operations.
   */
  public startDangerousActionCountdown(
    action: 'shutdown' | 'restart' | 'sign_out'
  ): ActionResult {
    if (this.countdownState.active) {
      return {
        success: false,
        action,
        error: `Another power action (${this.countdownState.action}) is already counting down.`,
      };
    }

    this.countdownState = {
      active: true,
      action,
      secondsRemaining: 10,
    };
    this.notifyCountdownChange();

    serverLogger.warn(
      'actions',
      `Initiated 10-second countdown for dangerous action: ${action}. Cancelable from PC dashboard or mobile app.`
    );

    // Initial system command with 10s delay via PowerActionExecutor
    if (action === 'shutdown' || action === 'restart') {
      this.powerExecutor.execute(action, {
        delaySeconds: 10,
        comment: `AEROKIN Remote ${action === 'shutdown' ? 'Shutdown' : 'Restart'} initiated from mobile client`,
      }).catch((err) => {
        serverLogger.warn('actions', `PowerActionExecutor scheduled countdown execution failed: ${err}`);
      });
    }

    this.countdownTimer = setInterval(() => {
      this.countdownState.secondsRemaining--;
      this.notifyCountdownChange();

      if (this.countdownState.secondsRemaining <= 0) {
        if (this.countdownTimer) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
        }

        const executingAction = this.countdownState.action;
        this.countdownState = { active: false, action: null, secondsRemaining: 0 };
        this.notifyCountdownChange();

        serverLogger.warn('actions', `Countdown finished. Executing: ${executingAction}`);
        this.executeFinalDangerousAction(executingAction);
      }
    }, 1000);

    this.recordAction(action, true);
    return {
      success: true,
      action,
      countdownActive: true,
      secondsRemaining: 10,
      message: `${action.toUpperCase()} scheduled in 10 seconds. You can cancel on the dashboard.`,
    };
  }

  /**
   * Cancels any active shutdown or restart countdown.
   */
  public cancelCountdown(): ActionResult {
    if (!this.countdownState.active) {
      return {
        success: false,
        action: 'cancel_shutdown',
        error: 'No action countdown is currently active.',
      };
    }

    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }

    const previousAction = this.countdownState.action;
    this.countdownState = {
      active: false,
      action: null,
      secondsRemaining: 0,
    };
    this.notifyCountdownChange();

    // Abort Windows shutdown if initiated via PowerActionExecutor
    this.powerExecutor.cancelShutdown().catch((err) => {
      serverLogger.warn('actions', `PowerActionExecutor cancelShutdown failed: ${err}`);
    });

    serverLogger.info('actions', `Cancelled ${previousAction} countdown.`);
    this.recordAction('cancel_shutdown', true);

    return {
      success: true,
      action: 'cancel_shutdown',
      message: `Successfully cancelled ${previousAction}.`,
    };
  }

  private executeFinalDangerousAction(action: 'shutdown' | 'restart' | 'sign_out' | null): void {
    if (!action) return;
    this.powerExecutor.execute(action, { delaySeconds: 0 }).catch((err) => {
      serverLogger.warn('actions', `PowerActionExecutor final execution failed: ${err}`);
    });
  }

  /**
   * Executes a safe whitelisted action.
   */
  public async executeAction(
    action: AllowedQuickAction,
    payload?: string
  ): Promise<ActionResult> {
    // 1. Dangerous action countdowns
    if (action === 'shutdown' || action === 'restart' || action === 'sign_out') {
      return this.startDangerousActionCountdown(action);
    }

    if (action === 'cancel_shutdown') {
      return this.cancelCountdown();
    }

    serverLogger.info('actions', `Executing quick action: ${action}`);

    // 2. Safe PC actions
    switch (action) {
      case 'lock_pc': {
        const res = await this.powerExecutor.execute('lock');
        this.recordAction('lock_pc', res.success);
        return {
          success: res.success,
          action,
          message: res.executed ? 'Workstation locked' : 'Lock simulated (dry run / safe mode)',
          error: res.error,
        };
      }

      case 'sleep': {
        const res = await this.powerExecutor.execute('sleep');
        this.recordAction('sleep', res.success);
        return {
          success: res.success,
          action,
          message: res.executed ? 'PC entered sleep mode' : 'Sleep simulated (dry run / safe mode)',
          error: res.error,
        };
      }

      case 'monitor_off': {
        if (process.platform === 'win32' && SendMessageWFn) {
          const HWND_BROADCAST = 0xffff;
          const WM_SYSCOMMAND = 0x0112;
          const SC_MONITORPOWER = 0xf170;
          SendMessageWFn(HWND_BROADCAST, WM_SYSCOMMAND, SC_MONITORPOWER, 2);
        }
        this.recordAction('monitor_off', true);
        return { success: true, action, message: 'Monitor display turned off' };
      }

      case 'show_desktop': {
        await this.inputBackend.keyCombo('win+d');
        this.recordAction('show_desktop', true);
        return { success: true, action, message: 'Show desktop toggled' };
      }

      case 'task_view': {
        await this.inputBackend.keyCombo('win+tab');
        this.recordAction('task_view', true);
        return { success: true, action, message: 'Task view opened' };
      }

      case 'task_manager': {
        if (process.platform === 'win32') {
          spawn('taskmgr.exe', [], { detached: true, stdio: 'ignore' });
        }
        this.recordAction('task_manager', true);
        return { success: true, action, message: 'Task manager launched' };
      }

      case 'volume_mute': {
        await this.inputBackend.key('mute', 'tap');
        this.recordAction('volume_mute', true);
        return { success: true, action, message: 'Volume mute toggled' };
      }

      case 'brightness_up':
      case 'brightness_down': {
        if (process.platform === 'win32') {
          const delta = action === 'brightness_up' ? 10 : -10;
          const psScript = `powershell -NoProfile -Command "(Get-WmiObject -Namespace root/wmi -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, [Math]::Max(10, [Math]::Min(100, (Get-WmiObject -Namespace root/wmi -Class WmiMonitorBrightness).CurrentBrightness + (${delta}))))"`;
          exec(psScript, () => {});
        }
        this.recordAction(action, true);
        return { success: true, action, message: 'Brightness adjusted' };
      }

      case 'send_link': {
        if (!payload || typeof payload !== 'string') {
          return { success: false, action, error: 'No URL provided' };
        }
        const trimmed = payload.trim();
        if (trimmed.length > MAX_URL_LENGTH) {
          return { success: false, action, error: 'URL exceeds maximum length limit' };
        }

        try {
          const parsed = new URL(trimmed);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { success: false, action, error: 'Only http:// and https:// URLs are permitted' };
          }

          // Launch in default browser safely
          if (process.platform === 'win32') {
            spawn('cmd.exe', ['/c', 'start', '', parsed.href], {
              detached: true,
              stdio: 'ignore',
            });
          }

          this.recordAction('send_link', true);
          return { success: true, action, message: `Opened ${parsed.hostname} in default PC browser` };
        } catch {
          return { success: false, action, error: 'Invalid URL format' };
        }
      }

      case 'type_text': {
        if (!payload || typeof payload !== 'string') {
          return { success: false, action, error: 'No text provided to type' };
        }
        if (payload.length > MAX_TYPE_TEXT_CHARS) {
          return { success: false, action, error: `Text exceeds ${MAX_TYPE_TEXT_CHARS} character limit` };
        }

        await this.inputBackend.typeText(payload);

        this.recordAction('type_text', true);
        return { success: true, action, message: `Typed ${payload.length} characters on PC` };
      }

      case 'launch_app': {
        if (!payload || typeof payload !== 'string') {
          return { success: false, action, error: 'No application ID provided' };
        }

        const entries = this.getLauncherEntries();
        const targetEntry = entries.find((e) => e.id.toLowerCase() === payload.trim().toLowerCase());

        if (!targetEntry) {
          serverLogger.warn('actions', `Rejected unknown application ID: ${payload}`);
          return { success: false, action, error: `Application "${payload}" not in PC allow-list` };
        }

        spawn(targetEntry.path, targetEntry.args || [], {
          detached: true,
          stdio: 'ignore',
        });

        this.recordAction('launch_app', true);
        serverLogger.info('actions', `Launched allow-listed app: ${targetEntry.name}`);
        return { success: true, action, message: `Launched ${targetEntry.name}` };
      }

      default:
        return { success: false, action, error: `Unknown action: ${action}` };
    }
  }
}
