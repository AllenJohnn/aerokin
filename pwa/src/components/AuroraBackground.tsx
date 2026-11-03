import React, { useEffect, useRef } from 'react';

export interface AuroraBackgroundProps {
  isEngaged?: boolean;
}

export const AuroraBackground: React.FC<AuroraBackgroundProps> = ({ isEngaged = false }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gyroRef = useRef({ x: 0, y: 0 });
  const isEngagedRef = useRef(isEngaged);
  isEngagedRef.current = isEngaged;

  useEffect(() => {
    // Check reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = 0;
    let height = 0;

    const resize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    // Subtle gyro parallax listener
    const handleDeviceOrientation = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma || 0; // Left-to-right tilt [-90, 90]
      const beta = e.beta || 0; // Front-to-back tilt [-180, 180]
      gyroRef.current.x = (gamma / 45) * 40;
      gyroRef.current.y = (beta / 45) * 40;
    };

    window.addEventListener('deviceorientation', handleDeviceOrientation);

    // Orbs parameters
    let time = 0;
    let lastDrawTime = 0;

    const drawFrame = (timestamp: number) => {
      const targetInterval = isEngagedRef.current ? 33 : 16; // 30fps cap while engaged, 60fps idle
      const elapsed = timestamp - lastDrawTime;

      if (elapsed >= targetInterval) {
        lastDrawTime = timestamp;
        time += 0.008;

        const gx = gyroRef.current.x;
        const gy = gyroRef.current.y;

        // Clear dark background
        ctx.fillStyle = '#07070B';
        ctx.fillRect(0, 0, width, height);

        // Orb 1: Violet/Indigo (#7C5CFF)
        const x1 = width * 0.3 + Math.sin(time * 0.7) * (width * 0.15) + gx * 0.4;
        const y1 = height * 0.25 + Math.cos(time * 0.5) * (height * 0.12) + gy * 0.4;
        const r1 = Math.max(width, height) * 0.45;
        const grad1 = ctx.createRadialGradient(x1, y1, 0, x1, y1, r1);
        grad1.addColorStop(0, 'rgba(124, 92, 255, 0.22)');
        grad1.addColorStop(0.5, 'rgba(124, 92, 255, 0.07)');
        grad1.addColorStop(1, 'rgba(7, 7, 11, 0)');
        ctx.fillStyle = grad1;
        ctx.fillRect(0, 0, width, height);

        // Orb 2: Electric Cyan (#22D3EE)
        const x2 = width * 0.7 + Math.cos(time * 0.8) * (width * 0.18) - gx * 0.3;
        const y2 = height * 0.65 + Math.sin(time * 0.6) * (height * 0.15) - gy * 0.3;
        const r2 = Math.max(width, height) * 0.4;
        const grad2 = ctx.createRadialGradient(x2, y2, 0, x2, y2, r2);
        grad2.addColorStop(0, 'rgba(34, 211, 238, 0.18)');
        grad2.addColorStop(0.5, 'rgba(34, 211, 238, 0.05)');
        grad2.addColorStop(1, 'rgba(7, 7, 11, 0)');
        ctx.fillStyle = grad2;
        ctx.fillRect(0, 0, width, height);

        // Orb 3: Deep Sky Blue / Ambient Center
        const x3 = width * 0.5 + Math.sin(time * 0.4) * (width * 0.1);
        const y3 = height * 0.85 + Math.cos(time * 0.4) * (height * 0.1);
        const r3 = Math.max(width, height) * 0.5;
        const grad3 = ctx.createRadialGradient(x3, y3, 0, x3, y3, r3);
        grad3.addColorStop(0, 'rgba(99, 102, 241, 0.12)');
        grad3.addColorStop(1, 'rgba(7, 7, 11, 0)');
        ctx.fillStyle = grad3;
        ctx.fillRect(0, 0, width, height);
      }

      if (!prefersReducedMotion) {
        animId = requestAnimationFrame(drawFrame);
      }
    };

    // Delay start until after first paint
    const timer = setTimeout(() => {
      animId = requestAnimationFrame(drawFrame);
    }, 40);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
    };
  }, []);

  return (
    <>
      {/* Aurora WebGL/Canvas layer */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none -z-20 w-full h-full"
      />

      {/* Subtle organic film grain texture overlay */}
      <div
        className="fixed inset-0 pointer-events-none -z-10 opacity-[0.035] mix-blend-screen"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
    </>
  );
};
