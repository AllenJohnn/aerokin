import React, { useState } from 'react';
import { triggerHaptic } from '../utils/haptics';

export interface ManualTokenModalProps {
  initialToken?: string | null;
  onSaveToken: (token: string) => void;
  isRejected?: boolean;
  theme?: string;
}

export const ManualTokenModal: React.FC<ManualTokenModalProps> = ({
  initialToken,
  onSaveToken,
  isRejected = false,
}) => {
  const [inputVal, setInputVal] = useState(initialToken || '');
  const [error, setError] = useState<string | null>(
    isRejected ? 'Invalid token. Please check your PC terminal.' : null
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = inputVal.trim().toUpperCase();
    if (cleaned.length !== 6) {
      setError('Token must be 6 characters');
      triggerHaptic('medium');
      return;
    }
    setError(null);
    triggerHaptic('light');
    onSaveToken(cleaned);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 select-none">
      <div className="w-full max-w-sm rounded-2xl bg-surface border border-border p-6 text-center shadow-lg">
        <h2 className="text-base font-semibold text-foreground">
          Enter pairing token
        </h2>

        <p className="text-xs text-muted-foreground mt-1 mb-5">
          Enter the 6-character token from your PC dashboard
        </p>

        {error && (
          <p className="mb-4 text-xs text-error">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
            className="w-full h-12 rounded-xl bg-raised border border-border text-center font-mono text-xl tracking-[0.2em] text-foreground uppercase focus:outline-none focus:border-accent transition-colors"
          />

          <button
            type="submit"
            className="w-full h-12 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-transform active:scale-[0.97]"
          >
            Connect
          </button>
        </form>
      </div>
    </div>
  );
};
