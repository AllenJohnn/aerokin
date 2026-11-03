import React, { useEffect, useRef } from 'react';
import { animate, createTimeline } from 'animejs';

export interface AerokinLogoProps {
  /** Size variant or numerical pixel size */
  size?: 'sm' | 'md' | 'lg' | number;
  /** Whether to show the AEROKIN wordmark alongside the logo */
  withWordmark?: boolean;
  /** Whether to show the tagline */
  withTagline?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Whether to animate the light trail glow or pulse */
  animated?: boolean;
  /** Whether to trigger an anime.js v4 line-draw intro sequence */
  intro?: boolean;
  /** Monochrome white mode */
  mono?: boolean;
  /** Theme preset: 'decepticon' (default, optic red beacon) or 'aero' (cyan beacon) */
  theme?: 'decepticon' | 'aero';
}

const sizeMap = {
  sm: 24,
  md: 48,
  lg: 96,
};

export const AerokinLogo: React.FC<AerokinLogoProps> = ({
  size = 'md',
  withWordmark = false,
  withTagline = false,
  className = '',
  animated = false,
  intro = false,
  mono = false,
  theme = 'decepticon',
}) => {
  const pixelSize = typeof size === 'number' ? size : sizeMap[size];
  const uniqueId = React.useId().replace(/:/g, '');

  const svgRef = useRef<SVGSVGElement | null>(null);
  const leftWingRef = useRef<SVGPolygonElement | null>(null);
  const rightWingRef = useRef<SVGPolygonElement | null>(null);
  const trailDashRef = useRef<SVGPolygonElement | null>(null);
  const crossbarDartRef = useRef<SVGPolygonElement | null>(null);
  const beaconRef = useRef<SVGCircleElement | null>(null);

  const isDecepticon = theme === 'decepticon';
  const gradMark = `ak-grad-${uniqueId}`;
  const gradTip = `ak-tip-grad-${uniqueId}`;
  const filterGlow = `ak-glow-${uniqueId}`;

  // anime.js v4 Line-draw / Morph / Spring intro
  useEffect(() => {
    if (!intro || !svgRef.current) return;

    const tl = createTimeline({
      defaults: {
        ease: 'outCubic',
      },
    });

    // Animate the wings scaling in with momentum
    if (leftWingRef.current && rightWingRef.current) {
      tl.add(
        [leftWingRef.current, rightWingRef.current],
        {
          opacity: [0, 1],
          translateY: [15, 0],
          scale: [0.85, 1],
          duration: 700,
        },
        0
      );
    }

    // Animate the crossbar cutting through like a supersonic dart
    if (trailDashRef.current && crossbarDartRef.current) {
      tl.add(
        trailDashRef.current,
        {
          opacity: [0, mono ? 0.5 : 0.65],
          translateX: [-20, 0],
          duration: 500,
        },
        250
      );

      tl.add(
        crossbarDartRef.current,
        {
          opacity: [0, 1],
          translateX: [-35, 0],
          duration: 650,
          ease: 'outExpo',
        },
        300
      );
    }

    // Beacon pulse arrival
    if (beaconRef.current) {
      tl.add(
        beaconRef.current,
        {
          opacity: [0, 1],
          scale: [0, 1.4, 1],
          duration: 600,
          ease: 'outBack',
        },
        550
      );
    }
  }, [intro, mono]);

  // Subtle continuous ambient pulse when animated=true
  useEffect(() => {
    if (!animated || !beaconRef.current) return;

    const anim = animate(beaconRef.current, {
      scale: [1, 1.35, 1],
      opacity: [0.8, 1, 0.8],
      duration: 2200,
      loop: true,
      ease: 'inOutSine',
    });

    return () => {
      anim.revert();
    };
  }, [animated]);

  const fillStyle = mono ? '#F5F5F7' : `url(#${gradMark})`;
  const tipFill = mono ? '#F5F5F7' : `url(#${gradTip})`;

  return (
    <div className={`inline-flex items-center gap-3.5 select-none ${className}`}>
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        width={pixelSize}
        height={pixelSize}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0 transition-transform duration-300 ease-aerokin hover:scale-105"
        aria-label="AEROKIN Logo"
      >
        <defs>
          <linearGradient id={gradMark} x1="10%" y1="10%" x2="90%" y2="90%">
            <stop offset="0%" stopColor={isDecepticon ? "#A855F7" : "#7C5CFF"} />
            <stop offset="100%" stopColor={isDecepticon ? "#7C3AED" : "#22D3EE"} />
          </linearGradient>

          <linearGradient id={gradTip} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={isDecepticon ? "#FF3B30" : "#22D3EE"} />
            <stop offset="100%" stopColor={isDecepticon ? "#EF4444" : "#38BDF8"} />
          </linearGradient>

          <filter id={filterGlow} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={isDecepticon ? "2" : "3"} result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Left Delta Wing */}
        <polygon
          ref={leftWingRef}
          points="50,12 16,86 32,86 45,56 50,44"
          fill={fillStyle}
        />

        {/* Right Delta Wing */}
        <polygon
          ref={rightWingRef}
          points="50,12 55,44 60,56 84,86 68,86"
          fill={fillStyle}
        />

        {/* Left Kinetic Slipstream Pulse */}
        <polygon
          ref={trailDashRef}
          points="8,54 22,54 26,44 12,44"
          fill={fillStyle}
          opacity={mono ? 0.5 : 0.65}
        />

        {/* Supersonic Crossbar Dart Piercing Right into Cursor Point */}
        <polygon
          ref={crossbarDartRef}
          points="28,54 78,54 92,44 75,44 78,48 34,48"
          fill={fillStyle}
        />

        {/* Glowing Cursor Beacon Dot at Tip */}
        <circle
          ref={beaconRef}
          cx="92"
          cy="44"
          r="3.5"
          fill={tipFill}
          filter={`url(#${filterGlow})`}
        />
      </svg>

      {withWordmark && (
        <div className="flex flex-col">
          <span className="font-sans font-extrabold tracking-[0.14em] text-white text-lg sm:text-xl leading-none">
            AEROKIN
          </span>
          {withTagline && (
            <span className="font-mono text-[9.5px] tracking-mono text-aerokin-muted mt-1 uppercase">
              Move the air. Move your PC.
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default AerokinLogo;
