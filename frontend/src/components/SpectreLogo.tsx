
import React from 'react';

interface SpectreLogoProps {
  className?: string;
  size?: number;
  alert?: boolean;
}

const SpectreLogo: React.FC<SpectreLogoProps> = ({ className = "", size = 32, alert = false }) => {
  const color = alert ? '#f43f5e' : '#38bdf8';

  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 blur-xl opacity-30"
        style={{ background: `radial-gradient(circle, ${color}33 0%, transparent 70%)` }}
      ></div>
      <svg
        viewBox="0 0 100 100"
        className="relative z-10 w-full h-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M74 26 C74 12 26 12 26 34 C26 52 74 50 74 68 C74 88 26 88 26 70"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          className="transition-all duration-500 ease-in-out"
        />
        <rect x="48" y="18" width="4" height="64" fill={color} opacity="0.25" />
        <circle cx="50" cy="50" r="2.5" fill={color}>
          <animate attributeName="opacity" values="1;0.3;1" dur="2.2s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  );
};

export default SpectreLogo;
