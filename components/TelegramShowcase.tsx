"use client"

/**
 * TelegramShowcase — premium section presenting Lexora x Telegram as
 * an executive Chief-of-Staff in your pocket. Layered with a 3D orbit
 * scene and a rich capability matrix split by domain.
 */

import * as React from "react"
import Link from "next/link"
import { t, type Locale } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Reveal, StaggerGroup, StaggerItem, FadeSlide, HoverLift } from "@/components/ui/motion"
import { TelegramOrbit3DLazy } from "@/components/3d/TelegramOrbit3DLoader"
import {
  Mic,
  Camera,
  Receipt,
  CalendarDays,
  Mail,
  Banknote,
  Users2,
  FileSignature,
  Brain,
  Plane,
  Clock,
  Building2,
  ArrowRight,
  Send,
  Sparkles,
} from "lucide-react"

const STORIES = [
  { icon: Mic, titleKey: "cmkt.tg.story1_title", bodyKey: "cmkt.tg.story1_body", accent: "#4191FF" },
  { icon: Camera, titleKey: "cmkt.tg.story2_title", bodyKey: "cmkt.tg.story2_body", accent: "#D4AF37" },
  { icon: Banknote, titleKey: "cmkt.tg.story3_title", bodyKey: "cmkt.tg.story3_body", accent: "#2ECC8A" },
  { icon: Plane, titleKey: "cmkt.tg.story4_title", bodyKey: "cmkt.tg.story4_body", accent: "#4191FF" },
  { icon: CalendarDays, titleKey: "cmkt.tg.story5_title", bodyKey: "cmkt.tg.story5_body", accent: "#D4AF37" },
  { icon: Mail, titleKey: "cmkt.tg.story6_title", bodyKey: "cmkt.tg.story6_body", accent: "#2ECC8A" },
]

const TOOLS = [
  { icon: Receipt, titleKey: "cmkt.tg.tool1_title", itemKeys: ["cmkt.tg.tool1_i1", "cmkt.tg.tool1_i2", "cmkt.tg.tool1_i3", "cmkt.tg.tool1_i4"] },
  { icon: Banknote, titleKey: "cmkt.tg.tool2_title", itemKeys: ["cmkt.tg.tool2_i1", "cmkt.tg.tool2_i2", "cmkt.tg.tool2_i3", "cmkt.tg.tool2_i4"] },
  { icon: Users2, titleKey: "cmkt.tg.tool3_title", itemKeys: ["cmkt.tg.tool3_i1", "cmkt.tg.tool3_i2", "cmkt.tg.tool3_i3", "cmkt.tg.tool3_i4"] },
  { icon: Plane, titleKey: "cmkt.tg.tool4_title", itemKeys: ["cmkt.tg.tool4_i1", "cmkt.tg.tool4_i2", "cmkt.tg.tool4_i3", "cmkt.tg.tool4_i4"] },
  { icon: CalendarDays, titleKey: "cmkt.tg.tool5_title", itemKeys: ["cmkt.tg.tool5_i1", "cmkt.tg.tool5_i2", "cmkt.tg.tool5_i3", "cmkt.tg.tool5_i4"] },
  { icon: Mail, titleKey: "cmkt.tg.tool6_title", itemKeys: ["cmkt.tg.tool6_i1", "cmkt.tg.tool6_i2", "cmkt.tg.tool6_i3", "cmkt.tg.tool6_i4"] },
  { icon: FileSignature, titleKey: "cmkt.tg.tool7_title", itemKeys: ["cmkt.tg.tool7_i1", "cmkt.tg.tool7_i2", "cmkt.tg.tool7_i3", "cmkt.tg.tool7_i4"] },
  { icon: Brain, titleKey: "cmkt.tg.tool8_title", itemKeys: ["cmkt.tg.tool8_i1", "cmkt.tg.tool8_i2", "cmkt.tg.tool8_i3", "cmkt.tg.tool8_i4"] },
  { icon: Building2, titleKey: "cmkt.tg.tool9_title", itemKeys: ["cmkt.tg.tool9_i1", "cmkt.tg.tool9_i2", "cmkt.tg.tool9_i3", "cmkt.tg.tool9_i4"] },
]


export function TelegramShowcase({ locale = "fr" }: { locale?: Locale }) {
  return (
    <section
      id="telegram"
      className="relative overflow-hidden py-20 md:py-28"
      style={{
        background:
          "linear-gradient(180deg, #0B0F2E 0%, #101847 50%, #0B0F2E 100%)",
      }}
    >
      {/* Soft cinematic backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 50% at 20% 20%, rgba(65,145,255,0.18) 0%, transparent 65%), radial-gradient(ellipse 55% 50% at 80% 80%, rgba(212,175,55,0.14) 0%, transparent 70%)",
        }}
      />
      {/* Faint grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(232,234,252,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(232,234,252,0.07) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 80%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        {/* TOP — header + 3D orbit */}
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <Reveal>
            <span
              className="mb-5 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-widest"
              style={{
                backgroundColor: "rgba(212,175,55,0.10)",
                color: "#D4AF37",
                borderColor: "rgba(212,175,55,0.30)",
                fontFamily: "'Poppins', sans-serif",
              }}
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              {t("cmkt.tg.badge", locale)}
            </span>
            <h2
              className="mb-5 text-4xl font-bold tracking-tight md:text-6xl"
              style={{
                color: "#E8EAFC",
                fontFamily: "'Poppins', sans-serif",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1.05,
              }}
            >
              {t("cmkt.tg.heading_lead", locale)}{" "}
              <span
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {t("cmkt.tg.heading_from", locale)} Telegram
              </span>
            </h2>
            <p
              className="mb-7 text-base md:text-lg"
              style={{
                color: "#A8AFC7",
                fontFamily: "'Poppins', sans-serif",
                fontWeight: 400,
                lineHeight: 1.7,
                maxWidth: "640px",
              }}
            >
              {t("cmkt.tg.intro", locale)}
            </p>

            <StaggerGroup className="grid grid-cols-2 gap-3 sm:grid-cols-4" staggerMs={60}>
              {[
                { v: "50+", l: t("cmkt.tg.stat_tools", locale) },
                { v: "12", l: t("cmkt.tg.stat_domains", locale) },
                { v: "24/7", l: t("cmkt.tg.stat_available", locale) },
                { v: "FR · EN", l: t("cmkt.tg.stat_voicetext", locale) },
              ].map((s) => (
                <StaggerItem key={s.l}>
                  <div
                    className="rounded-xl px-4 py-3 text-center"
                    style={{
                      backgroundColor: "rgba(232,234,252,0.04)",
                      border: "1px solid rgba(212,175,55,0.22)",
                      fontFamily: "'Poppins', sans-serif",
                    }}
                  >
                    <div
                      className="text-xl font-bold md:text-2xl"
                      style={{ color: "#D4AF37", letterSpacing: "-0.01em" }}
                    >
                      {s.v}
                    </div>
                    <div className="text-[11px] uppercase tracking-widest" style={{ color: "#A8AFC7" }}>
                      {s.l}
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerGroup>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/pilotage-telegram">
                <Button
                  size="lg"
                  className="w-full px-7 text-base font-semibold sm:w-auto"
                  style={{
                    backgroundColor: "#D4AF37",
                    color: "#0B0F2E",
                    fontFamily: "'Poppins', sans-serif",
                    fontWeight: 700,
                    borderRadius: "8px",
                  }}
                >
                  {t("cmkt.tg.cta_demo", locale)}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="#telegram-tools">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full px-7 text-base font-semibold sm:w-auto"
                  style={{
                    border: "1px solid rgba(65,145,255,0.45)",
                    color: "#E8EAFC",
                    backgroundColor: "rgba(232,234,252,0.04)",
                    fontFamily: "'Poppins', sans-serif",
                    fontWeight: 500,
                    borderRadius: "8px",
                  }}
                >
                  {t("cmkt.tg.cta_tools", locale)}
                </Button>
              </a>
            </div>
          </Reveal>

          {/* 3D scene */}
          <FadeSlide delay={0.2} y={24}>
            <div
              className="relative mx-auto w-full"
              style={{
                borderRadius: "28px",
                padding: "16px",
                background:
                  "linear-gradient(135deg, rgba(65,145,255,0.10) 0%, rgba(212,175,55,0.08) 100%)",
                border: "1px solid rgba(212,175,55,0.22)",
                boxShadow:
                  "0 40px 100px -40px rgba(65,145,255,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            >
              <TelegramOrbit3DLazy height={520} />
              <div
                className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
                style={{
                  backgroundColor: "rgba(11,15,46,0.75)",
                  color: "#D4AF37",
                  border: "1px solid rgba(212,175,55,0.35)",
                  fontFamily: "'Poppins', sans-serif",
                }}
              >
                <Sparkles className="inline h-3 w-3 mr-1" />
                {t("cmkt.tg.orbit_badge", locale)}
              </div>
            </div>
          </FadeSlide>
        </div>

        {/* STORIES — 6 immersive use cases */}
        <Reveal className="mt-20 mb-10 text-center">
          <span
            className="mb-4 inline-block text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}
          >
            {t("cmkt.tg.stories_eyebrow", locale)}
          </span>
          <h3
            className="text-3xl font-bold md:text-4xl"
            style={{
              color: "#E8EAFC",
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {t("cmkt.tg.stories_heading", locale)}
          </h3>
        </Reveal>

        <StaggerGroup className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" staggerMs={70}>
          {STORIES.map((s) => (
            <StaggerItem key={s.titleKey}>
              <HoverLift lift={6} className="h-full">
                <article
                  className="group relative h-full overflow-hidden rounded-2xl p-7"
                  style={{
                    backgroundColor: "rgba(16,24,71,0.65)",
                    border: `1px solid ${s.accent}40`,
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                  }}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background: `radial-gradient(circle, ${s.accent}35 0%, transparent 70%)`,
                    }}
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-[2px]"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${s.accent} 50%, transparent)`,
                    }}
                  />
                  <div
                    className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: `${s.accent}1A`,
                      border: `1px solid ${s.accent}55`,
                      boxShadow: `0 0 24px ${s.accent}35`,
                    }}
                  >
                    <s.icon className="h-6 w-6" style={{ color: s.accent }} strokeWidth={1.8} />
                  </div>
                  <h4
                    className="mb-3 text-xl font-bold"
                    style={{
                      color: "#E8EAFC",
                      fontFamily: "'Poppins', sans-serif",
                      fontWeight: 700,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {t(s.titleKey, locale)}
                  </h4>
                  <p
                    className="text-sm"
                    style={{
                      color: "#A8AFC7",
                      fontFamily: "'Poppins', sans-serif",
                      fontWeight: 400,
                      lineHeight: 1.7,
                    }}
                  >
                    {t(s.bodyKey, locale)}
                  </p>
                </article>
              </HoverLift>
            </StaggerItem>
          ))}
        </StaggerGroup>

        {/* TOOLS — 9 capability tiles */}
        <div id="telegram-tools" />
        <Reveal className="mt-20 mb-10 text-center">
          <h3
            className="mb-3 text-3xl font-bold md:text-4xl"
            style={{
              color: "#E8EAFC",
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {t("cmkt.tg.tools_heading", locale)}
          </h3>
          <p
            className="mx-auto max-w-2xl text-base"
            style={{
              color: "#A8AFC7",
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 400,
              lineHeight: 1.7,
            }}
          >
            {t("cmkt.tg.tools_subtitle", locale)}
          </p>
        </Reveal>

        <StaggerGroup className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" staggerMs={50}>
          {TOOLS.map((tool, i) => {
            const accent = ["#4191FF", "#D4AF37", "#2ECC8A"][i % 3]
            return (
              <StaggerItem key={tool.titleKey}>
                <HoverLift lift={4} className="h-full">
                  <article
                    className="h-full rounded-2xl p-6"
                    style={{
                      backgroundColor: "rgba(11,15,46,0.55)",
                      border: `1px solid ${accent}33`,
                    }}
                  >
                    <div className="mb-4 flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg"
                        style={{
                          backgroundColor: `${accent}1A`,
                          border: `1px solid ${accent}55`,
                        }}
                      >
                        <tool.icon className="h-5 w-5" style={{ color: accent }} strokeWidth={1.8} />
                      </div>
                      <h4
                        className="text-base font-bold"
                        style={{
                          color: "#E8EAFC",
                          fontFamily: "'Poppins', sans-serif",
                          fontWeight: 700,
                        }}
                      >
                        {t(tool.titleKey, locale)}
                      </h4>
                    </div>
                    <ul className="space-y-2">
                      {tool.itemKeys.map((itKey) => (
                        <li
                          key={itKey}
                          className="flex items-start gap-2 text-sm"
                          style={{
                            color: "#A8AFC7",
                            fontFamily: "'Poppins', sans-serif",
                            fontWeight: 400,
                            lineHeight: 1.55,
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className="mt-1.5 inline-block h-1 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: accent }}
                          />
                          {t(itKey, locale)}
                        </li>
                      ))}
                    </ul>
                  </article>
                </HoverLift>
              </StaggerItem>
            )
          })}
        </StaggerGroup>

        {/* INNER CTA */}
        <Reveal className="mt-16 text-center">
          <div
            className="inline-flex items-center gap-3 rounded-full px-5 py-2 text-sm"
            style={{
              backgroundColor: "rgba(46,204,138,0.10)",
              border: "1px solid rgba(46,204,138,0.30)",
              color: "#7CE5B5",
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full opacity-75" style={{ backgroundColor: "#2ECC8A" }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: "#2ECC8A" }} />
            </span>
            <Clock className="h-4 w-4" />
            {t("cmkt.tg.cta_footer", locale)}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
