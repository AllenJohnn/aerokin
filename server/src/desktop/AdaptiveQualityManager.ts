/**
 * AdaptiveQualityManager
 *
 * Dynamically adjusts desktop streaming quality tier based on WebSocket buffer backlog
 * and dropped frames.
 * - When ws.bufferedAmount or drop rate stays elevated for > 1s, steps down one preset tier.
 * - When transmission stays clean for > 10s, steps up slowly towards the user's selected cap.
 * - Enforces the user's selected preset as an absolute upper bound (never exceeds user cap).
 */

import { QualityPresetName } from './types.js';

export const QUALITY_TIER_LADDER: QualityPresetName[] = [
  'ultra',
  'high',
  'balanced',
  'fast',
  'tiny',
];

export interface AdaptiveQualityOptions {
  downgradeDelayMs?: number; // default: 1000ms
  upgradeDelayMs?: number; // default: 10000ms
  bufferThresholdBytes?: number; // default: 256 * 1024 (256 KB)
  minChangeIntervalMs?: number; // default: 2000ms cooldown
  getNow?: () => number;
}

export class AdaptiveQualityManager {
  private userCapPreset: QualityPresetName = 'fast';
  private currentTier: QualityPresetName = 'fast';

  private readonly downgradeDelayMs: number;
  private readonly upgradeDelayMs: number;
  private readonly bufferThresholdBytes: number;
  private readonly minChangeIntervalMs: number;
  private readonly getNow: () => number;

  private congestedSince: number | null = null;
  private cleanSince: number | null = null;
  private lastTierChangeTime = 0;

  constructor(initialPreset: QualityPresetName = 'fast', options?: AdaptiveQualityOptions) {
    this.downgradeDelayMs = options?.downgradeDelayMs ?? 1000;
    this.upgradeDelayMs = options?.upgradeDelayMs ?? 10000;
    this.bufferThresholdBytes = options?.bufferThresholdBytes ?? 256 * 1024;
    this.minChangeIntervalMs = options?.minChangeIntervalMs ?? 2000;
    this.getNow = options?.getNow ?? Date.now;

    const normalized = initialPreset === 'low' ? 'tiny' : initialPreset;
    this.userCapPreset = normalized;
    this.currentTier = normalized;
  }

  public setUserCap(preset: QualityPresetName): void {
    // Treat legacy 'low' as 'tiny'
    const normalized = preset === 'low' ? 'tiny' : preset;
    this.userCapPreset = normalized;

    const capIdx = this.getTierIndex(normalized);
    const currIdx = this.getTierIndex(this.currentTier);

    // In QUALITY_TIER_LADDER: 0=ultra, 1=high, 2=balanced, 3=fast, 4=tiny
    // A lower index means HIGHER quality.
    // If currIdx < capIdx, current quality exceeds user cap -> clamp to cap!
    if (currIdx < capIdx) {
      this.currentTier = normalized;
      this.lastTierChangeTime = this.getNow();
    }
  }

  public getUserCap(): QualityPresetName {
    return this.userCapPreset;
  }

  public getActiveTier(): QualityPresetName {
    return this.currentTier;
  }

  public getTierIndex(preset: QualityPresetName): number {
    const idx = QUALITY_TIER_LADDER.indexOf(preset);
    return idx >= 0 ? idx : QUALITY_TIER_LADDER.indexOf('fast');
  }

  /**
   * Updates state based on current WebSocket bufferedAmount and frame drops.
   * Returns whether a tier change occurred.
   */
  public updateNetworkCondition(
    bufferedAmount: number,
    droppedFramesInWindow: number
  ): { activeTier: QualityPresetName; changed: boolean } {
    const now = this.getNow();
    const isCongested = bufferedAmount > this.bufferThresholdBytes || droppedFramesInWindow > 0;

    const currentIdx = this.getTierIndex(this.currentTier);
    const capIdx = this.getTierIndex(this.userCapPreset);

    if (isCongested) {
      this.cleanSince = null;
      if (this.congestedSince === null) {
        this.congestedSince = now;
      }

      // Check if congestion has persisted past downgrade delay and cooldown
      const elapsedCongested = now - this.congestedSince;
      const cooldownElapsed = now - this.lastTierChangeTime >= this.minChangeIntervalMs;

      if (elapsedCongested >= this.downgradeDelayMs && cooldownElapsed) {
        // Can we downgrade further?
        if (currentIdx < QUALITY_TIER_LADDER.length - 1) {
          const nextTier = QUALITY_TIER_LADDER[currentIdx + 1];
          this.currentTier = nextTier;
          this.lastTierChangeTime = now;
          this.congestedSince = now; // reset congestion timer for further drops
          return { activeTier: this.currentTier, changed: true };
        }
      }
    } else {
      this.congestedSince = null;
      if (this.cleanSince === null) {
        this.cleanSince = now;
      }

      // Check if clean state has persisted past upgrade delay and cooldown
      const elapsedClean = now - this.cleanSince;
      const cooldownElapsed = now - this.lastTierChangeTime >= this.minChangeIntervalMs;

      if (elapsedClean >= this.upgradeDelayMs && cooldownElapsed) {
        // Can we upgrade towards user cap? (lower index = higher quality)
        if (currentIdx > capIdx) {
          const nextTier = QUALITY_TIER_LADDER[currentIdx - 1];
          this.currentTier = nextTier;
          this.lastTierChangeTime = now;
          this.cleanSince = now; // reset clean timer for next tier step
          return { activeTier: this.currentTier, changed: true };
        }
      }
    }

    return { activeTier: this.currentTier, changed: false };
  }

  public reset(): void {
    this.congestedSince = null;
    this.cleanSince = null;
    this.lastTierChangeTime = 0;
    this.currentTier = this.userCapPreset;
  }
}
