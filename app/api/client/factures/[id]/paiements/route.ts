/**
 * /api/client/factures/[id]/paiements
 *
 * GET  : liste les paiements d'une facture (ordre date_paiement DESC)
 * POST : enregistre un nouveau paiement manuel
 *
 * Tenant isolation : vérifie que l'utilisateur a accès à la société qui
 * possède la facture avant tout accès.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
  ResourceNotFoundError,
} from '@/lib/supabase/assert-societe-access'
import { enregistrerPaiement, type ModePaiement } from '@/lib/accounting/paiements-factures'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const MODES_VALIDES: ModePaiement[] = [
  'virement', 'cheque', 'espece', 'carte', 'prelevement', 'autre',
]

async function loadFactureAndAssertAccess(supabase: any, userId: string, factureId: string) {
  const { data: facture, error } = await supabase
    .from('factures')
    .select('id, societe_id')
    .eq('id', factureId)
    .maybeSingle()
  if (error) throw new Error(`Lookup facture: ${error.message}`)
  if (!facture) throw new ResourceNotFoundError('Facture introuvable')
  await assertSocieteAccess(supabase, userId, facture.societe_id)
  return facture
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    await loadFactureAndAssertAccess(supabase, user.id, id)

    const { data, error } = await supabase
      .from('factures_paiements')
      .select('id, facture_id, montant, montant_mur, devise, taux_change, date_paiement, mode_paiement, reference, notes, source, ecriture_id, rapproche_releve_id, created_at')
      .eq('facture_id', id)
      .order('date_paiement', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ paiements: data || [] })
  } catch (e: any) {
    if (e instanceof ResourceNotFoundError) {
      return NextResponse.json({ error: e.message }, { status: 404 })
    }
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    await loadFactureAndAssertAccess(supabase, user.id, id)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })
    }

    const montant = Number(body.montant)
    if (!Number.isFinite(montant) || montant <= 0) {
      return NextResponse.json({ error: 'montant invalide' }, { status: 400 })
    }
    const date_paiement = String(body.date_paiement || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date_paiement)) {
      return NextResponse.json({ error: 'date_paiement invalide (YYYY-MM-DD)' }, { status: 400 })
    }
    const mode_paiement = String(body.mode_paiement || 'virement') as ModePaiement
    if (!MODES_VALIDES.includes(mode_paiement)) {
      return NextResponse.json({ error: `mode_paiement invalide (${MODES_VALIDES.join(', ')})` }, { status: 400 })
    }

    const res = await enregistrerPaiement(
      supabase,
      {
        facture_id: id,
        montant,
        date_paiement,
        mode_paiement,
        reference: body.reference ? String(body.reference).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
        compte_banque: body.compte_banque ? String(body.compte_banque).trim() : null,
      },
      user.id,
    )

    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 })
    }

    // Recharge la facture pour renvoyer le nouvel état (solde, statut)
    const { data: facture } = await supabase
      .from('factures')
      .select('id, statut, solde_non_paye, montant_mur, montant_ttc, devise')
      .eq('id', id)
      .maybeSingle()

    return NextResponse.json({
      ok: true,
      paiement_id: res.paiement_id,
      ecriture_id: res.ecriture_id,
      facture,
    })
  } catch (e: any) {
    if (e instanceof ResourceNotFoundError) {
      return NextResponse.json({ error: e.message }, { status: 404 })
    }
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
