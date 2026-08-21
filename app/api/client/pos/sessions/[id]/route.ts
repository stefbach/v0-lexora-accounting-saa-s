/**
 * /api/client/pos/sessions/[id]
 *
 * GET   : détail d'une session + récapitulatif (tickets, ventilation par moyen)
 * PATCH : fermeture de la session via la RPC fermer_session_caisse
 *         (migration 486) + écriture d'écart de caisse (POS-SES-<id>).
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { buildRecapSession } from '@/lib/pos/session'
import { createEcrituresForEcartCaisse } from '@/lib/pos/ecritures'

export const dynamic = 'force-dynamic'

async function loadRecap(supabase: any, sessionId: string) {
  const { data: ventes } = await supabase
    .from('ventes_pos')
    .select('id, montant_ht, montant_tva, montant_ttc, statut')
    .eq('session_caisse_id', sessionId)
  const venteIds = (ventes || []).filter((v: any) => v.statut === 'validee').map((v: any) => v.id)
  let paiements: any[] = []
  if (venteIds.length > 0) {
    const { data } = await supabase
      .from('paiements_pos')
      .select('moyen_paiement, montant, vente_pos_id')
      .in('vente_pos_id', venteIds)
    paiements = data || []
  }
  return buildRecapSession(ventes || [], paiements)
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    const { data: session, error } = await supabase
      .from('sessions_caisse')
      .select('*, depots(nom, type)')
      .eq('id', id)
      .eq('societe_id', societe_id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!session) return NextResponse.json({ error: 'Session introuvable' }, { status: 404 })

    const recap = await loadRecap(supabase, session.id)
    return NextResponse.json({ session, recap })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => null)
    const societe_id = String(body?.societe_id || '')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }
    const fondCompte = Number(body?.fond_fermeture_compte)
    if (!Number.isFinite(fondCompte) || fondCompte < 0) {
      return NextResponse.json(
        { error: 'fond_fermeture_compte doit être positif ou nul' },
        { status: 400 },
      )
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    const { data: recap, error: rpcError } = await supabase.rpc('fermer_session_caisse', {
      p_societe_id: societe_id,
      p_session_id: id,
      p_fond_compte: fondCompte,
      p_notes: body?.notes ? String(body.notes).slice(0, 1000) : null,
    })
    if (rpcError) {
      const msg = String(rpcError.message || '')
      if (msg.includes('SESSION_INTROUVABLE')) return NextResponse.json({ error: msg }, { status: 404 })
      if (msg.includes('SESSION_FERMEE')) return NextResponse.json({ error: msg }, { status: 409 })
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // Écriture d'écart de caisse (D 6588 / C 530 ou D 530 / C 758) — R1, idempotente.
    const ecritures = await createEcrituresForEcartCaisse(supabase, {
      id: id,
      societe_id,
      ecart_caisse: Number(recap?.ecart_caisse) || 0,
      fermee_at: new Date().toISOString(),
    })

    return NextResponse.json({
      recap,
      ecritures: { ok: ecritures.ok, nb_entries: ecritures.nb_entries, error: ecritures.error },
    })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
