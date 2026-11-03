import React from 'react';

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  children?: React.ReactNode;
  /** Status indicator flavor */
  status?: 'online' | 'active' | 'idle' | 'warning' | 'error';
  /** Whether the dot has a pulsing radar animation */
  pulsing?: boolean;
  /** Whether to show the dot */
  showDot?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
}

const statusConfig = {
  online: {
    dotColor: 'bg-aerokin-cyan',
    dotGlow: 'shadow-[0_0_8px_rgba(34,211,238,0.8)]',
    pulseRing: 'bg-aerokin-cyan/40',
    borderColor: 'border-aerokin-cyan/25',
    textColor: 'text-aerokin-cyan',
    badgeBg: 'bg-aerokin-cyan/10',
  },
  active: {
    dotColor: 'bg-aerokin-violet',
    dotGlow: 'shadow-[0_0_8px_rgba(124,92,255,0.8)]',
    pulseRing: 'bg-aerokin-violet/40',
    borderColor: 'border-aerokin-violet/25',
    textColor: 'text-[#A78BFA]',
    badgeBg: 'bg-aerokin-violet/10',
  },
  idle: {
    dotColor: 'bg-aerokin-muted',
    dotGlow: 'shadow-[0_0_6px_rgba(138,138,150,0.5)]',
    pulseRing: 'bg-aerokin-muted/30',
    borderColor: 'border-white/10',
    textColor: 'text-aerokin-muted',
    badgeBg: 'bg-white/[0.04]',
  },
  warning: {
    dotColor: 'bg-amber-400',
    dotGlow: 'shadow-[0_0_8px_rgba(251,191,36,0.8)]',
    pulseRing: 'bg-amber-400/40',
    borderColor: 'border-amber-400/25',
    textColor: 'text-amber-300',
    badgeBg: 'bg-amber-400/10',
  },
  error: {
    dotColor: 'bg-rose-500',
    dotGlow: 'shadow-[0_0_8px_rgba(244,63,94,0.8)]',
    pulseRing: 'bg-rose-500/40',
    borderColor: 'border-rose-500/25',
    textColor: 'text-rose-400',
    badgeBg: 'bg-rose-500/10',
  },
};

const sizeClasses = {
  sm: 'h-6 px-2.5 text-[11px] gap-1.5',
  md: 'h-7 px-3 text-xs gap-2',
};

export const Pill: React.FC<PillProps> = ({
  children,
  status = 'online',
  pulsing = true,
  showDot = true,
  size = 'md',
  className = '',
  ...rest
}) => {
  const cfg = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center rounded-full border font-mono tracking-mono uppercase select-none transition-all duration-300 ease-aerokin backdrop-blur-md ${
        cfg.borderColor
      } ${cfg.badgeBg} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {showDot && (
        <span className="relative flex h-2 w-2 items-center justify-center">
          {pulsing && (
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${cfg.pulseRing}`}
            />
          )}
          <span
            className={`relative inline-flex h-1.5 w-1.5 rounded-full ${cfg.dotColor} ${cfg.dotGlow}`}
          />
        </span>
      )}
      <span className={`font-semibold ${cfg.textColor}`}>{children}</span>
    </span>
  );
};

export default Pill;
