import React from 'react';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  id?: string;
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = 'md',
  className = '',
  id,
}) => {
  const generatedId = React.useId();
  const toggleId = id || generatedId;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  const isSmall = size === 'sm';
  const trackWidth = isSmall ? 'w-10 h-5' : 'w-12 h-6';
  const knobSize = isSmall ? 'h-3.5 w-3.5' : 'h-4.5 w-4.5';
  const knobTranslate = isSmall
    ? checked
      ? 'translate-x-5'
      : 'translate-x-1'
    : checked
    ? 'translate-x-6'
    : 'translate-x-1';

  return (
    <label
      htmlFor={toggleId}
      className={`inline-flex items-center justify-between gap-4 select-none ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
    >
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span className="font-sans text-sm font-medium text-aerokin-text">
              {label}
            </span>
          )}
          {description && (
            <span className="font-sans text-xs text-aerokin-muted mt-0.5">
              {description}
            </span>
          )}
        </div>
      )}

      <div
        id={toggleId}
        role="switch"
        aria-checked={checked}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleKeyDown}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex flex-shrink-0 items-center rounded-full border transition-all duration-300 ease-aerokin focus:outline-none focus-visible:ring-2 focus-visible:ring-aerokin-cyan/60 ${trackWidth} ${
          checked
            ? 'bg-aerokin-gradient border-transparent shadow-glow-sm'
            : 'bg-aerokin-surface border-aerokin-border hover:border-white/20'
        }`}
      >
        {/* Subtle inner track shadow */}
        <span className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]" />

        {/* Knob */}
        <span
          className={`pointer-events-none inline-block rounded-full bg-white shadow-md transform transition-transform duration-300 ease-aerokin ${knobSize} ${knobTranslate}`}
        >
          {/* Subtle knob specular glow */}
          <span className="block h-full w-full rounded-full bg-gradient-to-b from-white to-gray-200" />
        </span>
      </div>
    </label>
  );
};

export default Toggle;
