import React from 'react';

export interface AerokinLogoProps {
  /** Size variant or numerical pixel size */
  size?: 'sm' | 'md' | 'lg' | number;
  /** Whether to show the "Aerokin" wordmark alongside the logo */
  withWordmark?: boolean;
  /** Whether to show the tagline */
  withTagline?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Monochrome mode */
  mono?: boolean;
  /** Optional theme override */
  theme?: 'dark' | 'light' | string;
  /** Backward compatible props */
  animated?: boolean;
  intro?: boolean;
}

const sizeMap = {
  sm: 24,
  md: 32,
  lg: 48,
};

export const AerokinLogo: React.FC<AerokinLogoProps> = ({
  size = 'md',
  withWordmark = false,
  withTagline = false,
  className = '',
  mono = false,
}) => {
  const pixelSize = typeof size === 'number' ? size : sizeMap[size];

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <svg
        viewBox="0 0 100 100"
        width={pixelSize}
        height={pixelSize}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
        aria-label="Aerokin logo"
      >
        {/* Left Wing */}
        <polygon
          points="50,14 18,84 34,84 46,56 50,45"
          className={mono ? 'fill-current' : 'fill-accent'}
        />

        {/* Right Wing */}
        <polygon
          points="50,14 54,45 59,56 82,84 66,84"
          className={mono ? 'fill-current' : 'fill-accent'}
        />

        {/* Dynamic Horizontal Dart */}
        <polygon
          points="26,53 76,53 90,44 74,44 77,48 32,48"
          className={mono ? 'fill-current' : 'fill-accent'}
        />

        {/* Tip Dot */}
        <circle
          cx="90"
          cy="44"
          r="3"
          className={mono ? 'fill-current' : 'fill-accent'}
        />
      </svg>

      {withWordmark && (
        <div className="flex flex-col">
          <span className="font-sans font-semibold tracking-tight text-foreground text-base leading-none">
            Aerokin
          </span>
          {withTagline && (
            <span className="font-sans text-xs text-muted-foreground mt-0.5 leading-none">
              Control your PC from your iPhone.
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default AerokinLogo;
