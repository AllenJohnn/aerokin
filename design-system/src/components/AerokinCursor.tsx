import React, { useEffect, useRef, useState } from 'react';

export interface AerokinCursorProps {
  /** Maximum length of the comet trail in frames */
  trailLength?: number;
  /** Radius of the leading cursor dot in pixels */
  dotRadius?: number;
  /** Whether the cursor is enabled */
  enabled?: boolean;
}

interface Point {
  x: number;
  y: number;
}

export const AerokinCursor: React.FC<AerokinCursorProps> = ({
  trailLength = 26,
  dotRadius = 3.5,
  enabled = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    // Check if the current device is a touch screen without hover support
    const checkTouch = () => {
      const isCoarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsTouchDevice(isCoarse || hasTouch);
    };

    checkTouch();
    window.addEventListener('resize', checkTouch);
    return () => window.removeEventListener('resize', checkTouch);
  }, []);

  useEffect(() => {
    if (isTouchDevice || !enabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth * window.devicePixelRatio);
    let height = (canvas.height = window.innerHeight * window.devicePixelRatio);
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth * window.devicePixelRatio;
      height = canvas.height = window.innerHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    window.addEventListener('resize', handleResize);

    // Coordinate tracking
    let targetX = -100;
    let targetY = -100;
    let currentX = -100;
    let currentY = -100;
    let isVisible = false;
    let opacity = 0;

    const trail: Point[] = [];

    const handleMouseMove = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!isVisible) {
        isVisible = true;
        currentX = targetX;
        currentY = targetY;
      }
    };

    const handleMouseLeave = () => {
      isVisible = false;
    };

    const handleMouseEnter = () => {
      isVisible = true;
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);

    // 60FPS Render Loop with Lerp Smoothing
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Fade opacity in or out
      if (isVisible) {
        opacity = Math.min(1, opacity + 0.1);
      } else {
        opacity = Math.max(0, opacity - 0.08);
      }

      if (opacity > 0.01) {
        // Smoothly interpolate current position toward mouse target (lerp)
        const lerpFactor = 0.32;
        currentX += (targetX - currentX) * lerpFactor;
        currentY += (targetY - currentY) * lerpFactor;

        // Push latest point to trail history
        trail.push({ x: currentX, y: currentY });
        if (trail.length > trailLength) {
          trail.shift();
        }

        // 1. Draw Comet Trail
        if (trail.length > 2) {
          for (let i = 0; i < trail.length - 1; i++) {
            const p1 = trail[i];
            const p2 = trail[i + 1];
            const progress = i / (trail.length - 1); // 0 at tail, 1 at head

            // Interpolate color from Violet (#7C5CFF) to Cyan (#22D3EE)
            const r = Math.round(124 + (34 - 124) * progress);
            const g = Math.round(92 + (211 - 92) * progress);
            const b = Math.round(255 + (238 - 255) * progress);
            const a = progress * 0.75 * opacity;

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
            ctx.lineWidth = 1 + progress * 3.5;
            ctx.lineCap = 'round';
            ctx.stroke();
          }
        }

        // 2. Outer Comet Glow / Corona
        const outerGlow = ctx.createRadialGradient(
          currentX,
          currentY,
          1,
          currentX,
          currentY,
          20
        );
        outerGlow.addColorStop(0, `rgba(34, 211, 238, ${0.45 * opacity})`);
        outerGlow.addColorStop(0.5, `rgba(124, 92, 255, ${0.2 * opacity})`);
        outerGlow.addColorStop(1, 'rgba(124, 92, 255, 0)');

        ctx.beginPath();
        ctx.arc(currentX, currentY, 20, 0, Math.PI * 2);
        ctx.fillStyle = outerGlow;
        ctx.fill();

        // 3. Leading Cursor Dot Beacon
        ctx.beginPath();
        ctx.arc(currentX, currentY, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.shadowColor = '#22D3EE';
        ctx.shadowBlur = 10;
        ctx.fill();

        // Reset shadow
        ctx.shadowBlur = 0;

        // Subtle inner cyan core
        ctx.beginPath();
        ctx.arc(currentX, currentY, dotRadius * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34, 211, 238, ${opacity})`;
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
    };
  }, [isTouchDevice, enabled, trailLength, dotRadius]);

  // Completely disabled on touch devices to avoid any overhead
  if (isTouchDevice || !enabled) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
      style={{ touchAction: 'none' }}
      aria-hidden="true"
    />
  );
};

export default AerokinCursor;
