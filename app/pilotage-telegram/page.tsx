"use client"

/**
 * /pilotage-telegram — Lexora x Telegram : Chief of Staff IA
 *
 * Positionnement : pas un chatbot — un assistant de direction.
 * Tout ce qu'on délègue à une assistante exécutive en langage naturel :
 *   - Agenda + RDV (Google Calendar OAuth)
 *   - Envoi / dictée d'emails
 *   - Brief quotidien (revue agenda, alertes, urgences)
 *   - Comptabilité, RH, banque, factures, contrats (orchestration agents IA)
 *   - Documents (OCR par photo)
 *
 * Pas d'emoji basse qualité — uniquement icônes lucide-react sobres.
 */

import Link from "next/link"
import {
  Sparkles, Send, MessageCircle, Camera, Mic, CalendarDays,
  Banknote, FileText, Users, Clock, Bell, Bot, ArrowRight,
  CheckCircle2, Smartphone, Zap, Scale, Globe, ShieldCheck,
  ChevronRight, Mail, Briefcase, Inbox, PenLine, Receipt,
  TrendingUp, Building2,
} from "lucide-react"
import { LexoraLogo } from "@/components/LexoraLogo"
import { BrainOrb3DLazy } from "@/components/3d/BrainOrb3DLoader"
import { t, getLocale, type Locale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

/**
 * Services orchestrés depuis Telegram. Catégorisés par domaine
 * (productivité personnelle / opérations / finance) pour structurer la
 * page — au lieu d'une liste à plat indistincte.
 */
const SERVICES_PRODUCTIVITE = [
  { icon: CalendarDays, key: "s1", titleKey: "tg.land.prod.s1.title", descKey: "tg.land.prod.s1.desc", bullets: ["tg.land.prod.s1.b1", "tg.land.prod.s1.b2", "tg.land.prod.s1.b3", "tg.land.prod.s1.b4"] },
  { icon: Inbox, key: "s2", titleKey: "tg.land.prod.s2.title", descKey: "tg.land.prod.s2.desc", bullets: ["tg.land.prod.s2.b1", "tg.land.prod.s2.b2", "tg.land.prod.s2.b3", "tg.land.prod.s2.b4"] },
  { icon: Bell, key: "s3", titleKey: "tg.land.prod.s3.title", descKey: "tg.land.prod.s3.desc", bullets: ["tg.land.prod.s3.b1", "tg.land.prod.s3.b2", "tg.land.prod.s3.b3", "tg.land.prod.s3.b4"] },
] as const

const SERVICES_OPERATIONS = [
  { icon: Camera, key: "s1", titleKey: "tg.land.ops.s1.title", descKey: "tg.land.ops.s1.desc", bullets: ["tg.land.ops.s1.b1", "tg.land.ops.s1.b2", "tg.land.ops.s1.b3", "tg.land.ops.s1.b4"] },
  { icon: Clock, key: "s2", titleKey: "tg.land.ops.s2.title", descKey: "tg.land.ops.s2.desc", bullets: ["tg.land.ops.s2.b1", "tg.land.ops.s2.b2", "tg.land.ops.s2.b3", "tg.land.ops.s2.b4"] },
  { icon: PenLine, key: "s3", titleKey: "tg.land.ops.s3.title", descKey: "tg.land.ops.s3.desc", bullets: ["tg.land.ops.s3.b1", "tg.land.ops.s3.b2", "tg.land.ops.s3.b3", "tg.land.ops.s3.b4"] },
] as const

const SERVICES_FINANCE = [
  { icon: Banknote, key: "s1", titleKey: "tg.land.fin.s1.title", descKey: "tg.land.fin.s1.desc", bullets: ["tg.land.fin.s1.b1", "tg.land.fin.s1.b2", "tg.land.fin.s1.b3", "tg.land.fin.s1.b4"] },
  { icon: Receipt, key: "s2", titleKey: "tg.land.fin.s2.title", descKey: "tg.land.fin.s2.desc", bullets: ["tg.land.fin.s2.b1", "tg.land.fin.s2.b2", "tg.land.fin.s2.b3", "tg.land.fin.s2.b4"] },
  { icon: TrendingUp, key: "s3", titleKey: "tg.land.fin.s3.title", descKey: "tg.land.fin.s3.desc", bullets: ["tg.land.fin.s3.b1", "tg.land.fin.s3.b2", "tg.land.fin.s3.b3", "tg.land.fin.s3.b4"] },
] as const

const AGENTS = [
  { nom: "Lex Banque", roleKey: "tg.land.agent.bank.role", icon: Banknote },
  { nom: "Lex Factures", roleKey: "tg.land.agent.invoices.role", icon: FileText },
  { nom: "CLARA", roleKey: "tg.land.agent.clara.role", icon: Users },
  { nom: "Agent Juridique", roleKey: "tg.land.agent.legal.role", icon: Scale },
  { nom: "Agent Compliance", roleKey: "tg.land.agent.compliance.role", icon: ShieldCheck },
  { nom: "Agent GBC", roleKey: "tg.land.agent.gbc.role", icon: Globe },
] as const

const CONVERSATIONS = [
  { userKey: "tg.land.conv.1.user", botKey: "tg.land.conv.1.bot", icon: CalendarDays },
  { userKey: "tg.land.conv.2.user", botKey: "tg.land.conv.2.bot", icon: Camera },
  { userKey: "tg.land.conv.3.user", botKey: "tg.land.conv.3.bot", icon: Mail },
  { userKey: "tg.land.conv.4.user", botKey: "tg.land.conv.4.bot", icon: TrendingUp },
  { userKey: "tg.land.conv.5.user", botKey: "tg.land.conv.5.bot", icon: Scale },
  { userKey: "tg.land.conv.6.user", botKey: "tg.land.conv.6.bot", icon: Users },
] as const

export default function PilotageTelegramPage() {
  const locale = getLocale()
  return (
    <div className="min-h-screen text-white" style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #1a2659 50%, ${NAVY} 100%)` }}>
      {/* Nav */}
      <nav className="border-b border-white/10 backdrop-blur-md sticky top-0 z-50" style={{ backgroundColor: `${NAVY}E6` }}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90">
            <LexoraLogo size="md" />
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/tarifs" className="text-white/80 hover:text-white">{t('tg.land.nav.pricing', locale)}</Link>
            <Link
              href="/inscription"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold hover:opacity-95"
              style={{ backgroundColor: GOLD, color: NAVY }}
            >
              {t('tg.land.nav.start', locale)} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero — Chief of Staff IA avec orbe 3D en pièce maîtresse */}
      <section className="relative px-4 py-12 md:py-20 overflow-hidden">
        {/* Glow décoratif autour de l'orbe */}
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            width: 800,
            height: 800,
            background: `radial-gradient(circle, ${GOLD}25 0%, transparent 60%)`,
            filter: "blur(40px)",
          }}
        />

        <div className="relative max-w-6xl mx-auto">
          {/* Badge */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium"
                 style={{ backgroundColor: `${GOLD}15`, borderColor: `${GOLD}55`, color: GOLD }}>
              <Briefcase className="h-3.5 w-3.5" />
              <span>{t('tg.land.badge', locale)}</span>
            </div>
          </div>

          {/* Visuel 3D en pièce maîtresse */}
          <div className="relative -my-4 md:-my-8">
            <BrainOrb3DLazy height={520} />

            {/* Labels qui orbitent visuellement autour de l'orbe (impression d'actions en cours) */}
            <div className="absolute inset-0 pointer-events-none hidden lg:block">
              {[
                { label: t('tg.land.orbit.agenda', locale), x: "8%",  y: "20%", icon: CalendarDays },
                { label: t('tg.land.orbit.emails', locale), x: "82%", y: "18%", icon: Inbox },
                { label: t('tg.land.orbit.bank', locale), x: "5%",  y: "55%", icon: Banknote },
                { label: t('tg.land.orbit.contracts', locale), x: "85%", y: "50%", icon: Scale },
                { label: t('tg.land.orbit.ocr', locale), x: "12%", y: "80%", icon: Camera },
                { label: t('tg.land.orbit.hr', locale), x: "80%", y: "78%", icon: Users },
              ].map(l => {
                const Icon = l.icon
                return (
                  <div
                    key={l.label}
                    className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border backdrop-blur-md animate-pulse"
                    style={{
                      left: l.x,
                      top: l.y,
                      backgroundColor: `${NAVY}D0`,
                      borderColor: `${GOLD}77`,
                      color: GOLD,
                      animationDuration: '3.5s',
                    }}
                  >
                    <Icon className="h-3 w-3" />
                    {l.label}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Titre + sous-titre */}
          <div className="relative text-center mt-6 md:-mt-4">
            <h1 className="text-4xl md:text-6xl font-black leading-tight">
              {t('tg.land.hero.title1', locale)}<br />
              <span className="bg-gradient-to-r from-yellow-300 to-yellow-200 bg-clip-text text-transparent">
                {t('tg.land.hero.title2', locale)}
              </span>
            </h1>

            <p className="text-lg md:text-xl text-white/80 mt-6 max-w-3xl mx-auto leading-relaxed">
              {t('tg.land.hero.subtitle.a', locale)} <strong className="text-white">{t('tg.land.hero.subtitle.b', locale)}</strong> {t('tg.land.hero.subtitle.c', locale)} <strong className="text-white">{t('tg.land.hero.subtitle.d', locale)}</strong>.
            </p>

            <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
              <Link
                href="/inscription"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-bold hover:opacity-95 shadow-2xl"
                style={{ backgroundColor: GOLD, color: NAVY, boxShadow: `0 10px 40px -10px ${GOLD}80` }}
              >
                <Sparkles className="h-4 w-4" /> {t('tg.land.hero.activate', locale)}
              </Link>
              <Link
                href="/tarifs"
                className="inline-flex items-center gap-2 border border-white/30 text-white px-6 py-3 rounded-lg hover:bg-white/10"
              >
                {t('tg.land.hero.seePricing', locale)} <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Différenciateurs clés */}
            <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto">
              {[
                { label: t('tg.land.diff.naturalLabel', locale), value: t('tg.land.diff.naturalValue', locale) },
                { label: t('tg.land.diff.domainsLabel', locale), value: t('tg.land.diff.domainsValue', locale) },
                { label: t('tg.land.diff.agentsLabel', locale), value: t('tg.land.diff.agentsValue', locale) },
                { label: t('tg.land.diff.availLabel', locale), value: t('tg.land.diff.availValue', locale) },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-4 border border-white/10" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                  <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: GOLD }}>{s.label}</p>
                  <p className="text-sm font-bold mt-1.5 text-white">{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Catégorie 1 — Productivité personnelle */}
      <ServicesSection
        locale={locale}
        eyebrow={t('tg.land.prod.eyebrow', locale)}
        title={t('tg.land.prod.title', locale)}
        subtitle={t('tg.land.prod.subtitle', locale)}
        services={SERVICES_PRODUCTIVITE}
      />

      {/* Catégorie 2 — Opérations */}
      <ServicesSection
        locale={locale}
        eyebrow={t('tg.land.ops.eyebrow', locale)}
        title={t('tg.land.ops.title', locale)}
        subtitle={t('tg.land.ops.subtitle', locale)}
        services={SERVICES_OPERATIONS}
        alt
      />

      {/* Catégorie 3 — Finance */}
      <ServicesSection
        locale={locale}
        eyebrow={t('tg.land.fin.eyebrow', locale)}
        title={t('tg.land.fin.title', locale)}
        subtitle={t('tg.land.fin.subtitle', locale)}
        services={SERVICES_FINANCE}
      />

      {/* Agents IA spécialisés */}
      <section className="px-4 py-16" style={{ backgroundColor: "rgba(0,0,0,0.25)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-3"
                 style={{ backgroundColor: `${GOLD}1F`, color: GOLD }}>
              <Bot className="h-3.5 w-3.5" /> {t('tg.land.agents.badge', locale).toUpperCase()}
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">{t('tg.land.agents.title', locale)}</h2>
            <p className="text-white/70 mt-3 max-w-2xl mx-auto">
              {t('tg.land.agents.subtitle', locale)}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {AGENTS.map(a => {
              const Icon = a.icon
              return (
                <div key={a.nom} className="rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 p-5">
                  <div className="flex items-start gap-3">
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0"
                         style={{ backgroundColor: `${GOLD}20` }}>
                      <Icon className="h-5 w-5" style={{ color: GOLD }} />
                    </div>
                    <div>
                      <h3 className="font-bold">{a.nom}</h3>
                      <p className="text-xs text-white/70 mt-0.5">{t(a.roleKey, locale)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Conversations exemples — chat-like */}
      <section className="px-4 py-16">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold">{t('tg.land.conv.title', locale)}</h2>
            <p className="text-white/70 mt-3">{t('tg.land.conv.subtitle', locale)}</p>
          </div>

          <div className="space-y-5">
            {CONVERSATIONS.map((c, i) => {
              const Icon = c.icon
              return (
                <div key={i} className="space-y-2">
                  <div className="flex justify-end">
                    <div className="max-w-md border border-white/20 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm flex items-center gap-2"
                         style={{ background: `linear-gradient(135deg, ${NAVY}, #1a2659)` }}>
                      <Icon className="h-4 w-4 flex-shrink-0" style={{ color: GOLD }} />
                      <span>{t(c.userKey, locale)}</span>
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-md border rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm"
                         style={{ backgroundColor: `${GOLD}10`, borderColor: `${GOLD}55` }}>
                      <p className="text-xs font-semibold mb-1 flex items-center gap-1" style={{ color: GOLD }}>
                        <Bot className="h-3 w-3" /> {t('tg.land.lexora', locale)}
                      </p>
                      {t(c.botKey, locale)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Activation */}
      <section className="px-4 py-16" style={{ backgroundColor: "rgba(0,0,0,0.25)" }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold">{t('tg.land.act.title', locale)}</h2>
            <p className="text-white/70 mt-3">{t('tg.land.act.subtitle', locale)}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              { n: 1, icon: Smartphone, title: t('tg.land.act.s1.title', locale), desc: t('tg.land.act.s1.desc', locale) },
              { n: 2, icon: MessageCircle, title: t('tg.land.act.s2.title', locale), desc: t('tg.land.act.s2.desc', locale) },
              { n: 3, icon: Zap, title: t('tg.land.act.s3.title', locale), desc: t('tg.land.act.s3.desc', locale) },
            ].map(step => {
              const Icon = step.icon
              return (
                <div key={step.n} className="rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 p-6 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-3" style={{ backgroundColor: `${GOLD}20` }}>
                    <Icon className="h-7 w-7" style={{ color: GOLD }} />
                  </div>
                  <p className="text-xs font-bold tracking-wider" style={{ color: GOLD }}>{t('tg.land.act.step', locale).toUpperCase()} {step.n}</p>
                  <h3 className="text-lg font-bold mt-1">{step.title}</h3>
                  <p className="text-sm text-white/70 mt-2">{step.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="px-4 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold">{t('tg.land.cta.title', locale)}</h2>
          <p className="text-white/70 mt-3 text-lg">
            {t('tg.land.cta.subtitle', locale)}
          </p>
          <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/inscription"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-bold text-base hover:opacity-95"
              style={{ background: `linear-gradient(135deg, ${GOLD}, #f5d061)`, color: NAVY }}
            >
              {t('tg.land.cta.activate', locale)}
            </Link>
            <Link
              href="/tarifs"
              className="inline-flex items-center gap-2 border border-white/30 text-white px-8 py-3.5 rounded-lg hover:bg-white/10"
            >
              {t('tg.land.cta.seePricing', locale)}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-6 px-4 text-center text-xs text-white/50">
        <p>© Lexora · <Link href="/cgu" className="hover:text-white/80">{t('tg.land.footer.terms', locale)}</Link> · <Link href="/cgv" className="hover:text-white/80">{t('tg.land.footer.salesTerms', locale)}</Link> · <Link href="/protection-donnees" className="hover:text-white/80">{t('tg.land.footer.privacy', locale)}</Link></p>
      </footer>
    </div>
  )
}

/**
 * Bloc d'une catégorie de services. Le param `alt` alterne le fond
 * pour créer du rythme visuel entre sections.
 */
function ServicesSection({ eyebrow, title, subtitle, services, alt, locale }: {
  eyebrow: string
  title: string
  subtitle: string
  services: readonly { icon: any; key: string; titleKey: string; descKey: string; bullets: readonly string[] }[]
  alt?: boolean
  locale: Locale
}) {
  return (
    <section className="px-4 py-16 md:py-20" style={alt ? { backgroundColor: "rgba(0,0,0,0.25)" } : undefined}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-widest font-bold mb-3" style={{ color: GOLD }}>
            {eyebrow}
          </p>
          <h2 className="text-3xl md:text-4xl font-bold">{title}</h2>
          <p className="text-white/70 mt-3 max-w-2xl mx-auto">{subtitle}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {services.map(s => {
            const Icon = s.icon
            return (
              <div key={s.key} className="rounded-2xl bg-white/5 border border-white/10 p-6 hover:border-white/30 transition-colors">
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4 border border-white/20"
                     style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                  <Icon className="h-5 w-5" style={{ color: GOLD }} />
                </div>
                <h3 className="text-lg font-bold">{t(s.titleKey, locale)}</h3>
                <p className="text-sm text-white/70 mt-2 leading-relaxed">{t(s.descKey, locale)}</p>
                <ul className="mt-4 space-y-1.5">
                  {s.bullets.map(b => (
                    <li key={b} className="flex items-start gap-2 text-xs text-white/80">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color: GOLD }} />
                      <span>{t(b, locale)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
