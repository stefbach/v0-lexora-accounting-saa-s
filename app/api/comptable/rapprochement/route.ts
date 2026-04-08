import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getTauxChange } from '@/lib/taux-change'

export const dynamic = 'force-dynamic'

// Normalize tiers name for matching
function normalizeTiers(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\s+(ltd|limited|sarl|sas|sa|co|company|cie|inc)\.?\s*$/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

// Word overlap score between two strings
function wordOverlap(a: string, b: string): number {
  const wordsA = normalizeTiers(a).split(/\s+/).filter(w => w.length > 2)
  const wordsB = normalizeTiers(b).split(/\s+/).filter(w => w.length > 2)
  if (wordsA.length === 0 || wordsB.length === 0) return 0
  const overlap = wordsA.filter(w => wordsB.some(wb => wb.includes(w) || w.includes(wb))).length
  return overlap / Math.max(wordsA.length, wordsB.length)
}

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
      comptesBancaires: comptes || [],
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
      const { societe_id, date_debut, date_fin } = body
      if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

      // Get bank transactions
      const { data: releves } = await supabase
        .from('releves_bancaires')
        .select('id, compte_bancaire_id, transactions_json')
        .eq('societe_id', societe_id)

      if (!releves || releves.length === 0) {
        return NextResponse.json({ matched: 0, total: 0, message: 'Aucun relevé bancaire' })
      }

      // Société names for internal transfer detection
      const { data: socData } = await supabase.from('societes').select('nom, aliases').eq('id', societe_id)
      const societeNames = (socData || []).flatMap(s => [s.nom, ...(s.aliases || [])]).map(n => (n || '').toLowerCase()).filter(Boolean)

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

      // Get factures
      let factures: any[] = []
      const { data: facturesData, error: factErr } = await supabase
        .from('factures')
        .select('id, numero_facture, tiers, montant_ttc, montant_mur, type_facture, devise, taux_change')
        .eq('societe_id', societe_id)
        .in('statut', ['en_attente', 'retard', 'partiel'])
      if (!factErr) factures = facturesData || []

      // FX rates
      const rates = await getTauxChange()
      const toMUR = (amount: number, devise: string): number => {
        if (!devise || devise === 'MUR') return amount
        return amount * (rates[devise.toUpperCase()] || 1)
      }

      // Bank account currencies
      const { data: comptesBancaires } = await supabase
        .from('comptes_bancaires').select('id, devise').eq('societe_id', societe_id)
      const compteDeviseMap: Record<string, string> = {}
      ;(comptesBancaires || []).forEach((c: any) => { compteDeviseMap[c.id] = c.devise || 'MUR' })

      // All bulletins for salary matching
      const { data: allBulletins } = await supabase
        .from('bulletins_paie').select('id, employe_id, salaire_net, periode, statut')
        .eq('societe_id', societe_id).eq('statut', 'valide')
      const empIds = [...new Set((allBulletins || []).map(b => b.employe_id).filter(Boolean))]
      let empMap: Record<string, any> = {}
      if (empIds.length > 0) {
        const { data: emps } = await supabase.from('employes').select('id, nom, prenom').in('id', empIds)
        for (const e of emps || []) empMap[e.id] = e
      }

      // Compte courant associés
      const { data: ccComptes } = await supabase
        .from('comptes_courants_associes').select('id, nom').eq('societe_id', societe_id)
      const { data: ccMouvements } = await supabase
        .from('mouvements_compte_courant').select('id, montant, description, compte_courant_id, date_mouvement, type')
        .eq('societe_id', societe_id).limit(200)

      // Pre-classification patterns
      const BANK_FEE_PATTERNS = ['service fee', 'banking subs fee', 'merchant monthly fee', 'payment fee',
        'outward transfer charge', 'tax amount due', 'card repayment', 'merchant discount',
        'merchant settlement', 'e-commerce transaction fee', 'contra entry', 'commission', 'frais']

      let counts = { matched: 0, interne: 0, frais_bancaires: 0, salaire_bulk: 0, mra: 0, salaire_individuel: 0, propose: 0, not_matched: 0, total: 0 }
      const matchesList: any[] = []

      console.log('[rapprochement] Starting auto_rapprocher:', { societe_id, releves: releves.length, ecritures: ecritures.length, factures: factures.length, societeNames, date_debut, date_fin })

      for (const releve of releves) {
        const txs: any[] = releve.transactions_json || []
        const releveDevise = compteDeviseMap[releve.compte_bancaire_id] || 'MUR'
        const updatedTxs = [...txs]
        let changed = false

        for (let i = 0; i < updatedTxs.length; i++) {
          const tx = updatedTxs[i]
          // Skip only if fully processed: has matched_type AND (rapproche or interne)
          // Re-process transactions that are 'rapproche' but have no matched_type (legacy)
          if (tx.matched_type && (tx.statut === 'rapproche' || tx.statut === 'interne')) continue
          // Skip manually lettered transactions
          if (tx.lettre && tx.facture_id) continue

          // Period filter
          if (date_debut && tx.date && tx.date < date_debut) continue
          if (date_fin && tx.date && tx.date > date_fin) continue

          const txDebit = Number(tx.debit) || 0
          const txCredit = Number(tx.credit) || 0
          const txAmount = txCredit > 0 ? txCredit : txDebit
          if (txAmount === 0) continue
          counts.total++

          const txLib = (tx.libelle || '').toLowerCase()
          const txTiers = (tx.tiers_detecte || tx.tiers || '').toLowerCase()
          let classified = false

          // RULE A — Internal transfers
          if (txLib.includes('own account transfer') || txLib.includes('ib account transfer ft') ||
              societeNames.some(n => n.length > 3 && (txTiers.includes(n) || txLib.includes(n)))) {
            updatedTxs[i] = { ...tx, statut: 'interne', matched_type: 'transfert_interne', note: 'Virement interne' }
            counts.interne++; changed = true; classified = true
          }

          // RULE B — Bank fees
          if (!classified && BANK_FEE_PATTERNS.some(p => txLib.includes(p))) {
            const feeEcriture = ecritures.find(e => e.compte?.startsWith('627') && Math.abs((Number(e.debit) || 0) - txDebit) / Math.max(txDebit, 1) < 0.15)
            updatedTxs[i] = { ...tx, statut: 'rapproche', matched_type: 'frais_bancaires', note: 'Frais bancaires', ecriture_id: feeEcriture?.id || null }
            if (feeEcriture) { ecritures = ecritures.filter(e => e.id !== feeEcriture.id); await supabase.from('ecritures_comptables').update({ lettre: `FEE${i}`, date_lettrage: new Date().toISOString().split('T')[0] }).eq('id', feeEcriture.id) }
            counts.frais_bancaires++; counts.matched++; changed = true; classified = true
          }

          // RULE C — Bulk salary
          if (!classified && txLib.includes('bulk payment') && (txLib.includes('salary') || txLib.includes('bonus') || txTiers === 'personnel')) {
            const txMonth = tx.date?.substring(0, 7) || ''
            if (txMonth) {
              const monthBulletins = (allBulletins || []).filter(b => b.periode?.startsWith(txMonth))
              const sumNet = monthBulletins.reduce((s: number, b: any) => s + (Number(b.salaire_net) || 0), 0)
              const isVerified = sumNet > 0 && Math.abs(txDebit - sumNet) / sumNet < 0.05
              updatedTxs[i] = { ...tx, statut: 'rapproche', matched_type: isVerified ? 'salaire_bulk' : 'salaire_bulk_non_verifie', note: isVerified ? `Masse salariale ${txMonth}` : 'Bulk salary — montant non vérifié' }
            } else {
              updatedTxs[i] = { ...tx, statut: 'rapproche', matched_type: 'salaire_bulk_non_verifie', note: 'Bulk salary' }
            }
            counts.salaire_bulk++; counts.matched++; changed = true; classified = true
          }

          // RULE D — MRA payments
          if (!classified && (txTiers.includes('mauritius revenue') || txLib.includes('mauritius revenue'))) {
            const mraEcriture = ecritures.find(e => {
              if (!e.compte?.match(/^(444|431|432|4457)/)) return false
              const eAmt = Number(e.credit) || Number(e.debit) || 0
              return eAmt > 0 && Math.abs(txDebit - eAmt) / eAmt < 0.10
            })
            if (mraEcriture) {
              updatedTxs[i] = { ...tx, statut: 'rapproche', ecriture_id: mraEcriture.id, matched_type: 'paiement_mra', note: `Paiement MRA — ${mraEcriture.compte}` }
              await supabase.from('ecritures_comptables').update({ lettre: `MRA${i}`, date_lettrage: new Date().toISOString().split('T')[0] }).eq('id', mraEcriture.id)
              ecritures = ecritures.filter(e => e.id !== mraEcriture.id)
            } else {
              updatedTxs[i] = { ...tx, statut: 'a_verifier', matched_type: 'paiement_mra_non_verifie', note: 'Paiement MRA — écriture non trouvée' }
            }
            counts.mra++; counts.matched++; changed = true; classified = true
          }

          // RULE E — Salary reversal
          if (!classified && (txLib.includes('bulk payment reversal') || txLib.includes('salary reversal') || txLib.includes('salary proceeds'))) {
            updatedTxs[i] = { ...tx, statut: 'rapproche', matched_type: 'reversal_salaire', note: 'Reversal virement salaire' }
            counts.matched++; changed = true; classified = true
          }

          if (classified) continue

          // === STANDARD MATCHING (factures, écritures, salary, associé) ===
          let matched = false

          // Strategy 1: Match with factures — by reference first, then by amount
          if (factures.length > 0) {
            const isCredit = txCredit > 0
            const txLib = (tx.libelle || '').toUpperCase()

            // 1a. Match by invoice reference in bank libelle
            let matchedFacture = factures.find(f => {
              if (!f.numero_facture) return false
              const ref = f.numero_facture.toUpperCase()
              return txLib.includes(ref) || (ref.length > 3 && txLib.includes(ref.replace(/[^A-Z0-9]/g, '')))
            })

            // 1b. Match by tiers name + amount with cross-currency support
            let matchConfidence = ''
            if (!matchedFacture) {
              const txAmountMUR = toMUR(txAmount, releveDevise)
              for (const f of factures) {
                const typeMatch = isCredit ? f.type_facture === 'client' : f.type_facture === 'fournisseur'
                if (!typeMatch) continue
                const fAmountMUR = Number(f.montant_mur) || toMUR(Number(f.montant_ttc) || 0, f.devise || 'MUR')
                // Same currency: 1% tolerance. Cross-currency: 5% tolerance
                const sameCurrency = releveDevise === (f.devise || 'MUR')
                const tolerance = sameCurrency ? 0.01 : 0.05
                const diff = fAmountMUR > 0 ? Math.abs(txAmountMUR - fAmountMUR) / fAmountMUR : 1
                if (diff > tolerance) continue
                // Word overlap scoring for tiers match
                const tiersScore = wordOverlap(tx.tiers_detecte || tx.tiers || txLib, f.tiers || '')
                if (tiersScore >= 0.4) { matchedFacture = f; matchConfidence = 'tiers_and_amount'; break }
                // Amount-only match (lower confidence) — same currency only
                if (sameCurrency && diff < 0.005) { matchedFacture = f; matchConfidence = 'amount_only'; break }
              }
            } else {
              matchConfidence = 'reference'
            }
            if (matchedFacture) {
              const code = `R${String(counts.matched + 1).padStart(3, '0')}`
              const isHighConfidence = matchConfidence === 'reference' || matchConfidence === 'tiers_and_amount'
              updatedTxs[i] = { ...tx, facture_id: matchedFacture.id, lettre: code, statut: isHighConfidence ? 'rapproche' : 'propose', match_confidence: matchConfidence }
              // Only mark facture as paye for high-confidence matches
              if (isHighConfidence) {
                await supabase.from('factures').update({ statut: 'paye' }).eq('id', matchedFacture.id)
              }

              // IAS 21: calculer l'écart de change si devise étrangère
              const fDevise = matchedFacture.devise || 'MUR'
              const fTauxFacture = Number(matchedFacture.taux_change) || 1
              let ecartChange = 0
              if (fDevise !== 'MUR' && fTauxFacture > 0) {
                const { data: currentRates } = await supabase
                  .from('taux_change').select('taux').eq('devise', fDevise).order('date_taux', { ascending: false }).limit(1).maybeSingle()
                const tauxPaiement = currentRates?.taux || fTauxFacture
                const fMontant = Number(matchedFacture.montant_ttc) || 0
                const valeurFacture = fMontant * fTauxFacture  // MUR au taux facture
                const valeurPaiement = fMontant * tauxPaiement  // MUR au taux paiement
                ecartChange = Math.round((valeurPaiement - valeurFacture) * 100) / 100

                if (Math.abs(ecartChange) > 1) {
                  // Créer une écriture de gain/perte de change
                  const { data: dossiers } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
                  if (dossiers) {
                    const gainOuPerte = ecartChange > 0 ? { compte: '766', libelle: `Gain de change — ${matchedFacture.tiers || matchedFacture.numero_facture}`, debit: ecartChange, credit: 0 }
                      : { compte: '666', libelle: `Perte de change — ${matchedFacture.tiers || matchedFacture.numero_facture}`, debit: 0, credit: Math.abs(ecartChange) }
                    await supabase.from('ecritures_comptables').insert({
                      dossier_id: dossiers.id, date_ecriture: new Date().toISOString().split('T')[0],
                      journal: 'OD', compte: gainOuPerte.compte, libelle: gainOuPerte.libelle,
                      debit: gainOuPerte.debit, credit: gainOuPerte.credit,
                    })
                  }
                }
              }

              matchesList.push({ type: 'facture', transaction: tx.libelle, facture: matchedFacture.numero_facture, montant: txAmount, ecart_change: ecartChange })
              factures = factures.filter(f => f.id !== matchedFacture.id)
              matched = true; changed = true; counts.matched++
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
              // Word overlap matching for tiers/libellé
              const txTiers = (tx.tiers_detecte || tx.tiers || tx.libelle || '').toLowerCase()
              const eTiers = (e.libelle || '').toLowerCase()
              const txW = txTiers.split(/\s+/).filter(w => w.length > 3)
              const eW = eTiers.split(/\s+/).filter(w => w.length > 3)
              const overlap = txW.filter(w => eW.some(ew => ew.includes(w) || w.includes(ew))).length
              return (txW.length > 0 && eW.length > 0 && overlap / Math.max(txW.length, eW.length) >= 0.3)
            })
            if (matchedEcriture) {
              const code = `L${String(counts.matched + 1).padStart(3, '0')}`
              updatedTxs[i] = { ...tx, ecriture_id: matchedEcriture.id, lettre: code, statut: 'rapproche' }
              // Also letter the écriture
              await supabase.from('ecritures_comptables')
                .update({ lettre: code, date_lettrage: new Date().toISOString().split('T')[0], lettrage_auto: true })
                .eq('id', matchedEcriture.id)
              matchesList.push({ type: 'ecriture', transaction: tx.libelle, ecriture: matchedEcriture.libelle, montant: txAmount })
              ecritures = ecritures.filter(e => e.id !== matchedEcriture.id)
              matched = true; changed = true; counts.matched++
            }
          }

          // Strategy 3: Match salary payments with bulletins_paie
          if (!matched && txDebit > 0 && (bulletins || []).length > 0) {
            const txAmountMUR = toMUR(txAmount, releveDevise)
            const matchedBulletin = (bulletins || []).find(b => {
              const emp = empMap[b.employe_id]
              if (!emp) return false
              const empName = normalizeTiers(`${emp.nom} ${emp.prenom}`)
              const txNorm = normalizeTiers(tx.libelle || '')
              const nameMatch = wordOverlap(empName, txNorm) >= 0.4 || txNorm.includes(normalizeTiers(emp.nom))
              if (!nameMatch) return false
              const bNet = Number(b.salaire_net) || 0
              return bNet > 0 && Math.abs(txAmountMUR - bNet) / bNet < 0.02
            })
            if (matchedBulletin) {
              const emp = empMap[matchedBulletin.employe_id]
              const code = `S${String(counts.matched + 1).padStart(3, '0')}`
              updatedTxs[i] = { ...tx, lettre: code, statut: 'rapproche', matched_type: 'salaire', employe_id: matchedBulletin.employe_id }
              matchesList.push({ type: 'salaire', transaction: tx.libelle, ecriture: `Salaire ${emp?.nom} ${emp?.prenom}`, montant: txAmount })
              matched = true; changed = true; counts.matched++
            }
          }

          // Strategy 4: Match MRA payments (TVA, CSG, PAYE)
          if (!matched && txDebit > 0 && (tx.libelle || '').toUpperCase().includes('MAURITIUS REVENUE')) {
            const mraEcriture = ecritures.find(e => {
              if (!e.compte?.match(/^(444|431|432|4457)/)) return false
              const eAmount = Number(e.credit) || 0
              if (eAmount === 0) return false
              return Math.abs(txAmount - eAmount) / eAmount < 0.05
            })
            if (mraEcriture) {
              const code = `MRA${String(counts.matched + 1).padStart(3, '0')}`
              updatedTxs[i] = { ...tx, ecriture_id: mraEcriture.id, lettre: code, statut: 'rapproche', matched_type: 'mra' }
              await supabase.from('ecritures_comptables').update({ lettre: code, date_lettrage: new Date().toISOString().split('T')[0] }).eq('id', mraEcriture.id)
              matchesList.push({ type: 'mra', transaction: tx.libelle, ecriture: mraEcriture.libelle, montant: txAmount })
              ecritures = ecritures.filter(e => e.id !== mraEcriture.id)
              matched = true; changed = true; counts.matched++
            }
          }

          // Strategy 5: Match associé transfers
          if (!matched && (ccMouvements || []).length > 0) {
            const txNorm = normalizeTiers(tx.libelle || '')
            for (const cc of ccComptes || []) {
              const ccNorm = normalizeTiers(cc.nom)
              if (wordOverlap(txNorm, ccNorm) < 0.3 && !txNorm.includes(ccNorm)) continue
              const matchedMvt = (ccMouvements || []).find(m => {
                if (m.compte_courant_id !== cc.id) return false
                const mAmount = Number(m.montant) || 0
                return mAmount > 0 && Math.abs(txAmount - mAmount) / mAmount < 0.02
              })
              if (matchedMvt) {
                const code = `CCA${String(counts.matched + 1).padStart(3, '0')}`
                updatedTxs[i] = { ...tx, lettre: code, statut: 'rapproche', matched_type: 'associe', compte_courant_id: cc.id }
                matchesList.push({ type: 'associe', transaction: tx.libelle, ecriture: `${cc.nom} — ${matchedMvt.description || 'mouvement'}`, montant: txAmount })
                matched = true; changed = true; counts.matched++; break
              }
            }
          }

          if (!matched && !classified) counts.not_matched++
          if (matched) { changed = true }
        }

        // Always save if any transaction was modified
        if (changed) {
          const { error: saveErr } = await supabase.from('releves_bancaires')
            .update({ transactions_json: updatedTxs })
            .eq('id', releve.id)
          const modCount = updatedTxs.filter((t: any, j: number) => JSON.stringify(t) !== JSON.stringify(txs[j])).length
          console.log(`[rapprochement] Saved releve ${releve.id}: ${modCount} transactions modified${saveErr ? ' ERROR: ' + saveErr.message : ''}`)
        }
      }

      console.log('[rapprochement] Result:', counts)

      const totalClassified = counts.matched + counts.interne + counts.frais_bancaires + counts.salaire_bulk + counts.mra
      return NextResponse.json({
        matched: counts.matched, interne: counts.interne, frais_bancaires: counts.frais_bancaires,
        salaire_bulk: counts.salaire_bulk, mra: counts.mra, propose: counts.propose,
        not_matched: counts.not_matched, total: counts.total,
        total_classified: totalClassified,
        matches: matchesList.slice(0, 10),
      })
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

    // === LETTRAGE MULTI — 1 paiement = plusieurs factures ===
    if (action === 'lettrer_multi') {
      const { transaction_id, releve_id, facture_ids, societe_id } = body
      if (!releve_id || !facture_ids || !Array.isArray(facture_ids) || facture_ids.length === 0) {
        return NextResponse.json({ error: 'releve_id et facture_ids[] requis' }, { status: 400 })
      }

      const { data: releve } = await supabase
        .from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
      if (!releve) return NextResponse.json({ error: 'Relevé non trouvé' }, { status: 404 })

      const txIdx = parseInt(transaction_id.split('-').pop() || '0')
      const txs = [...(releve.transactions_json || [])]
      if (txIdx >= txs.length) return NextResponse.json({ error: 'Transaction non trouvée' }, { status: 404 })

      const tx = txs[txIdx]
      const txAmount = Number(tx.credit) > 0 ? Number(tx.credit) : Number(tx.debit)

      // Vérifier que la somme des factures ≈ montant transaction
      const { data: facturesData } = await supabase.from('factures').select('id, montant_ttc, numero_facture, tiers').in('id', facture_ids)
      const facturesTotal = (facturesData || []).reduce((s, f) => s + (Number(f.montant_ttc) || 0), 0)
      const ecart = Math.abs(txAmount - facturesTotal)

      const lettreCode = `RM${String(Date.now()).slice(-4)}`

      // Marquer toutes les factures comme payées
      for (const fId of facture_ids) {
        await supabase.from('factures').update({ statut: 'paye' }).eq('id', fId)
      }

      // Mettre à jour la transaction avec toutes les facture_ids
      txs[txIdx] = {
        ...tx,
        facture_ids: facture_ids,
        facture_id: facture_ids[0],
        lettre: lettreCode,
        statut: 'rapproche',
        rapprochement_multi: true,
        nb_factures: facture_ids.length,
        ecart_montant: Math.round(ecart * 100) / 100,
      }
      await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)

      // Si écart > 0, créer écriture d'écart
      if (ecart > 1) {
        const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
        if (dossier) {
          await supabase.from('ecritures_comptables').insert({
            dossier_id: dossier.id,
            date_ecriture: new Date().toISOString().split('T')[0],
            journal: 'OD',
            compte: txAmount > facturesTotal ? '758' : '658',
            libelle: `Écart rapprochement multi-factures — ${lettreCode}`,
            debit: txAmount > facturesTotal ? Math.round(ecart * 100) / 100 : 0,
            credit: txAmount < facturesTotal ? Math.round(ecart * 100) / 100 : 0,
            lettre: lettreCode,
          })
        }
      }

      return NextResponse.json({
        success: true, lettre: lettreCode,
        nb_factures: facture_ids.length,
        montant_transaction: txAmount,
        total_factures: facturesTotal,
        ecart: Math.round(ecart * 100) / 100,
      })
    }

    // === LETTRER ECRITURES COMPTABLES (401/411) ===
    if (action === 'lettrer_ecritures') {
      const { ecriture_ids, societe_id: socId } = body
      if (!ecriture_ids || !Array.isArray(ecriture_ids) || ecriture_ids.length < 2) {
        return NextResponse.json({ error: 'Au moins 2 ecriture_ids requis' }, { status: 400 })
      }
      const lettreCode = `LE${String(Date.now()).slice(-4)}`
      const now = new Date().toISOString().split('T')[0]
      for (const eid of ecriture_ids) {
        await supabase.from('ecritures_comptables')
          .update({ lettre: lettreCode, date_lettrage: now })
          .eq('id', eid)
      }
      return NextResponse.json({ success: true, lettre: lettreCode, nb: ecriture_ids.length })
    }

    // === PAYE PAR ASSOCIE — l'associé a payé des factures ===
    if (action === 'paye_par_associe') {
      const { transaction_id, releve_id, facture_ids, societe_id, associe_nom, compte_courant_id } = body
      if (!societe_id || !facture_ids || facture_ids.length === 0) {
        return NextResponse.json({ error: 'societe_id et facture_ids[] requis' }, { status: 400 })
      }

      // Trouver ou créer le compte courant associé
      let ccaId = compte_courant_id
      if (!ccaId && associe_nom) {
        const { data: existingCCA } = await supabase.from('comptes_courants_associes')
          .select('id').eq('societe_id', societe_id).eq('nom', associe_nom).maybeSingle()
        if (existingCCA) {
          ccaId = existingCCA.id
        } else {
          const { data: newCCA } = await supabase.from('comptes_courants_associes')
            .insert({ societe_id, nom: associe_nom, type: 'associe', solde: 0 }).select('id').single()
          ccaId = newCCA?.id
        }
      }
      if (!ccaId) return NextResponse.json({ error: 'associe_nom ou compte_courant_id requis' }, { status: 400 })

      // Calculer le total des factures
      const { data: factures } = await supabase.from('factures').select('id, montant_ttc, tiers, numero_facture').in('id', facture_ids)
      const totalMontant = (factures || []).reduce((s, f) => s + (Number(f.montant_ttc) || 0), 0)

      // Marquer les factures comme payées par associé
      for (const f of factures || []) {
        await supabase.from('factures').update({
          statut: 'paye', mode_paiement: 'associe', paye_par: associe_nom,
        }).eq('id', f.id)
      }

      // Créer le mouvement CCA (avance)
      const description = facture_ids.length === 1
        ? `Paiement facture ${(factures || [])[0]?.numero_facture || ''}`
        : `Paiement ${facture_ids.length} factures`
      await supabase.from('mouvements_compte_courant').insert({
        compte_courant_id: ccaId, societe_id,
        date_mouvement: new Date().toISOString().split('T')[0],
        type: 'avance', montant: totalMontant,
        description,
        facture_id: facture_ids.length === 1 ? facture_ids[0] : null,
      })

      // Mettre à jour le solde CCA
      await supabase.rpc('increment_solde_cca', { cca_id: ccaId, delta: totalMontant }).catch(() => {
        // Si la fonction RPC n'existe pas, faire manuellement
        supabase.from('comptes_courants_associes')
          .select('solde').eq('id', ccaId).single()
          .then(({ data }) => {
            const newSolde = (Number(data?.solde) || 0) + totalMontant
            supabase.from('comptes_courants_associes').update({ solde: newSolde }).eq('id', ccaId)
          })
      })

      // Créer les écritures comptables
      const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
      if (dossier) {
        // Débit charges/fournisseur, Crédit 455 (CCA)
        for (const f of factures || []) {
          await supabase.from('ecritures_comptables').insert([
            { dossier_id: dossier.id, date_ecriture: new Date().toISOString().split('T')[0], journal: 'OD', compte: '401', libelle: `Fournisseur ${f.tiers || ''} — payé par ${associe_nom}`, debit: Number(f.montant_ttc), credit: 0 },
            { dossier_id: dossier.id, date_ecriture: new Date().toISOString().split('T')[0], journal: 'OD', compte: '455', libelle: `CCA ${associe_nom} — ${f.numero_facture || ''}`, debit: 0, credit: Number(f.montant_ttc) },
          ])
        }
      }

      // Si transaction bancaire fournie, la marquer aussi
      if (releve_id && transaction_id) {
        const { data: releve } = await supabase.from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
        if (releve) {
          const txIdx = parseInt(transaction_id.split('-').pop() || '0')
          const txs = [...(releve.transactions_json || [])]
          if (txIdx < txs.length) {
            txs[txIdx] = { ...txs[txIdx], lettre: `CCA${String(Date.now()).slice(-4)}`, statut: 'rapproche', paye_par_associe: associe_nom }
            await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)
          }
        }
      }

      return NextResponse.json({
        success: true,
        cca_id: ccaId,
        montant_total: totalMontant,
        nb_factures: facture_ids.length,
        associe: associe_nom,
      })
    }

    // === COMPENSATION — remboursement associé via virement bancaire ===
    if (action === 'compensation') {
      const { transaction_id, releve_id, compte_courant_id, societe_id, montant } = body
      if (!compte_courant_id || !societe_id || !montant) {
        return NextResponse.json({ error: 'compte_courant_id, societe_id, montant requis' }, { status: 400 })
      }

      // Récupérer le CCA
      const { data: cca } = await supabase.from('comptes_courants_associes')
        .select('id, nom, solde').eq('id', compte_courant_id).single()
      if (!cca) return NextResponse.json({ error: 'Compte courant non trouvé' }, { status: 404 })

      const remboursementMontant = Number(montant)

      // Créer mouvement de remboursement
      await supabase.from('mouvements_compte_courant').insert({
        compte_courant_id, societe_id,
        date_mouvement: new Date().toISOString().split('T')[0],
        type: 'remboursement',
        montant: -remboursementMontant,
        description: `Remboursement par virement bancaire`,
      })

      // Mettre à jour le solde
      const newSolde = (Number(cca.solde) || 0) - remboursementMontant
      await supabase.from('comptes_courants_associes').update({ solde: newSolde }).eq('id', compte_courant_id)

      // Écritures comptables: Débit 455 (CCA) / Crédit 512 (Banque)
      const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
      if (dossier) {
        await supabase.from('ecritures_comptables').insert([
          { dossier_id: dossier.id, date_ecriture: new Date().toISOString().split('T')[0], journal: 'BNQ', compte: '455', libelle: `Remboursement CCA ${cca.nom}`, debit: remboursementMontant, credit: 0 },
          { dossier_id: dossier.id, date_ecriture: new Date().toISOString().split('T')[0], journal: 'BNQ', compte: '512', libelle: `Virement remboursement ${cca.nom}`, debit: 0, credit: remboursementMontant },
        ])
      }

      // Marquer la transaction bancaire si fournie
      if (releve_id && transaction_id) {
        const { data: releve } = await supabase.from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
        if (releve) {
          const txIdx = parseInt(transaction_id.split('-').pop() || '0')
          const txs = [...(releve.transactions_json || [])]
          if (txIdx < txs.length) {
            txs[txIdx] = { ...txs[txIdx], lettre: `RMB${String(Date.now()).slice(-4)}`, statut: 'rapproche', compensation_cca: cca.nom }
            await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)
          }
        }
      }

      return NextResponse.json({
        success: true,
        ancien_solde: Number(cca.solde),
        nouveau_solde: newSolde,
        associe: cca.nom,
        montant_rembourse: remboursementMontant,
      })
    }

    // === PAIEMENT EMPLOYÉ — virement individuel (hors bulk) ===
    if (action === 'paiement_employe') {
      const { transaction_id, releve_id, employe_id, societe_id, periode } = body
      if (!employe_id || !societe_id) {
        return NextResponse.json({ error: 'employe_id et societe_id requis' }, { status: 400 })
      }

      // Trouver l'employé
      const { data: employe } = await supabase.from('employes').select('id, nom, prenom, salaire_base').eq('id', employe_id).single()
      if (!employe) return NextResponse.json({ error: 'Employé non trouvé' }, { status: 404 })

      // Trouver le bulletin de paie (si période fournie)
      let bulletin: any = null
      if (periode) {
        const periodeDate = periode.length === 7 ? `${periode}-01` : periode
        const { data: bul } = await supabase.from('bulletins_paie')
          .select('id, salaire_net, salaire_base, periode')
          .eq('employe_id', employe_id)
          .gte('periode', periodeDate)
          .lte('periode', `${periode}-31`)
          .limit(1).maybeSingle()
        bulletin = bul
      }

      const montantNet = bulletin ? Number(bulletin.salaire_net) : Number(employe.salaire_base) || 0
      const lettreCode = `SAL${String(Date.now()).slice(-4)}`
      const nomComplet = `${employe.prenom} ${employe.nom}`

      // Marquer la transaction bancaire
      if (releve_id && transaction_id) {
        const { data: releve } = await supabase.from('releves_bancaires').select('id, transactions_json').eq('id', releve_id).single()
        if (releve) {
          const txIdx = parseInt(transaction_id.split('-').pop() || '0')
          const txs = [...(releve.transactions_json || [])]
          if (txIdx < txs.length) {
            txs[txIdx] = {
              ...txs[txIdx],
              lettre: lettreCode,
              statut: 'rapproche',
              employe_id,
              employe_nom: nomComplet,
              type_rapprochement: 'salaire_individuel',
              bulletin_id: bulletin?.id || null,
            }
            await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releve_id)
          }
        }
      }

      // Créer les écritures comptables (Débit 421 / Crédit 512)
      const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
      if (dossier) {
        const dateEcriture = new Date().toISOString().split('T')[0]
        await supabase.from('ecritures_comptables').insert([
          { dossier_id: dossier.id, date_ecriture: dateEcriture, journal: 'BNQ', compte: '421000', libelle: `Virement salaire ${nomComplet}`, debit: Math.round(montantNet), credit: 0, lettre: lettreCode },
          { dossier_id: dossier.id, date_ecriture: dateEcriture, journal: 'BNQ', compte: '512000', libelle: `Virement salaire ${nomComplet}`, debit: 0, credit: Math.round(montantNet), lettre: lettreCode },
        ])
      }

      // Si bulletin trouvé, marquer comme payé
      if (bulletin) {
        await supabase.from('bulletins_paie').update({ statut: 'paye' }).eq('id', bulletin.id)
      }

      return NextResponse.json({
        success: true,
        lettre: lettreCode,
        employe: nomComplet,
        montant: montantNet,
        bulletin_id: bulletin?.id || null,
        bulletin_found: !!bulletin,
      })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    console.error('[rapprochement POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
