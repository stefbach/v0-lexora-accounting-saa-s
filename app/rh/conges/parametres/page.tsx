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
import { t, getLocale, type Locale } from "@/lib/i18n"

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
  puces: (c: ConfigConge | null, locale: Locale) => string[]
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
    puces: (c, locale) => [
      t('rha.a.congesp.puce_AL_1', locale)
        .replace('{n}', String(c?.jours_par_cycle ?? 22))
        .replace('{m}', String(c?.anciennete_min_mois ?? 12)),
      t('rha.a.congesp.puce_AL_2', locale),
      t('rha.a.congesp.puce_AL_3', locale),
      t('rha.a.congesp.puce_AL_4', locale),
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
    puces: (c, locale) => [
      t('rha.a.congesp.puce_SL_1', locale).replace('{n}', String(c?.jours_par_cycle ?? 15)),
      t('rha.a.congesp.puce_SL_2', locale),
      t('rha.a.congesp.puce_SL_3', locale),
      t('rha.a.congesp.puce_SL_4', locale),
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
    puces: (c, locale) => [
      t('rha.a.congesp.puce_VL_1', locale).replace('{n}', String(c?.jours_par_cycle ?? 30)),
      t('rha.a.congesp.puce_VL_2', locale).replace('{amt}', (c?.basic_salary_max ?? 50000).toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR')),
      t('rha.a.congesp.puce_VL_3', locale),
      t('rha.a.congesp.puce_VL_4', locale),
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
    puces: (c, locale) => [
      t('rha.a.congesp.puce_FML_1', locale).replace('{n}', String(c?.jours_par_cycle ?? 10)),
      t('rha.a.congesp.puce_FML_2', locale).replace('{amt}', (c?.basic_salary_max ?? 50000).toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR')),
      t('rha.a.congesp.puce_FML_3', locale).replace('{types}', c?.deductible_de?.length ? c.deductible_de.join(", ") : t('rha.a.congesp.fml_default_types', locale)),
      t('rha.a.congesp.puce_FML_4', locale),
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
    puces: (c, locale) => {
      const weeks = c?.jours_par_cycle ? Math.round(Number(c.jours_par_cycle) / 7) : 16
      return [
        t('rha.a.congesp.puce_MAT_1', locale).replace('{n}', String(weeks)).replace('{m}', String(c?.anciennete_min_mois ?? 12)),
        t('rha.a.congesp.puce_MAT_2', locale).replace('{n}', String(weeks + 2)),
        t('rha.a.congesp.puce_MAT_3', locale),
        t('rha.a.congesp.puce_MAT_4', locale),
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
    puces: (c, locale) => {
      const weeks = c?.jours_par_cycle ? Math.round(Number(c.jours_par_cycle) / 7) : 4
      return [
        t('rha.a.congesp.puce_PAT_1', locale).replace('{n}', String(weeks)),
        t('rha.a.congesp.puce_PAT_2', locale).replace('{m}', String(c?.anciennete_min_mois ?? 12)),
        t('rha.a.congesp.puce_PAT_3', locale).replace('{m}', String(c?.anciennete_min_mois ?? 12)),
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
    puces: (_c, locale) => [
      t('rha.a.congesp.puce_SPECIAL_1', locale),
      t('rha.a.congesp.puce_SPECIAL_2', locale),
      t('rha.a.congesp.puce_SPECIAL_3', locale),
      t('rha.a.congesp.puce_SPECIAL_4', locale),
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
    puces: (_c, locale) => [
      t('rha.a.congesp.puce_JUR_1', locale),
      t('rha.a.congesp.puce_JUR_2', locale),
      t('rha.a.congesp.puce_JUR_3', locale),
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
    puces: (_c, locale) => [
      t('rha.a.congesp.puce_INT_1', locale),
      t('rha.a.congesp.puce_INT_2', locale),
      t('rha.a.congesp.puce_INT_3', locale),
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
    puces: (_c, locale) => [
      t('rha.a.congesp.puce_CRT_1', locale),
      t('rha.a.congesp.puce_CRT_2', locale),
      t('rha.a.congesp.puce_CRT_3', locale),
    ],
  },
]

// ─── Page ────────────────────────────────────────────────────────────
export default function CongesParametresPage() {
  const locale = getLocale()
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
      setError(e?.message || t('rha.a.congesp.err_load', locale))
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
              {t('rha.a.congesp.title', locale)}
            </h1>
            <p className="text-gray-500 mt-1 text-sm">
              {t('rha.a.congesp.intro_prefix', locale)}{" "}
              <span className="font-semibold" style={{ color: BLUE }}>{t('rha.a.congesp.intro_law', locale)}</span>{" "}
              {t('rha.a.congesp.intro_suffix', locale)}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1.5" />
            )}
            {t('rha.a.congesp.refresh', locale)}
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
                <strong>{t('rha.a.congesp.banner_law', locale)}</strong> {t('rha.a.congesp.banner_text', locale)}{" "}
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
                {t('rha.a.congesp.err_load', locale)}
              </p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
              <p className="text-xs text-red-600 mt-1">
                {t('rha.a.congesp.err_default', locale)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              className="border-red-300 text-red-700 hover:bg-red-100"
            >
              <RefreshCw className="h-3 w-3 mr-1" /> {t('rha.a.congesp.retry', locale)}
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
            {TYPES_UI.map(tx => {
              // SPECIAL est une carte synthétique qui représente 3 types DB
              // (SPC_MARIAGE_SELF / SPC_MARIAGE_ENFANT / SPC_DECES). On
              // prend SPC_MARIAGE_SELF comme référence pour S.48.
              const cfg =
                tx.id === "SPECIAL"
                  ? regles["SPC_MARIAGE_SELF"] || null
                  : regles[tx.id] || null
              const { value, unit } = tx.formatValue(cfg)
              const Icon = tx.icon
              const localizedTitle = t(`rha.a.congesp.t_${tx.id}` as any, locale) || tx.title
              const unitMap: Record<string, string> = {
                'jours ouvrables / an': t('rha.a.congesp.unit_jours_an', locale),
                'jours / an': t('rha.a.congesp.unit_jours_an2', locale),
                'jours / 5 ans': t('rha.a.congesp.unit_jours_5ans', locale),
                'semaines': t('rha.a.congesp.unit_semaines', locale),
                'selon événement': t('rha.a.congesp.unit_event', locale),
                'durée du service': t('rha.a.congesp.unit_jury', locale),
                "durée de l'événement": t('rha.a.congesp.unit_int', locale),
                'temps nécessaire': t('rha.a.congesp.unit_court', locale),
              }
              const localizedUnit = unitMap[unit] || unit
              const localizedValue = value === 'Variable' ? t('rha.a.congesp.unit_variable', locale) : value
              return (
                <Card
                  key={tx.id}
                  className={`border-2 ${tx.tone.border} ${tx.tone.bg} overflow-hidden flex flex-col`}
                >
                  <div className="px-5 py-4 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <div className={`rounded-lg p-2 ${tx.tone.badgeBg}`}>
                        <Icon className={`h-5 w-5 ${tx.tone.accent}`} />
                      </div>
                      <div>
                        <h3 className={`font-bold text-sm ${tx.tone.text}`}>
                          {localizedTitle}
                        </h3>
                        <p className="text-[11px] text-gray-500">{tx.titleEn}</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-[10px] font-semibold ${tx.tone.border} ${tx.tone.accent}`}
                    >
                      {tx.section}
                    </Badge>
                  </div>
                  <CardContent className="px-5 pb-4 pt-0 flex-1 space-y-3">
                    <div className="flex items-baseline gap-2">
                      <span className={`text-4xl font-black ${tx.tone.accent}`}>
                        {localizedValue}
                      </span>
                      <span className="text-sm text-gray-500">{localizedUnit}</span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-gray-700">
                      {tx.puces(cfg, locale).map((p, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2
                            className={`h-3 w-3 mt-0.5 shrink-0 ${tx.tone.accent}`}
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
              <span className="font-semibold">{t('rha.a.congesp.legal_min_strong', locale)}</span>{" "}
              {t('rha.a.congesp.legal_min_text', locale)}
            </p>
          </CardContent>
        </Card>

        {/* Liens utiles */}
        <Card className="border-gray-200">
          <CardContent className="py-4 flex items-start gap-3">
            <BookOpen className="h-5 w-5 text-gray-500 shrink-0 mt-0.5" />
            <div className="text-xs text-gray-600 space-y-1">
              <p>
                <span className="font-semibold">{t('rha.a.congesp.source_label', locale)}</span> {t('rha.a.congesp.source_text', locale)}
              </p>
              <p>
                {t('rha.a.congesp.storage_text', locale)}{" "}
                <code className="bg-gray-100 px-1 rounded">conges_regles</code>
                {t('rha.a.congesp.storage_text2', locale)}{" "}
                <code className="bg-gray-100 px-1 rounded">get_conge_regle(societe_id, type)</code>.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ClientPageShell>
  )
}
