import React from 'react';

export interface LatencySparklineProps {
  history: number[];
  width?: number;
  height?: number;
  className?: string;
}

export const LatencySparkline: React.FC<LatencySparklineProps> = ({
  history,
  width = 56,
  height = 18,
  className = '',
}) => {
  if (history.length < 2) {
    return (
      <div
        style={{ width, height }}
        className={`flex items-center justify-center ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-aerokin-cyan animate-pulse" />
      </div>
    );
  }

  const min = Math.min(...history, 5);
  const max = Math.max(...history, 35);
  const range = max - min || 1;

  const points = history
    .map((val, idx) => {
      const x = (idx / (history.length - 1)) * (width - 4) + 2;
      const y = height - 3 - ((val - min) / range) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const lastVal = history[history.length - 1];
  const lastX = width - 2;
  const lastY = height - 3 - ((lastVal - min) / range) * (height - 6);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`overflow-visible ${className}`}
      fill="none"
    >
      <polyline
        points={points}
        stroke="#22D3EE"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      <circle
        cx={lastX}
        cy={lastY}
        r="2.5"
        fill="#38BDF8"
        className="animate-pulse"
      />
    </svg>
  );
};
