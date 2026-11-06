import React, { forwardRef } from 'react';

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, error, hint, className = '', id, disabled, ...props }, ref) => {
    const generatedId = React.useId();
    const textareaId = id || generatedId;

    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label htmlFor={textareaId} className="text-xs font-medium text-[#8A8A8A]">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          disabled={disabled}
          className={`w-full bg-[#0A0A0A] text-[#F5F5F5] placeholder-[#8A8A8A] border ${
            error ? 'border-[#FF453A]' : 'border-[#1F1F1F]'
          } rounded-xl px-3.5 py-2.5 text-base font-normal transition-colors duration-150 focus:outline-none focus:border-[#FF5A1F] focus:ring-1 focus:ring-[#FF5A1F] disabled:opacity-50 disabled:cursor-not-allowed selection:bg-[#FF5A1F]/30 resize-none [color-scheme:dark] ${className}`}
          style={{
            WebkitTextFillColor: disabled ? '#8A8A8A' : '#F5F5F5',
            caretColor: '#FF5A1F',
            WebkitAppearance: 'none',
            appearance: 'none',
            fontSize: '16px',
            ...props.style,
          }}
          {...props}
        />
        {error && <span className="text-xs text-[#FF453A] font-medium">{error}</span>}
        {!error && hint && <span className="text-xs text-[#8A8A8A]">{hint}</span>}
      </div>
    );
  }
);

TextArea.displayName = 'TextArea';
