import React from 'react';

export interface AerokinLogoProps {
  /** Size variant or numerical pixel size */
  size?: 'sm' | 'md' | 'lg' | number;
  /** Whether to show the AEROKIN wordmark alongside the logo */
  withWordmark?: boolean;
  /** Whether to show the tagline */
  withTagline?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Whether to animate the light trail glow */
  animated?: boolean;
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
}) => {
  const pixelSize = typeof size === 'number' ? size : sizeMap[size];
  const uniqueId = React.useId().replace(/:/g, '');

  const gradA = `a-grad-${uniqueId}`;
  const gradTrail = `trail-grad-${uniqueId}`;
  const radialDot = `dot-radial-${uniqueId}`;
  const filterGlow = `filter-glow-${uniqueId}`;

  return (
    <div className={`inline-flex items-center gap-3.5 select-none ${className}`}>
      <svg
        viewBox="0 0 100 100"
        width={pixelSize}
        height={pixelSize}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0 transition-transform duration-300 ease-aerokin hover:scale-105"
        aria-label="AEROKIN Logo"
      >
        <defs>
          <filter id={filterGlow} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5" result="blur1" />
            <feMerge>
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <linearGradient id={gradA} x1="18" y1="84" x2="82" y2="16" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7C5CFF" />
            <stop offset="100%" stopColor="#22D3EE" />
          </linearGradient>

          <linearGradient id={gradTrail} x1="26" y1="60" x2="82" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7C5CFF" stopOpacity="0.1" />
            <stop offset="35%" stopColor="#7C5CFF" stopOpacity="0.8" />
            <stop offset="85%" stopColor="#22D3EE" stopOpacity="1" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
          </linearGradient>

          <radialGradient id={radialDot} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="40%" stopColor="#22D3EE" />
            <stop offset="85%" stopColor="#7C5CFF" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#7C5CFF" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Angular "A" Legs */}
        <path
          d="M 22 84 L 47 18 C 48.2 15 51.8 15 53 18 L 78 84"
          stroke={`url(#${gradA})`}
          strokeWidth="7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Crossbar Light Trail */}
        <path
          d="M 26 60 Q 52 56 81 52"
          stroke={`url(#${gradTrail})`}
          strokeWidth="4.5"
          strokeLinecap="round"
          filter={`url(#${filterGlow})`}
          className={animated ? 'animate-pulse-glow' : ''}
          opacity="0.85"
        />
        <path
          d="M 26 60 Q 52 56 81 52"
          stroke={`url(#${gradTrail})`}
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Glowing Cursor Dot at the crossbar tip */}
        <circle
          cx="81"
          cy="52"
          r="10"
          fill={`url(#${radialDot})`}
          className={animated ? 'animate-pulse-glow' : ''}
          opacity="0.9"
        />
        <circle cx="81" cy="52" r="3.6" fill="#FFFFFF" />
        <circle cx="81" cy="52" r="2" fill="#22D3EE" />
      </svg>

      {withWordmark && (
        <div className="flex flex-col">
          <span className="font-sans font-bold tracking-tight text-white text-lg sm:text-xl leading-none">
            AEROKIN
          </span>
          {withTagline && (
            <span className="font-mono text-[10px] tracking-mono text-aerokin-muted mt-1 uppercase">
              Move the air. Move your PC.
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default AerokinLogo;
