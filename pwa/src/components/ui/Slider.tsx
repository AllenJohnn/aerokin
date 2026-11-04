import React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

export interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  className?: string;
}

export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className = '', ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={`relative flex items-center select-none touch-none w-full h-8 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-border">
      <SliderPrimitive.Range className="absolute h-full rounded-full bg-accent" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className="block h-5 w-5 rounded-full border border-border bg-foreground shadow-sm transition-transform active:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none"
    />
  </SliderPrimitive.Root>
));

Slider.displayName = SliderPrimitive.Root.displayName;
