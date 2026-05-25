import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/fix-db — DEPRECATED depuis SEC-002 (2026-05).
 *
 * Cette route invoquait jadis la RPC `exec_sql` pour appliquer la migration
 * 261 (rôle team_leader) et d'autres correctifs DDL à la volée. La RPC ayant
 * été révoquée (cf. supabase/migrations/414_revoke_exec_sql_security_hardening.sql)
 * pour fermer le vecteur de DDL arbitraire (SQLi DDL via SECURITY DEFINER),
 * cette route ne fait plus de DDL.
 *
 * Pour appliquer une nouvelle migration : ajouter un fichier dans
 * `supabase/migrations/` puis exécuter via Supabase CLI ou Studio.
 *
 * Voir docs/audit-partials/wave2-F-secu-critique.md SEC-002.
 */
export async function POST() {
  console.warn('[security] /api/admin/fix-db POST disabled (SEC-002) — exec_sql RPC revoked')

  const supabaseAuth = await createServerClient()
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
  if (!user || authError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({
    status: 'deprecated',
    message: 'Cette route est dépréciée depuis SEC-002. Toute modification de schéma doit passer par supabase/migrations/. Voir docs/audit-partials/wave2-F-secu-critique.md',
    migrations_to_apply: [
      '261_team_leader_role.sql (constraints role)',
      '414_revoke_exec_sql_security_hardening.sql',
    ],
    manual_sql: `
-- Exécutez ce SQL dans Supabase Dashboard → SQL Editor si non encore appliqué :

-- 1. Fix role constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'admin','super_admin','client_admin','client_user','client_assistant',
    'comptable','comptable_dedie','rh','rh_manager','juridique',
    'employe','manager','team_leader','direction','salarie'
  ));

-- 2. Add modules_utilisateur column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS modules_utilisateur JSONB DEFAULT NULL;

-- 3. Add PRGF columns
ALTER TABLE public.parametres_paie_mra ADD COLUMN IF NOT EXISTS prgf_taux DECIMAL(6,4) DEFAULT 0.045;
ALTER TABLE public.parametres_paie_mra ADD COLUMN IF NOT EXISTS salary_compensation DECIMAL(10,2) DEFAULT 635;
ALTER TABLE public.parametres_paie_mra ADD COLUMN IF NOT EXISTS jours_feries JSONB DEFAULT '[]'::jsonb;
    `.trim(),
  }, { status: 410 })
}
