"use client"

/**
 * DashboardPreview — simulated Lexora dashboard with permanently
 * animating mini-charts and live counters. Acts as the hero's "real
 * visual" so the product feels tangible.
 *
 * All animation is opacity/transform on SVG primitives — GPU friendly
 * and CLS-safe. Respects prefers-reduced-motion.
 */

import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import {
  TrendingUp,
  Sparkles,
  FileCheck2,
  Wallet,
  BellRing,
  Brain,
} from "lucide-react"

// Deterministic bar data so SSR + client match.
const BARS = [18, 34, 28, 52, 44, 68, 60, 78, 74, 90, 82, 96]
const LINE_POINTS = [
  { x: 0, y: 72 },
  { x: 24, y: 60 },
  { x: 48, y: 66 },
  { x: 72, y: 44 },
  { x: 96, y: 52 },
  { x: 120, y: 36 },
  { x: 144, y: 28 },
  { x: 168, y: 20 },
  { x: 192, y: 16 },
]

const LINE_PATH = LINE_POINTS
  .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
  .join(" ")

const LINE_AREA = `${LINE_PATH} L 192 96 L 0 96 Z`

export function DashboardPreview({
  locale = "fr",
  className,
}: {
  locale?: "fr" | "en"
  className?: string
}) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "560px",
        marginInline: "auto",
      }}
    >
      {/* Ambient glow behind the frame */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "-32px",
          borderRadius: "36px",
          background:
            "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(65,145,255,0.18) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Main dashboard frame */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: "relative",
          backgroundColor: "#101847",
          border: "1px solid rgba(65,145,255,0.28)",
          borderRadius: "20px",
          padding: "18px",
          boxShadow:
            "0 40px 80px -30px rgba(65,145,255,0.25), 0 0 0 1px rgba(212,175,55,0.10), inset 0 1px 0 rgba(255,255,255,0.04)",
          fontFamily: "'Poppins', sans-serif",
        }}
      >
        {/* Window chrome */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "14px",
          }}
        >
          <div style={{ display: "flex", gap: "6px" }} aria-hidden="true">
            {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
              <span
                key={c}
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: c,
                  opacity: 0.8,
                }}
              />
            ))}
          </div>
          <div
            style={{
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#A8AFC7",
            }}
          >
            Lexora · Dashboard
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "9px",
              fontWeight: 700,
              color: "#D4AF37",
              backgroundColor: "rgba(212,175,55,0.10)",
              border: "1px solid rgba(212,175,55,0.28)",
              padding: "2px 8px",
              borderRadius: "999px",
            }}
          >
            <Brain size={10} aria-hidden="true" />
            LIVE
          </div>
        </div>

        {/* KPI row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
            marginBottom: "12px",
          }}
        >
          <LiveKPI
            icon={<Wallet size={14} strokeWidth={1.8} aria-hidden="true" />}
            label={locale === "fr" ? "Revenus du mois" : "Monthly revenue"}
            value="Rs 1,248,560"
            accent="#4191FF"
            delta="+12.4%"
            reducedMotion={!!prefersReducedMotion}
          />
          <LiveKPI
            icon={<FileCheck2 size={14} strokeWidth={1.8} aria-hidden="true" />}
            label={locale === "fr" ? "Factures OCR" : "Invoices processed"}
            value="342"
            accent="#D4AF37"
            delta="+28"
            reducedMotion={!!prefersReducedMotion}
          />
        </div>

        {/* Chart card */}
        <div
          style={{
            position: "relative",
            backgroundColor: "#0B0F2E",
            border: "1px solid rgba(30,39,96,0.9)",
            borderRadius: "14px",
            padding: "14px",
            marginBottom: "12px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <TrendingUp size={12} color="#4191FF" strokeWidth={2} aria-hidden="true" />
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#E8EAFC" }}>
                {locale === "fr" ? "Trésorerie — 12 mois" : "Cashflow — 12 months"}
              </span>
            </div>
            <span
              style={{
                fontSize: "10px",
                fontWeight: 600,
                color: "#D4AF37",
                backgroundColor: "rgba(212,175,55,0.10)",
                padding: "2px 6px",
                borderRadius: "999px",
              }}
            >
              +24%
            </span>
          </div>

          {/* Bar chart */}
          <svg
            viewBox="0 0 240 80"
            preserveAspectRatio="none"
            style={{ width: "100%", height: "64px" }}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="dp-bar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4191FF" />
                <stop offset="100%" stopColor="rgba(65,145,255,0.25)" />
              </linearGradient>
            </defs>
            {BARS.map((h, i) => {
              const x = i * 20 + 2
              const barH = h * 0.72
              return (
                <motion.rect
                  key={i}
                  x={x}
                  y={80 - barH}
                  width={14}
                  height={barH}
                  rx={3}
                  fill="url(#dp-bar)"
                  initial={prefersReducedMotion ? false : { scaleY: 0, transformOrigin: "bottom" }}
                  whileInView={{ scaleY: 1 }}
                  viewport={{ once: true }}
                  transition={{
                    delay: 0.25 + i * 0.04,
                    duration: 0.55,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{ transformBox: "fill-box", transformOrigin: "bottom" }}
                />
              )
            })}
          </svg>
        </div>

        {/* Line chart + agent ticker row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "3fr 2fr",
            gap: "10px",
          }}
        >
          {/* Line chart */}
          <div
            style={{
              backgroundColor: "#0B0F2E",
              border: "1px solid rgba(30,39,96,0.9)",
              borderRadius: "14px",
              padding: "12px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <span style={{ fontSize: "10px", fontWeight: 600, color: "#A8AFC7" }}>
                {locale === "fr" ? "Marge nette" : "Net margin"}
              </span>
              <span style={{ fontSize: "10px", fontWeight: 700, color: "#4191FF" }}>
                32.4%
              </span>
            </div>
            <svg
              viewBox="0 0 192 96"
              preserveAspectRatio="none"
              style={{ width: "100%", height: "56px" }}
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="dp-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(212,175,55,0.30)" />
                  <stop offset="100%" stopColor="rgba(212,175,55,0)" />
                </linearGradient>
              </defs>
              {/* Area fill */}
              <motion.path
                d={LINE_AREA}
                fill="url(#dp-area)"
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.7, duration: 0.6 }}
              />
              {/* Line */}
              <motion.path
                d={LINE_PATH}
                fill="none"
                stroke="#D4AF37"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={prefersReducedMotion ? false : { pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4, duration: 1.2, ease: "easeOut" }}
              />
              {/* Dots */}
              {LINE_POINTS.map((p, i) => (
                <motion.circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={2}
                  fill="#D4AF37"
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5 + i * 0.06, duration: 0.25 }}
                />
              ))}
              {/* Moving pulse dot at the head of the line */}
              {!prefersReducedMotion && (
                <motion.circle
                  r={4}
                  fill="#D4AF37"
                  cx={LINE_POINTS[LINE_POINTS.length - 1].x}
                  cy={LINE_POINTS[LINE_POINTS.length - 1].y}
                  animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.6, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
            </svg>
          </div>

          {/* Agent ticker */}
          <div
            style={{
              backgroundColor: "#0B0F2E",
              border: "1px solid rgba(30,39,96,0.9)",
              borderRadius: "14px",
              padding: "10px 12px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginBottom: "8px",
              }}
            >
              <BellRing size={10} color="#D4AF37" aria-hidden="true" />
              <span style={{ fontSize: "10px", fontWeight: 600, color: "#A8AFC7" }}>
                {locale === "fr" ? "Activité IA" : "AI activity"}
              </span>
            </div>
            <AgentTicker prefersReducedMotion={!!prefersReducedMotion} locale={locale} />
          </div>
        </div>
      </motion.div>

      {/* Floating accent badges */}
      <motion.div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "-14px",
          right: "-14px",
          backgroundColor: "#D4AF37",
          color: "#0B0F2E",
          padding: "8px 12px",
          borderRadius: "999px",
          fontSize: "11px",
          fontWeight: 700,
          fontFamily: "'Poppins', sans-serif",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          boxShadow: "0 10px 30px -8px rgba(212,175,55,0.60)",
        }}
        animate={prefersReducedMotion ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <Sparkles size={12} aria-hidden="true" />
        <span>{locale === "fr" ? "Agents actifs" : "Agents online"}</span>
      </motion.div>

      <motion.div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: "-14px",
          left: "-14px",
          backgroundColor: "#4191FF",
          color: "#FFFFFF",
          padding: "8px 12px",
          borderRadius: "999px",
          fontSize: "11px",
          fontWeight: 700,
          fontFamily: "'Poppins', sans-serif",
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          boxShadow: "0 10px 30px -8px rgba(65,145,255,0.60)",
        }}
        animate={prefersReducedMotion ? undefined : { y: [0, 6, 0] }}
        transition={{ duration: 3.2, delay: 0.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <FileCheck2 size={12} aria-hidden="true" />
        <span>100% MRA</span>
      </motion.div>
    </div>
  )
}

function LiveKPI({
  icon,
  label,
  value,
  accent,
  delta,
  reducedMotion,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent: string
  delta: string
  reducedMotion: boolean
}) {
  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
      style={{
        backgroundColor: "#0B0F2E",
        border: "1px solid rgba(30,39,96,0.9)",
        borderRadius: "14px",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "20px",
            height: "20px",
            borderRadius: "6px",
            backgroundColor: `${accent}22`,
            color: accent,
          }}
        >
          {icon}
        </span>
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            color: accent,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {delta}
        </span>
      </div>
      <div
        style={{
          fontSize: "11px",
          color: "#A8AFC7",
          marginTop: "4px",
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "15px",
          fontWeight: 700,
          color: "#E8EAFC",
          letterSpacing: "-0.01em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </motion.div>
  )
}

function AgentTicker({
  prefersReducedMotion,
  locale,
}: {
  prefersReducedMotion: boolean
  locale: "fr" | "en"
}) {
  const messages =
    locale === "fr"
      ? [
          "OCR · facture #EL-2841",
          "TVA · calcul auto",
          "Paie · 14 bulletins",
          "Réconciliation · 92 lignes",
          "IT Form 3 · prêt",
        ]
      : [
          "OCR · invoice #EL-2841",
          "VAT · auto computed",
          "Payroll · 14 payslips",
          "Reconciliation · 92 rows",
          "IT Form 3 · ready",
        ]
  const [idx, setIdx] = React.useState(0)

  React.useEffect(() => {
    if (prefersReducedMotion) return
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % messages.length)
    }, 2200)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersReducedMotion, messages.length])

  return (
    <div style={{ height: "44px", position: "relative", overflow: "hidden" }}>
      {messages.map((m, i) => {
        const active = i === idx
        return (
          <motion.div
            key={i}
            initial={false}
            animate={{
              opacity: active ? 1 : 0,
              y: active ? 0 : 10,
            }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "10px",
              fontWeight: 600,
              color: "#E8EAFC",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: "#4191FF",
                boxShadow: "0 0 0 3px rgba(65,145,255,0.20)",
              }}
              aria-hidden="true"
            />
            <span>{m}</span>
          </motion.div>
        )
      })}
    </div>
  )
}
