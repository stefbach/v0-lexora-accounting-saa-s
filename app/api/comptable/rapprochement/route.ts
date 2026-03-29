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

async function safeQuery(supabase: any, table: string, query: any) {
  try {
    return await query
  } catch {
    return { data: null, error: { message: `Table ${table} not found` } }
  }
}

// GET — Rapprochements + transactions + factures + écritures
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
      .from('rapprochements_bancaires').select('*')
      .eq('societe_id', societe_id).order('periode_debut', { ascending: false })

    // 2. Bank transactions from releves
    const { data: releves } = await supabase
      .from('releves_bancaires')
      .select('id, compte_bancaire_id, periode, date_debut, date_fin, transactions_json, solde_ouverture, solde_cloture')
      .eq('societe_id', societe_id).order('date_fin', { ascending: false })

    const { data: comptes } = await supabase
      .from('comptes_bancaires').select('id, banque, devise, numero_compte').eq('societe_id', societe_id)
    const compteMap: Record<string, any> = {}
    ;(comptes || []).forEach(c => { compteMap[c.id] = c })

    const bankTransactions: any[] = []
    ;(releves || []).forEach((r: any) => {
      const compte = compteMap[r.compte_bancaire_id] || {}
      ;(r.transactions_json || []).forEach((tx: any, idx: number) => {
        bankTransactions.push({
          id: `${r.id}-${idx}`, releve_id: r.id,
          date: tx.date || '', libelle: tx.libelle || '',
          debit: Number(tx.debit) || 0, credit: Number(tx.credit) || 0,
          tiers_detecte: tx.tiers_detecte || tx.tiers || null,
          compte_comptable: tx.compte_comptable || null,
          statut: tx.statut || 'non_identifie',
          banque: compte.banque || '—', devise: compte.devise || 'MUR',
          lettre: tx.lettre || null, facture_id: tx.facture_id || null,
          ecriture_id: tx.ecriture_id || null,
        })
      })
    })

    // 3. Factures (table may not exist)
    let factures: any[] = []
    const { data: facturesData, error: facturesErr } = await supabase
      .from('factures').select('*')
      .eq('societe_id', societe_id)
      .in('statut', ['en_attente', 'retard', 'partiel'])
      .order('date_facture', { ascending: false })
    if (!facturesErr) factures = facturesData || []

    // 4. Écritures comptables v1 (pour lettrage)
    const { data: dossiers } = await supabase
      .from('dossiers').select('id').eq('societe_id', societe_id)
    const dossierIds = (dossiers || []).map(d => d.id)

    let ecritures: any[] = []
    if (dossierIds.length > 0) {
      const { data } = await supabase
        .from('ecritures_comptables')
        .select('id, compte, libelle, debit, credit, date_ecriture, journal, lettre, piece_justificative')
        .in('dossier_id', dossierIds)
        .order('date_ecriture', { ascending: false })
      ecritures = data || []
    }

    return NextResponse.json({
      rapprochements: rapprochements || [],
      bankTransactions, factures, ecritures,
      releves: releves || [],
    })
  } catch (e: unknown) {
    console.error('[rapprochement GET]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST — Actions
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

      if (!releves || releves.length === 0) {
        return NextResponse.json({ matched: 0, message: 'Aucun relevé bancaire' })
      }

      // Get écritures comptables (v1) for matching
      const { data: dossiers } = await supabase
        .from('dossiers').select('id').eq('societe_id', societe_id)
      const dossierIds = (dossiers || []).map((d: any) => d.id)

      let ecritures: any[] = []
      if (dossierIds.length > 0) {
        const { data } = await supabase
          .from('ecritures_comptables')
          .select('id, compte, libelle, debit, credit, date_ecriture, lettre')
          .in('dossier_id', dossierIds)
          .is('lettre', null)
        ecritures = data || []
      }

      // Get factures (may not exist)
      let factures: any[] = []
      const { data: facturesData, error: factErr } = await supabase
        .from('factures')
        .select('id, numero_facture, tiers, montant_ttc, type_facture, devise')
        .eq('societe_id', societe_id)
        .in('statut', ['en_attente', 'retard', 'partiel'])
      if (!factErr) factures = facturesData || []

      let matchCount = 0
      const matches: any[] = []

      for (const releve of releves) {
        const txs: any[] = releve.transactions_json || []
        const updatedTxs = [...txs]
        let changed = false

        for (let i = 0; i < updatedTxs.length; i++) {
          const tx = updatedTxs[i]
          if (tx.lettre || tx.facture_id || tx.ecriture_id) continue

          const txDebit = Number(tx.debit) || 0
          const txCredit = Number(tx.credit) || 0
          const txAmount = txCredit > 0 ? txCredit : txDebit
          if (txAmount === 0) continue

          let matched = false

          // Strategy 1: Match with factures (if available)
          if (factures.length > 0) {
            const isCredit = txCredit > 0
            const matchedFacture = factures.find(f => {
              const typeMatch = isCredit ? f.type_facture === 'client' : f.type_facture === 'fournisseur'
              if (!typeMatch) return false
              const fAmount = Number(f.montant_ttc) || 0
              return Math.abs(txAmount - fAmount) <= Math.max(fAmount * 0.01, 1)
            })
            if (matchedFacture) {
              updatedTxs[i] = { ...tx, facture_id: matchedFacture.id, lettre: `R${String(matchCount + 1).padStart(3, '0')}`, statut: 'rapproche' }
              await supabase.from('factures').update({ statut: 'paye' }).eq('id', matchedFacture.id)
              matches.push({ type: 'facture', transaction: tx.libelle, facture: matchedFacture.numero_facture, montant: txAmount })
              factures = factures.filter(f => f.id !== matchedFacture.id)
              matched = true; changed = true; matchCount++
            }
          }

          // Strategy 2: Match with écritures comptables (debit ↔ credit on bank accounts)
          if (!matched && ecritures.length > 0) {
            const matchedEcriture = ecritures.find(e => {
              // Match debit transaction → credit écriture, and vice versa
              const eDebit = Number(e.debit) || 0
              const eCredit = Number(e.credit) || 0
              const eAmount = txCredit > 0 ? eDebit : eCredit
              if (eAmount === 0) return false
              // Match by amount (1% tolerance)
              if (Math.abs(txAmount - eAmount) > Math.max(eAmount * 0.01, 1)) return false
              // Prefer bank accounts (51x)
              if (e.compte?.startsWith('51')) return true
              // Also match on tiers accounts (41x, 40x)
              const txTiers = (tx.tiers_detecte || tx.tiers || tx.libelle || '').toLowerCase()
              const eTiers = (e.libelle || '').toLowerCase()
              return txTiers.includes(eTiers.substring(0, 10)) || eTiers.includes(txTiers.substring(0, 10))
            })
            if (matchedEcriture) {
              const code = `L${String(matchCount + 1).padStart(3, '0')}`
              updatedTxs[i] = { ...tx, ecriture_id: matchedEcriture.id, lettre: code, statut: 'rapproche' }
              // Also letter the écriture
              await supabase.from('ecritures_comptables')
                .update({ lettre: code, date_lettrage: new Date().toISOString().split('T')[0], lettrage_auto: true })
                .eq('id', matchedEcriture.id)
              matches.push({ type: 'ecriture', transaction: tx.libelle, ecriture: matchedEcriture.libelle, montant: txAmount })
              ecritures = ecritures.filter(e => e.id !== matchedEcriture.id)
              matched = true; changed = true; matchCount++
            }
          }
        }

        if (changed) {
          await supabase.from('releves_bancaires')
            .update({ transactions_json: updatedTxs })
            .eq('id', releve.id)
        }
      }

      return NextResponse.json({ matched: matchCount, matches })
    }

    // === LETTRAGE MANUEL ===
    if (action === 'lettrer_manuel') {
      const { transaction_id, releve_id, facture_id, ecriture_id, societe_id } = body
      if (!releve_id) return NextResponse.json({ error: 'releve_id requis' }, { status: 400 })

      const { data: releve } = await supabase
        .from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
      if (!releve) return NextResponse.json({ error: 'Relevé non trouvé' }, { status: 404 })

      const txIdx = parseInt(transaction_id.split('-').pop() || '0')
      const txs = [...(releve.transactions_json || [])]
      if (txIdx >= txs.length) return NextResponse.json({ error: 'Transaction non trouvée' }, { status: 404 })

      const lettreCode = `M${String(Date.now()).slice(-4)}`

      txs[txIdx] = { ...txs[txIdx], facture_id: facture_id || null, ecriture_id: ecriture_id || null, lettre: lettreCode, statut: 'rapproche' }
      await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)

      if (facture_id) {
        await supabase.from('factures').update({ statut: 'paye' }).eq('id', facture_id)
      }
      if (ecriture_id) {
        await supabase.from('ecritures_comptables')
          .update({ lettre: lettreCode, date_lettrage: new Date().toISOString().split('T')[0] })
          .eq('id', ecriture_id)
      }

      return NextResponse.json({ success: true, lettre: lettreCode })
    }

    // === DELETTRER ===
    if (action === 'delettrer') {
      const { transaction_id, releve_id, facture_id, ecriture_id } = body
      if (!releve_id) return NextResponse.json({ error: 'releve_id requis' }, { status: 400 })

      const { data: releve } = await supabase
        .from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
      if (!releve) return NextResponse.json({ error: 'Relevé non trouvé' }, { status: 404 })

      const txIdx = parseInt(transaction_id.split('-').pop() || '0')
      const txs = [...(releve.transactions_json || [])]
      if (txIdx < txs.length) {
        txs[txIdx] = { ...txs[txIdx], facture_id: null, ecriture_id: null, lettre: null, statut: 'a_verifier' }
        await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)
      }

      if (facture_id) await supabase.from('factures').update({ statut: 'en_attente' }).eq('id', facture_id)
      if (ecriture_id) await supabase.from('ecritures_comptables').update({ lettre: null, date_lettrage: null }).eq('id', ecriture_id)

      return NextResponse.json({ success: true })
    }

    // === CREER RAPPROCHEMENT ===
    if (action === 'creer') {
      const { societe_id } = body
      const { data: dossiers } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id)
      const dossierIds = (dossiers || []).map((d: any) => d.id)

      let solde_comptable = 0
      if (dossierIds.length > 0) {
        const { data: ecritures } = await supabase
          .from('ecritures_comptables').select('debit, credit')
          .in('dossier_id', dossierIds).like('compte', '51%')
          .gte('date_ecriture', body.periode_debut).lte('date_ecriture', body.periode_fin)
        solde_comptable = (ecritures || []).reduce((s: number, e: any) => s + Number(e.debit || 0) - Number(e.credit || 0), 0)
      }

      if (solde_comptable === 0) {
        const { data: rel } = await supabase
          .from('releves_bancaires').select('solde_cloture')
          .eq('societe_id', societe_id)
          .lte('date_debut', body.periode_fin).gte('date_fin', body.periode_debut)
          .order('date_fin', { ascending: false }).limit(1).maybeSingle()
        if (rel) solde_comptable = Number(rel.solde_cloture) || 0
      }

      const { data, error } = await supabase.from('rapprochements_bancaires').insert({
        societe_id, compte_bancaire: body.compte_bancaire || '512',
        banque: body.banque, periode_debut: body.periode_debut,
        periode_fin: body.periode_fin, solde_releve: body.solde_releve,
        solde_comptable, created_by: user.id,
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
    console.error('[rapprochement POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
