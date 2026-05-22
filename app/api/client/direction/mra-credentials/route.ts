import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { encryptSecret, maskSecret } from '@/lib/crypto/symmetric'

/**
 * GET  /api/client/direction/mra-credentials?societe_id=X
 *   → renvoie le statut (username, has_password, last_submitted_at, last_status)
 *     PAS le password en clair.
 *
 * PUT  /api/client/direction/mra-credentials?societe_id=X
 *   Body : { mra_username?, mra_password?, mra_tan?, notes?, active? }
 *   Toute valeur fournie est chiffrée et stockée. Pour effacer un secret,
 *   envoyer une chaîne vide.
 *
 * Accès : direction / client_admin / admin / super_admin uniquement.
 */
async function assertCallerIsDirection(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) }
  const societeId = req.nextUrl.searchParams.get('societe_id')
  if (!societeId) return { error: NextResponse.json({ error: 'societe_id requis' }, { status: 400 }) }
  await assertSocieteAccess(supabase, user.id, societeId)
  const { data: us } = await supabase
    .from('user_societes').select('role')
    .eq('user_id', user.id).eq('societe_id', societeId).maybeSingle()
  if (!['direction', 'client_admin', 'admin', 'super_admin'].includes(us?.role || '')) {
    return { error: NextResponse.json({ error: 'Accès réservé à la direction' }, { status: 403 }) }
  }
  return { user, societeId }
}

export async function GET(req: NextRequest) {
  const c = await assertCallerIsDirection(req)
  if ('error' in c) return c.error
  const { societeId } = c
  const admin = getAdminClient()
  const { data } = await admin
    .from('societe_mra_credentials')
    .select('mra_username, mra_password_enc, mra_tan_enc, mra_api_key_enc, notes, active, last_submitted_at, last_submit_status, last_submit_error, updated_at')
    .eq('societe_id', societeId)
    .maybeSingle()
  return NextResponse.json({
    configured: !!data,
    mra_username: data?.mra_username || null,
    mra_username_masked: maskSecret(data?.mra_username),
    has_password: !!data?.mra_password_enc,
    has_tan: !!data?.mra_tan_enc,
    has_api_key: !!data?.mra_api_key_enc,
    notes: data?.notes || null,
    active: data?.active ?? true,
    last_submitted_at: data?.last_submitted_at,
    last_submit_status: data?.last_submit_status,
    last_submit_error: data?.last_submit_error,
    updated_at: data?.updated_at,
  })
}

export async function PUT(req: NextRequest) {
  const c = await assertCallerIsDirection(req)
  if ('error' in c) return c.error
  const { user, societeId } = c
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })

  const updates: Record<string, any> = { societe_id: societeId, updated_by: user.id }
  if (typeof body.mra_username === 'string') updates.mra_username = body.mra_username.trim() || null
  if (typeof body.notes === 'string') updates.notes = body.notes
  if (typeof body.active === 'boolean') updates.active = body.active

  try {
    if (typeof body.mra_password === 'string') {
      updates.mra_password_enc = body.mra_password ? encryptSecret(body.mra_password) : null
    }
    if (typeof body.mra_tan === 'string') {
      updates.mra_tan_enc = body.mra_tan ? encryptSecret(body.mra_tan) : null
    }
    if (typeof body.mra_api_key === 'string') {
      updates.mra_api_key_enc = body.mra_api_key ? encryptSecret(body.mra_api_key) : null
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Chiffrement impossible : ${e.message}. Configure CRYPT_KEY côté serveur.` }, { status: 500 })
  }

  const admin = getAdminClient()
  const { error } = await admin
    .from('societe_mra_credentials')
    .upsert(updates, { onConflict: 'societe_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
