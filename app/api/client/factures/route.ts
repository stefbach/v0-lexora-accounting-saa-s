import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { createEcrituresForFacture as createEcrituresShared } from '@/lib/accounting/ecritures-factures'
import {
  assertSocieteAccess,
  getAccessibleSocieteIds,
  mapSocieteAccessError,
  ResourceNotFoundError,
} from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')

    // Tenant isolation — verify user has access to the requested societe_id
    // (unified helper, includes user_societes + dossiers + created_by branches)
    if (societe_id) {
      await assertSocieteAccess(supabase, user.id, societe_id)
    }
    const statut = searchParams.get('statut')
    const client = searchParams.get('client')
    const date_debut = searchParams.get('date_debut')
    const date_fin = searchParams.get('date_fin')
    const limit = parseInt(searchParams.get('limit') || '200')

    let query = supabase
      .from('factures')
      .select('*')
      .eq('type_facture', 'client')
      .order('date_facture', { ascending: false })
      .limit(limit)

    if (societe_id) {
      query = query.eq('societe_id', societe_id)
    } else {
      // Pas de filtre explicite → on restreint aux sociétés accessibles du caller
      // (admin/super_admin voient tout)
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      const role = profile?.role ?? ''
      if (!['admin', 'super_admin'].includes(role)) {
        const accessible = await getAccessibleSocieteIds(supabase, user.id)
        if (accessible.length === 0) {
          return NextResponse.json({ factures: [], totaux: { total_ht: 0, total_tva: 0, total_ttc: 0, total_mur: 0, nb_factures: 0, nb_en_attente: 0, nb_retard: 0 } })
        }
        query = query.in('societe_id', accessible)
      }
    }
    if (statut && statut !== 'all') query = query.eq('statut', statut)
    if (client) query = query.ilike('tiers', `%${client}%`)
    if (date_debut) query = query.gte('date_facture', date_debut)
    if (date_fin) query = query.lte('date_facture', date_fin)

    const { data, error } = await query
    if (error) throw error

    const totaux = {
      total_ht: data?.reduce((s, f) => s + (f.montant_ht || 0), 0) || 0,
      total_tva: data?.reduce((s, f) => s + (f.montant_tva || 0), 0) || 0,
      total_ttc: data?.reduce((s, f) => s + (f.montant_ttc || 0), 0) || 0,
      total_mur: data?.reduce((s, f) => s + (f.montant_mur || f.montant_ttc || 0), 0) || 0,
      nb_factures: data?.length || 0,
      nb_en_attente: data?.filter(f => f.statut === 'en_attente').length || 0,
      nb_retard: data?.filter(f => f.statut === 'retard').length || 0,
    }

    return NextResponse.json({ factures: data || [], totaux })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const body = await request.json()
    const {
      societe_id, numero_facture, tiers, description,
      date_facture, date_echeance, devise = 'MUR', taux_change = 1,
      montant_ht = 0, montant_tva = 0, montant_ttc,
      taux_tva = 0, statut: statutIn = 'brouillon', notes, notes_internes,
      lignes = [], conditions_paiement = 30, termes, template = 'standard',
      client_offshore = false, remise_pct = 0, remise_montant = 0,
      recurrent = false, recurrent_frequence, logo_url,
      mode_paiement = 'banque', paye_par, contact_id,
      type_document = 'facture', facture_reference_id,
    } = body

    if (!societe_id || !date_facture) {
      return NextResponse.json({ error: 'societe_id et date_facture requis' }, { status: 400 })
    }

    await assertSocieteAccess(supabase, user.id, societe_id)

    // For devis: force statut='devis' (not en_attente) — no GL entries
    const statut: string = type_document === 'devis'
      ? (statutIn === 'converti' ? 'converti' : 'devis')
      : statutIn

    // Generate sequential invoice number if not provided
    let finalNumero = numero_facture
    if (!finalNumero) {
      const prefix = type_document === 'avoir' ? 'AV-' : type_document === 'note_debit' ? 'ND-' : type_document === 'devis' ? 'DEV-' : 'INV-'
      const filterDoc = type_document || 'facture'

      let query = supabase
        .from('factures')
        .select('numero_facture')
        .eq('societe_id', societe_id)
        .eq('type_facture', 'client')
        .not('numero_facture', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)

      // Filter by type_document if it's an avoir or note_debit
      if (filterDoc !== 'facture') {
        query = query.eq('type_document', filterDoc)
      }

      const { data: lastInvoice } = await query.single()

      let nextNum = 1
      if (lastInvoice?.numero_facture) {
        const match = lastInvoice.numero_facture.match(/(\d+)$/)
        if (match) nextNum = parseInt(match[1]) + 1
      }
      finalNumero = `${prefix}${String(nextNum).padStart(3, '0')}`
    }

    const ttc = montant_ttc ?? (montant_ht + montant_tva)
    const mur = devise === 'MUR' ? ttc : ttc * (taux_change || 1)

    const insertData: Record<string, unknown> = {
      societe_id, type_facture: 'client',
      numero_facture: finalNumero, tiers, description,
      date_facture, date_echeance, devise, taux_change,
      montant_ht, montant_tva, montant_ttc: ttc,
      taux_tva, montant_mur: mur, statut, notes,
      notes_internes, lignes, conditions_paiement, termes,
      template, client_offshore, remise_pct, remise_montant,
      recurrent, recurrent_frequence, logo_url,
      mode_paiement, paye_par, contact_id,
      type_document,
    }
    if (facture_reference_id) {
      insertData.facture_reference_id = facture_reference_id
    }

    const { data, error } = await supabase
      .from('factures')
      .insert(insertData)
      .select()
      .single()

    if (error) throw error

    // Auto-create a "documents" record so the invoice appears in "Documents numérisés"
    // (links the invoice to the documents folder for consistency)
    try {
      const { data: dossier } = await supabase
        .from('dossiers')
        .select('id')
        .eq('societe_id', societe_id)
        .limit(1)
        .maybeSingle()

      if (dossier?.id) {
        // Check if a document already exists for this invoice
        const { data: existingDoc } = await supabase
          .from('documents')
          .select('id')
          .eq('dossier_id', dossier.id)
          .like('nom_fichier', `%${finalNumero}%`)
          .maybeSingle()

        if (!existingDoc) {
          // Get société name for proper societe_detectee
          const { data: socData } = await supabase
            .from('societes')
            .select('nom')
            .eq('id', societe_id)
            .maybeSingle()

          await supabase.from('documents').insert({
            dossier_id: dossier.id,
            uploaded_by: user.id,
            nom_fichier: `${finalNumero} - ${tiers || 'Client'}.pdf`,
            type_fichier: 'pdf',
            type_document: type_document === 'avoir' ? 'avoir_client' : 'facture_client',
            statut: 'traite',
            storage_path: null,
            societe_detectee: socData?.nom || null,
            n8n_result: {
              source: 'facture_client_api',
              facture_id: data.id,
              numero_facture: finalNumero,
              extraction: {
                numero: finalNumero,
                tiers,
                date_facture,
                montant_ht,
                montant_tva,
                montant_ttc: ttc,
              },
            },
          })
          console.log(`[factures] Document record created for invoice ${finalNumero} (société: ${socData?.nom})`)
        }
      }
    } catch (docErr: any) {
      console.warn('[factures] Failed to create document record:', docErr.message)
      // Don't fail the invoice creation if document creation fails
    }

    // Auto-create ecritures comptables when invoice is finalized
    // Skip for devis — quotes don't hit the GL until converted to facture
    if (statut === 'en_attente' && type_document !== 'devis' && data) {
      await createEcrituresShared(supabase, {
        id: data.id,
        societe_id,
        numero_facture: finalNumero,
        tiers: tiers || '',
        date_facture,
        montant_ht: Number(montant_ht) || 0,
        montant_tva: Number(montant_tva) || 0,
        montant_ttc: Number(ttc) || 0,
        type_facture: 'client',
        devise,
        taux_change,
        montant_mur: mur,
      })
    }

    return NextResponse.json({ facture: data }, { status: 201 })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    // Fetch existing invoice for status transition check + access verification
    const { data: existing } = await supabase
      .from('factures')
      .select('*')
      .eq('id', id)
      .single()
    if (!existing) throw new ResourceNotFoundError('Facture introuvable')

    // Tenant isolation: le caller doit avoir accès à la société de la facture
    await assertSocieteAccess(supabase, user.id, existing.societe_id)

    if (existing.statut !== 'brouillon' && existing.statut !== 'en_attente') {
      // Sur une facture finalisée, seuls certains champs métier (non comptables) peuvent changer.
      // societe_id RETIRÉ de allowedUpdates : le changer sans déplacer les écritures liées
      // crée des écritures orphelines et pollue la balance de la société d'origine.
      const allowedUpdates = ['statut', 'mode_paiement', 'paye_par', 'notes']
      const keys = Object.keys(updates)
      const hasDisallowed = keys.some(k => !allowedUpdates.includes(k))
      if (hasDisallowed) {
        return NextResponse.json({ error: 'Seules les factures brouillon peuvent etre modifiees (sauf statut/mode_paiement/notes)' }, { status: 400 })
      }
    }

    // Déplacement de facture entre sociétés : autorisé UNIQUEMENT si la facture
    // n'a pas encore d'écritures comptables liées. Sinon on laisserait des écritures
    // orphelines sur la société d'origine → déséquilibre + contamination visuelle
    // d'une société par les factures d'une autre.
    if (updates.societe_id && updates.societe_id !== existing.societe_id) {
      // Tenant isolation sur la société CIBLE aussi
      await assertSocieteAccess(supabase, user.id, updates.societe_id)

      const { count: ecrituresLiees } = await supabase
        .from('ecritures_comptables_v2')
        .select('id', { count: 'exact', head: true })
        .eq('societe_id', existing.societe_id)
        .like('ref_folio', `FAC-${id}%`)
      if ((ecrituresLiees || 0) > 0) {
        return NextResponse.json({
          error: `Impossible de déplacer cette facture : ${ecrituresLiees} écriture(s) comptable(s) déjà enregistrée(s). Annulez puis recréez la facture sous la bonne société.`,
        }, { status: 409 })
      }
    }

    // If societe_id is changed (et la vérification ci-dessus a passé),
    // also update the linked document record
    if (updates.societe_id && updates.societe_id !== existing.societe_id) {
      try {
        // Find old and new dossier
        const { data: newDossier } = await supabase
          .from('dossiers').select('id').eq('societe_id', updates.societe_id).limit(1).maybeSingle()
        const { data: newSoc } = await supabase
          .from('societes').select('nom').eq('id', updates.societe_id).maybeSingle()
        if (newDossier?.id) {
          // Find the linked document by n8n_result.facture_id
          const { data: linkedDocs } = await supabase
            .from('documents')
            .select('id, n8n_result')
            .contains('n8n_result', { facture_id: id })
          for (const doc of linkedDocs || []) {
            await supabase.from('documents').update({
              dossier_id: newDossier.id,
              societe_detectee: newSoc?.nom || null,
            }).eq('id', doc.id)
          }
          console.log(`[factures PATCH] Reassigned facture ${id} and ${linkedDocs?.length || 0} linked document(s) to societe ${updates.societe_id}`)
        }
      } catch (e: any) {
        console.warn('[factures PATCH] Failed to update linked document societe:', e.message)
      }
    }

    // Recalculate MUR if needed
    if (updates.montant_ttc !== undefined && updates.devise) {
      updates.montant_mur = updates.devise === 'MUR'
        ? updates.montant_ttc
        : updates.montant_ttc * (updates.taux_change || 1)
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('factures')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // Auto-create ecritures when transitioning from brouillon to en_attente
    // Skip for devis — quotes don't hit the GL until converted
    if (
      existing &&
      existing.statut === 'brouillon' &&
      updates.statut === 'en_attente' &&
      data &&
      data.type_document !== 'devis'
    ) {
      await createEcrituresShared(supabase, {
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

    return NextResponse.json({ facture: data })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const force = searchParams.get('force') === '1'
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const { data: existing } = await supabase
      .from('factures')
      .select('statut, societe_id, numero_facture')
      .eq('id', id)
      .single()

    if (!existing) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })

    // Tenant isolation avant toute suppression
    await assertSocieteAccess(supabase, user.id, existing.societe_id)

    // Non-drafts require force=1 (confirmed delete with cascade)
    if (existing.statut !== 'brouillon' && !force) {
      return NextResponse.json({ error: `Facture en statut "${existing.statut}". Utilisez force=1 pour supprimer avec les ecritures associees.` }, { status: 400 })
    }

    // Cascade: delete linked documents (n8n_result contains facture_id)
    try {
      const { data: linkedDocs } = await supabase
        .from('documents').select('id').contains('n8n_result', { facture_id: id })
      for (const doc of linkedDocs || []) {
        await supabase.from('documents').delete().eq('id', doc.id)
      }
      if (linkedDocs && linkedDocs.length > 0) {
        console.log(`[factures DELETE] Removed ${linkedDocs.length} linked document(s) for facture ${id}`)
      }
    } catch (e: any) {
      console.warn('[factures DELETE] Failed to remove linked documents:', e.message)
    }

    // Cascade: delete accounting entries
    try {
      const libellePrefix = `Facture ${existing.numero_facture || ''}`
      const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', existing.societe_id).limit(1).maybeSingle()
      if (dossier?.id) {
        await supabase.from('ecritures_comptables')
          .delete().eq('dossier_id', dossier.id).like('libelle', `${libellePrefix}%`)
      }
    } catch (e: any) {
      console.warn('[factures DELETE] Failed to remove ecritures:', e.message)
    }

    const { error } = await supabase
      .from('factures')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
