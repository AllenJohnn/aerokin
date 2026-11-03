import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AerokinLogo, GlassCard, Pill, GlowButton } from '@ui';
import { LatencySparkline } from './LatencySparkline';
import {
  Smartphone,
  Wifi,
  QrCode,
  Copy,
  Check,
  Activity,
  Share,
  PlusSquare,
  Radio,
} from 'lucide-react';

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
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<ServerStatusResponse>({
    activeClients: 0,
    lastLatency: null,
    recentEvents: [],
  });
  const [latencyHistory, setLatencyHistory] = useState<number[]>([12, 14, 11, 15, 12]);
  const [isLoopbackBlocked, setIsLoopbackBlocked] = useState(false);

  // 1. Fetch pair information from loopback API
  useEffect(() => {
    fetch('/api/pair')
      .then((res) => {
        if (!res.ok) {
          if (res.status === 403) setIsLoopbackBlocked(true);
          throw new Error('Failed to fetch pair info');
        }
        return res.json();
      })
      .then(async (data: PairData) => {
        setPairData(data);
        const url = await QRCode.toDataURL(data.url, {
          margin: 1.5,
          scale: 8,
          color: {
            dark: '#07070B',
            light: '#FFFFFF',
          },
        });
        setQrDataUrl(url);
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeClients = status.activeClients ?? 0;
  const recentEvents = status.recentEvents ?? [];

  return (
    <div className="min-h-screen w-full bg-[#07070B] text-aerokin-text flex flex-col justify-between p-6 lg:p-10 selection:bg-aerokin-cyan selection:text-black">
      {/* Top Desktop Navigation */}
      <header className="flex items-center justify-between pb-6 border-b border-white/[0.08] max-w-7xl mx-auto w-full">
        <AerokinLogo size={42} withWordmark withTagline />

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Pill status={activeClients > 0 ? 'online' : 'idle'} size="sm">
              {activeClients > 0
                ? `${activeClients} IPHONE CONNECTED`
                : 'WAITING FOR IPHONE'}
            </Pill>
            {status.lastLatency !== null && status.lastLatency !== undefined && (
              <Pill status="online" size="sm">
                {status.lastLatency}ms
              </Pill>
            )}
          </div>

          <GlowButton
            variant="secondary"
            size="sm"
            onClick={onSwitchToPhoneView}
            className="hidden sm:flex items-center gap-2"
          >
            <Smartphone className="w-4 h-4 text-aerokin-cyan" />
            <span>Open Phone Simulator</span>
          </GlowButton>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="max-w-7xl mx-auto w-full my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Col: Hero QR Pairing Station */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <GlassCard variant="default" padding="lg" className="flex flex-col items-center text-center">
            <div className="flex items-center gap-2 mb-4">
              <QrCode className="w-5 h-5 text-aerokin-cyan" />
              <span className="font-mono text-xs uppercase tracking-wider text-white font-bold">
                Scan to Connect iPhone
              </span>
            </div>

            {/* High-Resolution QR Card */}
            <div className="relative p-4 rounded-3xl bg-white shadow-glow-lg flex items-center justify-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="AEROKIN Pairing QR Code"
                  className="w-56 h-56 rounded-xl object-contain select-none"
                />
              ) : (
                <div className="w-56 h-56 flex flex-col items-center justify-center text-zinc-400 font-mono text-xs gap-2">
                  <div className="w-8 h-8 rounded-full border-2 border-aerokin-cyan border-t-transparent animate-spin" />
                  <span>Generating QR...</span>
                </div>
              )}
            </div>

            {/* Token & URL Pills */}
            {pairData && (
              <div className="w-full mt-6 flex flex-col gap-2.5">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/10 font-mono text-xs">
                  <span className="text-aerokin-muted">Pairing Token</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg text-aerokin-cyan tracking-widest">
                      {pairData.token}
                    </span>
                    <button
                      onClick={() => handleCopy(pairData.token)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-aerokin-muted hover:text-white transition-colors"
                      title="Copy Token"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 px-3 rounded-xl bg-white/[0.02] border border-white/[0.06] font-mono text-[11px] text-aerokin-muted overflow-hidden">
                  <span className="truncate mr-2">{pairData.url}</span>
                  <button
                    onClick={() => handleCopy(pairData.url)}
                    className="hover:text-white transition-colors flex-shrink-0"
                  >
                    Copy Link
                  </button>
                </div>
              </div>
            )}
          </GlassCard>

          {/* Quick instructions */}
          <GlassCard variant="subtle" padding="md" className="flex items-start gap-3">
            <Wifi className="w-5 h-5 text-aerokin-cyan flex-shrink-0 mt-0.5" />
            <div className="flex flex-col text-xs text-aerokin-muted leading-relaxed">
              <span className="font-semibold text-white">Same Wi-Fi Network Required</span>
              <span>
                Ensure your iPhone and Windows laptop are connected to the same Wi-Fi router or hotspot.
              </span>
            </div>
          </GlassCard>
        </div>

        {/* Right Col: Setup Steps & Live Telemetry Feed */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* iOS Safari Home Screen Setup Guide */}
          <GlassCard variant="default" padding="lg" className="flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <span className="font-sans font-bold text-white text-base">
                iPhone Setup (Add to Home Screen)
              </span>
              <span className="font-mono text-[11px] text-aerokin-cyan">Zero App Store Install</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-2 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-aerokin-cyan/20 text-aerokin-cyan font-mono text-xs font-bold flex items-center justify-center">
                    1
                  </span>
                  <span className="font-sans font-semibold text-xs text-white">Scan QR Code</span>
                </div>
                <p className="text-[11px] text-aerokin-muted leading-relaxed">
                  Open the iOS Camera or Safari and scan the QR code. Tap to open the secure local link.
                </p>
              </div>

              <div className="flex flex-col gap-2 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-aerokin-cyan/20 text-aerokin-cyan font-mono text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <span className="font-sans font-semibold text-xs text-white">Trust Local SSL</span>
                </div>
                <p className="text-[11px] text-aerokin-muted leading-relaxed">
                  If Safari warns of a self-signed cert, tap "Advanced" &rarr; "Proceed to {pairData?.lanIp || 'server'}".
                </p>
              </div>

              <div className="flex flex-col gap-2 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-aerokin-cyan/20 text-aerokin-cyan font-mono text-xs font-bold flex items-center justify-center">
                    3
                  </span>
                  <span className="font-sans font-semibold text-xs text-white">Add to Home Screen</span>
                </div>
                <p className="text-[11px] text-aerokin-muted leading-relaxed">
                  In Safari, tap Share <Share className="inline w-3 h-3 text-aerokin-cyan" /> &rarr; "Add to Home Screen" <PlusSquare className="inline w-3 h-3 text-aerokin-cyan" />.
                </p>
              </div>
            </div>
          </GlassCard>

          {/* Live Telemetry & Event Stream */}
          <GlassCard variant="default" padding="lg" className="flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-aerokin-cyan" />
                <span className="font-sans font-bold text-white text-base">
                  Live Event Monitor
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-aerokin-muted">Ping Sparkline:</span>
                <LatencySparkline history={latencyHistory} width={56} height={16} />
              </div>
            </div>

            {/* Event Console Log */}
            <div className="h-44 rounded-2xl bg-black/40 border border-white/[0.06] p-3 font-mono text-xs overflow-y-auto flex flex-col gap-1.5">
              {recentEvents.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-aerokin-muted text-center gap-1">
                  <Radio className="w-5 h-5 text-aerokin-cyan animate-pulse" />
                  <span>Awaiting inputs from iPhone...</span>
                  <span className="text-[10px]">Hold the Air Mouse pad or swipe trackpad to see live 60Hz stream</span>
                </div>
              ) : (
                recentEvents.slice().reverse().map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center justify-between py-0.5 border-b border-white/[0.03] text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-aerokin-cyan font-semibold">[{ev.type.toUpperCase()}]</span>
                      <span className="text-white">{ev.summary}</span>
                    </div>
                    <span className="text-aerokin-muted text-[10px]">
                      {new Date(ev.time).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </GlassCard>
        </div>
      </main>

      {/* Desktop Footer */}
      <footer className="flex flex-col sm:flex-row items-center justify-between pt-6 border-t border-white/[0.06] max-w-7xl mx-auto w-full text-xs text-aerokin-muted gap-2">
        <span className="font-mono text-[11px]">AEROKIN v1.0.0 · Windows Native Engine</span>
        <button
          onClick={onSwitchToPhoneView}
          className="text-aerokin-cyan hover:underline font-mono text-[11px]"
        >
          Switch to iPhone Mobile View &rarr;
        </button>
      </footer>
    </div>
  );
};
