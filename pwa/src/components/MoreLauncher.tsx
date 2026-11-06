import React from 'react';
import { motion } from 'motion/react';
import {
  Icon,
  Lightning,
  Cpu,
  ClipboardText,
  Camera,
  ProjectorScreen,
  Gear,
  Monitor,
  HandPointing,
  PlayPause,
} from '@phosphor-icons/react';
import { NavSectionId } from '../types/navigation';

export interface MoreLauncherProps {
  onSelectSection: (section: NavSectionId) => void;
  systemSummary?: string;
  clipboardCount?: number;
  activeWindow?: string;
}

interface LauncherTile {
  id: NavSectionId;
  name: string;
  category: string;
  status: string;
  icon: Icon;
}

export const MoreLauncher: React.FC<MoreLauncherProps> = ({
  onSelectSection,
  systemSummary,
  clipboardCount,
  activeWindow,
}) => {
  const tiles: LauncherTile[] = [
    {
      id: 'actions',
      name: 'Quick Actions',
      category: 'Controls',
      status: 'Lock, Sleep, Task View, URLs & text',
      icon: Lightning,
    },
    {
      id: 'system',
      name: 'System Monitor',
      category: 'Diagnostics',
      status: systemSummary || 'Live CPU, RAM, disk, network & power',
      icon: Cpu,
    },
    {
      id: 'clipboard',
      name: 'Clipboard',
      category: 'Productivity',
      status:
        typeof clipboardCount === 'number' && clipboardCount > 0
          ? `${clipboardCount} items in memory`
          : 'Sync text between phone & PC',
      icon: ClipboardText,
    },
    {
      id: 'screenshot',
      name: 'Screenshot',
      category: 'Capture',
      status: activeWindow ? `Active: ${activeWindow}` : 'Capture screen with pinch-zoom & save',
      icon: Camera,
    },
    {
      id: 'present',
      name: 'Presentation Remote',
      category: 'Slides',
      status: 'Next/Prev, F5, Esc, timer & laser',
      icon: ProjectorScreen,
    },
    {
      id: 'settings',
      name: 'Settings',
      category: 'Preferences',
      status: 'Navigation pins, haptics & device pairing',
      icon: Gear,
    },
  ];

  return (
    <div className="flex-1 flex flex-col px-4 py-3 overflow-y-auto max-w-lg mx-auto w-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Tools & Launcher</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Dedicated PC control surfaces, system telemetry and utilities.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 pb-6">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <motion.button
              key={tile.id}
              onClick={() => onSelectSection(tile.id)}
              whileTap={{ scale: 0.98 }}
              className="flex flex-col text-left p-3.5 rounded-xl bg-surface border border-border hover:border-accent/40 active:border-accent transition-colors cursor-pointer group min-h-[96px] relative overflow-hidden"
            >
              <div className="flex items-center justify-between w-full mb-2">
                <div className="w-8 h-8 rounded-lg bg-bg flex items-center justify-center border border-border group-hover:border-accent/50 transition-colors">
                  <Icon size={18} className="text-accent" />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  {tile.category}
                </span>
              </div>
              <div className="text-sm font-medium text-foreground group-hover:text-accent transition-colors leading-tight">
                {tile.name}
              </div>
              <div className="text-[11px] text-muted-foreground line-clamp-1 mt-1 leading-snug">
                {tile.status}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
