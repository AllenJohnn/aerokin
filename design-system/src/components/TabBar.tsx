import React, { useRef, useState, useEffect } from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export interface TabBarProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'h-8 text-xs px-2.5 gap-1.5',
  md: 'h-10 text-sm px-4 gap-2',
  lg: 'h-12 text-base px-5 gap-2.5',
};

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeId,
  onChange,
  size = 'md',
  fullWidth = false,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{
    left: number;
    width: number;
  }>({ left: 0, width: 0 });

  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Update active pill indicator position on tab change or resize
  useEffect(() => {
    const activeBtn = tabRefs.current.get(activeId);
    const container = containerRef.current;
    if (activeBtn && container) {
      const btnRect = activeBtn.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();
      setIndicatorStyle({
        left: btnRect.left - contRect.left,
        width: btnRect.width,
      });
    }
  }, [activeId, tabs, size]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    const nextTab = tabs[nextIndex];
    if (nextTab) {
      onChange(nextTab.id);
      tabRefs.current.get(nextTab.id)?.focus();
    }
  };

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Navigation modes"
      className={`relative inline-flex items-center p-1 rounded-2xl bg-aerokin-surface border border-aerokin-border backdrop-blur-xl shadow-glass ${
        fullWidth ? 'w-full flex' : ''
      } ${className}`}
    >
      {/* Gliding Active Indicator Pill */}
      {indicatorStyle.width > 0 && (
        <div
          className="absolute top-1 bottom-1 rounded-xl bg-white/[0.09] border border-white/[0.14] shadow-sm transition-all duration-300 ease-aerokin pointer-events-none"
          style={{
            transform: `translateX(${indicatorStyle.left}px)`,
            width: `${indicatorStyle.width}px`,
          }}
        >
          {/* Subtle top specular shine */}
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          {/* Subtle bottom glow point */}
          <div className="absolute inset-x-2 -bottom-1 h-2 bg-aerokin-cyan/20 blur-sm rounded-full" />
        </div>
      )}

      {/* Tab Buttons */}
      {tabs.map((tab, idx) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) tabRefs.current.set(tab.id, el);
              else tabRefs.current.delete(tab.id);
            }}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`relative z-10 inline-flex items-center justify-center font-sans font-medium transition-colors duration-200 ease-aerokin select-none rounded-xl focus:outline-none focus-visible:ring-1 focus-visible:ring-aerokin-cyan/50 ${
              sizeClasses[size]
            } ${fullWidth ? 'flex-1' : ''} ${
              isActive
                ? 'text-white'
                : 'text-aerokin-muted hover:text-white/80'
            }`}
          >
            {tab.icon && (
              <span
                className={`transition-colors duration-200 ${
                  isActive ? 'text-aerokin-cyan' : 'text-aerokin-muted'
                }`}
              >
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span className="ml-1.5 rounded-full bg-aerokin-violet/20 border border-aerokin-violet/30 px-1.5 py-0.2 font-mono text-[10px] text-aerokin-cyan">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default TabBar;
