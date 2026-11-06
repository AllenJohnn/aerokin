import React from 'react';
import { Drawer as VaulDrawer } from 'vaul';

export const Sheet = VaulDrawer.Root;
export const SheetTrigger = VaulDrawer.Trigger;
export const SheetClose = VaulDrawer.Close;
export const SheetPortal = VaulDrawer.Portal;

export const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Overlay>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Overlay>
>(({ className = '', ...props }, ref) => (
  <VaulDrawer.Overlay
    ref={ref}
    className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-none transition-opacity ${className}`}
    {...props}
  />
));
SheetOverlay.displayName = VaulDrawer.Overlay.displayName;

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Content>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Content>
>(({ className = '', children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <VaulDrawer.Content
      ref={ref}
      className={`fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] rounded-t-2xl border-t border-border bg-surface shadow-sheet dark:shadow-sheet-dark flex flex-col focus:outline-none ${className}`}
      {...props}
    >
      <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-border" />
      {children}
    </VaulDrawer.Content>
  </SheetPortal>
));
SheetContent.displayName = 'SheetContent';

export const SheetHeader = ({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={`flex flex-col space-y-1.5 text-left px-5 py-4 border-b border-border ${className}`}
    {...props}
  />
);
SheetHeader.displayName = 'SheetHeader';

export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Title>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Title>
>(({ className = '', ...props }, ref) => (
  <VaulDrawer.Title
    ref={ref}
    className={`text-base font-semibold text-foreground ${className}`}
    {...props}
  />
));
SheetTitle.displayName = VaulDrawer.Title.displayName;

export const SheetDescription = React.forwardRef<
  React.ElementRef<typeof VaulDrawer.Description>,
  React.ComponentPropsWithoutRef<typeof VaulDrawer.Description>
>(({ className = '', ...props }, ref) => (
  <VaulDrawer.Description
    ref={ref}
    className={`text-xs text-muted-foreground ${className}`}
    {...props}
  />
));
SheetDescription.displayName = VaulDrawer.Description.displayName;
