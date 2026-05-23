"use client"

/**
 * EcosystemBridge — animated "constellation" section showing how Lexora
 * is wired to every external system (banks, MRA, email, Telegram,
 * Google, Claude). SVG-based to stay lightweight and crisp.
 */

import * as React from "react"
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

type Locale = "fr" | "en"

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
    title: "7 banques mauriciennes",
    titleEn: "7 Mauritian banks",
    body: "Connexion sécurisée Internet Banking : MCB, SBM, ABC, MauBank, MyT Money, AfrAsia, Bank One. Scraping quotidien automatique des soldes et transactions. Credentials chiffrés AES-256-GCM.",
    bodyEn: "Secure Internet Banking connection: MCB, SBM, ABC, MauBank, MyT Money, AfrAsia, Bank One. Daily automated balance & transaction scraping. AES-256-GCM encrypted credentials.",
    color: "#4191FF",
    tag: "Open Banking",
  },
  {
    icon: Landmark,
    title: "MRA — robot e-filing",
    titleEn: "MRA — e-filing robot",
    body: "Soumission automatisée VAT, PAYE, CSG, NSF, TDS, CIT, ROC, SFT, PRGF. Robot Playwright headless qui se connecte au portail MRA, dépose le CSV/XML, récupère l'accusé de réception.",
    bodyEn: "Automated submission of VAT, PAYE, CSG, NSF, TDS, CIT, ROC, SFT, PRGF. Headless Playwright robot logs into MRA portal, uploads CSV/XML, retrieves acknowledgement.",
    color: "#D4AF37",
    tag: "100% MRA",
  },
  {
    icon: Send,
    title: "Telegram — bras droit IA",
    titleEn: "Telegram — AI right hand",
    body: "50+ outils branchés, OCR vision (Haiku 4.5), transcription voix (Whisper), boutons inline, mémoire conversationnelle. Pilotez Lexora comme on dicte à une assistante.",
    bodyEn: "50+ wired tools, vision OCR (Haiku 4.5), voice transcription (Whisper), inline buttons, conversational memory. Drive Lexora like dictating to an assistant.",
    color: "#2ECC8A",
    tag: "Chief of Staff",
  },
  {
    icon: Mail,
    title: "Email multi-compte",
    titleEn: "Multi-account email",
    body: "SMTP, Resend, Gmail OAuth — chaque société peut câbler son propre compte d'envoi. Templates dynamiques par module (factures, relances, bulletins, contrats).",
    bodyEn: "SMTP, Resend, Gmail OAuth — every company wires its own send account. Module-specific dynamic templates (invoices, dunning, payslips, contracts).",
    color: "#4191FF",
    tag: "3 providers",
  },
  {
    icon: CalendarDays,
    title: "Google Calendar OAuth",
    titleEn: "Google Calendar OAuth",
    body: "Multi-comptes Google par utilisateur. Création/modification d'événements, recherche de créneaux libres entre invités, lien Meet automatique. Tokens chiffrés.",
    bodyEn: "Multi-Google accounts per user. Event create/edit, free-slot finder across attendees, auto Meet link. Encrypted tokens.",
    color: "#D4AF37",
    tag: "OAuth 2.0",
  },
  {
    icon: Brain,
    title: "Claude Code · Skills · MCP",
    titleEn: "Claude Code · Skills · MCP",
    body: "4 skills experts (IFRS 9 ECL, MRA-TDS, rapprochement, GBC Full IFRS) + 5 outils MCP (grand-livre, ECL, MRA, rapprochement, consolidation). Sonnet 4.6 + Haiku 4.5.",
    bodyEn: "4 expert skills (IFRS 9 ECL, MRA-TDS, reconciliation, GBC Full IFRS) + 5 MCP tools (general ledger, ECL, MRA, reconciliation, consolidation). Sonnet 4.6 + Haiku 4.5.",
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
            {locale === "fr" ? "Écosystème connecté" : "Connected ecosystem"}
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
            {locale === "fr" ? (
              <>
                Lexora parle déjà à{" "}
                <span
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  vos systèmes
                </span>
              </>
            ) : (
              <>
                Lexora already talks to{" "}
                <span
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  your systems
                </span>
              </>
            )}
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
            {locale === "fr"
              ? "Banques, MRA, Google, Telegram, Claude. Pas d'import CSV à la main, pas d'export à recopier. Lexora se branche, se synchronise, et s'occupe du reste."
              : "Banks, MRA, Google, Telegram, Claude. No CSV imports by hand, no exports to copy. Lexora plugs in, syncs and handles the rest."}
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
                {locale === "fr" ? "Vos banques, sans relever de pièges" : "Your banks, without lifting a finger"}
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
                {locale === "fr"
                  ? "7 banques mauriciennes synchronisées chaque nuit"
                  : "7 Mauritian banks synced every night"}
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
                  { icon: ShieldCheck, label: locale === "fr" ? "AES-256-GCM" : "AES-256-GCM" },
                  { icon: Zap, label: locale === "fr" ? "Scrape automatique 02:00" : "Auto-scrape 02:00" },
                  { icon: Brain, label: locale === "fr" ? "Détection d'anomalies IA" : "AI anomaly detection" },
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
            <StaggerItem key={it.title}>
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
                    {locale === "fr" ? it.title : it.titleEn}
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
                    {locale === "fr" ? it.body : it.bodyEn}
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
