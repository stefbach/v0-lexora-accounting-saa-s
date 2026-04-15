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
} from "@/components/ui/motion"
import { NeuralNetworkScene } from "@/components/NeuralNetworkScene"
import { PricingShowcase } from "@/components/PricingShowcase"
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
            <a href="#offres" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
              {locale === "fr" ? "Offres" : "Offers"}
            </a>
            <a href="#compliance" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
              {t('home.compliance', locale)}
            </a>
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
        {/* HERO — dark, modern two-column layout with permanent neural scene */}
        <section
          className="relative overflow-hidden py-20 md:py-28"
          style={{ backgroundColor: "#0B0F2E" }}
        >
          {/* Subtle dotted pattern (decorative, aria-hidden) */}
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 25% 25%, #D4AF37 1px, transparent 1px), radial-gradient(circle at 75% 75%, #D4AF37 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
          {/* Ambient gradient glow (decorative) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 40% 35% at 20% 30%, rgba(65,145,255,0.18) 0%, transparent 70%), radial-gradient(ellipse 40% 35% at 80% 70%, rgba(212,175,55,0.12) 0%, transparent 70%)",
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
                      <Link href="/auth/login">
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

                {/* Trust bar — micro-stats strip */}
                <FadeSlide delay={0.32} y={10}>
                  <ul
                    className="mt-10 grid max-w-md grid-cols-3 gap-3 sm:max-w-lg lg:mx-0"
                    style={{ fontFamily: "'Poppins', sans-serif" }}
                  >
                    {[
                      { value: "6", label: locale === "fr" ? "Agents IA" : "AI agents" },
                      { value: "24/7", label: locale === "fr" ? "Temps réel" : "Real-time" },
                      { value: "100%", label: "MRA" },
                    ].map((s) => (
                      <li
                        key={s.label}
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
                          {s.value}
                        </div>
                        <div className="text-xs" style={{ color: "#A8AFC7" }}>
                          {s.label}
                        </div>
                      </li>
                    ))}
                  </ul>
                </FadeSlide>
              </div>

              {/* RIGHT — permanent neural network animation (visual anchor) */}
              <FadeSlide delay={0.2} y={24}>
                <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-4 rounded-[32px]"
                    style={{
                      background:
                        "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(65,145,255,0.18) 0%, transparent 70%)",
                    }}
                  />
                  <NeuralNetworkScene
                    className="relative"
                    ariaLabel={
                      locale === "fr"
                        ? "Illustration animée : 6 agents IA connectés au cœur Lexora"
                        : "Animated illustration: 6 AI agents connected to the Lexora core"
                    }
                  />
                </div>
              </FadeSlide>
            </div>
          </div>
        </section>

        {/* FEATURES — white
            §7 animation: Reveal (fade+translateY 450ms) on heading,
            StaggerGroup with 45ms per card; §4 consistent card styling;
            §2 HoverLift (scale+y) for press/hover feedback. */}
        <section id="features" className="py-20 md:py-28" style={{ backgroundColor: "#FFFFFF" }}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: "#0B0F2E", fontFamily: "'Poppins', sans-serif", fontWeight: 700 }}>
                {t('home.smart_modules', locale)}
              </h2>
              <p className="mx-auto max-w-2xl" style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif", fontWeight: 300, lineHeight: 1.7 }}>
                {t('home.smart_modules_desc', locale)}
              </p>
            </Reveal>

            <StaggerGroup className="grid gap-8 md:grid-cols-2 lg:grid-cols-3" staggerMs={45}>
              {features.map((feature) => (
                <StaggerItem key={feature.title}>
                  <HoverLift lift={4} className="h-full">
                    <Card
                      className="group h-full"
                      style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5F0", borderRadius: "12px" }}
                    >
                      <CardHeader className="pb-3">
                        <div
                          className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
                          style={{ backgroundColor: "rgba(65,145,255,0.08)" }}
                        >
                          <feature.icon className="h-6 w-6" style={{ color: "#4191FF" }} aria-hidden="true" />
                        </div>
                        <CardTitle className="text-lg" style={{ color: "#0B0F2E", fontFamily: "'Poppins', sans-serif", fontWeight: 500 }}>
                          {feature.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {feature.items.map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "#4A5490" }}>
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#D4AF37" }} aria-hidden="true" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  </HoverLift>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </div>
        </section>

        {/* AI SECTION — light grey (staggered cards, reveal heading) */}
        <section id="ai" className="py-20 md:py-28" style={{ backgroundColor: "#F0F2F8" }}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <Reveal className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: "#0B0F2E", fontFamily: "'Poppins', sans-serif", fontWeight: 700 }}>
                {locale === 'fr' ? "6 agents IA qui travaillent pour vous" : "6 AI agents working for you"}
              </h2>
              <p className="mx-auto max-w-2xl" style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif", fontWeight: 300, lineHeight: 1.7 }}>
                {locale === 'fr'
                  ? "Chaque module de Lexora est piloté par un agent IA spécialisé. Pas de saisie manuelle, pas de configuration complexe — vos agents comprennent votre entreprise et s'adaptent à vos besoins. C'est comme avoir une équipe complète d'experts qui travaille 24h/24."
                  : "Every Lexora module is powered by a specialized AI agent. No manual entry, no complex setup — your agents understand your business and adapt to your needs. It's like having a full team of experts working 24/7."}
              </p>
            </Reveal>

            <StaggerGroup className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" staggerMs={40}>
              {aiCapabilities.map((cap, i) => (
                <StaggerItem key={i}>
                  <HoverLift lift={3} className="h-full">
                    <div
                      className="flex h-full items-start gap-4 rounded-xl p-6"
                      style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5F0", borderRadius: "12px" }}
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: "#0B0F2E" }}
                      >
                        <cap.icon className="h-5 w-5 text-white" aria-hidden="true" />
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: "#4A5490", fontWeight: 300, lineHeight: 1.7 }}>{cap.text}</p>
                    </div>
                  </HoverLift>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </div>
        </section>

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

        {/* CTA — dark for contrast */}
        <section className="py-20 md:py-28" style={{ backgroundColor: "#0B0F2E" }}>
          <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
            <Reveal>
              <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: "#E8EAFC", fontFamily: "'Poppins', sans-serif", fontWeight: 700 }}>
                {t('home.cta_title', locale)}
              </h2>
              {/* §6 contrast: #A8AFC7 on #0B0F2E (~8.5:1 AAA) */}
              <p className="mb-10" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif", fontWeight: 300, lineHeight: 1.7 }}>
                {t('home.cta_subtitle', locale)}
              </p>
              <PressableWrap>
                <Link href="/auth/login">
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

      {/* FOOTER — dark
          §6 contrast: body text #A8AFC7 on #0B0F2E ≈ 8.5:1 (AAA).
          Links get an explicit target (not href="#"). */}
      <footer style={{ backgroundColor: "#0B0F2E", borderTop: "1px solid #1E2760" }} className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-3">
              <LexoraLogo href="/" size="md" />
              <span className="text-xs" style={{ color: "#1E2760" }} aria-hidden="true">|</span>
              <span className="text-xs" style={{ color: "#A8AFC7" }}>
                Powered by <strong style={{ color: "#E8EAFC" }}>Digital Data Solutions Ltd</strong>
              </span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/auth/login" className="text-sm transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
                {t('home.login', locale)}
              </Link>
              <a
                href="mailto:contact@lexora.finance"
                className="text-sm transition-colors hover:text-[#E8EAFC]"
                style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}
              >
                {t('home.contact', locale)}
              </a>
            </div>
          </div>
          <div className="mt-8 pt-6 text-center" style={{ borderTop: "1px solid #1E2760" }}>
            <p className="text-sm" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif", fontWeight: 300 }}>
              {t('home.footer_tagline', locale)}
            </p>
            <p className="mt-2 text-xs" style={{ color: "#A8AFC7" }}>
              &copy; {new Date().getFullYear()} LE<span style={{ color: "#D4AF37" }}>X</span>ORA — Digital Data Solutions Ltd. {locale === 'fr' ? 'Tous droits réservés.' : 'All rights reserved.'}
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
