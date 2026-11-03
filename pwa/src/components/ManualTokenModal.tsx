import React, { useState } from 'react';
import { AerokinLogo } from '@ui';
import { triggerHaptic } from '../utils/haptics';
import { ThemePreset } from '../theme/tokens';
import { Key, WarningCircle } from '@phosphor-icons/react';

export interface ManualTokenModalProps {
  initialToken?: string | null;
  onSaveToken: (token: string) => void;
  isRejected?: boolean;
  theme?: ThemePreset;
}

export const ManualTokenModal: React.FC<ManualTokenModalProps> = ({
  initialToken,
  onSaveToken,
  isRejected = false,
  theme = 'decepticon',
}) => {
  const [inputVal, setInputVal] = useState(initialToken || '');
  const [error, setError] = useState<string | null>(
    isRejected ? 'Authentication rejected: Invalid token. Check Windows terminal.' : null
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = inputVal.trim().toUpperCase();
    if (cleaned.length !== 6) {
      setError('Token must be exactly 6 characters (e.g. 4EA378)');
      triggerHaptic('medium');
      return;
    }
    setError(null);
    triggerHaptic('light');
    onSaveToken(cleaned);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-sm rounded-2xl bg-hw-surface border border-hw-border shadow-2xl overflow-hidden p-6 text-center">
        <div className="flex justify-center mb-4">
          <AerokinLogo size={56} animated theme={theme} />
        </div>

        <h2 className="font-display text-xl font-bold text-hw-text uppercase tracking-wider">
          Authentication Token
        </h2>

        <p className="font-sans text-xs text-hw-text-muted mt-1.5 mb-5 leading-relaxed">
          Inspect your Windows terminal banner for the 6-character authentication token saved in <span className="font-mono text-hw-text">.certs/token.txt</span>.
        </p>

        {error && (
          <div className="mb-4 flex items-center justify-center gap-2 p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono">
            <WarningCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="relative">
            <input
              type="text"
              maxLength={6}
              autoFocus
              value={inputVal}
              onChange={(e) => {
                setInputVal(e.target.value.toUpperCase());
                if (error) setError(null);
              }}
              placeholder="e.g. 4EA378"
              className="w-full h-13 rounded-xl bg-hw-oled-bg border border-hw-border-milled text-center font-mono text-2xl tracking-[0.25em] text-hw-primary uppercase focus:outline-none focus:border-hw-primary shadow-hw-well transition-colors"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3.5 px-4 rounded-xl bg-hw-primary hover:bg-hw-primary-hover active:scale-[0.98] text-white font-display font-bold text-xs uppercase tracking-wider transition-all shadow-hw-btn"
          >
            Authorize Remote Connection
          </button>
        </form>
      </div>
    </div>
  );
};
