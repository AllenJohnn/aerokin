import crypto from 'node:crypto';
import readline from 'node:readline';

export interface ActivePairingCode {
  code: string;
  expiresAt: number;
  validForSeconds: number;
}

export interface PairingAttemptResult {
  ok: boolean;
  error?: string;
  lockedOut?: boolean;
  remainingSeconds?: number;
}

export type ApprovalHandler = (name: string, platform: string, clientIp: string) => Promise<boolean>;

export class PairingManager {
  private activeCode: string | null = null;
  private codeExpiresAt = 0;
  private failedAttemptsGlobal = 0;
  private failedAttemptsWindow: number[] = [];
  private failedAttemptsByIp: Map<string, number[]> = new Map();
  private lockoutUntilByIp: Map<string, number> = new Map();
  private lockoutUntilGlobal = 0;
  private backoffMultiplierByIp: Map<string, number> = new Map();

  private customApprover: ApprovalHandler | null = null;
  private isPromptingApproval = false;

  constructor() {
    this.generateCode();
  }

  /**
   * Generates a new 8-digit random pairing code valid for 2 minutes.
   * Never persisted to disk.
   */
  public generateCode(): ActivePairingCode {
    // Generate 8-digit code (10000000 to 99999999)
    const code = crypto.randomInt(10000000, 100000000).toString();
    this.activeCode = code;
    this.codeExpiresAt = Date.now() + 120_000; // 2 minutes
    this.failedAttemptsGlobal = 0;

    return {
      code,
      expiresAt: this.codeExpiresAt,
      validForSeconds: Math.round((this.codeExpiresAt - Date.now()) / 1000),
    };
  }

  public getActiveCode(): ActivePairingCode | null {
    if (!this.activeCode || Date.now() >= this.codeExpiresAt) {
      return null;
    }
    return {
      code: this.activeCode,
      expiresAt: this.codeExpiresAt,
      validForSeconds: Math.max(0, Math.round((this.codeExpiresAt - Date.now()) / 1000)),
    };
  }

  public invalidateCode(): void {
    this.activeCode = null;
    this.codeExpiresAt = 0;
  }

  /**
   * Resets active lockouts and failure windows (used in tests/management).
   */
  public resetLockout(): void {
    this.lockoutUntilGlobal = 0;
    this.lockoutUntilByIp.clear();
    this.failedAttemptsGlobal = 0;
    this.failedAttemptsWindow = [];
    this.failedAttemptsByIp.clear();
  }

  /**
   * Checks if global or per-IP lockout is active.
   */
  public checkLockout(ip: string): { locked: boolean; remainingSeconds: number } {
    const now = Date.now();

    // Check global lockout
    if (now < this.lockoutUntilGlobal) {
      return {
        locked: true,
        remainingSeconds: Math.ceil((this.lockoutUntilGlobal - now) / 1000),
      };
    }

    // Check IP-specific lockout
    const ipLockout = this.lockoutUntilByIp.get(ip) || 0;
    if (now < ipLockout) {
      return {
        locked: true,
        remainingSeconds: Math.ceil((ipLockout - now) / 1000),
      };
    }

    return { locked: false, remainingSeconds: 0 };
  }

  private recordFailure(ip: string): void {
    const now = Date.now();
    this.failedAttemptsGlobal++;

    // Prune window (> 60s)
    this.failedAttemptsWindow = this.failedAttemptsWindow.filter((t) => now - t < 60_000);
    this.failedAttemptsWindow.push(now);

    const ipHistory = (this.failedAttemptsByIp.get(ip) || []).filter((t) => now - t < 60_000);
    ipHistory.push(now);
    this.failedAttemptsByIp.set(ip, ipHistory);

    // After 5 total failures against the active code, invalidate it immediately
    if (this.failedAttemptsGlobal >= 5) {
      this.invalidateCode();
      console.warn('[Security] Pairing code invalidated after 5 failed attempts.');
    }

    // Lockout check: 5 wrong attempts per minute globally or for this IP
    if (ipHistory.length >= 5) {
      const mult = this.backoffMultiplierByIp.get(ip) || 1;
      const lockoutDurationMs = 60_000 * mult;
      this.lockoutUntilByIp.set(ip, now + lockoutDurationMs);
      this.backoffMultiplierByIp.set(ip, Math.min(mult * 2, 8)); // exponential backoff up to 8x
      console.warn(`[Security] IP ${ip} locked out from pairing for ${lockoutDurationMs / 1000}s.`);
    }

    if (this.failedAttemptsWindow.length >= 5) {
      this.lockoutUntilGlobal = now + 60_000;
      console.warn('[Security] Global pairing lockout engaged for 60s due to repeated wrong attempts.');
    }
  }

  /**
   * Set custom approval handler (used in tests or GUI).
   */
  public setApprover(handler: ApprovalHandler | null): void {
    this.customApprover = handler;
  }

  /**
   * Prompts PC operator via terminal with 30s timeout and default deny.
   */
  private async promptTerminalApproval(
    name: string,
    platform: string,
    clientIp: string
  ): Promise<boolean> {
    if (this.customApprover) {
      return this.customApprover(name, platform, clientIp);
    }

    if (this.isPromptingApproval) {
      console.warn('[Security] Another pairing approval is currently in progress. Denying concurrent attempt.');
      return false;
    }

    if (!process.stdin.isTTY) {
      console.warn('[Security] Terminal is not interactive (non-TTY). Defaulting to deny.');
      return false;
    }

    this.isPromptingApproval = true;
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise<boolean>((resolve) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.isPromptingApproval = false;
          rl.close();
          console.log('\n[Security] Pairing request timed out (30s). Request denied.');
          resolve(false);
        }
      }, 30_000);

      rl.question(
        `\n[PAIRING REQUEST] Approve "${name}" (${platform}, IP: ${clientIp})? (y/N): `,
        (answer) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            this.isPromptingApproval = false;
            rl.close();
            const clean = answer.trim().toLowerCase();
            const approved = clean === 'y' || clean === 'yes';
            if (approved) {
              console.log(`[Pairing] Approved "${name}". Issuing device credentials.`);
            } else {
              console.log(`[Pairing] Denied pairing for "${name}".`);
            }
            resolve(approved);
          }
        }
      );
    });
  }

  /**
   * Validates pairing submission and executes PC approval gate.
   *
   * NEVER logs the submitted code.
   */
  public async submitPairing(
    submittedCode: string,
    name: string,
    platform: string,
    clientIp: string
  ): Promise<PairingAttemptResult> {
    const lockout = this.checkLockout(clientIp);
    if (lockout.locked) {
      return {
        ok: false,
        lockedOut: true,
        remainingSeconds: lockout.remainingSeconds,
        error: `Pairing locked out due to repeated failed attempts. Try again in ${lockout.remainingSeconds}s.`,
      };
    }

    if (!this.activeCode || Date.now() >= this.codeExpiresAt) {
      this.recordFailure(clientIp);
      console.warn(`[Security] Pairing attempt with expired or missing code from ${clientIp}.`);
      const postLockout = this.checkLockout(clientIp);
      if (postLockout.locked) {
        return {
          ok: false,
          lockedOut: true,
          remainingSeconds: postLockout.remainingSeconds,
          error: `Pairing locked out due to repeated failed attempts. Try again in ${postLockout.remainingSeconds}s.`,
        };
      }
      return {
        ok: false,
        error: 'Pairing code expired or invalid. Generate a new code on your PC.',
      };
    }

    const cleanSubmitted = String(submittedCode || '').trim();
    if (cleanSubmitted.length !== 8 || cleanSubmitted !== this.activeCode) {
      this.recordFailure(clientIp);
      console.warn(`[Security] Failed pairing attempt (incorrect code) from ${clientIp}.`);
      const postLockout = this.checkLockout(clientIp);
      if (postLockout.locked) {
        return {
          ok: false,
          lockedOut: true,
          remainingSeconds: postLockout.remainingSeconds,
          error: `Pairing locked out due to repeated failed attempts. Try again in ${postLockout.remainingSeconds}s.`,
        };
      }
      return {
        ok: false,
        error: 'Invalid pairing code.',
      };
    }

    // Step 2: PC operator approval gate (30s timeout, default deny)
    console.log(`[Pairing] Valid 8-digit code received from ${clientIp}. Awaiting PC operator approval...`);
    const approved = await this.promptTerminalApproval(name, platform, clientIp);

    // Consume single-use code immediately regardless of outcome
    this.invalidateCode();

    if (!approved) {
      return {
        ok: false,
        error: 'Pairing rejected or timed out by PC operator.',
      };
    }

    return { ok: true };
  }
}
