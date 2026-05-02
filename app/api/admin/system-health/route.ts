/**
 * GET /api/admin/system-health
 *
 * Sprint 7 / Production-readiness — health check d'infrastructure.
 *
 * Complète /api/admin/health (qui se concentre sur l'intégrité comptable)
 * en remontant des KPIs système :
 *   • DB connectivity (SELECT 1)
 *   • Nb de migrations appliquées (mesuré côté DB si exposable, sinon
 *     fallback : count des fichiers connus côté repo n'est pas accessible
 *     au runtime → on retourne null + hint)
 *   • Dernier run des crons critiques (cron_logs)
 *   • Compteurs des tables critiques
 *   • Vérifs intégrité supplémentaires (factures sans écriture, lettres
 *     déséquilibrées, écritures montant 0)
 *
 * Retourne un format KPI-cards friendly :
 *   { kpis: [{ id, label, value, status, severity, hint? }], generated_at }
 *
 * Auth : admin / super_admin.
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/observability/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Status = 'ok' | 'warn' | 'fail' | 'unknown'

interface Kpi {
  id: string
  label: string
  value: number | string | null
  status: Status
  severity: 'critical' | 'warning' | 'info'
  hint?: string
  meta?: Record<string, unknown>
}

const CRITICAL_CRONS = [
  'compliance-scan',
  'brief-mensuel',
  'db-health-check',
  'maj-taux-change',
]

const CRITICAL_TABLES: Array<{ table: string; label: string }> = [
  { table: 'factures', label: 'Factures' },
  { table: 'ecritures_comptables_v2', label: 'Écritures comptables v2' },
  { table: 'bulletins_paie', label: 'Bulletins de paie' },
  { table: 'releves_bancaires', label: 'Relevés bancaires' },
]

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401, error: 'Non autorisé' }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!['admin', 'super_admin'].includes(profile?.role || '')) {
    return { ok: false as const, status: 403, error: 'Forbidden' }
  }
  return { ok: true as const }
}

/**
 * Compte rapide via head=true count='exact'. Renvoie null en cas d'erreur.
 */
async function countTable(
  supabase: ReturnType<typeof getAdminClient>,
  table: string
): Promise<number | null> {
  try {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
    if (error) return null
    return count ?? 0
  } catch {
    return null
  }
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = getAdminClient()
  const kpis: Kpi[] = []
  const t0 = Date.now()

  // ── 1. DB connectivity ─────────────────────────────────────────────
  try {
    const probe = await supabase.from('societes').select('id', { head: true, count: 'exact' }).limit(1)
    if (probe.error) throw probe.error
    kpis.push({
      id: 'db_connectivity',
      label: 'Connectivité DB',
      value: 'OK',
      status: 'ok',
      severity: 'critical',
    })
  } catch (e) {
    logError(e, { source: 'system-health.db_connectivity' })
    kpis.push({
      id: 'db_connectivity',
      label: 'Connectivité DB',
      value: 'KO',
      status: 'fail',
      severity: 'critical',
      hint: e instanceof Error ? e.message : String(e),
    })
  }

  // ── 2. Migrations count (via une RPC optionnelle) ────────────────
  // Supabase ne permet pas de listdir au runtime — si tu veux la valeur
  // exacte, expose une RPC SELECT count(*) FROM supabase_migrations.schema_migrations.
  try {
    const { data, error } = await supabase
      .from('schema_migrations')
      .select('version', { head: false, count: 'exact' })
      .limit(1)
    if (error) throw error
    const count = (data as { version: string }[] | null)?.length ?? null
    kpis.push({
      id: 'migrations_applied',
      label: 'Migrations appliquées (DB)',
      value: count,
      status: count !== null && count > 0 ? 'ok' : 'unknown',
      severity: 'info',
    })
  } catch {
    kpis.push({
      id: 'migrations_applied',
      label: 'Migrations appliquées (DB)',
      value: null,
      status: 'unknown',
      severity: 'info',
      hint: 'Table schema_migrations non lisible (privilèges) — non bloquant.',
    })
  }

  // ── 3. Dernier run des crons critiques ─────────────────────────────
  for (const cronName of CRITICAL_CRONS) {
    try {
      const { data, error } = await supabase
        .from('cron_logs')
        .select('cron_name, statut, executed_at, details')
        .eq('cron_name', cronName)
        .order('executed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!data) {
        kpis.push({
          id: `cron_${cronName}`,
          label: `Cron ${cronName}`,
          value: 'jamais exécuté',
          status: 'warn',
          severity: 'warning',
        })
        continue
      }
      const ageHours = (Date.now() - new Date(data.executed_at).getTime()) / 36e5
      let status: Status = 'ok'
      if (data.statut === 'error') status = 'fail'
      else if (ageHours > 36) status = 'warn'
      kpis.push({
        id: `cron_${cronName}`,
        label: `Cron ${cronName}`,
        value: `${data.statut} · il y a ${ageHours.toFixed(1)}h`,
        status,
        severity: 'warning',
        meta: { executed_at: data.executed_at, statut: data.statut },
      })
    } catch (e) {
      kpis.push({
        id: `cron_${cronName}`,
        label: `Cron ${cronName}`,
        value: null,
        status: 'unknown',
        severity: 'info',
        hint: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // ── 4. Compteurs des tables critiques ────────────────────────────
  for (const t of CRITICAL_TABLES) {
    const count = await countTable(supabase, t.table)
    kpis.push({
      id: `count_${t.table}`,
      label: t.label,
      value: count,
      status: count === null ? 'unknown' : 'ok',
      severity: 'info',
    })
  }

  // ── 5. Intégrité — factures sans écritures (rapide, agrégé) ──────
  try {
    const { count: facturesActiveCount } = await supabase
      .from('factures')
      .select('id', { count: 'exact', head: true })
      .not('statut', 'in', '(brouillon,annule)')
    const { data: ecrFacIds } = await supabase
      .from('ecritures_comptables_v2')
      .select('facture_id')
      .not('facture_id', 'is', null)
      .limit(50000)
    const linked = new Set<string>()
    for (const r of (ecrFacIds || []) as { facture_id: string | null }[]) {
      if (r.facture_id) linked.add(r.facture_id)
    }
    const totalActive = facturesActiveCount ?? 0
    const orphanEstimate = Math.max(0, totalActive - linked.size)
    kpis.push({
      id: 'factures_sans_ecriture',
      label: 'Factures sans écriture (estim.)',
      value: orphanEstimate,
      status: orphanEstimate === 0 ? 'ok' : orphanEstimate < 5 ? 'warn' : 'fail',
      severity: orphanEstimate < 5 ? 'warning' : 'critical',
      hint: 'Estimation rapide — voir /admin/health pour le détail.',
    })
  } catch (e) {
    kpis.push({
      id: 'factures_sans_ecriture',
      label: 'Factures sans écriture',
      value: null,
      status: 'unknown',
      severity: 'warning',
      hint: e instanceof Error ? e.message : String(e),
    })
  }

  // ── 6. Lettres déséquilibrées (vue dédiée si elle existe) ──────────
  try {
    const { count, error } = await supabase
      .from('vw_lettres_desequilibrees')
      .select('*', { count: 'exact', head: true })
    if (error) throw error
    const n = count ?? 0
    kpis.push({
      id: 'lettres_desequilibrees',
      label: 'Lettres déséquilibrées',
      value: n,
      status: n === 0 ? 'ok' : n < 5 ? 'warn' : 'fail',
      severity: 'critical',
    })
  } catch {
    kpis.push({
      id: 'lettres_desequilibrees',
      label: 'Lettres déséquilibrées',
      value: null,
      status: 'unknown',
      severity: 'info',
      hint: 'Vue vw_lettres_desequilibrees non disponible.',
    })
  }

  // ── 7. Écritures à montant 0 ──────────────────────────────────────
  try {
    const { count, error } = await supabase
      .from('ecritures_comptables_v2')
      .select('id', { count: 'exact', head: true })
      .eq('debit_mur', 0)
      .eq('credit_mur', 0)
    if (error) throw error
    const n = count ?? 0
    kpis.push({
      id: 'ecritures_montant_zero',
      label: 'Écritures à montant 0',
      value: n,
      status: n === 0 ? 'ok' : n < 10 ? 'warn' : 'fail',
      severity: 'warning',
    })
  } catch (e) {
    kpis.push({
      id: 'ecritures_montant_zero',
      label: 'Écritures à montant 0',
      value: null,
      status: 'unknown',
      severity: 'info',
      hint: e instanceof Error ? e.message : String(e),
    })
  }

  const summary = {
    total: kpis.length,
    ok: kpis.filter((k) => k.status === 'ok').length,
    warn: kpis.filter((k) => k.status === 'warn').length,
    fail: kpis.filter((k) => k.status === 'fail').length,
    unknown: kpis.filter((k) => k.status === 'unknown').length,
  }

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - t0,
    summary,
    kpis,
  })
}
