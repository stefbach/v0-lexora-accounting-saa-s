import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { normalize, tiersScore } from '@/lib/accounting/matching-engine'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ─── GET: list all patterns for a société ───────────────────────────
export async function GET(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const { data: patterns, error } = await supabase
      .from('rapprochement_patterns')
      .select('*')
      .eq('societe_id', societe_id)
      .order('nb_utilisations', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ patterns: patterns || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ─── POST: learn | delete | apply ───────────────────────────────────
export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    // ── action: learn ──
    if (action === 'learn') {
      const {
        societe_id,
        tiers_banque,
        libelle_pattern,
        montant_min,
        montant_max,
        type_cible,
        cible_tiers,
        cible_compte,
        source = 'manual',
        confidence_cumul,
      } = body

      if (!societe_id || !tiers_banque || !type_cible) {
        return NextResponse.json({ error: 'societe_id, tiers_banque, type_cible requis' }, { status: 400 })
      }

      const normalizedTiers = normalize(tiers_banque)

      // Check if a similar pattern already exists (upsert by tiers_banque + societe_id)
      const { data: existing } = await supabase
        .from('rapprochement_patterns')
        .select('id, nb_utilisations, confidence_cumul')
        .eq('societe_id', societe_id)
        .eq('tiers_banque', normalizedTiers)
        .maybeSingle()

      if (existing) {
        // Update existing pattern — increment usage, update confidence
        const newConfidence = confidence_cumul
          ? (existing.confidence_cumul + confidence_cumul) / 2
          : existing.confidence_cumul

        const { data: updated, error } = await supabase
          .from('rapprochement_patterns')
          .update({
            nb_utilisations: existing.nb_utilisations + 1,
            derniere_utilisation: new Date().toISOString(),
            confidence_cumul: Math.min(0.99, newConfidence),
            libelle_pattern: libelle_pattern ?? undefined,
            montant_min: montant_min ?? undefined,
            montant_max: montant_max ?? undefined,
            cible_tiers: cible_tiers ?? undefined,
            cible_compte: cible_compte ?? undefined,
          })
          .eq('id', existing.id)
          .select()
          .single()

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ pattern: updated, updated: true })
      }

      // Create new pattern
      const { data: created, error } = await supabase
        .from('rapprochement_patterns')
        .insert({
          societe_id,
          tiers_banque: normalizedTiers,
          libelle_pattern: libelle_pattern || null,
          montant_min: montant_min ?? null,
          montant_max: montant_max ?? null,
          type_cible,
          cible_tiers: cible_tiers || null,
          cible_compte: cible_compte || null,
          confidence_cumul: confidence_cumul || 0.8,
          source,
          created_by: user.id,
        })
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ pattern: created, created: true })
    }

    // ── action: delete ──
    if (action === 'delete') {
      const { pattern_id } = body
      if (!pattern_id) return NextResponse.json({ error: 'pattern_id requis' }, { status: 400 })

      const { error } = await supabase
        .from('rapprochement_patterns')
        .delete()
        .eq('id', pattern_id)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ deleted: true })
    }

    // ── action: apply — apply all patterns to unmatched transactions ──
    if (action === 'apply') {
      const { societe_id } = body
      if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

      // Load patterns
      const { data: patterns } = await supabase
        .from('rapprochement_patterns')
        .select('*')
        .eq('societe_id', societe_id)
        .order('nb_utilisations', { ascending: false })

      if (!patterns || patterns.length === 0) {
        return NextResponse.json({ matched: 0, details: [], message: 'Aucun pattern mémorisé' })
      }

      // Load unmatched transactions
      const { data: releves } = await supabase
        .from('releves_bancaires')
        .select('id, transactions_json')
        .eq('societe_id', societe_id)

      // Load unpaid invoices
      const { data: factures } = await supabase
        .from('factures')
        .select('id, numero_facture, tiers, type_facture, montant_ttc, montant_mur, devise, statut')
        .eq('societe_id', societe_id)
        .in('statut', ['en_attente', 'retard', 'partiel'])

      const details: any[] = []
      let matched = 0

      for (const releve of releves || []) {
        const txs: any[] = [...(releve.transactions_json || [])]
        let updated = false

        for (let idx = 0; idx < txs.length; idx++) {
          const tx = txs[idx]
          if (tx.statut === 'rapproche' || tx.lettre) continue

          const txAmt = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
          if (txAmt === 0) continue

          const txTiersNorm = normalize(tx.tiers_detecte || tx.tiers || tx.libelle || '')

          // Find best matching pattern
          let bestPattern: typeof patterns[0] | null = null
          let bestScore = 0

          for (const pattern of patterns) {
            const score = tiersScore(txTiersNorm, pattern.tiers_banque)
            if (score < 0.7) continue

            // Check libelle_pattern if set
            if (pattern.libelle_pattern) {
              const libLower = (tx.libelle || '').toLowerCase()
              if (!libLower.includes(pattern.libelle_pattern.toLowerCase())) continue
            }

            // Check amount range if set
            if (pattern.montant_min !== null && txAmt < Number(pattern.montant_min)) continue
            if (pattern.montant_max !== null && txAmt > Number(pattern.montant_max)) continue

            if (score > bestScore) {
              bestScore = score
              bestPattern = pattern
            }
          }

          if (!bestPattern) continue

          // Find matching invoice from cible_tiers
          const isOutgoing = (Number(tx.debit) || 0) > 0
          const expectedType = isOutgoing ? 'fournisseur' : 'client'

          type FactureItem = { id: string; numero_facture: any; tiers: any; type_facture: any; montant_ttc: any; montant_mur: any; devise: any; statut: any }
          let matchedFacture: FactureItem | undefined

          if (bestPattern.cible_tiers) {
            matchedFacture = (factures || []).find(f => {
              if (f.type_facture !== expectedType) return false
              const score = tiersScore(normalize(f.tiers || ''), normalize(bestPattern!.cible_tiers!))
              if (score < 0.6) return false
              const fAmt = Number(f.montant_mur) || Number(f.montant_ttc) || 0
              if (fAmt === 0) return false
              const diff = Math.abs(txAmt - fAmt) / fAmt
              return diff <= 0.05
            })
          }

          if (!matchedFacture && bestPattern.type_cible !== 'frais_bancaires' && bestPattern.type_cible !== 'salaire') {
            // No matching invoice found — skip
            continue
          }

          // Apply the pattern match
          const confidence = Math.min(0.99, Number(bestPattern.confidence_cumul) + 0.01 * Math.min(Number(bestPattern.nb_utilisations), 10))
          const lettre = `PAT${Date.now().toString().slice(-6)}`
          const reconcileDate = new Date().toISOString()

          const facture_ids = matchedFacture ? [matchedFacture.id] : []
          txs[idx] = {
            ...tx,
            facture_ids: facture_ids.length ? facture_ids : undefined,
            facture_id: facture_ids.length ? facture_ids[0] : undefined,
            lettre,
            statut: 'rapproche',
            matched_type: bestPattern.type_cible,
            match_confidence: `pattern_${Math.round(confidence * 100)}`,
            note: `Pattern mémorisé: ${bestPattern.tiers_banque}`,
            rapproche_at: reconcileDate,
          }
          updated = true
          matched++

          details.push({
            releve_id: releve.id,
            transaction_idx: idx,
            tiers_banque: bestPattern.tiers_banque,
            pattern_id: bestPattern.id,
            facture_id: matchedFacture?.id || null,
            confidence,
          })

          // Mark invoice as paid if found
          if (matchedFacture) {
            await supabase.from('factures').update({
              statut: 'paye',
              rapproche_releve_id: releve.id,
              rapproche_transaction_idx: idx,
              rapproche_date: reconcileDate,
              rapproche_source: 'pattern',
            }).eq('id', matchedFacture.id)

            // Update pattern usage stats
            await supabase.from('rapprochement_patterns')
              .update({
                nb_utilisations: bestPattern.nb_utilisations + 1,
                derniere_utilisation: reconcileDate,
              })
              .eq('id', bestPattern.id)
          }
        }

        if (updated) {
          await supabase
            .from('releves_bancaires')
            .update({ transactions_json: txs })
            .eq('id', releve.id)
        }
      }

      return NextResponse.json({ matched, details })
    }

    return NextResponse.json({ error: `Action inconnue: ${action}` }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
