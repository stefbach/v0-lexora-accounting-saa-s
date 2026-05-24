/**
 * /api/admin/diag-team-leader
 *
 * GET — diagnostic ciblé pour le rôle team_leader :
 *   - Liste les CHECK constraints role sur profiles + user_societes
 *   - Indique si team_leader est autorisé sur chacune
 *   - Compte le nombre de profiles avec role='team_leader'
 *
 * POST — DEPRECATED depuis SEC-002 : la RPC exec_sql a été révoquée
 *   (vecteur DDL arbitraire SECURITY DEFINER). Cette route ne tente plus
 *   d'appliquer la migration et renvoie 410 avec le SQL à lancer
 *   manuellement dans Supabase Studio.
 *
 * Voir docs/audit-partials/wave2-F-secu-critique.md SEC-002.
 */

import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function requireAdmin() {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const { data: profile } = await auth.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return null
  return user
}

const MIGRATION_SQL = `
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'admin','super_admin','client_admin','client_user','client_assistant',
    'comptable','comptable_dedie','rh','rh_manager','juridique',
    'employe','salarie','manager','team_leader','direction'
  ));
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_societes' AND column_name='role'
  ) THEN
    ALTER TABLE public.user_societes DROP CONSTRAINT IF EXISTS user_societes_role_check;
    ALTER TABLE public.user_societes ADD CONSTRAINT user_societes_role_check
      CHECK (role IN (
        'admin','super_admin','client_admin','client_user','client_assistant',
        'comptable','comptable_dedie','rh','rh_manager','juridique',
        'employe','salarie','manager','team_leader','direction'
      ));
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
`

export async function GET() {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Forbidden — admin/super_admin requis' }, { status: 403 })

  const supabase = getAdminClient()
  const report: Record<string, any> = {}

  // Probe : insertion test sur un profile pour vérifier que team_leader passe
  try {
    const probeId = '00000000-0000-0000-0000-000000000000'
    const { error } = await supabase.from('profiles').upsert({
      id: probeId,
      email: 'probe@lexora.local',
      full_name: 'probe',
      role: 'team_leader',
    }, { onConflict: 'id' })
    if (error) {
      report.team_leader_role_blocked = true
      report.error = error.message
      report.likely_cause = /profiles_role_check/i.test(error.message)
        ? 'profiles_role_check rejette team_leader — migration 261 non appliquée sur profiles'
        : 'Autre erreur (voir error.message)'
    } else {
      report.team_leader_role_blocked = false
      // Cleanup
      await supabase.from('profiles').delete().eq('id', probeId)
    }
  } catch (e: any) {
    report.team_leader_role_blocked = true
    report.exception = e?.message
  }

  // Probe : user_societes
  try {
    const { error } = await supabase.from('user_societes').insert({
      user_id: '00000000-0000-0000-0000-000000000000',
      societe_id: '00000000-0000-0000-0000-000000000000',
      role: 'team_leader',
      actif: true,
    })
    if (error) {
      report.user_societes_role_blocked = /user_societes_role_check/i.test(error.message)
      report.user_societes_error = error.message
    } else {
      report.user_societes_role_blocked = false
    }
  } catch (e: any) {
    report.user_societes_exception = e?.message
  }

  // exec_sql RPC retirée (SEC-002) — ne plus la probe
  report.exec_sql_rpc_available = false
  report.exec_sql_note = 'Removed by SEC-002 hardening — apply migrations via supabase/migrations/'

  report.fix_via_post = `Deprecated : appliquez supabase/migrations/261_team_leader_role.sql via Supabase Studio`
  report.fix_manual = 'Copier-coller MIGRATION_SQL dans Supabase Studio SQL Editor'
  report.migration_sql = MIGRATION_SQL

  return NextResponse.json(report)
}

/**
 * POST — DEPRECATED depuis SEC-002. La RPC exec_sql ayant été révoquée
 * pour fermer le vecteur DDL arbitraire, cette route ne tente plus
 * l'auto-fix. Elle renvoie 410 avec le SQL à lancer manuellement.
 */
export async function POST() {
  console.warn('[security] /api/admin/diag-team-leader POST disabled (SEC-002) — exec_sql RPC revoked')

  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Forbidden — admin/super_admin requis' }, { status: 403 })

  return NextResponse.json({
    applied: false,
    deprecated: true,
    message: 'POST deprecated depuis SEC-002. Lancez le SQL ci-dessous manuellement dans Supabase Studio.',
    sql_to_run: MIGRATION_SQL,
  }, { status: 410 })
}
