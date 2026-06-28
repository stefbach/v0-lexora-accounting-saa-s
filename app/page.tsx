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

// Affichage des tarifs sur la page d'accueil. Masqué volontairement (juin 2026) :
// lancement trop tôt + repositionnement tarifaire à la hausse en cours.
// Repasser à `true` pour réafficher la section Offres + le comparateur de prix.
const SHOW_PRICING = false

export default function HomePage() {
  const locale = getLocale()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const features = [
    {
      icon: FileSearch,
      title: t('uimkt.home.feat.ocr_title', locale),
      items: [
        t('uimkt.home.feat.ocr_1', locale),
        t('uimkt.home.feat.ocr_2', locale),
      ],
    },
    {
      icon: BookOpen,
      title: t('uimkt.home.feat.accounting_title', locale),
      items: [
        t('uimkt.home.feat.accounting_1', locale),
        t('uimkt.home.feat.accounting_2', locale),
        t('uimkt.home.feat.accounting_3', locale),
      ],
    },
    {
      icon: FileText,
      title: t('uimkt.home.feat.invoicing_title', locale),
      items: [
        t('uimkt.home.feat.invoicing_1', locale),
        t('uimkt.home.feat.invoicing_2', locale),
        t('uimkt.home.feat.invoicing_3', locale),
      ],
    },
    {
      icon: Users,
      title: t('uimkt.home.feat.hr_title', locale),
      items: [
        t('uimkt.home.feat.hr_1', locale),
        t('uimkt.home.feat.hr_2', locale),
        t('uimkt.home.feat.hr_3', locale),
      ],
    },
    {
      icon: Scale,
      title: t('uimkt.home.feat.legal_title', locale),
      items: [
        t('uimkt.home.feat.legal_1', locale),
        t('uimkt.home.feat.legal_2', locale),
        t('uimkt.home.feat.legal_3', locale),
        t('uimkt.home.feat.legal_4', locale),
      ],
    },
    {
      icon: Landmark,
      title: t('uimkt.home.feat.tax_title', locale),
      items: [
        t('uimkt.home.feat.tax_1', locale),
        t('uimkt.home.feat.tax_2', locale),
        t('uimkt.home.feat.tax_3', locale),
        t('uimkt.home.feat.tax_4', locale),
      ],
    },
    {
      // 7th module — TIBOK Santé. Flagged premium=true so the Features
      // section renders it as a dark, gold-bordered "unique worldwide"
      // card instead of the standard blue/gold alternating tile.
      icon: HeartPulse,
      title: t('uimkt.home.feat.tibok_title', locale),
      items: [
        t('uimkt.home.feat.tibok_1', locale),
        t('uimkt.home.feat.tibok_2', locale),
        t('uimkt.home.feat.tibok_3', locale),
        t('uimkt.home.feat.tibok_4', locale),
      ],
      premium: true as const,
    },
  ]

  const aiCapabilities = [
    { icon: Brain, text: t('uimkt.home.ai.ocr', locale) },
    { icon: GitCompareArrows, text: t('uimkt.home.ai.reco', locale) },
    { icon: Scale, text: t('uimkt.home.ai.legal', locale) },
    { icon: MessageSquare, text: t('uimkt.home.ai.hr', locale) },
    { icon: Sparkles, text: t('uimkt.home.ai.tax', locale) },
    { icon: Bot, text: t('uimkt.home.ai.invoicing', locale) },
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

          <nav aria-label={t("uimkt.home.nav_main", locale)} className="hidden gap-8 md:flex">
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
              {t("uimkt.home.nav_engine", locale)}
            </a>
            <a href="#pcm-claude" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
              PCM × Claude
            </a>
            {SHOW_PRICING && (
            <a href="#offres" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
              {t("uimkt.home.nav_offers", locale)}
            </a>
            )}
            <a href="#compliance" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
              {t('home.compliance', locale)}
            </a>
            <Link href="/pilotage-telegram" className="text-sm font-medium transition-colors hover:text-[#E8EAFC] inline-flex items-center gap-1" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
              {t('uimkt.home.nav_assistant', locale)}
            </Link>
            {SHOW_PRICING && (
            <Link href="/tarifs" className="text-sm font-medium transition-colors hover:text-[#E8EAFC]" style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}>
              Tarifs
            </Link>
            )}
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
                  aria-label={t("uimkt.home.open_menu", locale)}
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
                  {t("uimkt.home.nav_menu", locale)}
                </SheetTitle>
                <div className="flex h-full flex-col px-6 pb-8 pt-10">
                  <nav aria-label={t("uimkt.home.nav_mobile", locale)} className="flex flex-col gap-1">
                    {[
                      { href: "#features", label: t('home.modules', locale) },
                      { href: "#ai", label: t('home.ai_intelligence', locale) },
                      ...(SHOW_PRICING ? [{ href: "#offres", label: t("uimkt.home.nav_offers", locale) }] : []),
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
                      {t('uimkt.home.nav_assistant', locale)}
                    </Link>
                    {SHOW_PRICING && (
                    <Link
                      href="/tarifs"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex min-h-11 items-center rounded-lg px-3 text-base font-medium transition-colors hover:bg-white/5"
                      style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}
                    >
                      Tarifs
                    </Link>
                    )}
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
                      <span>{t("uimkt.home.hero_l1", locale)}</span>
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
                        {t("uimkt.home.hero_gradient_word", locale)}
                      </span>
                      <span>{t("uimkt.home.hero_for_mauritius", locale)}</span>
                    </span>
                  </h1>
                </FadeSlide>

                <FadeSlide delay={0.16} y={20}>
                  <p
                    className="mx-auto mb-8 max-w-2xl text-base md:text-lg lg:mx-0"
                    style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif", fontWeight: 300, lineHeight: 1.7 }}
                  >
                    {t("uimkt.home.hero_sub", locale)}
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
                      <Link href="/rdv">
                        <Button
                          size="lg"
                          variant="outline"
                          className="w-full px-8 text-base font-semibold sm:w-auto"
                          style={{ border: "1px solid rgba(65,145,255,0.45)", color: "#E8EAFC", backgroundColor: "rgba(232,234,252,0.04)", fontFamily: "'Poppins', sans-serif", fontWeight: 500, borderRadius: "8px" }}
                        >
                          {t('home.watch_demo', locale)}
                        </Button>
                      </Link>
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
                        {t("uimkt.home.stat_agents", locale)}
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
                        {t("uimkt.home.stat_realtime", locale)}
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
          aria-label={t("uimkt.home.trust_aria", locale)}
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
              {t("uimkt.home.trust_standards", locale)}
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
                  {t("uimkt.home.realtime_eyebrow", locale)}
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
                  {t("uimkt.home.breathe_title", locale)}
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
                  {t("uimkt.home.breathe_desc", locale)}
                </p>
                <ul className="space-y-3">
                  {[
                    t("uimkt.home.breathe_1", locale),
                    t("uimkt.home.breathe_2", locale),
                    t("uimkt.home.breathe_3", locale),
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
                      <span>{it}</span>
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
                {t("uimkt.home.modules_eyebrow", locale)}
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
                {t("uimkt.home.modules_smart_pre", locale)}{" "}
                <span
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  {t("uimkt.home.modules_smart_word", locale)}
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
                            {t("uimkt.home.tibok_exclusive", locale)}
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
                                  {moduleNum} / {totalStr} · {t("uimkt.home.module_health", locale)}
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
                                  {moduleNum} / {totalStr} · {t("uimkt.home.module_health", locale)}
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
                                {t("uimkt.home.tibok_desc", locale)}
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
                                  {t("uimkt.home.teleconsult", locale)}
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
                                  {t("uimkt.home.unlimited", locale)}
                                </div>
                              </div>
                              <div
                                className="text-right text-[10px] font-medium uppercase tracking-widest"
                                style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}
                              >
                                {t("uimkt.home.included_nocost", locale)}
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
                            {t("uimkt.home.module", locale)}
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
                                {t("uimkt.home.included_every_plan", locale)}
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
                {t("uimkt.home.ai_team", locale)}
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
                {t("uimkt.home.agents6_pre", locale)}{" "}
                <span
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  {t("uimkt.home.agents6_word", locale)}
                </span>{" "}
                {t("uimkt.home.agents6_post", locale)}
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
                {t("uimkt.home.ai_section_desc", locale)}
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
                    t("uimkt.home.neural_aria", locale)
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
                            {t("uimkt.home.agent_online", locale)}
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
        {SHOW_PRICING && (
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
                {t("uimkt.home.our_offers", locale)}
              </Badge>
              <h2
                className="mb-4 text-3xl font-bold md:text-4xl"
                style={{ color: "#0B0F2E", fontFamily: "'Poppins', sans-serif", fontWeight: 700 }}
              >
                {t("uimkt.home.offers_title", locale)}
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
                {t("uimkt.home.offers_desc", locale)}
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
                      {t("uimkt.home.offer1_label", locale)}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "#8B90B8", fontFamily: "'Poppins', sans-serif" }}
                    >
                      {t("uimkt.home.offer1_access", locale)}
                    </div>
                  </div>
                </div>

                {/* Title */}
                <h3
                  className="mb-3 text-2xl md:text-3xl"
                  style={{ color: "#0B0F2E", fontFamily: "'Poppins', sans-serif", fontWeight: 700 }}
                >
                  {t("uimkt.home.offer1_title", locale)}
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
                  {t("uimkt.home.offer1_desc", locale)}
                </p>

                {/* Features */}
                <ul className="mb-6 space-y-3">
                  {[
                    t("uimkt.home.offer1_feat1", locale),
                    t("uimkt.home.offer1_feat2", locale),
                    t("uimkt.home.offer1_feat3", locale),
                    t("uimkt.home.offer1_feat4", locale),
                  ].map((item, i) => (
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
                    {t("uimkt.home.starting_at", locale)}
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
                      {t("uimkt.home.per_month", locale)}
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
                        {t("uimkt.home.view_pricing", locale)}
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
                  {t("uimkt.home.offer2_free", locale)}
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
                      {t("uimkt.home.offer2_label", locale)}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "#8B90B8", fontFamily: "'Poppins', sans-serif" }}
                    >
                      {t("uimkt.home.offer2_program", locale)}
                    </div>
                  </div>
                </div>

                {/* Title */}
                <h3
                  className="relative mb-3 text-2xl md:text-3xl"
                  style={{ color: "#E8EAFC", fontFamily: "'Poppins', sans-serif", fontWeight: 700 }}
                >
                  {t("uimkt.home.offer2_title", locale)}
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
                  {t("uimkt.home.offer2_desc", locale)}
                </p>

                {/* Features */}
                <ul className="relative mb-6 space-y-3">
                  {[
                    t("uimkt.home.offer2_feat1", locale),
                    t("uimkt.home.offer2_feat2", locale),
                    t("uimkt.home.offer2_feat3", locale),
                    t("uimkt.home.offer2_feat4", locale),
                  ].map((item, i) => (
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
                    {t("uimkt.home.firm_access", locale)}
                  </div>
                  <div
                    className="text-3xl font-bold"
                    style={{ color: "#E8EAFC", fontFamily: "'Poppins', sans-serif" }}
                  >
                    <span style={{ color: "#D4AF37", fontSize: "1.25rem" }}>Rs</span> 0
                    <span className="text-sm font-normal" style={{ color: "#8B90B8" }}>
                      {t("uimkt.home.no_commitment", locale)}
                    </span>
                  </div>
                </div>

                {/* CTA */}
                <div className="relative mt-auto">
                  <PressableWrap className="block w-full">
                    <Link
                      href="/rdv"
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
                        {t("uimkt.home.request_firm_demo", locale)}
                        <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                      </Button>
                    </Link>
                  </PressableWrap>
                </div>
              </div>
              </StaggerItem>
            </StaggerGroup>
          </div>
        </section>
        )}

        {/* PRICING — modern 4-tier showcase */}
        {SHOW_PRICING && (
          <PricingShowcase locale={locale === "fr" ? "fr" : "en"} />
        )}

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
                {t("uimkt.home.footer_tagline", locale)}
              </p>
            </div>

            <div>
              <h3
                className="mb-4 text-xs font-bold uppercase tracking-widest"
                style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}
              >
                {t("uimkt.home.footer_platform", locale)}
              </h3>
              <ul className="space-y-2.5 text-sm" style={{ fontFamily: "'Poppins', sans-serif" }}>
                <li><a href="#features" className="transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", textDecoration: "none" }}>{t("uimkt.home.footer_modules", locale)}</a></li>
                <li><a href="#ai" className="transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", textDecoration: "none" }}>{t("uimkt.home.footer_ai_agents", locale)}</a></li>
                {SHOW_PRICING && (
                <li><a href="#offres" className="transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", textDecoration: "none" }}>{t("uimkt.home.nav_offers", locale)}</a></li>
                )}
                {SHOW_PRICING && (
                <li><Link href="/tarifs" className="transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", textDecoration: "none" }}>Tarifs</Link></li>
                )}
                <li><Link href="/pilotage-telegram" className="transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", textDecoration: "none" }}>{t('uimkt.home.nav_assistant', locale)}</Link></li>
              </ul>
            </div>

            <div>
              <h3
                className="mb-4 text-xs font-bold uppercase tracking-widest"
                style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}
              >
                {t("uimkt.home.footer_resources", locale)}
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
                    {t("uimkt.home.footer_contact_us", locale)}
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
                    {t("uimkt.home.footer_expert_program", locale)}
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3
                className="mb-4 text-xs font-bold uppercase tracking-widest"
                style={{ color: "#D4AF37", fontFamily: "'Poppins', sans-serif" }}
              >
                {t("uimkt.home.footer_legal", locale)}
              </h3>
              <ul className="space-y-2.5 text-sm" style={{ fontFamily: "'Poppins', sans-serif" }}>
                <li><Link href="/mentions-legales" className="transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", textDecoration: "none" }}>{t("uimkt.home.footer_legal_notice", locale)}</Link></li>
                <li><Link href="/cgu" className="transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", textDecoration: "none" }}>CGU</Link></li>
                <li><Link href="/cgv" className="transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", textDecoration: "none" }}>CGV</Link></li>
                <li><Link href="/protection-donnees" className="transition-colors hover:text-[#E8EAFC]" style={{ color: "#A8AFC7", textDecoration: "none" }}>{t("uimkt.home.footer_data_protection", locale)}</Link></li>
              </ul>
            </div>
          </div>

          {/* Bottom row */}
          <div className="mt-12 flex flex-col items-center justify-between gap-4 pt-6 md:flex-row" style={{ borderTop: "1px solid #1E2760" }}>
            <p className="text-xs" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
              &copy; {new Date().getFullYear()} LE<span style={{ color: "#D4AF37" }}>X</span>ORA — Digital Data Solutions Ltd. {t('uimkt.home.footer_rights', locale)}
            </p>
            <p className="text-xs" style={{ color: "#A8AFC7", fontFamily: "'Poppins', sans-serif" }}>
              Bourdet Road, Grand Baie, Maurice · +230 5259 1043
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
