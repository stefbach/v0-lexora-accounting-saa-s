import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Retourne le nombre d'alertes actives non lues et non archivées pour l'utilisateur.
 *
 * Utile pour le badge de la sidebar / header.
 *
 * Implémentation : on appelle /api/client/alertes en interne pour récupérer la
 * liste courante, puis on retire celles déjà lues/archivées côté DB.
 */
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societeId = searchParams.get('societe_id')

    // Appelle le générateur d'alertes via fetch interne — passe les cookies
    // pour propager la session utilisateur.
    const origin = new URL(request.url).origin
    const qs = societeId ? `?societe_id=${encodeURIComponent(societeId)}` : ''
    const cookieHeader = request.headers.get('cookie') ?? ''
    const alertesRes = await fetch(`${origin}/api/client/alertes${qs}`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
    if (!alertesRes.ok) {
      return NextResponse.json({ ok: true, count: 0 })
    }
    const alertesJson = (await alertesRes.json()) as { alertes?: Array<{ alerte_key?: string }> }
    const activeKeys = (alertesJson.alertes ?? [])
      .map(a => a.alerte_key)
      .filter((k): k is string => typeof k === 'string' && k.length > 0)

    if (activeKeys.length === 0) {
      return NextResponse.json({ ok: true, count: 0 })
    }

    // Charge les états persistés correspondants.
    const admin = getAdminClient()
    const { data: states, error } = await admin
      .from('alertes_user_state')
      .select('alerte_key, lue_at, archivee_at')
      .eq('user_id', user.id)
      .in('alerte_key', activeKeys)
    if (error) throw error

    const readOrArchived = new Set(
      (states ?? [])
        .filter(s => s.lue_at || s.archivee_at)
        .map(s => s.alerte_key),
    )
    const count = activeKeys.filter(k => !readOrArchived.has(k)).length

    return NextResponse.json({ ok: true, count })
  } catch (e: unknown) {
    console.error('Alertes unread-count error:', e)
    // Graceful : ne jamais casser le badge de la sidebar.
    return NextResponse.json({ ok: true, count: 0 })
  }
}
