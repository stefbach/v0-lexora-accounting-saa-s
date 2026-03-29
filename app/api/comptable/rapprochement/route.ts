import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET — All rapprochements + transactions non rapprochées + factures
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()

    // 1. Rapprochements existants
    const { data: rapprochements } = await supabase
      .from('rapprochements_bancaires')
      .select('*')
      .eq('societe_id', societe_id)
      .order('periode_debut', { ascending: false })

    // 2. Transactions bancaires (depuis releves_bancaires)
    const { data: releves } = await supabase
      .from('releves_bancaires')
      .select('id, compte_bancaire_id, periode, date_debut, date_fin, transactions_json, solde_ouverture, solde_cloture')
      .eq('societe_id', societe_id)
      .order('date_fin', { ascending: false })

    // Flatten transactions with releve info
    const bankTransactions: any[] = []
    const { data: comptes } = await supabase
      .from('comptes_bancaires').select('id, banque, devise, numero_compte').eq('societe_id', societe_id)
    const compteMap: Record<string, any> = {}
    ;(comptes || []).forEach(c => { compteMap[c.id] = c })

    ;(releves || []).forEach((r: any) => {
      const compte = compteMap[r.compte_bancaire_id] || {}
      ;(r.transactions_json || []).forEach((tx: any, idx: number) => {
        bankTransactions.push({
          id: `${r.id}-${idx}`,
          releve_id: r.id,
          date: tx.date || '',
          libelle: tx.libelle || '',
          debit: Number(tx.debit) || 0,
          credit: Number(tx.credit) || 0,
          tiers_detecte: tx.tiers_detecte || tx.tiers || null,
          compte_comptable: tx.compte_comptable || null,
          statut: tx.statut || 'non_identifie',
          banque: compte.banque || '—',
          devise: compte.devise || 'MUR',
          // Lettrage info
          lettre: tx.lettre || null,
          facture_id: tx.facture_id || null,
        })
      })
    })

    // 3. Factures non lettrées
    const { data: factures } = await supabase
      .from('factures')
      .select('*')
      .eq('societe_id', societe_id)
      .in('statut', ['en_attente', 'retard', 'partiel'])
      .order('date_facture', { ascending: false })

    // 4. Écritures comptables comptes 51x (banque) non lettrées
    const { data: dossiers } = await supabase
      .from('dossiers').select('id').eq('societe_id', societe_id)
    const dossierIds = (dossiers || []).map(d => d.id)

    let ecrituresBanque: any[] = []
    if (dossierIds.length > 0) {
      const { data } = await supabase
        .from('ecritures_comptables')
        .select('*')
        .in('dossier_id', dossierIds)
        .like('compte', '51%')
        .is('lettre', null)
        .order('date_ecriture', { ascending: false })
      ecrituresBanque = data || []
    }

    return NextResponse.json({
      rapprochements: rapprochements || [],
      bankTransactions,
      factures: factures || [],
      ecrituresBanque,
      releves: releves || [],
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST — Actions de rapprochement
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    // === AUTO-RAPPROCHEMENT ===
    if (action === 'auto_rapprocher') {
      const { societe_id } = body
      if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

      // Get bank transactions
      const { data: releves } = await supabase
        .from('releves_bancaires')
        .select('id, compte_bancaire_id, transactions_json')
        .eq('societe_id', societe_id)

      // Get unpaid invoices
      const { data: factures } = await supabase
        .from('factures')
        .select('id, numero_facture, tiers, montant_ttc, montant_mur, type_facture, devise, date_facture')
        .eq('societe_id', societe_id)
        .in('statut', ['en_attente', 'retard', 'partiel'])

      if (!factures || factures.length === 0 || !releves || releves.length === 0) {
        return NextResponse.json({ matched: 0, message: 'Aucune facture ou transaction à rapprocher' })
      }

      let matchCount = 0
      const matches: any[] = []

      for (const releve of releves) {
        const txs: any[] = releve.transactions_json || []
        const updatedTxs = [...txs]

        for (let i = 0; i < updatedTxs.length; i++) {
          const tx = updatedTxs[i]
          if (tx.facture_id) continue // déjà rapproché

          const txAmount = Number(tx.credit) || Number(tx.debit) || 0
          if (txAmount === 0) continue

          // Chercher une facture correspondante
          const isCredit = (Number(tx.credit) || 0) > 0
          const matchedFacture = factures.find(f => {
            // Facture client → crédit bancaire (encaissement)
            // Facture fournisseur → débit bancaire (décaissement)
            const typeMatch = isCredit
              ? f.type_facture === 'client'
              : f.type_facture === 'fournisseur'
            if (!typeMatch) return false

            // Match par montant (tolérance 1%)
            const fAmount = Number(f.montant_ttc) || 0
            const tolerance = fAmount * 0.01
            const amountMatch = Math.abs(txAmount - fAmount) <= Math.max(tolerance, 1)
            if (!amountMatch) return false

            // Match par tiers (si disponible)
            const txTiers = (tx.tiers_detecte || tx.tiers || '').toLowerCase()
            const fTiers = (f.tiers || '').toLowerCase()
            if (txTiers && fTiers) {
              const tiersMatch = txTiers.includes(fTiers) || fTiers.includes(txTiers)
              if (tiersMatch) return true
            }

            // Match par référence facture dans le libellé
            const txLibelle = (tx.libelle || '').toLowerCase()
            const fNum = (f.numero_facture || '').toLowerCase()
            if (fNum && txLibelle.includes(fNum)) return true

            // Match par montant seul si très proche (tolérance 0.1%)
            if (Math.abs(txAmount - fAmount) <= 0.01) return true

            return false
          })

          if (matchedFacture) {
            updatedTxs[i] = {
              ...tx,
              facture_id: matchedFacture.id,
              lettre: `R${String(matchCount + 1).padStart(3, '0')}`,
              statut: 'rapproche',
            }

            // Marquer la facture comme payée
            await supabase.from('factures')
              .update({ statut: 'paye' })
              .eq('id', matchedFacture.id)

            matches.push({
              transaction: tx.libelle,
              facture: matchedFacture.numero_facture,
              montant: txAmount,
              tiers: matchedFacture.tiers,
            })

            // Retirer la facture des candidats
            const idx = factures.findIndex(f => f.id === matchedFacture.id)
            if (idx !== -1) factures.splice(idx, 1)

            matchCount++
          }
        }

        // Sauvegarder les transactions mises à jour
        if (matchCount > 0) {
          await supabase.from('releves_bancaires')
            .update({ transactions_json: updatedTxs })
            .eq('id', releve.id)
        }
      }

      return NextResponse.json({ matched: matchCount, matches })
    }

    // === LETTRAGE MANUEL ===
    if (action === 'lettrer_manuel') {
      const { transaction_id, releve_id, facture_id, societe_id } = body
      if (!releve_id || !facture_id) {
        return NextResponse.json({ error: 'releve_id et facture_id requis' }, { status: 400 })
      }

      // Get the releve
      const { data: releve } = await supabase
        .from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
      if (!releve) return NextResponse.json({ error: 'Relevé non trouvé' }, { status: 404 })

      // Parse transaction index from transaction_id (format: releve_id-idx)
      const txIdx = parseInt(transaction_id.split('-').pop() || '0')
      const txs = [...(releve.transactions_json || [])]
      if (txIdx >= txs.length) return NextResponse.json({ error: 'Transaction non trouvée' }, { status: 404 })

      // Generate lettrage code
      const { count } = await supabase
        .from('releves_bancaires')
        .select('id', { count: 'exact', head: true })
        .eq('societe_id', societe_id)
      const lettreCode = `M${String((count || 0) + 1).padStart(3, '0')}`

      // Update transaction
      txs[txIdx] = { ...txs[txIdx], facture_id, lettre: lettreCode, statut: 'rapproche' }
      await supabase.from('releves_bancaires')
        .update({ transactions_json: txs })
        .eq('id', releve_id)

      // Update facture status
      await supabase.from('factures')
        .update({ statut: 'paye' })
        .eq('id', facture_id)

      return NextResponse.json({ success: true, lettre: lettreCode })
    }

    // === DELETTRER ===
    if (action === 'delettrer') {
      const { transaction_id, releve_id, facture_id } = body
      if (!releve_id) return NextResponse.json({ error: 'releve_id requis' }, { status: 400 })

      const { data: releve } = await supabase
        .from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
      if (!releve) return NextResponse.json({ error: 'Relevé non trouvé' }, { status: 404 })

      const txIdx = parseInt(transaction_id.split('-').pop() || '0')
      const txs = [...(releve.transactions_json || [])]
      if (txIdx < txs.length) {
        txs[txIdx] = { ...txs[txIdx], facture_id: null, lettre: null, statut: 'a_verifier' }
        await supabase.from('releves_bancaires')
          .update({ transactions_json: txs })
          .eq('id', releve_id)
      }

      if (facture_id) {
        await supabase.from('factures')
          .update({ statut: 'en_attente' })
          .eq('id', facture_id)
      }

      return NextResponse.json({ success: true })
    }

    // === CREER RAPPROCHEMENT ===
    if (action === 'creer') {
      const { societe_id } = body
      const { data: dossiers } = await supabase
        .from('dossiers').select('id').eq('societe_id', societe_id)
      const dossierIds = (dossiers || []).map((d: any) => d.id)

      let solde_comptable = 0
      const { data: ecrituresV2 } = await supabase
        .from('ecritures_comptables_v2')
        .select('debit_mur, credit_mur')
        .eq('societe_id', societe_id)
        .like('numero_compte', '51%')
        .gte('date_ecriture', body.periode_debut)
        .lte('date_ecriture', body.periode_fin)

      if (ecrituresV2 && ecrituresV2.length > 0) {
        solde_comptable = ecrituresV2.reduce((s: number, e: any) => s + Number(e.debit_mur || 0) - Number(e.credit_mur || 0), 0)
      } else if (dossierIds.length > 0) {
        const { data: ecrituresV1 } = await supabase
          .from('ecritures_comptables')
          .select('debit, credit')
          .in('dossier_id', dossierIds)
          .like('compte', '51%')
          .gte('date_ecriture', body.periode_debut)
          .lte('date_ecriture', body.periode_fin)
        solde_comptable = (ecrituresV1 || []).reduce((s: number, e: any) => s + Number(e.debit || 0) - Number(e.credit || 0), 0)
      }

      if (solde_comptable === 0) {
        const { data: releveBanque } = await supabase
          .from('releves_bancaires').select('solde_cloture')
          .eq('societe_id', societe_id)
          .lte('date_debut', body.periode_fin).gte('date_fin', body.periode_debut)
          .order('date_fin', { ascending: false }).limit(1).maybeSingle()
        if (releveBanque) solde_comptable = Number(releveBanque.solde_cloture) || 0
      }

      const ecart = Number(body.solde_releve) - solde_comptable
      const { data, error } = await supabase.from('rapprochements_bancaires').insert({
        societe_id, compte_bancaire: body.compte_bancaire || '512',
        banque: body.banque, periode_debut: body.periode_debut,
        periode_fin: body.periode_fin, solde_releve: body.solde_releve,
        solde_comptable, ecart, created_by: user.id,
      }).select().single()
      if (error) throw error
      return NextResponse.json({ rapprochement: data, solde_comptable })
    }

    // === VALIDER ===
    if (action === 'valider') {
      const { data, error } = await supabase
        .from('rapprochements_bancaires')
        .update({ statut: 'valide', valide_par: user.id, valide_le: new Date().toISOString() })
        .eq('id', body.rapprochement_id).select().single()
      if (error) throw error
      return NextResponse.json({ rapprochement: data })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
