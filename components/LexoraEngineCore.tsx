"use client"

/**
 * LexoraEngineCore — premium section presenting the accounting brain
 * inside Lexora: PCM canonical, SYSCOHADA (OHADA 17 countries),
 * Full IFRS, GBC compliance, and Claude Code skills + MCP tooling.
 */

import * as React from "react"
import { Reveal, StaggerGroup, StaggerItem, HoverLift } from "@/components/ui/motion"
import { t, type Locale } from "@/lib/i18n"
import {
  Layers,
  Globe,
  BookOpenCheck,
  Building2,
  Scale,
  Sparkles,
  Cpu,
  Network,
  Shield,
} from "lucide-react"

const LAYERS = [
  {
    label: "PCM",
    subKey: "cmkt.eng.layer_pcm_sub",
    bodyKey: "cmkt.eng.layer_pcm_body",
    color: "#4191FF",
  },
  {
    label: "SYSCOHADA",
    subKey: "cmkt.eng.layer_syscohada_sub",
    bodyKey: "cmkt.eng.layer_syscohada_body",
    color: "#D4AF37",
  },
  {
    label: "Full IFRS",
    subKey: "cmkt.eng.layer_ifrs_sub",
    bodyKey: "cmkt.eng.layer_ifrs_body",
    color: "#2ECC8A",
  },
  {
    label: "GBC",
    subKey: "cmkt.eng.layer_gbc_sub",
    bodyKey: "cmkt.eng.layer_gbc_body",
    color: "#4191FF",
  },
]

const SKILLS = [
  {
    icon: BookOpenCheck,
    title: "lexora-ifrs9-ecl",
    bodyKey: "cmkt.eng.skill_ifrs9_body",
  },
  {
    icon: Scale,
    title: "lexora-mra-tds",
    bodyKey: "cmkt.eng.skill_mra_body",
  },
  {
    icon: Network,
    title: "lexora-rapprochement-rules",
    bodyKey: "cmkt.eng.skill_rappro_body",
  },
  {
    icon: Building2,
    title: "lexora-gbc-ifrs-complete",
    bodyKey: "cmkt.eng.skill_gbc_body",
  },
]

const MCP_TOOLS = [
  { label: "get_grand_livre", descKey: "cmkt.eng.mcp_grand_livre_desc" },
  { label: "compute_ifrs9_ecl", descKey: "cmkt.eng.mcp_ifrs9_desc" },
  { label: "mra_declarations", descKey: "cmkt.eng.mcp_mra_desc" },
  { label: "rapprochement_rules", descKey: "cmkt.eng.mcp_rappro_desc" },
  { label: "gbc_consolidation", descKey: "cmkt.eng.mcp_gbc_desc" },
]

export function LexoraEngineCore({ locale = "fr" }: { locale?: Locale }) {
  return (
    <section
      id="engine"
      className="relative overflow-hidden py-20 md:py-28"
      style={{ backgroundColor: "#0B0F2E" }}
    >
      {/* Cinematic backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 50% at 30% 0%, rgba(65,145,255,0.18) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 80% 100%, rgba(212,175,55,0.14) 0%, transparent 70%)",
        }}
      />
      {/* Diagonal lines */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(212,175,55,0.4) 0px, rgba(212,175,55,0.4) 1px, transparent 1px, transparent 24px)",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 80%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mb-14 text-center">
          <span
            className="mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-widest"
            style={{
              backgroundColor: "rgba(212,175,55,0.10)",
              color: "#D4AF37",
              borderColor: "rgba(212,175,55,0.30)",
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            <Cpu className="h-3.5 w-3.5" />
            {t("cmkt.eng.badge", locale)}
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
            {locale === "fr" ? (
              <>
                {t("cmkt.eng.title_pre", locale)}{" "}
                <span
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  {t("cmkt.eng.title_accent", locale)}
                </span>
                {t("cmkt.eng.title_post", locale)}
                <br />
                <span className="text-2xl md:text-4xl font-normal" style={{ color: "#A8AFC7" }}>
                  PCM · SYSCOHADA · Full IFRS · GBC
                </span>
              </>
            ) : (
              <>
                {t("cmkt.eng.title_pre", locale)}{" "}
                <span
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  {t("cmkt.eng.title_accent", locale)}
                </span>
                {t("cmkt.eng.title_post", locale)}
                <br />
                <span className="text-2xl md:text-4xl font-normal" style={{ color: "#A8AFC7" }}>
                  PCM · SYSCOHADA · Full IFRS · GBC
                </span>
              </>
            )}
          </h2>
          <p
            className="mx-auto max-w-2xl text-base md:text-lg"
            style={{
              color: "#A8AFC7",
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 400,
              lineHeight: 1.7,
            }}
          >
            {t("cmkt.eng.intro", locale)}
          </p>
        </Reveal>

        {/* LAYERED ARCHITECTURE — 4 stacked cards */}
        <StaggerGroup className="mb-20 grid gap-4 md:grid-cols-2 lg:grid-cols-4" staggerMs={80}>
          {LAYERS.map((l, i) => (
            <StaggerItem key={l.label}>
              <HoverLift lift={6} className="h-full">
                <article
                  className="group relative h-full overflow-hidden rounded-2xl p-6"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(16,24,71,0.95) 0%, rgba(11,15,46,0.95) 100%)",
                    border: `1px solid ${l.color}40`,
                    backdropFilter: "blur(6px)",
                    WebkitBackdropFilter: "blur(6px)",
                  }}
                >
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-[3px]"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${l.color} 50%, transparent)`,
                    }}
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full opacity-30 transition-opacity duration-500 group-hover:opacity-70"
                    style={{ background: `radial-gradient(circle, ${l.color}40 0%, transparent 70%)` }}
                  />

                  <div className="relative">
                    <div
                      className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
                      style={{
                        backgroundColor: `${l.color}1A`,
                        color: l.color,
                        border: `1px solid ${l.color}55`,
                        fontFamily: "'Poppins', sans-serif",
                      }}
                    >
                      {t("cmkt.eng.layer_word", locale)} {String(i + 1).padStart(2, "0")}
                    </div>
                    <h3
                      className="mb-1 text-2xl font-bold"
                      style={{
                        color: "#E8EAFC",
                        fontFamily: "'Poppins', sans-serif",
                        fontWeight: 700,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {l.label}
                    </h3>
                    <div
                      className="mb-4 text-xs uppercase tracking-widest"
                      style={{ color: l.color, fontFamily: "'Poppins', sans-serif" }}
                    >
                      {t(l.subKey, locale)}
                    </div>
                    <p
                      className="text-sm"
                      style={{
                        color: "#A8AFC7",
                        fontFamily: "'Poppins', sans-serif",
                        fontWeight: 400,
                        lineHeight: 1.65,
                      }}
                    >
                      {t(l.bodyKey, locale)}
                    </p>
                  </div>
                </article>
              </HoverLift>
            </StaggerItem>
          ))}
        </StaggerGroup>

        {/* CLAUDE CODE SKILLS */}
        <Reveal className="mb-10 text-center">
          <span
            className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest"
            style={{
              backgroundColor: "rgba(65,145,255,0.10)",
              color: "#4191FF",
              borderColor: "rgba(65,145,255,0.30)",
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            <Sparkles className="h-3 w-3" />
            Powered by Claude Code · Anthropic
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
            {t("cmkt.eng.skills_title", locale)}
          </h3>
          <p
            className="mx-auto mt-3 max-w-2xl text-base"
            style={{
              color: "#A8AFC7",
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 400,
              lineHeight: 1.7,
            }}
          >
            {t("cmkt.eng.skills_intro", locale)}
          </p>
        </Reveal>

        <StaggerGroup className="mb-12 grid gap-5 md:grid-cols-2" staggerMs={70}>
          {SKILLS.map((s, i) => {
            const accent = i % 2 === 0 ? "#4191FF" : "#D4AF37"
            return (
              <StaggerItem key={s.title}>
                <HoverLift lift={4} className="h-full">
                  <article
                    className="group h-full rounded-2xl p-6"
                    style={{
                      backgroundColor: "rgba(16,24,71,0.65)",
                      border: `1px solid ${accent}33`,
                      backdropFilter: "blur(6px)",
                      WebkitBackdropFilter: "blur(6px)",
                    }}
                  >
                    <div className="mb-4 flex items-center gap-3">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-xl"
                        style={{
                          backgroundColor: `${accent}1A`,
                          border: `1px solid ${accent}55`,
                          boxShadow: `0 0 20px ${accent}25`,
                        }}
                      >
                        <s.icon className="h-5 w-5" style={{ color: accent }} strokeWidth={1.8} />
                      </div>
                      <div>
                        <div
                          className="text-[10px] uppercase tracking-widest"
                          style={{ color: accent, fontFamily: "'Poppins', sans-serif" }}
                        >
                          Claude Skill
                        </div>
                        <div
                          className="font-mono text-base font-bold"
                          style={{ color: "#E8EAFC", fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
                        >
                          {s.title}
                        </div>
                      </div>
                    </div>
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
            )
          })}
        </StaggerGroup>

        {/* MCP TOOLS strip */}
        <Reveal>
          <div
            className="overflow-hidden rounded-2xl p-6 md:p-8"
            style={{
              background:
                "linear-gradient(135deg, rgba(65,145,255,0.08) 0%, rgba(212,175,55,0.08) 100%)",
              border: "1px solid rgba(212,175,55,0.22)",
            }}
          >
            <div className="mb-5 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: "rgba(212,175,55,0.15)",
                    border: "1px solid rgba(212,175,55,0.40)",
                  }}
                >
                  <Layers className="h-5 w-5" style={{ color: "#D4AF37" }} />
                </div>
                <div>
                  <div
                    className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}
                  >
                    {t("cmkt.eng.mcp_kicker", locale)}
                  </div>
                  <h4
                    className="text-lg font-bold md:text-xl"
                    style={{
                      color: "#E8EAFC",
                      fontFamily: "'Poppins', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    {t("cmkt.eng.mcp_title", locale)}
                  </h4>
                </div>
              </div>
              <Shield className="h-6 w-6" style={{ color: "#D4AF37" }} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {MCP_TOOLS.map((tool) => (
                <div
                  key={tool.label}
                  className="rounded-xl p-3"
                  style={{
                    backgroundColor: "rgba(11,15,46,0.55)",
                    border: "1px solid rgba(232,234,252,0.08)",
                  }}
                >
                  <div
                    className="mb-1 font-mono text-xs font-bold"
                    style={{
                      color: "#D4AF37",
                      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    }}
                  >
                    {tool.label}
                  </div>
                  <div
                    className="text-[11px]"
                    style={{
                      color: "#A8AFC7",
                      fontFamily: "'Poppins', sans-serif",
                      fontWeight: 400,
                    }}
                  >
                    {t(tool.descKey, locale)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
