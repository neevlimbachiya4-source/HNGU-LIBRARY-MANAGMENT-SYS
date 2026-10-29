import React from 'react';

interface NeevBrandMarkProps {
  size?: number;
  className?: string;
  withBackground?: boolean;
  variant?: 'standalone' | 'framed' | 'glow';
}

/**
 * Unique Geometric Monogram for NEEV (N + V)
 * 
 * Interlocking geometric construct representing "N" with integrated "V" apex.
 * Designed with micron optical symmetry, crisp line-caps, and subtle technical accents.
 */
export const NeevBrandMark: React.FC<NeevBrandMarkProps> = ({
  size = 20,
  className = '',
  withBackground = false,
  variant = 'standalone',
}) => {
  const gradientId = React.useId();

  const markSvg = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-transform ${className}`}
      aria-hidden="true"
    >
      <defs>
        {/* Subtle Dual-Tone Gradient (Champagne Gold → Technical Azure/Cyan) */}
        <linearGradient id={`${gradientId}-monogram`} x1="6" y1="7" x2="26" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D4AF37" />
          <stop offset="55%" stopColor="#7DD3FC" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>

        <linearGradient id={`${gradientId}-v-accent`} x1="9" y1="11" x2="23" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
      </defs>

      {/* Primary Geometric N+V Interlocking Stems */}
      {/* Left N-Stem (6, 25 to 6, 7) */}
      <path
        d="M7 24.5V7.5L16 21.5L25 7.5V24.5"
        stroke={`url(#${gradientId}-monogram)`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Internal Precision "V" Vertex Reinforcement */}
      <path
        d="M11 12L16 21.5L21 12"
        stroke={`url(#${gradientId}-v-accent)`}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />

      {/* Optical Anchor Dot at V-Convergence Top Center */}
      <circle cx="16" cy="9.5" r="1.25" fill="#38BDF8" />
    </svg>
  );

  if (withBackground || variant === 'framed') {
    return (
      <div
        className="inline-flex items-center justify-center rounded-lg bg-[#071629] border border-[#38BDF8]/30 shadow-xs hover:border-[#38BDF8]/60 transition-colors p-1"
        style={{ width: size + 8, height: size + 8 }}
      >
        {markSvg}
      </div>
    );
  }

  if (variant === 'glow') {
    return (
      <div className="relative inline-flex items-center justify-center">
        <div className="absolute inset-0 bg-[#38BDF8]/20 blur-md rounded-full pointer-events-none" />
        {markSvg}
      </div>
    );
  }

  return markSvg;
};
