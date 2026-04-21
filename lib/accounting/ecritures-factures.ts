// Use any for Supabase client to support both admin and server clients
type SupabaseClient = any

import { safeInsertBnq } from './bnq-dedupe'

/**
 * TDS (Tax Deducted at Source) — Mauritius.
 * Known rates and their canonical codes. Used both to classify a detected
 * withholding percentage and to compute the expected amount.
 */
export const TDS_RATES: Record<string, number> = {
  TDS_3: 0.03,
  TDS_5: 0.05,
  TDS_075: 0.0075,   // interest on bank deposits
  TDS_10: 0.10,
  TDS_15: 0.15,
  TDS_EXEMPT: 0,
}

/**
 * Match a measured payment-gap ratio (e.g. 0.05 = 5%) to a known TDS code.
 * Accepts a small tolerance band because bank fees may eat into the gap.
 *
 * Returns null when the gap does not match any known TDS bracket — the
 * caller should then treat the difference as a partial payment, not TDS.
 */
export function classifyTdsGap(gapRatio: number): { code: string; rate: number } | null {
  if (!Number.isFinite(gapRatio) || gapRatio <= 0) return null
  const tol = 0.008 // 0.8pt tolerance to absorb bank fees / rounding
  for (const [code, rate] of Object.entries(TDS_RATES)) {
    if (rate === 0) continue
    if (Math.abs(gapRatio - rate) <= tol) return { code, rate }
  }
  return null
}

export interface FactureForEcritures {
  id: string
  societe_id: string
  numero_facture: string
  tiers: string
  date_facture: string
  montant_ht: number
  montant_tva: number
  montant_ttc: number
  type_facture: 'client' | 'fournisseur'
}

/**
 * Auto-generate journal entries for a facture (client or fournisseur).
 *
 * CLIENT invoice (sales, journal VTE):
 *   Debit  411 Clients            = montant_ttc
 *   Credit 706 Prestations        = montant_ht
 *   Credit 4457 TVA collectee     = montant_tva (if > 0)
 *
 * FOURNISSEUR invoice (purchase, journal ACH):
 *   Debit  607 Achats             = montant_ht
 *   Debit  4456 TVA deductible    = montant_tva (if > 0)
 *   Credit 401 Fournisseurs       = montant_ttc
 *
 * All entries get linked via ref_folio = facture_id for later matching/unmatching.
 */
export async function createEcrituresForFacture(
  supabase: SupabaseClient,
  facture: FactureForEcritures
): Promise<{ ok: boolean; error?: string; nb_entries?: number }> {
  try {
    if (!facture.societe_id || !facture.date_facture) {
      return { ok: false, error: 'societe_id et date_facture requis' }
    }

    // Find dossier for FK compatibility
    const { data: dossier } = await supabase
      .from('dossiers')
      .select('id')
      .eq('societe_id', facture.societe_id)
      .limit(1)
      .maybeSingle()

    const dossier_id = dossier?.id || null

    // Delete any existing UNlettered entries for this facture (idempotent)
    // IMPORTANT : ne PAS supprimer les écritures déjà lettrées (rapprochées)
    // sinon le backfill casse le lettrage existant.
    const refFolio = `FAC-${facture.id}`
    await supabase
      .from('ecritures_comptables_v2')
      .delete()
      .eq('societe_id', facture.societe_id)
      .eq('ref_folio', refFolio)
      .is('lettre', null)

    // Clean legacy duplicates (non lettrées uniquement)
    await supabase
      .from('ecritures_comptables_v2')
      .delete()
      .eq('societe_id', facture.societe_id)
      .eq('ref_folio', facture.id)
      .is('lettre', null)

    if (dossier_id) {
      await supabase
        .from('ecritures_comptables_v2')
        .delete()
        .eq('dossier_id', dossier_id)
        .eq('facture_id', facture.id)
        .in('journal', ['ACH', 'VTE'])
        .is('lettre', null)
    }

    const libelle = `Facture ${facture.numero_facture || ''} — ${facture.tiers || ''}`.trim()
    const isClient = facture.type_facture === 'client'
    const journal = isClient ? 'VTE' : 'ACH'

    // Vérifier si des écritures ACH/VTE existent déjà pour cette facture
    // (par ref_folio OU par facture_id) — évite les doublons au re-backfill
    const { data: byRef } = await supabase
      .from('ecritures_comptables_v2')
      .select('id')
      .eq('societe_id', facture.societe_id)
      .eq('journal', journal)
      .eq('ref_folio', refFolio)
      .limit(1)
    if (byRef && byRef.length > 0) {
      return { ok: true, nb_entries: 0 }
    }
    const { data: byFk } = await supabase
      .from('ecritures_comptables_v2')
      .select('id')
      .eq('societe_id', facture.societe_id)
      .eq('journal', journal)
      .eq('facture_id', facture.id)
      .limit(1)
    if (byFk && byFk.length > 0) {
      return { ok: true, nb_entries: 0 }
    }
    const exercice = new Date(facture.date_facture).getFullYear().toString()

    const entries: Array<Record<string, unknown>> = []

    if (isClient) {
      // Debit 411 Clients
      entries.push({
        societe_id: facture.societe_id,
        dossier_id,
        date_ecriture: facture.date_facture,
        journal,
        ref_folio: refFolio,
        numero_piece: facture.numero_facture || null,
        numero_compte: '411',
        nom_compte: 'Clients',
        libelle,
        description: libelle,
        debit_mur: Number(facture.montant_ttc) || 0,
        credit_mur: 0,
        exercice,
        facture_id: facture.id,
      })
      // Credit 706 Prestations
      if (Number(facture.montant_ht) > 0) {
        entries.push({
          societe_id: facture.societe_id,
          dossier_id,
          date_ecriture: facture.date_facture,
          journal,
          ref_folio: refFolio,
          numero_piece: facture.numero_facture || null,
          numero_compte: '706',
          nom_compte: 'Prestations de services',
          libelle,
          description: libelle,
          debit_mur: 0,
          credit_mur: Number(facture.montant_ht) || 0,
          exercice,
          facture_id: facture.id,
        })
      }
      // Credit 4457 TVA collectee
      if (Number(facture.montant_tva) > 0) {
        entries.push({
          societe_id: facture.societe_id,
          dossier_id,
          date_ecriture: facture.date_facture,
          journal,
          ref_folio: refFolio,
          numero_piece: facture.numero_facture || null,
          numero_compte: '4457',
          nom_compte: 'TVA collectee',
          libelle,
          description: libelle,
          debit_mur: 0,
          credit_mur: Number(facture.montant_tva) || 0,
          exercice,
          facture_id: facture.id,
        })
      }
    } else {
      // FOURNISSEUR (supplier): journal ACH
      // Debit 607 Achats
      if (Number(facture.montant_ht) > 0) {
        entries.push({
          societe_id: facture.societe_id,
          dossier_id,
          date_ecriture: facture.date_facture,
          journal,
          ref_folio: refFolio,
          numero_piece: facture.numero_facture || null,
          numero_compte: '607',
          nom_compte: 'Achats',
          libelle,
          description: libelle,
          debit_mur: Number(facture.montant_ht) || 0,
          credit_mur: 0,
          exercice,
          facture_id: facture.id,
        })
      }
      // Debit 4456 TVA deductible
      if (Number(facture.montant_tva) > 0) {
        entries.push({
          societe_id: facture.societe_id,
          dossier_id,
          date_ecriture: facture.date_facture,
          journal,
          ref_folio: refFolio,
          numero_piece: facture.numero_facture || null,
          numero_compte: '4456',
          nom_compte: 'TVA deductible',
          libelle,
          description: libelle,
          debit_mur: Number(facture.montant_tva) || 0,
          credit_mur: 0,
          exercice,
          facture_id: facture.id,
        })
      }
      // Credit 401 Fournisseurs
      entries.push({
        societe_id: facture.societe_id,
        dossier_id,
        date_ecriture: facture.date_facture,
        journal,
        ref_folio: refFolio,
        numero_piece: facture.numero_facture || null,
        numero_compte: '401',
        nom_compte: 'Fournisseurs',
        libelle,
        description: libelle,
        debit_mur: 0,
        credit_mur: Number(facture.montant_ttc) || 0,
        exercice,
        facture_id: facture.id,
      })
    }

    if (entries.length === 0) {
      return { ok: false, error: 'Aucune ligne a generer' }
    }

    const { error } = await supabase.from('ecritures_comptables_v2').insert(entries)
    if (error) {
      console.error('[createEcrituresForFacture] insert error:', error.message)
      return { ok: false, error: error.message }
    }

    return { ok: true, nb_entries: entries.length }
  } catch (e: any) {
    console.error('[createEcrituresForFacture] exception:', e.message)
    return { ok: false, error: e.message || 'Erreur inconnue' }
  }
}

/**
 * Generate payment entries when a bank reconciliation matches a facture.
 * This creates the offsetting 401 debit / 411 credit entries, NOT new 401/411 entries.
 *
 * For supplier payment (debit bancaire):
 *   Debit  401 Fournisseurs     = amount  (cancels the original credit)
 *   Credit 512xxx Banque         = amount  (on the specific bank account)
 *
 * For client payment (credit bancaire):
 *   Debit  512xxx Banque         = amount
 *   Credit 411 Clients           = amount  (cancels the original debit)
 *
 * FIX 1 — params :
 *   • compte_banque : ex. '512100' (DDS MUR), '512200' (DDS EUR), …
 *     Résolu par l'appelant depuis comptes_bancaires.compte_comptable.
 *     Fallback '512' si non fourni (rétrocompat).
 *   • facture_id   : propagé sur les 2 écritures BNQ pour permettre le
 *     lettrage direct par facture_id plus tard.
 *   • lettre_code  : si fourni, pose la lettre sur les 2 BNQ + sur
 *     l'écriture ACH 401/411 qui porte le même facture_id (ou ref_folio
 *     FAC-<id> en fallback).
 *   • numero_piece : texte de référence (ex. libellé de la transaction
 *     bancaire « Règlement FT… »).
 *
 * Retourne aussi les IDs des écritures BNQ créées pour que l'appelant
 * puisse faire des mises à jour (lettrage group à 3, etc.).
 */
export async function createEcrituresForPayment(
  supabase: SupabaseClient,
  payment: {
    societe_id: string
    date_payment: string
    amount_mur: number
    type: 'supplier' | 'client'
    tiers: string
    ref_folio: string // e.g. 'BANK-<releve_id>-<tx_idx>'
    description?: string
    compte_banque?: string // FIX 1 — '512100' etc., from comptes_bancaires.compte_comptable
    facture_id?: string | null
    lettre_code?: string | null
    numero_piece?: string | null
    /**
     * TDS withholding. When provided, generates a third entry crediting the
     * withholding account (447 by default) so that the tier account (401/411)
     * is fully cleared while the bank receives only the net amount.
     * `amount_mur` must equal the NET amount (bank-side), not the gross.
     */
    tds_amount_mur?: number | null
    tds_code?: string | null
    tds_compte?: string | null
  }
): Promise<{ ok: boolean; error?: string; bnq_ids?: string[] }> {
  try {
    const { data: dossier } = await supabase
      .from('dossiers')
      .select('id')
      .eq('societe_id', payment.societe_id)
      .limit(1)
      .maybeSingle()

    // Delete existing payment entries with this ref_folio
    await supabase
      .from('ecritures_comptables_v2')
      .delete()
      .eq('societe_id', payment.societe_id)
      .eq('ref_folio', payment.ref_folio)

    const isSupplier = payment.type === 'supplier'
    const libelle = payment.description || `Paiement ${isSupplier ? 'fournisseur' : 'client'} ${payment.tiers}`
    const exercice = new Date(payment.date_payment).getFullYear().toString()
    const compteBanque = (payment.compte_banque || '512').trim() || '512'
    const nomBanque = compteBanque.startsWith('512') ? `Banque ${compteBanque.slice(3) || ''}`.trim() : 'Banque'

    // Base fields shared by both sides of the écriture
    const base = {
      societe_id: payment.societe_id,
      dossier_id: dossier?.id || null,
      date_ecriture: payment.date_payment,
      journal: 'BNQ',
      ref_folio: payment.ref_folio,
      numero_piece: payment.numero_piece || null,
      libelle,
      description: libelle,
      exercice,
      // FIX 1 — facture_id propagé sur les 2 lignes BNQ (mig 133)
      facture_id: payment.facture_id || null,
      // FIX 1 — lettre apposée dès la création quand un code est fourni
      lettre: payment.lettre_code || null,
      date_lettrage: payment.lettre_code ? payment.date_payment : null,
    }

    // TDS split: when TDS was withheld, the tier account (401/411) must be
    // cleared at GROSS, the bank side at NET, and the difference credited
    // (supplier) / debited (client) to the withholding account.
    const tdsAmount = Math.max(0, Number(payment.tds_amount_mur) || 0)
    const grossAmount = tdsAmount > 0 ? payment.amount_mur + tdsAmount : payment.amount_mur
    const netAmount = payment.amount_mur
    const tdsCompte = (payment.tds_compte || '447').trim() || '447'

    const tierSide = {
      ...base,
      numero_compte: isSupplier ? '401' : '411',
      nom_compte: isSupplier ? 'Fournisseurs' : 'Clients',
      debit_mur: isSupplier ? grossAmount : 0,
      credit_mur: isSupplier ? 0 : grossAmount,
    }
    const bankSide = {
      ...base,
      numero_compte: compteBanque,
      nom_compte: nomBanque,
      debit_mur: isSupplier ? 0 : netAmount,
      credit_mur: isSupplier ? netAmount : 0,
    }
    const tdsSide = tdsAmount > 0 ? {
      ...base,
      numero_compte: tdsCompte,
      nom_compte: 'Retenues à la source (TDS)',
      libelle: `${libelle} — retenue ${payment.tds_code || 'TDS'}`,
      description: `${libelle} — retenue ${payment.tds_code || 'TDS'}`,
      // supplier payment: we withhold, so TDS is a CREDIT (payable to MRA)
      // client payment: they withhold, so TDS is a DEBIT (credit against MRA liability)
      debit_mur: isSupplier ? 0 : tdsAmount,
      credit_mur: isSupplier ? tdsAmount : 0,
    } : null

    const toInsert: any[] = tdsSide ? [tierSide, bankSide, tdsSide] : [tierSide, bankSide]

    // Sprint 2 — Anti-doublon BNQ : si l'utilisateur clique 2x sur
    // « rapprocher » ou si sync_lettrage tourne 2 fois, on ne crée pas
    // 2 paires d'écritures BNQ identiques. Le bankSide a toujours
    // journal='BNQ' donc dedupBnqEntries le filtre. Le tierSide a
    // aussi journal='BNQ' (cf. base.journal = 'BNQ' ci-dessus) donc
    // les deux sont vérifiés.
    const insRes = await safeInsertBnq(supabase, toInsert)
    if (insRes.error) return { ok: false, error: insRes.error.message }
    if (insRes.skipped > 0) {
      console.log(`[createEcrituresForPayment] skipped ${insRes.skipped} doublon(s) BNQ:`, insRes.skipReasons)
    }
    const inserted = insRes.data || []

    // FIX 1 — si une lettre est posée, rattacher l'ACH/VTE 401|411 de
    // la facture au même groupe de lettrage. Tentative par facture_id
    // (le plus fiable), fallback par ref_folio FAC-<id>.
    if (payment.lettre_code && payment.facture_id) {
      const tierAccount = isSupplier ? '401' : '411'
      const tierFilter = isSupplier
        ? { credit_gt: 0 } // ACH credit 401 → lettrer
        : { debit_gt: 0 }  // VTE debit 411 → lettrer
      // On cible uniquement les écritures non encore lettrées pour ne
      // pas écraser un lettrage antérieur (R2).
      let q = supabase
        .from('ecritures_comptables_v2')
        .update({ lettre: payment.lettre_code, date_lettrage: payment.date_payment })
        .eq('societe_id', payment.societe_id)
        .eq('facture_id', payment.facture_id)
        .eq('numero_compte', tierAccount)
        .is('lettre', null)
      if ('credit_gt' in tierFilter) q = q.gt('credit_mur', 0)
      if ('debit_gt' in tierFilter)  q = q.gt('debit_mur', 0)
      const achUpd = await q
      if (achUpd.error) {
        console.warn('[createEcrituresForPayment] ACH letter by facture_id failed:', achUpd.error.message)
        // Fallback ref_folio FAC-<id>
        const fac = payment.facture_id
        const fallback = await supabase
          .from('ecritures_comptables_v2')
          .update({ lettre: payment.lettre_code, date_lettrage: payment.date_payment })
          .eq('societe_id', payment.societe_id)
          .eq('ref_folio', `FAC-${fac}`)
          .eq('numero_compte', tierAccount)
          .is('lettre', null)
        if (fallback.error) {
          console.warn('[createEcrituresForPayment] ACH letter by ref_folio failed:', fallback.error.message)
        }
      }
    }

    return { ok: true, bnq_ids: (inserted || []).map((r: any) => r.id) }
  } catch (e: any) {
    return { ok: false, error: e.message || 'Erreur' }
  }
}
