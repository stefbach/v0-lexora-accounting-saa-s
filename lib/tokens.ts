/**
 * Design tokens — TypeScript source of truth, mirrors the CSS variables
 * in app/globals.css. Used by Framer Motion / GSAP animations so JS and
 * CSS share the exact same design decisions.
 *
 * Required by UI/UX Pro Max `tokens.md`: "Définis une fois, utilisés
 * partout (CSS, Tailwind, TS, Framer Motion)".
 */

/** Lexora brand palette. Keep in sync with `--color-*` in globals.css. */
export const colors = {
  // Core brand
  bg: "#0B0F2E", // primary dark navy (hero, CTAs, footer)
  surface: "#141C4A",
  surfaceLight: "#F8F9FC",
  surfaceLight2: "#F0F2F8",
  card: "#FFFFFF",
  cardDark: "#101847",
  border: "#E2E5F0",
  borderDark: "#1E2760",

  // Text
  text: "#0B0F2E",
  textLight: "#E8EAFC",
  textMuted: "#4A5490",
  textMutedDark: "#A8AFC7",

  // Accents
  primary: "#4191FF", // blue
  accent: "#D4AF37", // gold
  accent2: "#E4C547", // light gold
  success: "#2ECC8A",
  danger: "#E8A84C",
} as const

/** Easing curves — use these instead of raw cubic-bezier arrays. */
export const ease = {
  /** Smooth deceleration (enter animations). */
  out: [0.22, 1, 0.36, 1] as const,
  /** Symmetric in/out (state changes). */
  inOut: [0.76, 0, 0.24, 1] as const,
  /** Fast start + decel (exits ~60% of enter duration). */
  in: [0.64, 0, 0.78, 0] as const,
  /** Expo out (hero reveals). */
  outExpo: [0.16, 1, 0.3, 1] as const,
  /** Framer Motion spring config for elastic feedback. */
  spring: { type: "spring", stiffness: 200, damping: 25 } as const,
  /** Snappier spring for buttons. */
  springSnappy: { type: "spring", stiffness: 400, damping: 30 } as const,
} as const

/** Durations in seconds (Framer Motion accepts seconds). */
export const duration = {
  fast: 0.15, // micro-interactions
  normal: 0.3, // standard transitions
  slow: 0.6, // hero reveals
  slower: 1.0, // cinematic
} as const

/** 8px spacing grid. */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
  32: 128,
} as const

export const radius = {
  sm: 4,
  md: 8,
  lg: 16,
  xl: 24,
  "2xl": 32,
  full: 9999,
} as const

export const shadow = {
  sm: "0 1px 3px rgba(11,15,46,0.06)",
  md: "0 4px 24px rgba(11,15,46,0.10)",
  lg: "0 20px 60px -20px rgba(11,15,46,0.25)",
  glowBlue: "0 0 40px rgba(65,145,255,0.30)",
  glowGold: "0 0 40px rgba(212,175,55,0.30)",
} as const

/** Z-index scale — never use raw numbers inline. */
export const z = {
  base: 0,
  raised: 10,
  overlay: 40,
  nav: 50,
  progress: 60,
  modal: 200,
  toast: 300,
  cursor: 9999,
} as const

/** Breakpoints (mobile-first). */
export const bp = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1440,
} as const

export const tokens = {
  colors,
  ease,
  duration,
  space,
  radius,
  shadow,
  z,
  bp,
} as const

export type Tokens = typeof tokens
