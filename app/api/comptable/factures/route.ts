import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { createEcrituresForFacture } from '@/lib/accounting/ecritures-factures'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const type_facture = searchParams.get('type') // client | fournisseur
    const statut = searchParams.get('statut')
    const date_debut = searchParams.get('date_debut')
    const date_fin = searchParams.get('date_fin')
    const limit = parseInt(searchParams.get('limit') || '1000')

    let query = supabase
      .from('factures')
      .select('*')
      .order('date_facture', { ascending: false })
      .limit(limit)

    if (societe_id) query = query.eq('societe_id', societe_id)
    if (type_facture) query = query.eq('type_facture', type_facture)
    if (statut) query = query.eq('statut', statut)
    if (date_debut) query = query.gte('date_facture', date_debut)
    if (date_fin) query = query.lte('date_facture', date_fin)

    const { data, error } = await query
    if (error) throw error

    // Calcul totaux
    const totaux = {
      total_ht: data?.reduce((s, f) => s + (f.montant_ht || 0), 0) || 0,
      total_tva: data?.reduce((s, f) => s + (f.montant_tva || 0), 0) || 0,
      total_ttc: data?.reduce((s, f) => s + (f.montant_ttc || 0), 0) || 0,
      total_mur: data?.reduce((s, f) => s + (f.montant_mur || f.montant_ttc || 0), 0) || 0,
      nb_factures: data?.length || 0,
      nb_en_attente: data?.filter(f => f.statut === 'en_attente').length || 0,
      nb_retard: data?.filter(f => f.statut === 'retard').length || 0,
    }

    return NextResponse.json({ factures: data, totaux })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()

    // Handle update_mode_paiement action
    if (body.action === 'update_mode_paiement') {
      const { facture_id, mode_paiement, paye_par } = body
      if (!facture_id) return NextResponse.json({ error: 'facture_id requis' }, { status: 400 })

      const { data, error } = await supabase
        .from('factures')
        .update({
          mode_paiement, paye_par,
          statut: 'paye',
          updated_at: new Date().toISOString(),
        })
        .eq('id', facture_id)
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ facture: data })
    }

    // Default: create new facture
    const {
      societe_id, dossier_id, numero_facture, type_facture = 'client',
      tiers, description, date_facture, date_echeance,
      devise = 'MUR', taux_change = 1,
      montant_ht = 0, montant_tva = 0, montant_ttc, taux_tva = 0,
      statut = 'en_attente', document_id, notes,
      mode_paiement = 'banque', paye_par = null
    } = body

    if (!societe_id || !date_facture) {
      return NextResponse.json({ error: 'societe_id et date_facture requis' }, { status: 400 })
    }

    // Garde-fou conversion devise (cf. /api/client/factures route)
    if (devise && devise !== 'MUR') {
      const t = Number(taux_change) || 0
      if (t <= 1.0001) {
        return NextResponse.json({
          error: `Taux de change invalide pour ${devise} (${t}). Saisissez le taux réel ${devise} → MUR.`
        }, { status: 400 })
      }
    }

    const ttc = montant_ttc ?? (montant_ht + montant_tva)
    const mur = devise === 'MUR' ? ttc : ttc * (taux_change || 1)

    // Anti-doublon : même tiers + même montant TTC ±1 + même date ±1 jour
    if (societe_id && tiers && ttc > 0 && date_facture) {
      const admin = getAdminClient()
      const dObj = new Date(date_facture)
      const dMinus1 = new Date(dObj.getTime() - 86400000).toISOString().slice(0, 10)
      const dPlus1 = new Date(dObj.getTime() + 86400000).toISOString().slice(0, 10)
      const { data: dup } = await admin
        .from('factures')
        .select('id, numero_facture, date_facture')
        .eq('societe_id', societe_id)
        .ilike('tiers', tiers)
        .gte('date_facture', dMinus1)
        .lte('date_facture', dPlus1)
        .gte('montant_ttc', ttc - 1)
        .lte('montant_ttc', ttc + 1)
        .limit(1)
      if (dup && dup.length > 0) {
        return NextResponse.json({
          error: `Doublon : facture ${dup[0].numero_facture || ''} du ${dup[0].date_facture} existe déjà pour ${tiers} au même montant`,
          duplicate: dup[0],
        }, { status: 409 })
      }
    }

    const { data, error } = await supabase
      .from('factures')
      .insert({
        societe_id, dossier_id, numero_facture, type_facture,
        tiers, description, date_facture, date_echeance,
        devise, taux_change, montant_ht, montant_tva,
        montant_ttc: ttc, taux_tva, montant_mur: mur,
        statut, document_id, notes,
        mode_paiement, paye_par
      })
      .select()
      .single()

    if (error) throw error

    // Auto-generate journal entries (401/607/4456 for supplier, 411/706/4457 for client)
    if (data && statut !== 'brouillon') {
      const admin = getAdminClient()
      await createEcrituresForFacture(admin, {
        id: data.id,
        societe_id: data.societe_id,
        numero_facture: data.numero_facture || '',
        tiers: data.tiers || '',
        date_facture: data.date_facture,
        montant_ht: Number(data.montant_ht) || 0,
        montant_tva: Number(data.montant_tva) || 0,
        montant_ttc: Number(data.montant_ttc) || 0,
        type_facture: data.type_facture || 'client',
        devise: data.devise || 'MUR',
        taux_change: Number(data.taux_change) || 1,
        montant_mur: Number(data.montant_mur) || undefined,
      })
    }

    return NextResponse.json({ facture: data }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// PATCH — update a facture (including societe_id reassignment)
export async function PATCH(request: Request) {
  try {
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } })
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const body = await request.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const { data: existing } = await admin.from('factures').select('*').eq('id', id).single()
    if (!existing) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })

    updates.updated_at = new Date().toISOString()
    const { data, error } = await admin.from('factures').update(updates).eq('id', id).select().single()
    if (error) throw error

    // If societe_id changed, update linked document record too
    if (updates.societe_id && updates.societe_id !== existing.societe_id) {
      try {
        const { data: newDossier } = await admin.from('dossiers').select('id').eq('societe_id', updates.societe_id).limit(1).maybeSingle()
        const { data: newSoc } = await admin.from('societes').select('nom').eq('id', updates.societe_id).maybeSingle()
        if (newDossier?.id) {
          const { data: linkedDocs } = await admin.from('documents').select('id').contains('n8n_result', { facture_id: id })
          for (const doc of linkedDocs || []) {
            await admin.from('documents').update({ dossier_id: newDossier.id, societe_detectee: newSoc?.nom || null }).eq('id', doc.id)
          }
        }
      } catch (e: any) {
        console.warn('[comptable/factures PATCH] Linked document update failed:', e.message)
      }
    }

    return NextResponse.json({ facture: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// DELETE — delete a facture (cascade to linked document + ecritures)
export async function DELETE(request: Request) {
  try {
    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } })
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const { data: existing } = await admin.from('factures').select('*').eq('id', id).single()
    if (!existing) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })

    // Cascade: delete linked document
    try {
      const { data: linkedDocs } = await admin.from('documents').select('id').contains('n8n_result', { facture_id: id })
      for (const doc of linkedDocs || []) await admin.from('documents').delete().eq('id', doc.id)
    } catch {}

    // Cascade: delete accounting entries
    // Cascade: delete all journal entries linked to this facture (by ref_folio)
    try {
      await admin.from('ecritures_comptables_v2').delete()
        .eq('societe_id', existing.societe_id)
        .eq('ref_folio', `FAC-${id}`)
    } catch {}
    // Also delete payment entries for this facture
    try {
      const { data: f } = await admin.from('factures').select('rapproche_releve_id, rapproche_transaction_idx').eq('id', id).maybeSingle()
      if (f?.rapproche_releve_id && f?.rapproche_transaction_idx != null) {
        await admin.from('ecritures_comptables_v2').delete()
          .eq('ref_folio', `BANK-${f.rapproche_releve_id}-${f.rapproche_transaction_idx}`)
      }
    } catch {}

    const { error } = await admin.from('factures').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
