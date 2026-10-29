/**
 * HNGU Smart Library Management System — Visual Design System Foundation
 * 
 * Philosophy:
 * - Sophisticated, academic, intelligent, calm, and highly intentional.
 * - Light-first architecture: warm Ivory (#F8F6F0) as ground, pure white (#FFFFFF) for surfaces.
 * - Deep Navy (#0B1F3A) for architectural anchors, primary headings, and high-contrast typography.
 * - Champagne Gold (#D4AF37) used strictly as an intentional academic accent (borders, active indicators, highlights).
 * - Restrained, accessible semantic status colors (emerald, amber, rose).
 */

export const DESIGN_TOKENS = {
  // 1. COLOR PALETTE
  colors: {
    // Canvas & Ground
    canvas: '#F8F6F0',          // Primary warm ivory canvas
    canvasMuted: '#F1EDE4',     // Slightly darker ivory for subtle structural differentiation
    
    // Surfaces
    surface: '#FFFFFF',          // Pure white surface for primary content cards
    surfaceElevated: '#FFFFFF',  // Elevated modal/popover surface
    surfaceSubtle: '#F8F6F0',    // Secondary surface inset
    
    // Navy Architecture & Text
    navy: {
      deep: '#0B1F3A',           // Primary architectural navy / primary text
      dark: '#071629',           // Darkest shade for high-contrast containers
      light: '#132C4E',          // Interactive hover navy
      tint: 'rgba(11, 31, 58, 0.04)',
      border: 'rgba(11, 31, 58, 0.12)',
    },
    
    // Champagne Gold Accents
    gold: {
      primary: '#D4AF37',        // Champagne gold accent
      hover: '#C29F2F',          // Deep gold for active/hover states
      subtle: 'rgba(212, 175, 55, 0.12)', // Tinted background for badges/pills
      border: 'rgba(212, 175, 55, 0.35)', // Standard gold card border
      borderGlow: 'rgba(212, 175, 55, 0.60)',
    },

    // Typography
    text: {
      primary: '#0B1F3A',        // High contrast primary dark neutral
      secondary: '#1E293B',      // Refined dark neutral for body paragraphs
      muted: '#64748B',          // Subtle label / timestamp neutral
      onDark: '#F8F6F0',         // Crisp ivory for dark navy surfaces
      onDarkMuted: 'rgba(248, 246, 240, 0.80)',
    },

    // Status Semantics (restrained, accessible)
    status: {
      success: {
        bg: '#ECFDF5',
        text: '#065F46',
        border: '#A7F3D0',
        solid: '#059669',
      },
      warning: {
        bg: '#FFFBEB',
        text: '#92400E',
        border: '#FDE68A',
        solid: '#D97706',
      },
      error: {
        bg: '#FEF2F2',
        text: '#991B1B',
        border: '#FECACA',
        solid: '#DC2626',
      },
      info: {
        bg: '#EFF6FF',
        text: '#1E40AF',
        border: '#BFDBFE',
        solid: '#2563EB',
      },
    },

    // Border Lines & Dividers
    border: {
      hairline: 'rgba(11, 31, 58, 0.08)',
      subtle: 'rgba(11, 31, 58, 0.14)',
      goldSubtle: 'rgba(212, 175, 55, 0.30)',
      goldActive: 'rgba(212, 175, 55, 0.65)',
    },
  },

  // 2. SPACING SYSTEM (Predictable 4px grid)
  spacing: {
    xs: '0.25rem',   // 4px
    sm: '0.5rem',    // 8px
    md: '0.75rem',   // 12px
    lg: '1rem',      // 16px
    xl: '1.25rem',   // 20px
    '2xl': '1.5rem', // 24px
    '3xl': '2rem',   // 32px
    '4xl': '2.5rem', // 40px
    '5xl': '3rem',   // 48px
  },

  // 3. ELEVATION & DEPTH SHADOWS (Soft, optical, architectural)
  shadows: {
    subtle: '0 1px 3px rgba(11, 31, 58, 0.04), 0 1px 2px rgba(11, 31, 58, 0.02)',
    card: '0 4px 16px -2px rgba(11, 31, 58, 0.06), 0 0 0 1px rgba(212, 175, 55, 0.15)',
    elevated: '0 12px 32px -6px rgba(11, 31, 58, 0.09), 0 0 0 1px rgba(212, 175, 55, 0.22)',
    modal: '0 24px 48px -12px rgba(11, 31, 58, 0.24), 0 0 0 1px rgba(212, 175, 55, 0.35)',
  },

  // 4. CORNER RADII (Restrained, elegant, modern)
  radii: {
    sm: '0.5rem',     // 8px
    md: '0.75rem',    // 12px
    lg: '1rem',       // 16px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    full: '9999px',
  },

  // 5. TYPOGRAPHY SYSTEM
  fonts: {
    sans: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
    academic: "'Playfair Display', Georgia, serif",
    mono: "'JetBrains Mono', monospace",
  },

  // Type Scale Definitions (fontSize, lineHeight, letterSpacing, fontWeight)
  typeScale: {
    display: {
      fontSize: 'clamp(2.5rem, 5vw + 0.5rem, 4.5rem)',
      lineHeight: '1.05',
      letterSpacing: '-0.035em',
      fontWeight: '800',
    },
    displayAcademic: {
      fontSize: 'clamp(2.25rem, 4.5vw + 0.5rem, 4.25rem)',
      lineHeight: '1.08',
      letterSpacing: '-0.015em',
      fontWeight: '800',
    },
    h1: {
      fontSize: 'clamp(1.875rem, 3.2vw + 0.25rem, 2.75rem)',
      lineHeight: '1.15',
      letterSpacing: '-0.025em',
      fontWeight: '800',
    },
    h2: {
      fontSize: 'clamp(1.375rem, 2vw + 0.25rem, 1.875rem)',
      lineHeight: '1.25',
      letterSpacing: '-0.02em',
      fontWeight: '700',
    },
    h3: {
      fontSize: 'clamp(1.125rem, 1.2vw + 0.3rem, 1.375rem)',
      lineHeight: '1.32',
      letterSpacing: '-0.015em',
      fontWeight: '600',
    },
    h4: {
      fontSize: '1rem', // 16px
      lineHeight: '1.4',
      letterSpacing: '-0.01em',
      fontWeight: '600',
    },
    bodyLarge: {
      fontSize: '1.0625rem', // 17px
      lineHeight: '1.65',
      letterSpacing: '-0.005em',
      fontWeight: '400',
    },
    body: {
      fontSize: '0.9375rem', // 15px
      lineHeight: '1.6',
      letterSpacing: '0em',
      fontWeight: '400',
    },
    bodySmall: {
      fontSize: '0.8125rem', // 13px
      lineHeight: '1.52',
      letterSpacing: '0.005em',
      fontWeight: '400',
    },
    caption: {
      fontSize: '0.75rem', // 12px
      lineHeight: '1.45',
      letterSpacing: '0.01em',
      fontWeight: '500',
    },
    metadata: {
      fontSize: '0.6875rem', // 11px
      lineHeight: '1.35',
      letterSpacing: '0.06em',
      fontWeight: '600',
    },
    overline: {
      fontSize: '0.6875rem', // 11px
      lineHeight: '1.3',
      letterSpacing: '0.1em',
      fontWeight: '700',
    },
    buttonText: {
      fontSize: '0.8125rem', // 13px
      lineHeight: '1',
      letterSpacing: '0.02em',
      fontWeight: '600',
    },
    navText: {
      fontSize: '0.8125rem', // 13px
      lineHeight: '1.25',
      letterSpacing: '0.015em',
      fontWeight: '500',
    },
    statNumber: {
      fontSize: 'clamp(1.875rem, 3.5vw + 0.25rem, 2.75rem)',
      lineHeight: '1.08',
      letterSpacing: '-0.025em',
      fontWeight: '800',
    },
  },
} as const;

/**
 * Standardized Design System Tailwind Class Helpers
 * Provides complete visual consistency across buttons, inputs, cards, and badges.
 */
export const UI = {
  // 0. TYPOGRAPHY HELPERS
  typography: {
    // Headings
    display: 'font-sans font-extrabold text-4xl sm:text-6xl lg:text-7xl tracking-[-0.035em] text-[#0B1F3A] leading-[1.05] [text-wrap:balance]',
    displayAcademic: 'font-serif-academic font-bold text-4xl sm:text-6xl lg:text-7xl tracking-tight text-[#0B1F3A] leading-[1.08] [text-wrap:balance]',
    h1: 'font-sans font-extrabold text-2xl sm:text-3xl lg:text-4xl tracking-[-0.025em] text-[#0B1F3A] leading-tight [text-wrap:balance]',
    h1Academic: 'font-serif-academic font-bold text-2xl sm:text-3xl lg:text-4xl tracking-tight text-[#0B1F3A] leading-tight [text-wrap:balance]',
    h2: 'font-sans font-bold text-xl sm:text-2xl tracking-[-0.02em] text-[#0B1F3A] leading-snug',
    h3: 'font-sans font-semibold text-base sm:text-lg tracking-[-0.015em] text-[#0B1F3A] leading-snug',
    h4: 'font-sans font-semibold text-sm sm:text-base tracking-[-0.01em] text-[#0B1F3A] leading-snug',

    // Body text
    bodyLg: 'text-base text-[#1E293B] leading-[1.65] font-normal tracking-[-0.005em]',
    body: 'text-sm text-[#1E293B] leading-relaxed font-normal tracking-normal',
    bodySm: 'text-xs text-[#334155] leading-normal font-normal tracking-[0.005em]',
    caption: 'text-[12px] text-[#64748B] leading-tight font-medium tracking-[0.01em]',

    // Metadata & Labels
    metadata: 'text-[11px] text-[#64748B] uppercase tracking-[0.06em] font-semibold',
    overline: 'text-[11px] font-mono uppercase tracking-[0.1em] text-[#D4AF37] font-bold',
    label: 'text-xs font-bold text-[#0B1F3A] tracking-wide',
    sublabel: 'text-[11px] text-[#64748B] font-medium leading-tight',

    // Numbers & Quantitative Statistics (Tabular alignment)
    statNumber: 'font-sans text-3xl sm:text-4xl font-extrabold text-[#0B1F3A] tracking-[-0.025em] tabular-nums',
    statLabel: 'text-[11px] font-mono font-bold uppercase tracking-[0.08em] text-[#64748B]',
    dataMono: 'font-mono text-xs font-semibold text-[#0B1F3A] tracking-[0.02em] tabular-nums',

    // Navigation & Actions
    navPrimary: 'text-xs sm:text-sm font-medium tracking-[0.015em] text-[#F8F6F0]',
    navActive: 'text-xs sm:text-sm font-bold tracking-[0.015em] text-[#D4AF37]',
    button: 'text-xs font-semibold tracking-[0.02em]',
    buttonLg: 'text-sm font-semibold tracking-[0.02em]',
  },
  // 1. BUTTON VARIANTS
  button: {
    // Primary: Deep Navy with Ivory text and subtle gold border
    primary:
      'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0B1F3A] hover:bg-[#132C4E] text-[#F8F6F0] font-semibold text-xs tracking-wide shadow-xs border border-[#D4AF37]/50 hover:border-[#D4AF37] transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]',

    // Secondary: Pure white or ivory with navy border/text
    secondary:
      'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white hover:bg-[#F8F6F0] text-[#0B1F3A] font-semibold text-xs tracking-wide border border-[#0B1F3A]/15 hover:border-[#D4AF37]/60 shadow-2xs transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]',

    // Accent: Champagne Gold with Deep Navy text
    accent:
      'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#C29F2F] text-[#0B1F3A] font-bold text-xs tracking-wide border border-[#D4AF37] shadow-sm transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]',

    // Ghost / Subordinate: Borderless with subtle hover fill
    ghost:
      'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-[#0B1F3A] hover:bg-[#0B1F3A]/5 transition-all duration-200 text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none',

    // Destructive: Subtle rose warning state
    destructive:
      'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-semibold transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none',

    // Sizes
    sizes: {
      sm: 'px-3 py-1.5 text-[11px] rounded-lg',
      md: 'px-5 py-2.5 text-xs rounded-xl',
      lg: 'px-6 py-3 text-sm rounded-xl',
    },
  },

  // 2. SURFACE & CONTAINER VARIANTS
  surface: {
    // Ground page container
    page: 'bg-[#F8F6F0] text-[#0B1F3A]',

    // Standard card: Clean white surface with subtle gold framing
    card: 'bg-white rounded-2xl border border-[#D4AF37]/30 shadow-xs hover:border-[#D4AF37]/50 transition-all',

    // Elevated card: Used for featured metrics, interactive modals
    cardElevated:
      'bg-white rounded-2xl sm:rounded-3xl border border-[#D4AF37]/35 shadow-md shadow-[#0B1F3A]/5 transition-all',

    // Inset surface: Warm ivory recessed area
    inset: 'bg-[#F8F6F0] rounded-xl border border-[#D4AF37]/25',

    // Deep Navy architectural card
    navy: 'bg-[#0B1F3A] text-[#F8F6F0] rounded-2xl sm:rounded-3xl border border-[#D4AF37]/35 shadow-xl',
  },

  // 3. FORM INPUT VARIANTS
  form: {
    input:
      'w-full bg-[#F8F6F0] border border-[#D4AF37]/35 rounded-xl px-3.5 py-2.5 text-xs text-[#0B1F3A] placeholder-[#64748B] font-medium focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all shadow-2xs',
    
    select:
      'w-full bg-[#F8F6F0] border border-[#D4AF37]/35 rounded-xl px-3.5 py-2.5 text-xs text-[#0B1F3A] font-medium focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 cursor-pointer transition-all shadow-2xs',

    textarea:
      'w-full bg-[#F8F6F0] border border-[#D4AF37]/35 rounded-xl p-3 text-xs text-[#0B1F3A] placeholder-[#64748B] font-medium focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/40 transition-all shadow-2xs resize-none',

    label: 'block text-xs font-bold text-[#0B1F3A] mb-1.5',
    helper: 'text-[11px] text-[#64748B] mt-1 font-medium leading-relaxed',
    error: 'text-[11px] text-rose-700 mt-1 font-semibold flex items-center gap-1',
  },

  // 4. STATUS BADGES
  badge: {
    active:
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-50 text-emerald-800 border border-emerald-300',
    
    inactive:
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-slate-100 text-slate-700 border border-slate-300',

    warning:
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-amber-50 text-amber-800 border border-amber-300',

    error:
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-rose-50 text-rose-800 border border-rose-300',

    gold:
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-[#D4AF37]/15 text-[#0B1F3A] border border-[#D4AF37]/40',

    navy:
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-[#0B1F3A] text-[#F8F6F0] border border-[#D4AF37]/35',
  },

  // 5. DATA TABLES
  table: {
    container: 'overflow-x-auto rounded-2xl border border-[#0B1F3A]/10 bg-white shadow-xs',
    header: 'border-b border-[#0B1F3A]/20 text-[#F8F6F0] uppercase text-[10px] tracking-wider font-extrabold bg-[#0B1F3A]',
    th: 'py-3.5 px-4 font-extrabold text-left',
    row: 'hover:bg-[#F8F6F0] transition-colors border-b border-[#0B1F3A]/10 last:border-b-0',
    td: 'py-3 px-4 text-xs text-[#0B1F3A]',
  },
} as const;
