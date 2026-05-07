import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createEcrituresForPayment } from '@/lib/accounting/ecritures-factures'
import { runLettrage } from '@/lib/accounting/lettrage'
import { getTauxForDate } from '@/lib/taux-change'

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
 * Handles both heuristic proposals (with facture_ids) and rule-based pre-classified
 * proposals (pre_classified: true, facture_ids: []).
 *
 * Body:
 *   societe_id: string
 *   proposals: Array<{
 *     releve_id: string
 *     transaction_idx: number
 *     facture_ids: string[]
 *     confidence: number
 *     reasoning: string
 *     pre_classified?: boolean
 *     match_type?: string
 *     rule_statut?: string
 *   }>
 *   min_confidence?: number  (default 0.85)
 *
 * Returns:
 *   { applied, skipped, errors[], stats }
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

    // Pre-load all releves for this societe to avoid N+1 queries
    const { data: relevesRaw } = await supabase
      .from('releves_bancaires')
      .select('id, transactions_json, societe_id, compte_bancaire_id')
      .eq('societe_id', societe_id)

    const releveMap = new Map<string, any>()
    for (const r of relevesRaw || []) {
      releveMap.set(r.id, { ...r, updatedTxs: [...(r.transactions_json || [])] })
    }

    // Map compte_bancaire_id → compte_comptable (512xxx) pour router la
    // 2e ligne BNQ vers le bon sous-compte de banque (au lieu du 512 global).
    const { data: comptesBcRaw } = await supabase
      .from('comptes_bancaires')
      .select('id, compte_comptable')
      .eq('societe_id', societe_id)
    const cbToCompteComptable: Record<string, string> = {}
    for (const c of comptesBcRaw || []) {
      if (c.compte_comptable) cbToCompteComptable[c.id] = String(c.compte_comptable)
    }

    // Track factures that have been matched in this batch (avoid double-applying)
    const usedFactureIds = new Set<string>()

    for (const proposal of toApply) {
      const { releve_id, transaction_idx, facture_ids, reasoning, confidence, pre_classified, match_type, rule_statut } = proposal

      if (!releve_id || transaction_idx === undefined) {
        errors.push({ releve_id, transaction_idx, error: 'Parametres manquants' })
        skipped++
        continue
      }

      // VERIFICATION 1: Transaction exists and is not already reconciled
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
      if (tx.statut === 'rapproche' || tx.statut === 'interne' || tx.lettre) {
        errors.push({ releve_id, transaction_idx, error: 'Transaction deja rapprochee' })
        skipped++
        continue
      }

      const reconcileDate = new Date().toISOString()
      const lettre = `SM${Date.now().toString().slice(-6)}`

      // ── PRE-CLASSIFIED PROPOSALS (rules A–F, no facture) ─────────────────
      if (pre_classified || (Array.isArray(facture_ids) && facture_ids.length === 0 && match_type)) {
        const effectiveStatut = rule_statut || (match_type === 'transfert_interne' ? 'interne' : 'rapproche')

        releve.updatedTxs[transaction_idx] = {
          ...tx,
          statut: effectiveStatut,
          matched_type: match_type || 'pre_classified',
          match_confidence: `rule_${Math.round((Number(confidence) || 0) * 100)}`,
          note: reasoning || '',
          rapproche_at: reconcileDate,
        }

        // For MRA payments: try to find and letter the accounting entry
        if (match_type === 'paiement_mra') {
          try {
            const txDebit = Number(tx.debit) || 0
            const { data: mraEcritures } = await supabase
              .from('ecritures_comptables_v2')
              .select('id, numero_compte, debit_mur, credit_mur')
              .eq('societe_id', societe_id)
              .is('lettre', null)
              .or('numero_compte.like.444%,numero_compte.like.431%,numero_compte.like.432%,numero_compte.like.4457%')

            const mraMatch = (mraEcritures || []).find((e: any) => {
              const eAmt = Number(e.credit_mur) || Number(e.debit_mur) || 0
              return eAmt > 0 && txDebit > 0 && Math.abs(txDebit - eAmt) / eAmt < 0.10
            })

            if (mraMatch) {
              await supabase
                .from('ecritures_comptables_v2')
                .update({ lettre: `MRA${transaction_idx}`, date_lettrage: new Date().toISOString().split('T')[0] })
                .eq('id', mraMatch.id)
              releve.updatedTxs[transaction_idx].ecriture_id = mraMatch.id
            }
          } catch { /* non-blocking */ }
        }

        // For individual salary: mark bulletin as paid
        if (match_type === 'salaire_individuel' && proposal.employe_id) {
          try {
            const txMonth = (tx.date || '').substring(0, 7)
            if (txMonth) {
              await supabase
                .from('bulletins_paie')
                .update({ statut: 'paye', date_paiement: tx.date || reconcileDate.split('T')[0] })
                .eq('societe_id', societe_id)
                .eq('employe_id', proposal.employe_id)
                .like('periode', `${txMonth}%`)
                .eq('statut', 'valide')
            }
          } catch { /* non-blocking */ }
        }

        applied++
        continue
      }

      // ── HEURISTIC PROPOSALS (with facture_ids) ────────────────────────────

      if (!Array.isArray(facture_ids) || facture_ids.length === 0) {
        errors.push({ releve_id, transaction_idx, error: 'Parametres manquants' })
        skipped++
        continue
      }

      // VERIFICATION 2: Check for in-batch duplicate facture usage
      const alreadyUsed = facture_ids.filter((fid: string) => usedFactureIds.has(fid))
      if (alreadyUsed.length > 0) {
        errors.push({ releve_id, transaction_idx, error: `Factures deja utilisees dans ce batch: ${alreadyUsed.join(', ')}` })
        skipped++
        continue
      }

      // VERIFICATION 3: Fetch factures and validate
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

      // VERIFICATION 4: Amount tolerance (8% — covers TDS + bank fees)
      const txRaw = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
      const txDev = (tx.devise || 'MUR').toUpperCase()
      const datePayment = tx.date || new Date().toISOString().split('T')[0]
      const txAmount = txDev !== 'MUR'
        ? txRaw * (await getTauxForDate(txDev, datePayment))
        : txRaw
      const sumFactures = factures.reduce((s: number, f: any) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0), 0)
      if (sumFactures > 0 && Math.abs(txAmount - sumFactures) / sumFactures > 0.08) {
        errors.push({
          releve_id,
          transaction_idx,
          error: `Ecart trop important: tx ${txAmount.toFixed(2)} MUR vs factures ${sumFactures.toFixed(2)} MUR (${((Math.abs(txAmount - sumFactures) / sumFactures) * 100).toFixed(1)}%)`,
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
      // Update transaction in the cached releve (will save at end)
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

      // Generate BNQ journal entries (only for facture-based proposals)
      const payType: 'supplier' | 'client' = isOutgoing ? 'supplier' : 'client'
      const tiers = (factures[0]?.tiers || tx.tiers_detecte || tx.tiers || '').substring(0, 50)
      const numFactures = factures.length > 1
        ? `${factures.length} factures`
        : (factures[0]?.numero_facture || '')

      // FIX lettrage : passer facture_id (single-facture) + compte_banque +
      // lettre_code pour que les BNQ soient lettrées dès la création et
      // qu'elles partagent le facture_id avec la VTE/ACH initiale.
      const compteBanque =
        cbToCompteComptable[releve.compte_bancaire_id || ''] || undefined
      await createEcrituresForPayment(supabase, {
        societe_id,
        date_payment: datePayment,
        amount_mur: Math.round(txAmount * 100) / 100,  // already converted to MUR
        type: payType,
        tiers,
        ref_folio: `BANK-${releve_id}-${transaction_idx}`,
        description: `Paiement ${numFactures} — ${tiers}${txDev !== 'MUR' ? ` [${txRaw.toFixed(2)} ${txDev}]` : ''}`,
        facture_id: facture_ids.length === 1 ? facture_ids[0] : null,
        compte_banque: compteBanque,
        lettre_code: lettre,
      })

      // Lettre aussi la facture initiale (VTE/ACH) sur 411x/401x si elle
      // n'est pas déjà lettrée — sinon Lex Livre devra le faire après coup.
      if (facture_ids.length === 1) {
        await supabase
          .from('ecritures_comptables_v2')
          .update({ lettre, date_lettrage: reconcileDate })
          .eq('societe_id', societe_id)
          .eq('facture_id', facture_ids[0])
          .or('numero_compte.like.411%,numero_compte.like.401%')
          .is('lettre', null)
      }

      applied++
    }

    // Persist all releve changes (batch save)
    for (const [rid, releve] of releveMap) {
      const original = (relevesRaw || []).find(r => r.id === rid)
      if (!original) continue
      // Only save if there were changes
      if (JSON.stringify(releve.updatedTxs) !== JSON.stringify(original.transactions_json)) {
        await supabase.from('releves_bancaires')
          .update({ transactions_json: releve.updatedTxs })
          .eq('id', rid)
      }
    }

    // ── Auto-lettrage : finalise les écritures 411x/401x non lettrées ──
    // Garantit que toute facture rapprochée par Lex Banque ressort avec
    // ses paiements lettrés, sans nécessiter une exécution manuelle de
    // Lex Livre. Idempotent (skip silencieux si tout est déjà lettré).
    let lettrageStats: any = null
    if (applied > 0) {
      try {
        lettrageStats = await runLettrage(supabase, societe_id)
      } catch (e: any) {
        console.warn('[smart/apply] auto-lettrage failed:', e?.message)
      }
    }

    // Consistency check stats (lightweight — no auto-fix)
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
    } catch { /* non-blocking */ }

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
        lettrage: lettrageStats,
      },
    })
  } catch (e: any) {
    console.error('[smart/apply] error:', e.message)
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
