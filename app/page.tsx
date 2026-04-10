"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { t, getLocale } from "@/lib/i18n"
import { LanguageSwitcherLight } from "@/components/LanguageSwitcher"
import { LexoraLogo } from "@/components/LexoraLogo"
import {
  FileSearch,
  BookOpen,
  FileText,
  Users,
  Landmark,
  BellRing,
  Brain,
  MessageSquare,
  GitCompareArrows,
  Sparkles,
  CalendarClock,
  Bot,
  Shield,
  Scale,
  Building2,
  Globe,
  ArrowRight,
  CheckCircle2,
  Briefcase,
} from "lucide-react"

export default function HomePage() {
  const locale = getLocale()

  const features = [
    {
      icon: FileSearch,
      title: t('home.feat.ocr_title', locale),
      items: [
        t('home.feat.ocr_1', locale),
        t('home.feat.ocr_2', locale),
      ],
    },
    {
      icon: BookOpen,
      title: t('home.feat.accounting_title', locale),
      items: [
        t('home.feat.accounting_1', locale),
        t('home.feat.accounting_2', locale),
        t('home.feat.accounting_3', locale),
      ],
    },
    {
      icon: FileText,
      title: t('home.feat.invoicing_title', locale),
      items: [
        t('home.feat.invoicing_1', locale),
        t('home.feat.invoicing_2', locale),
        t('home.feat.invoicing_3', locale),
      ],
    },
    {
      icon: Users,
      title: t('home.feat.hr_title', locale),
      items: [
        t('home.feat.hr_1', locale),
        t('home.feat.hr_2', locale),
        t('home.feat.hr_3', locale),
      ],
    },
    {
      icon: Landmark,
      title: t('home.feat.fiscal_title', locale),
      items: [
        t('home.feat.fiscal_1', locale),
        t('home.feat.fiscal_2', locale),
        t('home.feat.fiscal_3', locale),
        t('home.feat.fiscal_4', locale),
      ],
    },
    {
      icon: BellRing,
      title: t('home.feat.alerts_title', locale),
      items: [
        t('home.feat.alerts_1', locale),
        t('home.feat.alerts_2', locale),
        t('home.feat.alerts_3', locale),
        t('home.feat.alerts_4', locale),
      ],
    },
  ]

  const aiCapabilities = [
    { icon: Brain, text: t('home.ai.ocr', locale) },
    { icon: MessageSquare, text: t('home.ai.clara', locale) },
    { icon: GitCompareArrows, text: t('home.ai.reconciliation', locale) },
    { icon: Sparkles, text: t('home.ai.bonuses', locale) },
    { icon: CalendarClock, text: t('home.ai.planning', locale) },
    { icon: Bot, text: t('home.ai.alerts', locale) },
  ]

  const compliance = [
    { icon: Landmark, label: t('home.compliance.mra', locale) },
    { icon: Scale, label: t('home.compliance.wra', locale) },
    { icon: Building2, label: t('home.compliance.roc', locale) },
    { icon: BookOpen, label: t('home.compliance.ifrs', locale) },
    { icon: Globe, label: t('home.compliance.ias21', locale) },
  ]

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "#F8F9FC" }}>
      {/* NAVBAR — dark */}
      <header className="sticky top-0 z-50" style={{ backgroundColor: "#0B0F2E", borderBottom: "1px solid #1E2760" }}>
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <LexoraLogo href="/" size="md" showBaseline />
          <nav className="hidden gap-8 md:flex">
            <a href="#features" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif" }}>
              {t('home.modules', locale)}
            </a>
            <a href="#ai" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif" }}>
              {t('home.ai_intelligence', locale)}
            </a>
            <a href="#offres" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif" }}>
              {locale === "fr" ? "Offres" : "Offers"}
            </a>
            <a href="#compliance" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif" }}>
              {t('home.compliance', locale)}
            </a>
            <Link href="/tarifs" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}>
              Tarifs
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <LanguageSwitcherLight />
            <Link href="/auth/login">
              <Button
                variant="outline"
                size="sm"
                className="border-[#4191FF] text-[#4191FF] hover:bg-[#4191FF]/10"
                style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 500 }}
              >
                {t('home.login', locale)}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO — dark section for impact */}
        <section
          className="relative overflow-hidden py-24 md:py-32"
          style={{ backgroundColor: "#0B0F2E" }}
        >
          <div className="absolute inset-0 opacity-5" style={{
            backgroundImage: "radial-gradient(circle at 25% 25%, #D4AF37 1px, transparent 1px), radial-gradient(circle at 75% 75%, #D4AF37 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }} />
          <div className="relative mx-auto max-w-4xl px-6 text-center">
            <Badge
              className="mb-6 border-0 px-4 py-1.5 text-sm font-medium"
              style={{ backgroundColor: "rgba(212,175,55,0.12)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.25)", fontFamily: "'Poppins', sans-serif" }}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {t('home.hero_badge', locale)}
            </Badge>
            <h1
              className="mb-6 text-4xl font-bold tracking-tight md:text-6xl"
              style={{ color: "#E8EAFC", fontFamily: "'Poppins', sans-serif" }}
            >
              <span style={{ letterSpacing: "0.04em" }}>LE<span style={{ color: "#D4AF37" }}>X</span>ORA</span> — {locale === "fr" ? "La comptabilité intelligente pour Maurice" : "Smart Accounting for Mauritius"}
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-lg" style={{ color: "#8B90B8", fontFamily: "'Poppins', sans-serif", fontWeight: 300, lineHeight: 1.7 }}>
              {t('home.hero_subtitle', locale)}
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/auth/login">
                <Button
                  size="lg"
                  className="px-8 text-base font-semibold"
                  style={{ backgroundColor: "#4191FF", color: "#FFFFFF", fontFamily: "'Poppins', sans-serif", fontWeight: 500, borderRadius: "6px" }}
                >
                  {t('home.get_started', locale)}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="px-8 text-base font-semibold"
                style={{ border: "1px solid #4191FF", color: "#4191FF", backgroundColor: "transparent", fontFamily: "'Poppins', sans-serif", fontWeight: 500, borderRadius: "6px" }}
              >
                {t('home.watch_demo', locale)}
              </Button>
            </div>
          </div>
        </section>

        {/* FEATURES — white */}
        <section id="features" className="py-20 md:py-28" style={{ backgroundColor: "#FFFFFF" }}>
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: "#0B0F2E", fontFamily: "'Poppins', sans-serif", fontWeight: 700 }}>
                {t('home.smart_modules', locale)}
              </h2>
              <p className="mx-auto max-w-2xl" style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif", fontWeight: 300, lineHeight: 1.7 }}>
                {t('home.smart_modules_desc', locale)}
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <Card
                  key={feature.title}
                  className="group transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                  style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5F0", borderRadius: "12px" }}
                >
                  <CardHeader className="pb-3">
                    <div
                      className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
                      style={{ backgroundColor: "rgba(65,145,255,0.08)" }}
                    >
                      <feature.icon className="h-6 w-6" style={{ color: "#4191FF" }} />
                    </div>
                    <CardTitle className="text-lg" style={{ color: "#0B0F2E", fontFamily: "'Poppins', sans-serif", fontWeight: 500 }}>
                      {feature.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {feature.items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "#4A5490" }}>
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#D4AF37" }} />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* AI SECTION — light grey */}
        <section id="ai" className="py-20 md:py-28" style={{ backgroundColor: "#F0F2F8" }}>
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: "#0B0F2E", fontFamily: "'Poppins', sans-serif", fontWeight: 700 }}>
                {t('home.ai_at_core', locale)}
              </h2>
              <p className="mx-auto max-w-2xl" style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif", fontWeight: 300, lineHeight: 1.7 }}>
                {t('home.ai_at_core_desc', locale)}
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {aiCapabilities.map((cap, i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 rounded-xl p-6 transition-all duration-300 hover:shadow-md"
                  style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5F0", borderRadius: "12px" }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "#0B0F2E" }}
                  >
                    <cap.icon className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: "#4A5490", fontWeight: 300, lineHeight: 1.7 }}>{cap.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* OFFRES — Deux offres claires : Client direct + Expert-Comptable */}
        <section id="offres" className="py-20 md:py-28" style={{ backgroundColor: "#FFFFFF" }}>
          <div className="mx-auto max-w-6xl px-6">
            {/* Header */}
            <div className="mb-14 text-center">
              <Badge
                className="mb-5 border-0 px-4 py-1.5 text-sm font-medium"
                style={{
                  backgroundColor: "rgba(65,145,255,0.08)",
                  color: "#4191FF",
                  border: "1px solid rgba(65,145,255,0.25)",
                  fontFamily: "'Poppins', sans-serif",
                }}
              >
                {locale === "fr" ? "Nos offres" : "Our offers"}
              </Badge>
              <h2
                className="mb-4 text-3xl font-bold md:text-4xl"
                style={{ color: "#0B0F2E", fontFamily: "'Poppins', sans-serif", fontWeight: 700 }}
              >
                {locale === "fr"
                  ? "Deux façons d'accéder à Lexora"
                  : "Two ways to access Lexora"}
              </h2>
              <p
                className="mx-auto max-w-2xl"
                style={{
                  color: "#4A5490",
                  fontFamily: "'Poppins', sans-serif",
                  fontWeight: 300,
                  lineHeight: 1.7,
                }}
              >
                {locale === "fr"
                  ? "Un accès direct pour votre entreprise, ou le programme partenaire si vous êtes expert-comptable et gérez plusieurs dossiers."
                  : "Direct access for your business, or the partner program if you are an accountant managing multiple client files."}
              </p>
            </div>

            {/* Two offer cards side-by-side */}
            <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
              {/* ========================================== */}
              {/* OFFER 1 — CLIENT DIRECT (blue, light)      */}
              {/* ========================================== */}
              <div
                className="relative flex flex-col rounded-2xl p-8 md:p-10"
                style={{
                  backgroundColor: "#F8F9FC",
                  border: "1px solid #E2E5F0",
                }}
              >
                {/* Top label */}
                <div className="mb-6 flex items-center gap-3">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl"
                    style={{ backgroundColor: "rgba(65,145,255,0.10)" }}
                  >
                    <Building2 className="h-6 w-6" style={{ color: "#4191FF" }} />
                  </div>
                  <div>
                    <div
                      className="text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: "#4191FF", fontFamily: "'Poppins', sans-serif" }}
                    >
                      {locale === "fr" ? "Offre 1 · Entreprise" : "Offer 1 · Business"}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "#8B90B8", fontFamily: "'Poppins', sans-serif" }}
                    >
                      {locale === "fr" ? "Accès direct" : "Direct access"}
                    </div>
                  </div>
                </div>

                {/* Title */}
                <h3
                  className="mb-3 text-2xl md:text-3xl"
                  style={{ color: "#0B0F2E", fontFamily: "'Poppins', sans-serif", fontWeight: 700 }}
                >
                  {locale === "fr" ? "Pour votre entreprise" : "For your business"}
                </h3>
                <p
                  className="mb-6 text-sm"
                  style={{
                    color: "#4A5490",
                    fontFamily: "'Poppins', sans-serif",
                    fontWeight: 300,
                    lineHeight: 1.7,
                  }}
                >
                  {locale === "fr"
                    ? "Gérez vous-même votre comptabilité, votre paie et votre fiscalité MRA depuis une interface unique. Idéal pour les PME, freelances et dirigeants autonomes."
                    : "Manage your own accounting, payroll and MRA tax filings from a single interface. Ideal for SMEs, freelancers and autonomous business owners."}
                </p>

                {/* Features */}
                <ul className="mb-6 space-y-3">
                  {(locale === "fr"
                    ? [
                        "Accès direct à tous les modules (Compta, RH, Facturation, Fiscal)",
                        "Conformité MRA native (IRN, QR Code, e-MRA, IT Form 3)",
                        "OCR IA illimité, rapprochement bancaire automatique",
                        "Support inclus, mises à jour réglementaires continues",
                      ]
                    : [
                        "Direct access to all modules (Accounting, HR, Invoicing, Tax)",
                        "Native MRA compliance (IRN, QR Code, e-MRA, IT Form 3)",
                        "Unlimited AI OCR, automatic bank reconciliation",
                        "Support included, continuous regulatory updates",
                      ]
                  ).map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2
                        className="mt-0.5 h-5 w-5 shrink-0"
                        style={{ color: "#4191FF" }}
                      />
                      <span
                        className="text-sm"
                        style={{ color: "#0B0F2E", fontFamily: "'Poppins', sans-serif" }}
                      >
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Price hint */}
                <div
                  className="mb-6 rounded-xl p-4"
                  style={{
                    backgroundColor: "#FFFFFF",
                    border: "1px solid #E2E5F0",
                  }}
                >
                  <div
                    className="text-xs uppercase tracking-wider"
                    style={{ color: "#8B90B8", fontFamily: "'Poppins', sans-serif" }}
                  >
                    {locale === "fr" ? "À partir de" : "Starting at"}
                  </div>
                  <div
                    className="text-3xl font-bold"
                    style={{ color: "#0B0F2E", fontFamily: "'Poppins', sans-serif" }}
                  >
                    Rs 1 500
                    <span
                      className="text-sm font-normal"
                      style={{ color: "#8B90B8" }}
                    >
                      {locale === "fr" ? " / mois" : " / month"}
                    </span>
                  </div>
                </div>

                {/* CTA */}
                <div className="mt-auto">
                  <Link href="/tarifs" className="block">
                    <Button
                      size="lg"
                      className="w-full text-base font-semibold"
                      style={{
                        backgroundColor: "#4191FF",
                        color: "#FFFFFF",
                        fontFamily: "'Poppins', sans-serif",
                        fontWeight: 600,
                        borderRadius: "8px",
                      }}
                    >
                      {locale === "fr" ? "Voir tous les tarifs" : "View all pricing"}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* ========================================== */}
              {/* OFFER 2 — EXPERT-COMPTABLE (dark, gold)    */}
              {/* ========================================== */}
              <div
                id="expert-comptable"
                className="relative flex flex-col overflow-hidden rounded-2xl p-8 md:p-10"
                style={{
                  backgroundColor: "#0B0F2E",
                  border: "1px solid #D4AF37",
                }}
              >
                {/* Gold gradient overlay */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(ellipse 80% 40% at 50% 0%, rgba(212,175,55,0.12) 0%, transparent 70%)",
                  }}
                />

                {/* "Featured" ribbon */}
                <div
                  className="absolute right-0 top-0 rounded-bl-xl px-4 py-1 text-[10px] font-bold uppercase tracking-widest"
                  style={{
                    backgroundColor: "#D4AF37",
                    color: "#0B0F2E",
                    fontFamily: "'Poppins', sans-serif",
                  }}
                >
                  {locale === "fr" ? "Gratuit pour le cabinet" : "Free for the firm"}
                </div>

                {/* Top label */}
                <div className="relative mb-6 flex items-center gap-3">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: "rgba(212,175,55,0.12)",
                      border: "1px solid rgba(212,175,55,0.30)",
                    }}
                  >
                    <Briefcase className="h-6 w-6" style={{ color: "#D4AF37" }} />
                  </div>
                  <div>
                    <div
                      className="text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}
                    >
                      {locale === "fr" ? "Offre 2 · Expert-Comptable" : "Offer 2 · Accountant"}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "#8B90B8", fontFamily: "'Poppins', sans-serif" }}
                    >
                      {locale === "fr" ? "Programme Partenaire" : "Partner Program"}
                    </div>
                  </div>
                </div>

                {/* Title */}
                <h3
                  className="relative mb-3 text-2xl md:text-3xl"
                  style={{ color: "#E8EAFC", fontFamily: "'Poppins', sans-serif", fontWeight: 700 }}
                >
                  {locale === "fr" ? "Pour votre cabinet comptable" : "For your accounting firm"}
                </h3>
                <p
                  className="relative mb-6 text-sm"
                  style={{
                    color: "#8B90B8",
                    fontFamily: "'Poppins', sans-serif",
                    fontWeight: 300,
                    lineHeight: 1.7,
                  }}
                >
                  {locale === "fr"
                    ? "Gérez l'ensemble de votre portefeuille clients depuis un seul tableau de bord. Lexora s'intègre dans votre mission comptable et vous reverse une commission récurrente."
                    : "Manage your entire client portfolio from a single dashboard. Lexora integrates into your engagement and pays you a recurring commission."}
                </p>

                {/* Features */}
                <ul className="relative mb-6 space-y-3">
                  {(locale === "fr"
                    ? [
                        "Tableau de bord multi-dossiers : tous vos clients en un écran",
                        "Permissions différenciées cabinet / client par module",
                        "Alertes fiscales consolidées sur tout votre portefeuille",
                        "Commission mensuelle récurrente sur chaque client actif",
                      ]
                    : [
                        "Multi-client dashboard: all your clients on one screen",
                        "Differentiated firm / client permissions by module",
                        "Consolidated tax alerts across your entire portfolio",
                        "Recurring monthly commission on each active client",
                      ]
                  ).map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2
                        className="mt-0.5 h-5 w-5 shrink-0"
                        style={{ color: "#D4AF37" }}
                      />
                      <span
                        className="text-sm"
                        style={{ color: "#E8EAFC", fontFamily: "'Poppins', sans-serif" }}
                      >
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Price hint */}
                <div
                  className="relative mb-6 rounded-xl p-4"
                  style={{
                    backgroundColor: "rgba(212,175,55,0.06)",
                    border: "1px solid rgba(212,175,55,0.25)",
                  }}
                >
                  <div
                    className="text-xs uppercase tracking-wider"
                    style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}
                  >
                    {locale === "fr" ? "Accès cabinet" : "Firm access"}
                  </div>
                  <div
                    className="text-3xl font-bold"
                    style={{ color: "#E8EAFC", fontFamily: "'Poppins', sans-serif" }}
                  >
                    <span style={{ color: "#D4AF37", fontSize: "1.25rem" }}>Rs</span> 0
                    <span className="text-sm font-normal" style={{ color: "#8B90B8" }}>
                      {locale === "fr" ? " · aucun engagement" : " · no commitment"}
                    </span>
                  </div>
                </div>

                {/* CTA */}
                <div className="relative mt-auto">
                  <a
                    href="mailto:contact@lexora.finance?subject=Demande démonstration cabinet — Expert-Comptable"
                    className="block"
                  >
                    <Button
                      size="lg"
                      className="w-full text-base font-semibold"
                      style={{
                        backgroundColor: "#D4AF37",
                        color: "#0B0F2E",
                        fontFamily: "'Poppins', sans-serif",
                        fontWeight: 700,
                        borderRadius: "8px",
                      }}
                    >
                      {locale === "fr" ? "Demander une démo cabinet" : "Request a firm demo"}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* COMPLIANCE — light grey */}
        <section id="compliance" className="py-20 md:py-28" style={{ backgroundColor: "#F0F2F8" }}>
          <div className="mx-auto max-w-5xl px-6">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: "#0B0F2E", fontFamily: "'Poppins', sans-serif", fontWeight: 700 }}>
                {t('home.compliance_title', locale)}
              </h2>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6">
              {compliance.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-full px-6 py-3 shadow-sm"
                  style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5F0" }}
                >
                  <item.icon className="h-5 w-5" style={{ color: "#D4AF37" }} />
                  <span className="text-sm font-medium" style={{ color: "#0B0F2E", fontFamily: "'Poppins', sans-serif" }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA — dark for contrast */}
        <section className="py-20 md:py-28" style={{ backgroundColor: "#0B0F2E" }}>
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: "#E8EAFC", fontFamily: "'Poppins', sans-serif", fontWeight: 700 }}>
              {t('home.cta_title', locale)}
            </h2>
            <p className="mb-10" style={{ color: "#8B90B8", fontFamily: "'Poppins', sans-serif", fontWeight: 300, lineHeight: 1.7 }}>
              {t('home.cta_subtitle', locale)}
            </p>
            <Link href="/auth/login">
              <Button
                size="lg"
                className="px-10 text-base font-semibold"
                style={{ backgroundColor: "#4191FF", color: "#FFFFFF", fontFamily: "'Poppins', sans-serif", fontWeight: 500, borderRadius: "6px" }}
              >
                {t('home.cta_button', locale)}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* FOOTER — dark */}
      <footer style={{ backgroundColor: "#0B0F2E", borderTop: "1px solid #1E2760" }} className="py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-3">
              <LexoraLogo href="/" size="md" />
              <span className="text-xs" style={{ color: "#1E2760" }}>|</span>
              <span className="text-xs" style={{ color: "#4A5490" }}>Powered by <strong style={{ color: "#E8EAFC" }}>Digital Data Solutions Ltd</strong></span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/auth/login" className="text-sm transition-colors hover:text-[#E8EAFC]" style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif" }}>
                {t('home.login', locale)}
              </Link>
              <a href="#" className="text-sm transition-colors hover:text-[#E8EAFC]" style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif" }}>
                {t('home.contact', locale)}
              </a>
            </div>
          </div>
          <div className="mt-8 pt-6 text-center" style={{ borderTop: "1px solid #1E2760" }}>
            <p className="text-sm" style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif", fontWeight: 300 }}>
              {t('home.footer_tagline', locale)}
            </p>
            <p className="mt-2 text-xs" style={{ color: "#4A5490" }}>
              &copy; {new Date().getFullYear()} LE<span style={{ color: "#D4AF37" }}>X</span>ORA — Digital Data Solutions Ltd. {locale === 'fr' ? 'Tous droits réservés.' : 'All rights reserved.'}
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
