# Full File Contents - Rapprochement System

## FILE 1: app/api/comptable/rapprochement/smart/route.ts

```typescript
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
```

---

## FILE 2: app/api/comptable/rapprochement/smart/apply/route.ts

```typescript
import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createEcrituresForPayment } from '@/lib/accounting/ecritures-factures'

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
 * POST /api/comptable/rapprochement/smart/apply
 *
 * Apply smart-engine proposals in batch, optionally filtered by min_confidence.
 */
export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const {
      societe_id,
      proposals,
      min_confidence = 0.85,
    } = body

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!Array.isArray(proposals) || proposals.length === 0) {
      return NextResponse.json({ error: 'proposals requis (array non vide)' }, { status: 400 })
    }

    const minConf = Number(min_confidence) || 0.85

    // Filter proposals above confidence threshold
    const toApply = proposals.filter(p => (Number(p.confidence) || 0) >= minConf)
    const skippedLowConf = proposals.length - toApply.length

    let applied = 0
    let skipped = skippedLowConf
    const errors: Array<{ releve_id: string; transaction_idx: number; error: string }> = []

    // Pre-load all releves
    const { data: relevesRaw } = await supabase
      .from('releves_bancaires')
      .select('id, transactions_json, societe_id')
      .eq('societe_id', societe_id)

    const releveMap = new Map<string, any>()
    for (const r of relevesRaw || []) {
      releveMap.set(r.id, { ...r, updatedTxs: [...(r.transactions_json || [])] })
    }

    // Track factures used in this batch
    const usedFactureIds = new Set<string>()

    for (const proposal of toApply) {
      const { releve_id, transaction_idx, facture_ids, reasoning, confidence } = proposal

      if (!releve_id || transaction_idx === undefined || !Array.isArray(facture_ids) || facture_ids.length === 0) {
        errors.push({ releve_id, transaction_idx, error: 'Parametres manquants' })
        skipped++
        continue
      }

      // VERIFICATION 1: Transaction exists and not already reconciled
      const releve = releveMap.get(releve_id)
      if (!releve) {
        errors.push({ releve_id, transaction_idx, error: 'Releve non trouve' })
        skipped++
        continue
      }
      const tx = releve.updatedTxs[transaction_idx]
      if (!tx) {
        errors.push({ releve_id, transaction_idx, error: 'Transaction non trouvee' })
        skipped++
        continue
      }
      if (tx.statut === 'rapproche' || tx.lettre) {
        errors.push({ releve_id, transaction_idx, error: 'Transaction deja rapprochee' })
        skipped++
        continue
      }

      // VERIFICATION 2: Check for in-batch duplicate facture usage
      const alreadyUsed = facture_ids.filter(fid => usedFactureIds.has(fid))
      if (alreadyUsed.length > 0) {
        errors.push({ releve_id, transaction_idx, error: `Factures deja utilisees dans ce batch: ${alreadyUsed.join(', ')}` })
        skipped++
        continue
      }

      // VERIFICATION 3: Fetch and validate factures
      const { data: factures } = await supabase.from('factures')
        .select('id, numero_facture, tiers, montant_ttc, montant_mur, devise, type_facture, statut, rapproche_releve_id')
        .in('id', facture_ids)

      if (!factures || factures.length !== facture_ids.length) {
        errors.push({ releve_id, transaction_idx, error: `Factures manquantes: demande ${facture_ids.length}, trouve ${factures?.length || 0}` })
        skipped++
        continue
      }

      const alreadyReconciled = factures.filter((f: any) => f.rapproche_releve_id || f.statut === 'paye')
      if (alreadyReconciled.length > 0) {
        errors.push({ releve_id, transaction_idx, error: `Factures deja rapprochees: ${alreadyReconciled.map((f: any) => f.numero_facture).join(', ')}` })
        skipped++
        continue
      }

      // VERIFICATION 4: Amount tolerance (5%)
      const txAmount = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
      const sumFactures = factures.reduce((s: number, f: any) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0), 0)
      if (sumFactures > 0 && Math.abs(txAmount - sumFactures) / sumFactures > 0.05) {
        errors.push({
          releve_id,
          transaction_idx,
          error: `Ecart trop important: tx ${txAmount.toFixed(2)} vs factures ${sumFactures.toFixed(2)} (${((Math.abs(txAmount - sumFactures) / sumFactures) * 100).toFixed(1)}%)`,
        })
        skipped++
        continue
      }

      // VERIFICATION 5: Direction check (debit=supplier, credit=client)
      const isOutgoing = (Number(tx.debit) || 0) > 0
      const expectedType = isOutgoing ? 'fournisseur' : 'client'
      const wrongType = factures.find((f: any) => f.type_facture !== expectedType)
      if (wrongType) {
        errors.push({
          releve_id,
          transaction_idx,
          error: `Direction incorrecte: tx ${isOutgoing ? 'sortie' : 'entree'} mais facture ${wrongType.numero_facture} est ${wrongType.type_facture}`,
        })
        skipped++
        continue
      }

      // ALL CHECKS PASSED — apply the match
      const lettre = `SM${Date.now().toString().slice(-6)}`
      const reconcileDate = new Date().toISOString()

      // Update transaction
      releve.updatedTxs[transaction_idx] = {
        ...tx,
        facture_ids,
        facture_id: facture_ids[0],
        lettre,
        statut: 'rapproche',
        matched_type: facture_ids.length > 1 ? 'facture_groupee' : 'facture_unique',
        match_confidence: `smart_${Math.round((Number(confidence) || 0) * 100)}`,
        note: reasoning || '',
        rapproche_at: reconcileDate,
      }

      // Update factures
      for (const fid of facture_ids) {
        await supabase.from('factures').update({
          statut: 'paye',
          rapproche_releve_id: releve_id,
          rapproche_transaction_idx: transaction_idx,
          rapproche_date: reconcileDate,
          rapproche_source: 'smart',
        }).eq('id', fid)
        usedFactureIds.add(fid)
      }

      // Generate BNQ journal entries
      const payType: 'supplier' | 'client' = isOutgoing ? 'supplier' : 'client'
      const tiers = (factures[0]?.tiers || tx.tiers_detecte || tx.tiers || '').substring(0, 50)
      const datePayment = tx.date || new Date().toISOString().split('T')[0]
      const numFactures = factures.length > 1
        ? `${factures.length} factures`
        : (factures[0]?.numero_facture || '')

      await createEcrituresForPayment(supabase, {
        societe_id,
        date_payment: datePayment,
        amount_mur: Math.round(txAmount * 100) / 100,
        type: payType,
        tiers,
        ref_folio: `BANK-${releve_id}-${transaction_idx}`,
        description: `Paiement ${numFactures} — ${tiers}`,
      })

      applied++
    }

    // Persist all releve changes
    for (const [rid, releve] of releveMap) {
      const original = (relevesRaw || []).find(r => r.id === rid)
      if (!original) continue
      if (JSON.stringify(releve.updatedTxs) !== JSON.stringify(original.transactions_json)) {
        await supabase.from('releves_bancaires')
          .update({ transactions_json: releve.updatedTxs })
          .eq('id', rid)
      }
    }

    // Consistency check (non-blocking)
    let consistencyStats: any = null
    try {
      const { data: factures } = await supabase.from('factures')
        .select('id, statut, rapproche_releve_id')
        .eq('societe_id', societe_id)
      const { data: releves } = await supabase.from('releves_bancaires')
        .select('transactions_json').eq('societe_id', societe_id)
      const claimedIds = new Set<string>()
      for (const r of releves || []) {
        for (const tx of r.transactions_json || []) {
          const ids: string[] = tx.facture_ids || (tx.facture_id ? [tx.facture_id] : [])
          ids.forEach(id => claimedIds.add(id))
        }
      }
      const payeCount = (factures || []).filter(f => f.statut === 'paye').length
      const orphans = (factures || []).filter(f => f.statut === 'paye' && !f.rapproche_releve_id && !claimedIds.has(f.id)).length
      consistencyStats = { total_factures: factures?.length || 0, paye: payeCount, orphans }
    } catch { }

    return NextResponse.json({
      applied,
      skipped,
      errors,
      stats: {
        total_proposals: proposals.length,
        above_threshold: toApply.length,
        applied,
        skipped_low_confidence: skippedLowConf,
        skipped_validation_errors: skipped - skippedLowConf,
        consistency: consistencyStats,
      },
    })
  } catch (e: any) {
    console.error('[smart/apply] error:', e.message)
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
```

---

## FILE 3: lib/accounting/matching-engine.ts (Complete)

[See separate CODEBASE_EXPLORATION_COMPLETE.md for full contents - file is 454 lines]

Key exports:
- `normalize(s: string): string`
- `tiersScore(a: string, b: string): number`
- `toMUR(amount: number, devise: string, rates?: Record<string, number>): number`
- `findBestMatch(tx, candidateFactures, rates?, patterns?): MatchProposal | null`
- `analyzeAllTransactions(transactions, factures, rates?, patterns?): MatchProposal[]`

---

## FILE 4: lib/taux-change.ts

```typescript
import { createClient } from '@supabase/supabase-js'

const FALLBACK_RATES: Record<string, number> = {
  EUR: 46.50,
  GBP: 54.20,
  USD: 44.80,
  MUR: 1,
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function getTauxChangeFromDB(): Promise<Record<string, number>> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('taux_change')
      .select('devise, taux, date_taux')
      .order('date_taux', { ascending: false })
      .limit(10)

    if (error || !data || data.length === 0) {
      return { ...FALLBACK_RATES }
    }

    const rates: Record<string, number> = { MUR: 1 }
    const seen = new Set<string>()
    for (const row of data) {
      if (!seen.has(row.devise)) {
        rates[row.devise] = Number(row.taux)
        seen.add(row.devise)
      }
    }

    for (const [devise, fallback] of Object.entries(FALLBACK_RATES)) {
      if (!(devise in rates)) rates[devise] = fallback
    }

    return rates
  } catch {
    return { ...FALLBACK_RATES }
  }
}

export async function fetchAndStoreRates(): Promise<{ success: boolean; rates: Record<string, number>; error?: string }> {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY
  if (!apiKey) {
    return { success: false, rates: FALLBACK_RATES, error: 'EXCHANGE_RATE_API_KEY not configured' }
  }

  try {
    const response = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/MUR`, {
      next: { revalidate: 0 },
    })

    if (!response.ok) {
      return { success: false, rates: FALLBACK_RATES, error: `API returned ${response.status}` }
    }

    const data = await response.json()

    if (data.result !== 'success' || !data.conversion_rates) {
      return { success: false, rates: FALLBACK_RATES, error: data['error-type'] || 'Invalid API response' }
    }

    const apiRates = data.conversion_rates as Record<string, number>
    const currencies = ['EUR', 'GBP', 'USD']
    const rates: Record<string, number> = { MUR: 1 }

    for (const devise of currencies) {
      if (apiRates[devise] && apiRates[devise] > 0) {
        rates[devise] = Math.round((1 / apiRates[devise]) * 10000) / 10000
      } else {
        rates[devise] = FALLBACK_RATES[devise] || 1
      }
    }

    const supabase = getSupabase()
    const today = new Date().toISOString().split('T')[0]

    for (const [devise, taux] of Object.entries(rates)) {
      if (devise === 'MUR') continue
      await supabase
        .from('taux_change')
        .upsert(
          { devise, taux, date_taux: today, source: 'exchangerate-api' },
          { onConflict: 'devise,date_taux' }
        )
    }

    return { success: true, rates }
  } catch (e) {
    return { success: false, rates: FALLBACK_RATES, error: e instanceof Error ? e.message : 'Fetch failed' }
  }
}

export async function getTauxChange(): Promise<Record<string, number>> {
  return getTauxChangeFromDB()
}

export function convertToMUR(amount: number, devise: string, rates: Record<string, number>): number {
  const taux = rates[devise] || 1
  return amount * taux
}
```

---

## DATABASE SCHEMA SUMMARY

### releves_bancaires Table
- `id` UUID (PK)
- `compte_bancaire_id` UUID (FK)
- `societe_id` UUID (FK)
- `periode` TEXT
- `date_debut`, `date_fin` DATE
- `solde_ouverture`, `solde_cloture` NUMERIC(15,2)
- **`transactions_json` JSONB** - Array of transaction objects
- `statut_rapprochement` TEXT

### Transaction Object (in transactions_json)
```json
{
  "date": "2025-06-15",
  "libelle": "TRANSFER - ACME CORP",
  "debit": "5000.00",
  "credit": "0.00",
  "tiers_detecte": "ACME CORP",
  "devise": "MUR",
  "statut": "rapproche|interne|propose|...",
  "matched_type": "facture_unique|facture_groupee|...",
  "lettre": "R001",
  "facture_id": "uuid",
  "facture_ids": ["uuid1", "uuid2"],
  "match_confidence": "smart_95",
  "note": "Reference found...",
  "rapproche_at": "2025-06-20T10:30:00Z"
}
```

### factures Table (Key Cols)
- `id` UUID
- `numero_facture` TEXT
- `tiers` TEXT
- `montant_ttc`, `montant_mur` NUMERIC
- `devise` TEXT
- `statut` TEXT (en_attente|retard|partiel|paye)
- `rapproche_releve_id` UUID
- `rapproche_transaction_idx` INTEGER
- `rapproche_date` TIMESTAMPTZ
- `rapproche_source` TEXT (auto|ai|manual|smart)

