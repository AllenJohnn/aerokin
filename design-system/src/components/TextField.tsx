import React, { forwardRef } from 'react';

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, hint, leftIcon, rightElement, className = '', id, disabled, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;

    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-[#8A8A8A]">
            {label}
          </label>
        )}
        <div className="relative flex items-center w-full">
          {leftIcon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-[#8A8A8A]">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={`w-full bg-[#0A0A0A] text-[#F5F5F5] placeholder-[#8A8A8A] border ${
              error ? 'border-[#FF453A]' : 'border-[#1F1F1F]'
            } rounded-xl ${leftIcon ? 'pl-9' : 'pl-3.5'} ${
              rightElement ? 'pr-10' : 'pr-3.5'
            } py-2.5 text-base font-normal transition-colors duration-150 focus:outline-none focus:border-[#FF5A1F] focus:ring-1 focus:ring-[#FF5A1F] disabled:opacity-50 disabled:cursor-not-allowed selection:bg-[#FF5A1F]/30 [color-scheme:dark] ${className}`}
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
          {rightElement && (
            <div className="absolute right-3 flex items-center text-[#8A8A8A]">
              {rightElement}
            </div>
          )}
        </div>
        {error && <span className="text-xs text-[#FF453A] font-medium">{error}</span>}
        {!error && hint && <span className="text-xs text-[#8A8A8A]">{hint}</span>}
      </div>
    );
  }
);

TextField.displayName = 'TextField';
