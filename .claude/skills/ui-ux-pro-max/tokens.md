# TOKENS.md — Design Tokens System

## PHILOSOPHIE

Les design tokens sont la **source unique de vérité** pour toutes les
décisions visuelles. Définis une fois, utilisés partout (CSS, Tailwind,
TS, Framer Motion). Ils éliminent les incohérences et accélèrent les
itérations design.

## 1. FICHIER CSS DE BASE (`tokens.css`)

```css
:root {
  /* ─── COULEURS ─────────────────────────────── */
  --color-bg:         #0a0a0a;
  --color-surface:    #111111;
  --color-surface-2:  #1a1a1a;
  --color-border:     rgba(255,255,255,0.08);

  --color-text:       #f0ede8;
  --color-text-muted: rgba(240,237,232,0.5);
  --color-text-faint: rgba(240,237,232,0.25);

  --color-primary:    #f0ede8;
  --color-accent:     #ff6b35;       /* À personnaliser par projet */
  --color-accent-2:   #c8ff00;

  /* ─── TYPOGRAPHIE ───────────────────────────── */
  --font-display:     'Clash Display', 'Cabinet Grotesk', sans-serif;
  --font-body:        'Satoshi', 'General Sans', sans-serif;
  --font-mono:        'JetBrains Mono', 'Fira Code', monospace;

  --text-xs:    clamp(0.75rem,  1vw,    0.875rem);
  --text-sm:    clamp(0.875rem, 1.2vw,  1rem);
  --text-base:  clamp(1rem,     1.4vw,  1.125rem);
  --text-lg:    clamp(1.125rem, 1.6vw,  1.25rem);
  --text-xl:    clamp(1.25rem,  2vw,    1.5rem);
  --text-2xl:   clamp(1.5rem,   2.5vw,  2rem);
  --text-3xl:   clamp(2rem,     3.5vw,  3rem);
  --text-4xl:   clamp(3rem,     5vw,    4.5rem);
  --text-5xl:   clamp(4rem,     7vw,    7rem);
  --text-hero:  clamp(5rem,     10vw,   12rem);

  --leading-tight:  1.1;
  --leading-snug:   1.25;
  --leading-normal: 1.5;
  --leading-loose:  1.75;

  --tracking-tight: -0.04em;
  --tracking-snug:  -0.02em;
  --tracking-normal: 0;
  --tracking-wide:   0.05em;
  --tracking-wider:  0.1em;

  /* ─── ESPACEMENT ────────────────────────────── */
  --space-1:   4px;  --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
  --space-5:   20px; --space-6: 24px;  --space-8: 32px;  --space-10: 40px;
  --space-12:  48px; --space-16: 64px; --space-20: 80px; --space-24: 96px;
  --space-32:  128px;--space-40: 160px;
  --space-section: clamp(80px, 12vw, 160px);

  /* ─── BORDER RADIUS ─────────────────────────── */
  --radius-sm: 4px;   --radius-md: 8px;  --radius-lg: 16px;
  --radius-xl: 24px;  --radius-2xl: 32px; --radius-full: 9999px;

  /* ─── SHADOWS ───────────────────────────────── */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.4);
  --shadow-md: 0 4px 24px rgba(0,0,0,0.5);
  --shadow-lg: 0 20px 60px rgba(0,0,0,0.6);
  --shadow-glow: 0 0 40px rgba(255,107,53,0.3);

  /* ─── TRANSITIONS ───────────────────────────── */
  --ease-out:    cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.76, 0, 0.24, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

  --duration-fast:   150ms;
  --duration-normal: 300ms;
  --duration-slow:   600ms;
  --duration-slower: 1000ms;

  /* ─── Z-INDEX ────────────────────────────────── */
  --z-base: 0; --z-raised: 10; --z-overlay: 100;
  --z-modal: 200; --z-toast: 300; --z-cursor: 9999;

  /* ─── LAYOUT ─────────────────────────────────── */
  --container-sm: 640px; --container-md: 768px; --container-lg: 1024px;
  --container-xl: 1280px; --container-2xl: 1440px; --container-max: 1600px;
  --grid-cols: 12;
  --grid-gap: clamp(16px, 2vw, 32px);
}

[data-theme="light"] {
  --color-bg: #f8f5f0;
  --color-surface: #ffffff;
  --color-surface-2: #f0ede8;
  --color-border: rgba(0,0,0,0.08);
  --color-text: #0a0a0a;
  --color-text-muted: rgba(10,10,10,0.5);
  --color-text-faint: rgba(10,10,10,0.25);
  --color-primary: #0a0a0a;
}
```

## 2. TOKENS TYPESCRIPT (pour Framer Motion)

```ts
export const tokens = {
  colors: {
    bg: 'var(--color-bg)',
    accent: 'var(--color-accent)',
    text: 'var(--color-text)',
  },
  ease: {
    out: [0.22, 1, 0.36, 1] as const,
    inOut: [0.76, 0, 0.24, 1] as const,
    spring: { type: 'spring', stiffness: 200, damping: 25 },
  },
  duration: { fast: 0.15, normal: 0.3, slow: 0.6, slower: 1.0 },
} as const
```

## 3. FONTS RECOMMANDÉES (sans licence)

Display : Clash Display, Cabinet Grotesk, Satoshi, General Sans
(fontshare.com) · Syne, Fraunces, Playfair Display (Google)
Accent : Anton, Bebas Neue, DM Serif Display, Editorial New
Mono : JetBrains Mono, Geist Mono
