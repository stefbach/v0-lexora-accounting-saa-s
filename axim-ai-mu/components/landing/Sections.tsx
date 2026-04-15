"use client"

import { Reveal } from "./Reveal"

const PROMISES = [
  {
    tag: "CANAL VOCAL",
    color: "violet",
    title: "Votre téléphone répond tout seul",
    desc: "Votre agent décroche, comprend la demande, prend le rendez-vous, transfère si nécessaire. Vos clients n'attendent plus jamais.",
    metric: "−50%",
    metricLabel: "DE NO-SHOW GRÂCE AUX RAPPELS AUTO"
  },
  {
    tag: "MESSAGERIE",
    color: "cyan",
    title: "WhatsApp & email en moins de 2 minutes",
    desc: "Chaque appel, formulaire ou demande déclenche une réponse automatique personnalisée — sans que vous n'ayez à lever le petit doigt.",
    metric: "<2 min",
    metricLabel: "DÉLAI MOYEN DE RÉPONSE CLIENT"
  },
  {
    tag: "AUTOMATISATION",
    color: "green",
    title: "Vos processus tournent sans vous",
    desc: "Réservations, devis, relances, rapports, onboarding — vos flux de travail de A à Z, pris en charge par des agents autonomes.",
    metric: "−80%",
    metricLabel: "DE TÂCHES ADMINISTRATIVES"
  }
]

const colorMap: Record<string, { text: string; bg: string; border: string }> = {
  violet: {
    text: "text-axon-violetLight",
    bg: "bg-axon-violet/10",
    border: "border-axon-violet/30"
  },
  cyan: {
    text: "text-axon-cyan",
    bg: "bg-axon-cyan/10",
    border: "border-axon-cyan/30"
  },
  green: {
    text: "text-axon-green",
    bg: "bg-axon-green/10",
    border: "border-axon-green/30"
  }
}

export function PromiseSection() {
  return (
    <section className="relative border-t border-white/5 bg-axon-ink2/60 py-24 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-axon-violetLight">
            <span className="h-px w-4 bg-axon-violetLight" />
            NOTRE PROMESSE
          </div>
          <h2 className="mb-12 font-display text-[clamp(26px,3.4vw,44px)] font-extrabold leading-tight tracking-tight">
            Ce que vos agents font pour vous
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PROMISES.map((p, i) => {
            const c = colorMap[p.color]
            return (
              <Reveal key={p.tag} delay={i * 0.1}>
                <div
                  className={`group relative h-full overflow-hidden rounded-2xl border ${c.border} bg-axon-ink3/60 p-7 backdrop-blur-xl transition hover:-translate-y-1 hover:border-opacity-100`}
                >
                  <div
                    className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full ${c.bg} blur-3xl transition-opacity group-hover:opacity-100 opacity-60`}
                  />
                  <div
                    className={`mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl ${c.bg} ${c.border} border backdrop-blur-xl`}
                  >
                    <div className={`h-6 w-6 rounded-md ${c.text}`}>
                      <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
                        <circle
                          cx="12"
                          cy="12"
                          r="8"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
                      </svg>
                    </div>
                  </div>
                  <div
                    className={`mb-2 font-mono text-[10px] uppercase tracking-[0.15em] ${c.text}`}
                  >
                    {p.tag}
                  </div>
                  <h3 className="mb-2 font-display text-lg font-extrabold">
                    {p.title}
                  </h3>
                  <p className="mb-5 text-sm font-light leading-[1.65] text-axon-txt2">
                    {p.desc}
                  </p>
                  <div className="border-t border-white/5 pt-4">
                    <div
                      className={`font-display text-3xl font-extrabold ${c.text}`}
                    >
                      {p.metric}
                    </div>
                    <div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-axon-txt3">
                      {p.metricLabel}
                    </div>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}

const AGENTS = [
  {
    nm: "Orchestrateur",
    cat: "MULTI-AGENTS",
    desc: "Coordonne tous les agents spécialisés sur un processus complexe bout-en-bout.",
    kpi: "100%",
    kpil: "TRAÇABILITÉ",
    color: "#6C4FF0",
    vocal: true
  },
  {
    nm: "Réservation",
    cat: "UNIVERSEL",
    desc: "RDV par téléphone + confirmation WhatsApp + email. Zéro no-show.",
    kpi: "−50%",
    kpil: "DE NO-SHOW",
    color: "#00BBEE",
    vocal: true
  },
  {
    nm: "Rédacteur Scientifique",
    cat: "PUBLICATIONS IA",
    desc: "Processus IMRAD complet — de la donnée brute au manuscrit final.",
    kpi: "−70%",
    kpil: "TEMPS RÉDACTION",
    color: "#00D46A",
    vocal: false
  },
  {
    nm: "Comptes Rendus Médicaux",
    cat: "TIBOK",
    desc: "Dictée → transcription → CR structuré → validation médecin 1 clic.",
    kpi: ">85%",
    kpil: "TAUX ACCEPTATION",
    color: "#40D4FF",
    vocal: false
  },
  {
    nm: "Commercial & CRM",
    cat: "VENTES",
    desc: "Qualification leads par téléphone, devis PDF en 60s, relances auto.",
    kpi: "×3",
    kpil: "TAUX CONVERSION",
    color: "#8B6FF4",
    vocal: true
  },
  {
    nm: "Service Client",
    cat: "SUPPORT 24/7",
    desc: "70% de résolution autonome. Escalade intelligente avec contexte.",
    kpi: "70%",
    kpil: "RÉSOLUTION AUTO",
    color: "#3FFFAA",
    vocal: true
  },
  {
    nm: "RH & Onboarding",
    cat: "RESSOURCES HUMAINES",
    desc: "Accueil vocal J+1, parcours d'intégration automatisé, réponses RH 24/7.",
    kpi: "−60%",
    kpil: "CHARGE ADMIN RH",
    color: "#00D46A",
    vocal: true
  },
  {
    nm: "Comptabilité",
    cat: "FINANCE · LEXORA",
    desc: "Saisie factures, rapprochement bancaire, déclarations TVA.",
    kpi: "−80%",
    kpil: "SAISIE MANUELLE",
    color: "#EF9F27",
    vocal: false
  },
  {
    nm: "Contenu Marketing",
    cat: "SOCIAL MEDIA",
    desc: "Posts, Reels, vidéos avatars générés en continu. Volume ×10.",
    kpi: "×10",
    kpil: "VOLUME CONTENU",
    color: "#FF4D6D",
    vocal: false
  }
]

export function AgentsSection() {
  return (
    <section
      id="agents"
      className="relative border-t border-white/5 bg-axon-ink2 py-24"
    >
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-axon-violetLight">
            <span className="h-px w-4 bg-axon-violetLight" />
            CATALOGUE D&apos;AGENTS
          </div>
          <h2 className="mb-12 font-display text-[clamp(26px,3.4vw,44px)] font-extrabold leading-tight tracking-tight">
            Un agent taillé pour{" "}
            <span
              className="bg-axon-grad bg-clip-text text-transparent"
              style={{ backgroundSize: "200% 100%" }}
            >
              chaque métier
            </span>
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((a, i) => (
            <Reveal key={a.nm} delay={(i % 3) * 0.08}>
              <div
                className="group relative h-full overflow-hidden rounded-xl border border-white/[0.06] bg-axon-ink/60 p-5 backdrop-blur-xl transition hover:-translate-y-1 hover:border-white/20"
                style={{
                  boxShadow: `inset 0 0 0 1px ${a.color}08`
                }}
              >
                <div
                  className="absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity group-hover:opacity-40"
                  style={{ backgroundColor: a.color }}
                />
                {a.vocal && (
                  <div
                    className="absolute right-3 top-3 rounded border px-2 py-0.5 font-mono text-[8px] tracking-wider"
                    style={{
                      backgroundColor: `${a.color}18`,
                      borderColor: `${a.color}40`,
                      color: a.color
                    }}
                  >
                    VOCAL+TEXT
                  </div>
                )}
                <div className="mb-3 flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: `${a.color}18`,
                      boxShadow: `inset 0 0 0 1px ${a.color}35`
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      className="h-5 w-5"
                      style={{ color: a.color }}
                    >
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4" />
                      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
                      <circle cx="12" cy="5" r="1" fill="currentColor" />
                      <circle cx="19" cy="12" r="1" fill="currentColor" />
                      <circle cx="12" cy="19" r="1" fill="currentColor" />
                      <circle cx="5" cy="12" r="1" fill="currentColor" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-display text-[13px] font-extrabold">
                      {a.nm}
                    </div>
                    <div className="font-mono text-[9px] text-axon-txt3">
                      {a.cat}
                    </div>
                  </div>
                </div>
                <p className="mb-4 text-[12px] font-light leading-[1.55] text-axon-txt2">
                  {a.desc}
                </p>
                <div
                  className="font-display text-xl font-extrabold"
                  style={{ color: a.color }}
                >
                  {a.kpi}
                </div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-axon-txt3">
                  {a.kpil}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

const PROOF = [
  { n: "−80%", t: "Tâches répétitives", d: "Vos équipes se concentrent sur ce que seul un humain peut faire.", c: "text-axon-violetLight" },
  { n: "<2 min", t: "Délai de réponse", d: "Contre 4 heures en moyenne pour une réponse manuelle.", c: "text-axon-cyan" },
  { n: "48h", t: "Premier agent actif", d: "Du brief initial à l'agent opérationnel sur vos canaux.", c: "text-axon-green" },
  { n: "24/7", t: "Disponibilité", d: "Week-ends, nuits, jours fériés — votre agent ne prend jamais de congé.", c: "text-axon-amber" }
]

export function ProofSection() {
  return (
    <section className="relative border-y border-white/5 bg-axon-ink2/60 py-24 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-axon-violetLight">
            <span className="h-px w-4 bg-axon-violetLight" />
            RÉSULTATS MESURÉS
          </div>
          <h2 className="mb-12 font-display text-[clamp(26px,3.4vw,44px)] font-extrabold leading-tight tracking-tight">
            Des chiffres, pas des promesses
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PROOF.map((p, i) => (
            <Reveal key={p.t} delay={i * 0.08}>
              <div className="h-full rounded-xl border border-white/[0.06] bg-axon-ink/60 p-6 backdrop-blur-xl">
                <div className={`font-display text-4xl font-extrabold leading-none ${p.c}`}>
                  {p.n}
                </div>
                <div className="mt-4 text-sm font-medium text-axon-txt">
                  {p.t}
                </div>
                <div className="mt-1.5 text-xs font-light leading-[1.55] text-axon-txt2">
                  {p.d}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

const PROCESS = [
  {
    n: "01",
    t: "On analyse votre métier",
    d: "Un audit de 90 minutes pour comprendre vos processus, vos canaux et vos points de friction.",
    badge: "JOUR 1",
    c: "violetLight"
  },
  {
    n: "02",
    t: "On configure votre agent",
    d: "Votre agent est entraîné sur votre vocabulaire, vos règles métier et votre identité de marque.",
    badge: "JOUR 1–2",
    c: "cyan"
  },
  {
    n: "03",
    t: "On déploie et on pilote",
    d: "Mise en production sur vos canaux réels. Dashboard de performance temps réel. Optimisation continue.",
    badge: "JOUR 2 → ∞",
    c: "green"
  }
]

const processColorMap: Record<string, string> = {
  violetLight: "text-axon-violetLight bg-axon-violet/10 border-axon-violet/30",
  cyan: "text-axon-cyan bg-axon-cyan/10 border-axon-cyan/30",
  green: "text-axon-green bg-axon-green/10 border-axon-green/30"
}

export function ProcessSection() {
  return (
    <section id="process" className="relative border-t border-white/5 bg-axon-ink py-24">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-axon-violetLight">
            <span className="h-px w-4 bg-axon-violetLight" />
            COMMENT ON TRAVAILLE
          </div>
          <h2 className="mb-12 font-display text-[clamp(26px,3.4vw,44px)] font-extrabold leading-tight tracking-tight">
            Opérationnel en <span className="text-axon-green">48 heures</span> chrono
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {PROCESS.map((p, i) => (
            <Reveal key={p.n} delay={i * 0.1}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-white/[0.06] bg-axon-ink2/60 p-8 backdrop-blur-xl transition hover:-translate-y-1 hover:border-white/20">
                <div className="mb-4 font-mono text-[10px] tracking-wider text-axon-txt3">
                  // {p.n}
                </div>
                <h3 className="mb-3 font-display text-xl font-extrabold">
                  {p.t}
                </h3>
                <p className="mb-6 text-sm font-light leading-[1.65] text-axon-txt2">
                  {p.d}
                </p>
                <span
                  className={`inline-block rounded-md border px-3 py-1 font-mono text-[9px] tracking-wider ${processColorMap[p.c]}`}
                >
                  {p.badge}
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

export function CTASection() {
  return (
    <section
      id="contact"
      className="relative overflow-hidden border-t border-white/5 py-32"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-axon-violet/20 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 h-[350px] w-[350px] rounded-full bg-axon-cyan/15 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
        <Reveal>
          <div className="mb-4 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-axon-violetLight">
            <span className="h-px w-4 bg-axon-violetLight" />
            COMMENÇONS MAINTENANT
            <span className="h-px w-4 bg-axon-violetLight" />
          </div>
          <h2 className="mb-6 font-display text-[clamp(34px,5vw,60px)] font-extrabold leading-[1.05] tracking-tight">
            Votre premier agent actif
            <br />
            <span
              className="bg-axon-grad bg-clip-text text-transparent"
              style={{
                backgroundSize: "200% 100%",
                animation: "gradient-x 6s linear infinite"
              }}
            >
              en 48 heures
            </span>
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-[17px] font-light leading-[1.7] text-axon-txt2">
            Démo gratuite et sans engagement — on vous montre votre agent en
            action sur votre cas d&apos;usage exact, avec votre voix, vos
            règles, vos canaux.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="mailto:hello@axon-ai.mu"
              className="group relative overflow-hidden rounded-xl bg-axon-violet px-8 py-4 text-[15px] font-medium text-white transition hover:-translate-y-0.5 hover:bg-axon-violetLight"
            >
              <span className="relative z-10">Réserver ma démo gratuite</span>
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            </a>
            <a
              href="#agents"
              className="rounded-xl border border-white/10 bg-white/[0.03] px-7 py-4 text-[15px] text-axon-txt2 backdrop-blur-xl transition hover:border-white/25 hover:text-axon-txt"
            >
              Voir le catalogue →
            </a>
          </div>
          <div className="mt-8 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-axon-ink2/60 px-4 py-2 font-mono text-[10px] tracking-wider text-axon-txt3 backdrop-blur-xl">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-soft rounded-full bg-axon-green" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-axon-green" />
            </span>
            Bientôt disponible sur <span className="text-axon-cyan">axon-ai.mu</span>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-axon-ink2 py-12">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2">
            <div className="flex items-center gap-2.5">
              <svg width="22" height="22" viewBox="0 0 26 26" fill="none">
                <rect width="26" height="26" rx="6" fill="#6C4FF0" />
                <circle cx="13" cy="13" r="2.4" fill="#00BBEE" />
                <line x1="13" y1="13" x2="13" y2="5" stroke="white" strokeWidth="1.3" strokeOpacity=".75" />
                <line x1="13" y1="13" x2="19.9" y2="17" stroke="white" strokeWidth="1.3" strokeOpacity=".75" />
                <line x1="13" y1="13" x2="6.1" y2="17" stroke="white" strokeWidth="1.3" strokeOpacity=".75" />
              </svg>
              <span className="font-display text-base font-extrabold">AXON AI</span>
            </div>
            <p className="mt-3 max-w-xs text-xs font-light leading-[1.65] text-axon-txt2">
              Agents IA vocaux et intelligents pour les entreprises de
              Maurice et d&apos;Afrique francophone. Votre business ne
              s&apos;arrête plus jamais.
            </p>
          </div>
          <div>
            <h4 className="mb-4 font-mono text-[10px] tracking-wider text-axon-txt">
              AGENTS
            </h4>
            <ul className="space-y-2 text-xs text-axon-txt3">
              <li>Réservation</li>
              <li>Service client</li>
              <li>Commercial</li>
              <li>RH & Onboarding</li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4 font-mono text-[10px] tracking-wider text-axon-txt">
              CONTACT
            </h4>
            <ul className="space-y-2 text-xs text-axon-txt3">
              <li>
                <a href="mailto:hello@axon-ai.mu" className="hover:text-axon-txt2">
                  hello@axon-ai.mu
                </a>
              </li>
              <li>Maurice — Flic en Flac</li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex items-center justify-between border-t border-white/5 pt-6">
          <span className="font-mono text-[10px] tracking-wider text-axon-txt3">
            © 2026 AXON AI — DIGITAL DATA SOLUTIONS LTD · MAURITIUS
          </span>
          <span className="hidden font-mono text-[10px] italic text-axon-txt3 md:inline">
            Votre entreprise ne dort plus.
          </span>
        </div>
      </div>
    </footer>
  )
}
