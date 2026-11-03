import React, { useState } from 'react';
import { GlassCard, GlowButton, AerokinLogo, Pill } from '@ui';
import { triggerHaptic } from '../utils/haptics';

export interface ManualTokenModalProps {
  initialToken?: string | null;
  onSaveToken: (token: string) => void;
  isRejected?: boolean;
}

export const ManualTokenModal: React.FC<ManualTokenModalProps> = ({
  initialToken,
  onSaveToken,
  isRejected = false,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <GlassCard variant="glow" glowColor="cyan" padding="lg" className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-4">
          <AerokinLogo size="md" animated />
        </div>

        <h2 className="font-sans text-xl font-bold text-white tracking-tight">
          Enter Auth Token
        </h2>

        <p className="font-sans text-xs text-aerokin-muted mt-1.5 mb-6 leading-relaxed">
          Check your Windows PC terminal for the 6-character authentication token printed below the QR code.
        </p>

        {error && (
          <div className="mb-4">
            <Pill status="error" size="sm">
              {error}
            </Pill>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            className="w-full h-12 rounded-xl bg-white/[0.06] border border-white/10 text-center font-mono text-xl tracking-[0.25em] text-aerokin-cyan uppercase focus:outline-none focus:border-aerokin-cyan/60 transition-colors"
          />

          <GlowButton variant="primary" size="lg" fullWidth type="submit">
            Connect to Windows PC
          </GlowButton>
        </form>
      </GlassCard>
    </div>
  );
};
