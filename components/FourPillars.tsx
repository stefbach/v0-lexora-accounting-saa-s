"use client"

/**
 * FourPillars — visually highlights the 4 pillars that make Lexora a
 * unique dispositif au monde:
 *   1. Comptabilité    (accounting)
 *   2. Agents IA       (AI agents — the intelligence layer)
 *   3. RH / Paie       (HR + payroll)
 *   4. Santé           (TIBOK Corporate — the health module)
 *
 * Centered around a pulsing "Lexora Core" that visually binds all
 * four. Built with SVG + Framer Motion for smooth, GPU-only motion.
 *
 * UI/UX Pro Max rules applied:
 *  - §4 no-emoji-icons: all Lucide SVG
 *  - §7 transform-performance: only opacity/transform
 *  - §7 motion-meaning: rotating connection lines evoke "always on"
 *  - §1 reduced-motion: all loops bail out under prefers-reduced-motion
 *  - §6 color-accessible-pairs: text on each card meets AA
 */

import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import {
  BookOpen,
  Brain,
  Users,
  HeartPulse,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import { Reveal, StaggerGroup, StaggerItem, HoverLift } from "@/components/ui/motion"
import { t } from "@/lib/i18n"

type Pillar = {
  id: string
  icon: LucideIcon
  /** i18n key (cmkt.fp.*) */
  name: string
  /** i18n key (cmkt.fp.*) */
  subtitle: string
  /** i18n keys (cmkt.fp.*) */
  bullets: string[]
  accent: string
  accentSoft: string
  /** Grid position for the large layout (x/y inside a 2x2 + centered core). */
  slot: "tl" | "tr" | "bl" | "br"
}

const PILLARS: Pillar[] = [
  {
    id: "compta",
    icon: BookOpen,
    name: "cmkt.fp.compta_name",
    subtitle: "cmkt.fp.compta_subtitle",
    bullets: [
      "cmkt.fp.compta_b1",
      "cmkt.fp.compta_b2",
      "cmkt.fp.compta_b3",
    ],
    accent: "#4191FF",
    accentSoft: "rgba(65,145,255,0.14)",
    slot: "tl",
  },
  {
    id: "ia",
    icon: Brain,
    name: "cmkt.fp.ia_name",
    subtitle: "cmkt.fp.ia_subtitle",
    bullets: [
      "cmkt.fp.ia_b1",
      "cmkt.fp.ia_b2",
      "cmkt.fp.ia_b3",
    ],
    accent: "#D4AF37",
    accentSoft: "rgba(212,175,55,0.14)",
    slot: "tr",
  },
  {
    id: "rh",
    icon: Users,
    name: "cmkt.fp.rh_name",
    subtitle: "cmkt.fp.rh_subtitle",
    bullets: [
      "cmkt.fp.rh_b1",
      "cmkt.fp.rh_b2",
      "cmkt.fp.rh_b3",
    ],
    accent: "#4191FF",
    accentSoft: "rgba(65,145,255,0.14)",
    slot: "bl",
  },
  {
    id: "sante",
    icon: HeartPulse,
    name: "cmkt.fp.sante_name",
    subtitle: "cmkt.fp.sante_subtitle",
    bullets: [
      "cmkt.fp.sante_b1",
      "cmkt.fp.sante_b2",
      "cmkt.fp.sante_b3",
    ],
    accent: "#2ECC8A",
    accentSoft: "rgba(46,204,138,0.14)",
    slot: "br",
  },
]

export function FourPillars({ locale }: { locale: "fr" | "en" }) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <section
      id="dispositif"
      className="relative overflow-hidden py-20 md:py-28"
      style={{ backgroundColor: "#0B0F2E" }}
    >
      {/* Ambient backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 55% 45% at 50% 50%, rgba(65,145,255,0.18) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 90% 20%, rgba(212,175,55,0.10) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 10% 80%, rgba(46,204,138,0.08) 0%, transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 25%, #D4AF37 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        {/* Header */}
        <Reveal className="mx-auto mb-16 max-w-3xl text-center">
          <span
            className="mb-5 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-widest"
            style={{
              backgroundColor: "rgba(212,175,55,0.10)",
              color: "#D4AF37",
              borderColor: "rgba(212,175,55,0.28)",
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t("cmkt.fp.badge", locale)}
          </span>
          <h2
            className="mb-4 text-3xl font-bold tracking-tight md:text-5xl"
            style={{
              color: "#E8EAFC",
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {t("cmkt.fp.title_a", locale)}{" "}
            <span
              style={{
                backgroundImage:
                  "linear-gradient(90deg, #4191FF 0%, #D4AF37 50%, #2ECC8A 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {t("cmkt.fp.title_b", locale)}
            </span>
          </h2>
          <p
            className="text-base md:text-lg"
            style={{
              color: "#A8AFC7",
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 300,
              lineHeight: 1.7,
            }}
          >
            {t("cmkt.fp.intro", locale)}
          </p>
        </Reveal>

        {/* Core + pillars layout */}
        <div className="relative mx-auto max-w-5xl">
          {/* Orbital connection rings (decorative) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 lg:block"
            style={{ width: "420px", height: "420px" }}
          >
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                border: "1px dashed rgba(212,175,55,0.28)",
              }}
              animate={
                prefersReducedMotion ? undefined : { rotate: 360 }
              }
              transition={{
                duration: 40,
                repeat: Infinity,
                ease: "linear",
              }}
            />
            <motion.div
              className="absolute rounded-full"
              style={{
                inset: "40px",
                border: "1px dashed rgba(65,145,255,0.28)",
              }}
              animate={
                prefersReducedMotion ? undefined : { rotate: -360 }
              }
              transition={{
                duration: 60,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          </div>

          {/* Central Core — visible on large screens only */}
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 lg:block"
            aria-hidden="true"
          >
            <motion.div
              className="relative flex h-36 w-36 items-center justify-center rounded-full"
              style={{
                backgroundColor: "#141C4A",
                border: "1px solid #D4AF37",
                boxShadow:
                  "0 0 60px rgba(212,175,55,0.35), inset 0 0 30px rgba(65,145,255,0.30)",
              }}
              animate={
                prefersReducedMotion
                  ? undefined
                  : { scale: [1, 1.04, 1] }
              }
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <div
                style={{
                  fontFamily: "'Poppins', sans-serif",
                  fontWeight: 800,
                  fontSize: "18px",
                  letterSpacing: "0.15em",
                  color: "#E8EAFC",
                }}
              >
                LE<span style={{ color: "#D4AF37" }}>X</span>ORA
              </div>
              {/* Outer pulse ring */}
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ border: "1px solid #D4AF37" }}
                animate={
                  prefersReducedMotion
                    ? undefined
                    : { scale: [1, 1.5, 1.8], opacity: [0.4, 0.1, 0] }
                }
                transition={{
                  duration: 2.8,
                  repeat: Infinity,
                  ease: "easeOut",
                }}
              />
            </motion.div>
          </div>

          {/* 4 pillar cards in a 2x2 grid on desktop, stacked on mobile */}
          <StaggerGroup
            className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:gap-24"
            staggerMs={90}
          >
            {PILLARS.map((p, i) => {
              const Icon = p.icon
              const num = String(i + 1).padStart(2, "0")
              return (
                <StaggerItem key={p.id} className="h-full">
                  <HoverLift lift={6} className="h-full">
                    <article
                      className="group relative flex h-full flex-col overflow-hidden rounded-2xl p-6 md:p-7"
                      style={{
                        backgroundColor: "rgba(16,24,71,0.70)",
                        border: `1px solid ${p.accent}55`,
                        backdropFilter: "blur(8px)",
                        WebkitBackdropFilter: "blur(8px)",
                        boxShadow: `0 20px 40px -20px ${p.accent}30`,
                      }}
                    >
                      {/* Accent stripe */}
                      <div
                        aria-hidden="true"
                        className="absolute inset-x-0 top-0 h-[2px]"
                        style={{
                          background: `linear-gradient(90deg, ${p.accent} 0%, ${p.accent}22 100%)`,
                        }}
                      />
                      {/* Corner glow on hover */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                        style={{
                          background: `radial-gradient(circle, ${p.accentSoft} 0%, transparent 70%)`,
                        }}
                      />

                      {/* Header row */}
                      <div className="relative mb-5 flex items-start justify-between gap-4">
                        <motion.div
                          className="flex h-14 w-14 items-center justify-center rounded-2xl"
                          style={{
                            backgroundColor: p.accentSoft,
                            border: `1px solid ${p.accent}50`,
                            boxShadow: `0 0 24px ${p.accent}40`,
                          }}
                          whileHover={
                            prefersReducedMotion
                              ? undefined
                              : { rotate: [0, -6, 6, 0], scale: 1.08 }
                          }
                          transition={{ duration: 0.5 }}
                        >
                          <Icon
                            size={22}
                            strokeWidth={1.8}
                            style={{ color: p.accent }}
                            aria-hidden="true"
                          />
                        </motion.div>
                        <div className="text-right">
                          <div
                            className="text-[10px] font-bold uppercase tracking-widest"
                            style={{
                              color: p.accent,
                              fontFamily: "'Poppins', sans-serif",
                            }}
                          >
                            {t("cmkt.fp.pillar", locale)} {num}
                          </div>
                          <div
                            className="text-3xl font-bold leading-none md:text-4xl"
                            style={{
                              color: "rgba(232,234,252,0.10)",
                              fontFamily: "'Poppins', sans-serif",
                              fontVariantNumeric: "tabular-nums",
                              letterSpacing: "-0.04em",
                            }}
                          >
                            /{num}
                          </div>
                        </div>
                      </div>

                      {/* Name */}
                      <h3
                        className="relative mb-1 text-2xl font-bold leading-tight"
                        style={{
                          color: "#E8EAFC",
                          fontFamily: "'Poppins', sans-serif",
                          fontWeight: 700,
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {t(p.name, locale)}
                      </h3>
                      <p
                        className="relative mb-4 text-sm"
                        style={{
                          color: p.accent,
                          fontFamily: "'Poppins', sans-serif",
                          fontWeight: 500,
                        }}
                      >
                        {t(p.subtitle, locale)}
                      </p>

                      {/* Bullets */}
                      <ul className="relative flex-1 space-y-2">
                        {p.bullets.map((bKey, j) => (
                          <li
                            key={j}
                            className="flex items-start gap-2.5 text-sm"
                            style={{ color: "#A8AFC7", lineHeight: 1.55 }}
                          >
                            <span
                              aria-hidden="true"
                              className="mt-1.5 inline-block h-1 w-4 shrink-0"
                              style={{
                                background: `linear-gradient(90deg, ${p.accent} 0%, ${p.accent}33 100%)`,
                                borderRadius: "2px",
                              }}
                            />
                            <span>{t(bKey, locale)}</span>
                          </li>
                        ))}
                      </ul>

                      {/* Status footer */}
                      <div
                        className="relative mt-5 flex items-center justify-between pt-4 text-[11px] font-medium uppercase tracking-widest"
                        style={{ borderTop: "1px solid rgba(30,39,96,0.7)" }}
                      >
                        <span
                          style={{
                            color: p.accent,
                            fontFamily: "'Poppins', sans-serif",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: p.accent, boxShadow: `0 0 8px ${p.accent}` }}
                            aria-hidden="true"
                          />
                          {t("cmkt.fp.active", locale)}
                        </span>
                        <span
                          style={{
                            color: "#A8AFC7",
                            fontFamily: "'Poppins', sans-serif",
                          }}
                        >
                          {t("cmkt.fp.integrated", locale)}
                        </span>
                      </div>
                    </article>
                  </HoverLift>
                </StaggerItem>
              )
            })}
          </StaggerGroup>
        </div>

        {/* Footer statement */}
        <Reveal className="mt-16 text-center">
          <p
            className="mx-auto max-w-2xl text-sm md:text-base"
            style={{
              color: "#A8AFC7",
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 300,
              lineHeight: 1.7,
            }}
          >
            {t("cmkt.fp.footer", locale)}
          </p>
        </Reveal>
      </div>
    </section>
  )
}
