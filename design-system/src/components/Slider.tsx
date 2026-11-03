import React from 'react';

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  unit?: string;
  formatValue?: (val: number) => string;
  disabled?: boolean;
  className?: string;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  unit = '',
  formatValue,
  disabled = false,
  className = '',
}) => {
  const percentage = Math.min(
    100,
    Math.max(0, ((value - min) / (max - min)) * 100)
  );

  const displayValue = formatValue
    ? formatValue(value)
    : `${value}${unit ? ` ${unit}` : ''}`;

  return (
    <div className={`flex flex-col gap-2.5 select-none ${className}`}>
      {(label || displayValue) && (
        <div className="flex items-center justify-between">
          {label && (
            <span className="font-sans text-xs font-medium uppercase tracking-wider text-aerokin-muted">
              {label}
            </span>
          )}
          <span className="font-mono text-xs font-semibold tracking-mono text-aerokin-cyan bg-aerokin-cyan/10 px-2 py-0.5 rounded border border-aerokin-cyan/20">
            {displayValue}
          </span>
        </div>
      )}

      <div className="relative flex items-center h-6 group">
        {/* Track container */}
        <div className="relative h-1.5 w-full rounded-full bg-white/[0.08] border border-white/[0.05] overflow-hidden">
          {/* Active filled gradient track */}
          <div
            className="h-full bg-gradient-to-r from-aerokin-violet to-aerokin-cyan transition-all duration-150 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Glowing Thumb Handle */}
        <div
          className="pointer-events-none absolute -translate-x-1/2 flex items-center justify-center transition-transform duration-200 ease-aerokin group-hover:scale-110"
          style={{ left: `${percentage}%` }}
        >
          {/* Outer glow halo */}
          <div className="absolute h-6 w-6 rounded-full bg-aerokin-cyan/30 blur-sm group-hover:bg-aerokin-cyan/50" />
          {/* Solid Thumb */}
          <div className="relative h-4 w-4 rounded-full bg-white border border-aerokin-cyan shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
        </div>

        {/* Transparent Native Range Input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          aria-label={label || 'Slider'}
        />
      </div>
    </div>
  );
};

export default Slider;
