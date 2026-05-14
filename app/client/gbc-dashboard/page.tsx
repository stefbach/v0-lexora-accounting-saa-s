"use client"

/**
 * /client/gbc-dashboard — Vue d'ensemble compliance GBC + Full IFRS.
 *
 * Agrège en une page :
 *   • Devise fonctionnelle (Phase A)
 *   • IS estimé avec PER (Phase B)
 *   • Substance status (Phase C)
 *   • Transactions intragroupe TP (Phase D)
 *   • UBO actifs (Phase E)
 *   • Consolidation : nb filiales (Phase F)
 *   • CRS / FATCA — comptes déclarables (Phase G)
 *   • Pillar Two — in scope / out of scope (Phase H)
 *   • Leases IFRS 16 actifs (Phase I)
 *
 * Pour chaque module : KPI principal + lien vers la page dédiée + statut
 * compliance (vert/jaune/rouge).
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, AlertCircle, CheckCircle2, XCircle, ArrowRight, Globe, Banknote, Shield, GitBranch, UserCheck, Layers, FileText, FileSignature } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'
import Link from 'next/link'
import { t, getLocale, type Locale } from '@/lib/i18n'

const fmt = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n))

type ModuleStatus = 'ok' | 'warning' | 'error' | 'pending' | 'na'
const STATUS_CLASS: Record<ModuleStatus, string> = {
  ok:      'bg-emerald-50 border-emerald-200 text-emerald-900',
  warning: 'bg-amber-50 border-amber-200 text-amber-900',
  error:   'bg-red-50 border-red-200 text-red-900',
  pending: 'bg-slate-50 border-slate-200 text-slate-700',
  na:      'bg-slate-50 border-slate-200 text-slate-500',
}
const STATUS_ICON: Record<ModuleStatus, any> = {
  ok: CheckCircle2, warning: AlertCircle, error: XCircle, pending: Loader2, na: AlertCircle,
}

export default function GbcDashboardPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [societe, setSociete] = useState<any>(null)
  const [modules, setModules] = useState<any>({})

  const exercice = (() => {
    const y = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1
    return `${y}-${y + 1}`
  })()
  const year = parseInt(exercice.split('-')[0])

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      // Fetch all GBC modules in parallel for the active société
      const [per, substance, tp, ubo, consol, crs, pillarTwo, leases, societeRes] = await Promise.all([
        fetch(`/api/comptable/gbc/per-computation?societe_id=${societeId}&exercice=${exercice}`).then(r => r.json()).catch(() => null),
        fetch(`/api/comptable/gbc/substance?societe_id=${societeId}&exercice=${exercice}`).then(r => r.json()).catch(() => null),
        fetch(`/api/comptable/gbc/transfer-pricing?societe_id=${societeId}&exercice=${exercice}`).then(r => r.json()).catch(() => null),
        fetch(`/api/comptable/gbc/beneficial-owners?societe_id=${societeId}`).then(r => r.json()).catch(() => null),
        fetch(`/api/comptable/gbc/consolidate?parent_societe_id=${societeId}&exercice=${exercice}`).then(r => r.json()).catch(() => null),
        fetch(`/api/comptable/gbc/crs-fatca?societe_id=${societeId}&year=${year}`).then(r => r.json()).catch(() => null),
        fetch(`/api/comptable/gbc/pillar-two?societe_id=${societeId}&exercice=${exercice}`).then(r => r.json()).catch(() => null),
        fetch(`/api/comptable/leases?societe_id=${societeId}`).then(r => r.json()).catch(() => null),
        fetch(`/api/comptable/mes-societes`).then(r => r.json()).catch(() => null),
      ])
      // Trouve la société courante dans la liste (extraction robuste)
      const socList = Array.isArray(societeRes?.societes) ? societeRes.societes
        : Array.isArray(societeRes) ? societeRes : []
      const soc = socList.find((s: any) => s.id === societeId)
      setSociete(soc || null)
      setModules({ per, substance, tp, ubo, consol, crs, pillarTwo, leases })
    } catch (e: any) {
      setError(e?.message || 'Erreur')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [societeId])

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('gbc.common.no_societe', locale)}</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2 text-slate-600"><Loader2 className="animate-spin h-5 w-5" /> {t('gbc.dashboard.loading', locale)}</div>

  // Compute status per module
  const deviseFonct = societe?.devise_fonctionnelle || 'MUR'
  const regime: 'domestic' | 'gbc1' | 'authorised_company' | 'holding' | 'branch_foreign_pe' = societe?.regime || 'domestic'
  const isGbc = regime !== 'domestic'
  // Active modules selon le régime (mirror de lib/accounting/regime.ts)
  const mod = {
    per_active: regime === 'gbc1' || regime === 'authorised_company' || regime === 'holding',
    substance_required: regime === 'gbc1' || regime === 'holding',
    ubo_required: regime === 'gbc1' || regime === 'authorised_company' || regime === 'holding',
    tp_required: regime === 'gbc1' || regime === 'authorised_company' || regime === 'holding',
    consolidation_active: regime === 'holding',
    crs_fatca_active: regime === 'gbc1' || regime === 'authorised_company',
    pillar_two_eligible: regime === 'holding',
    ias21_translation_active: deviseFonct !== 'MUR' || regime === 'branch_foreign_pe',
  }

  const perTotal = Number(modules.per?.tax_breakdown?.net_tax_liability_mur) || 0
  const perEligible = Number(modules.per?.tax_breakdown?.per_eligible_revenue_mur) || 0
  const substanceStatus = modules.substance?.auto_assessment?.overall_status || 'pending'
  const tpFlagged = Number(modules.tp?.summary?.flagged_not_arms_length) || 0
  const tpDocRequired = Number(modules.tp?.summary?.by_tier?.documentation_required) || 0
  const uboTotalPct = Number(modules.ubo?.summary?.total_pct_declared) || 0
  const uboCount = Number(modules.ubo?.summary?.nb_active) || 0
  const consolCount = Number(modules.consol?.consolidation_scope?.full) || 0
  const consolGoodwill = Number(modules.consol?.total_goodwill_mur) || 0
  const crsCount = Number(modules.crs?.summary?.nb_holders) || 0
  const pillarInScope = modules.pillarTwo?.summary?.in_scope
  const pillarTopUp = Number(modules.pillarTwo?.summary?.total_top_up_mur) || 0
  const pillarLowTaxed = Number(modules.pillarTwo?.summary?.nb_low_taxed) || 0
  const leasesCount = Number(modules.leases?.summary?.nb_active) || 0
  const leasesRou = Number(modules.leases?.summary?.total_rou_mur) || 0

  const tilesAll: Array<{ icon: any; title: string; href: string; status: ModuleStatus; kpi: string; sub: string; phase: string; show: boolean }> = [
    {
      icon: Banknote, title: t('gbc.dashboard.tile.functional_currency', locale), href: '/client/societes',
      phase: 'A',
      status: mod.ias21_translation_active ? 'ok' : 'na',
      kpi: deviseFonct,
      sub: mod.ias21_translation_active ? t('gbc.dashboard.tile.functional_currency_sub_active', locale) : t('gbc.dashboard.tile.functional_currency_sub_mur', locale),
      show: true,  // toujours visible (info de base)
    },
    {
      icon: Banknote, title: t('gbc.dashboard.tile.per_is', locale), href: '/client/gbc-per',
      phase: 'B',
      status: perEligible > 0 ? 'ok' : (mod.per_active ? 'pending' : 'na'),
      kpi: `${fmt(perTotal)} MUR`,
      sub: `${fmt(perEligible)} ${t('gbc.dashboard.tile.per_is_sub_suffix', locale)}`,
      show: mod.per_active,
    },
    {
      icon: Shield, title: t('gbc.dashboard.tile.substance', locale), href: '/client/gbc-substance',
      phase: 'C',
      status: substanceStatus === 'compliant' ? 'ok' : substanceStatus === 'at_risk' ? 'warning' : substanceStatus === 'non_compliant' ? 'error' : 'pending',
      kpi: substanceStatus,
      sub: t('gbc.dashboard.tile.substance_sub', locale),
      show: mod.substance_required,
    },
    {
      icon: GitBranch, title: t('gbc.dashboard.tile.tp', locale), href: '/client/gbc-transfer-pricing',
      phase: 'D',
      status: tpFlagged > 0 ? 'error' : tpDocRequired > 0 ? 'warning' : 'ok',
      kpi: `${tpDocRequired} ${t('gbc.dashboard.tile.tp_doc_required_suffix', locale)}`,
      sub: tpFlagged > 0 ? `⚠ ${tpFlagged} ${t('gbc.dashboard.tile.tp_arms_length_suffix', locale)}` : t('gbc.dashboard.tile.tp_no_issue', locale),
      show: mod.tp_required,
    },
    {
      icon: UserCheck, title: t('gbc.dashboard.tile.ubo', locale), href: '/client/gbc-ubo',
      phase: 'E',
      status: uboCount === 0 ? 'error' : uboTotalPct < 75 ? 'warning' : 'ok',
      kpi: `${uboCount} ${t('gbc.dashboard.tile.ubo_kpi_suffix', locale)}`,
      sub: `${uboTotalPct.toFixed(0)}% ${t('gbc.dashboard.tile.ubo_pct_suffix', locale)}`,
      show: mod.ubo_required,
    },
    {
      icon: Layers, title: t('gbc.dashboard.tile.consolidation', locale), href: '/client/gbc-consolidation',
      phase: 'F',
      status: consolCount === 0 ? 'na' : 'ok',
      kpi: `${consolCount} ${consolCount > 1 ? t('gbc.dashboard.tile.consolidation_subsidiary_many', locale) : t('gbc.dashboard.tile.consolidation_subsidiary_one', locale)}`,
      sub: consolCount > 0 ? `${t('gbc.dashboard.tile.consolidation_goodwill_prefix', locale)} ${fmt(consolGoodwill)} MUR` : t('gbc.dashboard.tile.consolidation_no_group', locale),
      show: mod.consolidation_active,
    },
    {
      icon: FileText, title: t('gbc.dashboard.tile.crs_fatca', locale), href: '/client/gbc-crs-fatca',
      phase: 'G',
      status: crsCount > 0 ? 'ok' : 'na',
      kpi: `${crsCount} ${t('gbc.dashboard.tile.crs_holders_suffix', locale)}`,
      sub: t('gbc.dashboard.tile.crs_sub', locale),
      show: mod.crs_fatca_active,
    },
    {
      icon: Globe, title: t('gbc.dashboard.tile.pillar_two', locale), href: '/client/gbc-pillar-two',
      phase: 'H',
      status: pillarInScope === true ? (pillarTopUp > 0 ? 'warning' : 'ok') : pillarInScope === false ? 'na' : 'pending',
      kpi: pillarInScope === true ? `${fmt(pillarTopUp)} ${t('gbc.dashboard.tile.pillar_top_up_suffix', locale)}` : pillarInScope === false ? t('gbc.dashboard.tile.pillar_out_scope', locale) : t('gbc.dashboard.tile.pillar_to_assess', locale),
      sub: pillarInScope === true ? `${pillarLowTaxed} ${t('gbc.dashboard.tile.pillar_jurisdictions_suffix', locale)}` : t('gbc.dashboard.tile.pillar_threshold_question', locale),
      show: mod.pillar_two_eligible,
    },
    {
      icon: FileSignature, title: t('gbc.dashboard.tile.leases', locale), href: '/client/leases',
      phase: 'I',
      status: leasesCount > 0 ? 'ok' : 'na',
      kpi: `${leasesCount} ${leasesCount > 1 ? t('gbc.dashboard.tile.leases_active_many', locale) : t('gbc.dashboard.tile.leases_active_one', locale)}`,
      sub: leasesCount > 0 ? `${fmt(leasesRou)} ${t('gbc.dashboard.tile.leases_rou_suffix', locale)}` : t('gbc.dashboard.tile.leases_none', locale),
      show: true,  // IFRS 16 cross-cutting, applicable à toutes
    },
  ]

  // Filtre les tuiles selon le régime de la société
  const tiles = tilesAll.filter(tile => tile.show)
  const compliantCount = tiles.filter(tile => tile.status === 'ok').length
  const warningCount = tiles.filter(tile => tile.status === 'warning').length
  const errorCount = tiles.filter(tile => tile.status === 'error').length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Globe className="h-6 w-6 text-purple-700" /> {t('gbc.dashboard.title', locale)}</h1>
          <p className="text-sm text-slate-500">
            {t('gbc.dashboard.subtitle_prefix', locale)} {societe?.nom || '—'} · {t('gbc.dashboard.fiscal_year', locale)} {exercice}
            <Badge className={`ml-2 ${isGbc ? 'bg-purple-100 text-purple-900 border-purple-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
              {regime === 'gbc1' && t('gbc.dashboard.regime_gbc1', locale)}
              {regime === 'authorised_company' && t('gbc.dashboard.regime_authorised_company', locale)}
              {regime === 'holding' && t('gbc.dashboard.regime_holding', locale)}
              {regime === 'branch_foreign_pe' && t('gbc.dashboard.regime_branch_foreign_pe', locale)}
              {regime === 'domestic' && t('gbc.dashboard.regime_domestic', locale)}
              {' · '}{deviseFonct}
            </Badge>
          </p>
        </div>
        <Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />{t('gbc.dashboard.refresh', locale)}</Button>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">{t('gbc.dashboard.compliant_modules', locale)}</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-emerald-700">{compliantCount}</div><div className="text-xs text-slate-500">{t('gbc.dashboard.on', locale)} {tiles.length} {t('gbc.dashboard.phases_suffix', locale)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">{t('gbc.dashboard.modules_at_risk', locale)}</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-amber-700">{warningCount}</div><div className="text-xs text-slate-500">{t('gbc.dashboard.at_risk_warnings', locale)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">{t('gbc.dashboard.non_compliant_modules', locale)}</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-red-700">{errorCount}</div><div className="text-xs text-slate-500">{t('gbc.dashboard.action_required', locale)}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map(tile => {
          const Status = STATUS_ICON[tile.status]
          return (
            <Link key={tile.title} href={tile.href} className={`rounded-xl border p-4 transition hover:shadow-md ${STATUS_CLASS[tile.status]} block`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <tile.icon className="h-5 w-5" />
                  <span className="text-xs font-mono font-semibold uppercase tracking-wide">{t('gbc.dashboard.phase_prefix', locale)} {tile.phase}</span>
                </div>
                <Status className={`h-4 w-4 ${tile.status === 'pending' ? 'animate-spin' : ''}`} />
              </div>
              <div className="text-sm font-semibold mb-1">{tile.title}</div>
              <div className="text-2xl font-bold mb-1">{tile.kpi}</div>
              <div className="text-xs opacity-75 mb-2">{tile.sub}</div>
              <div className="text-xs flex items-center gap-1 opacity-75">{t('gbc.dashboard.open_module', locale)} <ArrowRight className="h-3 w-3" /></div>
            </Link>
          )
        })}
      </div>

      <div className="text-xs text-slate-500 flex items-start gap-2 p-3 rounded bg-slate-50 border border-slate-200">
        <Globe className="h-4 w-4 mt-0.5" />
        <div>
          <strong>{t('gbc.dashboard.tip_label', locale)}</strong> {t('gbc.dashboard.tip_body', locale)}
        </div>
      </div>
    </div>
  )
}
