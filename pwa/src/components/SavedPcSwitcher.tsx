import React, { useState, useEffect } from 'react';
import {
  Desktop,
  Check,
  Trash,
  Plus,
  WifiHigh,
  Globe,
  CaretRight,
  ArrowsClockwise,
  ShieldCheck,
  X,
} from '@phosphor-icons/react';
import {
  getSavedPcs,
  getActivePc,
  removeSavedPc,
  setActivePcId,
  SavedPc,
  savePc,
} from '../utils/hosting';
import { triggerHaptic } from '../utils/haptics';

export interface SavedPcSwitcherProps {
  onSelectPc?: (pc: SavedPc) => void;
  onPairNewPc?: () => void;
  compact?: boolean;
}

export const SavedPcSwitcher: React.FC<SavedPcSwitcherProps> = ({
  onSelectPc,
  onPairNewPc,
  compact = false,
}) => {
  const [savedPcs, setSavedPcs] = useState<SavedPc[]>([]);
  const [activePc, setActivePc] = useState<SavedPc | null>(null);
  const [pcToForget, setPcToForget] = useState<SavedPc | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const refreshList = () => {
    const pcs = getSavedPcs();
    setSavedPcs(pcs);
    setActivePc(getActivePc());
  };

  useEffect(() => {
    refreshList();
  }, []);

  const handleSelect = (pc: SavedPc) => {
    triggerHaptic('light');
    setActivePcId(pc.pcId);
    refreshList();
    if (onSelectPc) {
      onSelectPc(pc);
    }
  };

  const handleConfirmForget = (pc: SavedPc) => {
    triggerHaptic('medium');
    removeSavedPc(pc.pcId);
    setPcToForget(null);
    refreshList();
  };

  const formatLastSeen = (timestamp: number) => {
    if (!timestamp) return 'Never';
    const diffSec = Math.round((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Desktop size={16} className="text-[#FF5A1F]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Saved Computers ({savedPcs.length})
          </span>
        </div>
        {onPairNewPc && (
          <button
            onClick={() => {
              triggerHaptic('light');
              onPairNewPc();
            }}
            className="flex items-center gap-1 text-xs text-[#FF5A1F] hover:underline font-medium"
          >
            <Plus size={13} weight="bold" />
            <span>Pair Another PC</span>
          </button>
        )}
      </div>

      {/* List */}
      {savedPcs.length === 0 ? (
        <div className="p-4 rounded-2xl border border-border/40 bg-card text-center space-y-2">
          <Desktop size={28} className="mx-auto text-muted-foreground/60" />
          <p className="text-xs text-muted-foreground">
            No computers paired yet. Pair with your PC via Wi-Fi or remote pairing link.
          </p>
          {onPairNewPc && (
            <button
              onClick={onPairNewPc}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF5A1F] text-white text-xs font-medium hover:brightness-110 active:scale-[0.98] transition-transform"
            >
              <Plus size={14} weight="bold" />
              <span>Pair a PC</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {savedPcs.map((pc) => {
            const isActive = activePc?.pcId === pc.pcId;
            return (
              <div
                key={pc.pcId}
                className={`group relative rounded-2xl border transition-all ${
                  isActive
                    ? 'border-[#FF5A1F]/50 bg-gradient-to-r from-[#FF5A1F]/10 via-card to-card shadow-sm'
                    : 'border-border/40 bg-card hover:border-border/80'
                }`}
              >
                <div
                  onClick={() => !isActive && handleSelect(pc)}
                  className={`p-3.5 flex items-center justify-between ${
                    isActive ? 'cursor-default' : 'cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                        isActive
                          ? 'bg-[#FF5A1F] text-white shadow-sm'
                          : 'bg-raised text-muted-foreground group-hover:text-foreground'
                      }`}
                    >
                      <Desktop size={20} weight={isActive ? 'fill' : 'regular'} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground truncate">
                          {pc.name || 'Windows PC'}
                        </span>
                        {isActive && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[#FF5A1F]/20 text-[#FF5A1F] border border-[#FF5A1F]/30 font-semibold">
                            ACTIVE
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 font-mono">
                        {pc.lanHost ? (
                          <span className="flex items-center gap-1 text-emerald-400">
                            <WifiHigh size={12} />
                            <span>LAN: {pc.lanHost}</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-blue-400">
                            <Globe size={12} />
                            <span>Remote</span>
                          </span>
                        )}
                        <span className="text-muted-foreground/40">•</span>
                        <span>{formatLastSeen(pc.lastSeen)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    {!isActive && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(pc);
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium border border-border bg-raised hover:bg-white/[0.08] text-foreground transition-colors"
                        title="Switch to this PC"
                      >
                        Switch
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPcToForget(pc);
                      }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Forget this PC"
                      aria-label="Forget computer"
                    >
                      <Trash size={15} />
                    </button>
                  </div>
                </div>

                {/* Confirm Forget Modal / Overlay */}
                {pcToForget?.pcId === pc.pcId && (
                  <div className="p-3 border-t border-rose-500/30 bg-rose-500/[0.07] rounded-b-2xl flex items-center justify-between text-xs">
                    <span className="text-rose-300">Forget {pc.name}?</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPcToForget(null)}
                        className="px-2 py-1 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleConfirmForget(pc)}
                        className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-700"
                      >
                        Forget
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
