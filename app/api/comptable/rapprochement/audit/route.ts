import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET /api/comptable/rapprochement/audit?societe_id=...&limit=100&action=...
export async function GET(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
    const actionFilter = searchParams.get('action')
    const releve_id = searchParams.get('releve_id')
    const tx_idx_raw = searchParams.get('transaction_idx')

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    let query = supabase
      .from('rapprochement_audit_log')
      .select('*')
      .eq('societe_id', societe_id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (actionFilter) query = query.eq('action', actionFilter)
    if (releve_id) query = query.eq('releve_id', releve_id)
    if (tx_idx_raw !== null && tx_idx_raw !== undefined) {
      const tx_idx = parseInt(tx_idx_raw)
      if (!isNaN(tx_idx)) query = query.eq('transaction_idx', tx_idx)
    }

    const { data, error } = await query
    if (error) {
      // Table may not yet exist if migration 126 not applied — return empty list
      // rather than crash the UI.
      if ((error.message || '').toLowerCase().includes('does not exist')) {
        return NextResponse.json({ entries: [], migrated: false, message: 'Table rapprochement_audit_log absente — appliquer la migration 126' })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ entries: data || [], migrated: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
