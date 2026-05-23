"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Reveal,
  StaggerGroup,
  StaggerItem,
  HoverLift,
  PressableWrap,
  FadeSlide,
  ShineSweep,
} from "@/components/ui/motion"
import { NeuralNetworkScene } from "@/components/NeuralNetworkScene"
import { PricingShowcase } from "@/components/PricingShowcase"
import { ParticleField } from "@/components/ParticleField"
import { DashboardPreview } from "@/components/DashboardPreview"
import { AnimatedCounter } from "@/components/AnimatedCounter"
import { LogoMarquee } from "@/components/LogoMarquee"
import { ScrollProgress } from "@/components/ScrollProgress"
import { LiveEconomicWidget } from "@/components/LiveEconomicWidget"
import { BrainOrb3DLazy } from "@/components/3d/BrainOrb3DLoader"
import { FourPillars } from "@/components/FourPillars"
import { TelegramShowcase } from "@/components/TelegramShowcase"
import { EcosystemBridge } from "@/components/EcosystemBridge"
import { LexoraEngineCore } from "@/components/LexoraEngineCore"
import { PcmClaudeInnovation } from "@/components/PcmClaudeInnovation"
import { NewFeatures2026 } from "@/components/NewFeatures2026"
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
  Menu,
  HeartPulse,
} from "lucide-react"

export default function HomePage() {
  const locale = getLocale()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const features = [
    {
      icon: FileSearch,
      title: locale === 'fr' ? 'OCR & Documents IA' : 'AI OCR & Documents',
      items: locale === 'fr' ? [
        'Extraction automatique des factures, reçus, relevés bancaires',
        'Classification intelligente par type de document',
      ] : [
        'Automatic extraction of invoices, receipts, bank statements',
        'Smart classification by document type',
      ],
    },
    {
      icon: BookOpen,
      title: locale === 'fr' ? 'Comptabilité intelligente' : 'Smart Accounting',
      items: locale === 'fr' ? [
        'Plan comptable mauricien natif (IFRS/IAS)',
        'Grand livre, balance, bilan & P&L automatiques',
        'Rapprochement bancaire intelligent multi-stratégies',
      ] : [
        'Native Mauritian chart of accounts (IFRS/IAS)',
        'Automatic ledger, trial balance, P&L',
        'Intelligent multi-strategy bank reconciliation',
      ],
    },
    {
      icon: FileText,
      title: locale === 'fr' ? 'Facturation & Templates IA' : 'Invoicing & AI Templates',
      items: locale === 'fr' ? [
        'Factures conformes MRA avec QR Code & IRN',
        "Templates IA : importez une ancienne facture, l'IA crée votre modèle",
        'Multi-devises (MUR, EUR, USD, GBP) avec taux de change automatiques',
      ] : [
        'MRA-compliant invoices with QR Code & IRN',
        'AI Templates: import an old invoice, AI creates your template',
        'Multi-currency (MUR, EUR, USD, GBP) with automatic FX rates',
      ],
    },
    {
      icon: Users,
      title: locale === 'fr' ? 'RH & Paie complète' : 'Full HR & Payroll',
      items: locale === 'fr' ? [
        'Bulletins de paie conformes WRA 2019',
        'Gestion congés, pointage, planning automatisé par IA',
        'Exports MRA (PAYE, CSG, NSF) en un clic',
      ] : [
        'WRA 2019 compliant payslips',
        'Leave management, attendance, AI-automated scheduling',
        'One-click MRA exports (PAYE, CSG, NSF)',
      ],
    },
    {
      icon: Scale,
      title: locale === 'fr' ? 'Juridique & Contrats IA' : 'Legal & AI Contracts',
      items: locale === 'fr' ? [
        'Générateur de contrats de travail (CDI, CDD, temps partiel) conformes WRA 2019',
        'Contrats commerciaux : prestataire, NDA, SaaS, sous-traitance',
        "Rédaction guidée par IA avec clauses légales mauriciennes",
        'Signature électronique et suivi des versions',
      ] : [
        'Employment contract generator (CDI, CDD, part-time) WRA 2019 compliant',
        'Commercial contracts: service, NDA, SaaS, subcontracting',
        'AI-guided drafting with Mauritian legal clauses',
        'E-signature and version tracking',
      ],
    },
    {
      icon: Landmark,
      title: locale === 'fr' ? 'Fiscal MRA' : 'MRA Tax',
      items: locale === 'fr' ? [
        'TVA : calcul automatique, déclaration pré-remplie',
        'IT Form 3 / IS : génération automatique',
        'Annual Return ROC : pré-remplissage intelligent',
        'FAR (Fixed Asset Register) avec amortissement automatique',
      ] : [
        'VAT: automatic calculation, pre-filled return',
        'IT Form 3 / IS: automatic generation',
        'ROC Annual Return: intelligent pre-filling',
        'FAR with automatic depreciation',
      ],
    },
    {
      // 7th module — TIBOK Santé. Flagged premium=true so the Features
      // section renders it as a dark, gold-bordered "unique worldwide"
      // card instead of the standard blue/gold alternating tile.
      icon: HeartPulse,
      title: locale === 'fr' ? 'TIBOK · Santé salariés' : 'TIBOK · Employee Health',
      items: locale === 'fr' ? [
        'Téléconsultation illimitée pour vos salariés',
        'Médecins partenaires agréés à Maurice',
        'Ordonnances digitales et suivi médical',
        'Intégré dans la paie — aucun coût additionnel par salarié',
      ] : [
        'Unlimited telemedicine for your employees',
        'Licensed partner doctors in Mauritius',
        'Digital prescriptions and medical follow-up',
        'Integrated in payroll — no extra cost per employee',
      ],
      premium: true as const,
    },
  ]

  const aiCapabilities = locale === 'fr' ? [
    { icon: Brain, text: "Agent OCR — Analyse vos documents, extrait les données et crée automatiquement les écritures comptables. Factures, relevés bancaires, reçus : tout est digitalisé en secondes." },
    { icon: GitCompareArrows, text: "Agent Rapprochement — Identifie chaque fournisseur, croise les paiements et les factures, détecte les TDS, et lettre automatiquement les écritures 401. Pense comme un vrai expert-comptable." },
    { icon: Scale, text: "Agent Juridique — Génère des contrats de travail et commerciaux conformes au droit mauricien (WRA 2019, DPA 2017, Contract Act). CDI, CDD, NDA, prestation de services — en un clic." },
    { icon: MessageSquare, text: "Agent RH — Calcule les bulletins de paie, gère les congés selon la WRA, optimise le planning et prépare les exports MRA automatiquement." },
    { icon: Sparkles, text: "Agent Fiscal — Pré-remplit vos déclarations TVA, IT Form 3, Annual Return ROC. Anticipe les échéances et vous alerte avant les pénalités." },
    { icon: Bot, text: "Agent Facturation — Crée vos factures avec le template extrait par IA de vos anciennes factures. Multi-devises, QR Code MRA, envoi automatique." },
  ] : [
    { icon: Brain, text: "OCR Agent — Analyzes your documents, extracts data and automatically creates journal entries. Invoices, bank statements, receipts: everything digitized in seconds." },
    { icon: GitCompareArrows, text: "Reconciliation Agent — Identifies each supplier, cross-references payments and invoices, detects TDS, and automatically letters 401 entries. Thinks like a real accountant." },
    { icon: Scale, text: "Legal Agent — Generates employment and commercial contracts compliant with Mauritian law (WRA 2019, DPA 2017, Contract Act). CDI, CDD, NDA, service agreements — in one click." },
    { icon: MessageSquare, text: "HR Agent — Calculates payslips, manages leave per WRA, optimizes scheduling and prepares MRA exports automatically." },
    { icon: Sparkles, text: "Tax Agent — Pre-fills your VAT returns, IT Form 3, ROC Annual Return. Anticipates deadlines and alerts you before penalties." },
    { icon: Bot, text: "Invoicing Agent — Creates invoices with AI-extracted templates from your old invoices. Multi-currency, MRA QR Code, automatic sending." },
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
      {/* Top scroll-progress indicator */}
      <ScrollProgress />

      {/* NAVBAR — dark
          UI/UX Pro Max rules applied:
          - §1 contrast: nav links use #A8AFC7 on #0B0F2E (~8.5:1, AAA).
          - §2 touch-target-size: mobile menu button is 44×44px.
          - §9 persistent-nav: menu items reachable on every breakpoint.
      */}
      <header className="sticky top-0 z-50" style={{ backgroundColor: "#0B0F2E", borderBottom: "1px solid #1E2760" }}>
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6">
          <LexoraLogo href="/" size="md" showBaseline />

          <nav aria-label={locale === "fr" ? "Navigation principale" : "Main navigation"} className="hidden gap-8 md:flex">
            <a href="#features" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
              {t('home.modules', locale)}
            </a>
            <a href="#ai" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
              {t('home.ai_intelligence', locale)}
            </a>
            <a href="#telegram" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
              Telegram
            </a>
            <a href="#engine" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
              {locale === "fr" ? "Moteur" : "Engine"}
            </a>
            <a href="#pcm-claude" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
              PCM × Claude
            </a>
            <a href="#offres" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
              {locale === "fr" ? "Offres" : "Offers"}
            </a>
            <a href="#compliance" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
              {t('home.compliance', locale)}
            </a>
            <Link href="/pilotage-telegram" className="text-sm font-medium transition-colors hover:text-[#E8EAFC] inline-flex items-center gap-1" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
              {locale === 'fr' ? 'Assistant IA' : 'AI Assistant'}
            </Link>
            <Link href="/tarifs" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}>
              Tarifs
            </Link>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcherLight />

            {/* Desktop login */}
            <Link href="/auth/login" className="hidden md:inline-flex">
              <Button
                variant="outline"
                size="sm"
                className="border-[#4191FF] text-[#4191FF] hover:bg-[#4191FF]/10"
                style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 500 }}
              >
                {t('home.login', locale)}
              </Button>
            </Link>

            {/* Mobile menu trigger — 44×44px touch target */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden h-11 w-11 hover:bg-white/5"
                  style={{ color: "#E8EAFC" }}
                  aria-label={locale === "fr" ? "Ouvrir le menu" : "Open menu"}
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-[300px] border-l-0 p-0"
                style={{ backgroundColor: "#0E1338", borderLeft: "1px solid #1E2760" }}
              >
                <SheetTitle className="sr-only">
                  {locale === "fr" ? "Menu de navigation" : "Navigation menu"}
                </SheetTitle>
                <div className="flex h-full flex-col px-6 pb-8 pt-10">
                  <nav aria-label={locale === "fr" ? "Navigation mobile" : "Mobile navigation"} className="flex flex-col gap-1">
                    {[
                      { href: "#features", label: t('home.modules', locale) },
                      { href: "#ai", label: t('home.ai_intelligence', locale) },
                      { href: "#offres", label: locale === "fr" ? "Offres" : "Offers" },
                      { href: "#compliance", label: t('home.compliance', locale) },
                    ].map((link) => (
                      <a
                        key={link.href}
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex min-h-11 items-center rounded-lg px-3 text-base font-medium transition-colors hover:bg-white/5"
                        style={{ color: "#E8EAFC", fontFamily: "'Poppins', sans-serif" }}
                      >
                        {link.label}
                      </a>
                    ))}
                    <Link
                      href="/pilotage-telegram"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex min-h-11 items-center rounded-lg px-3 text-base font-medium transition-colors hover:bg-white/5"
                      style={{ color: "#E8EAFC", fontFamily: "'Poppins', sans-serif" }}
                    >
                      {locale === 'fr' ? 'Assistant IA' : 'AI Assistant'}
                    </Link>
                    <Link
                      href="/tarifs"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex min-h-11 items-center rounded-lg px-3 text-base font-medium transition-colors hover:bg-white/5"
                      style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}
                    >
                      Tarifs
                    </Link>
                  </nav>

                  <div className="mt-auto flex flex-col gap-3 pt-8">
                    <Link href="/auth/login" onClick={() => setMobileMenuOpen(false)}>
                      <Button
                        variant="outline"
                        className="w-full border-[#4191FF] text-[#4191FF] hover:bg-[#4191FF]/10"
                        style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 500 }}
                      >
                        {t('home.login', locale)}
                      </Button>
                    </Link>
                    <Link href="/auth/login" onClick={() => setMobileMenuOpen(false)}>
                      <Button
                        className="w-full"
                        style={{ backgroundColor: "#4191FF", color: "#FFFFFF", fontFamily: "'Poppins', sans-serif", fontWeight: 500, borderRadius: "6px" }}
                      >
                        {t('home.get_started', locale)}
                      </Button>
                    </Link>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO — dark, modern 2-column with live neural particle field bg */}
        <section
          className="relative overflow-hidden py-20 md:py-28"
          style={{ backgroundColor: "#0B0F2E" }}
        >
          {/* Live particle field — neurons constantly moving */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ opacity: 0.55 }}
          >
            <ParticleField
              density={0.9}
              color="rgba(65,145,255,0.75)"
              linkColor="rgba(65,145,255,0.22)"
              linkDistance={140}
              speed={0.28}
            />
          </div>
          {/* Ambient gradient glow (decorative) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 40% 35% at 20% 30%, rgba(65,145,255,0.20) 0%, transparent 70%), radial-gradient(ellipse 40% 35% at 80% 70%, rgba(212,175,55,0.14) 0%, transparent 70%)",
            }}
          />

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
              {/* LEFT — copy + CTAs */}
              <div className="text-center lg:text-left">
                <FadeSlide delay={0} y={18}>
                  <Badge
                    className="mb-6 border-0 px-4 py-1.5 text-sm font-medium"
                    style={{ backgroundColor: "rgba(212,175,55,0.12)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.25)", fontFamily: "'Poppins', sans-serif" }}
                  >
                    <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t('home.hero_badge', locale)}
                  </Badge>
                </FadeSlide>

                <FadeSlide delay={0.08} y={20}>
                  <h1
                    className="mb-6 text-4xl font-bold tracking-tight md:text-6xl lg:text-[64px] lg:leading-[1.05]"
                    style={{ color: "#E8EAFC", fontFamily: "'Poppins', sans-serif", letterSpacing: "-0.02em" }}
                  >
                    <span style={{ letterSpacing: "0.04em" }}>LE<span style={{ color: "#D4AF37" }}>X</span>ORA</span>
                    <br />
                    <span
                      className="block text-2xl md:text-4xl lg:text-[40px] lg:leading-[1.15]"
                      style={{ fontWeight: 400 }}
                    >
                      {locale === "fr" ? (
                        <>
                          <span>L&apos;ERP piloté par l&apos;</span>
                          <span
                            style={{
                              backgroundImage:
                                "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                              WebkitBackgroundClip: "text",
                              backgroundClip: "text",
                              color: "transparent",
                              fontWeight: 600,
                            }}
                          >
                            IA
                          </span>
                          <span> pour Maurice</span>
                        </>
                      ) : (
                        <>
                          <span>The </span>
                          <span
                            style={{
                              backgroundImage:
                                "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                              WebkitBackgroundClip: "text",
                              backgroundClip: "text",
                              color: "transparent",
                              fontWeight: 600,
                            }}
                          >
                            AI-powered
                          </span>
                          <span> ERP for Mauritius</span>
                        </>
                      )}
                    </span>
                  </h1>
                </FadeSlide>

                <FadeSlide delay={0.16} y={20}>
                  <p
                    className="mx-auto mb-8 max-w-2xl text-base md:text-lg lg:mx-0"
                    style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif", fontWeight: 300, lineHeight: 1.7 }}
                  >
                    {locale === "fr"
                      ? "Avec Lexora, ce n'est pas un simple logiciel que vous prenez — c'est toute une équipe d'agents IA qui va vous accompagner à chaque étape. Comptabilité, RH, juridique, fiscal : chaque module est piloté par l'intelligence artificielle et greffé aux services experts de Lexora."
                      : "With Lexora, you're not just getting software — you're getting an entire team of AI agents supporting you at every step. Accounting, HR, legal, tax: every module is AI-powered and connected to Lexora's expert services."}
                  </p>
                </FadeSlide>

                <FadeSlide delay={0.24} y={12}>
                  <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start">
                    <PressableWrap>
                      <Link href="/inscription">
                        <Button
                          size="lg"
                          className="w-full px-8 text-base font-semibold sm:w-auto"
                          style={{ backgroundColor: "#4191FF", color: "#FFFFFF", fontFamily: "'Poppins', sans-serif", fontWeight: 500, borderRadius: "8px" }}
                        >
                          {t('home.get_started', locale)}
                          <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                        </Button>
                      </Link>
                    </PressableWrap>

                    <PressableWrap>
                      <a href="#features">
                        <Button
                          size="lg"
                          variant="outline"
                          className="w-full px-8 text-base font-semibold sm:w-auto"
                          style={{ border: "1px solid rgba(65,145,255,0.45)", color: "#E8EAFC", backgroundColor: "rgba(232,234,252,0.04)", fontFamily: "'Poppins', sans-serif", fontWeight: 500, borderRadius: "8px" }}
                        >
                          {t('home.watch_demo', locale)}
                        </Button>
                      </a>
                    </PressableWrap>
                  </div>
                </FadeSlide>

                {/* Trust bar — micro-stats strip with animated counters */}
                <FadeSlide delay={0.32} y={10}>
                  <ul
                    className="mt-10 grid max-w-md grid-cols-3 gap-3 sm:max-w-lg lg:mx-0"
                    style={{ fontFamily: "'Poppins', sans-serif" }}
                  >
                    <li
                      className="rounded-xl px-4 py-3 text-center sm:text-left"
                      style={{
                        backgroundColor: "rgba(232,234,252,0.04)",
                        border: "1px solid rgba(232,234,252,0.08)",
                      }}
                    >
                      <div
                        className="text-xl font-bold md:text-2xl"
                        style={{ color: "#E8EAFC", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}
                      >
                        <AnimatedCounter value={6} suffix="" duration={1.2} />
                      </div>
                      <div className="text-xs" style={{ color: "#A8AFC7" }}>
                        {locale === "fr" ? "Agents IA" : "AI agents"}
                      </div>
                    </li>
                    <li
                      className="rounded-xl px-4 py-3 text-center sm:text-left"
                      style={{
                        backgroundColor: "rgba(232,234,252,0.04)",
                        border: "1px solid rgba(232,234,252,0.08)",
                      }}
                    >
                      <div
                        className="text-xl font-bold md:text-2xl"
                        style={{ color: "#E8EAFC", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}
                      >
                        24/7
                      </div>
                      <div className="text-xs" style={{ color: "#A8AFC7" }}>
                        {locale === "fr" ? "Temps réel" : "Real-time"}
                      </div>
                    </li>
                    <li
                      className="rounded-xl px-4 py-3 text-center sm:text-left"
                      style={{
                        backgroundColor: "rgba(232,234,252,0.04)",
                        border: "1px solid rgba(232,234,252,0.08)",
                      }}
                    >
                      <div
                        className="text-xl font-bold md:text-2xl"
                        style={{ color: "#E8EAFC", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}
                      >
                        <AnimatedCounter value={100} suffix="%" duration={1.4} />
                      </div>
                      <div className="text-xs" style={{ color: "#A8AFC7" }}>
                        MRA
                      </div>
                    </li>
                  </ul>
                </FadeSlide>
              </div>

              {/* RIGHT — 3D brain orb (WebGL shader noise displacement) */}
              <FadeSlide delay={0.2} y={24}>
                <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
                  <BrainOrb3DLazy height={540} />
                </div>
              </FadeSlide>
            </div>
          </div>
        </section>

        {/* TRUST STRIP — infinite marquee just below hero */}
        <section
          aria-label={locale === "fr" ? "Conformités et standards" : "Compliance and standards"}
          className="relative overflow-hidden py-8"
          style={{
            backgroundColor: "#0B0F2E",
            borderTop: "1px solid rgba(30,39,96,0.5)",
            borderBottom: "1px solid rgba(30,39,96,0.5)",
          }}
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div
              className="mb-5 text-center text-xs font-bold uppercase tracking-widest"
              style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}
            >
              {locale === "fr"
                ? "Conforme aux standards mauriciens et internationaux"
                : "Compliant with Mauritian and international standards"}
            </div>
            <LogoMarquee durationSec={32} />
          </div>
        </section>

        {/* FOUR PILLARS — "Dispositif unique au monde" : Compta/IA/RH/Santé */}
        <FourPillars locale={locale === "fr" ? "fr" : "en"} />

        {/* SEE LEXORA IN ACTION — dashboard preview section */}
        <section
          className="relative overflow-hidden py-20 md:py-28"
          style={{ backgroundColor: "#F8F9FC" }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 55% 45% at 50% 50%, rgba(65,145,255,0.06) 0%, transparent 70%)",
            }}
          />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
              <Reveal>
                <span
                  className="mb-5 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-widest"
                  style={{
                    backgroundColor: "rgba(65,145,255,0.08)",
                    color: "#4191FF",
                    borderColor: "rgba(65,145,255,0.22)",
                    fontFamily: "'Poppins', sans-serif",
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: "#4191FF" }}
                  />
                  {locale === "fr" ? "En temps réel" : "In real time"}
                </span>
                <h2
                  className="mb-5 text-3xl font-bold tracking-tight md:text-5xl"
                  style={{
                    color: "#0B0F2E",
                    fontFamily: "'Poppins', sans-serif",
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {locale === "fr"
                    ? "Voyez Lexora respirer"
                    : "See Lexora breathing"}
                </h2>
                <p
                  className="mb-6 text-base md:text-lg"
                  style={{
                    color: "#475569",
                    fontFamily: "'Poppins', sans-serif",
                    fontWeight: 400,
                    lineHeight: 1.7,
                  }}
                >
                  {locale === "fr"
                    ? "Vos KPIs se mettent à jour à la seconde. Chaque facture analysée, chaque bulletin émis, chaque écriture lettrée apparaît en direct dans votre tableau de bord — orchestré par les six agents IA."
                    : "Your KPIs refresh to the second. Every invoice analyzed, every payslip issued, every entry matched shows up live in your dashboard — orchestrated by the six AI agents."}
                </p>
                <ul className="space-y-3">
                  {[
                    {
                      fr: "Trésorerie consolidée multi-devises",
                      en: "Consolidated multi-currency cashflow",
                    },
                    {
                      fr: "Activité des agents IA seconde par seconde",
                      en: "AI agent activity second by second",
                    },
                    {
                      fr: "Alertes MRA avant échéance",
                      en: "MRA alerts before deadlines",
                    },
                  ].map((it, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 text-sm md:text-base"
                      style={{ color: "#0B0F2E", fontFamily: "'Poppins', sans-serif" }}
                    >
                      <span
                        aria-hidden="true"
                        className="mt-1 inline-block h-1 w-6 shrink-0 rounded-full"
                        style={{
                          background: "linear-gradient(90deg, #4191FF, #D4AF37)",
                        }}
                      />
                      <span>{locale === "fr" ? it.fr : it.en}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>

              <FadeSlide delay={0.15} y={20}>
                <DashboardPreview locale={locale === "fr" ? "fr" : "en"} />
              </FadeSlide>
            </div>
          </div>
        </section>

        {/* FEATURES — premium modules section */}
        <section
          id="features"
          className="relative overflow-hidden py-20 md:py-28"
          style={{
            background:
              "linear-gradient(180deg, #FFFFFF 0%, #F4F7FC 50%, #FFFFFF 100%)",
          }}
        >
          {/* Ambient top + bottom glows */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 60% 40% at 30% 0%, rgba(65,145,255,0.08) 0%, transparent 70%), radial-gradient(ellipse 50% 30% at 80% 100%, rgba(212,175,55,0.06) 0%, transparent 70%)",
            }}
          />
          {/* Soft dot-grid backdrop */}
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
            <Reveal className="mx-auto mb-16 max-w-3xl text-center">
              {/* Eyebrow — richer, with icon + animated live dot */}
              <span
                className="mb-6 inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(65,145,255,0.08) 0%, rgba(212,175,55,0.08) 100%)",
                  color: "#2A6FCC",
                  border: "1px solid rgba(65,145,255,0.25)",
                  fontFamily: "'Poppins', sans-serif",
                  boxShadow: "0 4px 12px -4px rgba(65,145,255,0.25)",
                }}
              >
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                    style={{ backgroundColor: "#D4AF37" }}
                  />
                  <span
                    className="relative inline-flex h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: "#D4AF37",
                      boxShadow: "0 0 6px #D4AF37",
                    }}
                  />
                </span>
                {locale === "fr" ? "7 modules intégrés · 1 plateforme" : "7 integrated modules · 1 platform"}
              </span>
              {/* H2 with gradient clip on the key word */}
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
                    Modules{" "}
                    <span
                      style={{
                        backgroundImage:
                          "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        color: "transparent",
                      }}
                    >
                      intelligents
                    </span>
                  </>
                ) : (
                  <>
                    Smart{" "}
                    <span
                      style={{
                        backgroundImage:
                          "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        color: "transparent",
                      }}
                    >
                      modules
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
                {t('home.smart_modules_desc', locale)}
              </p>
            </Reveal>

            <StaggerGroup className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" staggerMs={60}>
              {features.map((feature, idx) => {
                const total = features.length
                const totalStr = String(total).padStart(2, "0")
                const moduleNum = String(idx + 1).padStart(2, "0")
                const isPremium = (feature as { premium?: boolean }).premium === true

                if (isPremium) {
                  // 7th module — TIBOK Santé.
                  // Rendered as a full-width dark premium card: navy bg,
                  // gold border, green health accent, Crown "Exclusif"
                  // ribbon, and horizontal icon+copy layout on desktop.
                  const accent = "#2ECC8A" // TIBOK health green
                  return (
                    <StaggerItem key={feature.title} className="h-full md:col-span-2 lg:col-span-3">
                      <HoverLift lift={6} className="h-full">
                        <article
                          className="group relative flex h-full flex-col overflow-hidden rounded-2xl"
                          style={{
                            backgroundColor: "#0B0F2E",
                            border: "1px solid #D4AF37",
                            boxShadow:
                              "0 30px 80px -30px rgba(212,175,55,0.35), 0 0 0 1px rgba(212,175,55,0.22)",
                          }}
                        >
                          {/* Triple-stripe gradient (blue → gold → green) */}
                          <div
                            aria-hidden="true"
                            className="absolute inset-x-0 top-0 h-[3px]"
                            style={{
                              background:
                                "linear-gradient(90deg, #4191FF 0%, #D4AF37 50%, #2ECC8A 100%)",
                            }}
                          />

                          {/* Ambient radial gold glow */}
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0"
                            style={{
                              background:
                                "radial-gradient(ellipse 70% 80% at 30% 0%, rgba(212,175,55,0.14) 0%, transparent 70%), radial-gradient(ellipse 60% 70% at 90% 100%, rgba(46,204,138,0.10) 0%, transparent 70%)",
                            }}
                          />

                          {/* Shine sweep */}
                          <ShineSweep color="rgba(212,175,55,0.16)" duration={4.5} />

                          {/* Crown ribbon */}
                          <div
                            className="absolute right-0 top-0 rounded-bl-2xl px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest"
                            style={{
                              backgroundColor: "#D4AF37",
                              color: "#0B0F2E",
                              fontFamily: "'Poppins', sans-serif",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              zIndex: 2,
                            }}
                          >
                            <Sparkles className="h-3 w-3" aria-hidden="true" />
                            {locale === "fr" ? "Exclusif · Unique à Maurice" : "Exclusive · Unique in Mauritius"}
                          </div>

                          <div className="relative grid gap-8 p-7 md:p-10 lg:grid-cols-[auto_1fr_auto] lg:items-center lg:gap-10">
                            {/* Left — icon tile (larger, green glow) */}
                            <div className="flex items-center gap-5">
                              <div
                                className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-110"
                                style={{
                                  backgroundColor: "rgba(46,204,138,0.14)",
                                  border: "1px solid rgba(46,204,138,0.45)",
                                  boxShadow: "0 0 28px rgba(46,204,138,0.35)",
                                }}
                              >
                                <feature.icon
                                  className="h-7 w-7"
                                  style={{ color: accent }}
                                  aria-hidden="true"
                                  strokeWidth={1.8}
                                />
                                {/* Live pulse */}
                                <span
                                  aria-hidden="true"
                                  className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center"
                                >
                                  <span
                                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                                    style={{ backgroundColor: accent }}
                                  />
                                  <span
                                    className="relative inline-flex h-2 w-2 rounded-full"
                                    style={{ backgroundColor: accent }}
                                  />
                                </span>
                              </div>
                              <div className="lg:hidden">
                                <div
                                  className="text-[10px] font-bold uppercase tracking-widest"
                                  style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}
                                >
                                  {moduleNum} / {totalStr} · {locale === "fr" ? "Module Santé" : "Health Module"}
                                </div>
                                <h3
                                  className="mt-1 text-xl font-bold leading-tight md:text-2xl"
                                  style={{
                                    color: "#E8EAFC",
                                    fontFamily: "'Poppins', sans-serif",
                                    fontWeight: 700,
                                    letterSpacing: "-0.02em",
                                  }}
                                >
                                  {feature.title}
                                </h3>
                              </div>
                            </div>

                            {/* Middle — title + description + bullets */}
                            <div>
                              <div className="hidden lg:block">
                                <div
                                  className="text-[10px] font-bold uppercase tracking-widest"
                                  style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}
                                >
                                  {moduleNum} / {totalStr} · {locale === "fr" ? "Module Santé" : "Health Module"}
                                </div>
                                <h3
                                  className="mb-3 mt-1 text-2xl font-bold leading-tight md:text-3xl"
                                  style={{
                                    color: "#E8EAFC",
                                    fontFamily: "'Poppins', sans-serif",
                                    fontWeight: 700,
                                    letterSpacing: "-0.02em",
                                  }}
                                >
                                  {feature.title}
                                </h3>
                              </div>
                              <p
                                className="mb-4 text-sm md:text-base"
                                style={{
                                  color: "#A8AFC7",
                                  fontFamily: "'Poppins', sans-serif",
                                  fontWeight: 300,
                                  lineHeight: 1.65,
                                }}
                              >
                                {locale === "fr"
                                  ? "Le seul ERP mauricien qui intègre un dispositif de téléconsultation pour vos salariés. TIBOK Santé est inclus dans toutes les formules, sans coût supplémentaire."
                                  : "The only Mauritian ERP that bundles a telemedicine platform for your employees. TIBOK Health is included in every plan, at no extra cost."}
                              </p>
                              <ul className="grid gap-2 sm:grid-cols-2">
                                {feature.items.map((item, i) => (
                                  <li key={i} className="flex items-start gap-2.5 text-sm">
                                    <span
                                      aria-hidden="true"
                                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                                      style={{ backgroundColor: "rgba(46,204,138,0.18)" }}
                                    >
                                      <CheckCircle2
                                        className="h-3.5 w-3.5"
                                        style={{ color: accent }}
                                        strokeWidth={2.5}
                                      />
                                    </span>
                                    <span
                                      style={{
                                        color: "#E8EAFC",
                                        fontFamily: "'Poppins', sans-serif",
                                        lineHeight: 1.55,
                                      }}
                                    >
                                      {item}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Right — stat + CTA (visible on lg) */}
                            <div className="hidden flex-col items-end justify-center gap-3 lg:flex">
                              <div
                                className="rounded-xl px-5 py-4 text-right"
                                style={{
                                  backgroundColor: "rgba(46,204,138,0.10)",
                                  border: "1px solid rgba(46,204,138,0.28)",
                                }}
                              >
                                <div
                                  className="text-[10px] font-bold uppercase tracking-widest"
                                  style={{ color: accent, fontFamily: "'Poppins', sans-serif" }}
                                >
                                  {locale === "fr" ? "Téléconsultation" : "Telemedicine"}
                                </div>
                                <div
                                  className="text-2xl font-bold"
                                  style={{
                                    color: "#E8EAFC",
                                    fontFamily: "'Poppins', sans-serif",
                                    fontVariantNumeric: "tabular-nums",
                                    letterSpacing: "-0.02em",
                                  }}
                                >
                                  {locale === "fr" ? "Illimitée" : "Unlimited"}
                                </div>
                              </div>
                              <div
                                className="text-right text-[10px] font-medium uppercase tracking-widest"
                                style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}
                              >
                                {locale === "fr" ? "Inclus · Aucun coût" : "Included · No cost"}
                              </div>
                            </div>
                          </div>
                        </article>
                      </HoverLift>
                    </StaggerItem>
                  )
                }

                // Standard module cards (1–6)
                const accent = idx % 2 === 0 ? "#4191FF" : "#D4AF37"
                const accentDark = idx % 2 === 0 ? "#1D5FC4" : "#A88925"
                const accentSoft = idx % 2 === 0 ? "rgba(65,145,255,0.12)" : "rgba(212,175,55,0.14)"
                return (
                  <StaggerItem key={feature.title} className="h-full">
                    <HoverLift lift={8} className="h-full">
                      <article
                        className="group relative flex h-full flex-col overflow-hidden rounded-2xl transition-all duration-500"
                        style={{
                          // Multi-layer background: base → tint → subtle vignette.
                          background:
                            "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
                          border: "1px solid #D8DFED",
                          // Premium layered shadows.
                          boxShadow:
                            "0 1px 2px rgba(15,23,42,0.05), 0 24px 48px -24px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.9)",
                        }}
                      >
                        {/* Top accent stripe — thicker + gradient */}
                        <div
                          aria-hidden="true"
                          className="absolute inset-x-0 top-0 h-1"
                          style={{
                            background: `linear-gradient(90deg, transparent 0%, ${accent} 15%, ${accent} 85%, transparent 100%)`,
                            opacity: 0.9,
                          }}
                        />

                        {/* Diagonal dot-grid decoration in top-right corner */}
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute right-0 top-0 h-32 w-32 opacity-40 transition-opacity duration-500 group-hover:opacity-80"
                          style={{
                            backgroundImage: `radial-gradient(circle, ${accent}22 1px, transparent 1px)`,
                            backgroundSize: "14px 14px",
                            maskImage:
                              "linear-gradient(225deg, black 0%, transparent 70%)",
                            WebkitMaskImage:
                              "linear-gradient(225deg, black 0%, transparent 70%)",
                          }}
                        />

                        {/* Ambient hover glow from top-right corner */}
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                          style={{
                            background: `radial-gradient(circle, ${accent}33 0%, transparent 70%)`,
                          }}
                        />

                        {/* Number badge — top-right, styled tile */}
                        <div
                          className="absolute right-5 top-5 z-10 flex flex-col items-end"
                          style={{ fontFamily: "'Poppins', sans-serif" }}
                        >
                          <span
                            className="text-[9px] font-bold uppercase tracking-[0.18em]"
                            style={{ color: "#94A3B8" }}
                          >
                            {locale === "fr" ? "Module" : "Module"}
                          </span>
                          <span
                            className="text-xl font-bold leading-none"
                            style={{
                              color: accentDark,
                              fontVariantNumeric: "tabular-nums",
                              letterSpacing: "-0.02em",
                            }}
                          >
                            {moduleNum}
                            <span
                              className="ml-0.5 text-xs font-medium"
                              style={{ color: "#CBD5E1" }}
                            >
                              /{totalStr}
                            </span>
                          </span>
                        </div>

                        <div className="relative flex flex-1 flex-col p-7 md:p-8">
                          {/* Icon block — larger, with rotating ring + glow */}
                          <div className="relative mb-6">
                            {/* Rotating conic-gradient ring behind the icon */}
                            <div
                              aria-hidden="true"
                              className="pointer-events-none absolute -inset-1.5 rounded-[20px] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                              style={{
                                background: `conic-gradient(from 0deg, ${accent}00 0%, ${accent}55 25%, ${accent}00 50%, ${accent}55 75%, ${accent}00 100%)`,
                                animation:
                                  "lexora-ring-spin 6s linear infinite",
                                filter: "blur(6px)",
                              }}
                            />
                            <div
                              className="relative flex h-16 w-16 items-center justify-center rounded-2xl transition-transform duration-500 group-hover:scale-105 group-hover:rotate-[-4deg]"
                              style={{
                                background: `linear-gradient(135deg, ${accent}26 0%, ${accent}10 100%)`,
                                border: `1px solid ${accent}55`,
                                boxShadow: `0 14px 32px -10px ${accent}70, inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -12px 24px -12px ${accent}22`,
                              }}
                            >
                              <feature.icon
                                className="h-7 w-7"
                                style={{
                                  color: accentDark,
                                  filter: `drop-shadow(0 2px 4px ${accent}60)`,
                                }}
                                aria-hidden="true"
                                strokeWidth={1.8}
                              />
                            </div>
                          </div>

                          {/* Title */}
                          <h3
                            className="mb-4 text-[22px] font-bold leading-tight"
                            style={{
                              color: "#0B0F2E",
                              fontFamily: "'Poppins', sans-serif",
                              fontWeight: 700,
                              letterSpacing: "-0.02em",
                            }}
                          >
                            {feature.title}
                          </h3>

                          {/* Feature list */}
                          <ul className="flex-1 space-y-3">
                            {feature.items.map((item, i) => (
                              <li key={i} className="flex items-start gap-3 text-sm">
                                <span
                                  aria-hidden="true"
                                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                                  style={{
                                    background: `linear-gradient(135deg, ${accent}33 0%, ${accent}11 100%)`,
                                    boxShadow: `inset 0 0 0 1px ${accent}22`,
                                  }}
                                >
                                  <CheckCircle2
                                    className="h-3.5 w-3.5"
                                    style={{ color: accentDark }}
                                    strokeWidth={2.8}
                                  />
                                </span>
                                <span
                                  style={{
                                    color: "#334155",
                                    fontFamily: "'Poppins', sans-serif",
                                    lineHeight: 1.6,
                                    fontWeight: 400,
                                  }}
                                >
                                  {item}
                                </span>
                              </li>
                            ))}
                          </ul>

                          {/* Footer — now a connector row with arrow that slides on hover */}
                          <div
                            className="relative mt-7 flex items-center justify-between pt-4"
                            style={{
                              borderTop: "1px dashed #D8DFED",
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                aria-hidden="true"
                                className="inline-block h-1.5 w-1.5 rounded-full"
                                style={{
                                  backgroundColor: accent,
                                  boxShadow: `0 0 8px ${accent}80`,
                                }}
                              />
                              <span
                                className="text-[10px] font-bold uppercase tracking-[0.16em]"
                                style={{
                                  color: accentDark,
                                  fontFamily: "'Poppins', sans-serif",
                                }}
                              >
                                {locale === "fr" ? "Inclus dans chaque formule" : "Included in every plan"}
                              </span>
                            </div>
                            <ArrowRight
                              className="h-3.5 w-3.5 shrink-0 transition-transform duration-300 group-hover:translate-x-1"
                              style={{ color: accentDark }}
                              aria-hidden="true"
                            />
                          </div>
                        </div>
                      </article>
                    </HoverLift>
                  </StaggerItem>
                )
              })}
            </StaggerGroup>
          </div>
        </section>

        {/* LIVE ECONOMIC / HR INDICATORS — dark strip, data pulled from /api/public/economic-snapshot */}
        <section
          id="live-data"
          className="relative overflow-hidden py-16 md:py-20"
          style={{ backgroundColor: "#0B0F2E" }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 55% 40% at 20% 0%, rgba(65,145,255,0.10) 0%, transparent 70%), radial-gradient(ellipse 45% 40% at 90% 100%, rgba(212,175,55,0.08) 0%, transparent 70%)",
            }}
          />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
            <LiveEconomicWidget
              locale={locale === "fr" ? "fr" : "en"}
              variant="dark"
            />
          </div>
        </section>

        {/* AI SECTION — dark navy, live particle field + neural scene hero */}
        <section
          id="ai"
          className="relative overflow-hidden py-20 md:py-28"
          style={{ backgroundColor: "#0B0F2E" }}
        >
          {/* Live particle field */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ opacity: 0.45 }}
          >
            <ParticleField
              density={1}
              color="rgba(212,175,55,0.55)"
              linkColor="rgba(212,175,55,0.18)"
              linkDistance={120}
              speed={0.22}
            />
          </div>
          {/* Ambient glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(65,145,255,0.12) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(212,175,55,0.10) 0%, transparent 70%)",
            }}
          />

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal className="mb-16 text-center">
              <span
                className="mb-5 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-widest"
                style={{
                  backgroundColor: "rgba(212,175,55,0.08)",
                  color: "#D4AF37",
                  borderColor: "rgba(212,175,55,0.25)",
                  fontFamily: "'Poppins', sans-serif",
                }}
              >
                <Brain className="h-3.5 w-3.5" aria-hidden="true" />
                {locale === "fr" ? "Équipe d'agents IA" : "AI agent team"}
              </span>
              <h2
                className="mb-4 text-3xl font-bold tracking-tight md:text-5xl"
                style={{
                  color: "#E8EAFC",
                  fontFamily: "'Poppins', sans-serif",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                }}
              >
                {locale === "fr" ? (
                  <>
                    6 agents{" "}
                    <span
                      style={{
                        backgroundImage:
                          "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        color: "transparent",
                      }}
                    >
                      IA
                    </span>{" "}
                    qui travaillent pour vous
                  </>
                ) : (
                  <>
                    6{" "}
                    <span
                      style={{
                        backgroundImage:
                          "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        color: "transparent",
                      }}
                    >
                      AI agents
                    </span>{" "}
                    working for you
                  </>
                )}
              </h2>
              <p
                className="mx-auto max-w-2xl text-base md:text-lg"
                style={{
                  color: "#A8AFC7",
                  fontFamily: "'Poppins', sans-serif",
                  fontWeight: 300,
                  lineHeight: 1.7,
                }}
              >
                {locale === "fr"
                  ? "Chaque module de Lexora est piloté par un agent IA spécialisé. Pas de saisie manuelle, pas de configuration complexe — vos agents comprennent votre entreprise et s'adaptent à vos besoins."
                  : "Every Lexora module is powered by a specialized AI agent. No manual entry, no complex setup — your agents understand your business and adapt to your needs."}
              </p>
            </Reveal>

            {/* Neural network scene — visual anchor before the agent grid */}
            <Reveal className="mx-auto mb-16 w-full max-w-4xl">
              <div
                className="relative"
                style={{
                  backgroundColor: "rgba(16,24,71,0.60)",
                  border: "1px solid rgba(65,145,255,0.18)",
                  borderRadius: "24px",
                  padding: "20px",
                  backdropFilter: "blur(6px)",
                  WebkitBackdropFilter: "blur(6px)",
                  boxShadow: "0 30px 80px -30px rgba(65,145,255,0.30)",
                }}
              >
                <NeuralNetworkScene
                  ariaLabel={
                    locale === "fr"
                      ? "Illustration animée : 6 agents IA connectés au cœur Lexora"
                      : "Animated illustration: 6 AI agents connected to the Lexora core"
                  }
                />
              </div>
            </Reveal>

            <StaggerGroup className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" staggerMs={70}>
              {aiCapabilities.map((cap, i) => {
                // Split "Agent X — description" into name + body.
                const dash = cap.text.indexOf("—")
                const name =
                  dash > 0 ? cap.text.slice(0, dash).trim() : `Agent #${i + 1}`
                const body =
                  dash > 0 ? cap.text.slice(dash + 1).trim() : cap.text
                const accent = i % 2 === 0 ? "#4191FF" : "#D4AF37"
                const accentSoft =
                  i % 2 === 0
                    ? "rgba(65,145,255,0.15)"
                    : "rgba(212,175,55,0.15)"
                const num = String(i + 1).padStart(2, "0")

                return (
                  <StaggerItem key={i} className="h-full">
                    <HoverLift lift={5} className="h-full">
                      <article
                        className="group relative flex h-full flex-col overflow-hidden rounded-2xl p-6 md:p-7"
                        style={{
                          backgroundColor: "#101847",
                          border: "1px solid #1E2760",
                        }}
                      >
                        {/* Hover gradient ring */}
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                          style={{
                            background: `linear-gradient(135deg, ${accent}40 0%, transparent 40%, transparent 60%, ${accent}20 100%)`,
                            mixBlendMode: "overlay",
                          }}
                        />

                        {/* Header row: icon + big number */}
                        <div className="relative mb-5 flex items-start justify-between gap-4">
                          <div
                            className="relative flex h-12 w-12 items-center justify-center rounded-xl"
                            style={{
                              backgroundColor: accentSoft,
                              border: `1px solid ${accent}40`,
                              boxShadow: `0 0 20px ${accent}25`,
                            }}
                          >
                            <cap.icon
                              className="h-5 w-5"
                              style={{ color: accent }}
                              aria-hidden="true"
                              strokeWidth={1.8}
                            />
                            {/* Live indicator */}
                            <span
                              aria-hidden="true"
                              className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center"
                            >
                              <span
                                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                                style={{ backgroundColor: accent }}
                              />
                              <span
                                className="relative inline-flex h-2 w-2 rounded-full"
                                style={{ backgroundColor: accent }}
                              />
                            </span>
                          </div>
                          <span
                            className="text-3xl font-bold leading-none md:text-4xl"
                            style={{
                              color: "rgba(232,234,252,0.08)",
                              fontFamily: "'Poppins', sans-serif",
                              fontVariantNumeric: "tabular-nums",
                              letterSpacing: "-0.04em",
                            }}
                          >
                            {num}
                          </span>
                        </div>

                        {/* Agent name */}
                        <h3
                          className="relative mb-3 text-lg font-bold leading-tight"
                          style={{
                            color: "#E8EAFC",
                            fontFamily: "'Poppins', sans-serif",
                            fontWeight: 700,
                            letterSpacing: "-0.01em",
                          }}
                        >
                          {name}
                        </h3>

                        {/* Description */}
                        <p
                          className="relative flex-1 text-sm"
                          style={{
                            color: "#A8AFC7",
                            fontFamily: "'Poppins', sans-serif",
                            fontWeight: 300,
                            lineHeight: 1.7,
                          }}
                        >
                          {body}
                        </p>

                        {/* Status footer */}
                        <div
                          className="relative mt-5 flex items-center justify-between pt-4 text-[11px] font-medium uppercase tracking-widest"
                          style={{ borderTop: "1px solid rgba(30,39,96,0.6)" }}
                        >
                          <span style={{ color: accent, fontFamily: "'Poppins', sans-serif" }}>
                            {locale === "fr" ? "En ligne · 24/7" : "Online · 24/7"}
                          </span>
                          <span style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
                            AI · ML
                          </span>
                        </div>
                      </article>
                    </HoverLift>
                  </StaggerItem>
                )
              })}
            </StaggerGroup>
          </div>
        </section>

        {/* TELEGRAM SHOWCASE — Chief of Staff IA with 3D orbit */}
        <TelegramShowcase locale={locale === "fr" ? "fr" : "en"} />

        {/* ECOSYSTEM BRIDGE — banks, MRA, email, Claude, Google */}
        <EcosystemBridge locale={locale === "fr" ? "fr" : "en"} />

        {/* LEXORA ENGINE — PCM / SYSCOHADA / Full IFRS / GBC + Claude Code skills */}
        <LexoraEngineCore locale={locale === "fr" ? "fr" : "en"} />

        {/* PCM × CLAUDE — Innovation : PCM vivant, rapports d'expertise, évolution infinie */}
        <PcmClaudeInnovation locale={locale === "fr" ? "fr" : "en"} />

        {/* NEW FEATURES 2026 — Lex Banque, GBC Pillar Two, Bank scraping, etc. */}
        <NewFeatures2026 locale={locale === "fr" ? "fr" : "en"} />

        {/* OFFRES — Deux offres claires : Client direct + Expert-Comptable */}
        <section id="offres" className="py-20 md:py-28" style={{ backgroundColor: "#FFFFFF" }}>
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            {/* Header */}
            <Reveal className="mb-14 text-center">
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
            </Reveal>

            {/* Two offer cards side-by-side — staggered reveal */}
            <StaggerGroup className="grid gap-6 lg:grid-cols-2 lg:gap-8" staggerMs={120}>
              {/* ========================================== */}
              {/* OFFER 1 — CLIENT DIRECT (blue, light)      */}
              {/* ========================================== */}
              <StaggerItem>
              <div
                className="relative flex h-full flex-col rounded-2xl p-8 md:p-10"
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
                  <PressableWrap className="block w-full">
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
                        <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                      </Button>
                    </Link>
                  </PressableWrap>
                </div>
              </div>
              </StaggerItem>

              {/* ========================================== */}
              {/* OFFER 2 — EXPERT-COMPTABLE (dark, gold)    */}
              {/* ========================================== */}
              <StaggerItem>
              <div
                id="expert-comptable"
                className="relative flex h-full flex-col overflow-hidden rounded-2xl p-8 md:p-10"
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
                  <PressableWrap className="block w-full">
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
                        <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                      </Button>
                    </a>
                  </PressableWrap>
                </div>
              </div>
              </StaggerItem>
            </StaggerGroup>
          </div>
        </section>

        {/* PRICING — modern 4-tier showcase */}
        <PricingShowcase locale={locale === "fr" ? "fr" : "en"} />

        {/* COMPLIANCE — light grey (pills stagger in) */}
        <section id="compliance" className="py-20 md:py-28" style={{ backgroundColor: "#F0F2F8" }}>
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <Reveal className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: "#0B0F2E", fontFamily: "'Poppins', sans-serif", fontWeight: 700 }}>
                {t('home.compliance_title', locale)}
              </h2>
            </Reveal>
            <StaggerGroup className="flex flex-wrap items-center justify-center gap-6" staggerMs={35}>
              {compliance.map((item, i) => (
                <StaggerItem key={i}>
                  <div
                    className="flex items-center gap-3 rounded-full px-6 py-3 shadow-sm"
                    style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5F0" }}
                  >
                    <item.icon className="h-5 w-5" style={{ color: "#D4AF37" }} aria-hidden="true" />
                    <span className="text-sm font-medium" style={{ color: "#0B0F2E", fontFamily: "'Poppins', sans-serif" }}>
                      {item.label}
                    </span>
                  </div>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </div>
        </section>

        {/* CTA — dark with live particles + floating gold accent */}
        <section
          className="relative overflow-hidden py-20 md:py-28"
          style={{ backgroundColor: "#0B0F2E" }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ opacity: 0.5 }}
          >
            <ParticleField
              density={0.7}
              color="rgba(212,175,55,0.6)"
              linkColor="rgba(212,175,55,0.20)"
              linkDistance={150}
              speed={0.2}
            />
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 45% 50% at 50% 50%, rgba(65,145,255,0.18) 0%, transparent 70%)",
            }}
          />
          <div className="relative mx-auto max-w-3xl px-4 sm:px-6 text-center">
            <Reveal>
              <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: "#E8EAFC", fontFamily: "'Poppins', sans-serif", fontWeight: 700 }}>
                {t('home.cta_title', locale)}
              </h2>
              {/* §6 contrast: #A8AFC7 on #0B0F2E (~8.5:1 AAA) */}
              <p className="mb-10" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif", fontWeight: 300, lineHeight: 1.7 }}>
                {t('home.cta_subtitle', locale)}
              </p>
              <PressableWrap>
                <Link href="/inscription">
                  <Button
                    size="lg"
                    className="px-10 text-base font-semibold"
                    style={{ backgroundColor: "#4191FF", color: "#FFFFFF", fontFamily: "'Poppins', sans-serif", fontWeight: 500, borderRadius: "6px" }}
                  >
                    {t('home.cta_button', locale)}
                    <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                  </Button>
                </Link>
              </PressableWrap>
            </Reveal>
          </div>
        </section>
      </main>

      {/* FOOTER — dark, now with full legal menu
          §6 contrast: body text #A8AFC7 on #0B0F2E ≈ 8.5:1 (AAA).
          Links get an explicit target (not href="#"). */}
      <footer style={{ backgroundColor: "#0B0F2E", borderTop: "1px solid #1E2760" }} className="py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          {/* Top row: logo + 4 column menu */}
          <div className="grid gap-10 md:grid-cols-4">
            <div>
              <LexoraLogo href="/" size="md" showBaseline />
              <p
                className="mt-4 text-sm"
                style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif", fontWeight: 300, lineHeight: 1.7 }}
              >
                {locale === "fr"
                  ? "L'ERP mauricien piloté par l'IA — Compta, Paie, Fiscal, Juridique et Santé salariés."
                  : "The AI-driven Mauritian ERP — Accounting, Payroll, Tax, Legal and Employee Health."}
              </p>
            </div>

            <div>
              <h3
                className="mb-4 text-xs font-bold uppercase tracking-widest"
                style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}
              >
                {locale === "fr" ? "Plateforme" : "Platform"}
              </h3>
              <ul className="space-y-2.5 text-sm" style={{ fontFamily: "'Poppins', sans-serif" }}>
                <li><a href="#features" className="transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", textDecoration: "none" }}>{locale === "fr" ? "Modules" : "Modules"}</a></li>
                <li><a href="#ai" className="transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", textDecoration: "none" }}>{locale === "fr" ? "Agents IA" : "AI Agents"}</a></li>
                <li><a href="#offres" className="transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", textDecoration: "none" }}>{locale === "fr" ? "Offres" : "Offers"}</a></li>
                <li><Link href="/tarifs" className="transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", textDecoration: "none" }}>Tarifs</Link></li>
                <li><Link href="/pilotage-telegram" className="transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", textDecoration: "none" }}>{locale === 'fr' ? 'Assistant IA' : 'AI Assistant'}</Link></li>
              </ul>
            </div>

            <div>
              <h3
                className="mb-4 text-xs font-bold uppercase tracking-widest"
                style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}
              >
                {locale === "fr" ? "Ressources" : "Resources"}
              </h3>
              <ul className="space-y-2.5 text-sm" style={{ fontFamily: "'Poppins', sans-serif" }}>
                <li>
                  <Link
                    href="/auth/login"
                    className="transition-colors hover:text-[#E8EAFC]"
                    style={{ color: "#A8AFC7", textDecoration: "none" }}
                  >
                    {t('home.login', locale)}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/inscription"
                    className="transition-colors hover:text-[#E8EAFC]"
                    style={{ color: "#A8AFC7", textDecoration: "none" }}
                  >
                    {locale === "fr" ? "Nous contacter" : "Contact us"}
                  </Link>
                </li>
                <li>
                  <Link
                    href="/protection-donnees"
                    className="transition-colors hover:text-[#E8EAFC]"
                    style={{ color: "#A8AFC7", textDecoration: "none" }}
                  >
                    DPO · RGPD
                  </Link>
                </li>
                <li>
                  <Link
                    href="/inscription?role=expert"
                    className="transition-colors hover:text-[#FFE8A3]"
                    style={{ color: "#D4AF37", textDecoration: "none", fontWeight: 500 }}
                  >
                    {locale === "fr" ? "Programme Expert-Comptable" : "Accountant Program"}
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3
                className="mb-4 text-xs font-bold uppercase tracking-widest"
                style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}
              >
                {locale === "fr" ? "Légal" : "Legal"}
              </h3>
              <ul className="space-y-2.5 text-sm" style={{ fontFamily: "'Poppins', sans-serif" }}>
                <li><Link href="/mentions-legales" className="transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", textDecoration: "none" }}>{locale === "fr" ? "Mentions légales" : "Legal Notice"}</Link></li>
                <li><Link href="/cgu" className="transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", textDecoration: "none" }}>CGU</Link></li>
                <li><Link href="/cgv" className="transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", textDecoration: "none" }}>CGV</Link></li>
                <li><Link href="/protection-donnees" className="transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", textDecoration: "none" }}>{locale === "fr" ? "Protection des données" : "Data Protection"}</Link></li>
              </ul>
            </div>
          </div>

          {/* Bottom row */}
          <div className="mt-12 flex flex-col items-center justify-between gap-4 pt-6 md:flex-row" style={{ borderTop: "1px solid #1E2760" }}>
            <p className="text-xs" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
              &copy; {new Date().getFullYear()} LE<span style={{ color: "#D4AF37" }}>X</span>ORA — Digital Data Solutions Ltd. {locale === 'fr' ? 'Tous droits réservés.' : 'All rights reserved.'}
            </p>
            <p className="text-xs" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
              Bourdet Road, Grand Baie, Maurice · +230 4687378
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
