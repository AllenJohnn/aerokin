import React, { useEffect, useState } from 'react';
import { DesignShowcase } from './pages/DesignShowcase';

export const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  // The design system route is `/design`. If opened at `/`, we also show the design system showcase
  // while displaying the route indicator so users can navigate to `/design`.
  return (
    <div className="relative min-h-screen bg-aerokin-bg text-aerokin-text">
      {/* Route banner for clarity */}
      <div className="bg-[#0B0B13] border-b border-aerokin-border px-4 py-1.5 flex items-center justify-between text-[11px] font-mono text-aerokin-muted">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-aerokin-cyan shadow-glow-cyan" />
          <span>Active Route:</span>
          <span className="text-white font-semibold">
            {currentPath === '/' ? '/design (default)' : currentPath}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateTo('/design')}
            className={`px-2 py-0.5 rounded transition-colors ${
              currentPath === '/design'
                ? 'bg-aerokin-cyan/20 text-aerokin-cyan border border-aerokin-cyan/30'
                : 'hover:text-white'
            }`}
          >
            /design
          </button>
        </div>
      </div>

      <DesignShowcase />
    </div>
  );
};

export default App;
