import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AerokinLogo } from '@ui';
import {
  Copy,
  Check,
  DeviceMobile,
  Share,
} from '@phosphor-icons/react';

interface PairData {
  url: string;
  token: string;
  lanIp: string;
  port: number;
}

interface ServerStatusResponse {
  activeClients?: number;
  lastLatency?: number | null;
  recentEvents?: Array<{
    id: string;
    time: number;
    type: string;
    summary: string;
  }>;
}

export interface DesktopDashboardProps {
  onSwitchToPhoneView: () => void;
}

export const DesktopDashboard: React.FC<DesktopDashboardProps> = ({
  onSwitchToPhoneView,
}) => {
  const [pairData, setPairData] = useState<PairData | null>(null);
  const [trustQrUrl, setTrustQrUrl] = useState<string | null>(null);
  const [pairQrUrl, setPairQrUrl] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [status, setStatus] = useState<ServerStatusResponse>({
    activeClients: 0,
    lastLatency: null,
    recentEvents: [],
  });

  // 1. Fetch pairing information
  useEffect(() => {
    fetch('/api/pair')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch pair info');
        return res.json();
      })
      .then(async (data: PairData) => {
        setPairData(data);

        // QR 1: Certificate URL
        const trustUrl = `http://${data.lanIp}:8080`;
        const qr1 = await QRCode.toDataURL(trustUrl, {
          margin: 1,
          scale: 5,
          color: { dark: '#000000', light: '#FFFFFF' },
        });
        setTrustQrUrl(qr1);

        // QR 2: Pairing URL
        const qr2 = await QRCode.toDataURL(data.url, {
          margin: 1,
          scale: 5,
          color: { dark: '#000000', light: '#FFFFFF' },
        });
        setPairQrUrl(qr2);
      })
      .catch((err) => {
        console.warn('Pair info unavailable:', err);
      });
  }, []);

  // 2. Poll server status
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('/api/status')
        .then((res) => {
          if (!res.ok) return null;
          return res.json();
        })
        .then((data: ServerStatusResponse | null) => {
          if (data) {
            setStatus({
              activeClients: data.activeClients ?? 0,
              lastLatency: data.lastLatency ?? null,
              recentEvents: data.recentEvents ?? [],
            });
          }
        })
        .catch(() => {});
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const activeClients = status.activeClients ?? 0;
  const recentEvents = status.recentEvents ?? [];

  return (
    <div className="min-h-[100dvh] w-full bg-bg text-foreground flex flex-col justify-between py-6 px-6 select-none">
      <div className="max-w-[960px] mx-auto w-full flex-1 flex flex-col justify-between">
        {/* Top Header */}
        <header className="flex items-center justify-between pb-6 border-b border-border">
          <AerokinLogo size={28} withWordmark />

          <div className="flex items-center gap-4">
            {/* Connection status */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-border text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  activeClients > 0 ? 'bg-success' : 'bg-muted-foreground/30'
                }`}
              />
              <span className="text-foreground font-medium">
                {activeClients > 0
                  ? `${activeClients} iPhone connected`
                  : 'Waiting for iPhone'}
              </span>
              {status.lastLatency !== null && status.lastLatency !== undefined && (
                <span className="font-mono tabular-nums text-muted-foreground ml-1">
                  {status.lastLatency} ms
                </span>
              )}
            </div>

            <button
              onClick={onSwitchToPhoneView}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-surface hover:bg-raised text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <DeviceMobile size={15} />
              <span>Simulator</span>
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="py-8 flex flex-col gap-8">
          {/* Three numbered steps in a clean list */}
          <div className="rounded-2xl bg-surface border border-border p-6 flex flex-col gap-6">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">
                Set up iPhone remote
              </h2>
              <span className="text-xs text-muted-foreground">
                Same Wi-Fi network required
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Step 1: Certificate */}
              <div className="flex flex-col items-center text-center">
                <div className="w-6 h-6 rounded-full bg-raised text-foreground font-mono text-xs font-semibold flex items-center justify-center mb-3 border border-border">
                  1
                </div>
                <h3 className="text-xs font-semibold text-foreground">
                  Install certificate
                </h3>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Scan to install local root CA
                </p>

                <div className="p-2 bg-white rounded-xl border border-border shadow-sm mb-3">
                  {trustQrUrl ? (
                    <img src={trustQrUrl} alt="Certificate QR" className="w-28 h-28 object-contain" />
                  ) : (
                    <div className="w-28 h-28 flex items-center justify-center text-xs font-mono text-muted-foreground">
                      Loading...
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-muted-foreground leading-normal">
                  Tap Allow &rarr; Profile Downloaded &rarr; Install &rarr; Enable full trust in Settings.
                </p>
              </div>

              {/* Step 2: Pairing */}
              <div className="flex flex-col items-center text-center">
                <div className="w-6 h-6 rounded-full bg-accent text-black font-mono text-xs font-semibold flex items-center justify-center mb-3">
                  2
                </div>
                <h3 className="text-xs font-semibold text-foreground">
                  Pair remote
                </h3>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Scan to open secure remote
                </p>

                <div className="p-2 bg-white rounded-xl border border-border shadow-sm mb-3">
                  {pairQrUrl ? (
                    <img src={pairQrUrl} alt="Pairing QR" className="w-28 h-28 object-contain" />
                  ) : (
                    <div className="w-28 h-28 flex items-center justify-center text-xs font-mono text-muted-foreground">
                      Loading...
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-muted-foreground leading-normal">
                  Opens Aerokin over secure local HTTPS on port 8443.
                </p>
              </div>

              {/* Step 3: Add to Home Screen */}
              <div className="flex flex-col items-center text-center">
                <div className="w-6 h-6 rounded-full bg-raised text-foreground font-mono text-xs font-semibold flex items-center justify-center mb-3 border border-border">
                  3
                </div>
                <h3 className="text-xs font-semibold text-foreground">
                  Add to Home Screen
                </h3>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Fullscreen standalone view
                </p>

                <div className="w-28 h-28 rounded-xl bg-raised border border-border flex items-center justify-center mb-3 text-muted-foreground">
                  <Share size={32} />
                </div>

                <p className="text-[11px] text-muted-foreground leading-normal">
                  In Safari, tap Share &rarr; Add to Home Screen for a native fullscreen controller.
                </p>
              </div>
            </div>

            {/* Token + Copy row */}
            {pairData && (
              <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Token:</span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-foreground tracking-wider">
                    {pairData.token}
                  </span>
                  <button
                    onClick={() => handleCopy(pairData.token)}
                    className="p-1.5 rounded-lg border border-border bg-raised hover:bg-border text-foreground transition-colors"
                    title="Copy token"
                    aria-label="Copy token"
                  >
                    {copiedToken ? (
                      <Check size={14} className="text-success" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>

                <span className="font-mono text-[11px] text-muted-foreground truncate max-w-sm">
                  {pairData.url}
                </span>
              </div>
            )}
          </div>

          {/* Quiet Event Log */}
          <div className="rounded-2xl bg-surface border border-border p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-xs font-semibold text-foreground">
                Event log
              </span>
              <span className="text-xs font-mono tabular-nums text-muted-foreground">
                {recentEvents.length} events
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto flex flex-col gap-1 font-mono text-xs">
              {recentEvents.length === 0 ? (
                <div className="py-4 text-center text-muted-foreground text-xs">
                  Awaiting client events...
                </div>
              ) : (
                recentEvents.slice().reverse().map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between py-1 border-b border-border/50 text-[11px]"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-muted-foreground uppercase">[{ev.type}]</span>
                      <span className="text-foreground truncate">{ev.summary}</span>
                    </div>
                    <span className="text-muted-foreground tabular-nums ml-2 flex-shrink-0">
                      {new Date(ev.time).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>Aerokin</span>
          <button
            onClick={onSwitchToPhoneView}
            className="hover:text-foreground transition-colors"
          >
            Switch to phone view &rarr;
          </button>
        </footer>
      </div>
    </div>
  );
};
