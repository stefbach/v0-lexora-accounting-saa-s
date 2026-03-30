"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { t, getLocale } from "@/lib/i18n"
import { LanguageSwitcherLight } from "@/components/LanguageSwitcher"
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

  const plans = [
    {
      name: t('home.plan.premium', locale),
      description: t('home.plan.premium_desc', locale),
      highlight: true,
      features: Array.from({ length: 13 }, (_, i) => t(`home.plan.premium_f${i + 1}`, locale)),
    },
    {
      name: t('home.plan.accounting', locale),
      description: t('home.plan.accounting_desc', locale),
      highlight: false,
      features: Array.from({ length: 9 }, (_, i) => t(`home.plan.accounting_f${i + 1}`, locale)),
    },
    {
      name: t('home.plan.hr', locale),
      description: t('home.plan.hr_desc', locale),
      highlight: false,
      features: Array.from({ length: 10 }, (_, i) => t(`home.plan.hr_f${i + 1}`, locale)),
    },
    {
      name: t('home.plan.combo', locale),
      description: t('home.plan.combo_desc', locale),
      highlight: false,
      features: Array.from({ length: 6 }, (_, i) => t(`home.plan.combo_f${i + 1}`, locale)),
    },
  ]

  const compliance = [
    { icon: Landmark, label: t('home.compliance.mra', locale) },
    { icon: Scale, label: t('home.compliance.wra', locale) },
    { icon: Building2, label: t('home.compliance.roc', locale) },
    { icon: BookOpen, label: t('home.compliance.ifrs', locale) },
    { icon: Globe, label: t('home.compliance.ias21', locale) },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="text-2xl font-bold tracking-tight" style={{ color: "#1E2A4A" }}>
            LEXORA
          </Link>
          <nav className="hidden gap-8 md:flex">
            <a href="#features" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              {t('home.modules', locale)}
            </a>
            <a href="#ai" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              {t('home.ai_intelligence', locale)}
            </a>
            <a href="#plans" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              {t('home.plans', locale)}
            </a>
            <a href="#compliance" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              {t('home.compliance', locale)}
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <LanguageSwitcherLight />
            <Link href="/auth/login">
              <Button variant="outline" size="sm">
                {t('home.login', locale)}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO */}
        <section
          className="relative overflow-hidden py-24 md:py-32"
          style={{
            background: "linear-gradient(135deg, #1E2A4A 0%, #2a3d6b 50%, #1E2A4A 100%)",
          }}
        >
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: "radial-gradient(circle at 25% 25%, #C9A84C 1px, transparent 1px), radial-gradient(circle at 75% 75%, #C9A84C 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }} />
          <div className="relative mx-auto max-w-4xl px-6 text-center">
            <Badge className="mb-6 border-0 px-4 py-1.5 text-sm font-medium" style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#C9A84C" }}>
              <Sparkles className="mr-2 h-4 w-4" />
              {t('home.hero_badge', locale)}
            </Badge>
            <h1 className="mb-6 text-4xl font-extrabold tracking-tight text-white md:text-6xl">
              {t('home.hero_title', locale)}
            </h1>
            <p className="mx-auto mb-10 max-w-2xl text-lg text-gray-300">
              {t('home.hero_subtitle', locale)}
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/auth/login">
                <Button size="lg" className="px-8 text-base font-semibold" style={{ backgroundColor: "#C9A84C", color: "#1E2A4A" }}>
                  {t('home.get_started', locale)}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="border-white/30 px-8 text-base font-semibold text-white hover:bg-white/10">
                {t('home.watch_demo', locale)}
              </Button>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: "#1E2A4A" }}>
                {t('home.smart_modules', locale)}
              </h2>
              <p className="mx-auto max-w-2xl text-gray-500">
                {t('home.smart_modules_desc', locale)}
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <Card
                  key={feature.title}
                  className="group border border-gray-100 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                >
                  <CardHeader className="pb-3">
                    <div
                      className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
                      style={{ backgroundColor: "rgba(201,168,76,0.1)" }}
                    >
                      <feature.icon className="h-6 w-6" style={{ color: "#C9A84C" }} />
                    </div>
                    <CardTitle className="text-lg" style={{ color: "#1E2A4A" }}>
                      {feature.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {feature.items.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#C9A84C" }} />
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

        {/* AI SECTION */}
        <section id="ai" className="py-20 md:py-28" style={{ backgroundColor: "#f8f9fb" }}>
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: "#1E2A4A" }}>
                {t('home.ai_at_core', locale)}
              </h2>
              <p className="mx-auto max-w-2xl text-gray-500">
                {t('home.ai_at_core_desc', locale)}
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {aiCapabilities.map((cap, i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "#1E2A4A" }}
                  >
                    <cap.icon className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-sm leading-relaxed text-gray-700">{cap.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PLANS */}
        <section id="plans" className="py-20 md:py-28">
          <div className="mx-auto max-w-5xl px-6">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: "#1E2A4A" }}>
                {t('home.adapted_plans', locale)}
              </h2>
              <p className="mx-auto max-w-2xl text-gray-500">
                {t('home.adapted_plans_desc', locale)}
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => (
                <Card
                  key={plan.name}
                  className={`relative text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                    plan.highlight ? "border-2 shadow-md" : "border border-gray-100"
                  }`}
                  style={plan.highlight ? { borderColor: "#C9A84C" } : {}}
                >
                  {plan.highlight && (
                    <div
                      className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-xs font-semibold text-white"
                      style={{ backgroundColor: "#C9A84C" }}
                    >
                      {t('home.popular', locale)}
                    </div>
                  )}
                  <CardHeader className="pb-2 pt-8">
                    <CardTitle className="text-xl" style={{ color: "#1E2A4A" }}>
                      {plan.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-8">
                    <p className="mb-4 text-sm text-gray-500">{plan.description}</p>
                    <ul className="mb-6 space-y-2 text-left">
                      {plan.features.map((f: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: "#C9A84C" }} />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Link href="/auth/login">
                      <Button
                        variant={plan.highlight ? "default" : "outline"}
                        className="w-full"
                        style={plan.highlight ? { backgroundColor: "#C9A84C", color: "#1E2A4A" } : {}}
                      >
                        {t('home.choose', locale)}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* COMPLIANCE */}
        <section id="compliance" className="py-20 md:py-28" style={{ backgroundColor: "#f8f9fb" }}>
          <div className="mx-auto max-w-5xl px-6">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold md:text-4xl" style={{ color: "#1E2A4A" }}>
                {t('home.compliance_title', locale)}
              </h2>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6">
              {compliance.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-full border border-gray-200 bg-white px-6 py-3 shadow-sm"
                >
                  <item.icon className="h-5 w-5" style={{ color: "#C9A84C" }} />
                  <span className="text-sm font-medium" style={{ color: "#1E2A4A" }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 md:py-28" style={{ backgroundColor: "#1E2A4A" }}>
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="mb-4 text-3xl font-bold text-white md:text-4xl">
              {t('home.cta_title', locale)}
            </h2>
            <p className="mb-10 text-gray-400">
              {t('home.cta_subtitle', locale)}
            </p>
            <Link href="/auth/login">
              <Button size="lg" className="px-10 text-base font-semibold" style={{ backgroundColor: "#C9A84C", color: "#1E2A4A" }}>
                {t('home.cta_button', locale)}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t bg-white py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 md:flex-row">
          <Link href="/" className="text-xl font-bold tracking-tight" style={{ color: "#1E2A4A" }}>
            LEXORA
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/auth/login" className="text-sm text-gray-600 hover:text-gray-900">
              {t('home.login', locale)}
            </Link>
            <a href="#" className="text-sm text-gray-600 hover:text-gray-900">
              {t('home.contact', locale)}
            </a>
          </div>
          <p className="text-sm text-gray-400">
            {t('home.footer_tagline', locale)}
          </p>
        </div>
      </footer>
    </div>
  )
}
