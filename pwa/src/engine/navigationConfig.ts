import { NavConfig, NavSectionId, ALL_NAV_SECTIONS } from '../types/navigation';

export type { NavConfig, NavSectionId };
export { ALL_NAV_SECTIONS };

export const STORAGE_NAV_CONFIG_KEY = 'aerokin_nav_config';

export const DEFAULT_NAV_CONFIG: NavConfig = {
  version: 1,
  pinned: ['desktop', 'trackpad', 'media', 'more'],
  defaultTab: 'trackpad',
};

const VALID_SECTION_IDS = new Set<NavSectionId>([
  'desktop',
  'trackpad',
  'media',
  'actions',
  'system',
  'clipboard',
  'screenshot',
  'present',
  'settings',
  'more',
]);

export function validateAndMigrateNavConfig(raw: unknown): NavConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_NAV_CONFIG };
  }

  const candidate = raw as Partial<NavConfig>;

  // Pinned items validation (2 to 4 items, valid IDs, unique)
  let pinned: NavSectionId[] = [];
  if (Array.isArray(candidate.pinned)) {
    const seen = new Set<NavSectionId>();
    for (const item of candidate.pinned) {
      if (typeof item === 'string' && VALID_SECTION_IDS.has(item as NavSectionId)) {
        const id = item as NavSectionId;
        if (!seen.has(id)) {
          seen.add(id);
          pinned.push(id);
        }
      }
    }
  }

  // Enforce bounds: min 2, max 4
  if (pinned.length < 2 || pinned.length > 4) {
    pinned = [...DEFAULT_NAV_CONFIG.pinned];
  }

  // Default tab validation
  let defaultTab: NavSectionId = 'trackpad';
  if (
    typeof candidate.defaultTab === 'string' &&
    VALID_SECTION_IDS.has(candidate.defaultTab as NavSectionId)
  ) {
    defaultTab = candidate.defaultTab as NavSectionId;
  } else if (pinned.length > 0 && pinned[0] !== 'more') {
    defaultTab = pinned[0];
  }

  return {
    version: 1,
    pinned,
    defaultTab,
  };
}

export function loadNavConfig(): NavConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_NAV_CONFIG };
  try {
    const raw = localStorage.getItem(STORAGE_NAV_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_NAV_CONFIG };
    const parsed = JSON.parse(raw);
    return validateAndMigrateNavConfig(parsed);
  } catch {
    return { ...DEFAULT_NAV_CONFIG };
  }
}

export function saveNavConfig(config: NavConfig): void {
  if (typeof window === 'undefined') return;
  try {
    const validated = validateAndMigrateNavConfig(config);
    localStorage.setItem(STORAGE_NAV_CONFIG_KEY, JSON.stringify(validated));
  } catch {
    // Ignore in restricted storage environments
  }
}
