import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabaseAuth = await createServerClient()
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
  if (!user || authError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const results: Record<string, string> = {}
  const supabase = getAdminClient()

  // Test 1: profiles table
  const { data: profiles, error: e1 } = await supabase.from('profiles').select('id, role, societe_id').limit(2)
  results['profiles_table'] = e1 ? `ERROR: ${e1.message}` : `OK (${(profiles || []).length} rows)`

  // Test 2: societe_id column on profiles
  if (profiles && profiles.length > 0) {
    results['profiles_societe_id'] = profiles[0].societe_id !== undefined ? 'EXISTS' : 'MISSING'
  }

  // Test 3: user_societes table
  const { data: us, error: e2 } = await supabase.from('user_societes').select('*').limit(1)
  results['user_societes_table'] = e2 ? `ERROR: ${e2.message}` : `OK (${(us || []).length} rows)`

  // Test 4: modules_utilisateur column
  const { error: e3 } = await supabase.rpc('to_jsonb', { val: 'test' }).maybeSingle()
  // Alternative: try select with the column
  const { data: mtest, error: e4 } = await supabase.from('profiles').select('modules_utilisateur').limit(1)
  results['modules_utilisateur_column'] = e4 ? `MISSING: ${e4.message}` : 'EXISTS'

  // Test 5: role constraint — try to check what roles are valid
  // We won't actually modify data, just query
  const { data: roleData } = await supabase.from('profiles').select('role').limit(100)
  const uniqueRoles = [...new Set((roleData || []).map(r => r.role))]
  results['existing_roles'] = uniqueRoles.join(', ')

  // Test 6: Try to find if client_assistant is in the constraint
  // Attempt a no-op update with client_assistant role on a non-existent ID
  const fakeId = '00000000-0000-0000-0000-000000000000'
  const { error: e5 } = await supabase.from('profiles').update({ role: 'client_assistant' }).eq('id', fakeId)
  results['client_assistant_role_allowed'] = e5 ? `BLOCKED: ${e5.message}` : 'OK (allowed)'

  // Test 7: comptes_bancaires table
  const { error: e6 } = await supabase.from('comptes_bancaires').select('id').limit(1)
  results['comptes_bancaires_table'] = e6 ? `ERROR: ${e6.message}` : 'OK'

  // Test 8: releves_bancaires table
  const { error: e7 } = await supabase.from('releves_bancaires').select('id').limit(1)
  results['releves_bancaires_table'] = e7 ? `ERROR: ${e7.message}` : 'OK'

  // Test 9: documents table
  const { error: e8 } = await supabase.from('documents').select('id').limit(1)
  results['documents_table'] = e8 ? `ERROR: ${e8.message}` : 'OK'

  // Auto-fix: Try to add missing columns/constraints
  const fixes: string[] = []

  // Fix 1: Add modules_utilisateur if missing
  if (results['modules_utilisateur_column']?.startsWith('MISSING')) {
    // SEC-002 : exec_sql désactivé. Migration manuelle requise.
    console.warn('[security] tryAutoFixRoleConstraint disabled (SEC-002)')
    fixes.push('MISSING modules_utilisateur — exec_sql RPC revoked (SEC-002). Run manually in Supabase Studio: ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS modules_utilisateur JSONB DEFAULT NULL;')
  }

  // Fix 2: Role constraint
  if (results['client_assistant_role_allowed']?.startsWith('BLOCKED')) {
    fixes.push('client_assistant role BLOCKED by CHECK constraint. Run manually: ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check; ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN (\'admin\',\'super_admin\',\'client_admin\',\'client_user\',\'client_assistant\',\'comptable\',\'comptable_dedie\',\'rh\',\'rh_manager\',\'juridique\',\'employe\',\'manager\',\'team_leader\',\'direction\',\'salarie\'));')
  }

  return NextResponse.json({ results, fixes, timestamp: new Date().toISOString() })
}
