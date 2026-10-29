import React from 'react';
import { NeevBrandMark } from './NeevBrandMark';

export interface ManagedByNeevProps {
  variant?: 'footer' | 'badge' | 'compact' | 'subtle';
  className?: string;
  showLogo?: boolean;
}

/**
 * "Managed by Neev" Professional Product Credit Component
 * 
 * Subtle, premium, non-intrusive personal branding element designed to sit
 * seamlessly within the HNGU Central Library system without overshadowing
 * the primary institutional university identity.
 */
export const ManagedByNeev: React.FC<ManagedByNeevProps> = ({
  variant = 'footer',
  className = '',
  showLogo = true,
}) => {
  if (variant === 'compact') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 text-[11px] text-[#F8F6F0]/80 select-none ${className}`}
        title="Software Platform Architect & System Manager: Neev"
      >
        {showLogo && <NeevBrandMark size={13} />}
        <span className="tracking-wide">
          Managed by{' '}
          <span className="font-semibold text-[#7DD3FC] hover:text-[#38BDF8] transition-colors">
            Neev
          </span>
        </span>
      </div>
    );
  }

  if (variant === 'badge') {
    return (
      <div
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-[#071629]/95 border border-[#38BDF8]/30 shadow-xs text-xs text-[#F8F6F0] select-none hover:border-[#38BDF8]/50 transition-colors ${className}`}
        title="Software Platform Architect & System Manager: Neev"
      >
        {showLogo && <NeevBrandMark size={14} />}
        <span className="tracking-wide text-[11px] text-[#F8F6F0]/90">
          Managed by{' '}
          <strong className="font-bold text-[#7DD3FC] tracking-normal">
            Neev
          </strong>
        </span>
      </div>
    );
  }

  if (variant === 'subtle') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 text-xs text-[#64748B] select-none ${className}`}
      >
        {showLogo && <NeevBrandMark size={13} />}
        <span>
          Managed by{' '}
          <span className="font-medium text-[#0B1F3A]">
            Neev
          </span>
        </span>
      </div>
    );
  }

  // Default 'footer' variant: Refined, restrained pill in university footer
  return (
    <div
      className={`inline-flex items-center gap-2 py-1 px-3 rounded-full bg-[#071629]/90 border border-[#38BDF8]/25 text-[11px] font-sans tracking-wide text-[#F8F6F0]/85 hover:border-[#38BDF8]/50 hover:bg-[#071629] transition-all duration-200 select-none shadow-2xs ${className}`}
      title="Platform Developed & Managed by Neev"
    >
      {showLogo && <NeevBrandMark size={14} />}
      <span className="leading-none flex items-center gap-1">
        <span>Managed by</span>
        <span className="font-bold text-[#7DD3FC] tracking-normal">
          Neev
        </span>
      </span>
    </div>
  );
};
