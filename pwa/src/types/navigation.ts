export type NavSectionId =
  | 'desktop'
  | 'trackpad'
  | 'media'
  | 'actions'
  | 'system'
  | 'clipboard'
  | 'screenshot'
  | 'present'
  | 'settings'
  | 'more';

export interface NavSectionMeta {
  id: NavSectionId;
  label: string;
  shortLabel: string;
  description: string;
  iconName: string;
}

export interface NavConfig {
  version: 1;
  pinned: NavSectionId[];
  defaultTab: NavSectionId;
}

export const ALL_NAV_SECTIONS: NavSectionMeta[] = [
  {
    id: 'desktop',
    label: 'Desktop Remote',
    shortLabel: 'Desktop',
    description: 'Ultra-low latency screen viewer',
    iconName: 'Monitor',
  },
  {
    id: 'trackpad',
    label: 'Trackpad',
    shortLabel: 'Trackpad',
    description: 'Precision cursor, multi-touch scroll & gestures',
    iconName: 'HandPointing',
  },
  {
    id: 'media',
    label: 'Media Controls',
    shortLabel: 'Media',
    description: 'Now playing, timeline, volume & player profiles',
    iconName: 'PlayPause',
  },
  {
    id: 'actions',
    label: 'Quick Actions',
    shortLabel: 'Actions',
    description: 'Safe PC controls, shortcuts & app launcher',
    iconName: 'Lightning',
  },
  {
    id: 'system',
    label: 'System Monitor',
    shortLabel: 'System',
    description: 'Real-time CPU, RAM, disk, network & power stats',
    iconName: 'Cpu',
  },
  {
    id: 'clipboard',
    label: 'Clipboard',
    shortLabel: 'Clipboard',
    description: 'Sync text between phone and PC clipboard',
    iconName: 'ClipboardText',
  },
  {
    id: 'screenshot',
    label: 'Screenshot',
    shortLabel: 'Capture',
    description: 'One-shot capture with pinch-zoom & save',
    iconName: 'Camera',
  },
  {
    id: 'present',
    label: 'Presentation Remote',
    shortLabel: 'Present',
    description: 'Slide remote, black/white screen & laser pointer',
    iconName: 'ProjectorScreen',
  },
  {
    id: 'settings',
    label: 'Settings',
    shortLabel: 'Settings',
    description: 'Preferences, devices, display & diagnostics',
    iconName: 'Gear',
  },
];
