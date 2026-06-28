/**
 * POST /api/comptable/gbc/audit/status
 * Body: { societe_id, exercice, kind: 'pbc'|'finding', code, statut }
 *
 * Persiste le statut manuel d'une pièce PBC ou d'un constat d'audit
 * (tables mig 464). Upsert idempotent par (societe_id, exercice, code).
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const PBC_STATUTS = ['todo', 'fourni', 'na']
const FINDING_STATUTS = ['open', 'resolved', 'accepted', 'false_positive']

export async function POST(request: Request) {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return apiError('unauthorized', 401)

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400 }) }

  const { societe_id, exercice, kind, code, statut } = body || {}
  if (!societe_id || !exercice || !code || !statut || (kind !== 'pbc' && kind !== 'finding')) {
    return NextResponse.json({ error: 'Champs requis : societe_id, exercice, kind (pbc|finding), code, statut' }, { status: 400 })
  }
  const allowed = kind === 'pbc' ? PBC_STATUTS : FINDING_STATUTS
  if (!allowed.includes(statut)) {
    return NextResponse.json({ error: `statut invalide (attendu : ${allowed.join(', ')})` }, { status: 400 })
  }

  const admin = getAdminClient()
  try {
    await assertSocieteAccess(admin, user.id, societe_id)
  } catch (err) {
    if (err instanceof SocieteAccessError) return apiError('access_denied', 403)
    throw err
  }

  const table = kind === 'pbc' ? 'audit_pbc_status' : 'audit_findings_status'
  const keyCol = kind === 'pbc' ? 'pbc_code' : 'finding_key'
  const row = {
    societe_id, exercice, [keyCol]: code, statut,
    updated_by: user.id, updated_at: new Date().toISOString(),
  }
  const { error } = await admin.from(table).upsert(row, { onConflict: `societe_id,exercice,${keyCol}` })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
