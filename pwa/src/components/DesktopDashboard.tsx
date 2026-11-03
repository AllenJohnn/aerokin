import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AerokinLogo } from '@ui';
import { LatencySparkline } from './LatencySparkline';
import { ThemePreset } from '../theme/tokens';
import {
  DeviceMobile,
  WifiHigh,
  QrCode,
  Copy,
  Check,
  Pulse,
  Share,
  PlusSquare,
  ShieldCheck,
  Terminal,
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
  theme?: ThemePreset;
}

export const DesktopDashboard: React.FC<DesktopDashboardProps> = ({
  onSwitchToPhoneView,
  theme = 'decepticon',
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
  const [latencyHistory, setLatencyHistory] = useState<number[]>([12, 14, 11, 15, 12]);

  // 1. Fetch pair information from loopback API
  useEffect(() => {
    fetch('/api/pair')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch pair info');
        return res.json();
      })
      .then(async (data: PairData) => {
        setPairData(data);

        // QR 1: Trust URL http://<ip>:8080
        const trustUrl = `http://${data.lanIp}:8080`;
        const qr1 = await QRCode.toDataURL(trustUrl, {
          margin: 1.5,
          scale: 6,
          color: { dark: '#0A0B0E', light: '#FFFFFF' },
        });
        setTrustQrUrl(qr1);

        // QR 2: Pairing URL https://<ip>:8443/?token=<token>
        const qr2 = await QRCode.toDataURL(data.url, {
          margin: 1.5,
          scale: 6,
          color: { dark: '#0A0B0E', light: '#FFFFFF' },
        });
        setPairQrUrl(qr2);
      })
      .catch((err) => {
        console.warn('Pair info unavailable:', err);
      });
  }, []);

  // 2. Poll server status every 1.5 seconds
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
            if (data.lastLatency !== null && data.lastLatency !== undefined) {
              setLatencyHistory((prev) => [...prev.slice(-15), data.lastLatency!]);
            }
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
    <div className="min-h-screen w-full bg-hw-bg text-hw-text flex flex-col justify-between p-6 lg:p-10 select-none">
      {/* Top Machined Header */}
      <header className="flex items-center justify-between pb-6 border-b border-hw-border max-w-7xl mx-auto w-full">
        <AerokinLogo size={42} withWordmark withTagline theme={theme} />

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="px-3 py-1 rounded bg-hw-surface-sunken border border-hw-border flex items-center gap-2 font-mono text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  activeClients > 0
                    ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]'
                    : 'bg-white/20'
                }`}
              />
              <span className="text-hw-text font-bold">
                {activeClients > 0 ? `${activeClients} IPHONE CONNECTED` : 'WAITING FOR IPHONE'}
              </span>
            </div>

            {status.lastLatency !== null && (
              <div className="px-2.5 py-1 rounded bg-hw-surface-sunken border border-hw-border font-mono text-xs text-hw-primary font-bold">
                {status.lastLatency}ms
              </div>
            )}
          </div>

          <button
            onClick={onSwitchToPhoneView}
            className="hidden sm:flex items-center gap-2 py-1.5 px-3.5 rounded bg-hw-surface border border-hw-border shadow-hw-btn active:shadow-hw-btn-pressed hover:border-hw-primary text-xs font-display font-bold uppercase tracking-wider text-hw-text transition-all"
          >
            <DeviceMobile size={16} className="text-hw-primary" weight="bold" />
            <span>Open Phone Simulator</span>
          </button>
        </div>
      </header>

      {/* Main Machined Console Content */}
      <main className="max-w-7xl mx-auto w-full my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: 3-Step Pairing Station */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="rounded-2xl bg-hw-surface border border-hw-border p-6 shadow-hw-well flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-hw-border-subtle mb-6">
              <div className="flex items-center gap-2">
                <QrCode size={20} className="text-hw-primary" weight="bold" />
                <span className="font-display font-bold text-sm uppercase tracking-wider text-hw-text">
                  3-Step iPhone Setup Station
                </span>
              </div>
              <span className="font-mono text-[10px] text-hw-text-dim uppercase">
                Zero App Store Install
              </span>
            </div>

            {/* 3 Step Flow */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Step 1: Install Local CA Certificate */}
              <div className="rounded-xl bg-hw-surface-sunken border border-hw-border p-4 flex flex-col items-center text-center">
                <div className="w-6 h-6 rounded-full bg-hw-primary/20 text-hw-primary font-mono text-xs font-bold flex items-center justify-center mb-2">
                  1
                </div>
                <span className="font-display font-bold text-xs uppercase tracking-wide text-hw-text">
                  Install Certificate
                </span>
                <span className="font-mono text-[9px] text-hw-text-dim mt-0.5 mb-3">
                  One-time 10-year root
                </span>

                <div className="p-2 bg-white rounded-lg shadow-md mb-3">
                  {trustQrUrl ? (
                    <img src={trustQrUrl} alt="Trust QR" className="w-28 h-28 object-contain" />
                  ) : (
                    <div className="w-28 h-28 flex items-center justify-center text-xs font-mono text-zinc-400">
                      Loading...
                    </div>
                  )}
                </div>

                <p className="font-sans text-[11px] text-hw-text-muted leading-relaxed">
                  Scan QR with iPhone Camera &rarr; tap Allow &rarr; Settings &rarr; Profile Downloaded &rarr; Install &rarr; Enable full trust.
                </p>
              </div>

              {/* Step 2: Scan Pairing QR */}
              <div className="rounded-xl bg-hw-surface-sunken border border-hw-border p-4 flex flex-col items-center text-center ring-1 ring-hw-primary/30">
                <div className="w-6 h-6 rounded-full bg-hw-primary text-white font-mono text-xs font-bold flex items-center justify-center mb-2 shadow-sm">
                  2
                </div>
                <span className="font-display font-bold text-xs uppercase tracking-wide text-hw-text">
                  Pair Remote
                </span>
                <span className="font-mono text-[9px] text-hw-text-dim mt-0.5 mb-3">
                  Secure local link
                </span>

                <div className="p-2 bg-white rounded-lg shadow-md mb-3">
                  {pairQrUrl ? (
                    <img src={pairQrUrl} alt="Pairing QR" className="w-28 h-28 object-contain" />
                  ) : (
                    <div className="w-28 h-28 flex items-center justify-center text-xs font-mono text-zinc-400">
                      Loading...
                    </div>
                  )}
                </div>

                <p className="font-sans text-[11px] text-hw-text-muted leading-relaxed">
                  Scan to pair with PC on port 8443. Opens with green SSL lock and full gyroscopic permissions.
                </p>
              </div>

              {/* Step 3: Add to Home Screen */}
              <div className="rounded-xl bg-hw-surface-sunken border border-hw-border p-4 flex flex-col items-center text-center">
                <div className="w-6 h-6 rounded-full bg-white/10 text-hw-text-muted font-mono text-xs font-bold flex items-center justify-center mb-2">
                  3
                </div>
                <span className="font-display font-bold text-xs uppercase tracking-wide text-hw-text">
                  Home Screen
                </span>
                <span className="font-mono text-[9px] text-hw-text-dim mt-0.5 mb-3">
                  Fullscreen standalone
                </span>

                <div className="w-28 h-28 rounded-lg bg-hw-surface flex flex-col items-center justify-center gap-2 border border-hw-border mb-3 text-hw-primary">
                  <Share size={24} />
                  <PlusSquare size={24} />
                </div>

                <p className="font-sans text-[11px] text-hw-text-muted leading-relaxed">
                  In Safari, tap <Share className="inline w-3 h-3 text-hw-primary" /> &rarr; "Add to Home Screen" for a fullscreen native remote experience.
                </p>
              </div>
            </div>

            {/* Token & Link Strip */}
            {pairData && (
              <div className="mt-6 pt-4 border-t border-hw-border-subtle flex flex-col sm:flex-row items-center justify-between gap-3 font-mono text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-hw-text-dim">Pairing Token:</span>
                  <span className="font-bold text-base text-hw-primary tracking-widest">
                    {pairData.token}
                  </span>
                  <button
                    onClick={() => handleCopy(pairData.token)}
                    className="p-1 rounded hover:bg-white/5 text-hw-text-muted hover:text-hw-text transition-colors"
                    title="Copy Token"
                  >
                    {copiedToken ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>

                <div className="text-[11px] text-hw-text-dim truncate max-w-sm">
                  {pairData.url}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Event Monitor & Network Telemetry */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Live Telemetry Console */}
          <div className="rounded-2xl bg-hw-surface border border-hw-border p-6 shadow-hw-well flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-hw-border-subtle mb-4">
              <div className="flex items-center gap-2">
                <Pulse size={18} className="text-hw-primary" weight="bold" />
                <span className="font-display font-bold text-xs uppercase tracking-wider text-hw-text">
                  Live Event Monitor
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-hw-text-dim">RTT History:</span>
                <LatencySparkline history={latencyHistory} width={54} height={16} />
              </div>
            </div>

            {/* Console Terminal Log */}
            <div className="h-64 rounded-xl bg-hw-oled-bg border border-hw-border-subtle p-3.5 font-mono text-xs overflow-y-auto flex flex-col gap-1.5 shadow-hw-well">
              {recentEvents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-hw-text-dim text-center gap-1">
                  <Terminal size={22} className="opacity-40 animate-pulse text-hw-primary" />
                  <span className="text-xs">Awaiting client inputs...</span>
                  <span className="text-[10px]">Sweep air pointer or touch trackpad on iPhone</span>
                </div>
              ) : (
                recentEvents.slice().reverse().map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between py-0.5 border-b border-white/[0.03] text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-hw-primary font-bold">[{ev.type.toUpperCase()}]</span>
                      <span className="text-hw-text truncate">{ev.summary}</span>
                    </div>
                    <span className="text-hw-text-dim text-[10px]">
                      {new Date(ev.time).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Wi-Fi Note */}
          <div className="p-4 rounded-xl bg-hw-surface-sunken border border-hw-border-subtle flex items-start gap-3 text-xs text-hw-text-muted">
            <WifiHigh size={20} className="text-hw-primary flex-shrink-0 mt-0.5" weight="bold" />
            <div className="flex flex-col leading-relaxed">
              <span className="font-display font-bold text-hw-text uppercase">Same Wi-Fi Required</span>
              <span className="text-[11px]">
                Ensure your iPhone and Windows laptop are connected to the same Wi-Fi router or personal hotspot ({pairData?.lanIp || 'Local LAN'}).
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Desktop Footer */}
      <footer className="flex flex-col sm:flex-row items-center justify-between pt-6 border-t border-hw-border max-w-7xl mx-auto w-full text-xs text-hw-text-muted gap-2">
        <span className="font-mono text-[11px]">AEROKIN v2.0 · Windows Native Automation Core</span>
        <button
          onClick={onSwitchToPhoneView}
          className="text-hw-primary hover:underline font-mono text-[11px]"
        >
          Switch to iPhone Mobile View &rarr;
        </button>
      </footer>
    </div>
  );
};
