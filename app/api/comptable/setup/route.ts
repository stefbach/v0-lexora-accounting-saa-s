import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/**
 * Health check for the accounting module.
 * Returns the status of each critical migration/table/seed so the UI can
 * display actionable warnings instead of cryptic SQL errors.
 */
export async function GET() {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const checks: Record<string, { ok: boolean; detail?: string }> = {}

    // 1. Plan comptable populated?
    try {
      const { count } = await supabase
        .from('plan_comptable')
        .select('compte', { head: true, count: 'exact' })
      checks.plan_comptable = {
        ok: (count || 0) > 0,
        detail: count ? `${count} comptes` : 'Vide — exécuter /api/comptable/plan-comptable/seed',
      }
    } catch (e) {
      checks.plan_comptable = { ok: false, detail: e instanceof Error ? e.message : 'Table absente' }
    }

    // 2. Audit log table (migration 126)
    try {
      const { error } = await supabase.from('rapprochement_audit_log').select('id').limit(1)
      checks.rapprochement_audit_log = { ok: !error, detail: error?.message || 'OK' }
    } catch (e) {
      checks.rapprochement_audit_log = { ok: false, detail: e instanceof Error ? e.message : 'Migration 126 manquante' }
    }

    // 3. Validation log table (migration 146)
    try {
      const { error } = await supabase.from('rapprochement_validation_log').select('id').limit(1)
      checks.rapprochement_validation_log = { ok: !error, detail: error?.message || 'OK' }
    } catch (e) {
      checks.rapprochement_validation_log = { ok: false, detail: e instanceof Error ? e.message : 'Migration 146 manquante' }
    }

    // 4. Validation columns on rapprochements_bancaires
    try {
      const { error } = await supabase
        .from('rapprochements_bancaires')
        .select('locked, snapshot_at_validation, hash_integrite, justification_ecart')
        .limit(1)
      checks.rapprochement_validation_columns = { ok: !error, detail: error?.message || 'OK' }
    } catch (e) {
      checks.rapprochement_validation_columns = { ok: false, detail: e instanceof Error ? e.message : 'Colonnes manquantes — migration 146' }
    }

    // 5. Lettrage columns on ecritures
    try {
      const { error } = await supabase
        .from('ecritures_comptables')
        .select('lettre, date_lettrage, lettrage_auto')
        .limit(1)
      checks.lettrage_columns = { ok: !error, detail: error?.message || 'OK' }
    } catch (e) {
      checks.lettrage_columns = { ok: false, detail: e instanceof Error ? e.message : 'Migration 019 manquante' }
    }

    // 6. Exchange rates in DB
    try {
      const { count } = await supabase
        .from('taux_change')
        .select('id', { head: true, count: 'exact' })
      checks.taux_change = {
        ok: (count || 0) > 0,
        detail: count ? `${count} taux enregistrés` : "Aucun taux — exécuter POST /api/comptable/taux-change action=update_from_api",
      }
    } catch (e) {
      checks.taux_change = { ok: false, detail: e instanceof Error ? e.message : 'Table absente' }
    }

    const overall = Object.values(checks).every(c => c.ok)
    return NextResponse.json({
      ok: overall,
      checks,
      missing: Object.entries(checks).filter(([, v]) => !v.ok).map(([k]) => k),
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
