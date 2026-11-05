import React, { useState } from 'react';
import {
  AerokinLogo,
  GlassCard,
  GlowButton,
  Pill,
  Toggle,
  Slider,
  TabBar,
  AerokinCursor,
} from '../index';


export const DesignShowcase: React.FC = () => {
  // Interactive state for playground
  const [activeTab, setActiveTab] = useState('trackpad');
  const [cursorEnabled, setCursorEnabled] = useState(true);
  const [trailLength, setTrailLength] = useState(26);
  const [trackpadSensitivity, setTrackpadSensitivity] = useState(100);
  const [volume, setVolume] = useState(72);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [batterySaving, setBatterySaving] = useState(false);
  const [isSimPlaying, setIsSimPlaying] = useState(true);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(label);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const navTabs = [
    { id: 'trackpad', label: 'Trackpad' },
    { id: 'media-remote', label: 'Media Remote' },
    { id: 'settings', label: 'Device Settings' },
  ];

  return (
    <div className="relative min-h-screen bg-aerokin-bg text-aerokin-text aerokin-grid-bg pb-24">
      {/* Dynamic 60fps Comet Cursor */}
      <AerokinCursor enabled={cursorEnabled} trailLength={trailLength} />

      {/* Atmospheric Top Glow */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-96 aerokin-radial-glow opacity-80" />

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-aerokin-border bg-[#07070B]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-4">
            <AerokinLogo size="md" withWordmark withTagline animated />
          </div>

          <div className="flex items-center gap-3">
            <Pill status="online" size="sm">
              CONNECTED · 12ms
            </Pill>
            <div className="hidden sm:block">
              <Pill status="active" size="sm">
                TRACKPAD · 120Hz
              </Pill>
            </div>
            <a
              href="#playground"
              className="hidden md:inline-flex items-center gap-1.5 text-xs font-mono text-aerokin-muted hover:text-white transition-colors"
            >
              SIMULATOR ↓
            </a>
          </div>
        </div>
      </header>

      {/* Hero Header */}
      <main className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
        <div className="relative mb-16 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 mb-4">
            <Pill status="active" size="sm">
              DESIGN SYSTEM V1.0
            </Pill>
            <span className="font-mono text-xs text-aerokin-muted">
              REACT + TYPESCRIPT + TAILWIND
            </span>
          </div>

          <h1 className="font-sans text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tightest text-white leading-none">
            Move the air.{' '}
            <span className="text-gradient">Move your PC.</span>
          </h1>

          <p className="mt-4 max-w-2xl text-base sm:text-lg text-aerokin-muted leading-relaxed">
            The spatial hardware-grade design system for AEROKIN: turn your iPhone into an ultra-low latency air mouse, presentation pointer, and media remote for Windows.
          </p>

          {/* Quick Stat Pill Grid */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Pill status="online" size="md">
              0.22, 1, 0.36, 1 FLUID CURVES
            </Pill>
            <Pill status="active" size="md">
              GEIST + GEIST MONO
            </Pill>
            <Pill status="idle" size="md">
              #07070B DARK VOID ONLY
            </Pill>
            <Pill status="warning" size="md">
              HARDWARE ACCELERATED 60FPS
            </Pill>
          </div>
        </div>

        {/* Section 1: Brand Logo & Iconography Suite */}
        <section className="mb-20">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-white/[0.06] pb-4">
            <div>
              <span className="font-mono text-xs uppercase tracking-mono text-aerokin-cyan">
                01 · Brand Identity
              </span>
              <h2 className="font-sans text-2xl font-bold tracking-tight text-white mt-1">
                Logo & Exported SVGs
              </h2>
            </div>
            <p className="font-sans text-xs text-aerokin-muted">
              Angular "A" with supersonic light trail crossbar and glowing pointer beacon.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Logo Large */}
            <GlassCard variant="default" padding="lg" className="flex flex-col items-center justify-center text-center">
              <div className="mb-6 flex h-28 items-center justify-center">
                <AerokinLogo size="lg" animated />
              </div>
              <span className="font-mono text-xs font-semibold text-white">Large (96px)</span>
              <span className="font-mono text-[11px] text-aerokin-muted mt-1">public/logo-lg.svg</span>
              <a
                href="/logo-lg.svg"
                target="_blank"
                rel="noreferrer"
                className="mt-3 text-xs text-aerokin-cyan hover:underline font-mono"
              >
                Inspect SVG ↗
              </a>
            </GlassCard>

            {/* Logo Medium */}
            <GlassCard variant="default" padding="lg" className="flex flex-col items-center justify-center text-center">
              <div className="mb-6 flex h-28 items-center justify-center">
                <AerokinLogo size="md" animated />
              </div>
              <span className="font-mono text-xs font-semibold text-white">Medium (48px)</span>
              <span className="font-mono text-[11px] text-aerokin-muted mt-1">public/logo-md.svg</span>
              <a
                href="/logo-md.svg"
                target="_blank"
                rel="noreferrer"
                className="mt-3 text-xs text-aerokin-cyan hover:underline font-mono"
              >
                Inspect SVG ↗
              </a>
            </GlassCard>

            {/* Logo Small */}
            <GlassCard variant="default" padding="lg" className="flex flex-col items-center justify-center text-center">
              <div className="mb-6 flex h-28 items-center justify-center">
                <AerokinLogo size="sm" animated />
              </div>
              <span className="font-mono text-xs font-semibold text-white">Small (24px)</span>
              <span className="font-mono text-[11px] text-aerokin-muted mt-1">public/logo-sm.svg</span>
              <a
                href="/logo-sm.svg"
                target="_blank"
                rel="noreferrer"
                className="mt-3 text-xs text-aerokin-cyan hover:underline font-mono"
              >
                Inspect SVG ↗
              </a>
            </GlassCard>

            {/* Favicon */}
            <GlassCard variant="default" padding="lg" className="flex flex-col items-center justify-center text-center">
              <div className="mb-6 flex h-28 items-center justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#07070B] border border-white/10 shadow-glow-sm">
                  <img src="/favicon.svg" alt="Favicon" className="h-8 w-8" />
                </div>
              </div>
              <span className="font-mono text-xs font-semibold text-white">Favicon (32px)</span>
              <span className="font-mono text-[11px] text-aerokin-muted mt-1">public/favicon.svg</span>
              <a
                href="/favicon.svg"
                target="_blank"
                rel="noreferrer"
                className="mt-3 text-xs text-aerokin-cyan hover:underline font-mono"
              >
                Inspect SVG ↗
              </a>
            </GlassCard>
          </div>
        </section>

        {/* Section 2: Design Tokens */}
        <section className="mb-20">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-white/[0.06] pb-4">
            <div>
              <span className="font-mono text-xs uppercase tracking-mono text-aerokin-cyan">
                02 · System Foundations
              </span>
              <h2 className="font-sans text-2xl font-bold tracking-tight text-white mt-1">
                Design Tokens
              </h2>
            </div>
            <p className="font-sans text-xs text-aerokin-muted">
              Click any token swatch to copy its exact CSS / Tailwind value.
            </p>
          </div>

          {/* Color Palette */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            {/* Background */}
            <GlassCard
              variant="interactive"
              padding="sm"
              onClick={() => copyToClipboard('#07070B', 'bg')}
              className="flex flex-col"
            >
              <div className="h-16 w-full rounded-lg bg-[#07070B] border border-white/10 mb-3 flex items-center justify-center">
                <span className="font-mono text-[10px] text-white/50">#07070B</span>
              </div>
              <span className="font-sans text-xs font-semibold text-white">bg-aerokin-bg</span>
              <span className="font-mono text-[10px] text-aerokin-muted mt-0.5">Void Canvas</span>
            </GlassCard>

            {/* Surface */}
            <GlassCard
              variant="interactive"
              padding="sm"
              onClick={() => copyToClipboard('rgba(255,255,255,0.05)', 'surface')}
              className="flex flex-col"
            >
              <div className="h-16 w-full rounded-lg bg-white/[0.05] border border-white/10 mb-3 flex items-center justify-center">
                <span className="font-mono text-[10px] text-white/70">5% White</span>
              </div>
              <span className="font-sans text-xs font-semibold text-white">surface</span>
              <span className="font-mono text-[10px] text-aerokin-muted mt-0.5">rgba(255,255,255,0.05)</span>
            </GlassCard>

            {/* Border */}
            <GlassCard
              variant="interactive"
              padding="sm"
              onClick={() => copyToClipboard('rgba(255,255,255,0.08)', 'border')}
              className="flex flex-col"
            >
              <div className="h-16 w-full rounded-lg bg-[#0E0E15] border border-white/[0.15] mb-3 flex items-center justify-center">
                <span className="font-mono text-[10px] text-white/80">8% Border</span>
              </div>
              <span className="font-sans text-xs font-semibold text-white">border</span>
              <span className="font-mono text-[10px] text-aerokin-muted mt-0.5">rgba(255,255,255,0.08)</span>
            </GlassCard>

            {/* Violet */}
            <GlassCard
              variant="interactive"
              padding="sm"
              onClick={() => copyToClipboard('#7C5CFF', 'violet')}
              className="flex flex-col"
            >
              <div className="h-16 w-full rounded-lg bg-[#7C5CFF] shadow-glow-violet/50 mb-3 flex items-center justify-center">
                <span className="font-mono text-[10px] text-white font-bold">#7C5CFF</span>
              </div>
              <span className="font-sans text-xs font-semibold text-white">accent-violet</span>
              <span className="font-mono text-[10px] text-aerokin-muted mt-0.5">Air Comet Origin</span>
            </GlassCard>

            {/* Cyan */}
            <GlassCard
              variant="interactive"
              padding="sm"
              onClick={() => copyToClipboard('#22D3EE', 'cyan')}
              className="flex flex-col"
            >
              <div className="h-16 w-full rounded-lg bg-[#22D3EE] shadow-glow-cyan/50 mb-3 flex items-center justify-center">
                <span className="font-mono text-[10px] text-black font-bold">#22D3EE</span>
              </div>
              <span className="font-sans text-xs font-semibold text-white">accent-cyan</span>
              <span className="font-mono text-[10px] text-aerokin-muted mt-0.5">Cursor Beacon</span>
            </GlassCard>

            {/* Gradient */}
            <GlassCard
              variant="interactive"
              padding="sm"
              onClick={() => copyToClipboard('linear-gradient(135deg, #7C5CFF, #22D3EE)', 'gradient')}
              className="flex flex-col"
            >
              <div className="h-16 w-full rounded-lg bg-aerokin-gradient shadow-glow-sm mb-3 flex items-center justify-center">
                <span className="font-mono text-[10px] text-white font-bold">Gradient</span>
              </div>
              <span className="font-sans text-xs font-semibold text-white">accent-gradient</span>
              <span className="font-mono text-[10px] text-aerokin-muted mt-0.5">#7C5CFF → #22D3EE</span>
            </GlassCard>
          </div>

          {copiedToken && (
            <div className="mb-6 inline-flex items-center gap-2 rounded-lg bg-aerokin-cyan/20 px-3 py-1 text-xs font-mono text-aerokin-cyan">
              <span>Copied token: {copiedToken}</span>
            </div>
          )}

          {/* Easing & Shadows Card Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Easing Curve */}
            <GlassCard variant="default" padding="lg">
              <span className="font-mono text-xs uppercase tracking-mono text-aerokin-violet">
                Motion Curves
              </span>
              <h3 className="font-sans text-lg font-bold text-white mt-1">
                cubic-bezier(0.22, 1, 0.36, 1)
              </h3>
              <p className="font-sans text-xs text-aerokin-muted mt-1 mb-6">
                Physics-inspired ease-out curve simulating zero-gravity inertia with crisp deceleration.
              </p>

              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-aerokin-muted">Fast (200ms)</span>
                  <span className="text-white">Press states, micro-feedback</span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-aerokin-muted">Standard (300ms)</span>
                  <span className="text-white">Toggles, slider thumb, tabs</span>
                </div>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-aerokin-muted">Fluid (600ms)</span>
                  <span className="text-white">Panel slides, mode transitions</span>
                </div>
              </div>
            </GlassCard>

            {/* Glow Shadows */}
            <GlassCard variant="default" padding="lg">
              <span className="font-mono text-xs uppercase tracking-mono text-aerokin-cyan">
                Atmosphere & Depth
              </span>
              <h3 className="font-sans text-lg font-bold text-white mt-1">
                Soft Glow Box Shadows
              </h3>
              <p className="font-sans text-xs text-aerokin-muted mt-1 mb-6">
                Diffused multi-layer corona shadows replicating high-intensity OLED and laser indicators.
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] shadow-glow-sm">
                  <span className="font-mono text-xs text-white">glow-sm</span>
                  <span className="text-[10px] text-aerokin-muted mt-1">Buttons / Pills</span>
                </div>
                <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] shadow-glow-md">
                  <span className="font-mono text-xs text-aerokin-cyan">glow-md</span>
                  <span className="text-[10px] text-aerokin-muted mt-1">Active Air State</span>
                </div>
                <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-white/[0.04] border border-white/[0.1] shadow-glow-lg">
                  <span className="font-mono text-xs text-[#A78BFA]">glow-lg</span>
                  <span className="text-[10px] text-aerokin-muted mt-1">Laser Emitters</span>
                </div>
              </div>
            </GlassCard>
          </div>
        </section>

        {/* Section 3: Typography Scale */}
        <section className="mb-20">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-white/[0.06] pb-4">
            <div>
              <span className="font-mono text-xs uppercase tracking-mono text-aerokin-cyan">
                03 · Typography Hierarchy
              </span>
              <h2 className="font-sans text-2xl font-bold tracking-tight text-white mt-1">
                Geist & Geist Mono
              </h2>
            </div>
            <p className="font-sans text-xs text-aerokin-muted">
              Tight letter spacing for headlines, tabular tracking for hardware metrics.
            </p>
          </div>

          <GlassCard variant="default" padding="lg">
            <div className="flex flex-col gap-8 divide-y divide-white/[0.06]">
              {/* Display / Title */}
              <div className="pt-2 first:pt-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-aerokin-violet">
                    Geist Sans · 48px / Extrabold / -0.04em tracking
                  </span>
                  <span className="font-mono text-xs text-aerokin-muted">Display 1</span>
                </div>
                <p className="font-sans text-4xl sm:text-5xl font-extrabold tracking-tightest text-white leading-tight">
                  Move your mouse with thin air.
                </p>
              </div>

              {/* Headline */}
              <div className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-aerokin-cyan">
                    Geist Sans · 28px / Bold / -0.025em tracking
                  </span>
                  <span className="font-mono text-xs text-aerokin-muted">Headline 2</span>
                </div>
                <p className="font-sans text-2xl sm:text-3xl font-bold tracking-tighter text-white">
                  Ultra-Low Latency Input Automation for Windows PC
                </p>
              </div>

              {/* Body */}
              <div className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-aerokin-muted">
                    Geist Sans · 15px / Regular / -0.015em tracking
                  </span>
                  <span className="font-mono text-xs text-aerokin-muted">Body Regular</span>
                </div>
                <p className="font-sans text-sm sm:text-base text-aerokin-muted leading-relaxed max-w-3xl">
                  AEROKIN turns your iPhone into an air mouse and media remote for Windows PC. Point at your monitor, flick your wrist to navigate presentations, and control Netflix or Spotify across the room with sub-5ms Bluetooth Low Energy latency.
                </p>
              </div>

              {/* Monospace Telemetry */}
              <div className="pt-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-xs text-amber-400">
                    Geist Mono · 12px / Medium / 0.08em tracking
                  </span>
                  <span className="font-mono text-xs text-aerokin-muted">Hardware Telemetry</span>
                </div>
                <div className="rounded-xl bg-[#0B0B12] p-4 border border-white/[0.08] font-mono text-xs grid grid-cols-2 sm:grid-cols-4 gap-4 text-aerokin-muted">
                  <div>
                    <span className="block text-[10px] text-white/40 uppercase">PITCH / ROLL</span>
                    <span className="text-white font-semibold">+14.28° / -02.41°</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-white/40 uppercase">ACCELEROMETER</span>
                    <span className="text-aerokin-cyan font-semibold">X: 0.12 Y: 0.98 Z: 9.81</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-white/40 uppercase">SAMPLING RATE</span>
                    <span className="text-aerokin-violet font-semibold">120 Hz @ 4.1 ms</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-white/40 uppercase">BLE PACKET LOSS</span>
                    <span className="text-emerald-400 font-semibold">0.00% (STABLE)</span>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </section>

        {/* Section 4: Components Library */}
        <section className="mb-20">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-white/[0.06] pb-4">
            <div>
              <span className="font-mono text-xs uppercase tracking-mono text-aerokin-cyan">
                04 · Component Suite
              </span>
              <h2 className="font-sans text-2xl font-bold tracking-tight text-white mt-1">
                Interactive Components
              </h2>
            </div>
            <p className="font-sans text-xs text-aerokin-muted">
              Live interactive components built strictly with React + Tailwind.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* GlowButton Showcase */}
            <GlassCard variant="default" padding="lg">
              <span className="font-mono text-xs uppercase tracking-mono text-aerokin-cyan">
                Button System
              </span>
              <h3 className="font-sans text-lg font-bold text-white mt-1 mb-4">
                GlowButton
              </h3>
              <p className="font-sans text-xs text-aerokin-muted mb-6">
                Tactile button with gradient border, specular shine, and press compression.
              </p>

              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <GlowButton variant="primary" size="md">
                    Connect Trackpad
                  </GlowButton>
                  <GlowButton variant="secondary" size="md">
                    Reset Defaults
                  </GlowButton>
                  <GlowButton variant="ghost" size="md">
                    Disconnect
                  </GlowButton>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <GlowButton variant="secondary" size="sm">
                    Small (32px)
                  </GlowButton>
                  <GlowButton variant="secondary" size="md">
                    Medium (40px)
                  </GlowButton>
                  <GlowButton variant="secondary" size="lg">
                    Large (48px)
                  </GlowButton>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <GlowButton variant="secondary" size="md" isLoading>
                    Pairing...
                  </GlowButton>
                  <GlowButton variant="secondary" size="md" disabled>
                    Offline
                  </GlowButton>
                </div>
              </div>
            </GlassCard>

            {/* Pill Status Labels */}
            <GlassCard variant="default" padding="lg">
              <span className="font-mono text-xs uppercase tracking-mono text-aerokin-violet">
                Status System
              </span>
              <h3 className="font-sans text-lg font-bold text-white mt-1 mb-4">
                Pill (Geist Mono Status)
              </h3>
              <p className="font-sans text-xs text-aerokin-muted mb-6">
                Real-time telemetry indicators with pulsing radar beacon.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Pill status="online" size="md">
                  CONNECTED · 12ms
                </Pill>
                <Pill status="active" size="md">
                  AIR POINTER · ACTIVE
                </Pill>
                <Pill status="idle" size="md">
                  STANDBY
                </Pill>
                <Pill status="warning" size="md">
                  LOW BATTERY · 14%
                </Pill>
                <Pill status="error" size="md">
                  CONNECTION LOST
                </Pill>
              </div>

              <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center gap-3">
                <Pill status="online" size="sm">
                  120 Hz
                </Pill>
                <Pill status="active" size="sm">
                  BLE 5.3
                </Pill>
                <Pill status="idle" size="sm" showDot={false}>
                  WINDOWS 11
                </Pill>
              </div>
            </GlassCard>

            {/* Precision Slider & Toggle */}
            <GlassCard variant="default" padding="lg">
              <span className="font-mono text-xs uppercase tracking-mono text-aerokin-cyan">
                Input Controls
              </span>
              <h3 className="font-sans text-lg font-bold text-white mt-1 mb-4">
                Slider & Precision Controls
              </h3>

              <div className="flex flex-col gap-6">
                <Slider
                  label="Trackpad Pointer Speed"
                  value={trackpadSensitivity}
                  onChange={setTrackpadSensitivity}
                  min={50}
                  max={250}
                  step={5}
                  unit="%"
                />

                <Slider
                  label="Media Volume Output"
                  value={volume}
                  onChange={setVolume}
                  min={0}
                  max={100}
                  unit="%"
                />
              </div>
            </GlassCard>

            {/* Toggle Switches & TabBar */}
            <GlassCard variant="default" padding="lg">
              <span className="font-mono text-xs uppercase tracking-mono text-aerokin-violet">
                Switches & Navigation
              </span>
              <h3 className="font-sans text-lg font-bold text-white mt-1 mb-4">
                Toggle & Segmented TabBar
              </h3>

              <div className="flex flex-col gap-6">
                <Toggle
                  label="Haptic Click Feedback"
                  description="Emulate mouse click tactile pulse on iPhone Taptic Engine"
                  checked={hapticsEnabled}
                  onChange={setHapticsEnabled}
                />

                <Toggle
                  label="Low Power Beacon Mode"
                  description="Throttle telemetry from 120Hz to 60Hz when idle"
                  checked={batterySaving}
                  onChange={setBatterySaving}
                />

                <div className="pt-2">
                  <span className="block font-sans text-xs font-medium uppercase tracking-wider text-aerokin-muted mb-2">
                    Segmented TabBar Component
                  </span>
                  <TabBar
                    tabs={[
                      { id: 'mode-1', label: 'Pointer' },
                      { id: 'mode-2', label: 'Scroll' },
                      { id: 'mode-3', label: 'Gestures' },
                    ]}
                    activeId="mode-1"
                    onChange={() => {}}
                    fullWidth
                  />
                </div>
              </div>
            </GlassCard>
          </div>
        </section>

        {/* Section 5: Dynamic Comet Trail Cursor Controls */}
        <section className="mb-20">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-white/[0.06] pb-4">
            <div>
              <span className="font-mono text-xs uppercase tracking-mono text-aerokin-cyan">
                05 · Spatial Cursor
              </span>
              <h2 className="font-sans text-2xl font-bold tracking-tight text-white mt-1">
                &lt;AerokinCursor /&gt;
              </h2>
            </div>
            <p className="font-sans text-xs text-aerokin-muted">
              Move your mouse to test the 60fps canvas comet trail. Disabled automatically on touch screens.
            </p>
          </div>

          <GlassCard variant="glow" padding="lg" glowColor="cyan">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h3 className="font-sans text-xl font-bold text-white">
                  Comet Trail Canvas Cursor
                </h3>
                <p className="font-sans text-sm text-aerokin-muted mt-1 max-w-xl">
                  Recreates the AEROKIN air pointer experience right on the web. Runs at 60fps on an overlay canvas using lerp velocity smoothing and violet-to-cyan comet tail fading.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Pill status={cursorEnabled ? 'online' : 'idle'} size="sm">
                    {cursorEnabled ? 'CANVAS 60FPS ACTIVE' : 'CURSOR DISABLED'}
                  </Pill>
                  <Pill status="active" size="sm">
                    TRAIL LENGTH: {trailLength} FRAMES
                  </Pill>
                </div>
              </div>

              <div className="flex flex-col gap-4 min-w-[240px]">
                <Toggle
                  label="Enable Comet Cursor"
                  checked={cursorEnabled}
                  onChange={setCursorEnabled}
                />
                <Slider
                  label="Trail Persistence"
                  value={trailLength}
                  onChange={setTrailLength}
                  min={8}
                  max={45}
                  step={1}
                  unit="pts"
                />
              </div>
            </div>
          </GlassCard>
        </section>

        {/* Section 6: Live iPhone Air Mouse Remote Simulator */}
        <section id="playground" className="mb-24">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-white/[0.06] pb-4">
            <div>
              <span className="font-mono text-xs uppercase tracking-mono text-aerokin-cyan">
                06 · System Integration
              </span>
              <h2 className="font-sans text-2xl font-bold tracking-tight text-white mt-1">
                Live AEROKIN Remote Simulator
              </h2>
            </div>
            <p className="font-sans text-xs text-aerokin-muted">
              Interactive preview of how the design system comes together in the iPhone PWA & Windows receiver.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Interactive iPhone Air Remote Chassis */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="relative w-full max-w-[340px] rounded-[48px] bg-[#0E0E14] p-4 border-2 border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.8),0_0_40px_rgba(124,92,255,0.15)]">
                {/* Dynamic Island / Speaker cutout */}
                <div className="mx-auto mb-3 h-5 w-24 rounded-full bg-black border border-white/[0.08] flex items-center justify-end px-2">
                  <div className="h-2 w-2 rounded-full bg-aerokin-cyan/70 animate-pulse" />
                </div>

                {/* Remote Screen Glass Area */}
                <div className="rounded-[36px] bg-[#07070B] p-4 border border-white/[0.08] flex flex-col gap-4">
                  {/* Status Bar */}
                  <div className="flex items-center justify-between">
                    <AerokinLogo size="sm" withWordmark />
                    <Pill status="online" size="sm">
                      4.2 ms
                    </Pill>
                  </div>

                  {/* Mode Navigation */}
                  <TabBar
                    tabs={navTabs}
                    activeId={activeTab}
                    onChange={setActiveTab}
                    size="sm"
                    fullWidth
                  />

                  {/* Mode Display Area */}
                  {activeTab === 'trackpad' && (
                    <div className="flex flex-col gap-3">
                      {/* Trackpad Surface */}
                      <div className="relative h-44 rounded-2xl bg-white/[0.03] border border-white/[0.08] overflow-hidden flex flex-col items-center justify-center p-4 text-center group cursor-grab active:cursor-grabbing">
                        <div className="absolute inset-0 aerokin-radial-glow opacity-50" />
                        
                        {/* Dynamic Indicator */}
                        <div className="relative flex flex-col items-center gap-2 z-10">
                          <div className="h-10 w-10 rounded-full border border-dashed border-aerokin-cyan/40 flex items-center justify-center">
                            <div className="h-2 w-2 rounded-full bg-aerokin-cyan shadow-glow-cyan" />
                          </div>
                          <span className="font-mono text-xs text-white font-medium">
                            TOUCH & DRAG
                          </span>
                          <span className="font-mono text-[10px] text-aerokin-muted">
                            TRACKPAD ACTIVE
                          </span>
                        </div>

                        {/* Top specular shine */}
                        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                      </div>

                      {/* Click Triggers */}
                      <div className="grid grid-cols-2 gap-2">
                        <GlowButton variant="primary" size="md">
                          Left Click
                        </GlowButton>
                        <GlowButton variant="secondary" size="md">
                          Right Click
                        </GlowButton>
                      </div>

                      {/* Scroll Trigger */}
                      <GlowButton variant="ghost" size="sm" fullWidth>
                        ↑ Swipe to Scroll PC ↓
                      </GlowButton>
                    </div>
                  )}

                  {activeTab === 'media-remote' && (
                    <div className="flex flex-col gap-4 py-2">
                      <div className="rounded-xl bg-white/[0.04] p-3 border border-white/[0.06] text-center">
                        <span className="block font-mono text-[10px] text-aerokin-cyan uppercase">
                          NOW PLAYING ON WINDOWS
                        </span>
                        <span className="block font-sans text-sm font-bold text-white mt-1 truncate">
                          Interstellar Main Theme
                        </span>
                        <span className="block font-mono text-xs text-aerokin-muted mt-0.5">
                          Hans Zimmer · Spotify
                        </span>
                      </div>

                      {/* Media Controls */}
                      <div className="flex items-center justify-center gap-3">
                        <GlowButton variant="secondary" size="sm">
                          ⏮ Prev
                        </GlowButton>
                        <GlowButton
                          variant="primary"
                          size="md"
                          onClick={() => setIsSimPlaying(!isSimPlaying)}
                        >
                          {isSimPlaying ? '⏸ Pause' : '▶ Play'}
                        </GlowButton>
                        <GlowButton variant="secondary" size="sm">
                          Next ⏭
                        </GlowButton>
                      </div>

                      <Slider
                        label="PC Master Volume"
                        value={volume}
                        onChange={setVolume}
                        unit="%"
                      />
                    </div>
                  )}

                  {activeTab === 'touchpad' && (
                    <div className="flex flex-col gap-3">
                      <div className="h-44 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-center p-4">
                        <div className="flex flex-col items-center">
                          <span className="font-mono text-xs text-aerokin-cyan">
                            TOUCHPAD SURFACE
                          </span>
                          <span className="font-sans text-xs text-aerokin-muted mt-1">
                            1-Finger Tap: Click<br />
                            2-Finger Slide: Scroll<br />
                            3-Finger Swipe: Switch Windows
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <GlowButton variant="secondary" size="md">
                          L-Click
                        </GlowButton>
                        <GlowButton variant="secondary" size="md">
                          R-Click
                        </GlowButton>
                      </div>
                    </div>
                  )}

                  {activeTab === 'settings' && (
                    <div className="flex flex-col gap-3 text-xs">
                      <Toggle
                        label="Taptic Haptics"
                        checked={hapticsEnabled}
                        onChange={setHapticsEnabled}
                      />
                      <Toggle
                        label="Battery Saver"
                        checked={batterySaving}
                        onChange={setBatterySaving}
                      />
                      <Slider
                        label="Cursor Speed"
                        value={trackpadSensitivity}
                        onChange={setTrackpadSensitivity}
                        min={50}
                        max={250}
                        step={5}
                      />
                    </div>
                  )}

                  {/* Remote Footer Pill */}
                  <div className="flex items-center justify-between pt-1 border-t border-white/[0.06] text-[10px] font-mono text-aerokin-muted">
                    <span>IPHONE 16 PRO</span>
                    <span>BATTERY: 94%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Technical Architecture & Code Samples */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              <GlassCard variant="default" padding="lg">
                <span className="font-mono text-xs uppercase tracking-mono text-aerokin-cyan">
                  Integration Guide
                </span>
                <h3 className="font-sans text-xl font-bold text-white mt-1">
                  How to Reuse in PWA and Landing Page
                </h3>
                <p className="font-sans text-sm text-aerokin-muted mt-2 leading-relaxed">
                  Every component is fully modular, typed, and dependency-free beyond React and Tailwind CSS. You can import directly from this package or copy the components into your PWA and landing page apps.
                </p>

                <div className="mt-4 rounded-xl bg-[#09090F] p-4 border border-white/[0.08] font-mono text-xs text-aerokin-text overflow-x-auto">
                  <div className="text-aerokin-muted">// 1. Import components & tokens</div>
                  <div className="text-white mt-1">
                    <span className="text-[#A78BFA]">import</span> {'{'} GlassCard, GlowButton, Pill, Toggle, Slider, AerokinLogo, AerokinCursor {'}'} <span className="text-[#A78BFA]">from</span> <span className="text-aerokin-cyan">'@aerokin/design-system'</span>;
                  </div>
                  <div className="text-aerokin-muted mt-4">// 2. Use in your PWA remote or landing page</div>
                  <div className="text-white mt-1">
                    &lt;<span className="text-aerokin-cyan">AerokinLogo</span> size=<span className="text-emerald-400">"md"</span> withWordmark /&gt;
                  </div>
                  <div className="text-white">
                    &lt;<span className="text-aerokin-cyan">GlassCard</span> variant=<span className="text-emerald-400">"glow"</span> glowColor=<span className="text-emerald-400">"cyan"</span>&gt;
                  </div>
                  <div className="text-white pl-4">
                    &lt;<span className="text-aerokin-cyan">Pill</span> status=<span className="text-emerald-400">"online"</span>&gt;CONNECTED · 12ms&lt;/<span className="text-aerokin-cyan">Pill</span>&gt;
                  </div>
                  <div className="text-white pl-4">
                    &lt;<span className="text-aerokin-cyan">GlowButton</span> variant=<span className="text-emerald-400">"primary"</span>&gt;Move Air&lt;/<span className="text-aerokin-cyan">GlowButton</span>&gt;
                  </div>
                  <div className="text-white">
                    &lt;/<span className="text-aerokin-cyan">GlassCard</span>&gt;
                  </div>
                </div>
              </GlassCard>

              {/* Design Principles Checklist */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <GlassCard variant="subtle" padding="md">
                  <span className="font-mono text-xs font-semibold text-aerokin-cyan">
                    NO EXTRA DEPENDENCIES
                  </span>
                  <p className="font-sans text-xs text-aerokin-muted mt-1">
                    Zero heavy runtime libraries. No framer-motion, no external icon packs. Pure performant React + CSS.
                  </p>
                </GlassCard>

                <GlassCard variant="subtle" padding="md">
                  <span className="font-mono text-xs font-semibold text-aerokin-violet">
                    TOUCH SCREEN AWARE
                  </span>
                  <p className="font-sans text-xs text-aerokin-muted mt-1">
                    Canvas cursor is automatically deactivated on mobile/touch screens so mobile battery and CPU remain 100% untouched.
                  </p>
                </GlassCard>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-aerokin-border bg-[#07070B] py-8 text-center">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AerokinLogo size="sm" withWordmark />
          </div>
          <span className="font-mono text-xs text-aerokin-muted">
            AEROKIN DESIGN SYSTEM · "Move the air. Move your PC."
          </span>
          <div className="flex items-center gap-3">
            <Pill status="online" size="sm">
              READY FOR PWA & LANDING
            </Pill>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default DesignShowcase;
