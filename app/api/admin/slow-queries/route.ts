/**
 * GET /api/admin/slow-queries
 *
 * Lit pg_stat_statements (Supabase l'expose dans le schéma extensions) pour
 * remonter les 50 requêtes les plus coûteuses en temps total. On filtre les
 * internals Supabase (pgrst, pgbouncer, pg_*, supabase_admin) et le bruit
 * répété (BEGIN/COMMIT/SET).
 *
 * Auth : super_admin uniquement (cette vue expose des fragments SQL et peut
 * révéler des patterns sensibles).
 *
 * Implémentation : on appelle une RPC SQL définie ci-dessous (il faut la
 * créer une fois en DB) ; si la RPC ou pg_stat_statements n'est pas dispo,
 * on retourne 503 avec un message explicite plutôt que 500.
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/observability/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface SlowQueryRow {
  query: string
  calls: number
  total_exec_time_ms: number
  mean_exec_time_ms: number
  rows: number
  shared_blks_hit: number | null
  shared_blks_read: number | null
}

async function requireSuperAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401, error: 'Non autorisé' }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'super_admin') {
    return { ok: false as const, status: 403, error: 'Forbidden — super_admin only' }
  }
  return { ok: true as const }
}

export async function GET() {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = getAdminClient()

  try {
    const { data, error } = await supabase.rpc('admin_slow_queries', { p_limit: 50 })
    if (error) {
      // pg_stat_statements pas activé ou RPC absente -> 503 explicite
      const msg = error.message || ''
      if (
        msg.includes('pg_stat_statements') ||
        msg.toLowerCase().includes('does not exist') ||
        msg.includes('admin_slow_queries')
      ) {
        return NextResponse.json({
          error: 'pg_stat_statements_not_available',
          hint:
            "Activer l'extension pg_stat_statements côté Supabase (Dashboard → Database → Extensions) " +
            "et exécuter la migration scripts/sql/admin_slow_queries.sql.",
          detail: msg,
        }, { status: 503 })
      }
      throw error
    }

    const rows = ((data || []) as SlowQueryRow[]).map((r) => ({
      query: r.query,
      calls: Number(r.calls) || 0,
      total_exec_time_ms: Number(r.total_exec_time_ms) || 0,
      mean_exec_time_ms: Number(r.mean_exec_time_ms) || 0,
      rows: Number(r.rows) || 0,
      shared_blks_hit: r.shared_blks_hit,
      shared_blks_read: r.shared_blks_read,
      cache_hit_ratio:
        r.shared_blks_hit && (r.shared_blks_hit + (r.shared_blks_read || 0)) > 0
          ? Number(
              (
                r.shared_blks_hit /
                (r.shared_blks_hit + (r.shared_blks_read || 0))
              ).toFixed(3)
            )
          : null,
    }))

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      count: rows.length,
      queries: rows,
    })
  } catch (e) {
    logError(e, { route: '/api/admin/slow-queries' })
    return NextResponse.json({ error: 'slow_queries_failed' }, { status: 500 })
  }
}
