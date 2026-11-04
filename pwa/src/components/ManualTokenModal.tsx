import React, { useState } from 'react';
import { triggerHaptic } from '../utils/haptics';
import { validateHost } from '../utils/hosting';

export interface ManualTokenModalProps {
  initialToken?: string | null;
  initialHost?: string | null;
  onSave?: (token: string, host?: string) => void;
  onSaveToken?: (token: string) => void;
  isRejected?: boolean;
  isHosted?: boolean;
  errorMessage?: string | null;
  onClose?: () => void;
  theme?: string;
}

export const ManualTokenModal: React.FC<ManualTokenModalProps> = ({
  initialToken,
  initialHost,
  onSave,
  onSaveToken,
  isRejected = false,
  isHosted = false,
  errorMessage,
  onClose,
}) => {
  const [tokenVal, setTokenVal] = useState(initialToken || '');
  const [hostVal, setHostVal] = useState(initialHost || '');

  const [hostError, setHostError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(
    isRejected ? 'Invalid token. Please check your PC terminal.' : null
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let hasError = false;

    // Validate Host in hosted mode
    let normalizedHost: string | undefined = undefined;
    if (isHosted) {
      const hostRes = validateHost(hostVal);
      if (!hostRes.valid) {
        setHostError(hostRes.error || 'Invalid host address');
        hasError = true;
      } else {
        normalizedHost = hostRes.normalized;
        setHostError(null);
      }
    }

    // Validate 6-character token
    const cleanedToken = tokenVal.trim().toUpperCase();
    if (cleanedToken.length !== 6) {
      setTokenError('Pairing code must be 6 characters');
      hasError = true;
    } else {
      setTokenError(null);
    }

    if (hasError) {
      triggerHaptic('medium');
      return;
    }

    triggerHaptic('light');
    if (onSave) {
      onSave(cleanedToken, normalizedHost);
    }
    if (onSaveToken) {
      onSaveToken(cleanedToken);
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none">
      <div className="w-full max-w-sm rounded-2xl bg-surface border border-border p-6 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-foreground">
            {isHosted ? 'Connect to PC Agent' : 'Enter pairing token'}
          </h2>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-xs py-1 px-2 rounded-lg"
              aria-label="Close"
            >
              Cancel
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          {isHosted
            ? 'Enter your PC local IP or hostname and the 6-character pairing code.'
            : 'Enter the 6-character token from your PC dashboard'}
        </p>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-optic-red/10 border border-optic-red/20 text-optic-red text-xs">
            <p className="font-semibold mb-1">Connection Issue</p>
            <p>{errorMessage}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {isHosted && (
            <div className="flex flex-col gap-1 text-left">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                PC Host Address
              </label>
              <input
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                value={hostVal}
                onChange={(e) => {
                  setHostVal(e.target.value);
                  if (hostError) setHostError(null);
                }}
                placeholder="e.g. 192.168.1.50:8443 or aerokin.local"
                className="w-full h-11 px-3 rounded-xl bg-raised border border-border font-mono text-sm text-foreground focus:outline-none focus:border-accent transition-colors"
              />
              {hostError && (
                <p className="text-[11px] text-optic-red mt-0.5">{hostError}</p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1 text-left">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Pairing Code
            </label>
            <input
              type="text"
              maxLength={6}
              autoFocus={!isHosted || !hostVal}
              value={tokenVal}
              onChange={(e) => {
                setTokenVal(e.target.value.toUpperCase());
                if (tokenError) setTokenError(null);
              }}
              placeholder="e.g. 4EA378"
              className="w-full h-12 rounded-xl bg-raised border border-border text-center font-mono text-xl tracking-[0.2em] text-foreground uppercase focus:outline-none focus:border-accent transition-colors"
            />
            {tokenError && (
              <p className="text-[11px] text-optic-red text-center mt-0.5">{tokenError}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full h-12 min-h-[48px] mt-2 rounded-xl bg-accent hover:bg-accent-hover active:bg-accent-pressed text-black text-xs font-semibold transition-transform active:scale-[0.97]"
          >
            Connect
          </button>
        </form>

        {isHosted && (
          <div className="mt-5 pt-4 border-t border-border text-left">
            <p className="text-[11px] font-medium text-muted-foreground mb-2">Requirements:</p>
            <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
              <li>Same Wi-Fi network as the PC</li>
              <li>AeroKin CA certificate installed & trusted</li>
              <li>Local Network permission allowed on mobile</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
