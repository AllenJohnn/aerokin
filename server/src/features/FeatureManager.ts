/**
 * AEROKIN Feature Toggles & Enforcement Manager
 *
 * Loopback-controllable toggles for sensitive PC features.
 * When a feature is disabled by the PC operator, the server strictly rejects
 * incoming requests for that feature with an error.
 */

export interface FeatureFlags {
  clipboard: boolean;
  screenshot: boolean;
  quickActions: boolean;
  launcher: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  clipboard: true,
  screenshot: true,
  quickActions: true,
  launcher: true,
};

export class FeatureManager {
  private flags: FeatureFlags;
  private changeListeners: Array<(flags: FeatureFlags) => void> = [];

  constructor(initialFlags: Partial<FeatureFlags> = {}) {
    this.flags = {
      ...DEFAULT_FEATURE_FLAGS,
      ...initialFlags,
    };
  }

  public getFlags(): FeatureFlags {
    return { ...this.flags };
  }

  public isEnabled(feature: keyof FeatureFlags): boolean {
    return Boolean(this.flags[feature]);
  }

  public updateFlags(partial: Partial<FeatureFlags>): FeatureFlags {
    this.flags = {
      ...this.flags,
      ...partial,
    };
    for (const listener of this.changeListeners) {
      try {
        listener(this.getFlags());
      } catch (err) {
        console.error('[Features] Listener error:', err);
      }
    }
    return this.getFlags();
  }

  public onFlagsChange(listener: (flags: FeatureFlags) => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter((l) => l !== listener);
    };
  }
}
