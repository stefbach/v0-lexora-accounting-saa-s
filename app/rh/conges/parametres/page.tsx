"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Loader2, Settings, ShieldCheck, Baby, Umbrella, Heart, Users, Gavel,
  Trophy, Scale, BookOpen, AlertCircle, CheckCircle2, HeartPulse,
  Plane, AlertTriangle, RefreshCw,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import type { ConfigConge } from "@/lib/rh/types-conges"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
const BLUE = "#4191FF"

// ─── UI metadata par type (icônes + couleurs + puces) ────────────────
// Les chiffres affichés dans les cartes (22, 15, 30, 16 sem, …) sont
// dérivés de `config.jours_par_cycle` retourné par l'endpoint. Les
// valeurs hardcodées ci-dessous servent UNIQUEMENT de fallback si
// l'endpoint est KO ou si la ligne est absente.
interface TypeUI {
  id: string
  title: string
  titleEn: string
  section: string
  icon: any
  // Tailwind palette cohérente pour bandeaux/bordures/badges.
  tone: {
    border: string
    bg: string
    accent: string
    badgeBg: string
    badgeText: string
    text: string
  }
  // "16" pour MAT, "22" pour AL, "Variable" pour JUR/INT/CRT/Special…
  formatValue: (c: ConfigConge | null) => { value: string; unit: string }
  puces: (c: ConfigConge | null) => string[]
}

const TONES = {
  green: {
    border: "border-emerald-300",
    bg: "bg-gradient-to-br from-emerald-50 to-white",
    accent: "text-emerald-700",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-700",
    text: "text-emerald-900",
  },
  orange: {
    border: "border-orange-300",
    bg: "bg-gradient-to-br from-orange-50 to-white",
    accent: "text-orange-700",
    badgeBg: "bg-orange-100",
    badgeText: "text-orange-700",
    text: "text-orange-900",
  },
  violet: {
    border: "border-violet-300",
    bg: "bg-gradient-to-br from-violet-50 to-white",
    accent: "text-violet-700",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-700",
    text: "text-violet-900",
  },
  cyan: {
    border: "border-cyan-300",
    bg: "bg-gradient-to-br from-cyan-50 to-white",
    accent: "text-cyan-700",
    badgeBg: "bg-cyan-100",
    badgeText: "text-cyan-700",
    text: "text-cyan-900",
  },
  pink: {
    border: "border-pink-300",
    bg: "bg-gradient-to-br from-pink-50 to-white",
    accent: "text-pink-700",
    badgeBg: "bg-pink-100",
    badgeText: "text-pink-700",
    text: "text-pink-900",
  },
  blue: {
    border: "border-blue-300",
    bg: "bg-gradient-to-br from-blue-50 to-white",
    accent: "text-blue-700",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
    text: "text-blue-900",
  },
  amber: {
    border: "border-amber-300",
    bg: "bg-gradient-to-br from-amber-50 to-white",
    accent: "text-amber-700",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-800",
    text: "text-amber-900",
  },
  gray: {
    border: "border-gray-300",
    bg: "bg-gradient-to-br from-gray-50 to-white",
    accent: "text-gray-700",
    badgeBg: "bg-gray-100",
    badgeText: "text-gray-700",
    text: "text-gray-900",
  },
  indigo: {
    border: "border-indigo-300",
    bg: "bg-gradient-to-br from-indigo-50 to-white",
    accent: "text-indigo-700",
    badgeBg: "bg-indigo-100",
    badgeText: "text-indigo-700",
    text: "text-indigo-900",
  },
  slate: {
    border: "border-slate-300",
    bg: "bg-gradient-to-br from-slate-50 to-white",
    accent: "text-slate-700",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-700",
    text: "text-slate-900",
  },
}

const TYPES_UI: TypeUI[] = [
  {
    id: "AL",
    title: "Congé annuel",
    titleEn: "Annual Leave — Local Leave",
    section: "Section 45",
    icon: Umbrella,
    tone: TONES.green,
    formatValue: c => ({
      value: String(c?.jours_par_cycle ?? 22),
      unit: "jours ouvrables / an",
    }),
    puces: c => [
      `${c?.jours_par_cycle ?? 22} jours ouvrables après ${c?.anciennete_min_mois ?? 12} mois d'emploi continu`,
      "Weekends et jours fériés exclus",
      "Cycle basé sur la date anniversaire (pas année civile)",
      "Solde non pris : paiement compensatoire obligatoire",
    ],
  },
  {
    id: "SL",
    title: "Congé maladie",
    titleEn: "Sick Leave",
    section: "Section 46",
    icon: HeartPulse,
    tone: TONES.orange,
    formatValue: c => ({
      value: String(c?.jours_par_cycle ?? 15),
      unit: "jours / an",
    }),
    puces: c => [
      `${c?.jours_par_cycle ?? 15} jours par an après 12 mois`,
      "Accrual 1 j/mois de M7 à M12 (plafond 6)",
      "Certificat médical si ≥ 3 jours consécutifs",
      "Cumul possible jusqu'à 90 jours",
    ],
  },
  {
    id: "VL",
    title: "Vacation Leave",
    titleEn: "Vacation Leave — Workers",
    section: "Section 47",
    icon: Plane,
    tone: TONES.violet,
    formatValue: c => ({
      value: String(c?.jours_par_cycle ?? 30),
      unit: "jours / 5 ans",
    }),
    puces: c => [
      `${c?.jours_par_cycle ?? 30} jours payés par cycle de 5 ans`,
      `Workers uniquement (basic ≤ ${(c?.basic_salary_max ?? 50000).toLocaleString("fr-FR")} MUR/mois)`,
      "Migrant workers exclus",
      "Si refus employeur : cash-in-lieu obligatoire",
    ],
  },
  {
    id: "FML",
    title: "Family Medical Leave",
    titleEn: "Family Medical Leave",
    section: "Section 47A",
    icon: Heart,
    tone: TONES.cyan,
    formatValue: c => ({
      value: String(c?.jours_par_cycle ?? 10),
      unit: "jours / an",
    }),
    puces: c => [
      `${c?.jours_par_cycle ?? 10} j/an pour parent/enfant/grand-parent malade`,
      `Workers uniquement (basic ≤ ${(c?.basic_salary_max ?? 50000).toLocaleString("fr-FR")} MUR/mois)`,
      `Déductible au choix de ${(c?.deductible_de?.length ? c.deductible_de.join(", ") : "AL, SL ou VL")}`,
      "Certificat médical + lien de parenté requis",
    ],
  },
  {
    id: "MAT",
    title: "Congé maternité",
    titleEn: "Maternity Leave",
    section: "Section 52",
    icon: Baby,
    tone: TONES.pink,
    formatValue: c => {
      // 112 jours / 7 = 16 semaines. Fallback 16.
      const weeks = c?.jours_par_cycle ? Math.round(Number(c.jours_par_cycle) / 7) : 16
      return { value: String(weeks), unit: "semaines" }
    },
    puces: c => {
      const weeks = c?.jours_par_cycle ? Math.round(Number(c.jours_par_cycle) / 7) : 16
      return [
        `${weeks} semaines après ${c?.anciennete_min_mois ?? 12} mois de service`,
        `${weeks + 2} semaines si naissance multiple / prématurée`,
        "Allocation 3 000 MUR (forfait non-imposable)",
        "Protection absolue contre le licenciement (S.64)",
      ]
    },
  },
  {
    id: "PAT",
    title: "Congé paternité",
    titleEn: "Paternity Leave",
    section: "Section 53",
    icon: Users,
    tone: TONES.blue,
    formatValue: c => {
      const weeks = c?.jours_par_cycle ? Math.round(Number(c.jours_par_cycle) / 7) : 4
      return { value: String(weeks), unit: "semaines" }
    },
    puces: c => {
      const weeks = c?.jours_par_cycle ? Math.round(Number(c.jours_par_cycle) / 7) : 4
      return [
        `${weeks} semaines consécutives (FMPA 2024)`,
        `Payé si ≥ ${c?.anciennete_min_mois ?? 12} mois service`,
        `Non payé si < ${c?.anciennete_min_mois ?? 12} mois`,
      ]
    },
  },
  {
    id: "SPECIAL",
    title: "Congés exceptionnels",
    titleEn: "Special Leave",
    section: "Section 48",
    icon: Heart,
    tone: TONES.amber,
    formatValue: () => ({ value: "Variable", unit: "selon événement" }),
    puces: () => [
      "Mariage salarié : 6 jours (une fois carrière)",
      "Mariage enfant : 3 jours",
      "Décès famille proche : 3 jours",
      "Après 12 mois, justificatifs requis",
    ],
  },
  {
    id: "JUR",
    title: "Congé juré",
    titleEn: "Juror Leave",
    section: "Section 49",
    icon: Gavel,
    tone: TONES.gray,
    formatValue: () => ({ value: "Variable", unit: "durée du service" }),
    puces: () => [
      "Tous les salariés (pas de seuil)",
      "Durée service juré (Courts Act 1945)",
      "Payé intégralement",
    ],
  },
  {
    id: "INT",
    title: "Événement international",
    titleEn: "International Events",
    section: "Section 50",
    icon: Trophy,
    tone: TONES.indigo,
    formatValue: () => ({ value: "Variable", unit: "durée de l'événement" }),
    puces: () => [
      "Tous les salariés",
      "Durée de l'événement international",
      "Documentation officielle requise",
    ],
  },
  {
    id: "CRT",
    title: "Convocation judiciaire",
    titleEn: "Court Leave",
    section: "Section 51",
    icon: Scale,
    tone: TONES.slate,
    formatValue: () => ({ value: "Variable", unit: "temps nécessaire" }),
    puces: () => [
      "Tous les salariés",
      "Temps nécessaire à la démarche judiciaire",
      "Payé intégralement",
    ],
  },
]

// ─── Page ────────────────────────────────────────────────────────────
export default function CongesParametresPage() {
  const [regles, setRegles] = useState<Record<string, ConfigConge>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/rh/conges/regles")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setRegles((data?.regles as Record<string, ConfigConge>) || {})
    } catch (e: any) {
      setError(e?.message || "Impossible de charger les règles")
      setRegles({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight" style={{ color: NAVY }}>
              <Settings className="inline h-6 w-6 mr-2 -mt-1" style={{ color: GOLD }} />
              Règles des congés
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              Guide de référence selon le{" "}
              <span className="font-semibold" style={{ color: BLUE }}>Workers&apos; Rights Act 2019</span>{" "}
              de Maurice
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1.5" />
            )}
            Rafraîchir
          </Button>
        </div>

        {/* Info banner */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <div
            className="px-5 py-3 flex items-start gap-3"
            style={{ background: `linear-gradient(135deg, ${NAVY}08, ${BLUE}10)` }}
          >
            <ShieldCheck className="h-5 w-5 mt-0.5 shrink-0" style={{ color: BLUE }} />
            <div className="text-sm text-gray-700">
              <p>
                <strong>Workers&apos; Rights Act 2019</strong> — Droits minimaux légaux à Maurice.
                Les valeurs ci-dessous sont synchronisées avec la table{" "}
                <code className="text-xs bg-white/60 px-1 rounded">conges_regles</code>.
              </p>
            </div>
          </div>
        </Card>

        {/* Error banner */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">
                Impossible de charger les règles
              </p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
              <p className="text-xs text-red-600 mt-1">
                Les valeurs par défaut du WRA 2019 sont affichées ci-dessous.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              className="border-red-300 text-red-700 hover:bg-red-100"
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Réessayer
            </Button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && Object.keys(regles).length === 0 ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {TYPES_UI.map(t => {
              // SPECIAL est une carte synthétique qui représente 3 types DB
              // (SPC_MARIAGE_SELF / SPC_MARIAGE_ENFANT / SPC_DECES). On
              // prend SPC_MARIAGE_SELF comme référence pour S.48.
              const cfg =
                t.id === "SPECIAL"
                  ? regles["SPC_MARIAGE_SELF"] || null
                  : regles[t.id] || null
              const { value, unit } = t.formatValue(cfg)
              const Icon = t.icon
              return (
                <Card
                  key={t.id}
                  className={`border-2 ${t.tone.border} ${t.tone.bg} overflow-hidden flex flex-col`}
                >
                  <div className="px-5 py-4 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <div className={`rounded-lg p-2 ${t.tone.badgeBg}`}>
                        <Icon className={`h-5 w-5 ${t.tone.accent}`} />
                      </div>
                      <div>
                        <h3 className={`font-bold text-sm ${t.tone.text}`}>
                          {t.title}
                        </h3>
                        <p className="text-[11px] text-gray-500">{t.titleEn}</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-[10px] font-semibold ${t.tone.border} ${t.tone.accent}`}
                    >
                      {t.section}
                    </Badge>
                  </div>
                  <CardContent className="px-5 pb-4 pt-0 flex-1 space-y-3">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-4xl font-black ${t.tone.accent}`}>
                        {value}
                      </span>
                      <span className="text-sm text-gray-500">{unit}</span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-gray-700">
                      {t.puces(cfg).map((p, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2
                            className={`h-3 w-3 mt-0.5 shrink-0 ${t.tone.accent}`}
                          />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* Bandeau minima légaux */}
        <Card className="border-2 border-amber-300 bg-amber-50">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900">
              <span className="font-semibold">Ces valeurs sont les minima légaux WRA 2019.</span>{" "}
              Un employeur peut seulement proposer des conditions{" "}
              <span className="font-semibold underline">PLUS FAVORABLES</span>{" "}
              (WRA S.3(3)(a)). Toute clause moins favorable est réputée nulle de plein droit.
            </p>
          </CardContent>
        </Card>

        {/* Liens utiles */}
        <Card className="border-gray-200">
          <CardContent className="py-4 flex items-start gap-3">
            <BookOpen className="h-5 w-5 text-gray-500 shrink-0 mt-0.5" />
            <div className="text-xs text-gray-600 space-y-1">
              <p>
                <span className="font-semibold">Source :</span> Workers&apos; Rights Act 2019 +
                Family Medical & Paternity Amendment Act 2024 (FMPA).
              </p>
              <p>
                Les règles sont stockées dans la table{" "}
                <code className="bg-gray-100 px-1 rounded">conges_regles</code> ;
                chaque société peut les surcharger via la fonction{" "}
                <code className="bg-gray-100 px-1 rounded">get_conge_regle(societe_id, type)</code>.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ClientPageShell>
  )
}
