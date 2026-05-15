import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * GET /api/google-accounts/list
 *
 * Liste les comptes Google de l'utilisateur authentifié (RLS user-scoped).
 */
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_oauth_accounts')
    .select('id, account_email, label, scopes, is_default_for_calendar, active, last_synced_at, last_error, created_at')
    .eq('provider', 'google')
    .order('is_default_for_calendar', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ accounts: data || [] })
}
