"use client"

/**
 * NewFeatures2026 — premium reel showcasing the 2026 wave of new
 * capabilities. Mixes editorial-style "release notes" with bold visual
 * tiles.
 */

import * as React from "react"
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

type Locale = "fr" | "en"

const FEATURES = [
  {
    icon: Bot,
    badge: "AGENT IA",
    title: "Lex Banque — Rapprochement autonome",
    titleEn: "Lex Banque — Autonomous reconciliation",
    body: "Agent Claude qui scanne vos transactions bancaires, identifie les fournisseurs, croise les factures et propose les écritures BNQ. Multi-stratégies, multi-factures, lettrage automatique 411/401.",
    bodyEn: "Claude agent that scans bank transactions, identifies suppliers, cross-checks invoices and proposes BNQ entries. Multi-strategy, multi-invoice, automatic 411/401 reconciliation.",
    color: "#4191FF",
    metric: "8 outils",
    metricLabel: "agent tools",
  },
  {
    icon: Banknote,
    badge: "OPEN BANKING",
    title: "Scraping bancaire 7 banques",
    titleEn: "Bank scraping · 7 banks",
    body: "MCB, SBM, ABC, MauBank, MyT Money, AfrAsia, Bank One. Connexion Internet Banking sécurisée, solde et transactions synchronisés chaque nuit. Détection automatique d'anomalies de balance.",
    bodyEn: "MCB, SBM, ABC, MauBank, MyT Money, AfrAsia, Bank One. Secure Internet Banking connection, balance & transactions synced every night. Automatic balance anomaly detection.",
    color: "#D4AF37",
    metric: "AES-256",
    metricLabel: "chiffrement",
  },
  {
    icon: Globe2,
    badge: "MULTI-JURIDICTION",
    title: "OHADA natif · 17 pays",
    titleEn: "Native OHADA · 17 countries",
    body: "Sénégal, Côte d'Ivoire, Mali, Burkina Faso, Cameroun, Gabon, Congo, RDC… SYSCOHADA révisé, états financiers (Bilan, CR, TAFIRE, 35 notes), fiscalité et paie locale par pays.",
    bodyEn: "Senegal, Ivory Coast, Mali, Burkina Faso, Cameroon, Gabon, Congo, DRC… Revised SYSCOHADA, financial statements (BS, P&L, TAFIRE, 35 notes), local tax & payroll per country.",
    color: "#2ECC8A",
    metric: "500+",
    metricLabel: "comptes officiels",
  },
  {
    icon: ShieldCheck,
    badge: "GBC · OFFSHORE",
    title: "BEPS Pillar Two GloBE",
    titleEn: "BEPS Pillar Two GloBE",
    body: "Calcul GloBE pour les groupes mauriciens dépassant EUR 750M. ETR par juridiction, SBIE phase-in 5%/5% 2024+, top-up tax automatique. Conforme OECD Model Rules.",
    bodyEn: "GloBE computation for Mauritian groups above EUR 750M. ETR per jurisdiction, SBIE phase-in 5%/5% 2024+, automatic top-up tax. OECD Model Rules compliant.",
    color: "#4191FF",
    metric: "15%",
    metricLabel: "ETR minimum",
  },
  {
    icon: TrendingUp,
    badge: "IFRS · CREDIT",
    title: "IFRS 9 ECL · Stages 1/2/3",
    titleEn: "IFRS 9 ECL · Stages 1/2/3",
    body: "Détection automatique du Significant Increase in Credit Risk (>30j → Stage 2, >90j → Stage 3). PD/LGD sectoriels, scenarios macro pondérés, disclosure IFRS 7.",
    bodyEn: "Automatic Significant Increase in Credit Risk detection (>30d → Stage 2, >90d → Stage 3). Sector PD/LGD, weighted macro scenarios, IFRS 7 disclosure.",
    color: "#D4AF37",
    metric: "3 stages",
    metricLabel: "+ SICR auto",
  },
  {
    icon: Send,
    badge: "CHIEF OF STAFF",
    title: "Telegram · 50+ outils IA",
    titleEn: "Telegram · 50+ AI tools",
    body: "Voix (Whisper), photo (Claude Vision), boutons inline. Comptabilité, RH, banque, agenda, email — tout pilotable en langage naturel depuis le téléphone que vous avez déjà.",
    bodyEn: "Voice (Whisper), photo (Claude Vision), inline buttons. Accounting, HR, banking, calendar, email — all driven in natural language from the phone you already have.",
    color: "#2ECC8A",
    metric: "24/7",
    metricLabel: "FR · EN",
  },
  {
    icon: CalendarClock,
    badge: "AUTOMATION",
    title: "25 crons orchestrés",
    titleEn: "25 orchestrated crons",
    body: "Alertes TVA J-1/J-5/retard, brief mensuel, relances factures, prévisionnel auto, rapport hebdo, scan compliance, db-health-check, scraping bancaire, taux de change.",
    bodyEn: "VAT alerts D-1/D-5/late, monthly brief, invoice dunning, auto forecast, weekly report, compliance scan, db-health-check, bank scraping, FX rates.",
    color: "#4191FF",
    metric: "25",
    metricLabel: "jobs auto",
  },
  {
    icon: Receipt,
    badge: "FACTURATION",
    title: "Factures IA · Template extracteur",
    titleEn: "AI Invoices · Template extractor",
    body: "Uploadez une vieille facture papier — l'IA extrait votre charte (logo, mise en page, mentions légales) et la transforme en template Lexora réutilisable, conforme MRA + QR Code + IRN.",
    bodyEn: "Upload an old paper invoice — AI extracts your style (logo, layout, legal mentions) and turns it into a reusable Lexora template, MRA-compliant + QR Code + IRN.",
    color: "#D4AF37",
    metric: "1 photo",
    metricLabel: "→ template",
  },
  {
    icon: HeartPulse,
    badge: "EXCLUSIF",
    title: "TIBOK Santé · téléconsultation",
    titleEn: "TIBOK Health · telemedicine",
    body: "Téléconsultation illimitée incluse dans toutes les formules. Médecins agréés Maurice, ordonnances digitales, suivi médical des salariés — aucun coût additionnel par tête.",
    bodyEn: "Unlimited telemedicine included in every plan. Mauritius-licensed doctors, digital prescriptions, employee medical follow-up — no extra per-head cost.",
    color: "#2ECC8A",
    metric: "∞",
    metricLabel: "consultations",
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
            {locale === "fr" ? "Wave 2026 · Sorties récentes" : "2026 Wave · Recent releases"}
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
                9 nouveautés qui vont{" "}
                <span
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  changer votre métier
                </span>
              </>
            ) : (
              <>
                9 releases that will{" "}
                <span
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  reshape your work
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
              ? "Ce que les autres ERP appellent « roadmap », c'est déjà en production chez Lexora. Voici la vague 2026."
              : "What other ERPs call a 'roadmap', is already live in Lexora. Here's the 2026 wave."}
          </p>
        </Reveal>

        <StaggerGroup className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" staggerMs={65}>
          {FEATURES.map((f) => (
            <StaggerItem key={f.title}>
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
                    {locale === "fr" ? f.title : f.titleEn}
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
                    {locale === "fr" ? f.body : f.bodyEn}
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
                        {f.metric}
                      </div>
                      <div
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{
                          color: "#94A3B8",
                          fontFamily: "'Poppins', sans-serif",
                        }}
                      >
                        {f.metricLabel}
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
