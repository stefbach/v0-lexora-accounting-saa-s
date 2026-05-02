/**
 * Supabase admin client for E2E test seed/cleanup.
 *
 * Reads from env (in priority order) :
 *   1. SUPABASE_URL_TEST + SUPABASE_SERVICE_ROLE_KEY_TEST   (preferred)
 *   2. NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (fallback)
 *
 * If `DATABASE_URL_TEST` is unset (and no SUPABASE_*_TEST), we consider the
 * test environment unavailable and the spec should `test.skip()`.
 *
 * Never use this client against production — the service role key bypasses RLS.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function isTestDbAvailable(): boolean {
  const hasDirectFlag = !!process.env.DATABASE_URL_TEST
  const hasTestSupa = !!process.env.SUPABASE_URL_TEST && !!process.env.SUPABASE_SERVICE_ROLE_KEY_TEST
  const hasFallback = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY
  return hasDirectFlag || hasTestSupa || hasFallback
}

let _admin: SupabaseClient | null = null

export function getTestAdminClient(): SupabaseClient {
  if (_admin) return _admin
  const url = process.env.SUPABASE_URL_TEST || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY_TEST || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Test Supabase env missing. Set SUPABASE_URL_TEST + SUPABASE_SERVICE_ROLE_KEY_TEST.',
    )
  }
  _admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _admin
}

/** Resolve a societe_id by name; returns null if not found. */
export async function resolveSocieteId(name: string): Promise<string | null> {
  const supa = getTestAdminClient()
  const { data } = await supa
    .from('societes')
    .select('id')
    .eq('nom', name)
    .limit(1)
    .maybeSingle()
  return (data as any)?.id ?? null
}

/** Delete a list of factures (and dependent ecritures) by id. */
export async function cleanupFactures(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const supa = getTestAdminClient()
  await supa.from('ecritures_comptables_v2').delete().in('facture_id', ids)
  await supa.from('factures').delete().in('id', ids)
}

/** Quickly count entries on a given account for a société. */
export async function countEcrituresByCompte(
  societeId: string,
  numeroCompte: string,
  exercice?: string,
): Promise<number> {
  const supa = getTestAdminClient()
  let q = supa
    .from('ecritures_comptables_v2')
    .select('id', { count: 'exact', head: true })
    .eq('societe_id', societeId)
    .eq('numero_compte', numeroCompte)
  if (exercice) q = q.eq('exercice', exercice)
  const { count } = await q
  return count || 0
}
