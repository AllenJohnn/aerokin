import React from 'react';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  /** Visual variant */
  variant?: 'default' | 'subtle' | 'glow' | 'interactive' | 'bordered';
  /** Card padding */
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  /** Accent glow color when variant is 'glow' */
  glowColor?: 'violet' | 'cyan' | 'both';
  /** Whether to show a subtle specular edge highlight on the top border */
  specular?: boolean;
}

const paddingMap = {
  none: 'p-0',
  sm: 'p-3 sm:p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
  xl: 'p-8 sm:p-10',
};

const variantClasses = {
  default:
    'bg-aerokin-surface border-aerokin-border shadow-glass backdrop-blur-xl',
  subtle:
    'bg-white/[0.02] border-white/[0.04] backdrop-blur-md',
  bordered:
    'bg-aerokin-surface border-aerokin-border-bright shadow-glass backdrop-blur-xl',
  glow:
    'bg-aerokin-surface border-white/[0.12] backdrop-blur-xl',
  interactive:
    'bg-aerokin-surface border-aerokin-border hover:border-white/20 hover:bg-white/[0.07] hover:shadow-glow-sm shadow-glass backdrop-blur-xl transition-all duration-300 ease-aerokin hover:-translate-y-0.5 cursor-pointer',
};

const glowShadows = {
  violet: 'shadow-glow-violet/40',
  cyan: 'shadow-glow-cyan/40',
  both: 'shadow-glow-md',
};

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      children,
      variant = 'default',
      padding = 'md',
      glowColor = 'both',
      specular = true,
      className = '',
      ...rest
    },
    ref
  ) => {
    const isGlow = variant === 'glow';

    return (
      <div
        ref={ref}
        className={`relative overflow-hidden rounded-2xl border text-aerokin-text transition-all duration-300 ease-aerokin ${
          variantClasses[variant]
        } ${isGlow ? glowShadows[glowColor] : ''} ${paddingMap[padding]} ${className}`}
        {...rest}
      >
        {/* Specular 1px top highlight simulating glass edge reflection */}
        {specular && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"
            aria-hidden="true"
          />
        )}

        {children}
      </div>
    );
  }
);

GlassCard.displayName = 'GlassCard';

export default GlassCard;
