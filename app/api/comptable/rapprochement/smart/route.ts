import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { analyzeAllTransactions, MatchingTransaction, MatchingFacture, MatchProposal, HistoricalPattern } from '@/lib/accounting/matching-engine'
import { getTauxChange } from '@/lib/taux-change'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Professional multi-strategy reconciliation analysis.
 *
 * Returns ranked proposals per transaction:
 * - strategy: exact_reference / exact_amount / close_amount / grouped_sum / partial
 * - confidence: 0-1
 * - reasoning: human-readable explanation
 * - factures: full invoice details for UI rendering
 *
 * Fast: pure heuristic, no LLM call. Typically <5s for 200 transactions.
 */
export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { societe_id, date_debut, date_fin } = body
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const start = Date.now()

    // 1. Fetch unmatched bank transactions
    const { data: releves } = await supabase
      .from('releves_bancaires')
      .select('id, transactions_json')
      .eq('societe_id', societe_id)

    const unmatchedTxs: MatchingTransaction[] = []
    for (const releve of releves || []) {
      const txs: any[] = releve.transactions_json || []
      txs.forEach((tx, idx) => {
        if (tx.matched_type && (tx.statut === 'rapproche' || tx.statut === 'interne')) return
        if (tx.lettre && tx.facture_id) return
        if (date_debut && tx.date && tx.date < date_debut) return
        if (date_fin && tx.date && tx.date > date_fin) return
        const amt = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
        if (amt === 0) return
        unmatchedTxs.push({
          releve_id: releve.id,
          transaction_idx: idx,
          date: tx.date || '',
          libelle: tx.libelle || '',
          tiers_detecte: tx.tiers_detecte || tx.tiers || null,
          debit: Number(tx.debit) || 0,
          credit: Number(tx.credit) || 0,
          devise: tx.devise || 'MUR',
        })
      })
    }

    if (unmatchedTxs.length === 0) {
      return NextResponse.json({
        proposals: [],
        stats: { total: 0, proposed: 0, auto_apply: 0, needs_arbitration: 0, orphans: 0 },
        duration_ms: Date.now() - start,
      })
    }

    // Cap to avoid excessive processing
    const MAX = 250
    if (unmatchedTxs.length > MAX) unmatchedTxs.splice(MAX)

    // 2. Fetch all unpaid factures
    const { data: facturesRaw } = await supabase
      .from('factures')
      .select('id, numero_facture, tiers, type_facture, montant_ttc, montant_mur, devise, date_facture, date_echeance, conditions_paiement, statut')
      .eq('societe_id', societe_id)
      .in('statut', ['en_attente', 'retard', 'partiel'])

    let factures: MatchingFacture[] = (facturesRaw || []).map(f => ({
      id: f.id,
      numero_facture: f.numero_facture,
      tiers: f.tiers,
      montant_ttc: Number(f.montant_ttc) || 0,
      montant_mur: f.montant_mur != null ? Number(f.montant_mur) : null,
      devise: f.devise,
      date_facture: f.date_facture,
      date_echeance: f.date_echeance,
      conditions_paiement: f.conditions_paiement != null ? Number(f.conditions_paiement) : null,
      type_facture: (f.type_facture === 'fournisseur' ? 'fournisseur' : 'client') as 'client' | 'fournisseur',
      statut: f.statut,
    }))

    // 2b. If no factures, fall back to écritures comptables 401/411 non lettrées
    // (common when invoices are entered as journal entries, not via the factures module)
    if (factures.length === 0) {
      const { data: dossiers } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id)
      const dossierIds = (dossiers || []).map((d: any) => d.id)
      if (dossierIds.length > 0) {
        const { data: ecritures } = await supabase
          .from('ecritures_comptables_v2')
          .select('id, numero_compte, description, libelle, debit_mur, credit_mur, date_ecriture, lettre, ref_folio')
          .eq('societe_id', societe_id)
          .is('lettre', null)
          .or('numero_compte.like.401%,numero_compte.like.411%')
          .order('date_ecriture', { ascending: false })
          .limit(200)

        // Convert écritures to MatchingFacture format
        factures = (ecritures || []).map((e: any) => {
          const isClient = e.numero_compte?.startsWith('411')
          // Credit = facture fournisseur (401 credit), Debit = facture client (411 debit)
          const montant = isClient
            ? (Number(e.debit_mur) || 0)
            : (Number(e.credit_mur) || 0)
          const tiers = e.description || e.libelle || ''
          return {
            id: e.id,
            numero_facture: e.ref_folio || null,
            tiers: tiers.replace(/^(Facture|Paiement|Client|Fournisseur)\s*/i, '').trim() || tiers,
            montant_ttc: montant,
            montant_mur: montant,
            devise: 'MUR',
            date_facture: e.date_ecriture,
            date_echeance: null,
            conditions_paiement: 30,
            type_facture: (isClient ? 'client' : 'fournisseur') as 'client' | 'fournisseur',
            statut: 'en_attente',
          }
        }).filter(f => f.montant_ttc > 0)
      }
    }

    if (factures.length === 0) {
      return NextResponse.json({
        proposals: [],
        stats: { total: unmatchedTxs.length, proposed: 0, auto_apply: 0, needs_arbitration: 0, orphans: unmatchedTxs.length },
        duration_ms: Date.now() - start,
        message: 'Aucune facture ni écriture 401/411 non lettrée disponible',
      })
    }

    // 3. Load FX rates for cross-currency matching
    const rates = await getTauxChange()

    // 4. Load historical patterns for this société
    let patterns: HistoricalPattern[] = []
    try {
      const { data: patternsRaw } = await supabase
        .from('rapprochement_patterns')
        .select('id, tiers_banque, libelle_pattern, montant_min, montant_max, type_cible, cible_tiers, cible_compte, confidence_cumul, nb_utilisations')
        .eq('societe_id', societe_id)
        .order('nb_utilisations', { ascending: false })

      patterns = (patternsRaw || []).map(p => ({
        id: p.id,
        tiers_banque: p.tiers_banque,
        libelle_pattern: p.libelle_pattern,
        montant_min: p.montant_min !== null ? Number(p.montant_min) : null,
        montant_max: p.montant_max !== null ? Number(p.montant_max) : null,
        type_cible: p.type_cible,
        cible_tiers: p.cible_tiers,
        cible_compte: p.cible_compte,
        confidence_cumul: Number(p.confidence_cumul) || 0.8,
        nb_utilisations: Number(p.nb_utilisations) || 1,
      }))
    } catch {
      // Patterns table may not exist yet — proceed without patterns
      patterns = []
    }

    // 5. Run the matching engine (with FX rates and historical patterns)
    const proposalsRaw: MatchProposal[] = analyzeAllTransactions(unmatchedTxs, factures, rates, patterns)

    // 6. Format for API response
    const proposals = proposalsRaw.map(p => ({
      releve_id: p.transaction.releve_id,
      transaction_idx: p.transaction.transaction_idx,
      transaction: {
        date: p.transaction.date,
        libelle: p.transaction.libelle,
        tiers: p.transaction.tiers_detecte,
        debit: p.transaction.debit,
        credit: p.transaction.credit,
      },
      facture_ids: p.facture_ids,
      factures: p.factures.map(f => ({
        id: f.id,
        numero_facture: f.numero_facture,
        tiers: f.tiers,
        montant_mur: Number(f.montant_mur) || Number(f.montant_ttc) || 0,
        montant_ttc: f.montant_ttc,
        devise: f.devise,
        date_facture: f.date_facture,
      })),
      match_type: p.strategy === 'grouped_sum' ? 'facture_groupee' : p.strategy === 'partial' ? 'partiel' : 'facture_unique',
      strategy: p.strategy,
      confidence: p.confidence,
      reasoning: p.reasoning,
      amount_diff: p.amount_diff,
      delay_days: p.delay_days,
      within_terms: p.within_terms,
      needs_arbitration: p.confidence < 0.85,
    }))

    const stats = {
      total: unmatchedTxs.length,
      proposed: proposals.length,
      auto_apply: proposals.filter(p => p.confidence >= 0.85).length,
      needs_arbitration: proposals.filter(p => p.confidence < 0.85).length,
      orphans: unmatchedTxs.length - proposals.length,
      by_strategy: proposals.reduce((acc, p) => {
        acc[p.strategy] = (acc[p.strategy] || 0) + 1
        return acc
      }, {} as Record<string, number>),
    }

    return NextResponse.json({
      proposals,
      stats,
      duration_ms: Date.now() - start,
    })
  } catch (e: any) {
    console.error('[smart] error:', e.message)
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
