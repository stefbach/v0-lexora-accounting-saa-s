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
import { t } from "@/lib/i18n"
import { AnimatedCounter } from "@/components/AnimatedCounter"
import { SOCIETE_TIERS } from "@/lib/pricing/packages"
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
  badgeKey: string
  nameKey: string
  audienceKey: string
  monthly: number // Rs/mo
  featureKeys: string[]
  popular?: boolean
  cta?: { key: string; href: string }
}

/**
 * Les prix viennent de lib/pricing/packages.ts — source de vérité partagée
 * avec /tarifs et la migration 467. Ils étaient auparavant recopiés à la main
 * ici, et cette copie portait encore l'ancienne grille bundle_* (2 720 /
 * 4 960 / 10 560 / 21 200) après la refonte : le comparateur de l'accueil
 * aurait affiché des tarifs abandonnés.
 *
 * Le palier Enterprise n'apparaît pas : son prix est négocié, il n'a rien à
 * faire dans une grille de comparaison.
 */
const [ESSENTIEL, CROISSANCE, PME, CORPORATE] = SOCIETE_TIERS

const TIERS: Tier[] = [
  {
    id: "essentiel",
    icon: Rocket,
    badgeKey: "cmkt.pr.essentiel.badge",
    nameKey: "cmkt.pr.essentiel.name",
    audienceKey: "cmkt.pr.essentiel.audience",
    monthly: ESSENTIEL.monthly,
    featureKeys: [
      "cmkt.pr.essentiel.f1",
      "cmkt.pr.essentiel.f2",
      "cmkt.pr.essentiel.f3",
      "cmkt.pr.essentiel.f4",
      "cmkt.pr.essentiel.f5",
      "cmkt.pr.essentiel.f6",
    ],
  },
  {
    id: "croissance",
    icon: TrendingUp,
    badgeKey: "cmkt.pr.croissance.badge",
    nameKey: "cmkt.pr.croissance.name",
    audienceKey: "cmkt.pr.croissance.audience",
    monthly: CROISSANCE.monthly,
    popular: true,
    featureKeys: [
      "cmkt.pr.croissance.f1",
      "cmkt.pr.croissance.f2",
      "cmkt.pr.croissance.f3",
      "cmkt.pr.croissance.f4",
      "cmkt.pr.croissance.f5",
      "cmkt.pr.croissance.f6",
    ],
  },
  {
    id: "pme",
    icon: Crown,
    badgeKey: "cmkt.pr.pme.badge",
    nameKey: "cmkt.pr.pme.name",
    audienceKey: "cmkt.pr.pme.audience",
    monthly: PME.monthly,
    featureKeys: [
      "cmkt.pr.pme.f1",
      "cmkt.pr.pme.f2",
      "cmkt.pr.pme.f3",
      "cmkt.pr.pme.f4",
      "cmkt.pr.pme.f5",
      "cmkt.pr.pme.f6",
    ],
  },
  {
    id: "corporate",
    icon: Building2,
    badgeKey: "cmkt.pr.corporate.badge",
    nameKey: "cmkt.pr.corporate.name",
    audienceKey: "cmkt.pr.corporate.audience",
    monthly: CORPORATE.monthly,
    featureKeys: [
      "cmkt.pr.corporate.f1",
      "cmkt.pr.corporate.f2",
      "cmkt.pr.corporate.f3",
      "cmkt.pr.corporate.f4",
      "cmkt.pr.corporate.f5",
      "cmkt.pr.corporate.f6",
    ],
  },
]

function formatPrice(n: number): string {
  // Fr/Mauritian style: thousands with thin spaces.
  return n.toLocaleString("fr-FR").replace(/ /g, " ").replace(/,/g, " ")
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
            {t("cmkt.pr.eyebrow", locale)}
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
            {t("cmkt.pr.title", locale)}
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
            {t("cmkt.pr.subtitle", locale)}
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
              key: "cmkt.pr.cta_default",
              href: "/tarifs",
            }
            const cta = tier.cta ?? defaultCta
            const ctaLabel = t(cta.key, locale)

            return (
              <StaggerItem key={tier.id} className="h-full">
                <HoverLift lift={isPopular ? 6 : 4} className="h-full">
                  <article
                    className="relative flex h-full flex-col overflow-hidden rounded-2xl"
                    style={{
                      background: isPopular
                        ? "#0B0F2E"
                        : "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
                      border: isPopular
                        ? "1px solid #D4AF37"
                        : "1px solid #D8DFED",
                      boxShadow: isPopular
                        ? "0 30px 70px -20px rgba(65,145,255,0.40), 0 0 0 1px rgba(212,175,55,0.28), inset 0 1px 0 rgba(255,255,255,0.06)"
                        : "0 1px 2px rgba(15,23,42,0.04), 0 24px 48px -24px rgba(15,23,42,0.20), inset 0 1px 0 rgba(255,255,255,0.9)",
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
                          {t("cmkt.pr.popular", locale)}
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
                            background: isPopular
                              ? "rgba(212,175,55,0.14)"
                              : "linear-gradient(135deg, rgba(65,145,255,0.18) 0%, rgba(65,145,255,0.06) 100%)",
                            border: isPopular
                              ? "1px solid rgba(212,175,55,0.35)"
                              : "1px solid rgba(65,145,255,0.32)",
                            boxShadow: isPopular
                              ? undefined
                              : "0 10px 24px -10px rgba(65,145,255,0.40), inset 0 1px 0 rgba(255,255,255,0.6)",
                          }}
                        >
                          <Icon
                            size={20}
                            strokeWidth={1.8}
                            aria-hidden={true}
                            style={{ color: isPopular ? "#D4AF37" : "#2A6FCC" }}
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
                            {t(tier.badgeKey, locale)}
                          </div>
                          <div
                            className="text-xl font-semibold"
                            style={{
                              color: isPopular ? "#E8EAFC" : "#0B0F2E",
                              fontFamily: "'Poppins', sans-serif",
                              fontWeight: 700,
                            }}
                          >
                            {t(tier.nameKey, locale)}
                          </div>
                        </div>
                      </div>

                      {/* Audience */}
                      <p
                        className="mb-6 text-sm"
                        style={{
                          color: isPopular ? "#A8AFC7" : "#475569",
                          fontFamily: "'Poppins', sans-serif",
                          fontWeight: 300,
                          lineHeight: 1.6,
                        }}
                      >
                        {t(tier.audienceKey, locale)}
                      </p>

                      {/* Price — animated entry on popular card */}
                      <div className="mb-6 flex items-end gap-1">
                        <span
                          className="text-[15px] font-medium"
                          style={{
                            color: isPopular ? "#A8AFC7" : "#475569",
                            fontFamily: "'Poppins', sans-serif",
                          }}
                        >
                          {t("cmkt.pr.currency", locale)}
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
                            color: isPopular ? "#A8AFC7" : "#475569",
                            fontFamily: "'Poppins', sans-serif",
                          }}
                        >
                          {t("cmkt.pr.per_month", locale)}
                        </span>
                      </div>

                      {/* Divider */}
                      <div
                        className="mb-5 h-px w-full"
                        style={{
                          background: isPopular
                            ? "linear-gradient(90deg, transparent, rgba(212,175,55,0.35), transparent)"
                            : "linear-gradient(90deg, transparent, #D8DFED, transparent)",
                        }}
                      />

                      {/* Features */}
                      <ul className="mb-7 space-y-2.5">
                        {tier.featureKeys.map((key, i) => {
                          const f = t(key, locale)
                          // Highlight TIBOK (green) and Telegram (blue) lines.
                          const isTibok = /TIBOK/i.test(f)
                          const isTelegram = /telegram/i.test(f)
                          const isHighlighted = isTibok || isTelegram
                          return (
                            <li key={i} className="flex items-start gap-2.5">
                              <span
                                aria-hidden="true"
                                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                                style={{
                                  background: isTibok
                                    ? "linear-gradient(135deg, rgba(46,204,138,0.20) 0%, rgba(46,204,138,0.08) 100%)"
                                    : isTelegram
                                      ? "linear-gradient(135deg, rgba(36,164,237,0.22) 0%, rgba(36,164,237,0.08) 100%)"
                                      : isPopular
                                        ? "rgba(212,175,55,0.18)"
                                        : "linear-gradient(135deg, rgba(65,145,255,0.18) 0%, rgba(65,145,255,0.08) 100%)",
                                }}
                              >
                                <Check
                                  size={12}
                                  strokeWidth={3}
                                  style={{
                                    color: isTibok
                                      ? "#2ECC8A"
                                      : isTelegram
                                        ? "#24A4ED"
                                        : isPopular
                                          ? "#D4AF37"
                                          : "#2A6FCC",
                                  }}
                                />
                              </span>
                              <span
                                className="text-sm"
                                style={{
                                  color: isPopular ? "#E8EAFC" : "#1E293B",
                                  fontFamily: "'Poppins', sans-serif",
                                  lineHeight: 1.5,
                                  fontWeight: isHighlighted ? 600 : 400,
                                }}
                              >
                                {f}
                              </span>
                            </li>
                          )
                        })}
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
                                {ctaLabel}
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
                                {ctaLabel}
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
            <span>{t("cmkt.pr.footnote", locale)}</span>
            <span aria-hidden="true" style={{ color: "#D4AF37" }}>·</span>
            <Link
              href="/tarifs"
              className="inline-flex items-center gap-1 font-medium transition-colors"
              style={{ color: "#4191FF" }}
            >
              {t("cmkt.pr.compare", locale)}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  )
}
