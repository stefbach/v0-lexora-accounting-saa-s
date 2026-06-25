"use client"

/**
 * EcosystemBridge — animated "constellation" section showing how Lexora
 * is wired to every external system (banks, MRA, email, Telegram,
 * Google, Claude). SVG-based to stay lightweight and crisp.
 */

import * as React from "react"
import { t, type Locale } from "@/lib/i18n"
import { Reveal, StaggerGroup, StaggerItem, HoverLift } from "@/components/ui/motion"
import {
  Banknote,
  Landmark,
  Send,
  Mail,
  CalendarDays,
  Brain,
  ShieldCheck,
  Zap,
  RadioTower,
} from "lucide-react"

const BANKS = [
  { code: "MCB", color: "#E61E2A" },
  { code: "SBM", color: "#0A5BAE" },
  { code: "ABC", color: "#0E7C61" },
  { code: "MauBank", color: "#F39200" },
  { code: "MyT", color: "#E20177" },
  { code: "AfrAsia", color: "#0096D6" },
  { code: "Bank One", color: "#D4AF37" },
]

const INTEGRATIONS = [
  {
    icon: Banknote,
    titleKey: "cmkt.eco.int_banks_title",
    bodyKey: "cmkt.eco.int_banks_body",
    color: "#4191FF",
    tag: "Open Banking",
  },
  {
    icon: Landmark,
    titleKey: "cmkt.eco.int_mra_title",
    bodyKey: "cmkt.eco.int_mra_body",
    color: "#D4AF37",
    tag: "100% MRA",
  },
  {
    icon: Send,
    titleKey: "cmkt.eco.int_telegram_title",
    bodyKey: "cmkt.eco.int_telegram_body",
    color: "#2ECC8A",
    tag: "Chief of Staff",
  },
  {
    icon: Mail,
    titleKey: "cmkt.eco.int_email_title",
    bodyKey: "cmkt.eco.int_email_body",
    color: "#4191FF",
    tag: "3 providers",
  },
  {
    icon: CalendarDays,
    titleKey: "cmkt.eco.int_gcal_title",
    bodyKey: "cmkt.eco.int_gcal_body",
    color: "#D4AF37",
    tag: "OAuth 2.0",
  },
  {
    icon: Brain,
    titleKey: "cmkt.eco.int_claude_title",
    bodyKey: "cmkt.eco.int_claude_body",
    color: "#2ECC8A",
    tag: "Anthropic native",
  },
]

export function EcosystemBridge({ locale = "fr" }: { locale?: Locale }) {
  return (
    <section
      id="ecosystem"
      className="relative overflow-hidden py-20 md:py-28"
      style={{
        background:
          "linear-gradient(180deg, #FFFFFF 0%, #F4F7FC 50%, #FFFFFF 100%)",
      }}
    >
      {/* Soft dot grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(65,145,255,0.12) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage:
            "radial-gradient(ellipse 60% 50% at 50% 50%, black 20%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 60% 50% at 50% 50%, black 20%, transparent 75%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mb-16 text-center">
          <span
            className="mb-6 inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{
              background:
                "linear-gradient(135deg, rgba(65,145,255,0.10) 0%, rgba(212,175,55,0.10) 100%)",
              color: "#2A6FCC",
              border: "1px solid rgba(65,145,255,0.25)",
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            <RadioTower className="h-3.5 w-3.5" />
            {t("cmkt.eco.badge", locale)}
          </span>
          <h2
            className="mb-5 text-4xl font-bold tracking-tight md:text-6xl"
            style={{
              color: "#0B0F2E",
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            {t("cmkt.eco.title_lead", locale)}{" "}
            <span
              style={{
                backgroundImage:
                  "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {t("cmkt.eco.title_accent", locale)}
            </span>
          </h2>
          <p
            className="mx-auto max-w-2xl text-base md:text-lg"
            style={{
              color: "#475569",
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 400,
              lineHeight: 1.7,
            }}
          >
            {t("cmkt.eco.subtitle", locale)}
          </p>
        </Reveal>

        {/* BANKS RING — visual showcase */}
        <Reveal className="mx-auto mb-16 max-w-4xl">
          <div
            className="relative overflow-hidden rounded-3xl px-6 py-10 md:px-12 md:py-14"
            style={{
              background: "linear-gradient(135deg, #0B0F2E 0%, #101847 100%)",
              border: "1px solid rgba(212,175,55,0.22)",
              boxShadow:
                "0 30px 80px -30px rgba(65,145,255,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            {/* Glow */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 50% 60% at 50% 100%, rgba(65,145,255,0.25) 0%, transparent 70%)",
              }}
            />
            <div className="relative text-center">
              <div
                className="mb-3 text-[11px] font-bold uppercase tracking-widest"
                style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}
              >
                {t("cmkt.eco.banks_eyebrow", locale)}
              </div>
              <h3
                className="mb-7 text-2xl font-bold md:text-3xl"
                style={{
                  color: "#E8EAFC",
                  fontFamily: "'Poppins', sans-serif",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                }}
              >
                {t("cmkt.eco.banks_heading", locale)}
              </h3>

              <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
                {BANKS.map((b) => (
                  <div
                    key={b.code}
                    className="rounded-2xl px-5 py-3 text-sm font-bold transition-transform duration-300 hover:scale-105"
                    style={{
                      backgroundColor: "rgba(232,234,252,0.04)",
                      border: `1px solid ${b.color}55`,
                      color: "#E8EAFC",
                      boxShadow: `0 0 24px ${b.color}33`,
                      fontFamily: "'Poppins', sans-serif",
                      letterSpacing: "0.02em",
                    }}
                  >
                    <span
                      className="mr-2 inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: b.color, boxShadow: `0 0 8px ${b.color}` }}
                    />
                    {b.code}
                  </div>
                ))}
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {[
                  { icon: ShieldCheck, label: t("cmkt.eco.feat_aes", locale) },
                  { icon: Zap, label: t("cmkt.eco.feat_scrape", locale) },
                  { icon: Brain, label: t("cmkt.eco.feat_anomaly", locale) },
                ].map((f) => (
                  <div
                    key={f.label}
                    className="flex items-center justify-center gap-2 rounded-xl px-3 py-2"
                    style={{
                      backgroundColor: "rgba(212,175,55,0.06)",
                      border: "1px solid rgba(212,175,55,0.22)",
                    }}
                  >
                    <f.icon className="h-4 w-4" style={{ color: "#D4AF37" }} />
                    <span
                      className="text-xs"
                      style={{ color: "#E8EAFC", fontFamily: "'Poppins', sans-serif" }}
                    >
                      {f.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>

        {/* INTEGRATIONS GRID */}
        <StaggerGroup className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" staggerMs={70}>
          {INTEGRATIONS.map((it, i) => (
            <StaggerItem key={it.titleKey}>
              <HoverLift lift={6} className="h-full">
                <article
                  className="group relative h-full overflow-hidden rounded-2xl p-7"
                  style={{
                    background:
                      "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
                    border: "1px solid #D8DFED",
                    boxShadow:
                      "0 1px 2px rgba(15,23,42,0.05), 0 24px 48px -24px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.9)",
                  }}
                >
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-[3px]"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${it.color} 50%, transparent)`,
                    }}
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background: `radial-gradient(circle, ${it.color}25 0%, transparent 70%)`,
                    }}
                  />

                  <div className="mb-5 flex items-center justify-between">
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-500 group-hover:scale-105"
                      style={{
                        background: `linear-gradient(135deg, ${it.color}26 0%, ${it.color}10 100%)`,
                        border: `1px solid ${it.color}55`,
                        boxShadow: `0 14px 32px -10px ${it.color}70`,
                      }}
                    >
                      <it.icon className="h-7 w-7" style={{ color: it.color }} strokeWidth={1.8} />
                    </div>
                    <span
                      className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
                      style={{
                        backgroundColor: `${it.color}14`,
                        color: it.color,
                        border: `1px solid ${it.color}33`,
                        fontFamily: "'Poppins', sans-serif",
                      }}
                    >
                      {it.tag}
                    </span>
                  </div>

                  <h3
                    className="mb-3 text-xl font-bold"
                    style={{
                      color: "#0B0F2E",
                      fontFamily: "'Poppins', sans-serif",
                      fontWeight: 700,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {t(it.titleKey, locale)}
                  </h3>
                  <p
                    className="text-sm"
                    style={{
                      color: "#475569",
                      fontFamily: "'Poppins', sans-serif",
                      fontWeight: 400,
                      lineHeight: 1.65,
                    }}
                  >
                    {t(it.bodyKey, locale)}
                  </p>
                </article>
              </HoverLift>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  )
}
