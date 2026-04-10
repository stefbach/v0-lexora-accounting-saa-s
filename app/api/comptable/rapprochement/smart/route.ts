import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { analyzeAllTransactions, MatchingTransaction, MatchingFacture, MatchProposal, HistoricalPattern, tiersScore } from '@/lib/accounting/matching-engine'
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

// ── Rule-based patterns ───────────────────────────────────────────────────────

const BANK_FEE_PATTERNS = [
  'service fee', 'banking subs fee', 'merchant monthly fee', 'payment fee',
  'outward transfer charge', 'tax amount due', 'card repayment', 'merchant discount',
  'merchant settlement', 'e-commerce transaction fee', 'contra entry', 'commission',
  'frais bancaires', 'frais',
]

const INTERNAL_TRANSFER_PATTERNS = [
  'own account transfer', 'ib account transfer', 'ib own account', 'virement interne',
]

/**
 * Pre-classify a single transaction using deterministic rules A–F.
 * Returns a pre-classified proposal object, or null if no rule matched.
 */
function applyRules(
  tx: MatchingTransaction,
  societeNames: string[],
  allBulletins: any[],
  empMap: Record<string, any>,
  ccComptes: any[],
): {
  matched_type: string
  statut: string
  confidence: number
  employe_id?: string
  reasoning: string
} | null {
  const lib = (tx.libelle || '').toLowerCase()
  const tiers = (tx.tiers_detecte || '').toLowerCase()

  // RÈGLE A — Frais bancaires
  if (BANK_FEE_PATTERNS.some(p => lib.includes(p))) {
    return {
      matched_type: 'frais_bancaires',
      statut: 'rapproche',
      confidence: 0.95,
      reasoning: 'Frais bancaires détectés dans le libellé',
    }
  }

  // RÈGLE B — Virements internes
  if (
    INTERNAL_TRANSFER_PATTERNS.some(p => lib.includes(p)) ||
    societeNames.some(n => n.length > 3 && (tiers.includes(n) || lib.includes(n)))
  ) {
    return {
      matched_type: 'transfert_interne',
      statut: 'interne',
      confidence: 1.0,
      reasoning: 'Virement interne — même entité juridique',
    }
  }

  // RÈGLE C — Salaires bulk
  if (lib.includes('bulk payment') && (lib.includes('salary') || lib.includes('bonus') || tiers === 'personnel')) {
    return {
      matched_type: 'salaire_bulk',
      statut: 'rapproche',
      confidence: 0.90,
      reasoning: 'Paiement bulk salaires/bonus détecté',
    }
  }

  // RÈGLE D — Salaires individuels
  if (allBulletins.length > 0 && (tx.debit > 0 || tx.credit > 0)) {
    const txAmount = Math.max(tx.debit, tx.credit)
    const txMonth = (tx.date || '').substring(0, 7)
    for (const emp of Object.values(empMap)) {
      const fullName = `${emp.prenom || ''} ${emp.nom || ''}`.trim()
      if (!fullName) continue
      const score = tiersScore(tiers || lib, fullName)
      if (score >= 0.5) {
        // Check if there's a bulletin matching the month and amount (±5%)
        const bulletin = allBulletins.find(b => {
          if (b.employe_id !== emp.id) return false
          if (txMonth && b.periode && !b.periode.startsWith(txMonth)) return false
          const net = Number(b.salaire_net) || 0
          if (net <= 0) return false
          return Math.abs(txAmount - net) / net <= 0.05
        })
        if (bulletin) {
          return {
            matched_type: 'salaire_individuel',
            statut: 'rapproche',
            confidence: 0.88,
            employe_id: emp.id,
            reasoning: `Salaire individuel — ${fullName} (${txMonth})`,
          }
        }
      }
    }
  }

  // RÈGLE E — MRA / Mauritius Revenue Authority
  if (tiers.includes('mauritius revenue') || lib.includes('mauritius revenue') || lib.includes(' mra') || tiers.includes('mra')) {
    return {
      matched_type: 'paiement_mra',
      statut: 'rapproche',
      confidence: 0.92,
      reasoning: 'Paiement Mauritius Revenue Authority (MRA)',
    }
  }

  // RÈGLE F — Associés / Compte courant
  for (const cca of ccComptes) {
    if (!cca.nom) continue
    const score = tiersScore(tiers || lib, cca.nom)
    if (score >= 0.5) {
      return {
        matched_type: 'associe',
        statut: 'rapproche',
        confidence: 0.85,
        reasoning: `Mouvement associé — ${cca.nom}`,
      }
    }
  }

  return null
}

/**
 * Professional multi-strategy reconciliation analysis.
 *
 * Phase 1: deterministic rule-based pre-classification (rules A–F)
 *   → frais_bancaires, transfert_interne, salaire_bulk, salaire_individuel, paiement_mra, associe
 * Phase 2: heuristic matching-engine for remaining transactions
 *   → exact_reference, exact_amount, close_amount, grouped_sum, partial, historical
 *
 * Fast: no LLM call. Typically <5s for 200 transactions.
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

    // ── Step 1: Load data needed for rules A–F ──────────────────────────────

    // Société names for internal transfer detection (Rule B)
    const { data: socData } = await supabase.from('societes').select('nom, aliases').eq('id', societe_id)
    const societeNames = (socData || [])
      .flatMap(s => [s.nom, ...(s.aliases || [])])
      .map(n => (n || '').toLowerCase())
      .filter(Boolean)

    // Bulletins de paie + employés for salary rules (Rules C & D)
    const { data: allBulletins } = await supabase
      .from('bulletins_paie')
      .select('id, employe_id, salaire_net, periode, statut')
      .eq('societe_id', societe_id)
      .eq('statut', 'valide')

    const empIds = [...new Set((allBulletins || []).map((b: any) => b.employe_id).filter(Boolean))]
    let empMap: Record<string, any> = {}
    if (empIds.length > 0) {
      const { data: emps } = await supabase.from('employes').select('id, nom, prenom').in('id', empIds)
      for (const e of emps || []) empMap[e.id] = e
    }

    // Comptes courants associés for Rule F
    const { data: ccComptes } = await supabase
      .from('comptes_courants_associes')
      .select('id, nom')
      .eq('societe_id', societe_id)

    // ── Step 2: Pre-classify transactions with rules A–F ───────────────────

    const preClassifiedProposals: any[] = []
    const engineTxs: MatchingTransaction[] = []

    for (const tx of unmatchedTxs) {
      const ruleMatch = applyRules(
        tx,
        societeNames,
        allBulletins || [],
        empMap,
        ccComptes || [],
      )

      if (ruleMatch) {
        // Build pre-classified proposal (Step 3: these skip the matching engine)
        preClassifiedProposals.push({
          releve_id: tx.releve_id,
          transaction_idx: tx.transaction_idx,
          transaction: {
            date: tx.date,
            libelle: tx.libelle,
            tiers: tx.tiers_detecte,
            debit: tx.debit,
            credit: tx.credit,
          },
          facture_ids: [],
          factures: [],
          match_type: ruleMatch.matched_type,
          strategy: 'rule_based',
          confidence: ruleMatch.confidence,
          reasoning: ruleMatch.reasoning,
          amount_diff: 0,
          delay_days: 0,
          within_terms: true,
          needs_arbitration: false,
          pre_classified: true,
          employe_id: ruleMatch.employe_id,
          rule_statut: ruleMatch.statut,
        })
      } else {
        // Step 4: passes to matching engine
        engineTxs.push(tx)
      }
    }

    // 2. Fetch all unpaid factures (only needed for engine phase)
    let factures: MatchingFacture[] = []
    if (engineTxs.length > 0) {
      const { data: facturesRaw } = await supabase
        .from('factures')
        .select('id, numero_facture, tiers, type_facture, montant_ttc, montant_mur, devise, date_facture, date_echeance, conditions_paiement, statut')
        .eq('societe_id', societe_id)
        .in('statut', ['en_attente', 'retard', 'partiel'])

      factures = (facturesRaw || []).map(f => ({
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

          factures = (ecritures || []).map((e: any) => {
            const isClient = e.numero_compte?.startsWith('411')
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
      patterns = []
    }

    // 5. Run the matching engine on non-pre-classified transactions (Step 4)
    let engineProposals: any[] = []
    if (engineTxs.length > 0 && factures.length > 0) {
      const proposalsRaw: MatchProposal[] = analyzeAllTransactions(engineTxs, factures, rates, patterns)

      // 6. Format engine proposals for API response
      engineProposals = proposalsRaw.map(p => ({
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
        pre_classified: false,
      }))
    } else if (engineTxs.length > 0 && factures.length === 0 && preClassifiedProposals.length === 0) {
      // No factures and no pre-classified → inform the caller
      return NextResponse.json({
        proposals: [],
        stats: { total: unmatchedTxs.length, proposed: 0, auto_apply: 0, needs_arbitration: 0, orphans: unmatchedTxs.length, pre_classified: 0 },
        duration_ms: Date.now() - start,
        message: 'Aucune facture ni écriture 401/411 non lettrée disponible',
      })
    }

    // Step 5 — Merge pre-classified + engine proposals
    const allProposals = [
      ...preClassifiedProposals,  // règles A–F (deterministic, first)
      ...engineProposals,          // matching-engine heuristique
    ]

    // Step 6 — Stats
    const stats = {
      total: unmatchedTxs.length,
      proposed: allProposals.length,
      auto_apply: allProposals.filter(p => p.confidence >= 0.85).length,
      needs_arbitration: allProposals.filter(p => p.confidence >= 0.65 && p.confidence < 0.85).length,
      orphans: unmatchedTxs.length - allProposals.length,
      pre_classified: preClassifiedProposals.length,
      by_strategy: allProposals.reduce((acc, p) => {
        const key = p.pre_classified ? (p.match_type as string) : (p.strategy as string)
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {} as Record<string, number>),
    }

    return NextResponse.json({
      proposals: allProposals,
      stats,
      duration_ms: Date.now() - start,
    })
  } catch (e: any) {
    console.error('[smart] error:', e.message)
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
