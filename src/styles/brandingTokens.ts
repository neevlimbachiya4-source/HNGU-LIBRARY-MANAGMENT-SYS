/**
 * HNGU Central Library - Global Branding & Design Tokens
 * 
 * Defines standard typography scale, font hierarchies, spatial tokens,
 * HNGU institutional primary palette, and Neev developer/product identity tokens.
 */

export const BRAND_TOKENS = {
  // Institutional Primary Palette (HNGU)
  institutional: {
    navyDark: '#071629',
    navyPrimary: '#0B1F3A',
    navyElevated: '#132C4E',
    goldAccent: '#D4AF37',
    goldHover: '#C29F2F',
    goldSubtle: 'rgba(212, 175, 55, 0.12)',
    goldBorder: 'rgba(212, 175, 55, 0.35)',
    ivoryCanvas: '#F8F6F0',
    pureWhite: '#FFFFFF',
  },

  // Personal Developer & Product Management Identity (Neev)
  // Subtle secondary technical accent harmonized with HNGU Deep Navy
  creator: {
    accent: '#38BDF8', // Refined technical cyan / azure
    accentLight: '#7DD3FC',
    accentDeep: '#0284C7',
    accentMuted: 'rgba(56, 189, 248, 0.12)',
    accentBorder: 'rgba(56, 189, 248, 0.32)',
    accentGlow: 'rgba(56, 189, 248, 0.22)',
    name: 'Neev',
    managedCreditText: 'Managed by Neev',
  },

  // Typography Scale Hierarchy
  typography: {
    fonts: {
      displaySerif: "'Playfair Display', Georgia, serif",
      interfaceSans: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      monospaceTechnical: "'JetBrains Mono', monospace",
    },
    weights: {
      regular: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      extrabold: '800',
    },
    tracking: {
      tighter: '-0.035em',
      tight: '-0.02em',
      normal: '0',
      wide: '0.04em',
      wider: '0.08em',
      widest: '0.14em',
    },
    lineHeights: {
      tight: '1.1',
      snug: '1.25',
      normal: '1.5',
      relaxed: '1.65',
    },
  },

  // Border Radii
  radius: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    '2xl': '24px',
    full: '9999px',
  },

  // Depth Elevation Shadows
  shadows: {
    card: '0 4px 20px -2px rgba(11, 31, 58, 0.06), 0 0 0 1px rgba(212, 175, 55, 0.20)',
    elevated: '0 12px 32px -6px rgba(11, 31, 58, 0.12), 0 0 0 1px rgba(212, 175, 55, 0.30)',
    floating: '0 20px 40px -10px rgba(11, 31, 58, 0.25), 0 0 0 1px rgba(212, 175, 55, 0.40)',
    creatorGlow: '0 4px 16px -2px rgba(56, 189, 248, 0.20)',
  },

  // Motion Hierarchy Tokens (Calibrated 3-tier system: Level 1 Instant, Level 2 State, Level 3 Structural)
  motion: {
    // Level 1: Instant Feedback (100–180ms)
    level1Duration: '140ms',
    durationFast: '160ms',    // Button tactile press, icon hover, toggle feedback
    // Level 2: UI State Changes (180–300ms)
    level2Duration: '220ms',
    durationNormal: '240ms',  // Tab switching, card elevations, input focus halos, status badge transitions
    // Level 3: Structural Transitions (220–450ms)
    level3Duration: '300ms',
    durationLarge: '350ms',   // Page-to-page entrances, drawer slides, modal backdrop reveals
    easeAcademic: 'cubic-bezier(0.16, 1, 0.3, 1)',
    easeSmooth: 'cubic-bezier(0.2, 0, 0, 1)',
    easeFeedback: 'cubic-bezier(0, 0, 0.2, 1)',
  },
} as const;

export type BrandTokens = typeof BRAND_TOKENS;
