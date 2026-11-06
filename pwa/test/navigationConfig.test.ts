import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadNavConfig,
  saveNavConfig,
  validateAndMigrateNavConfig,
  DEFAULT_NAV_CONFIG,
  STORAGE_NAV_CONFIG_KEY,
} from '../src/engine/navigationConfig';

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) || null,
  setItem: (key: string, value: string) => storage.set(key, String(value)),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};
(globalThis as any).localStorage = localStorageMock;
(globalThis as any).window = { localStorage: localStorageMock };

describe('Navigation Configuration & Persistence', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('returns default config when storage is empty', () => {
    const config = loadNavConfig();
    expect(config).toEqual(DEFAULT_NAV_CONFIG);
    expect(config.pinned).toEqual(['desktop', 'trackpad', 'media', 'more']);
    expect(config.defaultTab).toBe('trackpad');
  });

  it('validates and clamps custom pinned sections (up to 4 items)', () => {
    const valid = validateAndMigrateNavConfig({
      version: 1,
      pinned: ['trackpad', 'actions', 'system'],
      defaultTab: 'actions',
    });
    expect(valid.pinned).toEqual(['trackpad', 'actions', 'system']);
    expect(valid.defaultTab).toBe('actions');
  });

  it('deduplicates and filters invalid section IDs', () => {
    const cleaned = validateAndMigrateNavConfig({
      version: 1,
      pinned: ['trackpad', 'unknown_section', 'trackpad', 'clipboard', 'present'],
      defaultTab: 'clipboard',
    });
    expect(cleaned.pinned).toEqual(['trackpad', 'clipboard', 'present']);
  });

  it('falls back to default if pinned array is too small (<2) or too large (>4)', () => {
    const tooSmall = validateAndMigrateNavConfig({
      pinned: ['trackpad'],
    });
    expect(tooSmall.pinned).toEqual(DEFAULT_NAV_CONFIG.pinned);

    const tooLarge = validateAndMigrateNavConfig({
      pinned: ['desktop', 'trackpad', 'media', 'system', 'clipboard'],
    });
    expect(tooLarge.pinned).toEqual(DEFAULT_NAV_CONFIG.pinned);
  });

  it('persists and reloads valid nav configuration in localStorage', () => {
    saveNavConfig({
      version: 1,
      pinned: ['trackpad', 'media', 'clipboard', 'more'],
      defaultTab: 'media',
    });

    const loaded = loadNavConfig();
    expect(loaded.pinned).toEqual(['trackpad', 'media', 'clipboard', 'more']);
    expect(loaded.defaultTab).toBe('media');
  });

  it('handles corrupted localStorage JSON safely', () => {
    localStorageMock.setItem(STORAGE_NAV_CONFIG_KEY, '{invalid json');
    const loaded = loadNavConfig();
    expect(loaded).toEqual(DEFAULT_NAV_CONFIG);
  });
});
