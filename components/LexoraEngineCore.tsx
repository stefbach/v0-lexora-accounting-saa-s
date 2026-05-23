"use client"

/**
 * LexoraEngineCore — premium section presenting the accounting brain
 * inside Lexora: PCM canonical, SYSCOHADA (OHADA 17 countries),
 * Full IFRS, GBC compliance, and Claude Code skills + MCP tooling.
 */

import * as React from "react"
import { Reveal, StaggerGroup, StaggerItem, HoverLift } from "@/components/ui/motion"
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

type Locale = "fr" | "en"

const LAYERS = [
  {
    label: "PCM",
    sub: "Plan Comptable Mauricien",
    body: "Plan strict canonique — 7 classes, comptes 401/411/512/641, mapping bidirectionnel avec SYSCOHADA, validations R1-R7 par écriture.",
    bodyEn: "Strict canonical chart — 7 classes, 401/411/512/641 accounts, bidirectional mapping with SYSCOHADA, R1-R7 validation per entry.",
    color: "#4191FF",
  },
  {
    label: "SYSCOHADA",
    sub: "17 pays OHADA",
    body: "Système comptable OHADA révisé (AUDCIF 2017). 9 classes, 500+ comptes officiels, états financiers (Bilan, CR, TAFIRE, SMT, 35 notes annexes).",
    bodyEn: "Revised OHADA accounting system (AUDCIF 2017). 9 classes, 500+ official accounts, financial statements (Balance Sheet, P&L, TAFIRE, SMT, 35 notes).",
    color: "#D4AF37",
  },
  {
    label: "Full IFRS",
    sub: "Pas IFRS for SMEs",
    body: "IFRS 9 ECL (Stages 1/2/3, SICR, PD/LGD, macro scenarios), IFRS 15 Revenue, IFRS 16 Leases (RoU + liability), IFRS 10 Consolidation, IAS 21 Functional Currency, IAS 36/38, IFRS 13.",
    bodyEn: "IFRS 9 ECL (Stages 1/2/3, SICR, PD/LGD, macro), IFRS 15 Revenue, IFRS 16 Leases (RoU + liability), IFRS 10 Consolidation, IAS 21 Functional Currency, IAS 36/38, IFRS 13.",
    color: "#2ECC8A",
  },
  {
    label: "GBC",
    sub: "Authorised Company / Global Business",
    body: "PER 80% (7 catégories), Substance / CIGA (11 activités), Transfer Pricing (5 méthodes, CBCR), UBO + KYC, CRS/FATCA (50+ juridictions), BEPS Pillar Two GloBE, consolidation IFRS 10.",
    bodyEn: "PER 80% (7 categories), Substance / CIGA (11 activities), Transfer Pricing (5 methods, CBCR), UBO + KYC, CRS/FATCA (50+ jurisdictions), BEPS Pillar Two GloBE, IFRS 10 consolidation.",
    color: "#4191FF",
  },
]

const SKILLS = [
  {
    icon: BookOpenCheck,
    title: "lexora-ifrs9-ecl",
    body: "Calcule l'Expected Credit Loss IFRS 9 sur tous vos clients. Affecte chaque tiers à un stage 1/2/3, applique PD/LGD sectoriels, surcharge macro-scenarios.",
    bodyEn: "Computes IFRS 9 Expected Credit Loss across all your customers. Assigns each counterparty to stage 1/2/3, applies sector PD/LGD, overlays macro scenarios.",
  },
  {
    icon: Scale,
    title: "lexora-mra-tds",
    body: "Produit vos déclarations MRA (PAYE, NSF, CSG, TDS, IT Form 3). Génère CSV et XML conformes, calcule withholding sur paiements fournisseurs étrangers.",
    bodyEn: "Produces your MRA filings (PAYE, NSF, CSG, TDS, IT Form 3). Generates compliant CSV and XML, computes withholding on foreign supplier payments.",
  },
  {
    icon: Network,
    title: "lexora-rapprochement-rules",
    body: "Applique les règles déterministes R1-R7 du rapprochement bancaire mauricien : compte 580, lettrage 411/401, classification BNQ, refus de lettrage sur 6xxx/7xxx.",
    bodyEn: "Applies Mauritian bank reconciliation rules R1-R7: account 580, 411/401 reconciliation, BNQ classification, no lettering on 6xxx/7xxx accounts.",
  },
  {
    icon: Building2,
    title: "lexora-gbc-ifrs-complete",
    body: "Raisonne sur les Global Business Companies mauriciennes en Full IFRS : Partial Exemption Regime, substance CIGA, Transfer Pricing, Pillar Two, BEPS, BO Register.",
    bodyEn: "Reasons over Mauritian Global Business Companies in Full IFRS: Partial Exemption Regime, CIGA substance, Transfer Pricing, Pillar Two, BEPS, BO Register.",
  },
]

const MCP_TOOLS = [
  { label: "get_grand_livre", desc: "Grand livre temps réel" },
  { label: "compute_ifrs9_ecl", desc: "ECL IFRS 9 par contrepartie" },
  { label: "mra_declarations", desc: "Pré-remplissage MRA" },
  { label: "rapprochement_rules", desc: "Règles BNQ R1-R7" },
  { label: "gbc_consolidation", desc: "Consolidation IFRS 10 GBC" },
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
            {locale === "fr" ? "Le moteur Lexora" : "The Lexora engine"}
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
                Un cerveau{" "}
                <span
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  multi-référentiel
                </span>
                <br />
                <span className="text-2xl md:text-4xl font-normal" style={{ color: "#A8AFC7" }}>
                  PCM · SYSCOHADA · Full IFRS · GBC
                </span>
              </>
            ) : (
              <>
                A{" "}
                <span
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  multi-standard
                </span>{" "}
                brain
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
            {locale === "fr"
              ? "Une seule plateforme. Quatre référentiels comptables nativement intégrés. Le moteur choisit la bonne norme selon la juridiction et le type d'entité — vous n'avez jamais à le configurer."
              : "One platform. Four natively integrated accounting frameworks. The engine picks the right standard per jurisdiction and entity — you never configure it."}
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
                      {locale === "fr" ? `Couche ${String(i + 1).padStart(2, "0")}` : `Layer ${String(i + 1).padStart(2, "0")}`}
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
                      {l.sub}
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
                      {locale === "fr" ? l.body : l.bodyEn}
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
            {locale === "fr" ? "Powered by Claude Code · Anthropic" : "Powered by Claude Code · Anthropic"}
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
            {locale === "fr"
              ? "4 skills expertes + 5 outils MCP natifs"
              : "4 expert skills + 5 native MCP tools"}
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
            {locale === "fr"
              ? "Claude Code n'est pas un simple chatbot collé à Lexora. Il pilote vos écritures, vos déclarations, votre conformité. Chaque skill est une équipe d'experts qui connaît votre référentiel."
              : "Claude Code isn't a chatbot pasted on Lexora. It drives your entries, filings and compliance. Each skill is an expert team that knows your standard."}
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
                      {locale === "fr" ? s.body : s.bodyEn}
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
                    {locale === "fr" ? "Outils MCP natifs" : "Native MCP tools"}
                  </div>
                  <h4
                    className="text-lg font-bold md:text-xl"
                    style={{
                      color: "#E8EAFC",
                      fontFamily: "'Poppins', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    {locale === "fr"
                      ? "Claude appelle directement votre comptabilité"
                      : "Claude calls your accounting directly"}
                  </h4>
                </div>
              </div>
              <Shield className="h-6 w-6" style={{ color: "#D4AF37" }} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {MCP_TOOLS.map((t) => (
                <div
                  key={t.label}
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
                    {t.label}
                  </div>
                  <div
                    className="text-[11px]"
                    style={{
                      color: "#A8AFC7",
                      fontFamily: "'Poppins', sans-serif",
                      fontWeight: 400,
                    }}
                  >
                    {t.desc}
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
