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
  } catch (e: any) {
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
      mode_paiement = 'banque', paye_par = null,
      // TDS Maurice (mig 226) — pour factures fournisseurs uniquement
      tds_categorie = null, tds_taux_pct = null, tds_montant = null,
    } = body

    if (!societe_id || !date_facture) {
      return NextResponse.json({ error: 'societe_id et date_facture requis' }, { status: 400 })
    }

    // Multi-tenant guard — sinon tout user authentifié peut créer une
    // facture sur n'importe quelle société (audit P0).
    {
      const { assertSocieteAccess, SocieteAccessError } = await import('@/lib/supabase/assert-societe-access')
      const { createClient: createAdminClient } = await import('@supabase/supabase-js')
      const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } })
      try {
        await assertSocieteAccess(admin, user.id, societe_id as string)
      } catch (e) {
        if (e instanceof SocieteAccessError) return NextResponse.json({ error: e.message }, { status: 403 })
        throw e
      }
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

    // TDS calc auto si catégorie fournie sans montant explicite (Maurice ITA)
    let finalTdsTaux = tds_taux_pct
    let finalTdsMontant = tds_montant
    if (type_facture === 'fournisseur' && tds_categorie && (!finalTdsTaux || !finalTdsMontant)) {
      try {
        const { data: cat } = await supabase
          .from('tds_taux_par_categorie')
          .select('taux_pct')
          .eq('code', tds_categorie)
          .maybeSingle()
        if (cat?.taux_pct) {
          finalTdsTaux = finalTdsTaux ?? Number(cat.taux_pct)
          if (!finalTdsMontant) {
            // TDS s'applique sur le HT en MUR (Section 111A Maurice)
            const htMur = devise === 'MUR' ? montant_ht : montant_ht * (taux_change || 1)
            finalTdsMontant = Math.round(htMur * Number(cat.taux_pct) / 100 * 100) / 100
          }
        }
      } catch (e) {
        // Catégorie inconnue, on continue sans TDS
      }
    }

    const insertData: Record<string, unknown> = {
      societe_id, dossier_id, numero_facture, type_facture,
      tiers, description, date_facture, date_echeance,
      devise, taux_change, montant_ht, montant_tva,
      montant_ttc: ttc, taux_tva, montant_mur: mur,
      statut, document_id, notes,
      mode_paiement, paye_par,
    }
    if (tds_categorie) insertData.tds_categorie = tds_categorie
    if (finalTdsTaux != null) insertData.tds_taux_pct = finalTdsTaux
    if (finalTdsMontant != null) insertData.tds_montant = finalTdsMontant

    const { data, error } = await supabase
      .from('factures')
      .insert(insertData)
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
  } catch (e: any) {
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

    // Multi-tenant guard: l'utilisateur doit avoir accès à la société source
    // de la facture, ET à la société cible si réassignation.
    const { assertSocieteAccess, SocieteAccessError } = await import('@/lib/supabase/assert-societe-access')
    try {
      await assertSocieteAccess(admin, user.id, existing.societe_id as string)
      if (updates.societe_id && updates.societe_id !== existing.societe_id) {
        await assertSocieteAccess(admin, user.id, updates.societe_id as string)
      }
    } catch (e) {
      if (e instanceof SocieteAccessError) return NextResponse.json({ error: e.message }, { status: 403 })
      throw e
    }

    // Garde-fou conversion devise sur PATCH (cf. POST). Lit la valeur effective
    // après merge des updates pour bloquer EUR + taux=1.
    const finalDevise = updates.devise ?? existing.devise
    const finalTaux = updates.taux_change ?? existing.taux_change
    if (finalDevise && finalDevise !== 'MUR') {
      const t = Number(finalTaux) || 0
      if (t <= 1.0001) {
        return NextResponse.json({
          error: `Taux de change invalide pour ${finalDevise} (${t}). Saisissez le taux réel ${finalDevise} → MUR.`
        }, { status: 400 })
      }
    }

    updates.updated_at = new Date().toISOString()
    const { data, error } = await admin.from('factures').update(updates).eq('id', id).select().single()
    if (error) throw error

    // Régénération des écritures comptables si la facture sort de brouillon
    // OU si un champ comptable change (montants, devise, taux, type, date).
    // Sans ça, une facture créée en brouillon puis PATCHée en en_attente
    // restait sans écritures (bug audit P0 #2 — visible sur OCC : 48 factures
    // clients en_attente sans aucune ligne 411). Idempotent : la fonction
    // supprime les écritures FAC-<id> existantes avant ré-INSERT.
    {
      const wasBrouillon = existing.statut === 'brouillon'
      const finalStatut = updates.statut ?? existing.statut
      const isFinalised = finalStatut !== 'brouillon' && finalStatut !== 'devis' && finalStatut !== 'annule'
      const accountingFieldChanged =
        updates.montant_ht !== undefined ||
        updates.montant_tva !== undefined ||
        updates.montant_ttc !== undefined ||
        updates.montant_mur !== undefined ||
        updates.devise !== undefined ||
        updates.taux_change !== undefined ||
        updates.type_facture !== undefined ||
        updates.date_facture !== undefined ||
        updates.tiers !== undefined

      const shouldRegen = isFinalised && (wasBrouillon || accountingFieldChanged)

      if (shouldRegen) {
        const final = data || { ...existing, ...updates }
        try {
          const r = await createEcrituresForFacture(admin, {
            id: final.id,
            societe_id: final.societe_id,
            numero_facture: final.numero_facture || '',
            tiers: final.tiers || '',
            date_facture: final.date_facture,
            montant_ht: Number(final.montant_ht) || 0,
            montant_tva: Number(final.montant_tva) || 0,
            montant_ttc: Number(final.montant_ttc) || 0,
            type_facture: (final.type_facture === 'fournisseur' ? 'fournisseur' : 'client'),
            devise: final.devise || 'MUR',
            taux_change: Number(final.taux_change) || 1,
            montant_mur: Number(final.montant_mur) || undefined,
          })
          if (!r.ok) {
            console.warn('[comptable/factures PATCH] Régen écritures échouée:', r.error)
          }
        } catch (e: any) {
          console.warn('[comptable/factures PATCH] Régen écritures exception:', e?.message || e)
        }
      }
    }

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
  } catch (e: any) {
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

    // Multi-tenant guard sur DELETE — sinon n'importe quel comptable peut
    // supprimer des factures cross-tenant + cascade leurs écritures.
    const { assertSocieteAccess, SocieteAccessError } = await import('@/lib/supabase/assert-societe-access')
    try {
      await assertSocieteAccess(admin, user.id, existing.societe_id as string)
    } catch (e) {
      if (e instanceof SocieteAccessError) return NextResponse.json({ error: e.message }, { status: 403 })
      throw e
    }

    // Cascade: delete linked document
    try {
      const { data: linkedDocs } = await admin.from('documents').select('id').contains('n8n_result', { facture_id: id })
      for (const doc of linkedDocs || []) await admin.from('documents').delete().eq('id', doc.id)
    } catch { /* noop */ }

    // Cascade: delete accounting entries
    // Cascade: delete all journal entries linked to this facture (by ref_folio)
    try {
      await admin.from('ecritures_comptables_v2').delete()
        .eq('societe_id', existing.societe_id)
        .eq('ref_folio', `FAC-${id}`)
    } catch { /* noop */ }
    // Also delete payment entries for this facture
    try {
      const { data: f } = await admin.from('factures').select('rapproche_releve_id, rapproche_transaction_idx').eq('id', id).maybeSingle()
      if (f?.rapproche_releve_id && f?.rapproche_transaction_idx != null) {
        await admin.from('ecritures_comptables_v2').delete()
          .eq('ref_folio', `BANK-${f.rapproche_releve_id}-${f.rapproche_transaction_idx}`)
      }
    } catch { /* noop */ }

    const { error } = await admin.from('factures').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
