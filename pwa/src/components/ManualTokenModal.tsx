import React, { useState } from 'react';
import { TextField } from '@ui';
import { triggerHaptic } from '../utils/haptics';
import { validateHost } from '../utils/hosting';

export interface ManualTokenModalProps {
  initialToken?: string | null;
  initialCode?: string | null;
  initialHost?: string | null;
  initialDeviceName?: string | null;
  onSave?: (token: string, host?: string) => void;
  onSaveToken?: (token: string) => void;
  onPair?: (
    code: string,
    name?: string,
    platform?: string,
    host?: string
  ) => Promise<{ ok: boolean; error?: string } | void>;
  isAwaitingApproval?: boolean;
  isRejected?: boolean;
  isHosted?: boolean;
  errorMessage?: string | null;
  onClose?: () => void;
  theme?: string;
}

export const ManualTokenModal: React.FC<ManualTokenModalProps> = ({
  initialToken,
  initialCode,
  initialHost,
  initialDeviceName,
  onSave,
  onSaveToken,
  onPair,
  isAwaitingApproval = false,
  isRejected = false,
  isHosted = false,
  errorMessage,
  onClose,
}) => {
  const [codeVal, setCodeVal] = useState(initialCode || initialToken || '');
  const [hostVal, setHostVal] = useState(initialHost || '');
  const isApple = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [deviceName, setDeviceName] = useState(
    initialDeviceName || (isApple ? "Allen's iPhone" : 'Mobile Device')
  );

  const [hostError, setHostError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(
    isRejected ? 'Invalid or expired pairing code. Please check your PC terminal.' : null
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || isAwaitingApproval) return;

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

    // Validate pairing code (8 digits, or 6 hex characters fallback)
    const cleanedCode = codeVal.trim();
    if (cleanedCode.length !== 8 && cleanedCode.length !== 6) {
      setCodeError('Pairing code must be 8 digits (displayed on PC terminal)');
      hasError = true;
    } else {
      setCodeError(null);
    }

    if (hasError) {
      triggerHaptic('medium');
      return;
    }

    triggerHaptic('light');

    if (onPair) {
      setSubmitting(true);
      const platform = isApple ? 'iOS' : 'Web';
      const res = await onPair(cleanedCode, deviceName.trim(), platform, normalizedHost);
      setSubmitting(false);
      if (res && !res.ok) {
        setCodeError(res.error || 'Pairing failed');
        triggerHaptic('medium');
        return;
      }
      if (onClose) {
        onClose();
      }
      return;
    }

    if (onSave) {
      onSave(cleanedCode, normalizedHost);
    }
    if (onSaveToken) {
      onSaveToken(cleanedCode);
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-sm rounded-2xl bg-surface border border-border p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-foreground">
            {isHosted ? 'Connect to PC Agent' : 'Pair with PC'}
          </h2>
          {onClose && !isAwaitingApproval && (
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
            ? 'Enter PC host address and the short-lived 8-digit pairing code from your PC terminal.'
            : 'Enter the 8-digit code shown on your PC terminal.'}
        </p>

        {isAwaitingApproval ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="w-10 h-10 rounded-full border-2 border-accent border-t-transparent animate-spin mb-4" />
            <h3 className="text-sm font-semibold text-foreground mb-1">Awaiting PC Approval...</h3>
            <p className="text-xs text-muted-foreground max-w-xs mb-3">
              Look at your PC terminal and press <strong className="text-accent">"y"</strong> to
              approve this device.
            </p>
            <div className="text-[11px] font-mono text-muted-foreground/60">
              30s timeout • default deny
            </div>
          </div>
        ) : (
          <>
            {errorMessage && (
              <div className="mb-4 p-3 rounded-xl bg-optic-red/10 border border-optic-red/20 text-optic-red text-xs">
                <p className="font-semibold mb-1">Pairing Issue</p>
                <p>{errorMessage}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {isHosted && (
                <TextField
                  label="PC Host Address"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  value={hostVal}
                  onChange={(e) => {
                    setHostVal(e.target.value);
                    if (hostError) setHostError(null);
                  }}
                  placeholder="e.g. 192.168.1.50:8443 or aerokin.local"
                  error={hostError || undefined}
                  className="font-mono text-sm"
                />
              )}

              <TextField
                label="Device Name"
                maxLength={32}
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g. Allen's iPhone"
                className="text-sm"
              />

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-[#8A8A8A]">8-Digit Pairing Code</label>
                  <span className="text-[10px] text-muted-foreground font-mono">valid 2m</span>
                </div>
                <TextField
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  autoFocus={!isHosted || !hostVal}
                  value={codeVal}
                  onChange={(e) => {
                    setCodeVal(e.target.value.replace(/[^0-9a-fA-F]/g, ''));
                    if (codeError) setCodeError(null);
                  }}
                  placeholder="e.g. 84920153"
                  error={codeError || undefined}
                  className="text-center font-mono text-xl tracking-[0.25em]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-12 min-h-[48px] mt-2 rounded-xl bg-accent hover:bg-accent-hover active:bg-accent-pressed text-black text-xs font-semibold transition-transform active:scale-[0.97] disabled:opacity-50"
              >
                {submitting ? 'Requesting Approval...' : 'Pair Device'}
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
          </>
        )}
      </div>
    </div>
  );
};
