"use client"

/**
 * /comptable/sante-pcm — Tableau de bord temps réel de la santé comptable.
 *
 * Vérifie en continu :
 *   1. Déséquilibre global  : SUM(débit) vs SUM(crédit) sur ecritures_comptables_v2
 *   2. Déséquilibre par journal
 *   3. Folios déséquilibrés (|D - C| > 0.01)
 *   4. Écritures orphelines (sans ref_folio)
 *   5. Comptes hors PCG mauricien
 *
 * Utilise l'endpoint /api/comptable/sante-pcm (cf. migration 303).
 * Le score est calculé côté SQL ; couleurs : vert (>=99), orange (>=80), rouge.
 */

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import {
  Activity, AlertTriangle, CheckCircle2, RefreshCw, ExternalLink,
  Scale, BookOpen, FileQuestion, FileX2, ShieldAlert, Loader2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { t, getLocale } from "@/lib/i18n"

// ── Types ────────────────────────────────────────────────────────────────────
type Couleur = "vert" | "orange" | "rouge"

interface Synthese {
  societe_id: string
  total_d_global: number
  total_c_global: number
  desequilibre_global: number
  nb_journaux_desequilibres: number
  nb_folios_desequilibres: number
  nb_ecritures_orphelines: number
  nb_comptes_invalides: number
  nb_ecritures_total: number
  sante_score: number
  sante_couleur: Couleur
}

interface JournalDesequilibre {
  journal: string
  nb_lignes: number
  total_debit: number
  total_credit: number
  ecart: number
}

interface FolioDesequilibre {
  ref_folio: string
  journal: string
  nb_lignes: number
  total_debit: number
  total_credit: number
  ecart: number
  comptes: string
}

interface EcritureOrpheline {
  id: string
  date_ecriture: string
  journal: string | null
  numero_compte: string
  libelle: string | null
  debit_mur: number
  credit_mur: number
}

interface CompteInvalide {
  numero_compte: string
  nb_lignes: number
  total_debit: number
  total_credit: number
}

interface SocieteOverview {
  societe_id: string
  nom: string
  sante_couleur: Couleur
  sante_score: number
  desequilibre_global: number
  nb_journaux_desequilibres: number
  nb_folios_desequilibres: number
  nb_ecritures_orphelines: number
  nb_comptes_invalides: number
}

interface DetailResponse {
  mode: "detail"
  societe_id: string
  synthese: Synthese
  journaux: JournalDesequilibre[]
  folios: FolioDesequilibre[]
  orphelines: EcritureOrpheline[]
  comptes_invalides: CompteInvalide[]
  generated_at: string
}

interface OverviewResponse {
  mode: "overview"
  societes: SocieteOverview[]
  pire: SocieteOverview | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(n || 0)
  )

const COULEUR_STYLE: Record<Couleur, { bg: string; ring: string; text: string; dot: string; labelKey: string }> = {
  vert:   { bg: "bg-emerald-50", ring: "ring-emerald-300", text: "text-emerald-700", dot: "bg-emerald-500", labelKey: "cpta.spcm_balanced" },
  orange: { bg: "bg-amber-50",   ring: "ring-amber-300",   text: "text-amber-700",   dot: "bg-amber-500",   labelKey: "cpta.spcm_to_watch" },
  rouge:  { bg: "bg-red-50",     ring: "ring-red-300",     text: "text-red-700",     dot: "bg-red-500",     labelKey: "cpta.spcm_unbalanced" },
}

function grandLivreLink(societeId: string, params: Record<string, string | undefined> = {}) {
  const sp = new URLSearchParams({ societe_id: societeId })
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v)
  return `/comptable/grand-livre?${sp.toString()}`
}

// ── Component ────────────────────────────────────────────────────────────────
export default function SantePCMPage() {
  const locale = getLocale()
  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  const [detail, setDetail] = useState<DetailResponse | null>(null)
  const [societeId, setSocieteId] = useState<string>("")
  const [loadingOverview, setLoadingOverview] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true)
    setError(null)
    try {
      const res = await fetch("/api/comptable/sante-pcm", { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: OverviewResponse = await res.json()
      setOverview(data)
      // Sélectionne automatiquement la pire société (ou la première)
      const first = data.pire?.societe_id || data.societes[0]?.societe_id
      if (first && !societeId) setSocieteId(first)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('cpta.spcm_error', locale))
    } finally {
      setLoadingOverview(false)
    }
  }, [societeId])

  const fetchDetail = useCallback(async (id: string) => {
    if (!id) return
    setLoadingDetail(true)
    setError(null)
    try {
      const res = await fetch(`/api/comptable/sante-pcm?societe_id=${encodeURIComponent(id)}`, {
        cache: "no-store",
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: DetailResponse = await res.json()
      setDetail(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('cpta.spcm_error', locale))
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  useEffect(() => {
    fetchOverview()
  }, [fetchOverview])

  useEffect(() => {
    if (societeId) fetchDetail(societeId)
  }, [societeId, fetchDetail])

  const reload = () => {
    fetchOverview()
    if (societeId) fetchDetail(societeId)
  }

  const synthese = detail?.synthese
  const couleur: Couleur = synthese?.sante_couleur || "vert"
  const style = COULEUR_STYLE[couleur]

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{t('cpta.spcm_eyebrow', locale)}</p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900 sm:text-3xl">
            {t('cpta.spcm_title', locale)}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            {t('cpta.spcm_intro_pre', locale)}
            <code className="mx-1 rounded bg-zinc-100 px-1 py-0.5 text-xs">ecritures_comptables_v2</code>
            {t('cpta.spcm_intro_post', locale)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {overview && overview.societes.length > 1 && (
            <Select value={societeId} onValueChange={setSocieteId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder={t('cpta.spcm_select_company', locale)} />
              </SelectTrigger>
              <SelectContent>
                {overview.societes.map(s => (
                  <SelectItem key={s.societe_id} value={s.societe_id}>
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${COULEUR_STYLE[s.sante_couleur].dot}`} />
                      {s.nom} <span className="text-zinc-400">— {s.sante_score}/100</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={reload}
            disabled={loadingOverview || loadingDetail}
          >
            {loadingOverview || loadingDetail ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {t('cpta.spcm_reload', locale)}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Indicateur global */}
      {synthese && (
        <Card className={`mb-6 border-0 shadow-md ring-2 ${style.ring} ${style.bg}`}>
          <CardContent className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`flex h-16 w-16 items-center justify-center rounded-full ${style.dot} text-white shadow-lg`}>
                  {couleur === "vert"   ? <CheckCircle2 className="h-8 w-8" /> :
                   couleur === "orange" ? <Activity      className="h-8 w-8" /> :
                                          <AlertTriangle className="h-8 w-8" />}
                </div>
                <div>
                  <p className={`text-xs font-medium uppercase tracking-wider ${style.text}`}>
                    {t('cpta.spcm_global_indicator', locale)}
                  </p>
                  <p className={`text-2xl font-bold ${style.text}`}>
                    {t(style.labelKey, locale)}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {synthese.nb_ecritures_total.toLocaleString("fr-FR")} {t('cpta.spcm_entries_analyzed', locale)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-xs font-medium uppercase tracking-wider ${style.text}`}>
                  {t('cpta.spcm_health_score', locale)}
                </p>
                <p className={`text-5xl font-bold tabular-nums ${style.text}`}>
                  {synthese.sante_score}
                  <span className="text-2xl text-zinc-400">/100</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {loadingDetail && !detail && (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t('cpta.spcm_analyzing', locale)}
        </div>
      )}

      {/* 5 cartes de détail */}
      {detail && synthese && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* 1. Déséquilibre global */}
          <CheckCard
            icon={<Scale className="h-5 w-5" />}
            title={t('cpta.spcm_card1_title', locale)}
            ok={Math.abs(synthese.desequilibre_global) <= 1.0}
            okText={t('cpta.spcm_card1_ok', locale)}
            problemText={`${t('cpta.spcm_card1_problem_pre', locale)} ${fmt(synthese.desequilibre_global)} ${t('cpta.spcm_card1_problem_post', locale)}`}
          >
            <dl className="mt-3 space-y-1 text-sm">
              <Row label={t('cpta.spcm_total_debit', locale)}  value={`${fmt(synthese.total_d_global)} MUR`} />
              <Row label={t('cpta.spcm_total_credit', locale)} value={`${fmt(synthese.total_c_global)} MUR`} />
              <Row
                label={t('cpta.spcm_gap_dc', locale)}
                value={`${fmt(synthese.desequilibre_global)} MUR`}
                emphasis={Math.abs(synthese.desequilibre_global) > 1}
              />
            </dl>
          </CheckCard>

          {/* 2. Déséquilibre par journal */}
          <CheckCard
            icon={<BookOpen className="h-5 w-5" />}
            title={t('cpta.spcm_card2_title', locale)}
            ok={synthese.nb_journaux_desequilibres === 0}
            okText={t('cpta.spcm_card2_ok', locale)}
            problemText={`${synthese.nb_journaux_desequilibres} ${t('cpta.spcm_card2_problem', locale)}`}
          >
            {detail.journaux.length > 0 ? (
              <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-sm">
                {detail.journaux.map(j => (
                  <li key={j.journal} className="flex items-center justify-between gap-2 rounded bg-white/60 px-2 py-1">
                    <Link
                      href={grandLivreLink(synthese.societe_id, { journal: j.journal })}
                      className="font-medium text-zinc-700 hover:text-zinc-900 hover:underline"
                    >
                      {j.journal} <span className="text-xs text-zinc-400">({j.nb_lignes} l.)</span>
                    </Link>
                    <span className={`font-mono tabular-nums ${Math.abs(j.ecart) > 1 ? "text-red-600" : "text-amber-600"}`}>
                      {fmt(j.ecart)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CheckCard>

          {/* 3. Folios déséquilibrés */}
          <CheckCard
            icon={<FileQuestion className="h-5 w-5" />}
            title={t('cpta.spcm_card3_title', locale)}
            ok={synthese.nb_folios_desequilibres === 0}
            okText={t('cpta.spcm_card3_ok', locale)}
            problemText={`${synthese.nb_folios_desequilibres} ${t('cpta.spcm_card3_problem', locale)}`}
          >
            {detail.folios.length > 0 ? (
              <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-sm">
                {detail.folios.slice(0, 10).map(f => (
                  <li key={f.ref_folio} className="rounded bg-white/60 px-2 py-1">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={grandLivreLink(synthese.societe_id, { ref_folio: f.ref_folio })}
                        className="truncate font-mono text-xs text-zinc-700 hover:text-zinc-900 hover:underline"
                        title={f.ref_folio}
                      >
                        {f.ref_folio}
                      </Link>
                      <span className="font-mono tabular-nums text-red-600">{fmt(f.ecart)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-zinc-400" title={f.comptes}>
                      {f.journal} · {f.comptes}
                    </div>
                  </li>
                ))}
                {detail.folios.length > 10 && (
                  <li className="px-2 py-1 text-center text-xs text-zinc-400">
                    + {detail.folios.length - 10} {t('cpta.spcm_more_folios', locale)}
                  </li>
                )}
              </ul>
            ) : null}
          </CheckCard>

          {/* 4. Écritures orphelines */}
          <CheckCard
            icon={<FileX2 className="h-5 w-5" />}
            title={t('cpta.spcm_card4_title', locale)}
            ok={synthese.nb_ecritures_orphelines === 0}
            okText={t('cpta.spcm_card4_ok', locale)}
            problemText={`${synthese.nb_ecritures_orphelines} ${t('cpta.spcm_card4_problem', locale)}`}
          >
            {detail.orphelines.length > 0 ? (
              <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-sm">
                {detail.orphelines.slice(0, 8).map(o => (
                  <li key={o.id} className="rounded bg-white/60 px-2 py-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-zinc-700">{o.numero_compte}</span>
                      <span className="font-mono tabular-nums text-xs text-zinc-500">
                        {fmt(o.debit_mur)} / {fmt(o.credit_mur)}
                      </span>
                    </div>
                    <div className="truncate text-xs text-zinc-400" title={o.libelle || ""}>
                      {o.date_ecriture}{o.journal ? ` · ${o.journal}` : ""}
                      {o.libelle ? ` — ${o.libelle}` : ""}
                    </div>
                  </li>
                ))}
                {detail.orphelines.length > 8 && (
                  <li className="px-2 py-1 text-center text-xs text-zinc-400">
                    + {detail.orphelines.length - 8} {t('cpta.spcm_more_entries', locale)}
                  </li>
                )}
              </ul>
            ) : null}
          </CheckCard>

          {/* 5. Comptes hors PCG */}
          <CheckCard
            icon={<ShieldAlert className="h-5 w-5" />}
            title={t('cpta.spcm_card5_title', locale)}
            ok={synthese.nb_comptes_invalides === 0}
            okText={t('cpta.spcm_card5_ok', locale)}
            problemText={`${synthese.nb_comptes_invalides} ${t('cpta.spcm_card5_problem', locale)}`}
          >
            {detail.comptes_invalides.length > 0 ? (
              <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-sm">
                {detail.comptes_invalides.slice(0, 10).map(c => (
                  <li key={c.numero_compte} className="flex items-center justify-between rounded bg-white/60 px-2 py-1">
                    <Link
                      href={grandLivreLink(synthese.societe_id, { numero_compte: c.numero_compte })}
                      className="font-mono text-sm text-zinc-700 hover:text-zinc-900 hover:underline"
                    >
                      {c.numero_compte}
                    </Link>
                    <span className="text-xs text-zinc-500">
                      {c.nb_lignes} l. · {fmt(c.total_debit + c.total_credit)} MUR
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CheckCard>

          {/* 6. Lien direct grand-livre */}
          <Card className="border-dashed">
            <CardContent className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <ExternalLink className="h-6 w-6 text-zinc-400" />
              <p className="text-sm font-medium text-zinc-700">
                {t('cpta.spcm_investigate', locale)}
              </p>
              <p className="text-xs text-zinc-500">
                {t('cpta.spcm_investigate_desc', locale)}
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href={grandLivreLink(synthese.societe_id)}>
                  {t('cpta.spcm_open_ledger', locale)}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {detail && (
        <p className="mt-6 text-right text-xs text-zinc-400">
          {t('cpta.spcm_updated_at', locale)} {new Date(detail.generated_at).toLocaleString("fr-FR")} {t('cpta.spcm_cached', locale)}
        </p>
      )}
    </div>
  )
}

// ── Sous-composants ─────────────────────────────────────────────────────────
function CheckCard({
  icon, title, ok, okText, problemText, children,
}: {
  icon: React.ReactNode
  title: string
  ok: boolean
  okText: string
  problemText: string
  children?: React.ReactNode
}) {
  return (
    <Card className={ok ? "" : "ring-1 ring-amber-200"}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className={ok ? "text-emerald-600" : "text-amber-600"}>{icon}</span>
          {title}
          <Badge
            variant="outline"
            className={`ml-auto text-xs ${ok ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"}`}
          >
            {ok ? "OK" : t('cpta.spcm_alert', getLocale())}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-sm ${ok ? "text-emerald-700" : "text-amber-700"}`}>
          {ok ? okText : problemText}
        </p>
        {children}
      </CardContent>
    </Card>
  )
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className={`font-mono tabular-nums ${emphasis ? "font-bold text-red-600" : "text-zinc-800"}`}>
        {value}
      </dd>
    </div>
  )
}
