"use client"

/**
 * /pilotage-telegram — Vitrine des services pilotables depuis Telegram.
 *
 * Page marketing dédiée qui présente l'intégration Telegram :
 *   - OCR factures (photo → écriture comptable)
 *   - Pointage RH (in/out + photo)
 *   - Banque (solde + transactions)
 *   - Factures clients (création vocale, recherche)
 *   - Documents (rappels automatiques)
 *   - Agents IA (Lex Banque, Lex Factures, CLARA, agent juridique)
 *
 * Liens vers le bot officiel + comment activer côté client.
 */

import Link from "next/link"
import {
  Sparkles, Camera, Mic, MessageCircle, Banknote, FileText, Users,
  Clock, Bell, Send, Bot, ArrowRight, CheckCircle2, Smartphone, Zap,
  Scale, Globe, ShieldCheck, ChevronRight,
} from "lucide-react"
import { LexoraLogo } from "@/components/LexoraLogo"

const SERVICES = [
  {
    icon: Camera,
    color: "from-purple-500 to-purple-700",
    title: "OCR Factures par photo",
    desc: "Envoie une photo de facture ou ticket — l'IA extrait montants, TVA, fournisseur et crée l'écriture comptable automatiquement.",
    bullets: ["Photo ou PDF", "Lecture IA multi-langues", "Validation 1-clic", "Pré-affectation comptable"],
  },
  {
    icon: Mic,
    color: "from-emerald-500 to-emerald-700",
    title: "Création vocale de factures",
    desc: "Dictate ta facture en message vocal. L'IA transcrit, identifie le client, propose les lignes et génère la facture prête à envoyer.",
    bullets: ["Voice-to-text", "Match client existant", "Catalogue produits/services", "Fiscalisation MRA en option"],
  },
  {
    icon: Banknote,
    color: "from-blue-500 to-blue-700",
    title: "Banque temps réel",
    desc: "Solde de chaque compte, dernières transactions, alertes — depuis Telegram. Pilotage du rapprochement automatique aussi.",
    bullets: ["Multi-banques Maurice", "Solde sur demande", "Alerte solde bas", "Notifs transactions importantes"],
  },
  {
    icon: Clock,
    color: "from-amber-500 to-amber-700",
    title: "Pointage RH terrain",
    desc: "Tes salariés pointent en envoyant 'IN' ou 'OUT' avec une photo + GPS. Gestion absences, congés, planning depuis le bot.",
    bullets: ["Entrée/sortie en 1 message", "Photo + GPS auto", "Surveillance no-show", "Validation congés"],
  },
  {
    icon: FileText,
    color: "from-rose-500 to-rose-700",
    title: "Rappels documents",
    desc: "Tes clients reçoivent un rappel Telegram pour les factures impayées, déclarations TVA, MRA à approcher des échéances.",
    bullets: ["Rappels TVA J-5 / J+1", "Relances factures clients", "Alertes documents manquants", "Personnalisable par client"],
  },
  {
    icon: Bot,
    color: "from-indigo-500 to-indigo-700",
    title: "Agents IA spécialisés",
    desc: "Lex Banque (rapprochement), Lex Factures (analyse), CLARA (paie), Agent Juridique (contrats). Ils dialoguent entre eux et avec toi.",
    bullets: ["Lex Banque — rapprochement IA", "Lex Factures — détection récurrences", "CLARA — assistant paie", "Agent juridique — IA contrats"],
  },
  {
    icon: Send,
    color: "from-cyan-500 to-cyan-700",
    title: "Notes de frais en photo",
    desc: "Le salarié photographie son ticket → catégorisation auto → workflow validation manager → comptabilisation directe.",
    bullets: ["OCR ticket", "Catégorie auto", "Validation manager", "Remboursement / refacturation"],
  },
  {
    icon: Bell,
    color: "from-orange-500 to-orange-700",
    title: "Alertes intelligentes",
    desc: "Le bot te ping quand quelque chose mérite ton attention : impayé important, anomalie, échéance fiscale, NSF/CSG à payer.",
    bullets: ["Anomalies comptables", "Échéances MRA", "NSF/CSG dates limites", "Score santé entreprise"],
  },
] as const

const AGENTS = [
  { nom: "Lex Banque", role: "Rapprochement bancaire automatique", icon: Banknote },
  { nom: "Lex Factures", role: "Analyse récurrences + détection manquantes", icon: FileText },
  { nom: "CLARA", role: "Assistant Paie & RH (Workers' Rights Act 2019)", icon: Users },
  { nom: "Agent Juridique", role: "Rédaction de contrats IA (32 types)", icon: Scale },
  { nom: "Agent Compliance", role: "Suivi obligations MRA / ROC / FSC", icon: ShieldCheck },
  { nom: "Agent GBC", role: "IFRS / Pillar Two / Transfer Pricing", icon: Globe },
] as const

export default function PilotageTelegramPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B0F2E] via-[#1a2659] to-[#0B0F2E] text-white">
      {/* Nav minimale */}
      <nav className="border-b border-white/10 backdrop-blur-md sticky top-0 z-50 bg-[#0B0F2E]/90">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-90">
            <LexoraLogo size="md" />
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/tarifs" className="text-white/80 hover:text-white">Tarifs</Link>
            <Link
              href="/inscription"
              className="inline-flex items-center gap-1.5 bg-[#D4AF37] text-[#0B0F2E] px-4 py-2 rounded-lg font-semibold hover:opacity-95"
            >
              Commencer <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-4 py-16 md:py-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-xs font-medium mb-6">
            <Sparkles className="h-3.5 w-3.5 text-[#D4AF37]" />
            <span>Pilotage IA via Telegram</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black leading-tight">
            Toute ton entreprise<br />
            <span className="bg-gradient-to-r from-[#D4AF37] to-yellow-300 bg-clip-text text-transparent">
              dans ta poche
            </span>
          </h1>
          <p className="text-lg md:text-xl text-white/80 mt-6 max-w-2xl mx-auto">
            Lexora se pilote en chat depuis Telegram. OCR, comptabilité, RH, banque, factures — un message suffit.
            Les agents IA dialoguent entre eux pour t'apporter la bonne info au bon moment.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/inscription"
              className="inline-flex items-center gap-2 bg-[#D4AF37] text-[#0B0F2E] px-6 py-3 rounded-lg font-bold hover:opacity-95"
            >
              <Sparkles className="h-4 w-4" /> Tester gratuitement
            </Link>
            <Link
              href="/tarifs"
              className="inline-flex items-center gap-2 border border-white/30 text-white px-6 py-3 rounded-lg hover:bg-white/10"
            >
              Voir les tarifs <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Stat strip */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { n: "8+", t: "Services pilotables" },
              { n: "6", t: "Agents IA" },
              { n: "24/7", t: "Disponible" },
              { n: "1 msg", t: "Pour agir" },
            ].map(s => (
              <div key={s.t} className="rounded-xl bg-white/5 border border-white/10 p-4">
                <p className="text-3xl font-black text-[#D4AF37]">{s.n}</p>
                <p className="text-xs text-white/70 mt-1">{s.t}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services grid */}
      <section className="px-4 py-12 md:py-20 bg-black/20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold">8 services pilotables en chat</h2>
            <p className="text-white/70 mt-2 max-w-2xl mx-auto">
              Un message, une photo, ou un vocal — l'IA fait le reste. Sans changer d'app.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {SERVICES.map(s => {
              const Icon = s.icon
              return (
                <div key={s.title} className="rounded-2xl bg-white/5 border border-white/10 p-6 hover:border-[#D4AF37]/40 transition-colors">
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${s.color} mb-4`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold">{s.title}</h3>
                  <p className="text-sm text-white/70 mt-2">{s.desc}</p>
                  <ul className="mt-4 space-y-1.5">
                    {s.bullets.map(b => (
                      <li key={b} className="flex items-center gap-2 text-sm text-white/80">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#D4AF37] flex-shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Agents IA */}
      <section className="px-4 py-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D4AF37]/15 text-[#D4AF37] text-xs font-bold mb-3">
              <Bot className="h-3.5 w-3.5" /> AGENTS IA SPÉCIALISÉS
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">Une équipe d'experts à ton service</h2>
            <p className="text-white/70 mt-2 max-w-2xl mx-auto">
              Chaque agent maîtrise son domaine. Ils communiquent entre eux et avec toi via Telegram pour résoudre les problèmes complexes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {AGENTS.map(a => {
              const Icon = a.icon
              return (
                <div key={a.nom} className="rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 p-5">
                  <div className="flex items-start gap-3">
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[#D4AF37]/20 flex-shrink-0">
                      <Icon className="h-5 w-5 text-[#D4AF37]" />
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

      {/* Conversations exemples */}
      <section className="px-4 py-16 bg-black/30">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold">Voici ce que tu peux taper</h2>
            <p className="text-white/70 mt-2">
              Des exemples concrets de messages que tu peux envoyer au bot Lexora sur Telegram.
            </p>
          </div>

          <div className="space-y-4">
            {[
              { user: "[📷 photo facture EDM]", bot: "Facture EDM 3 850 MUR — Charge énergie classe 606. Je crée l'écriture ?", icon: Camera },
              { user: "Solde MCB ?", bot: "💰 MCB : 1 248 590 MUR · BNI : 327 100 MUR · 2 transactions récentes à valider.", icon: Banknote },
              { user: "Facture Acme Ltd : 5 jours conseil à 25000", bot: "INV-2026-0078 prête — 125 000 MUR HT, TVA 15%, TTC 143 750. Je l'envoie ?", icon: FileText },
              { user: "[🎤 'Crée un contrat de bail pour Jean Dupont, 25000 MUR/mois']", bot: "📄 Brouillon bail résidentiel généré. Préavis 1 mois (Landlord Act). Je te l'envoie en preview ?", icon: Scale },
              { user: "/conges", bot: "3 demandes en attente : Marie (Annual 5j), Paul (Sick 1j), Léa (UL 2j). Tape /valider <id> pour approuver.", icon: Users },
            ].map((c, i) => {
              const Icon = c.icon
              return (
                <div key={i} className="space-y-2">
                  <div className="flex justify-end">
                    <div className="max-w-md bg-gradient-to-r from-[#0B0F2E] to-[#1a2659] border border-white/20 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm flex items-center gap-2">
                      <Icon className="h-4 w-4 text-[#D4AF37] flex-shrink-0" />
                      <span>{c.user}</span>
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-md bg-[#D4AF37]/10 border border-[#D4AF37]/40 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm">
                      <p className="text-xs text-[#D4AF37] font-semibold mb-0.5 flex items-center gap-1">
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

      {/* Comment ça marche */}
      <section className="px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold">Activation en 3 minutes</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              { n: 1, icon: Smartphone, title: "Inscris-toi", desc: "Crée ton compte Lexora et active le module Telegram dans tes paramètres." },
              { n: 2, icon: MessageCircle, title: "Lance le bot", desc: "Ouvre Telegram, cherche @LexoraBot et tape /start. Connexion en 1 clic via ton email." },
              { n: 3, icon: Zap, title: "Pilote tout", desc: "Photos, messages, vocaux — l'IA exécute. Tes données restent dans Lexora." },
            ].map(step => {
              const Icon = step.icon
              return (
                <div key={step.n} className="rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 p-6 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#D4AF37]/20 mb-3">
                    <Icon className="h-7 w-7 text-[#D4AF37]" />
                  </div>
                  <p className="text-xs font-bold text-[#D4AF37]">ÉTAPE {step.n}</p>
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
          <h2 className="text-3xl md:text-4xl font-bold">Prêt à essayer ?</h2>
          <p className="text-white/70 mt-3 text-lg">
            Inclus dans tous les plans Lexora. Pas de configuration complexe, pas d'app à installer.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/inscription"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-[#D4AF37] to-yellow-400 text-[#0B0F2E] px-8 py-3.5 rounded-lg font-bold text-base hover:opacity-95"
            >
              <Sparkles className="h-4 w-4" /> Créer mon compte
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

      {/* Footer mini */}
      <footer className="border-t border-white/10 py-6 px-4 text-center text-xs text-white/50">
        <p>© Lexora · <Link href="/cgu" className="hover:text-white/80">CGU</Link> · <Link href="/cgv" className="hover:text-white/80">CGV</Link> · <Link href="/protection-donnees" className="hover:text-white/80">Confidentialité</Link></p>
      </footer>
    </div>
  )
}
