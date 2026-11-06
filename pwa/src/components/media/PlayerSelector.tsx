import React, { useState, useRef, useEffect } from 'react';
import { MediaSessionItem } from './types';
import { triggerHaptic } from '../../utils/haptics';
import { CaretDown, Check } from '@phosphor-icons/react';

export interface PlayerSelectorProps {
  sessions: MediaSessionItem[];
  onSelectSession: (sessionId: string) => void;
}

export const PlayerSelector: React.FC<PlayerSelectorProps> = ({ sessions, onSelectSession }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.current) || sessions[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!sessions || sessions.length <= 1) {
    return null;
  }

  // Format clean app display name
  const formatAppName = (s: MediaSessionItem) => {
    if (s.title && s.title.trim()) return s.title;
    if (s.app && s.app.trim()) {
      return s.app
        .replace(/\.exe$/i, '')
        .replace(/([A-Z])/g, ' $1')
        .trim();
    }
    return s.id;
  };

  return (
    <div ref={containerRef} className="relative w-full mb-3">
      {/* Session trigger pill */}
      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface border border-border text-xs">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Active Player
        </span>

        <button
          onClick={() => {
            triggerHaptic('light');
            setIsOpen((prev) => !prev);
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-raised hover:bg-border text-foreground font-medium transition-colors cursor-pointer"
          aria-expanded={isOpen}
          aria-label="Switch active player"
        >
          <span className="truncate max-w-[140px] text-xs">
            {activeSession ? formatAppName(activeSession) : 'Select Player'}
          </span>
          <CaretDown
            size={12}
            className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Dropdown list */}
      {isOpen && (
        <div className="absolute right-0 left-0 top-12 z-50 rounded-2xl bg-surface border border-border p-1.5 shadow-2xl space-y-1 backdrop-blur-md">
          <div className="px-3 py-1.5 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider border-b border-border/60">
            Available Sessions ({sessions.length})
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1">
            {sessions.map((s) => {
              const isCurrent = s.current || (activeSession && s.id === activeSession.id);
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    triggerHaptic('medium');
                    onSelectSession(s.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-accent text-black font-semibold'
                      : 'text-foreground hover:bg-raised'
                  }`}
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="truncate font-medium">{formatAppName(s)}</span>
                    <span
                      className={`text-[10px] truncate ${
                        isCurrent ? 'text-black/70' : 'text-muted-foreground'
                      }`}
                    >
                      {s.app || s.id}
                    </span>
                  </div>
                  {isCurrent && <Check size={16} weight="bold" className="shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
