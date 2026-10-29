import React from 'react';
import bgImage from '../assets/images/hngu_university_library_interior_1791103395027.jpg';

export const LibraryBackgroundEnvironment: React.FC = () => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none select-none z-0 no-print">
      {/* 1. Realistic architectural library photograph */}
      <picture>
        <source srcSet="/hngu_smart_library_bg.webp" type="image/webp" />
        <img
          src="/hngu_smart_library_bg.jpg"
          alt="Hemchandracharya North Gujarat University Academic Library Interior"
          loading="lazy"
          className="w-full h-full object-cover object-center filter brightness-[1.08] contrast-[0.95] opacity-25"
          referrerPolicy="no-referrer"
        />
      </picture>

      {/* 2. Soft Ivory #F8F6F0 foundation overlay ensuring 65% Ivory canvas for readability */}
      <div className="absolute inset-0 bg-[#F8F6F0]/92 backdrop-blur-[1px]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#F8F6F0]/95 via-[#F8F6F0]/80 to-[#F8F6F0]" />

      {/* 3. Subtle Champagne Gold ambient warmth highlighting academic heritage */}
      <div className="absolute top-0 right-1/4 w-[600px] h-[350px] bg-[#D4AF37]/[0.05] rounded-full blur-[120px]" />
      <div className="absolute bottom-0 left-1/4 w-[500px] h-[300px] bg-[#0B1F3A]/[0.02] rounded-full blur-[100px]" />
    </div>
  );
};
