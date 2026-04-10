import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

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
 * Reset COMPLETE du rapprochement/lettrage pour une société.
 *
 * Cette opération remet tout à zéro :
 * - Supprime les écritures de factures (ref_folio LIKE 'FAC-%')
 * - Supprime les écritures de paiements bancaires (ref_folio LIKE 'BANK-%' ou 'PAY-%')
 * - Remet toutes les factures à statut='en_attente' et clear rapproche_*
 * - Remet toutes les transactions bancaires à statut='non_identifie' (clear lettre, facture_id)
 *
 * Après ce reset, lancez /api/comptable/factures/backfill-ecritures pour
 * régénérer les écritures de factures dans un état propre.
 */
export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { societe_id, confirm } = body

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (confirm !== 'RESET') {
      return NextResponse.json({ error: 'Confirmation requise : envoyer confirm=RESET' }, { status: 400 })
    }

    const stats = {
      ecritures_factures_supprimees: 0,
      ecritures_paiements_supprimees: 0,
      ecritures_legacy_supprimees: 0,
      factures_reset: 0,
      transactions_reset: 0,
    }

    // 1. Supprimer les écritures liées aux factures (FAC-*)
    const { count: nbFac } = await supabase
      .from('ecritures_comptables_v2')
      .delete({ count: 'exact' })
      .eq('societe_id', societe_id)
      .like('ref_folio', 'FAC-%')
    stats.ecritures_factures_supprimees = nbFac || 0

    // 2. Supprimer les écritures de paiements (BANK-* et PAY-*)
    const { count: nbBank } = await supabase
      .from('ecritures_comptables_v2')
      .delete({ count: 'exact' })
      .eq('societe_id', societe_id)
      .or('ref_folio.like.BANK-%,ref_folio.like.PAY-%')
    stats.ecritures_paiements_supprimees = nbBank || 0

    // 3. Supprimer les écritures legacy (journal BNQ sans ref_folio structuré)
    // Ces écritures ont été créées par l'ancien code qui ne mettait pas de ref_folio
    // On les reconnaît par : journal=BNQ et compte 401/411/512 et lettre commence par R/RM/RG
    const { count: nbLegacy } = await supabase
      .from('ecritures_comptables_v2')
      .delete({ count: 'exact' })
      .eq('societe_id', societe_id)
      .eq('journal', 'BNQ')
      .is('ref_folio', null)
    stats.ecritures_legacy_supprimees = nbLegacy || 0

    // 4. Remettre toutes les factures à en_attente (clear rapproche_*)
    // Essai avec les colonnes rapproche_* ; fallback si migration 121 non passée
    let resetFactures: any
    const { data: fWithLink, error: fErr } = await supabase
      .from('factures')
      .update({
        statut: 'en_attente',
        rapproche_releve_id: null,
        rapproche_transaction_idx: null,
        rapproche_date: null,
        rapproche_source: null,
      })
      .eq('societe_id', societe_id)
      .neq('statut', 'annule')
      .neq('statut', 'brouillon')
      .select('id')
    if (fErr) {
      // Migration 121 pas passée — reset sans les colonnes rapproche_*
      const { data: fBasic } = await supabase
        .from('factures')
        .update({ statut: 'en_attente' })
        .eq('societe_id', societe_id)
        .neq('statut', 'annule')
        .neq('statut', 'brouillon')
        .select('id')
      resetFactures = fBasic
    } else {
      resetFactures = fWithLink
    }
    stats.factures_reset = resetFactures?.length || 0

    // 5. Clear lettrage sur toutes les transactions bancaires
    const { data: releves } = await supabase
      .from('releves_bancaires')
      .select('id, transactions_json')
      .eq('societe_id', societe_id)

    for (const r of releves || []) {
      const txs: any[] = r.transactions_json || []
      let changed = false
      const newTxs = txs.map((tx: any) => {
        // Skip internal transfers (keep as 'interne')
        if (tx.statut === 'interne' || tx.matched_type === 'transfert_interne') return tx
        // Clear all rapprochement state
        if (tx.lettre || tx.facture_id || tx.facture_ids || tx.statut === 'rapproche' || tx.matched_type) {
          changed = true
          stats.transactions_reset++
          const { lettre, facture_id, facture_ids, ecriture_id, matched_type, match_confidence, note, rapproche_at, rapprochement_multi, nb_factures, ecart_montant, ...rest } = tx
          return { ...rest, statut: 'non_identifie' }
        }
        return tx
      })
      if (changed) {
        await supabase.from('releves_bancaires')
          .update({ transactions_json: newTxs })
          .eq('id', r.id)
      }
    }

    // Note: ecritures_comptables_v2 n'a pas de champ lettre —
    // le lettrage se fait via ref_folio qui sert de clé de liaison.

    return NextResponse.json({
      ok: true,
      message: 'Reset complet effectue. Vous pouvez maintenant relancer la generation des ecritures.',
      stats,
    })
  } catch (e: any) {
    console.error('[reset-lettrage]', e)
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
