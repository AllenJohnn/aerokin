import React from 'react';

export interface GlowButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

const sizeClasses = {
  sm: 'h-8 px-3.5 text-xs gap-1.5 font-medium rounded-lg',
  md: 'h-10 px-5 text-sm gap-2 font-medium rounded-xl',
  lg: 'h-12 px-6 text-base gap-2.5 font-semibold rounded-2xl',
};

export const GlowButton = React.forwardRef<HTMLButtonElement, GlowButtonProps>(
  (
    {
      children,
      variant = 'secondary',
      size = 'md',
      isLoading = false,
      iconLeft,
      iconRight,
      fullWidth = false,
      disabled = false,
      className = '',
      ...rest
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    // Primary: full gradient background with outer glow
    if (variant === 'primary') {
      return (
        <button
          ref={ref}
          disabled={isDisabled}
          className={`group relative inline-flex items-center justify-center select-none overflow-hidden text-white font-sans transition-all duration-300 ease-aerokin ${
            sizeClasses[size]
          } ${
            isDisabled
              ? 'opacity-40 cursor-not-allowed'
              : 'hover:shadow-glow-md active:scale-[0.97] cursor-pointer'
          } ${fullWidth ? 'w-full' : ''} ${className}`}
          {...rest}
        >
          {/* Base gradient background */}
          <span className="absolute inset-0 bg-aerokin-gradient transition-opacity duration-300" />
          {/* Subtle hover brightness layer */}
          <span className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors duration-300" />
          {/* Specular top highlight */}
          <span className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          {/* Content */}
          <span className="relative z-10 flex items-center justify-center gap-2">
            {isLoading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            ) : (
              iconLeft
            )}
            <span>{children}</span>
            {!isLoading && iconRight}
          </span>
        </button>
      );
    }

    // Ghost: transparent with hover glow and gradient hover border
    if (variant === 'ghost') {
      return (
        <button
          ref={ref}
          disabled={isDisabled}
          className={`group relative inline-flex items-center justify-center select-none text-aerokin-muted hover:text-white font-sans transition-all duration-300 ease-aerokin hover:bg-white/[0.05] border border-transparent hover:border-white/10 ${
            sizeClasses[size]
          } ${
            isDisabled
              ? 'opacity-40 cursor-not-allowed'
              : 'active:scale-[0.97] cursor-pointer'
          } ${fullWidth ? 'w-full' : ''} ${className}`}
          {...rest}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            {isLoading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            ) : (
              iconLeft
            )}
            <span>{children}</span>
            {!isLoading && iconRight}
          </span>
        </button>
      );
    }

    // Secondary (Default): dark glass body with 1px gradient border and soft ambient glow
    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`group relative inline-flex items-center justify-center select-none p-[1px] font-sans transition-all duration-300 ease-aerokin ${
          isDisabled
            ? 'opacity-40 cursor-not-allowed'
            : 'hover:shadow-glow-sm active:scale-[0.97] cursor-pointer'
        } ${fullWidth ? 'w-full' : ''} ${className}`}
        {...rest}
      >
        {/* Gradient border ring */}
        <span
          className="absolute inset-0 rounded-[inherit] bg-gradient-to-r from-aerokin-violet/70 to-aerokin-cyan/70 opacity-70 group-hover:opacity-100 group-hover:from-aerokin-violet group-hover:to-aerokin-cyan transition-all duration-300 ease-aerokin"
          aria-hidden="true"
        />

        {/* Inner surface */}
        <span
          className={`relative z-10 flex h-full w-full items-center justify-center bg-[#0C0C12] group-hover:bg-[#12121B] rounded-[inherit] text-aerokin-text group-hover:text-white transition-colors duration-300 ease-aerokin ${sizeClasses[size]}`}
        >
          {/* Specular top highlight inside button */}
          <span className="pointer-events-none absolute inset-x-0 top-0 h-[1px] rounded-t-[inherit] bg-gradient-to-r from-transparent via-white/15 to-transparent" />

          <span className="relative flex items-center justify-center gap-2">
            {isLoading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-aerokin-cyan" />
            ) : (
              iconLeft
            )}
            <span>{children}</span>
            {!isLoading && iconRight}
          </span>
        </span>
      </button>
    );
  }
);

GlowButton.displayName = 'GlowButton';

export default GlowButton;
