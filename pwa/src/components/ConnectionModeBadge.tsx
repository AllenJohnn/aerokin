import React, { useState } from 'react';
import { Lightning, WifiHigh, Globe, ShieldCheck, X } from '@phosphor-icons/react';
import { triggerHaptic } from '../utils/haptics';

export type ConnectionMode = 'lan_direct' | 'webrtc_direct' | 'webrtc_turn';

export interface ConnectionModeBadgeProps {
  status: string;
  mode?: ConnectionMode;
  latency?: number | null;
  bitrateKbps?: number | null;
  codec?: string;
  fps?: number | null;
  packetLossPercent?: number;
  onOpenSettings?: () => void;
}

export const ConnectionModeBadge: React.FC<ConnectionModeBadgeProps> = ({
  status,
  mode = 'lan_direct',
  latency = null,
  bitrateKbps = null,
  codec = 'H.264 (NVENC)',
  fps = null,
  packetLossPercent = 0,
  onOpenSettings,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const isConnected = status === 'connected';

  const getModeInfo = () => {
    if (!isConnected) {
      if (status === 'reconnecting') {
        return {
          dotColor: 'bg-amber-400',
          label: 'RECONNECTING',
          badgeBg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          icon: <WifiHigh size={12} className="animate-pulse" />,
          title: 'Reconnecting to PC...',
        };
      }
      return {
        dotColor: 'bg-muted-foreground/40',
        label: 'OFFLINE',
        badgeBg: 'bg-secondary text-muted-foreground border-border/40',
        icon: null,
        title: 'Disconnected',
      };
    }

    switch (mode) {
      case 'webrtc_direct':
        return {
          dotColor: 'bg-[#0A84FF]',
          label: 'DIRECT P2P',
          badgeBg: 'bg-[#0A84FF]/10 text-[#0A84FF] border-[#0A84FF]/30',
          icon: <Globe size={12} weight="bold" />,
          title: 'WebRTC P2P Direct Connection',
        };
      case 'webrtc_turn':
        return {
          dotColor: 'bg-[#FFD60A]',
          label: 'TURN RELAY',
          badgeBg: 'bg-[#FFD60A]/10 text-[#FFD60A] border-[#FFD60A]/30',
          icon: <Globe size={12} />,
          title: 'WebRTC Coturn Relay Connection',
        };
      case 'lan_direct':
      default:
        return {
          dotColor: 'bg-[#30D158]',
          label: 'LAN DIRECT',
          badgeBg: 'bg-[#30D158]/10 text-[#30D158] border-[#30D158]/30',
          icon: <Lightning size={12} weight="fill" />,
          title: 'Direct Local Wi-Fi (Fastest, Sub-10ms)',
        };
    }
  };

  const info = getModeInfo();

  return (
    <>
      <button
        onClick={() => {
          triggerHaptic('light');
          setShowDetails((prev) => !prev);
        }}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono font-medium transition-all active:scale-[0.97] cursor-pointer ${info.badgeBg}`}
        title={`${info.title} - Tap for network diagnostics`}
        aria-label="Connection diagnostics"
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${info.dotColor} ${isConnected ? '' : 'animate-pulse'}`}
        />
        {info.icon}
        <span>{info.label}</span>
        {isConnected && latency !== null && (
          <span className="text-[10px] opacity-80 border-l border-current/20 pl-1.5">
            {latency}ms
          </span>
        )}
      </button>

      {/* Diagnostics Popover Modal */}
      {showDetails && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none"
          onClick={() => setShowDetails(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-[#0A0A0A] border border-[#1F1F1F] p-4 text-left shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#1F1F1F] pb-2.5">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${info.dotColor}`} />
                <h3 className="text-xs font-semibold text-[#F5F5F5]">{info.title}</h3>
              </div>
              <button
                onClick={() => setShowDetails(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-[#F5F5F5]"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between py-1 border-b border-[#1F1F1F]/60">
                <span className="text-muted-foreground">Mode:</span>
                <span className="text-[#F5F5F5] font-semibold">{info.label}</span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-[#1F1F1F]/60">
                <span className="text-muted-foreground">Round-Trip RTT:</span>
                <span
                  className={`font-semibold ${
                    latency === null
                      ? 'text-muted-foreground'
                      : latency < 20
                        ? 'text-emerald-400'
                        : latency < 60
                          ? 'text-amber-400'
                          : 'text-red-400'
                  }`}
                >
                  {latency !== null ? `${latency} ms` : 'N/A'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-[#1F1F1F]/60">
                <span className="text-muted-foreground">Packet Loss:</span>
                <span className="text-emerald-400 font-semibold">
                  {packetLossPercent.toFixed(1)}%
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-[#1F1F1F]/60">
                <span className="text-muted-foreground">Video Codec:</span>
                <span className="text-[#FF5A1F] font-semibold">{codec}</span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-[#1F1F1F]/60">
                <span className="text-muted-foreground">Bitrate:</span>
                <span className="text-[#F5F5F5]">
                  {bitrateKbps ? `${Math.round(bitrateKbps)} kbps` : 'Idle'}
                </span>
              </div>

              {fps !== null && (
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground">Frame Rate:</span>
                  <span className="text-[#F5F5F5]">{fps} FPS</span>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#1F1F1F] text-[11px] text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
              <span>TLS 1.3 End-to-End Encrypted (AES-GCM)</span>
            </div>

            {onOpenSettings && (
              <button
                onClick={() => {
                  setShowDetails(false);
                  onOpenSettings();
                }}
                className="w-full mt-1 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium transition-colors"
              >
                Open Network Settings
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};
