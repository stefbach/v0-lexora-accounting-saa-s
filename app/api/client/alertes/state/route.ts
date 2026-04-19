import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Persiste l'état par utilisateur des alertes rule-based.
 * Les alertes elles-mêmes sont calculées dynamiquement par
 * /api/client/alertes — seul leur état (lue/archivée/acknowledged) est stocké.
 *
 * Table : public.alertes_user_state (migration 156).
 * Clé stable : lib/alertes/key.ts (computeAlerteKey).
 */

type AlerteAction =
  | 'mark_read'
  | 'mark_unread'
  | 'archive'
  | 'unarchive'
  | 'acknowledge'
  | 'unacknowledge'

interface StateRow {
  alerte_key: string
  lue_at: string | null
  archivee_at: string | null
  acknowledged_at: string | null
}

interface PostBody {
  alerte_key?: unknown
  alerte_type?: unknown
  societe_id?: unknown
  action?: unknown
}

// ---------------------------------------------------------------------------
// POST — enregistre une action sur une alerte (UPSERT par user_id + alerte_key)
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 })

    const body = (await request.json()) as PostBody
    const alerteKey = typeof body.alerte_key === 'string' ? body.alerte_key.trim() : ''
    const alerteType = typeof body.alerte_type === 'string' ? body.alerte_type : null
    const societeId = typeof body.societe_id === 'string' && body.societe_id.length > 0
      ? body.societe_id
      : null
    const action = typeof body.action === 'string' ? (body.action as AlerteAction) : null

    if (!alerteKey) {
      return NextResponse.json({ error: 'alerte_key requis' }, { status: 400 })
    }
    const allowedActions: AlerteAction[] = [
      'mark_read', 'mark_unread', 'archive', 'unarchive', 'acknowledge', 'unacknowledge',
    ]
    if (!action || !allowedActions.includes(action)) {
      return NextResponse.json({ error: 'action invalide' }, { status: 400 })
    }

    const admin = getAdminClient()
    const now = new Date().toISOString()

    // Fetch existing row to merge — évite d'écraser avec NULL les autres champs.
    const { data: existing } = await admin
      .from('alertes_user_state')
      .select('alerte_key, lue_at, archivee_at, acknowledged_at')
      .eq('user_id', user.id)
      .eq('alerte_key', alerteKey)
      .maybeSingle()

    const current: StateRow = existing
      ? {
          alerte_key: alerteKey,
          lue_at: existing.lue_at ?? null,
          archivee_at: existing.archivee_at ?? null,
          acknowledged_at: existing.acknowledged_at ?? null,
        }
      : { alerte_key: alerteKey, lue_at: null, archivee_at: null, acknowledged_at: null }

    switch (action) {
      case 'mark_read':
        current.lue_at = current.lue_at ?? now
        break
      case 'mark_unread':
        current.lue_at = null
        break
      case 'archive':
        current.archivee_at = current.archivee_at ?? now
        // Archiver implique marquer lu (UX classique)
        current.lue_at = current.lue_at ?? now
        break
      case 'unarchive':
        current.archivee_at = null
        break
      case 'acknowledge':
        current.acknowledged_at = current.acknowledged_at ?? now
        current.lue_at = current.lue_at ?? now
        break
      case 'unacknowledge':
        current.acknowledged_at = null
        break
    }

    const { error } = await admin
      .from('alertes_user_state')
      .upsert({
        user_id: user.id,
        societe_id: societeId,
        alerte_key: alerteKey,
        alerte_type: alerteType,
        lue_at: current.lue_at,
        archivee_at: current.archivee_at,
        acknowledged_at: current.acknowledged_at,
        updated_at: now,
      }, { onConflict: 'user_id,alerte_key' })
    if (error) throw error

    return NextResponse.json({
      ok: true,
      state: {
        alerte_key: alerteKey,
        lue_at: current.lue_at,
        archivee_at: current.archivee_at,
        acknowledged_at: current.acknowledged_at,
      },
    })
  } catch (e: unknown) {
    console.error('Alertes state POST error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}

// ---------------------------------------------------------------------------
// GET — retourne les états enregistrés pour l'utilisateur (optionnel: par société)
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societeId = searchParams.get('societe_id')

    const admin = getAdminClient()
    let query = admin
      .from('alertes_user_state')
      .select('alerte_key, alerte_type, lue_at, archivee_at, acknowledged_at')
      .eq('user_id', user.id)
    if (societeId) query = query.eq('societe_id', societeId)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ ok: true, states: data ?? [] })
  } catch (e: unknown) {
    console.error('Alertes state GET error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}
