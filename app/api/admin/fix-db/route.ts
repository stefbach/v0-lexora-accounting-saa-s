import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST() {
  const supabaseAuth = await createServerClient()
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
  if (!user || authError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getAdminClient()
  const results: string[] = []
  const errors: string[] = []

  // 1. Fix role constraint — drop and recreate with ALL roles
  try {
    const { error: e1 } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
          CHECK (role IN (
            'admin','super_admin','client_admin','client_user','client_assistant',
            'comptable','comptable_dedie','rh','rh_manager','juridique',
            'employe','manager','direction','salarie'
          ));
      `
    })
    if (e1) errors.push(`Role constraint (rpc): ${e1.message}`)
    else results.push('Role constraint updated')
  } catch (e: any) {
    errors.push(`Role constraint: ${e.message}`)
  }

  // 2. Add modules_utilisateur column
  try {
    const { error: e2 } = await supabase.rpc('exec_sql', {
      sql: `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS modules_utilisateur JSONB DEFAULT NULL;`
    })
    if (e2) errors.push(`modules_utilisateur (rpc): ${e2.message}`)
    else results.push('modules_utilisateur column added')
  } catch (e: any) {
    errors.push(`modules_utilisateur: ${e.message}`)
  }

  // 3. Add PRGF taux column
  try {
    const { error: e3 } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE public.parametres_paie_mra ADD COLUMN IF NOT EXISTS prgf_taux DECIMAL(6,4) DEFAULT 0.045;
        ALTER TABLE public.parametres_paie_mra ADD COLUMN IF NOT EXISTS salary_compensation DECIMAL(10,2) DEFAULT 635;
        ALTER TABLE public.parametres_paie_mra ADD COLUMN IF NOT EXISTS jours_feries JSONB DEFAULT '[]'::jsonb;
      `
    })
    if (e3) errors.push(`prgf_taux (rpc): ${e3.message}`)
    else results.push('PRGF + salary_compensation columns added')
  } catch (e: any) {
    errors.push(`prgf_taux: ${e.message}`)
  }

  // If rpc doesn't work (function doesn't exist), tell user to run SQL manually
  if (errors.length > 0 && errors.some(e => e.includes('exec_sql'))) {
    return NextResponse.json({
      status: 'manual_fix_required',
      results,
      errors,
      manual_sql: `
-- Exécutez ce SQL dans Supabase Dashboard → SQL Editor :

-- 1. Fix role constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'admin','super_admin','client_admin','client_user','client_assistant',
    'comptable','comptable_dedie','rh','rh_manager','juridique',
    'employe','manager','direction','salarie'
  ));

-- 2. Add modules_utilisateur column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS modules_utilisateur JSONB DEFAULT NULL;

-- 3. Add PRGF columns
ALTER TABLE public.parametres_paie_mra ADD COLUMN IF NOT EXISTS prgf_taux DECIMAL(6,4) DEFAULT 0.045;
ALTER TABLE public.parametres_paie_mra ADD COLUMN IF NOT EXISTS salary_compensation DECIMAL(10,2) DEFAULT 635;
ALTER TABLE public.parametres_paie_mra ADD COLUMN IF NOT EXISTS jours_feries JSONB DEFAULT '[]'::jsonb;

-- 4. Update trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE v_role TEXT;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'client_user');
  IF v_role NOT IN ('admin','super_admin','client_admin','client_user','client_assistant',
                     'comptable','comptable_dedie','rh','rh_manager','juridique',
                     'employe','manager','direction','salarie') THEN
    v_role := 'client_user';
  END IF;
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), v_role)
  ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, full_name=EXCLUDED.full_name, role=EXCLUDED.role;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
      `.trim()
    })
  }

  return NextResponse.json({ status: 'ok', results, errors })
}
