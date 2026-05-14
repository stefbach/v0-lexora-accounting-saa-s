/**
 * /api/admin/diag-team-leader
 *
 * GET — diagnostic ciblé pour le rôle team_leader :
 *   - Liste les CHECK constraints role sur profiles + user_societes
 *   - Indique si team_leader est autorisé sur chacune
 *   - Compte le nombre de profiles avec role='team_leader'
 *   - Vérifie l'existence de la RPC exec_sql
 *
 * POST — tente d'appliquer la migration 261 via la RPC exec_sql.
 *   Renvoie un rapport détaillé avec le SQL à lancer manuellement si
 *   la RPC n'est pas disponible.
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

  // Vérif RPC exec_sql
  try {
    const { error } = await supabase.rpc('exec_sql', { sql: 'SELECT 1;' })
    report.exec_sql_rpc_available = !error
    if (error) report.exec_sql_error = error.message
  } catch (e: any) {
    report.exec_sql_rpc_available = false
    report.exec_sql_exception = e?.message
  }

  report.fix_via_post = `POST ${`/api/admin/diag-team-leader`} pour tenter l'application automatique`
  report.fix_manual = 'Si auto-fix non possible : copier-coller MIGRATION_SQL dans Supabase Studio SQL Editor'
  report.migration_sql = MIGRATION_SQL

  return NextResponse.json(report)
}

export async function POST() {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Forbidden — admin/super_admin requis' }, { status: 403 })

  const supabase = getAdminClient()

  try {
    const { error } = await supabase.rpc('exec_sql', { sql: MIGRATION_SQL })
    if (error) {
      return NextResponse.json({
        applied: false,
        method: 'rpc:exec_sql',
        error: error.message,
        hint: "La RPC exec_sql n'existe pas (ou échoue). Lance ce SQL manuellement dans Supabase Studio :",
        sql_to_run: MIGRATION_SQL,
      }, { status: 400 })
    }
    return NextResponse.json({
      applied: true,
      method: 'rpc:exec_sql',
      message: 'Constraints profiles_role_check + user_societes_role_check mises à jour avec team_leader.',
    })
  } catch (e: any) {
    return NextResponse.json({
      applied: false,
      exception: e?.message,
      sql_to_run: MIGRATION_SQL,
    }, { status: 500 })
  }
}
