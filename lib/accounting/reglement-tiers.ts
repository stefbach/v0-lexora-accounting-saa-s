/**
 * Helper d'écritures comptables pour les règlements de factures HORS BANQUE.
 *
 * Cas d'usage : une facture (fournisseur ou client) est réglée par un tiers
 * (associé, société liée, exploitant…) sans passer par le compte bancaire.
 *
 * Écriture générée pour une facture FOURNISSEUR :
 *   D 401  Fournisseur     (solde la dette envers le fournisseur)
 *   C 455  CCA / 451 etc.  (création de la dette envers le tiers)
 *
 * Écriture générée pour une facture CLIENT :
 *   D 455 / 451 etc.       (le tiers nous doit le montant encaissé pour nous)
 *   C 411  Clients         (solde la créance envers le client)
 *
 * Journal utilisé : 'OD-TIERS' (opération diverse, règlement hors banque)
 * Lettre apposée sur la facture VTE/ACH ET sur la ligne 401/411 du règlement
 * pour permettre le lettrage croisé.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ReglementTiersParams {
  societe_id: string
  date_paiement: string // YYYY-MM-DD
  amount_mur: number
  type: 'supplier' | 'client'
  tiers: string // nom du fournisseur/client (pour libellé)
  facture_id: string
  facture_numero?: string | null
  compte_tiers: string // ex '455', '451', '108'
  nom_compte_tiers: string // ex 'CCA Stéphane Bach', 'Groupe XYZ'
  ref_folio: string // ex 'REG-<facture_id>'
  lettre_code: string
  description?: string
}

export async function createEcrituresReglementTiers(
  supabase: SupabaseClient,
  params: ReglementTiersParams,
): Promise<{ ok: boolean; error?: string; ids?: string[] }> {
  try {
    const { data: dossier } = await supabase
      .from('dossiers').select('id').eq('societe_id', params.societe_id).limit(1).maybeSingle()

    // Garde-fou idempotence : si on a déjà créé des écritures OD-TIERS
    // pour cette facture avec ce ref_folio, on skip pour éviter le doublon.
    const { data: existing } = await supabase
      .from('ecritures_comptables_v2').select('id')
      .eq('societe_id', params.societe_id).eq('ref_folio', params.ref_folio)
    if (existing && existing.length > 0) {
      return { ok: true, ids: existing.map((e: any) => e.id) }
    }

    const isSupplier = params.type === 'supplier'
    const libelle = params.description
      || `Règlement hors banque ${params.facture_numero || ''} — ${params.tiers}`.trim()
    const exercice = new Date(params.date_paiement).getFullYear().toString()

    const base = {
      societe_id: params.societe_id,
      dossier_id: dossier?.id || null,
      date_ecriture: params.date_paiement,
      journal: 'OD-TIERS',
      ref_folio: params.ref_folio,
      numero_piece: params.ref_folio,
      libelle, description: libelle,
      exercice,
      facture_id: params.facture_id,
      lettre: params.lettre_code,
      date_lettrage: params.date_paiement,
    }

    const ligneFacture = {
      ...base,
      numero_compte: isSupplier ? '401' : '411',
      nom_compte: isSupplier ? 'Fournisseurs' : 'Clients',
      debit_mur: isSupplier ? params.amount_mur : 0,
      credit_mur: isSupplier ? 0 : params.amount_mur,
    }
    const ligneTiers = {
      ...base,
      numero_compte: params.compte_tiers,
      nom_compte: params.nom_compte_tiers,
      debit_mur: isSupplier ? 0 : params.amount_mur,
      credit_mur: isSupplier ? params.amount_mur : 0,
    }

    const { data: inserted, error } = await supabase
      .from('ecritures_comptables_v2')
      .insert([ligneFacture, ligneTiers])
      .select('id')
    if (error) return { ok: false, error: error.message }

    // Lettrer aussi la facture d'origine (VTE ou ACH) pour le rapprochement
    // croisé par lettre commune. Côté factures VTE/ACH, on cible la ligne
    // 401/411 non encore lettrée.
    const tierAccountPrefix = isSupplier ? '401%' : '411%'
    await supabase.from('ecritures_comptables_v2')
      .update({ lettre: params.lettre_code, date_lettrage: params.date_paiement })
      .eq('societe_id', params.societe_id)
      .eq('facture_id', params.facture_id)
      .in('journal', ['VTE', 'ACH'])
      .like('numero_compte', tierAccountPrefix)
      .is('lettre', null)

    return { ok: true, ids: (inserted || []).map((r: any) => r.id) }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}
