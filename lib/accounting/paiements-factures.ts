/**
 * Paiements de factures — logique métier
 *
 * Responsabilités :
 *   • Enregistrer un paiement manuel sur une facture (1 versement = 1 ligne)
 *   • Générer l'écriture comptable BNQ (512 ↔ 411/401) via
 *     createEcrituresForPayment de ecritures-factures.ts
 *   • Annuler un paiement (suppression de la ligne + des écritures associées)
 *
 * La synchronisation factures.solde_non_paye et factures.statut est
 * automatique via le trigger SQL recompute_facture_paiement_state
 * (migration 237). Aucun update manuel ici, source unique de vérité.
 */

import { createEcrituresForPayment } from './ecritures-factures'

type SupabaseClient = any

export type ModePaiement = 'virement' | 'cheque' | 'espece' | 'carte' | 'prelevement' | 'autre'
export type PaiementSource = 'manuel' | 'rapprochement' | 'backfill'

export interface EnregistrerPaiementInput {
  facture_id: string
  montant: number              // montant en devise d'origine de la facture
  date_paiement: string        // YYYY-MM-DD
  mode_paiement: ModePaiement
  reference?: string | null
  notes?: string | null
  compte_banque?: string | null  // ex. '512100' ; fallback '512' si null
  source?: PaiementSource        // défaut 'manuel'
  rapproche_releve_id?: string | null
}

export interface EnregistrerPaiementResult {
  ok: boolean
  paiement_id?: string
  ecriture_id?: string
  error?: string
}

const MIN_AMOUNT = 0.01

export async function enregistrerPaiement(
  supabase: SupabaseClient,
  input: EnregistrerPaiementInput,
  createdBy?: string | null
): Promise<EnregistrerPaiementResult> {
  if (!input.facture_id) return { ok: false, error: 'facture_id requis' }
  if (!Number.isFinite(input.montant) || input.montant < MIN_AMOUNT) {
    return { ok: false, error: 'Montant invalide (doit être > 0)' }
  }
  if (!input.date_paiement) return { ok: false, error: 'date_paiement requise' }

  // 1. Charger la facture pour récupérer devise, taux, montant_mur restant, type
  const { data: facture, error: fErr } = await supabase
    .from('factures')
    .select('id, societe_id, numero_facture, tiers, type_facture, devise, taux_change, montant_ttc, montant_mur, solde_non_paye, statut')
    .eq('id', input.facture_id)
    .maybeSingle()

  if (fErr) return { ok: false, error: `Facture introuvable: ${fErr.message}` }
  if (!facture) return { ok: false, error: 'Facture introuvable' }
  if (facture.statut === 'annule') {
    return { ok: false, error: "Impossible d'enregistrer un paiement sur une facture annulée" }
  }

  const devise = facture.devise || 'MUR'
  const taux = Number(facture.taux_change) > 0 ? Number(facture.taux_change) : 1
  const montantMur = Math.round(input.montant * taux * 100) / 100

  // 2. Vérifier qu'on ne dépasse pas le total dû (tolérance 1 MUR pour arrondis)
  const totalDuMur = Number(facture.montant_mur) || Number(facture.montant_ttc) * taux || 0
  const dejaPayeMur = totalDuMur - (Number(facture.solde_non_paye) ?? totalDuMur)
  const apresPaiement = dejaPayeMur + montantMur
  if (apresPaiement > totalDuMur + 1) {
    return {
      ok: false,
      error: `Le paiement (${montantMur.toFixed(2)} MUR) dépasse le solde restant (${(totalDuMur - dejaPayeMur).toFixed(2)} MUR)`,
    }
  }

  // 3. Insérer la ligne factures_paiements
  //    Le trigger SQL recompute_facture_paiement_state mettra à jour
  //    factures.solde_non_paye et factures.statut.
  const source: PaiementSource = input.source || 'manuel'
  const { data: paiement, error: pErr } = await supabase
    .from('factures_paiements')
    .insert({
      facture_id: facture.id,
      societe_id: facture.societe_id,
      montant: input.montant,
      montant_mur: montantMur,
      devise,
      taux_change: taux,
      date_paiement: input.date_paiement,
      mode_paiement: input.mode_paiement,
      reference: input.reference || null,
      notes: input.notes || null,
      source,
      rapproche_releve_id: input.rapproche_releve_id || null,
      created_by: createdBy || null,
    })
    .select('id')
    .single()

  if (pErr || !paiement) {
    return { ok: false, error: `Insert paiement: ${pErr?.message || 'erreur inconnue'}` }
  }

  // 4. Générer l'écriture comptable BNQ (sauf source = 'rapprochement',
  //    car dans ce cas l'écriture est déjà créée par le rapprochement)
  let ecriture_id: string | undefined
  if (source !== 'rapprochement') {
    const refFolio = `PAY-${paiement.id}`
    const isClient = facture.type_facture === 'client'
    const ecrRes = await createEcrituresForPayment(supabase, {
      societe_id: facture.societe_id,
      date_payment: input.date_paiement,
      amount_mur: montantMur,
      type: isClient ? 'client' : 'supplier',
      tiers: facture.tiers || '',
      ref_folio: refFolio,
      description: `Paiement ${facture.numero_facture || ''} — ${facture.tiers || ''} (${input.mode_paiement})`,
      compte_banque: input.compte_banque || undefined,
      facture_id: facture.id,
      numero_piece: input.reference || facture.numero_facture || null,
      devise_origine: devise !== 'MUR' ? devise : null,
      montant_origine: devise !== 'MUR' ? input.montant : null,
      taux_change_applique: devise !== 'MUR' ? taux : null,
    })

    if (!ecrRes.ok) {
      // L'écriture a échoué : on annule la ligne de paiement pour rester
      // cohérent (le trigger va recalculer solde_non_paye/statut).
      await supabase.from('factures_paiements').delete().eq('id', paiement.id)
      return { ok: false, error: `Création écriture: ${ecrRes.error}` }
    }

    ecriture_id = ecrRes.bnq_ids?.[0]
    if (ecriture_id) {
      await supabase
        .from('factures_paiements')
        .update({ ecriture_id })
        .eq('id', paiement.id)
    }
  }

  return { ok: true, paiement_id: paiement.id, ecriture_id }
}

/**
 * Annule un paiement : supprime la ligne factures_paiements et les
 * écritures BNQ associées (ref_folio = PAY-<paiement_id>).
 * Le trigger SQL ré-affecte solde_non_paye / statut automatiquement.
 */
export async function annulerPaiement(
  supabase: SupabaseClient,
  paiement_id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!paiement_id) return { ok: false, error: 'paiement_id requis' }

  const { data: paiement, error: pErr } = await supabase
    .from('factures_paiements')
    .select('id, societe_id, source')
    .eq('id', paiement_id)
    .maybeSingle()

  if (pErr) return { ok: false, error: pErr.message }
  if (!paiement) return { ok: false, error: 'Paiement introuvable' }

  // Supprimer les écritures BNQ liées (uniquement pour les paiements manuels)
  if (paiement.source !== 'rapprochement') {
    const refFolio = `PAY-${paiement.id}`
    const { error: eErr } = await supabase
      .from('ecritures_comptables_v2')
      .delete()
      .eq('societe_id', paiement.societe_id)
      .eq('ref_folio', refFolio)
    if (eErr) {
      return { ok: false, error: `Suppression écriture: ${eErr.message}` }
    }
  }

  const { error: dErr } = await supabase
    .from('factures_paiements')
    .delete()
    .eq('id', paiement_id)

  if (dErr) return { ok: false, error: dErr.message }

  return { ok: true }
}
