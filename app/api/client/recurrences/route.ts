/**
 * /api/client/recurrences
 *
 * GET  : preview — liste les générations dues pour une société
 * POST : exécute les générations (option dry_run pour simuler)
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import {
  findGenerationsAFaire,
  runRecurrencesQuotidiennes,
} from '@/lib/recurrences/recurrences-factures'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: Request) {
  try {
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

    const plans = await findGenerationsAFaire(supabase, { societe_id })

    // Recharge la liste des modèles (pour l'UI) avec leurs champs de config
    const { data: modeles } = await supabase
      .from('factures')
      .select('id, numero_facture, tiers, montant_ttc, devise, recurrent_frequence, recurrence_jour_du_mois, recurrence_date_debut, recurrence_date_fin, derniere_generation_date')
      .eq('societe_id', societe_id)
      .eq('recurrent', true)
      .eq('statut', 'modele')
      .order('created_at', { ascending: false })

    return NextResponse.json({ plans, modeles: modeles || [] })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })
    }
    const societe_id = String(body.societe_id || '')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    const summary = await runRecurrencesQuotidiennes(supabase, {
      societe_id,
      dry_run: body.dry_run === true,
    })

    return NextResponse.json({ ok: true, summary })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
