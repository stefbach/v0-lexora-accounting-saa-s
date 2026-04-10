import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { callClaudeJSON } from '@/lib/claude'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Normalize company/tiers names for fuzzy matching
 */
function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(ltd|limited|sarl|sas|sa|eurl|co\.?|inc|llc|plc)\b/gi, '')
    .replace(/[.,;:!?()\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Score tiers similarity (0-1)
 */
function tiersScore(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.85
  const wordsA = new Set(na.split(' ').filter(w => w.length > 2))
  const wordsB = new Set(nb.split(' ').filter(w => w.length > 2))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  const inter = [...wordsA].filter(w => wordsB.has(w)).length
  return inter / Math.max(wordsA.size, wordsB.size)
}

/**
 * Compute days between two dates
 */
function daysBetween(d1: string, d2: string): number {
  const a = new Date(d1)
  const b = new Date(d2)
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Generate all subsets of an array up to maxSize
 */
function* subsets<T>(arr: T[], maxSize: number): Generator<T[]> {
  if (arr.length === 0 || maxSize === 0) return
  const n = Math.min(arr.length, 12) // limit to avoid combinatorial explosion
  for (let mask = 1; mask < (1 << n); mask++) {
    const subset: T[] = []
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.push(arr[i])
    }
    if (subset.length <= maxSize) yield subset
  }
}

interface MatchProposal {
  transaction_idx: number
  releve_id: string
  transaction: any
  match_type: 'facture_unique' | 'facture_groupee' | 'partiel' | 'avec_ecart'
  facture_ids: string[]
  confidence: number // 0-1
  reasoning: string
  delay_days: number // jours entre date facture et date paiement
  within_terms: boolean // dans les délais contractuels ?
  ecart_montant?: number // différence entre montant payé et somme factures
  needs_arbitration: boolean
}

export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { societe_id, date_debut, date_fin, use_claude = true, apply = false } = body

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    // 1. Fetch unmatched bank transactions
    const { data: releves } = await supabase
      .from('releves_bancaires')
      .select('id, compte_bancaire_id, transactions_json')
      .eq('societe_id', societe_id)

    if (!releves || releves.length === 0) {
      return NextResponse.json({ proposals: [], stats: { total: 0, auto: 0, arbitration: 0 } })
    }

    // 2. Fetch unpaid factures (supplier + client)
    const { data: factures } = await supabase
      .from('factures')
      .select('id, numero_facture, tiers, type_facture, montant_ttc, montant_mur, devise, date_facture, date_echeance, conditions_paiement, statut')
      .eq('societe_id', societe_id)
      .in('statut', ['en_attente', 'retard', 'partiel'])

    if (!factures || factures.length === 0) {
      return NextResponse.json({ proposals: [], stats: { total: 0, auto: 0, arbitration: 0 }, message: 'Aucune facture en attente' })
    }

    // 3. Collect all unmatched transactions
    const unmatchedTxs: Array<{ releve_id: string; idx: number; tx: any }> = []
    for (const releve of releves) {
      const txs: any[] = releve.transactions_json || []
      txs.forEach((tx, idx) => {
        // Skip already processed
        if (tx.matched_type && (tx.statut === 'rapproche' || tx.statut === 'interne')) return
        if (tx.lettre && tx.facture_id) return
        // Period filter
        if (date_debut && tx.date && tx.date < date_debut) return
        if (date_fin && tx.date && tx.date > date_fin) return
        // Only consider debit OR credit > 0
        const amt = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
        if (amt === 0) return
        unmatchedTxs.push({ releve_id: releve.id, idx, tx })
      })
    }

    // 4. Pre-match using heuristics (payment terms + amount + tiers)
    const proposals: MatchProposal[] = []
    const usedFactureIds = new Set<string>()

    for (const { releve_id, idx, tx } of unmatchedTxs) {
      const txDebit = Number(tx.debit) || 0
      const txCredit = Number(tx.credit) || 0
      const txAmount = txDebit > 0 ? txDebit : txCredit
      const isSupplierPayment = txDebit > 0 // debit = outgoing = paying suppliers
      const expectedFactureType = isSupplierPayment ? 'fournisseur' : 'client'
      const txDate = tx.date || new Date().toISOString().slice(0, 10)
      const txLib = (tx.libelle || '').toLowerCase()
      const txTiers = (tx.tiers_detecte || tx.tiers || '').toLowerCase()

      // Filter candidate factures by tiers (score >= 0.3)
      const candidateFactures = factures.filter(f => {
        if (f.type_facture !== expectedFactureType) return false
        if (usedFactureIds.has(f.id)) return false
        const score = Math.max(
          tiersScore(txTiers, f.tiers || ''),
          tiersScore(txLib, f.tiers || ''),
        )
        return score >= 0.3
      })

      if (candidateFactures.length === 0) continue

      // Sort candidates by date ascending (oldest first - payment terms analysis)
      candidateFactures.sort((a, b) => (a.date_facture || '').localeCompare(b.date_facture || ''))

      // Single facture match
      let best: MatchProposal | null = null
      for (const f of candidateFactures) {
        const fMontant = Number(f.montant_mur) || Number(f.montant_ttc) || 0
        if (fMontant === 0) continue
        const diff = Math.abs(txAmount - fMontant) / fMontant
        if (diff > 0.02) continue // 2% tolerance for exact match
        const delay = daysBetween(f.date_facture || txDate, txDate)
        const terms = Number(f.conditions_paiement) || 30
        const withinTerms = delay <= terms + 5 // +5 days grace
        const score = Math.max(
          tiersScore(txTiers, f.tiers || ''),
          tiersScore(txLib, f.tiers || ''),
        )
        const confidence = (diff < 0.005 ? 0.5 : 0.35) + (score * 0.4) + (withinTerms ? 0.1 : 0)
        if (!best || confidence > best.confidence) {
          best = {
            transaction_idx: idx,
            releve_id,
            transaction: tx,
            match_type: 'facture_unique',
            facture_ids: [f.id],
            confidence: Math.min(1, confidence),
            reasoning: `${score >= 0.7 ? 'Tiers fort' : 'Tiers ok'} (${(score * 100).toFixed(0)}%), ecart ${(diff * 100).toFixed(1)}%, delai ${delay}j ${withinTerms ? 'dans termes' : 'hors termes'}`,
            delay_days: delay,
            within_terms: withinTerms,
            needs_arbitration: confidence < 0.75,
          }
        }
      }

      // Multi-facture match (grouped payment)
      if (!best || best.confidence < 0.9) {
        // Try to find a subset of same-tiers factures summing to txAmount
        for (const f0 of candidateFactures.slice(0, 6)) {
          const sameGroup = candidateFactures.filter(f => tiersScore(f.tiers || '', f0.tiers || '') >= 0.7 && !usedFactureIds.has(f.id))
          if (sameGroup.length < 2) continue
          // Try all subsets size 2..5
          for (const sub of subsets(sameGroup, 5)) {
            if (sub.length < 2) continue
            const sum = sub.reduce((s, f) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0), 0)
            if (sum === 0) continue
            const diff = Math.abs(txAmount - sum) / sum
            if (diff > 0.03) continue
            const avgDelay = sub.reduce((s, f) => s + daysBetween(f.date_facture || txDate, txDate), 0) / sub.length
            const maxTerms = Math.max(...sub.map(f => Number(f.conditions_paiement) || 30))
            const withinTerms = avgDelay <= maxTerms + 10
            const avgScore = sub.reduce((s, f) => s + tiersScore(txTiers, f.tiers || ''), 0) / sub.length
            const confidence = 0.55 + (avgScore * 0.3) + (diff < 0.01 ? 0.1 : 0) + (withinTerms ? 0.05 : 0)
            if (!best || confidence > best.confidence) {
              best = {
                transaction_idx: idx,
                releve_id,
                transaction: tx,
                match_type: 'facture_groupee',
                facture_ids: sub.map(f => f.id),
                confidence: Math.min(1, confidence),
                reasoning: `${sub.length} factures ${(f0.tiers || '').substring(0, 30)} — somme ${sum.toFixed(2)} vs paiement ${txAmount.toFixed(2)} (ecart ${(diff * 100).toFixed(1)}%), delai moyen ${avgDelay.toFixed(0)}j`,
                delay_days: Math.round(avgDelay),
                within_terms: withinTerms,
                ecart_montant: Math.abs(txAmount - sum),
                needs_arbitration: confidence < 0.8,
              }
              break
            }
          }
        }
      }

      if (best) {
        proposals.push(best)
        if (best.confidence >= 0.85) {
          best.facture_ids.forEach(id => usedFactureIds.add(id))
        }
      }
    }

    // 5. Use Claude for complex cases (medium confidence 0.5-0.8)
    let claudeAnalysis: any = null
    const needsAI = proposals.filter(p => p.confidence >= 0.4 && p.confidence < 0.8)
    const unmatchedCount = unmatchedTxs.length - proposals.length

    if (use_claude && (needsAI.length > 0 || unmatchedCount > 0) && process.env.ANTHROPIC_API_KEY) {
      try {
        // Build a condensed summary for Claude
        const txsToAnalyze = [
          ...needsAI.slice(0, 20).map(p => p.transaction),
          ...unmatchedTxs.slice(0, 20)
            .filter(t => !proposals.find(p => p.transaction_idx === t.idx && p.releve_id === t.releve_id))
            .map(t => t.tx),
        ].slice(0, 30)

        const unpaidForAI = factures
          .filter(f => !usedFactureIds.has(f.id))
          .slice(0, 50)
          .map(f => ({
            id: f.id,
            numero: f.numero_facture,
            tiers: f.tiers,
            type: f.type_facture,
            montant: Number(f.montant_mur) || Number(f.montant_ttc) || 0,
            devise: f.devise,
            date_facture: f.date_facture,
            date_echeance: f.date_echeance,
            termes_paiement_jours: f.conditions_paiement || 30,
          }))

        const systemPrompt = `Tu es un expert-comptable specialise en rapprochement bancaire a Maurice.
Tu dois analyser chaque transaction bancaire et trouver quelle(s) facture(s) elle paie.

Regles importantes :
1. Un paiement peut solder 1 OU PLUSIEURS factures du meme tiers (paiement groupe)
2. Les delais de paiement standards sont 30 jours (parfois 0 = comptant, 45 jours, 60 jours)
3. Un paiement peut etre hors delais (retard) — c'est normal si le tiers et le montant correspondent
4. Un paiement peut etre partiel (acompte) ou avec un petit ecart (frais bancaires, arrondi, TDS)
5. Ecart acceptable : <= 5% ou <= 100 MUR pour les petits montants
6. Le nom du tiers en banque peut etre tronque ou avoir des variations
7. Un DEBIT bancaire = sortie d'argent = paiement fournisseur (facture type 'fournisseur')
8. Un CREDIT bancaire = entree d'argent = encaissement client (facture type 'client')

Reponds STRICTEMENT en JSON :
{
  "matches": [
    {
      "transaction_libelle": "...",
      "transaction_montant": 12345,
      "transaction_date": "2025-01-15",
      "facture_ids": ["uuid1", "uuid2"],
      "confidence": 0.85,
      "type": "facture_unique" | "facture_groupee" | "partiel",
      "reasoning": "Paiement de 3 factures MARITIME du meme fournisseur, delai moyen 35 jours (echues)",
      "within_terms": true,
      "needs_arbitration": false
    }
  ],
  "orphans": [
    { "transaction_libelle": "...", "reason": "Aucune facture trouvee — possiblement frais ou salaire" }
  ]
}`

        const userPrompt = `Factures non payees (${unpaidForAI.length}):
${JSON.stringify(unpaidForAI, null, 2)}

Transactions bancaires a analyser (${txsToAnalyze.length}):
${JSON.stringify(txsToAnalyze.map(t => ({
  libelle: t.libelle,
  tiers: t.tiers_detecte || t.tiers,
  debit: t.debit,
  credit: t.credit,
  date: t.date,
})), null, 2)}

Trouve les meilleurs matches pour CHAQUE transaction. Privilegie les matches sur :
1. Meme tiers + montant exact
2. Meme tiers + somme de plusieurs factures = montant
3. Tolerance de delai jusqu'a 90 jours apres la date de facture`

        claudeAnalysis = await callClaudeJSON<{ matches: any[]; orphans: any[] }>(systemPrompt, userPrompt, 6000)

        // Merge Claude suggestions into proposals
        if (claudeAnalysis?.matches) {
          for (const aiMatch of claudeAnalysis.matches) {
            // Find the corresponding transaction in unmatchedTxs
            const tx = unmatchedTxs.find(u => u.tx.libelle === aiMatch.transaction_libelle)
            if (!tx) continue
            // Check if we already have a proposal for this tx
            const existingIdx = proposals.findIndex(p => p.releve_id === tx.releve_id && p.transaction_idx === tx.idx)
            const newProposal: MatchProposal = {
              transaction_idx: tx.idx,
              releve_id: tx.releve_id,
              transaction: tx.tx,
              match_type: aiMatch.type || 'facture_unique',
              facture_ids: aiMatch.facture_ids || [],
              confidence: aiMatch.confidence || 0.7,
              reasoning: `[Claude AI] ${aiMatch.reasoning}`,
              delay_days: 0,
              within_terms: aiMatch.within_terms !== false,
              needs_arbitration: aiMatch.needs_arbitration === true || (aiMatch.confidence || 0) < 0.75,
            }
            if (existingIdx >= 0) {
              // Replace if Claude is more confident
              if (newProposal.confidence > proposals[existingIdx].confidence) {
                proposals[existingIdx] = newProposal
              }
            } else {
              proposals.push(newProposal)
            }
          }
        }
      } catch (e: any) {
        console.warn('[rapprochement/smart] Claude AI failed:', e.message)
      }
    }

    // 6. Apply matches if requested
    let applied = 0
    if (apply) {
      const auto = proposals.filter(p => !p.needs_arbitration && p.confidence >= 0.85)
      for (const prop of auto) {
        // Find the releve and update the transaction
        const { data: releve } = await supabase.from('releves_bancaires').select('transactions_json').eq('id', prop.releve_id).single()
        if (!releve?.transactions_json) continue
        const txs = [...releve.transactions_json]
        txs[prop.transaction_idx] = {
          ...txs[prop.transaction_idx],
          facture_ids: prop.facture_ids,
          facture_id: prop.facture_ids[0],
          lettre: `AI${String(applied + 1).padStart(3, '0')}`,
          statut: 'rapproche',
          matched_type: prop.match_type,
          match_confidence: 'auto_ai',
          note: prop.reasoning,
        }
        await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', prop.releve_id)

        // Mark factures as paye
        for (const fid of prop.facture_ids) {
          await supabase.from('factures').update({ statut: 'paye' }).eq('id', fid)
        }
        applied++
      }
    }

    const stats = {
      total: unmatchedTxs.length,
      proposed: proposals.length,
      auto_apply: proposals.filter(p => !p.needs_arbitration && p.confidence >= 0.85).length,
      needs_arbitration: proposals.filter(p => p.needs_arbitration).length,
      orphans: unmatchedTxs.length - proposals.length,
      applied,
    }

    return NextResponse.json({
      proposals,
      stats,
      claude_used: claudeAnalysis !== null,
    })
  } catch (e: unknown) {
    console.error('[rapprochement/smart] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
