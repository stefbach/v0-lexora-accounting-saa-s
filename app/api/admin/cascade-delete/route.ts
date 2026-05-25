/**
 * POST /api/admin/cascade-delete
 *
 * Hard cascade delete pour factures, transactions bancaires, ou documents.
 * Admin uniquement (vérification serveur via assertAdminForSociete).
 *
 * Body :
 *   {
 *     type: 'facture' | 'banque' | 'document',
 *     ids: string[],                 // 1..500 ids
 *     societe_id: string,
 *     confirm: 'DELETE_HARD'         // garde-fou anti-fausse-manœuvre
 *   }
 *
 * Renvoie : CascadeDeleteReport (cf. lib/admin/cascade-delete.ts)
 */

import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  runCascadeDelete,
  assertAdminForSociete,
  type CascadeDeleteType,
} from '@/lib/admin/cascade-delete'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const VALID_TYPES: CascadeDeleteType[] = ['facture', 'banque', 'document']

export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const type = body?.type as CascadeDeleteType | undefined
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === 'string') : []
    const societe_id = typeof body?.societe_id === 'string' ? body.societe_id : ''
    const confirm = body?.confirm

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: `type invalide, attendu: ${VALID_TYPES.join('|')}` }, { status: 400 })
    }
    if (ids.length === 0) {
      return NextResponse.json({ error: 'ids[] requis (tableau non vide)' }, { status: 400 })
    }
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }
    if (confirm !== 'DELETE_HARD') {
      return NextResponse.json({ error: 'Confirmation manquante : confirm="DELETE_HARD"' }, { status: 400 })
    }

    const admin = getAdminClient()

    let role: string
    try {
      const r = await assertAdminForSociete(admin, user.id, societe_id)
      role = r.role
    } catch (e: any) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Forbidden' }, { status: 403 })
    }

    const ipHeader = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip')
    const report = await runCascadeDelete(admin, { type, ids, societe_id }, {
      user_id: user.id,
      user_email: user.email ?? null,
      user_role: role,
      ip_address: ipHeader ? ipHeader.split(',')[0].trim() : null,
      user_agent: request.headers.get('user-agent'),
    })

    return NextResponse.json({ ok: true, ...report })
  } catch (e: any) {
    console.error('[admin/cascade-delete]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
