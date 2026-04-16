"use client"

/**
 * ClientKit — design-kit primitives for the Lexora client portal.
 *
 * Reusable building blocks that give every client page the same
 * "futuristic pro" look as the landing page: layered shadows,
 * gradient accents, motion-aware hover, clean tokens.
 *
 * Keep this file tiny and surgical — new pages should compose these
 * primitives rather than reinvent card styles.
 */

import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react"

const FONT = "'Poppins', sans-serif"

const ACCENTS = {
  blue: "#2A6FCC",
  blueLight: "#4191FF",
  gold: "#D4AF37",
  goldDark: "#A88925",
  green: "#2ECC8A",
  red: "#E25555",
  orange: "#E8A84C",
  navy: "#0B0F2E",
} as const

export type ClientAccent = "blue" | "gold" | "green" | "red" | "orange"

function resolveAccent(a: ClientAccent): { strong: string; soft: string; text: string } {
  switch (a) {
    case "gold":   return { strong: ACCENTS.gold,     soft: "rgba(212,175,55,0.14)",  text: ACCENTS.goldDark }
    case "green":  return { strong: ACCENTS.green,    soft: "rgba(46,204,138,0.14)",  text: "#1F9B68" }
    case "red":    return { strong: ACCENTS.red,      soft: "rgba(226,85,85,0.14)",   text: "#B93B3B" }
    case "orange": return { strong: ACCENTS.orange,   soft: "rgba(232,168,76,0.14)",  text: "#B97A24" }
    case "blue":
    default:       return { strong: ACCENTS.blueLight, soft: "rgba(65,145,255,0.14)", text: ACCENTS.blue }
  }
}

/* ------------------------------------------------------------------ */
/*  ClientPanel — the base card all client content sits in             */
/* ------------------------------------------------------------------ */

export function ClientPanel({
  children,
  padded = true,
  className,
  style,
}: {
  children: React.ReactNode
  padded?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        background:
          "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
        border: "1px solid #D8DFED",
        borderRadius: "18px",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.9)",
        padding: padded ? "22px" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  ClientSectionHeader                                                */
/* ------------------------------------------------------------------ */

export function ClientSectionHeader({
  title,
  subtitle,
  icon: Icon,
  accent = "blue",
  actions,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  icon?: LucideIcon
  accent?: ClientAccent
  actions?: React.ReactNode
}) {
  const a = resolveAccent(accent)
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "16px",
        marginBottom: "18px",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        {Icon && (
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: `linear-gradient(135deg, ${a.strong}2A 0%, ${a.strong}0D 100%)`,
              border: `1px solid ${a.strong}44`,
              color: a.text,
              boxShadow: `0 10px 24px -10px ${a.strong}55, inset 0 1px 0 rgba(255,255,255,0.45)`,
              flexShrink: 0,
            }}
          >
            <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
          </span>
        )}
        <div>
          <h2
            style={{
              margin: 0,
              fontFamily: FONT,
              fontSize: "18px",
              fontWeight: 700,
              color: "#0B0F2E",
              letterSpacing: "-0.01em",
              lineHeight: 1.25,
            }}
          >
            {title}
          </h2>
          {subtitle && (
            <div
              style={{
                marginTop: "2px",
                fontFamily: FONT,
                fontSize: "13px",
                color: "#475569",
                lineHeight: 1.5,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {actions && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>{actions}</div>
      )}
    </header>
  )
}

/* ------------------------------------------------------------------ */
/*  ClientKpi — metric card with optional delta                        */
/* ------------------------------------------------------------------ */

export function ClientKpi({
  label,
  value,
  delta,
  deltaPositive,
  icon: Icon,
  accent = "blue",
  hint,
}: {
  label: React.ReactNode
  value: React.ReactNode
  delta?: React.ReactNode
  deltaPositive?: boolean
  icon?: LucideIcon
  accent?: ClientAccent
  hint?: React.ReactNode
}) {
  const a = resolveAccent(accent)
  const prefersReducedMotion = useReducedMotion()

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: "relative",
        overflow: "hidden",
        padding: "18px 20px",
        borderRadius: "16px",
        background:
          "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
        border: "1px solid #D8DFED",
        boxShadow:
          "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16)",
      }}
    >
      {/* Accent top stripe */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "0 0 auto 0",
          height: "3px",
          background: `linear-gradient(90deg, ${a.strong} 0%, ${a.strong}33 100%)`,
        }}
      />
      {/* Corner glow */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "-60px",
          right: "-60px",
          width: "180px",
          height: "180px",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${a.soft} 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "10px",
        }}
      >
        <span
          style={{
            fontFamily: FONT,
            fontSize: "11px",
            fontWeight: 700,
            color: "#475569",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        {Icon && (
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              background: `linear-gradient(135deg, ${a.strong}22 0%, ${a.strong}08 100%)`,
              border: `1px solid ${a.strong}33`,
              color: a.text,
              boxShadow: `0 8px 18px -8px ${a.strong}55`,
            }}
          >
            <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
          </span>
        )}
      </div>

      <div
        style={{
          fontFamily: FONT,
          fontSize: "clamp(22px, 2.4vw, 30px)",
          fontWeight: 700,
          color: "#0B0F2E",
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop: "8px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        {delta !== undefined && delta !== null && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "12px",
              fontWeight: 700,
              color: deltaPositive ? "#1F9B68" : "#B93B3B",
              fontVariantNumeric: "tabular-nums",
              backgroundColor: deltaPositive
                ? "rgba(46,204,138,0.12)"
                : "rgba(226,85,85,0.10)",
              border: `1px solid ${deltaPositive ? "rgba(46,204,138,0.30)" : "rgba(226,85,85,0.30)"}`,
              padding: "2px 8px",
              borderRadius: "999px",
            }}
          >
            {deltaPositive ? (
              <TrendingUp size={11} strokeWidth={2.5} aria-hidden="true" />
            ) : (
              <TrendingDown size={11} strokeWidth={2.5} aria-hidden="true" />
            )}
            {delta}
          </span>
        )}
        {hint && (
          <span style={{ fontSize: "12px", color: "#475569" }}>{hint}</span>
        )}
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  ClientChip — compact status pill                                   */
/* ------------------------------------------------------------------ */

export function ClientChip({
  children,
  accent = "blue",
  icon: Icon,
}: {
  children: React.ReactNode
  accent?: ClientAccent
  icon?: LucideIcon
}) {
  const a = resolveAccent(accent)
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontFamily: FONT,
        fontSize: "11px",
        fontWeight: 700,
        color: a.text,
        backgroundColor: a.soft,
        border: `1px solid ${a.strong}33`,
        padding: "3px 10px",
        borderRadius: "999px",
        letterSpacing: "0.04em",
      }}
    >
      {Icon && <Icon size={11} strokeWidth={2.5} aria-hidden="true" />}
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  ClientEmpty — empty state with icon + message + optional action    */
/* ------------------------------------------------------------------ */

export function ClientEmpty({
  icon: Icon,
  title,
  description,
  action,
  accent = "blue",
}: {
  icon?: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  accent?: ClientAccent
}) {
  const a = resolveAccent(accent)
  return (
    <div
      style={{
        textAlign: "center",
        padding: "48px 24px",
        borderRadius: "16px",
        background:
          "linear-gradient(180deg, rgba(247,249,255,0.5) 0%, rgba(247,249,255,1) 100%)",
        border: "1px dashed #D8DFED",
      }}
    >
      {Icon && (
        <div
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "56px",
            height: "56px",
            borderRadius: "16px",
            background: `linear-gradient(135deg, ${a.strong}22 0%, ${a.strong}0A 100%)`,
            border: `1px solid ${a.strong}33`,
            color: a.text,
            marginBottom: "16px",
          }}
        >
          <Icon size={24} strokeWidth={1.8} />
        </div>
      )}
      <div
        style={{
          fontFamily: FONT,
          fontSize: "16px",
          fontWeight: 700,
          color: "#0B0F2E",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </div>
      {description && (
        <div
          style={{
            marginTop: "6px",
            maxWidth: "520px",
            marginInline: "auto",
            fontSize: "13px",
            color: "#475569",
            lineHeight: 1.6,
          }}
        >
          {description}
        </div>
      )}
      {action && <div style={{ marginTop: "16px" }}>{action}</div>}
    </div>
  )
}
