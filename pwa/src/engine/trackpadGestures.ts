/**
 * Pure, unit-testable Trackpad Gesture Recognizer State Machine.
 * Converts raw Pointer Events into high-level trackpad intents.
 */

export type PointerEventType = 'down' | 'move' | 'up' | 'cancel';

export interface PointerInputEvent {
  type: PointerEventType;
  id: number;
  x: number;
  y: number;
  time: number; // millisecond timestamp
}

export type TrackpadIntent =
  | { type: 'move'; dx: number; dy: number }
  | { type: 'click'; button: 'left' | 'right' }
  | { type: 'button'; button: 'left'; state: 'down' | 'up' }
  | { type: 'scroll'; dy: number; dx: number }
  | { type: 'haptic'; style: 'light' | 'medium' | 'heavy' | 'detent' }
  | { type: 'drag_status'; isDragging: boolean };

export interface TrackpadConfig {
  configVersion?: number; // schema version (v2 introduced default 0.25 sensitivity)
  naturalScroll: boolean; // default true (finger up -> page down)
  scrollSensitivityX: number; // default 0.25 (range 0.05 - 1.5)
  scrollSensitivityY: number; // default 0.25 (range 0.05 - 1.5)
  pointerSpeed: number; // default 1.0 (multiplier 0.5 - 3.0)
  momentum: boolean; // default false
  momentumDecay: number; // default 0.92 per ~16ms frame (range 0.80 - 0.98)
  scrollHaptics: boolean; // default true
}

export const CURRENT_TRACKPAD_CONFIG_VERSION = 2;

/**
 * Windows wheel scroll mapping constants & sensitivity derivation:
 * - 1 standard Windows mouse wheel notch = 120 units (WHEEL_DELTA).
 * - AeroKin protocol maps 12 protocol units = 1 notch (1 unit = 10 Windows wheel units).
 * - Standard Windows browsers scroll ~100 page px per 120-unit notch (~8.33 page px / protocol unit).
 * - At sensitivity 1.0, 1 finger px -> 1 protocol unit -> ~8.33 page px (too fast).
 * - Setting sensitivity to 0.25 yields ~2.08 page px per finger px (target feel: 1.5x - 2.5x).
 */
export const DEFAULT_SCROLL_SENSITIVITY = 0.25;
export const DEFAULT_POINTER_SPEED = 1.0;
export const DEFAULT_MOMENTUM_DECAY = 0.92;
export const SCROLL_HAPTIC_THROTTLE_MS = 60;
export const SCROLL_DETENT_DISTANCE = 12;

export const DEFAULT_TRACKPAD_CONFIG: TrackpadConfig = {
  configVersion: CURRENT_TRACKPAD_CONFIG_VERSION,
  naturalScroll: true,
  scrollSensitivityX: DEFAULT_SCROLL_SENSITIVITY,
  scrollSensitivityY: DEFAULT_SCROLL_SENSITIVITY,
  pointerSpeed: DEFAULT_POINTER_SPEED,
  momentum: false,
  momentumDecay: DEFAULT_MOMENTUM_DECAY,
  scrollHaptics: true,
};

export const STORAGE_TRACKPAD_CONFIG_KEY = 'aerokin_trackpad_config';

/**
 * Migrates legacy stored trackpad configs.
 * If configVersion is missing or < 2, any sensitivity value of 1.0 (the old default)
 * is migrated to DEFAULT_SCROLL_SENSITIVITY (0.25), and configVersion is set to 2.
 * If configVersion >= 2, sensitivity 1.0 is treated as an intentional user choice and preserved.
 */
export function migrateTrackpadConfig(raw: Record<string, unknown>): Record<string, unknown> {
  const migrated = { ...raw };
  const version = typeof raw.configVersion === 'number' ? raw.configVersion : 1;

  if (version < 2) {
    if (migrated.scrollSensitivityX === 1.0 || migrated.scrollSensitivityX === 1) {
      migrated.scrollSensitivityX = DEFAULT_SCROLL_SENSITIVITY;
    }
    if (migrated.scrollSensitivityY === 1.0 || migrated.scrollSensitivityY === 1) {
      migrated.scrollSensitivityY = DEFAULT_SCROLL_SENSITIVITY;
    }
    migrated.configVersion = CURRENT_TRACKPAD_CONFIG_VERSION;
  }

  return migrated;
}

/**
 * Validates and clamps trackpad configuration fields.
 * Discards or clamps corrupt/out-of-range values to safe boundaries.
 */
export function validateTrackpadConfig(raw: unknown): TrackpadConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_TRACKPAD_CONFIG };
  }

  const obj = raw as Record<string, unknown>;

  const configVersion = CURRENT_TRACKPAD_CONFIG_VERSION;

  const naturalScroll =
    typeof obj.naturalScroll === 'boolean' ? obj.naturalScroll : DEFAULT_TRACKPAD_CONFIG.naturalScroll;

  let scrollSensitivityY = DEFAULT_TRACKPAD_CONFIG.scrollSensitivityY;
  if (typeof obj.scrollSensitivityY === 'number' && Number.isFinite(obj.scrollSensitivityY)) {
    scrollSensitivityY = Math.min(1.5, Math.max(0.05, Math.round(obj.scrollSensitivityY * 100) / 100));
  }

  let scrollSensitivityX = DEFAULT_TRACKPAD_CONFIG.scrollSensitivityX;
  if (typeof obj.scrollSensitivityX === 'number' && Number.isFinite(obj.scrollSensitivityX)) {
    scrollSensitivityX = Math.min(1.5, Math.max(0.05, Math.round(obj.scrollSensitivityX * 100) / 100));
  }

  let pointerSpeed = DEFAULT_POINTER_SPEED;
  if (typeof obj.pointerSpeed === 'number' && Number.isFinite(obj.pointerSpeed)) {
    pointerSpeed = Math.min(3.0, Math.max(0.5, Math.round(obj.pointerSpeed * 100) / 100));
  }

  const momentum = typeof obj.momentum === 'boolean' ? obj.momentum : false;

  let momentumDecay = DEFAULT_MOMENTUM_DECAY;
  if (typeof obj.momentumDecay === 'number' && Number.isFinite(obj.momentumDecay)) {
    momentumDecay = Math.min(0.98, Math.max(0.8, Math.round(obj.momentumDecay * 100) / 100));
  }

  const scrollHaptics = typeof obj.scrollHaptics === 'boolean' ? obj.scrollHaptics : true;

  return {
    configVersion,
    naturalScroll,
    scrollSensitivityX,
    scrollSensitivityY,
    pointerSpeed,
    momentum,
    momentumDecay,
    scrollHaptics,
  };
}

/**
 * Validates, clamps, and migrates raw trackpad config from localStorage.
 */
export function validateAndMigrateTrackpadConfig(raw: unknown): TrackpadConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_TRACKPAD_CONFIG };
  }
  return validateTrackpadConfig(migrateTrackpadConfig(raw as Record<string, unknown>));
}

export function loadTrackpadConfig(): TrackpadConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_TRACKPAD_CONFIG };
  try {
    const raw = localStorage.getItem(STORAGE_TRACKPAD_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_TRACKPAD_CONFIG };
    const parsed = JSON.parse(raw);
    return validateAndMigrateTrackpadConfig(parsed);
  } catch {
    return { ...DEFAULT_TRACKPAD_CONFIG };
  }
}

export function saveTrackpadConfig(config: TrackpadConfig): void {
  if (typeof window === 'undefined') return;
  try {
    const validated = validateTrackpadConfig(config);
    localStorage.setItem(STORAGE_TRACKPAD_CONFIG_KEY, JSON.stringify(validated));
  } catch {}
}

export type TrackpadState =
  | 'IDLE'
  | 'ONE_FINGER_TRACKING'
  | 'ONE_FINGER_DRAGGING'
  | 'TWO_FINGER_TRACKING'
  | 'TWO_FINGER_RELEASING'
  | 'MULTI_FINGER_LOCKOUT';

interface PointerRecord {
  id: number;
  startX: number;
  startY: number;
  startTime: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  maxTravel: number;
}

// Gesture timing and distance thresholds
export const TAP_MAX_DURATION_MS = 180;
export const TAP_MAX_TRAVEL_PX = 6;
export const TAP_DRAG_MAX_INTERVAL_MS = 280;
export const TWO_FINGER_TAP_MAX_DURATION_MS = 250;
export const TWO_FINGER_TAP_MAX_TRAVEL_PX = 8;
export const TWO_FINGER_RELEASE_WINDOW_MS = 100;
export const PINCH_SPAN_DELTA_MIN_PX = 35;
export const PINCH_SPAN_RATIO_MIN = 0.3;

export class TrackpadGestureEngine {
  private config: TrackpadConfig;
  private state: TrackpadState = 'IDLE';
  private pointers: Map<number, PointerRecord> = new Map();

  // One-finger state
  private lastTapUpTime = 0;
  private lastTapUpX = 0;
  private lastTapUpY = 0;
  private moveRemainderX = 0;
  private moveRemainderY = 0;

  // Two-finger scroll & pinch state
  private twoFingerStartTime = 0;
  private lastCentroidX = 0;
  private lastCentroidY = 0;
  private lastCentroidTime = 0;
  private initialSpan = 0;
  private totalCentroidDistance = 0;
  private hasScrolled = false;
  private isPinch = false;
  private scrollRemainderX = 0;
  private scrollRemainderY = 0;
  private detentAccumulator = 0;
  private lastScrollHapticTime = 0;
  private firstFingerLiftTime = 0;

  // Momentum state
  private centroidVx = 0;
  private centroidVy = 0;
  private momentumActive = false;
  private momentumVx = 0;
  private momentumVy = 0;

  constructor(config: Partial<TrackpadConfig> = {}) {
    this.config = validateTrackpadConfig({ ...DEFAULT_TRACKPAD_CONFIG, ...config });
  }

  public getConfig(): TrackpadConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<TrackpadConfig>): void {
    this.config = validateTrackpadConfig({ ...this.config, ...newConfig });
  }

  public getState(): TrackpadState {
    return this.state;
  }

  public getPointerCount(): number {
    return this.pointers.size;
  }

  public isMomentumActive(): boolean {
    return this.momentumActive;
  }

  public stopMomentum(): void {
    this.momentumActive = false;
    this.momentumVx = 0;
    this.momentumVy = 0;
  }

  public stepMomentum(dtMs: number): TrackpadIntent[] {
    if (!this.momentumActive || !this.config.momentum || dtMs <= 0) {
      this.momentumActive = false;
      return [];
    }

    const decayFactor = Math.pow(this.config.momentumDecay, dtMs / 16.67);
    this.momentumVx *= decayFactor;
    this.momentumVy *= decayFactor;

    const speed = Math.hypot(this.momentumVx, this.momentumVy);
    if (speed < 0.05) {
      this.stopMomentum();
      return [];
    }

    const dcx = this.momentumVx * dtMs;
    const dcy = this.momentumVy * dtMs;

    let rawScrollDy: number;
    let rawScrollDx: number;

    if (this.config.naturalScroll) {
      rawScrollDy = -dcy * this.config.scrollSensitivityY;
      rawScrollDx = -dcx * this.config.scrollSensitivityX;
    } else {
      rawScrollDy = dcy * this.config.scrollSensitivityY;
      rawScrollDx = dcx * this.config.scrollSensitivityX;
    }

    const totalScrollDy = rawScrollDy + this.scrollRemainderY;
    const totalScrollDx = rawScrollDx + this.scrollRemainderX;

    const sendDy = Math.round(totalScrollDy * 100) / 100;
    const sendDx = Math.round(totalScrollDx * 100) / 100;

    if (Math.abs(sendDy) >= 0.05 || Math.abs(sendDx) >= 0.05) {
      this.scrollRemainderY = totalScrollDy - sendDy;
      this.scrollRemainderX = totalScrollDx - sendDx;
      return [{ type: 'scroll', dy: sendDy, dx: sendDx }];
    } else {
      this.scrollRemainderY = totalScrollDy;
      this.scrollRemainderX = totalScrollDx;
      return [];
    }
  }

  public processEvent(event: PointerInputEvent): TrackpadIntent[] {
    const intents: TrackpadIntent[] = [];

    switch (event.type) {
      case 'down': {
        this.stopMomentum();

        const record: PointerRecord = {
          id: event.id,
          startX: event.x,
          startY: event.y,
          startTime: event.time,
          lastX: event.x,
          lastY: event.y,
          lastTime: event.time,
          maxTravel: 0,
        };
        this.pointers.set(event.id, record);

        const count = this.pointers.size;

        if (count === 1) {
          if (this.state === 'MULTI_FINGER_LOCKOUT' || this.state === 'TWO_FINGER_RELEASING') {
            return intents;
          }

          const isTapDrag =
            event.time - this.lastTapUpTime < TAP_DRAG_MAX_INTERVAL_MS &&
            Math.hypot(event.x - this.lastTapUpX, event.y - this.lastTapUpY) < 30;

          if (isTapDrag) {
            this.state = 'ONE_FINGER_DRAGGING';
            this.lastTapUpTime = 0;
            intents.push({ type: 'button', button: 'left', state: 'down' });
            intents.push({ type: 'drag_status', isDragging: true });
            intents.push({ type: 'haptic', style: 'heavy' });
          } else {
            this.state = 'ONE_FINGER_TRACKING';
          }
        } else if (count === 2) {
          // Rule B3: Second finger lands -> cancel pending one-finger tap/drag state
          if (this.state === 'ONE_FINGER_DRAGGING') {
            intents.push({ type: 'button', button: 'left', state: 'up' });
            intents.push({ type: 'drag_status', isDragging: false });
          }
          this.lastTapUpTime = 0;
          this.state = 'TWO_FINGER_TRACKING';

          const pts = Array.from(this.pointers.values());
          const p1 = pts[0];
          const p2 = pts[1];

          this.twoFingerStartTime = event.time;
          this.lastCentroidX = (p1.lastX + p2.lastX) / 2;
          this.lastCentroidY = (p1.lastY + p2.lastY) / 2;
          this.lastCentroidTime = event.time;
          this.initialSpan = Math.hypot(p2.lastX - p1.lastX, p2.lastY - p1.lastY);
          this.totalCentroidDistance = 0;
          this.hasScrolled = false;
          this.isPinch = false;
          this.centroidVx = 0;
          this.centroidVy = 0;
          this.detentAccumulator = 0;
          this.lastScrollHapticTime = 0;
          this.firstFingerLiftTime = 0;
        } else if (count > 2) {
          if (this.state === 'ONE_FINGER_DRAGGING') {
            intents.push({ type: 'button', button: 'left', state: 'up' });
            intents.push({ type: 'drag_status', isDragging: false });
          }
          this.state = 'MULTI_FINGER_LOCKOUT';
          // TODO: 3-finger swipe hooks for future stage
        }
        break;
      }

      case 'move': {
        const p = this.pointers.get(event.id);
        if (!p) return intents;

        const dx = event.x - p.lastX;
        const dy = event.y - p.lastY;
        const dt = event.time - p.lastTime;
        const totalTravel = Math.hypot(event.x - p.startX, event.y - p.startY);
        p.maxTravel = Math.max(p.maxTravel, totalTravel);
        p.lastX = event.x;
        p.lastY = event.y;
        p.lastTime = event.time;

        if (this.state === 'TWO_FINGER_RELEASING') {
          // If finger moves while the other already lifted, enter full lockout
          this.state = 'MULTI_FINGER_LOCKOUT';
          return intents;
        }

        if (this.state === 'ONE_FINGER_TRACKING' || this.state === 'ONE_FINGER_DRAGGING') {
          const speed = dt > 0 ? Math.hypot(dx, dy) / dt : 0;
          const accel = 1.0 + Math.min(2.5, speed * 1.25);
          const mult = this.config.pointerSpeed ?? 1.0;

          const totalX = dx * accel * mult + this.moveRemainderX;
          const totalY = dy * accel * mult + this.moveRemainderY;

          const sendX = Math.round(totalX * 100) / 100;
          const sendY = Math.round(totalY * 100) / 100;

          if (Math.abs(sendX) >= 0.05 || Math.abs(sendY) >= 0.05) {
            this.moveRemainderX = totalX - sendX;
            this.moveRemainderY = totalY - sendY;
            intents.push({ type: 'move', dx: sendX, dy: sendY });
          } else {
            this.moveRemainderX = totalX;
            this.moveRemainderY = totalY;
          }
        } else if (this.state === 'TWO_FINGER_TRACKING') {
          const pts = Array.from(this.pointers.values());
          if (pts.length < 2) return intents;

          const p1 = pts[0];
          const p2 = pts[1];

          const cx = (p1.lastX + p2.lastX) / 2;
          const cy = (p1.lastY + p2.lastY) / 2;
          const dcx = cx - this.lastCentroidX;
          const dcy = cy - this.lastCentroidY;
          const dtCentroid = event.time - this.lastCentroidTime;

          const span = Math.hypot(p2.lastX - p1.lastX, p2.lastY - p1.lastY);
          const dSpan = Math.abs(span - this.initialSpan);
          const centroidStep = Math.hypot(dcx, dcy);
          this.totalCentroidDistance += centroidStep;

          // Distinct pinch detection: requires substantial span change ratio
          const spanRatio = dSpan / Math.max(1, this.initialSpan);
          if (
            dSpan > PINCH_SPAN_DELTA_MIN_PX &&
            spanRatio > PINCH_SPAN_RATIO_MIN &&
            dSpan > this.totalCentroidDistance * 1.2
          ) {
            this.isPinch = true;
            // TODO: Pinch zoom hook for future stage
          }

          if (!this.isPinch) {
            if (dtCentroid > 0) {
              this.centroidVx = dcx / dtCentroid;
              this.centroidVy = dcy / dtCentroid;
            }

            let rawScrollDy: number;
            let rawScrollDx: number;

            // Natural scroll: fingers up (dcy < 0) -> page down (protocol dy > 0)
            if (this.config.naturalScroll) {
              rawScrollDy = -dcy * this.config.scrollSensitivityY;
              rawScrollDx = -dcx * this.config.scrollSensitivityX;
            } else {
              rawScrollDy = dcy * this.config.scrollSensitivityY;
              rawScrollDx = dcx * this.config.scrollSensitivityX;
            }

            const totalScrollDy = rawScrollDy + this.scrollRemainderY;
            const totalScrollDx = rawScrollDx + this.scrollRemainderX;

            const sendDy = Math.round(totalScrollDy * 100) / 100;
            const sendDx = Math.round(totalScrollDx * 100) / 100;

            if (Math.abs(sendDy) >= 0.05 || Math.abs(sendDx) >= 0.05) {
              this.scrollRemainderY = totalScrollDy - sendDy;
              this.scrollRemainderX = totalScrollDx - sendDx;
              this.hasScrolled = true;
              intents.push({ type: 'scroll', dy: sendDy, dx: sendDx });

              this.detentAccumulator += Math.hypot(sendDy, sendDx);
              if (this.detentAccumulator >= SCROLL_DETENT_DISTANCE) {
                this.detentAccumulator = 0;
                if (this.config.scrollHaptics) {
                  const now = event.time;
                  if (now - this.lastScrollHapticTime >= SCROLL_HAPTIC_THROTTLE_MS) {
                    this.lastScrollHapticTime = now;
                    intents.push({ type: 'haptic', style: 'detent' });
                  }
                }
              }
            } else {
              this.scrollRemainderY = totalScrollDy;
              this.scrollRemainderX = totalScrollDx;
            }
          }

          this.lastCentroidX = cx;
          this.lastCentroidY = cy;
          this.lastCentroidTime = event.time;
        }
        break;
      }

      case 'up': {
        const p = this.pointers.get(event.id);
        if (!p) return intents;

        const totalTravel = Math.hypot(event.x - p.startX, event.y - p.startY);
        p.maxTravel = Math.max(p.maxTravel, totalTravel);
        this.pointers.delete(event.id);
        const remainingCount = this.pointers.size;

        if (this.state === 'ONE_FINGER_DRAGGING') {
          intents.push({ type: 'button', button: 'left', state: 'up' });
          intents.push({ type: 'drag_status', isDragging: false });
          intents.push({ type: 'haptic', style: 'medium' });
          this.state = 'IDLE';
          this.lastTapUpTime = 0;
        } else if (this.state === 'ONE_FINGER_TRACKING') {
          const elapsed = event.time - p.startTime;
          if (elapsed < TAP_MAX_DURATION_MS && p.maxTravel < TAP_MAX_TRAVEL_PX) {
            intents.push({ type: 'click', button: 'left' });
            intents.push({ type: 'haptic', style: 'light' });
            this.lastTapUpTime = event.time;
            this.lastTapUpX = event.x;
            this.lastTapUpY = event.y;
          } else {
            this.lastTapUpTime = 0;
          }
          this.state = 'IDLE';
        } else if (this.state === 'TWO_FINGER_TRACKING') {
          this.firstFingerLiftTime = event.time;
          const elapsed = event.time - this.twoFingerStartTime;
          const isTapCandidate =
            !this.hasScrolled &&
            !this.isPinch &&
            elapsed < TWO_FINGER_TAP_MAX_DURATION_MS &&
            this.totalCentroidDistance < TWO_FINGER_TAP_MAX_TRAVEL_PX;

          if (remainingCount === 0) {
            // Both lifted simultaneously
            if (isTapCandidate) {
              intents.push({ type: 'click', button: 'right' });
              intents.push({ type: 'haptic', style: 'medium' });
            } else if (this.config.momentum && this.hasScrolled && !this.isPinch) {
              const speed = Math.hypot(this.centroidVx, this.centroidVy);
              if (speed > 0.3) {
                this.momentumActive = true;
                this.momentumVx = this.centroidVx;
                this.momentumVy = this.centroidVy;
              }
            }
            this.state = 'IDLE';
          } else {
            // 1 finger lifted, 1 still down
            if (isTapCandidate) {
              this.state = 'TWO_FINGER_RELEASING';
            } else {
              this.state = 'MULTI_FINGER_LOCKOUT';
            }
          }
        } else if (this.state === 'TWO_FINGER_RELEASING') {
          if (remainingCount === 0) {
            const releaseDelta = event.time - this.firstFingerLiftTime;
            const elapsed = event.time - this.twoFingerStartTime;

            // If the second finger lifted shortly after the first
            if (releaseDelta <= TWO_FINGER_RELEASE_WINDOW_MS) {
              const isTwoFingerTap =
                elapsed < TWO_FINGER_TAP_MAX_DURATION_MS &&
                !this.hasScrolled &&
                !this.isPinch &&
                this.totalCentroidDistance < TWO_FINGER_TAP_MAX_TRAVEL_PX;

              if (isTwoFingerTap) {
                intents.push({ type: 'click', button: 'right' });
                intents.push({ type: 'haptic', style: 'medium' });
              }
            }
            this.state = 'IDLE';
          }
        } else if (this.state === 'MULTI_FINGER_LOCKOUT') {
          if (remainingCount === 0) {
            if (this.config.momentum && this.hasScrolled && !this.isPinch) {
              const speed = Math.hypot(this.centroidVx, this.centroidVy);
              if (speed > 0.3) {
                this.momentumActive = true;
                this.momentumVx = this.centroidVx;
                this.momentumVy = this.centroidVy;
              }
            }
            this.state = 'IDLE';
          }
        }
        break;
      }

      case 'cancel': {
        // Rule B3: pointercancel must release held button and reset state
        if (this.state === 'ONE_FINGER_DRAGGING') {
          intents.push({ type: 'button', button: 'left', state: 'up' });
          intents.push({ type: 'drag_status', isDragging: false });
        }
        this.stopMomentum();
        this.pointers.clear();
        this.state = 'IDLE';
        this.moveRemainderX = 0;
        this.moveRemainderY = 0;
        this.scrollRemainderX = 0;
        this.scrollRemainderY = 0;
        this.lastTapUpTime = 0;
        this.firstFingerLiftTime = 0;
        break;
      }
    }

    return intents;
  }
}
