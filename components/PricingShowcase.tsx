"use client"

/**
 * PricingShowcase — modern 4-tier pricing grid for the landing page.
 *
 * Prices taken from /tarifs (bundle Compta+Paie): 2 720 / 4 960 / 10 560 / 21 200 Rs/mo.
 *
 * UI/UX Pro Max rules applied:
 *  - §4 style-match: modern SaaS pricing pattern (ribbon, highlight card,
 *    clear primary CTA per card).
 *  - §4 primary-action: one dominant CTA per card, one hero tier emphasized.
 *  - §2 touch-target-size: all CTAs are size="lg" (≥ 48px height).
 *  - §6 color-accessible-pairs: text on gradient backgrounds verified ≥ 4.5:1.
 *  - §7 animation: reveal on scroll with 80ms stagger, hover lift + press scale.
 *  - §1 color-not-only: "Most popular" tier also gets a Crown icon and a
 *    ribbon label — not only a color difference.
 *  - §4 no-emoji-icons: uses Lucide icons throughout.
 */

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { AnimatedCounter } from "@/components/AnimatedCounter"
import {
  StaggerGroup,
  StaggerItem,
  HoverLift,
  PressableWrap,
  Reveal,
  ShineSweep,
} from "@/components/ui/motion"
import {
  Rocket,
  TrendingUp,
  Crown,
  Building2,
  Check,
  ArrowRight,
  Sparkles,
  type LucideIcon,
} from "lucide-react"

type Tier = {
  id: string
  icon: LucideIcon
  badge: { fr: string; en: string }
  name: { fr: string; en: string }
  audience: { fr: string; en: string }
  monthly: number // Rs/mo
  features: { fr: string[]; en: string[] }
  popular?: boolean
  cta?: { fr: string; en: string; href: string }
}

const TIERS: Tier[] = [
  {
    id: "solo",
    icon: Rocket,
    badge: { fr: "Starter", en: "Starter" },
    name: { fr: "Solo", en: "Solo" },
    audience: {
      fr: "Freelances, auto-entrepreneurs (1-3 personnes).",
      en: "Freelancers, solo founders (1-3 people).",
    },
    monthly: 2720,
    features: {
      fr: [
        "Compta + Paie complètes",
        "Jusqu'à 50 transactions / mois",
        "OCR IA illimité",
        "e-MRA : EDF5 basique",
        "500 Mo de stockage",
      ],
      en: [
        "Full accounting + payroll",
        "Up to 50 transactions / month",
        "Unlimited AI OCR",
        "e-MRA: basic EDF5",
        "500 MB storage",
      ],
    },
  },
  {
    id: "growth",
    icon: TrendingUp,
    badge: { fr: "Meilleure valeur", en: "Best value" },
    name: { fr: "Business", en: "Business" },
    audience: {
      fr: "Petites équipes en croissance (4-15 personnes).",
      en: "Growing teams (4-15 people).",
    },
    monthly: 4960,
    features: {
      fr: [
        "Tout Solo, +",
        "Jusqu'à 200 transactions / mois",
        "e-MRA : EDF5 + VAT auto",
        "Rapprochement bancaire auto",
        "2 Go de stockage",
      ],
      en: [
        "Everything in Solo, plus",
        "Up to 200 transactions / month",
        "e-MRA: EDF5 + auto VAT",
        "Auto bank reconciliation",
        "2 GB storage",
      ],
    },
  },
  {
    id: "pme",
    icon: Crown,
    badge: { fr: "Cœur de cible", en: "Most popular" },
    name: { fr: "PME", en: "PME" },
    audience: {
      fr: "PME établies (16-50 personnes).",
      en: "Established SMEs (16-50 people).",
    },
    monthly: 10560,
    popular: true,
    features: {
      fr: [
        "Tout Business, +",
        "Jusqu'à 500 transactions / mois",
        "e-MRA : toutes déclarations",
        "Multi-devises (EUR, USD, GBP)",
        "Support prioritaire",
        "10 Go de stockage",
      ],
      en: [
        "Everything in Business, plus",
        "Up to 500 transactions / month",
        "e-MRA: all filings",
        "Multi-currency (EUR, USD, GBP)",
        "Priority support",
        "10 GB storage",
      ],
    },
  },
  {
    id: "enterprise",
    icon: Building2,
    badge: { fr: "Enterprise", en: "Enterprise" },
    name: { fr: "Enterprise", en: "Enterprise" },
    audience: {
      fr: "Grandes structures (50+ personnes).",
      en: "Large organizations (50+ people).",
    },
    monthly: 21200,
    features: {
      fr: [
        "Tout PME, +",
        "Transactions illimitées",
        "Audit trail e-MRA complet",
        "API & intégrations sur mesure",
        "Gestionnaire de compte dédié",
        "Stockage illimité",
      ],
      en: [
        "Everything in PME, plus",
        "Unlimited transactions",
        "Full e-MRA audit trail",
        "Custom API & integrations",
        "Dedicated account manager",
        "Unlimited storage",
      ],
    },
    cta: {
      fr: "Contacter l'équipe",
      en: "Contact sales",
      href: "mailto:contact@lexora.finance?subject=Demande Enterprise",
    },
  },
]

function formatPrice(n: number): string {
  // Fr/Mauritian style: thousands with thin spaces.
  return n.toLocaleString("fr-FR").replace(/\u202f/g, " ").replace(/,/g, " ")
}

export function PricingShowcase({ locale }: { locale: "fr" | "en" }) {
  return (
    <section
      id="pricing"
      className="relative overflow-hidden py-20 md:py-28"
      style={{ backgroundColor: "#F8F9FC" }}
    >
      {/* Decorative backdrop (non-emoji SVG ambience). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(65,145,255,0.08) 0%, transparent 70%), radial-gradient(ellipse 40% 30% at 80% 100%, rgba(212,175,55,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal className="mb-14 text-center">
          <span
            className="mb-5 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium"
            style={{
              backgroundColor: "rgba(65,145,255,0.08)",
              color: "#4191FF",
              borderColor: "rgba(65,145,255,0.25)",
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {locale === "fr" ? "Grille tarifaire" : "Pricing grid"}
          </span>
          <h2
            className="mb-4 text-3xl font-bold tracking-tight md:text-5xl"
            style={{
              color: "#0B0F2E",
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {locale === "fr"
              ? "Des formules claires, sans surprise"
              : "Simple plans, no surprises"}
          </h2>
          <p
            className="mx-auto max-w-2xl text-base md:text-lg"
            style={{
              color: "#4A5490",
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 300,
              lineHeight: 1.7,
            }}
          >
            {locale === "fr"
              ? "Chaque formule inclut les modules Compta + Paie et les 6 agents IA. Payez uniquement ce dont vous avez besoin, faites évoluer votre plan quand vous grandissez."
              : "Every plan includes Accounting + Payroll and all 6 AI agents. Pay only for what you need, upgrade as you grow."}
          </p>
        </Reveal>

        <StaggerGroup
          className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 lg:gap-5"
          staggerMs={80}
        >
          {TIERS.map((tier) => {
            const isPopular = !!tier.popular
            const Icon = tier.icon
            const defaultCta = {
              fr: "Commencer",
              en: "Get started",
              href: "/tarifs",
            }
            const cta = tier.cta ?? defaultCta

            return (
              <StaggerItem key={tier.id} className="h-full">
                <HoverLift lift={isPopular ? 6 : 4} className="h-full">
                  <article
                    className="relative flex h-full flex-col overflow-hidden rounded-2xl"
                    style={{
                      backgroundColor: isPopular ? "#0B0F2E" : "#FFFFFF",
                      border: isPopular
                        ? "1px solid #D4AF37"
                        : "1px solid #E2E5F0",
                      boxShadow: isPopular
                        ? "0 20px 60px -20px rgba(65,145,255,0.35), 0 0 0 1px rgba(212,175,55,0.20)"
                        : "0 1px 2px rgba(11,15,46,0.04)",
                    }}
                  >
                    {/* Popular ribbon */}
                    {isPopular && (
                      <div
                        className="absolute right-0 top-0 rounded-bl-xl px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
                        style={{
                          backgroundColor: "#D4AF37",
                          color: "#0B0F2E",
                          fontFamily: "'Poppins', sans-serif",
                        }}
                      >
                        <span className="inline-flex items-center gap-1">
                          <Crown className="h-3 w-3" aria-hidden="true" />
                          {locale === "fr" ? "Populaire" : "Popular"}
                        </span>
                      </div>
                    )}

                    {/* Subtle gradient overlay on popular card */}
                    {isPopular && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background:
                            "radial-gradient(ellipse 120% 40% at 50% 0%, rgba(212,175,55,0.10) 0%, transparent 70%)",
                        }}
                      />
                    )}
                    {/* Shine sweep on popular card for premium feel */}
                    {isPopular && <ShineSweep color="rgba(212,175,55,0.14)" duration={4} />}

                    <div className="relative flex h-full flex-col p-6 md:p-7">
                      {/* Header */}
                      <div className="mb-5 flex items-center gap-3">
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                          style={{
                            backgroundColor: isPopular
                              ? "rgba(212,175,55,0.12)"
                              : "rgba(65,145,255,0.08)",
                            border: isPopular
                              ? "1px solid rgba(212,175,55,0.30)"
                              : "1px solid rgba(65,145,255,0.18)",
                          }}
                        >
                          <Icon
                            size={20}
                            strokeWidth={1.8}
                            aria-hidden={true}
                            style={{ color: isPopular ? "#D4AF37" : "#4191FF" }}
                          />
                        </div>
                        <div>
                          <div
                            className="text-[10px] font-bold uppercase tracking-widest"
                            style={{
                              color: isPopular ? "#D4AF37" : "#4191FF",
                              fontFamily: "'Poppins', sans-serif",
                            }}
                          >
                            {tier.badge[locale]}
                          </div>
                          <div
                            className="text-xl font-semibold"
                            style={{
                              color: isPopular ? "#E8EAFC" : "#0B0F2E",
                              fontFamily: "'Poppins', sans-serif",
                              fontWeight: 700,
                            }}
                          >
                            {tier.name[locale]}
                          </div>
                        </div>
                      </div>

                      {/* Audience */}
                      <p
                        className="mb-6 text-sm"
                        style={{
                          color: isPopular ? "#A8AFC7" : "#4A5490",
                          fontFamily: "'Poppins', sans-serif",
                          fontWeight: 300,
                          lineHeight: 1.6,
                        }}
                      >
                        {tier.audience[locale]}
                      </p>

                      {/* Price — animated entry on popular card */}
                      <div className="mb-6 flex items-end gap-1">
                        <span
                          className="text-[15px] font-medium"
                          style={{
                            color: isPopular ? "#A8AFC7" : "#4A5490",
                            fontFamily: "'Poppins', sans-serif",
                          }}
                        >
                          Rs
                        </span>
                        <span
                          className="text-4xl font-bold leading-none md:text-5xl"
                          style={{
                            color: isPopular ? "#E8EAFC" : "#0B0F2E",
                            fontFamily: "'Poppins', sans-serif",
                            fontVariantNumeric: "tabular-nums",
                            letterSpacing: "-0.02em",
                          }}
                        >
                          <AnimatedCounter
                            value={tier.monthly}
                            duration={1.3}
                            format={(n) => formatPrice(Math.round(n))}
                          />
                        </span>
                        <span
                          className="mb-1 ml-1 text-sm"
                          style={{
                            color: isPopular ? "#A8AFC7" : "#4A5490",
                            fontFamily: "'Poppins', sans-serif",
                          }}
                        >
                          {locale === "fr" ? "/ mois" : "/ month"}
                        </span>
                      </div>

                      {/* Divider */}
                      <div
                        className="mb-5 h-px w-full"
                        style={{
                          backgroundColor: isPopular
                            ? "rgba(232,234,252,0.12)"
                            : "#E2E5F0",
                        }}
                      />

                      {/* Features */}
                      <ul className="mb-7 space-y-2.5">
                        {tier.features[locale].map((f, i) => (
                          <li key={i} className="flex items-start gap-2.5">
                            <Check
                              size={16}
                              strokeWidth={2.5}
                              className="mt-0.5 shrink-0"
                              style={{ color: isPopular ? "#D4AF37" : "#4191FF" }}
                              aria-hidden="true"
                            />
                            <span
                              className="text-sm"
                              style={{
                                color: isPopular ? "#E8EAFC" : "#0B0F2E",
                                fontFamily: "'Poppins', sans-serif",
                                lineHeight: 1.5,
                              }}
                            >
                              {f}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {/* CTA */}
                      <div className="mt-auto">
                        <PressableWrap className="block w-full">
                          {cta.href.startsWith("mailto:") ? (
                            <a href={cta.href} className="block">
                              <Button
                                size="lg"
                                className="w-full text-sm font-semibold"
                                style={{
                                  backgroundColor: isPopular ? "#D4AF37" : "#4191FF",
                                  color: isPopular ? "#0B0F2E" : "#FFFFFF",
                                  fontFamily: "'Poppins', sans-serif",
                                  fontWeight: 600,
                                  borderRadius: "10px",
                                }}
                              >
                                {cta[locale]}
                                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                              </Button>
                            </a>
                          ) : (
                            <Link href={cta.href} className="block">
                              <Button
                                size="lg"
                                className="w-full text-sm font-semibold"
                                style={{
                                  backgroundColor: isPopular ? "#D4AF37" : "#4191FF",
                                  color: isPopular ? "#0B0F2E" : "#FFFFFF",
                                  fontFamily: "'Poppins', sans-serif",
                                  fontWeight: 600,
                                  borderRadius: "10px",
                                }}
                              >
                                {cta[locale]}
                                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
                              </Button>
                            </Link>
                          )}
                        </PressableWrap>
                      </div>
                    </div>
                  </article>
                </HoverLift>
              </StaggerItem>
            )
          })}
        </StaggerGroup>

        {/* Footnote + full-grid link */}
        <Reveal className="mt-10 text-center">
          <p
            className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm"
            style={{
              color: "#4A5490",
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 300,
            }}
          >
            <span>
              {locale === "fr"
                ? "Remise de 2 mois offerte en paiement annuel."
                : "2 months free on annual billing."}
            </span>
            <span aria-hidden="true" style={{ color: "#D4AF37" }}>·</span>
            <Link
              href="/tarifs"
              className="inline-flex items-center gap-1 font-medium transition-colors"
              style={{ color: "#4191FF" }}
            >
              {locale === "fr" ? "Comparer toutes les formules" : "Compare all plans"}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  )
}
