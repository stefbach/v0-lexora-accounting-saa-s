/**
 * lib/accounting/bank-opening-balance.ts
 *
 * À-nouveau du SOLDE D'OUVERTURE bancaire.
 *
 * À l'import d'un relevé PDF, le solde d'ouverture est extrait et stocké sur
 * releves_bancaires, mais AUCUNE écriture comptable n'était générée pour le
 * compte de banque (512xxx). Résultat : le solde banque du grand-livre / bilan
 * n'affichait que les mouvements (écritures BNQ du rapprochement), jamais le
 * solde de départ → le compte banque ne « colle » pas avec le relevé réel.
 *
 * Correctif : au tout premier relevé d'un compte bancaire, on enregistre le
 * solde d'ouverture comme un à-nouveau (journal AN), daté à l'ouverture du
 * relevé, avec pour contrepartie le report à nouveau (1101, capitaux propres) —
 * même mécanique que enregistrer_soldes_ouverture et que le stock initial.
 *
 *   solde ≥ 0 (avoir)     D 512xxx / C 1101
 *   solde < 0 (découvert) D 1101   / C 512xxx   (montant en valeur absolue)
 *
 * Garde-fous :
 *   • idempotence par ref_folio `ANBQ-<compte_bancaire_id>` (une seule pièce) ;
 *   • anti double-comptage : si un à-nouveau (journal AN) touche déjà le compte
 *     de banque — typiquement saisi via l'onboarding enregistrer_soldes_ouverture
 *     — on ne crée rien.
 */

import { round2, isBalanced } from '@/lib/money'

type SupabaseClient = any

export const COMPTE_BANQUE_DEFAUT = '512'
export const COMPTE_CONTREPARTIE_OUVERTURE = '1101'

export interface EcritureBanqueLine {
  societe_id: string
  dossier_id: string | null
  date_ecriture: string
  journal: 'AN'
  ref_folio: string
  numero_compte: string
  nom_compte: string
  libelle: string
  description: string
  debit_mur: number
  credit_mur: number
  exercice: string
}

export interface SoldeOuvertureBancaireInput {
  societe_id: string
  compte_bancaire_id: string
  compte_comptable?: string | null
  nom_banque?: string | null
  solde_ouverture: number
  date_ouverture: string
  dossier_id?: string | null
  compteContrepartie?: string
}

/** ref_folio unique de l'à-nouveau bancaire — distinct de STK-/FAC-/RC-. */
export function refFolioAnBancaire(compteBancaireId: string): string {
  return `ANBQ-${compteBancaireId}`
}

/**
 * Construit les 2 lignes équilibrées de l'à-nouveau bancaire.
 * Pure — retourne [] si le solde d'ouverture est nul.
 */
export function buildEcritureSoldeOuvertureBancaire(
  input: SoldeOuvertureBancaireInput,
): EcritureBanqueLine[] {
  const solde = round2(input.solde_ouverture || 0)
  if (solde === 0) return []

  const compteBanque = input.compte_comptable || COMPTE_BANQUE_DEFAUT
  const compteContrepartie = input.compteContrepartie || COMPTE_CONTREPARTIE_OUVERTURE
  const montant = Math.abs(solde)
  const nomBanque = input.nom_banque || 'Banque'
  const libelle = `Solde d'ouverture (à-nouveau) — ${nomBanque}`

  const base = {
    societe_id: input.societe_id,
    dossier_id: input.dossier_id ?? null,
    date_ecriture: input.date_ouverture,
    journal: 'AN' as const,
    ref_folio: refFolioAnBancaire(input.compte_bancaire_id),
    libelle,
    description: libelle,
    exercice: input.date_ouverture.slice(0, 4),
  }

  // solde ≥ 0 : la banque est débitrice (actif). solde < 0 : découvert.
  const banqueAuDebit = solde > 0
  const lignes: EcritureBanqueLine[] = [
    {
      ...base,
      numero_compte: compteBanque,
      nom_compte: nomBanque,
      debit_mur: banqueAuDebit ? montant : 0,
      credit_mur: banqueAuDebit ? 0 : montant,
    },
    {
      ...base,
      numero_compte: compteContrepartie,
      nom_compte: "Report à nouveau — solde d'ouverture",
      debit_mur: banqueAuDebit ? 0 : montant,
      credit_mur: banqueAuDebit ? montant : 0,
    },
  ]

  if (!isBalanced(lignes.map((l) => l.debit_mur), lignes.map((l) => l.credit_mur))) {
    throw new Error('R1 violée — à-nouveau bancaire déséquilibré')
  }
  return lignes
}

/**
 * Enregistre l'à-nouveau du solde d'ouverture bancaire, avec garde-fous.
 * Idempotent ; ne fait rien si un à-nouveau touche déjà le compte de banque.
 *
 * @returns { ok, nb_entries, skipped?: 'zero' | 'exists' | 'onboarding' }
 */
export async function createEcritureSoldeOuvertureBancaire(
  supabase: SupabaseClient,
  input: SoldeOuvertureBancaireInput,
): Promise<{ ok: boolean; nb_entries: number; skipped?: string; error?: string }> {
  try {
    const solde = round2(input.solde_ouverture || 0)
    if (solde === 0) return { ok: true, nb_entries: 0, skipped: 'zero' }

    const compteBanque = input.compte_comptable || COMPTE_BANQUE_DEFAUT
    const refFolio = refFolioAnBancaire(input.compte_bancaire_id)

    // Garde-fou idempotence — notre propre pièce existe déjà ?
    const { data: mine } = await supabase
      .from('ecritures_comptables_v2')
      .select('id')
      .eq('societe_id', input.societe_id)
      .eq('ref_folio', refFolio)
      .limit(1)
    if (mine && mine.length > 0) return { ok: true, nb_entries: 0, skipped: 'exists' }

    // Garde-fou anti double-comptage — un à-nouveau (onboarding ou autre) touche
    // déjà ce compte de banque : ne rien créer pour éviter de doubler le solde.
    const { data: existingAn } = await supabase
      .from('ecritures_comptables_v2')
      .select('id')
      .eq('societe_id', input.societe_id)
      .eq('journal', 'AN')
      .eq('numero_compte', compteBanque)
      .limit(1)
    if (existingAn && existingAn.length > 0) {
      return { ok: true, nb_entries: 0, skipped: 'onboarding' }
    }

    let dossierId = input.dossier_id ?? null
    if (!dossierId) {
      const { data: dossier } = await supabase
        .from('dossiers')
        .select('id')
        .eq('societe_id', input.societe_id)
        .limit(1)
        .maybeSingle()
      dossierId = dossier?.id || null
    }

    const lignes = buildEcritureSoldeOuvertureBancaire({ ...input, dossier_id: dossierId })
    if (lignes.length === 0) return { ok: true, nb_entries: 0, skipped: 'zero' }

    const { error } = await supabase.from('ecritures_comptables_v2').insert(lignes)
    if (error) return { ok: false, nb_entries: 0, error: error.message }
    return { ok: true, nb_entries: lignes.length }
  } catch (e: any) {
    return { ok: false, nb_entries: 0, error: e?.message || 'Erreur inconnue' }
  }
}
