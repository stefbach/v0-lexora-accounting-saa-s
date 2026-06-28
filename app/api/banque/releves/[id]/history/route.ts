import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { userHasAccessToSociete } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/banque/releves/[id]/history
 *
 * Returns the full version chain for a bank statement (releves_bancaires).
 * The `id` path param may point to the current active version OR any
 * superseded version — the endpoint resolves the (compte_bancaire_id,
 * date_debut, date_fin) triplet and returns every row matching it.
 *
 * Response: Array<{
 *   id, version, created_at, superseded_at, superseded_by_id,
 *   uploaded_by, upload_source, is_active
 * }> ordered by version DESC.
 *
 * Errors:
 *   401 — non authentifié
 *   403 — utilisateur sans accès à la société propriétaire du relevé
 *   404 — id de relevé introuvable
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    const supabaseAuth = await createServerClient()
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()
    if (!user) {
      return apiError('unauthorized', 401)
    }

    const supabase = getAdminClient()

    // 1. Locate the referenced relevé to extract the (compte, période) triplet
    //    + société for the access check.
    const { data: ref, error: refErr } = await supabase
      .from('releves_bancaires')
      .select('id, societe_id, compte_bancaire_id, date_debut, date_fin')
      .eq('id', id)
      .maybeSingle()

    if (refErr) {
      console.error('[releves/history] lookup error:', refErr)
      return NextResponse.json({ error: refErr.message }, { status: 500 })
    }
    if (!ref) {
      return NextResponse.json({ error: 'Relevé introuvable' }, { status: 404 })
    }

    // 2. Multi-tenant access check
    const hasAccess = await userHasAccessToSociete(user.id, ref.societe_id)
    if (!hasAccess) {
      return apiError('access_denied_company', 403)
    }

    // 3. Fetch the complete version chain
    const { data: chain, error: chainErr } = await supabase
      .from('releves_bancaires')
      .select(
        'id, version, created_at, superseded_at, superseded_by_id, uploaded_by, upload_source'
      )
      .eq('compte_bancaire_id', ref.compte_bancaire_id)
      .eq('date_debut', ref.date_debut)
      .eq('date_fin', ref.date_fin)
      .order('version', { ascending: false })

    if (chainErr) {
      console.error('[releves/history] chain error:', chainErr)
      return NextResponse.json({ error: chainErr.message }, { status: 500 })
    }

    const versions = (chain || []).map((row: any) => ({
      id: row.id,
      version: row.version ?? 1,
      created_at: row.created_at,
      superseded_at: row.superseded_at,
      superseded_by_id: row.superseded_by_id,
      uploaded_by: row.uploaded_by,
      upload_source: row.upload_source,
      is_active: row.superseded_by_id === null,
    }))

    return NextResponse.json({ versions })
  } catch (e: any) {
    console.error('[releves/history] error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    )
  }
}
