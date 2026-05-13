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
      // Trouve la société courante dans la liste
      const soc = (societeRes?.societes || societeRes || []).find?.((s: any) => s.id === societeId)
      setSociete(soc || null)
      setModules({ per, substance, tp, ubo, consol, crs, pillarTwo, leases })
    } catch (e: any) {
      setError(e?.message || 'Erreur')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [societeId])

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2 text-slate-600"><Loader2 className="animate-spin h-5 w-5" /> Chargement dashboard GBC…</div>

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
      icon: Banknote, title: 'Monnaie fonctionnelle', href: '/client/societes',
      phase: 'A',
      status: mod.ias21_translation_active ? 'ok' : 'na',
      kpi: deviseFonct,
      sub: mod.ias21_translation_active ? 'Comptabilité primaire (IAS 21)' : 'Société MUR',
      show: true,  // toujours visible (info de base)
    },
    {
      icon: Banknote, title: 'PER + IS', href: '/client/gbc-per',
      phase: 'B',
      status: perEligible > 0 ? 'ok' : (mod.per_active ? 'pending' : 'na'),
      kpi: `${fmt(perTotal)} MUR`,
      sub: `${fmt(perEligible)} MUR PER-éligible`,
      show: mod.per_active,
    },
    {
      icon: Shield, title: 'Substance (CIGA)', href: '/client/gbc-substance',
      phase: 'C',
      status: substanceStatus === 'compliant' ? 'ok' : substanceStatus === 'at_risk' ? 'warning' : substanceStatus === 'non_compliant' ? 'error' : 'pending',
      kpi: substanceStatus,
      sub: 'Exigences ITA §73A + FSC',
      show: mod.substance_required,
    },
    {
      icon: GitBranch, title: 'Transfer Pricing', href: '/client/gbc-transfer-pricing',
      phase: 'D',
      status: tpFlagged > 0 ? 'error' : tpDocRequired > 0 ? 'warning' : 'ok',
      kpi: `${tpDocRequired} doc requise`,
      sub: tpFlagged > 0 ? `⚠ ${tpFlagged} hors arm's length` : 'Aucun écart détecté',
      show: mod.tp_required,
    },
    {
      icon: UserCheck, title: 'UBO', href: '/client/gbc-ubo',
      phase: 'E',
      status: uboCount === 0 ? 'error' : uboTotalPct < 75 ? 'warning' : 'ok',
      kpi: `${uboCount} UBO`,
      sub: `${uboTotalPct.toFixed(0)}% détention déclarée`,
      show: mod.ubo_required,
    },
    {
      icon: Layers, title: 'Consolidation', href: '/client/gbc-consolidation',
      phase: 'F',
      status: consolCount === 0 ? 'na' : 'ok',
      kpi: `${consolCount} filiale${consolCount > 1 ? 's' : ''}`,
      sub: consolCount > 0 ? `Goodwill ${fmt(consolGoodwill)} MUR` : 'Pas de groupe',
      show: mod.consolidation_active,
    },
    {
      icon: FileText, title: 'CRS / FATCA', href: '/client/gbc-crs-fatca',
      phase: 'G',
      status: crsCount > 0 ? 'ok' : 'na',
      kpi: `${crsCount} holders`,
      sub: 'Reporting annuel MRA',
      show: mod.crs_fatca_active,
    },
    {
      icon: Globe, title: 'Pillar Two', href: '/client/gbc-pillar-two',
      phase: 'H',
      status: pillarInScope === true ? (pillarTopUp > 0 ? 'warning' : 'ok') : pillarInScope === false ? 'na' : 'pending',
      kpi: pillarInScope === true ? `${fmt(pillarTopUp)} MUR top-up` : pillarInScope === false ? 'hors scope' : 'à évaluer',
      sub: pillarInScope === true ? `${pillarLowTaxed} juridictions low-taxed` : 'CA consolidé < €750M ?',
      show: mod.pillar_two_eligible,
    },
    {
      icon: FileSignature, title: 'IFRS 16 Leases', href: '/client/leases',
      phase: 'I',
      status: leasesCount > 0 ? 'ok' : 'na',
      kpi: `${leasesCount} actif${leasesCount > 1 ? 's' : ''}`,
      sub: leasesCount > 0 ? `${fmt(leasesRou)} MUR RoU` : 'Aucun lease',
      show: true,  // IFRS 16 cross-cutting, applicable à toutes
    },
  ]

  // Filtre les tuiles selon le régime de la société
  const tiles = tilesAll.filter(t => t.show)
  const compliantCount = tiles.filter(t => t.status === 'ok').length
  const warningCount = tiles.filter(t => t.status === 'warning').length
  const errorCount = tiles.filter(t => t.status === 'error').length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Globe className="h-6 w-6 text-purple-700" /> Dashboard GBC & Full IFRS</h1>
          <p className="text-sm text-slate-500">
            Vue d'ensemble compliance pour {societe?.nom || '—'} · Exercice {exercice}
            <Badge className={`ml-2 ${isGbc ? 'bg-purple-100 text-purple-900 border-purple-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
              {regime === 'gbc1' && 'GBC1'}
              {regime === 'authorised_company' && 'Authorised Company'}
              {regime === 'holding' && 'Holding'}
              {regime === 'branch_foreign_pe' && 'Succursale étrangère'}
              {regime === 'domestic' && 'PME Domestic'}
              {' · '}{deviseFonct}
            </Badge>
          </p>
        </div>
        <Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />Rafraîchir</Button>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Modules conformes</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-emerald-700">{compliantCount}</div><div className="text-xs text-slate-500">sur {tiles.length} phases</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Modules à risque</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-amber-700">{warningCount}</div><div className="text-xs text-slate-500">at_risk / warnings</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Modules non conformes</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-red-700">{errorCount}</div><div className="text-xs text-slate-500">action requise</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map(t => {
          const Status = STATUS_ICON[t.status]
          return (
            <Link key={t.title} href={t.href} className={`rounded-xl border p-4 transition hover:shadow-md ${STATUS_CLASS[t.status]} block`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <t.icon className="h-5 w-5" />
                  <span className="text-xs font-mono font-semibold uppercase tracking-wide">Phase {t.phase}</span>
                </div>
                <Status className={`h-4 w-4 ${t.status === 'pending' ? 'animate-spin' : ''}`} />
              </div>
              <div className="text-sm font-semibold mb-1">{t.title}</div>
              <div className="text-2xl font-bold mb-1">{t.kpi}</div>
              <div className="text-xs opacity-75 mb-2">{t.sub}</div>
              <div className="text-xs flex items-center gap-1 opacity-75">Ouvrir le module <ArrowRight className="h-3 w-3" /></div>
            </Link>
          )
        })}
      </div>

      <div className="text-xs text-slate-500 flex items-start gap-2 p-3 rounded bg-slate-50 border border-slate-200">
        <Globe className="h-4 w-4 mt-0.5" />
        <div>
          <strong>Tip :</strong> les modules avec statut <code className="bg-slate-100 px-1 rounded">na</code> (non-applicable)
          ne sont actifs que pour les GBC1, Authorised Companies ou holdings. Pour activer une société comme GBC, change
          <code className="bg-slate-100 px-1 rounded">societes.devise_fonctionnelle</code> ≠ MUR depuis la page société ou via SQL.
        </div>
      </div>
    </div>
  )
}
