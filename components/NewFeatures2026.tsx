"use client"

/**
 * NewFeatures2026 — premium reel showcasing the 2026 wave of new
 * capabilities. Mixes editorial-style "release notes" with bold visual
 * tiles.
 */

import * as React from "react"
import { t, type Locale } from "@/lib/i18n"
import { Reveal, StaggerGroup, StaggerItem, HoverLift, ShineSweep } from "@/components/ui/motion"
import {
  Bot,
  Banknote,
  Globe2,
  ShieldCheck,
  HeartPulse,
  Send,
  CalendarClock,
  Sparkles,
  Receipt,
  TrendingUp,
} from "lucide-react"

const FEATURES = [
  {
    icon: Bot,
    badge: "AGENT IA",
    titleKey: "cmkt.nf.f1.title",
    bodyKey: "cmkt.nf.f1.body",
    color: "#4191FF",
    metricKey: "cmkt.nf.f1.metric",
    metricLabelKey: "cmkt.nf.f1.metricLabel",
  },
  {
    icon: Banknote,
    badge: "OPEN BANKING",
    titleKey: "cmkt.nf.f2.title",
    bodyKey: "cmkt.nf.f2.body",
    color: "#D4AF37",
    metricKey: "cmkt.nf.f2.metric",
    metricLabelKey: "cmkt.nf.f2.metricLabel",
  },
  {
    icon: Globe2,
    badge: "MULTI-JURIDICTION",
    titleKey: "cmkt.nf.f3.title",
    bodyKey: "cmkt.nf.f3.body",
    color: "#2ECC8A",
    metricKey: "cmkt.nf.f3.metric",
    metricLabelKey: "cmkt.nf.f3.metricLabel",
  },
  {
    icon: ShieldCheck,
    badge: "GBC · OFFSHORE",
    titleKey: "cmkt.nf.f4.title",
    bodyKey: "cmkt.nf.f4.body",
    color: "#4191FF",
    metricKey: "cmkt.nf.f4.metric",
    metricLabelKey: "cmkt.nf.f4.metricLabel",
  },
  {
    icon: TrendingUp,
    badge: "IFRS · CREDIT",
    titleKey: "cmkt.nf.f5.title",
    bodyKey: "cmkt.nf.f5.body",
    color: "#D4AF37",
    metricKey: "cmkt.nf.f5.metric",
    metricLabelKey: "cmkt.nf.f5.metricLabel",
  },
  {
    icon: Send,
    badge: "CHIEF OF STAFF",
    titleKey: "cmkt.nf.f6.title",
    bodyKey: "cmkt.nf.f6.body",
    color: "#2ECC8A",
    metricKey: "cmkt.nf.f6.metric",
    metricLabelKey: "cmkt.nf.f6.metricLabel",
  },
  {
    icon: CalendarClock,
    badge: "AUTOMATION",
    titleKey: "cmkt.nf.f7.title",
    bodyKey: "cmkt.nf.f7.body",
    color: "#4191FF",
    metricKey: "cmkt.nf.f7.metric",
    metricLabelKey: "cmkt.nf.f7.metricLabel",
  },
  {
    icon: Receipt,
    badge: "FACTURATION",
    titleKey: "cmkt.nf.f8.title",
    bodyKey: "cmkt.nf.f8.body",
    color: "#D4AF37",
    metricKey: "cmkt.nf.f8.metric",
    metricLabelKey: "cmkt.nf.f8.metricLabel",
  },
  {
    icon: HeartPulse,
    badge: "EXCLUSIF",
    titleKey: "cmkt.nf.f9.title",
    bodyKey: "cmkt.nf.f9.body",
    color: "#2ECC8A",
    metricKey: "cmkt.nf.f9.metric",
    metricLabelKey: "cmkt.nf.f9.metricLabel",
  },
]

export function NewFeatures2026({ locale = "fr" }: { locale?: Locale }) {
  return (
    <section
      id="new-2026"
      className="relative overflow-hidden py-20 md:py-28"
      style={{
        background:
          "linear-gradient(180deg, #F8F9FC 0%, #FFFFFF 50%, #F8F9FC 100%)",
      }}
    >
      {/* Soft ambient */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 50% 40% at 80% 10%, rgba(212,175,55,0.10) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 10% 90%, rgba(65,145,255,0.10) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mb-14 text-center">
          <span
            className="mb-6 inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{
              background:
                "linear-gradient(135deg, rgba(212,175,55,0.10) 0%, rgba(65,145,255,0.10) 100%)",
              color: "#D4AF37",
              border: "1px solid rgba(212,175,55,0.30)",
              fontFamily: "'Poppins', sans-serif",
              boxShadow: "0 4px 12px -4px rgba(212,175,55,0.25)",
            }}
          >
            <span className="relative flex h-2 w-2">
              <span
                className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full opacity-75"
                style={{ backgroundColor: "#D4AF37" }}
              />
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ backgroundColor: "#D4AF37" }}
              />
            </span>
            {t("cmkt.nf.eyebrow", locale)}
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
            {t("cmkt.nf.heading.pre", locale)}{" "}
            <span
              style={{
                backgroundImage:
                  "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {t("cmkt.nf.heading.accent", locale)}
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
            {t("cmkt.nf.subtitle", locale)}
          </p>
        </Reveal>

        <StaggerGroup className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" staggerMs={65}>
          {FEATURES.map((f) => (
            <StaggerItem key={f.titleKey}>
              <HoverLift lift={8} className="h-full">
                <article
                  className="group relative flex h-full flex-col overflow-hidden rounded-2xl p-7"
                  style={{
                    background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
                    border: "1px solid #D8DFED",
                    boxShadow:
                      "0 1px 2px rgba(15,23,42,0.05), 0 24px 48px -24px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.9)",
                  }}
                >
                  {/* Top accent stripe */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-1"
                    style={{
                      background: `linear-gradient(90deg, transparent 0%, ${f.color} 15%, ${f.color} 85%, transparent 100%)`,
                      opacity: 0.9,
                    }}
                  />
                  {/* Ambient hover glow */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{ background: `radial-gradient(circle, ${f.color}33 0%, transparent 70%)` }}
                  />
                  <ShineSweep color={`${f.color}20`} duration={5} />

                  <div className="relative mb-5 flex items-start justify-between gap-3">
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-500 group-hover:scale-105"
                      style={{
                        background: `linear-gradient(135deg, ${f.color}26 0%, ${f.color}10 100%)`,
                        border: `1px solid ${f.color}55`,
                        boxShadow: `0 14px 32px -10px ${f.color}70`,
                      }}
                    >
                      <f.icon className="h-7 w-7" style={{ color: f.color }} strokeWidth={1.8} />
                    </div>
                    <span
                      className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]"
                      style={{
                        backgroundColor: `${f.color}14`,
                        color: f.color,
                        border: `1px solid ${f.color}33`,
                        fontFamily: "'Poppins', sans-serif",
                      }}
                    >
                      {f.badge}
                    </span>
                  </div>

                  <h3
                    className="mb-3 text-lg font-bold leading-tight md:text-xl"
                    style={{
                      color: "#0B0F2E",
                      fontFamily: "'Poppins', sans-serif",
                      fontWeight: 700,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {t(f.titleKey, locale)}
                  </h3>
                  <p
                    className="flex-1 text-sm"
                    style={{
                      color: "#475569",
                      fontFamily: "'Poppins', sans-serif",
                      fontWeight: 400,
                      lineHeight: 1.65,
                    }}
                  >
                    {t(f.bodyKey, locale)}
                  </p>

                  <div
                    className="mt-5 flex items-center justify-between pt-4"
                    style={{ borderTop: "1px dashed #D8DFED" }}
                  >
                    <div>
                      <div
                        className="text-xl font-bold"
                        style={{
                          color: f.color,
                          fontFamily: "'Poppins', sans-serif",
                          fontVariantNumeric: "tabular-nums",
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {t(f.metricKey, locale)}
                      </div>
                      <div
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{
                          color: "#94A3B8",
                          fontFamily: "'Poppins', sans-serif",
                        }}
                      >
                        {t(f.metricLabelKey, locale)}
                      </div>
                    </div>
                    <Sparkles className="h-4 w-4" style={{ color: f.color }} />
                  </div>
                </article>
              </HoverLift>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  )
}
