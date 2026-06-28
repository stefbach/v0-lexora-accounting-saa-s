/**
 * GET /api/mcp/transactions-bancaires
 *
 * Retourne les TRANSACTIONS bancaires (mouvements à plat) d'une société.
 * Aplatit le contenu de `releves_bancaires.transactions_json` ET de la table
 * `transactions_bancaires` (si peuplée) en une seule liste unifiée.
 *
 * Cas d'usage MCP : "Donne-moi les mouvements bancaires de DDS pour mai 2026
 * supérieurs à 100k MUR" → Claude appelle ce endpoint, pas list_releves_bancaires
 * qui retourne un payload nested compliqué.
 *
 * Query params :
 *   societe_id        (requis)
 *   compte_id         (optionnel — UUID du compte bancaire)
 *   periode           (optionnel — YYYY-MM, alternative à date_debut/date_fin)
 *   date_debut        (optionnel — YYYY-MM-DD)
 *   date_fin          (optionnel — YYYY-MM-DD)
 *   statut            (optionnel — 'rapproche' | 'non_identifie' | 'a_verifier' | 'propose' | 'tous')
 *   min_montant       (optionnel — filtre |max(debit, credit)| >=)
 *   max_montant       (optionnel — filtre |max(debit, credit)| <=)
 *   libelle           (optionnel — ilike sur libellé)
 *   limit             (optionnel — défaut 200, max 1000)
 *
 * Réponse : { transactions: [...], total, releves_count, comptes }
 *
 * Auth : resolveUserAuth (session OU X-Lexora-Api-Key) + assertSocieteAccess.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const MAX_LIMIT = 300
const DEFAULT_LIMIT = 100

export async function GET(request: Request) {
  try {
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    await assertSocieteAccess(supabase, user.id, societe_id)

    const compte_id = searchParams.get('compte_id')
    const periode = searchParams.get('periode') // YYYY-MM
    let date_debut = searchParams.get('date_debut')
    let date_fin = searchParams.get('date_fin')
    const statut = searchParams.get('statut') || 'tous'
    const minMontant = Number(searchParams.get('min_montant')) || 0
    const maxMontant = Number(searchParams.get('max_montant')) || Infinity
    const libelleFilter = (searchParams.get('libelle') || '').toLowerCase().trim()
    const limit = Math.min(Number(searchParams.get('limit')) || DEFAULT_LIMIT, MAX_LIMIT)
    // Réponse compacte par défaut (évite « result too large » côté MCP) ; les
    // champs détaillés de rapprochement ne sont inclus que sur verbose=true.
    const verbose = searchParams.get('verbose') === 'true'

    if (periode && /^\d{4}-\d{2}$/.test(periode)) {
      date_debut = `${periode}-01`
      const [y, m] = periode.split('-').map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      date_fin = `${periode}-${String(lastDay).padStart(2, '0')}`
    }

    // 1. Comptes bancaires (pour enrichir le libellé)
    const { data: comptes } = await supabase
      .from('comptes_bancaires')
      .select('id, banque, devise, numero_compte, compte_comptable')
      .eq('societe_id', societe_id)
    const compteMap = new Map((comptes || []).map(c => [c.id, c]))

    // 2. Relevés bancaires actifs
    let relevesQuery = supabase
      .from('releves_bancaires')
      .select('id, compte_bancaire_id, periode, date_debut, date_fin, transactions_json')
      .eq('societe_id', societe_id)
      .is('superseded_by_id', null)
    if (compte_id) relevesQuery = relevesQuery.eq('compte_bancaire_id', compte_id)
    if (date_debut) relevesQuery = relevesQuery.gte('date_fin', date_debut)
    if (date_fin) relevesQuery = relevesQuery.lte('date_debut', date_fin)
    const { data: releves, error: relErr } = await relevesQuery
    if (relErr) return NextResponse.json({ error: relErr.message }, { status: 500 })

    // 3. Aplatir transactions_json
    const transactions: any[] = []
    for (const r of releves || []) {
      const cb = compteMap.get(r.compte_bancaire_id)
      const txs = Array.isArray(r.transactions_json) ? r.transactions_json : []
      for (const [idx, tx] of txs.entries()) {
        if (date_debut && tx.date && tx.date < date_debut) continue
        if (date_fin && tx.date && tx.date > date_fin) continue
        const debit = Number(tx.debit) || 0
        const credit = Number(tx.credit) || 0
        const montantAbs = Math.max(debit, credit)
        if (montantAbs < minMontant || montantAbs > maxMontant) continue
        const lib = String(tx.libelle || '')
        if (libelleFilter && !lib.toLowerCase().includes(libelleFilter)) continue
        const txStatut = tx.statut || 'non_identifie'
        if (statut !== 'tous' && txStatut !== statut) continue

        // Objet COMPACT par défaut (10 champs essentiels) — suffisant pour
        // « montre-moi les mouvements ». Les ~15 champs de rapprochement
        // détaillés gonflaient le payload (→ « result too large » côté MCP).
        const compact: Record<string, any> = {
          id: `${r.id}-${idx}`,
          date: tx.date || null,
          libelle: lib,
          debit,
          credit,
          montant_abs: montantAbs,
          sens: debit > 0 ? 'sortie' : 'entree',
          devise: tx.devise || cb?.devise || 'MUR',
          banque: cb?.banque || null,
          statut: txStatut,
          tiers_detecte: tx.tiers_detecte || tx.tiers || null,
        }
        if (verbose) {
          Object.assign(compact, {
            releve_id: r.id,
            transaction_idx: idx,
            reference: tx.reference || null,
            solde_apres: tx.solde_apres ?? null,
            compte_bancaire_id: r.compte_bancaire_id,
            numero_compte_bancaire: cb?.numero_compte || null,
            compte_comptable: cb?.compte_comptable || null,
            facture_id: tx.facture_id || null,
            facture_ids: Array.isArray(tx.facture_ids) ? tx.facture_ids : (tx.facture_id ? [tx.facture_id] : []),
            nb_factures: typeof tx.nb_factures === 'number' ? tx.nb_factures : (Array.isArray(tx.facture_ids) ? tx.facture_ids.length : (tx.facture_id ? 1 : 0)),
            rapprochement_multi: !!tx.rapprochement_multi,
            ecriture_id: tx.ecriture_id || null,
            lettre: tx.lettre || null,
            matched_type: tx.matched_type || tx.classification || null,
            matched_strategy: tx.matched_strategy || null,
            matched_confidence: tx.matched_confidence ?? tx.match_confidence ?? null,
            note: tx.note || null,
            rapproche_at: tx.rapproche_at || null,
          })
        }
        transactions.push(compact)
      }
    }

    // 4. Tri par date desc puis montant desc
    transactions.sort((a, b) => {
      const dt = String(b.date || '').localeCompare(String(a.date || ''))
      if (dt !== 0) return dt
      return b.montant_abs - a.montant_abs
    })

    const truncated = transactions.length > limit
    const result = transactions.slice(0, limit)

    return NextResponse.json({
      societe_id,
      transactions: result,
      total: transactions.length,
      returned: result.length,
      truncated,
      releves_count: (releves || []).length,
      comptes: (comptes || []).map(c => ({
        id: c.id, banque: c.banque, devise: c.devise,
        numero_compte: c.numero_compte, compte_comptable: c.compte_comptable,
      })),
      filtres: {
        compte_id: compte_id || null,
        periode: periode || null,
        date_debut: date_debut || null,
        date_fin: date_fin || null,
        statut,
        min_montant: minMontant || null,
        max_montant: Number.isFinite(maxMontant) ? maxMontant : null,
        libelle: libelleFilter || null,
        limit,
      },
    })
  } catch (e: any) {
    if (e?.message?.includes('access') || e?.message?.includes('403')) {
      return NextResponse.json({ error: e.message }, { status: 403 })
    }
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
