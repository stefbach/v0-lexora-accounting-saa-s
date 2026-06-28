"use client"

/**
 * LiveEconomicWidget — real-time economic + HR indicators relevant to
 * a Mauritian SMB running Lexora. Pulls /api/public/economic-snapshot
 * (cached 1h at the edge) and renders:
 *   - FX rates (MUR → EUR, USD, GBP, …)
 *   - Statistics Mauritius inflation rate
 *   - Bank of Mauritius key rate
 *   - Next MRA / ROC deadlines with days-until countdown
 *   - HR ticker (SMIC, CSG, NSF, PAYE, TIBOK)
 *
 * Respects prefers-reduced-motion (no marquee under reduced-motion).
 */

import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import { t } from "@/lib/i18n"
import {
  Globe,
  TrendingUp,
  Landmark,
  CalendarClock,
  Activity,
  AlertCircle,
} from "lucide-react"

type Snapshot = {
  generatedAt: string
  fx: {
    base: string
    source: string
    updatedAt: string | null
    rates: { code: string; label: string; rate: number | null; inverse: number | null }[]
  }
  inflation: { label: string; value: number; unit: string; period: string; source: string }
  bomRate: { label: string; value: number; unit: string; period: string; source: string }
  deadlines: { label: string; date: string; daysUntil: number; category: "MRA" | "ROC" | "WRA" }[]
  hrTicker: { label: string; detail: string; accent: "blue" | "gold" | "green" }[]
}

const ACCENTS = {
  blue: "#4191FF",
  gold: "#D4AF37",
  green: "#2ECC8A",
} as const

function formatInverseRate(n: number | null, code: string): string {
  if (n === null) return "—"
  return `1 ${code} = ${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} MUR`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

export function LiveEconomicWidget({
  locale = "fr",
  variant = "dark",
}: {
  locale?: "fr" | "en"
  variant?: "dark" | "light"
}) {
  const [data, setData] = React.useState<Snapshot | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const prefersReducedMotion = useReducedMotion()

  React.useEffect(() => {
    let cancelled = false
    fetch("/api/public/economic-snapshot")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<Snapshot>
      })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const isDark = variant === "dark"
  const bg = isDark ? "transparent" : "#FFFFFF"
  const cardBg = isDark ? "rgba(16,24,71,0.70)" : "#FFFFFF"
  const border = isDark ? "rgba(30,39,96,0.9)" : "#D8DFED"
  const textStrong = isDark ? "#E8EAFC" : "#0B0F2E"
  const textMuted = isDark ? "#A8AFC7" : "#475569"

  if (error) {
    return (
      <div style={{ padding: "20px", color: textMuted, textAlign: "center", fontSize: "13px" }}>
        <AlertCircle size={14} style={{ verticalAlign: "middle", marginRight: "6px" }} />
        {t("uimkt.eco.unavailable", locale)}
      </div>
    )
  }

  if (!data) {
    return (
      <div
        aria-hidden="true"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: "92px",
              borderRadius: "14px",
              backgroundColor: cardBg,
              border: `1px solid ${border}`,
              opacity: 0.6,
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      style={{
        fontFamily: "'Poppins', sans-serif",
        background: bg,
        color: textStrong,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "16px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "34px",
              height: "34px",
              borderRadius: "10px",
              background: `linear-gradient(135deg, ${ACCENTS.blue}1A 0%, ${ACCENTS.gold}1A 100%)`,
              border: `1px solid ${ACCENTS.blue}40`,
              color: ACCENTS.blue,
            }}
          >
            <Activity size={16} strokeWidth={1.8} />
          </span>
          <div>
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: ACCENTS.blue,
              }}
            >
              {t("uimkt.eco.live_indicators", locale)}
            </div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: textStrong }}>
              {t("uimkt.eco.context", locale)}
            </div>
          </div>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "11px",
            color: textMuted,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: ACCENTS.green,
              boxShadow: `0 0 8px ${ACCENTS.green}`,
            }}
          />
          {t("uimkt.eco.updated", locale)}{" "}
          {formatDate(data.generatedAt)}
        </span>
      </div>

      {/* FX grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
          marginBottom: "18px",
        }}
      >
        {data.fx.rates.map((r, i) => (
          <motion.div
            key={r.code}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.35, delay: i * 0.05 }}
            style={{
              backgroundColor: cardBg,
              border: `1px solid ${border}`,
              borderRadius: "14px",
              padding: "14px 16px",
              boxShadow: isDark
                ? "0 10px 30px -18px rgba(0,0,0,0.45)"
                : "0 1px 2px rgba(15,23,42,0.04), 0 12px 24px -16px rgba(15,23,42,0.12)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: ACCENTS.gold,
                  letterSpacing: "0.08em",
                }}
              >
                <Globe size={12} strokeWidth={2} aria-hidden="true" />
                {r.code}
              </span>
              <span style={{ fontSize: "10px", color: textMuted }}>
                MUR ↔ {r.code}
              </span>
            </div>
            <div
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: textStrong,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.01em",
              }}
            >
              {formatInverseRate(r.inverse, r.code)}
            </div>
            <div style={{ fontSize: "11px", color: textMuted, marginTop: "2px" }}>
              {r.label}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Inflation + BoM rate */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "12px",
          marginBottom: "18px",
        }}
      >
        <IndicatorCard
          icon={<TrendingUp size={14} strokeWidth={2} aria-hidden="true" />}
          label={data.inflation.label}
          value={`${data.inflation.value.toFixed(1)}${data.inflation.unit}`}
          meta={`${data.inflation.period} · ${data.inflation.source}`}
          accent={ACCENTS.blue}
          cardBg={cardBg}
          border={border}
          textStrong={textStrong}
          textMuted={textMuted}
          isDark={isDark}
        />
        <IndicatorCard
          icon={<Landmark size={14} strokeWidth={2} aria-hidden="true" />}
          label={data.bomRate.label}
          value={`${data.bomRate.value.toFixed(2)}${data.bomRate.unit}`}
          meta={`${data.bomRate.period} · ${data.bomRate.source}`}
          accent={ACCENTS.gold}
          cardBg={cardBg}
          border={border}
          textStrong={textStrong}
          textMuted={textMuted}
          isDark={isDark}
        />
      </div>

      {/* Deadlines */}
      <div
        style={{
          backgroundColor: cardBg,
          border: `1px solid ${border}`,
          borderRadius: "14px",
          padding: "16px 18px",
          marginBottom: "18px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "10px",
          }}
        >
          <CalendarClock size={14} color={ACCENTS.blue} strokeWidth={2} aria-hidden="true" />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: textStrong,
            }}
          >
            {t("uimkt.eco.next_deadlines", locale)}
          </span>
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "8px" }}>
          {data.deadlines.map((d) => (
            <li
              key={d.label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                fontSize: "13px",
              }}
            >
              <span style={{ color: textStrong, fontWeight: 500 }}>{d.label}</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  color: textMuted,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span>{formatDate(d.date)}</span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: d.daysUntil <= 7 ? "#E8A84C" : ACCENTS.green,
                    backgroundColor: d.daysUntil <= 7 ? "rgba(232,168,76,0.12)" : "rgba(46,204,138,0.12)",
                    border: `1px solid ${d.daysUntil <= 7 ? "rgba(232,168,76,0.35)" : "rgba(46,204,138,0.35)"}`,
                    padding: "2px 8px",
                    borderRadius: "999px",
                  }}
                >
                  J−{d.daysUntil}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* HR ticker — marquee or static */}
      <div
        aria-label={t("uimkt.eco.hr_aria", locale)}
        style={{
          overflow: "hidden",
          maskImage:
            "linear-gradient(90deg, transparent 0%, black 10%, black 90%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(90deg, transparent 0%, black 10%, black 90%, transparent 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "14px",
            width: prefersReducedMotion ? "auto" : "max-content",
            flexWrap: prefersReducedMotion ? "wrap" : "nowrap",
            animation: prefersReducedMotion
              ? undefined
              : "lexora-hr-ticker 44s linear infinite",
          }}
        >
          {(prefersReducedMotion
            ? data.hrTicker
            : [...data.hrTicker, ...data.hrTicker]
          ).map((h, i) => {
            const c = ACCENTS[h.accent]
            return (
              <span
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  backgroundColor: isDark ? "rgba(232,234,252,0.04)" : "#F7F9FF",
                  border: `1px solid ${c}35`,
                  padding: "10px 16px",
                  borderRadius: "999px",
                  whiteSpace: "nowrap",
                  fontSize: "12px",
                  color: textStrong,
                  fontWeight: 500,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor: c,
                    boxShadow: `0 0 6px ${c}`,
                  }}
                />
                <strong style={{ color: c }}>{h.label}</strong>
                <span style={{ color: textMuted }}>· {h.detail}</span>
              </span>
            )
          })}
        </div>
        <style jsx>{`
          @keyframes lexora-hr-ticker {
            from { transform: translateX(0); }
            to   { transform: translateX(-50%); }
          }
        `}</style>
      </div>
    </div>
  )
}

function IndicatorCard({
  icon,
  label,
  value,
  meta,
  accent,
  cardBg,
  border,
  textStrong,
  textMuted,
  isDark,
}: {
  icon: React.ReactNode
  label: string
  value: string
  meta: string
  accent: string
  cardBg: string
  border: string
  textStrong: string
  textMuted: string
  isDark: boolean
}) {
  return (
    <div
      style={{
        backgroundColor: cardBg,
        border: `1px solid ${border}`,
        borderRadius: "14px",
        padding: "14px 16px",
        boxShadow: isDark
          ? "0 10px 30px -18px rgba(0,0,0,0.45)"
          : "0 1px 2px rgba(15,23,42,0.04), 0 12px 24px -16px rgba(15,23,42,0.12)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "6px",
        }}
      >
        <span style={{ color: accent, display: "inline-flex", alignItems: "center" }}>
          {icon}
        </span>
        <span style={{ fontSize: "11px", color: textMuted, fontWeight: 500 }}>{label}</span>
      </div>
      <div
        style={{
          fontSize: "22px",
          fontWeight: 700,
          color: textStrong,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "11px", color: textMuted }}>{meta}</div>
    </div>
  )
}
