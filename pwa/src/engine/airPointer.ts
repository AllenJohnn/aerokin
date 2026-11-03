/**
 * AEROKIN Air Pointer Engine
 * 
 * Framework-free, high-fidelity 6-DOF air pointer engine inspired by the LG webOS Magic Remote.
 * Combines gravity-projected yaw/pitch, One Euro velocity filtering, non-linear power gain,
 * continuous stationary gyro bias elimination, sub-pixel remainder accumulation,
 * and network backpressure management.
 */

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface AirPointerConfig {
  sensitivityPreset: 'slow' | 'medium' | 'fast';
  fineSensitivity: number; // 0.5 to 2.5 multiplier
  mode: 'magic' | 'hold'; // 'magic' = always on, 'hold' = thumb on pad only
  invertX: boolean;
  invertY: boolean;
  swapAxes: boolean;
  minCutoff: number; // One Euro min cutoff Hz (default ~1.2)
  beta: number; // One Euro velocity coefficient (default ~0.08)
  powerExponent: number; // Gain power curve exponent (default ~1.25)
}

export const DEFAULT_CONFIG: AirPointerConfig = {
  sensitivityPreset: 'medium',
  fineSensitivity: 1.0,
  mode: 'magic',
  invertX: false,
  invertY: false,
  swapAxes: false,
  minCutoff: 1.2,
  beta: 0.08,
  powerExponent: 1.25,
};

export const SENSITIVITY_PRESETS = {
  slow: 0.8,
  medium: 1.3,
  fast: 2.1,
} as const;

export interface CalibrationData {
  yawAxis: 'alpha' | 'beta' | 'gamma';
  yawSign: 1 | -1;
  pitchAxis: 'alpha' | 'beta' | 'gamma';
  pitchSign: 1 | -1;
  calibrated: boolean;
}

export const DEFAULT_CALIBRATION: CalibrationData = {
  yawAxis: 'alpha',
  yawSign: 1,
  pitchAxis: 'beta',
  pitchSign: 1,
  calibrated: false,
};

/**
 * 1€ Filter (One Euro Filter) implementation for low-latency jitter suppression
 */
export class OneEuroFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  constructor(minCutoff = 1.2, beta = 0.08, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  public filter(x: number, dt: number): number {
    if (this.xPrev === null || dt <= 0) {
      this.xPrev = x;
      return x;
    }

    // Estimate derivative (rate of change)
    const dx = (x - this.xPrev) / dt;
    const alphaD = this.alpha(this.dCutoff, dt);
    const dxHat = alphaD * dx + (1.0 - alphaD) * this.dxPrev;
    this.dxPrev = dxHat;

    // Compute dynamic cutoff frequency
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const alphaV = this.alpha(cutoff, dt);
    const xHat = alphaV * x + (1.0 - alphaV) * this.xPrev;
    this.xPrev = xHat;

    return xHat;
  }

  public reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
  }
}

export type MoveSender = (dx: number, dy: number) => void;
export type BackpressureChecker = () => boolean;

export class AirPointerEngine {
  private config: AirPointerConfig;
  private calibration: CalibrationData;
  private sendMove: MoveSender;
  private isBackpressured: BackpressureChecker;

  // Low-pass filtered gravity vector
  private gravityLP: Vector3 = { x: 0, y: 0, z: -9.81 };
  private gravityTau = 0.3; // ~0.3s low-pass time constant

  // Gyro bias tracking & continuous stationary adaptation
  private biasYaw = 0;
  private biasPitch = 0;
  private stationaryTimeMs = 0;
  private stationaryThresholdDeg = 2.0; // deg/s
  private isStationary = false;
  private startupSamples = 0;
  private startupAccumYaw = 0;
  private startupAccumPitch = 0;
  private startupComplete = false;

  // One Euro Filters for velocity
  private filterYaw: OneEuroFilter;
  private filterPitch: OneEuroFilter;

  // Remainder accumulation for sub-pixel accuracy
  private remainderX = 0;
  private remainderY = 0;

  // State flags
  private isPaused = false;
  private isHoldEngaged = false; // For 'hold' mode
  private freezeUntilTime = 0; // For OK button tap freeze

  // Telemetry for reticle and diagnostics
  private lastDt = 0.016;
  private lastRawYaw = 0;
  private lastRawPitch = 0;
  private lastFilteredYaw = 0;
  private lastFilteredPitch = 0;
  private lastOutDx = 0;
  private lastOutDy = 0;

  constructor(
    sendMove: MoveSender,
    isBackpressured: BackpressureChecker = () => false,
    initialConfig: Partial<AirPointerConfig> = {},
    initialCalibration: Partial<CalibrationData> = {}
  ) {
    this.sendMove = sendMove;
    this.isBackpressured = isBackpressured;
    this.config = { ...DEFAULT_CONFIG, ...initialConfig };
    this.calibration = { ...DEFAULT_CALIBRATION, ...initialCalibration };

    this.filterYaw = new OneEuroFilter(this.config.minCutoff, this.config.beta);
    this.filterPitch = new OneEuroFilter(this.config.minCutoff, this.config.beta);
  }

  public updateConfig(newConfig: Partial<AirPointerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.filterYaw = new OneEuroFilter(this.config.minCutoff, this.config.beta);
    this.filterPitch = new OneEuroFilter(this.config.minCutoff, this.config.beta);
  }

  public updateCalibration(newCalibration: Partial<CalibrationData>): void {
    this.calibration = { ...this.calibration, ...newCalibration };
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
    if (paused) {
      this.resetRemainders();
    }
  }

  public setHoldEngaged(engaged: boolean): void {
    this.isHoldEngaged = engaged;
    if (!engaged) {
      this.resetRemainders();
    }
  }

  /**
   * Freezes pointer movement (e.g. while clicking and for 120ms after release)
   * to eliminate hand tremors from physical tapping.
   */
  public freezePointer(durationMs = 120): void {
    this.freezeUntilTime = Math.max(this.freezeUntilTime, performance.now() + durationMs);
  }

  public resetRemainders(): void {
    this.remainderX = 0;
    this.remainderY = 0;
    this.filterYaw.reset();
    this.filterPitch.reset();
  }

  /**
   * Primary ingestion point for DeviceMotionEvent telemetry
   */
  public processMotion(
    rotationRate: { alpha: number | null; beta: number | null; gamma: number | null } | null,
    gravity: { x: number | null; y: number | null; z: number | null } | null,
    dtSeconds: number
  ): void {
    if (!rotationRate || dtSeconds <= 0) return;

    const dt = Math.max(0.002, Math.min(0.1, dtSeconds));
    this.lastDt = dt;

    // 1. Low-pass filter gravity vector (tau ~0.3s)
    if (gravity && gravity.x !== null && gravity.y !== null && gravity.z !== null) {
      const alphaG = dt / (dt + this.gravityTau);
      this.gravityLP.x += alphaG * (gravity.x - this.gravityLP.x);
      this.gravityLP.y += alphaG * (gravity.y - this.gravityLP.y);
      this.gravityLP.z += alphaG * (gravity.z - this.gravityLP.z);
    }

    // Gravity magnitude and unit vector
    const gMag = Math.sqrt(
      this.gravityLP.x * this.gravityLP.x +
      this.gravityLP.y * this.gravityLP.y +
      this.gravityLP.z * this.gravityLP.z
    );

    const gUnit: Vector3 = gMag > 0.001
      ? { x: this.gravityLP.x / gMag, y: this.gravityLP.y / gMag, z: this.gravityLP.z / gMag }
      : { x: 0, y: 0, z: -1 };

    // Device rotation rates (deg/s)
    // alpha = z (yaw on screen), beta = x (pitch), gamma = y (roll)
    const rotX = rotationRate.beta ?? 0;
    const rotY = rotationRate.gamma ?? 0;
    const rotZ = rotationRate.alpha ?? 0;

    // 2. Project yaw along world vertical (gravity vector)
    // When held in any arbitrary grip, yaw rate = rotationRate . gUnit
    const yawWorld = rotX * gUnit.x + rotY * gUnit.y + rotZ * gUnit.z;
    const pitchWorld = rotX; // Pitch around device X axis

    this.lastRawYaw = yawWorld;
    this.lastRawPitch = pitchWorld;

    // 3. Gyro Bias initial estimation & continuous stationary adaptation
    const rawSpeed = Math.sqrt(yawWorld * yawWorld + pitchWorld * pitchWorld);

    if (!this.startupComplete) {
      this.startupSamples++;
      this.startupAccumYaw += yawWorld;
      this.startupAccumPitch += pitchWorld;
      if (this.startupSamples >= 30) { // ~0.5s at 60Hz
        this.biasYaw = this.startupAccumYaw / this.startupSamples;
        this.biasPitch = this.startupAccumPitch / this.startupSamples;
        this.startupComplete = true;
      }
    } else {
      // Stationary adaptation: if motionless (<2 deg/s) for 300ms, slowly adapt bias and clamp
      if (rawSpeed < this.stationaryThresholdDeg) {
        this.stationaryTimeMs += dt * 1000;
        if (this.stationaryTimeMs >= 300) {
          this.isStationary = true;
          const adaptRate = 0.08 * dt;
          this.biasYaw += adaptRate * (yawWorld - this.biasYaw);
          this.biasPitch += adaptRate * (pitchWorld - this.biasPitch);
        }
      } else {
        this.stationaryTimeMs = 0;
        this.isStationary = false;
      }
    }

    // 4. Bias subtraction
    let unbiasedYaw = yawWorld - this.biasYaw;
    let unbiasedPitch = pitchWorld - this.biasPitch;

    // Dead still clamp when stationary
    if (this.isStationary || rawSpeed < 0.25) {
      unbiasedYaw = 0;
      unbiasedPitch = 0;
    }

    // 5. One Euro filtering on velocity
    const filteredYaw = this.filterYaw.filter(unbiasedYaw, dt);
    const filteredPitch = this.filterPitch.filter(unbiasedPitch, dt);

    this.lastFilteredYaw = filteredYaw;
    this.lastFilteredPitch = filteredPitch;

    // 6. Non-linear gain curve: out = sens * sign(v) * |v|^p
    const baseSens = SENSITIVITY_PRESETS[this.config.sensitivityPreset] * this.config.fineSensitivity;
    const p = this.config.powerExponent;

    const gainYaw = baseSens * Math.sign(filteredYaw) * Math.pow(Math.abs(filteredYaw), p);
    const gainPitch = baseSens * Math.sign(filteredPitch) * Math.pow(Math.abs(filteredPitch), p);

    // 7. Coordinate mapping, axis swaps & calibration signs
    // When held screen up (gUnit.z ~ -1), sweeping right yields negative yaw projection,
    // so invert gainYaw to produce positive deltaX (cursor moves right).
    let deltaX = -gainYaw * dt * 10.0;
    let deltaY = -gainPitch * dt * 10.0; // Inverted so pitching up moves cursor up

    if (this.calibration.calibrated) {
      deltaX = (this.calibration.yawSign === -1 ? -deltaX : deltaX);
      deltaY = (this.calibration.pitchSign === -1 ? -deltaY : deltaY);
    }

    if (this.config.swapAxes) {
      const tmp = deltaX;
      deltaX = deltaY;
      deltaY = tmp;
    }

    if (this.config.invertX) deltaX = -deltaX;
    if (this.config.invertY) deltaY = -deltaY;

    // 8. Accumulate into sub-pixel remainder
    this.remainderX += deltaX;
    this.remainderY += deltaY;

    this.lastOutDx = deltaX;
    this.lastOutDy = deltaY;
  }

  /**
   * Flushes accumulated movement per animation frame.
   * Handles Magic vs Hold mode, freeze timers, and network backpressure.
   */
  public flushFrame(): void {
    // Check pause state
    if (this.isPaused) {
      this.resetRemainders();
      return;
    }

    // Check Hold mode engagement
    if (this.config.mode === 'hold' && !this.isHoldEngaged) {
      this.resetRemainders();
      return;
    }

    // Check freeze timer (e.g. OK click freeze)
    if (performance.now() < this.freezeUntilTime) {
      this.resetRemainders();
      return;
    }

    // Check WebSocket backpressure: if ws.bufferedAmount > 4KB, skip sending but keep accumulating
    if (this.isBackpressured()) {
      return;
    }

    // Round to 2 decimals for transmission
    const sendX = Math.round(this.remainderX * 100) / 100;
    const sendY = Math.round(this.remainderY * 100) / 100;

    if (Math.abs(sendX) >= 0.05 || Math.abs(sendY) >= 0.05) {
      this.remainderX -= sendX;
      this.remainderY -= sendY;
      this.sendMove(sendX, sendY);
    }
  }

  public getTelemetry() {
    return {
      dt: this.lastDt,
      rawYaw: this.lastRawYaw,
      rawPitch: this.lastRawPitch,
      filteredYaw: this.lastFilteredYaw,
      filteredPitch: this.lastFilteredPitch,
      outDx: this.lastOutDx,
      outDy: this.lastOutDy,
      remainderX: this.remainderX,
      remainderY: this.remainderY,
      isStationary: this.isStationary,
      isPaused: this.isPaused,
      isHoldEngaged: this.isHoldEngaged,
      isFrozen: performance.now() < this.freezeUntilTime,
    };
  }
}
