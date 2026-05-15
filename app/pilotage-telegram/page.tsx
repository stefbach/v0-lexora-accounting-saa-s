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

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

/**
 * Services orchestrés depuis Telegram. Catégorisés par domaine
 * (productivité personnelle / opérations / finance) pour structurer la
 * page — au lieu d'une liste à plat indistincte.
 */
const SERVICES_PRODUCTIVITE = [
  {
    icon: CalendarDays,
    title: "Agenda & rendez-vous",
    desc: "Synchronisation Google Agenda. Propose des créneaux, crée des invitations Meet, gère les conflits, déplace les RDV à la demande.",
    bullets: ["Connexion Google OAuth", "Proposition de créneaux", "Invitations Meet automatiques", "Gestion conflits"],
  },
  {
    icon: Inbox,
    title: "Emails & communications",
    desc: "Rédige des emails en langage naturel ou par dictée. Synthétise vos messages reçus, propose des réponses contextualisées.",
    bullets: ["Rédaction par voix", "Brouillon en 1 message", "Synthèse boîte de réception", "Suivi relances"],
  },
  {
    icon: Bell,
    title: "Brief quotidien",
    desc: "Chaque matin, votre point de situation : rendez-vous, urgences, alertes financières, décisions en attente.",
    bullets: ["Agenda du jour", "Échéances fiscales", "Anomalies comptables", "Décisions à valider"],
  },
] as const

const SERVICES_OPERATIONS = [
  {
    icon: Camera,
    title: "Documents par photo",
    desc: "Une photo de facture, ticket, contrat — l'IA extrait, classifie et archive. L'écriture comptable est pré-saisie en quelques secondes.",
    bullets: ["OCR multi-langues", "Classification automatique", "Pré-affectation comptable", "Validation un clic"],
  },
  {
    icon: Clock,
    title: "Pointage & équipes",
    desc: "Vos salariés pointent en envoyant un message avec photo et GPS. Gestion des absences, congés, planning sans changer d'app.",
    bullets: ["Entrée / sortie en un message", "Photo + géolocalisation", "Validation congés", "Surveillance no-show"],
  },
  {
    icon: PenLine,
    title: "Contrats & juridique",
    desc: "Dictez le contrat à rédiger — bail, vente, prestation, NDA. L'agent juridique génère un brouillon conforme au droit mauricien.",
    bullets: ["32 types de contrats", "Droit mauricien intégré", "Génération en langage naturel", "Export PDF prêt à signer"],
  },
] as const

const SERVICES_FINANCE = [
  {
    icon: Banknote,
    title: "Banque temps réel",
    desc: "Solde, dernières transactions, alertes solde bas. Rapprochement bancaire automatique sous votre supervision conversationnelle.",
    bullets: ["Multi-banques Maurice", "Solde sur demande", "Alertes anomalies", "Validation rapprochement"],
  },
  {
    icon: Receipt,
    title: "Facturation client",
    desc: "Créez une facture par dictée vocale. L'IA identifie le client, propose les lignes depuis votre catalogue et soumet à fiscalisation MRA.",
    bullets: ["Voice-to-invoice", "Match contact existant", "Catalogue services", "Fiscalisation MRA optionnelle"],
  },
  {
    icon: TrendingUp,
    title: "Pilotage et anomalies",
    desc: "Les agents IA Lex Banque et Lex Factures détectent les récurrences, les anomalies, les impayés. Ils vous remontent ce qui mérite votre attention.",
    bullets: ["Détection récurrences", "Score santé entreprise", "Alertes impayés", "Recommandations IA"],
  },
] as const

const AGENTS = [
  { nom: "Lex Banque", role: "Rapprochement bancaire et lettrage automatique", icon: Banknote },
  { nom: "Lex Factures", role: "Analyse récurrences et factures manquantes", icon: FileText },
  { nom: "CLARA", role: "Assistant Paie & RH (Workers' Rights Act 2019)", icon: Users },
  { nom: "Agent Juridique", role: "Rédaction de contrats (32 types, droit mauricien)", icon: Scale },
  { nom: "Agent Compliance", role: "Suivi obligations MRA, ROC, FSC, TDS", icon: ShieldCheck },
  { nom: "Agent GBC", role: "IFRS, Pillar Two, Transfer Pricing, consolidation", icon: Globe },
] as const

const CONVERSATIONS = [
  {
    user: "Bloque-moi 30 min mardi matin pour appeler le banquier",
    bot: "Mardi 10h-10h30 disponible. Je crée l'événement \"Banquier MCB\" et j'invite ton équipe ?",
    icon: CalendarDays,
  },
  {
    user: "[photo facture EDM 3 850 MUR]",
    bot: "Facture EDM identifiée. Compte 606 \"Énergie\". Écriture pré-saisie pour validation.",
    icon: Camera,
  },
  {
    user: "Réponds à Jean qu'on signe vendredi 14h chez le notaire",
    bot: "Brouillon prêt. Ton : professionnel. Sujet : Signature 28/11. Je l'envoie ou tu relis ?",
    icon: Mail,
  },
  {
    user: "Solde MCB et urgences du jour",
    bot: "MCB: 1 248 590 MUR. 3 factures impayées (148k MUR). TVA J-2. Réunion à 11h.",
    icon: TrendingUp,
  },
  {
    user: "Crée un contrat de bail 25 000 MUR/mois pour Jean Dupont",
    bot: "Brouillon bail résidentiel généré. Dépôt 2 mois (Landlord Act). Preview en pièce jointe.",
    icon: Scale,
  },
  {
    user: "Quels congés à valider cette semaine ?",
    bot: "3 demandes : Marie 5j Annual, Paul 1j Sick, Léa 2j UL. Tape /valider pour les approuver.",
    icon: Users,
  },
] as const

export default function PilotageTelegramPage() {
  return (
    <div className="min-h-screen text-white" style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #1a2659 50%, ${NAVY} 100%)` }}>
      {/* Nav */}
      <nav className="border-b border-white/10 backdrop-blur-md sticky top-0 z-50" style={{ backgroundColor: `${NAVY}E6` }}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90">
            <LexoraLogo size="md" />
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/tarifs" className="text-white/80 hover:text-white">Tarifs</Link>
            <Link
              href="/inscription"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold hover:opacity-95"
              style={{ backgroundColor: GOLD, color: NAVY }}
            >
              Commencer <ArrowRight className="h-3.5 w-3.5" />
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
              <span>Lexora x Telegram — Chief of Staff IA</span>
            </div>
          </div>

          {/* Visuel 3D en pièce maîtresse */}
          <div className="relative -my-4 md:-my-8">
            <BrainOrb3DLazy height={520} />

            {/* Labels qui orbitent visuellement autour de l'orbe (impression d'actions en cours) */}
            <div className="absolute inset-0 pointer-events-none hidden lg:block">
              {[
                { label: "Agenda", x: "8%",  y: "20%", icon: CalendarDays },
                { label: "Emails", x: "82%", y: "18%", icon: Inbox },
                { label: "Banque", x: "5%",  y: "55%", icon: Banknote },
                { label: "Contrats", x: "85%", y: "50%", icon: Scale },
                { label: "OCR", x: "12%", y: "80%", icon: Camera },
                { label: "RH", x: "80%", y: "78%", icon: Users },
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
              Votre bras droit,<br />
              <span className="bg-gradient-to-r from-yellow-300 to-yellow-200 bg-clip-text text-transparent">
                disponible 24 heures sur 24
              </span>
            </h1>

            <p className="text-lg md:text-xl text-white/80 mt-6 max-w-3xl mx-auto leading-relaxed">
              Lexora sur Telegram n'est pas un chatbot. C'est un <strong className="text-white">assistant de direction</strong> qui comprend votre business :
              agenda, rendez-vous, emails, comptabilité, RH, banque, contrats. Tout ce que vous déléguiez à votre assistante,
              en <strong className="text-white">langage naturel</strong>.
            </p>

            <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
              <Link
                href="/inscription"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-bold hover:opacity-95 shadow-2xl"
                style={{ backgroundColor: GOLD, color: NAVY, boxShadow: `0 10px 40px -10px ${GOLD}80` }}
              >
                <Sparkles className="h-4 w-4" /> Activer mon assistant
              </Link>
              <Link
                href="/tarifs"
                className="inline-flex items-center gap-2 border border-white/30 text-white px-6 py-3 rounded-lg hover:bg-white/10"
              >
                Voir les tarifs <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Différenciateurs clés */}
            <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto">
              {[
                { label: "Langage naturel", value: "0 commande à apprendre" },
                { label: "Domaines couverts", value: "9 services intégrés" },
                { label: "Agents experts IA", value: "6 spécialistes" },
                { label: "Disponibilité", value: "24h / 7j" },
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
        eyebrow="Productivité personnelle"
        title="Comme une assistante de direction"
        subtitle="Agenda, emails, brief quotidien. Le travail invisible qui fait tourner une journée — délégué en un message."
        services={SERVICES_PRODUCTIVITE}
      />

      {/* Catégorie 2 — Opérations */}
      <ServicesSection
        eyebrow="Opérations terrain"
        title="Pour gérer vos équipes et vos documents"
        subtitle="Pointage, contrats, paperasse — toujours à portée du téléphone."
        services={SERVICES_OPERATIONS}
        alt
      />

      {/* Catégorie 3 — Finance */}
      <ServicesSection
        eyebrow="Pilotage financier"
        title="La situation financière en temps réel"
        subtitle="Banque, factures, indicateurs. Les bons chiffres, au bon moment, sans ouvrir l'application."
        services={SERVICES_FINANCE}
      />

      {/* Agents IA spécialisés */}
      <section className="px-4 py-16" style={{ backgroundColor: "rgba(0,0,0,0.25)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-3"
                 style={{ backgroundColor: `${GOLD}1F`, color: GOLD }}>
              <Bot className="h-3.5 w-3.5" /> ÉQUIPE D'EXPERTS IA
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">Une équipe d'experts à votre disposition</h2>
            <p className="text-white/70 mt-3 max-w-2xl mx-auto">
              Six agents spécialisés qui dialoguent entre eux et avec vous via Telegram pour résoudre les problèmes complexes.
              Vous parlez à l'assistant ; il oriente vers le bon expert.
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
                      <p className="text-xs text-white/70 mt-0.5">{a.role}</p>
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
            <h2 className="text-3xl md:text-4xl font-bold">Voici ce que vous pouvez demander</h2>
            <p className="text-white/70 mt-3">Aucune commande à mémoriser. Vous parlez normalement.</p>
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
                      <span>{c.user}</span>
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-md border rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm"
                         style={{ backgroundColor: `${GOLD}10`, borderColor: `${GOLD}55` }}>
                      <p className="text-xs font-semibold mb-1 flex items-center gap-1" style={{ color: GOLD }}>
                        <Bot className="h-3 w-3" /> Lexora
                      </p>
                      {c.bot}
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
            <h2 className="text-3xl md:text-4xl font-bold">Activation en trois minutes</h2>
            <p className="text-white/70 mt-3">Pas d'application à installer. Telegram suffit.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              { n: 1, icon: Smartphone, title: "Créez votre compte", desc: "Inscription Lexora en quelques minutes. Le module Telegram est inclus dans tous les plans." },
              { n: 2, icon: MessageCircle, title: "Lancez le bot", desc: "Ouvrez Telegram, cherchez @LexoraBot, tapez /start. Connexion par email en un clic." },
              { n: 3, icon: Zap, title: "Déléguez", desc: "Parlez normalement. L'assistant comprend, exécute, et vous tient au courant." },
            ].map(step => {
              const Icon = step.icon
              return (
                <div key={step.n} className="rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 p-6 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-3" style={{ backgroundColor: `${GOLD}20` }}>
                    <Icon className="h-7 w-7" style={{ color: GOLD }} />
                  </div>
                  <p className="text-xs font-bold tracking-wider" style={{ color: GOLD }}>ÉTAPE {step.n}</p>
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
          <h2 className="text-3xl md:text-4xl font-bold">Prêt à déléguer ?</h2>
          <p className="text-white/70 mt-3 text-lg">
            Votre assistant de direction IA est inclus dans tous les plans Lexora.
            Aucune configuration complexe, aucune app à installer.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/inscription"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-bold text-base hover:opacity-95"
              style={{ background: `linear-gradient(135deg, ${GOLD}, #f5d061)`, color: NAVY }}
            >
              Activer mon assistant
            </Link>
            <Link
              href="/tarifs"
              className="inline-flex items-center gap-2 border border-white/30 text-white px-8 py-3.5 rounded-lg hover:bg-white/10"
            >
              Voir les tarifs
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-6 px-4 text-center text-xs text-white/50">
        <p>© Lexora · <Link href="/cgu" className="hover:text-white/80">CGU</Link> · <Link href="/cgv" className="hover:text-white/80">CGV</Link> · <Link href="/protection-donnees" className="hover:text-white/80">Confidentialité</Link></p>
      </footer>
    </div>
  )
}

/**
 * Bloc d'une catégorie de services. Le param `alt` alterne le fond
 * pour créer du rythme visuel entre sections.
 */
function ServicesSection({ eyebrow, title, subtitle, services, alt }: {
  eyebrow: string
  title: string
  subtitle: string
  services: readonly { icon: any; title: string; desc: string; bullets: readonly string[] }[]
  alt?: boolean
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
              <div key={s.title} className="rounded-2xl bg-white/5 border border-white/10 p-6 hover:border-white/30 transition-colors">
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4 border border-white/20"
                     style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                  <Icon className="h-5 w-5" style={{ color: GOLD }} />
                </div>
                <h3 className="text-lg font-bold">{s.title}</h3>
                <p className="text-sm text-white/70 mt-2 leading-relaxed">{s.desc}</p>
                <ul className="mt-4 space-y-1.5">
                  {s.bullets.map(b => (
                    <li key={b} className="flex items-start gap-2 text-xs text-white/80">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color: GOLD }} />
                      <span>{b}</span>
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
