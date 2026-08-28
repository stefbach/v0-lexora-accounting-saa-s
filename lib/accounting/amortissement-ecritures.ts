/**
 * lib/accounting/amortissement-ecritures.ts
 *
 * Comptabilisation de la DOTATION AUX AMORTISSEMENTS d'une immobilisation.
 *
 * Le registre d'immobilisations calculait bien le plan d'amortissement (table
 * `amortissements`) mais ne générait AUCUNE écriture comptable → la dotation
 * n'apparaissait ni au compte de résultat (classe 68) ni au bilan (cumul
 * classe 28). L'amortissement, opération mensuelle/annuelle clé d'un comptable
 * (relevé par Yannick), n'avait donc aucun effet comptable.
 *
 * Écriture d'une dotation d'exercice :
 *   D 6811 (dotation aux amortissements — charge, classe 6)
 *   C 2815 / 2818 (amortissement cumulé — contra-actif, classe 2)
 *
 * Idempotent par ref_folio `AMORT-<immobilisation_id>-<exercice>` : une seule
 * pièce par immobilisation et par exercice.
 */

import { round2, isBalanced } from '@/lib/money'

type SupabaseClient = any

/** Dotation (charge) : corporelles 6811, incorporelles 6812. */
export const COMPTE_DOTATION_CORPORELLE = '6811'
export const COMPTE_DOTATION_INCORPORELLE = '6812'
/** Amortissement cumulé (contra-actif) par nature. */
export const COMPTE_CUMUL_INSTALLATIONS = '2815'
export const COMPTE_CUMUL_AUTRES = '2818'

/** Catégories d'immobilisation → (compte dotation, compte cumul). */
const COMPTES_PAR_CATEGORIE: Record<string, { dotation: string; cumul: string }> = {
  logiciel: { dotation: COMPTE_DOTATION_INCORPORELLE, cumul: COMPTE_CUMUL_AUTRES },
  mobilier: { dotation: COMPTE_DOTATION_CORPORELLE, cumul: COMPTE_CUMUL_INSTALLATIONS },
  immobilier: { dotation: COMPTE_DOTATION_CORPORELLE, cumul: COMPTE_CUMUL_INSTALLATIONS },
  equipement: { dotation: COMPTE_DOTATION_CORPORELLE, cumul: COMPTE_CUMUL_INSTALLATIONS },
  materiel_informatique: { dotation: COMPTE_DOTATION_CORPORELLE, cumul: COMPTE_CUMUL_AUTRES },
  vehicule: { dotation: COMPTE_DOTATION_CORPORELLE, cumul: COMPTE_CUMUL_AUTRES },
  autre: { dotation: COMPTE_DOTATION_CORPORELLE, cumul: COMPTE_CUMUL_AUTRES },
}

export function comptesAmortissement(categorie?: string | null): { dotation: string; cumul: string } {
  return COMPTES_PAR_CATEGORIE[categorie || 'autre'] || COMPTES_PAR_CATEGORIE.autre
}

export interface EcritureAmortLine {
  societe_id: string
  dossier_id: string | null
  date_ecriture: string
  journal: 'OD'
  ref_folio: string
  numero_compte: string
  nom_compte: string
  libelle: string
  description: string
  debit_mur: number
  credit_mur: number
  exercice: string
}

export interface DotationInput {
  immobilisation_id: string
  societe_id: string
  designation: string
  categorie?: string | null
  exercice: string
  /** Date de comptabilisation — fin d'exercice de la dotation. */
  date_ecriture: string
  dotation: number
  dossier_id?: string | null
}

/** ref_folio d'une dotation — une pièce par immo et par exercice. */
export function refFolioAmortissement(immobilisationId: string, exercice: string): string {
  return `AMORT-${immobilisationId}-${exercice}`
}

/**
 * Construit les 2 lignes équilibrées d'une dotation. Pure — [] si dotation ≤ 0.
 */
export function buildEcrituresDotation(input: DotationInput): EcritureAmortLine[] {
  const dotation = round2(input.dotation || 0)
  if (dotation <= 0) return []

  const { dotation: compteDotation, cumul: compteCumul } = comptesAmortissement(input.categorie)
  const libelle = `Dotation amortissement ${input.exercice} — ${input.designation}`
  const base = {
    societe_id: input.societe_id,
    dossier_id: input.dossier_id ?? null,
    date_ecriture: input.date_ecriture,
    journal: 'OD' as const,
    ref_folio: refFolioAmortissement(input.immobilisation_id, input.exercice),
    libelle,
    description: libelle,
    exercice: input.exercice.slice(0, 4),
  }

  const lignes: EcritureAmortLine[] = [
    {
      ...base,
      numero_compte: compteDotation,
      nom_compte: 'Dotations aux amortissements',
      debit_mur: dotation,
      credit_mur: 0,
    },
    {
      ...base,
      numero_compte: compteCumul,
      nom_compte: 'Amortissements cumulés',
      debit_mur: 0,
      credit_mur: dotation,
    },
  ]

  if (!isBalanced(lignes.map((l) => l.debit_mur), lignes.map((l) => l.credit_mur))) {
    throw new Error('R1 violée — écriture de dotation déséquilibrée')
  }
  return lignes
}

/**
 * Comptabilise une dotation dans ecritures_comptables_v2. Idempotent par
 * ref_folio ; complète dossier_id si absent.
 *
 * @returns { ok, nb_entries, skipped?: 'zero' | 'exists' }
 */
export async function createEcritureDotation(
  supabase: SupabaseClient,
  input: DotationInput,
): Promise<{ ok: boolean; nb_entries: number; skipped?: string; error?: string }> {
  try {
    const dotation = round2(input.dotation || 0)
    if (dotation <= 0) return { ok: true, nb_entries: 0, skipped: 'zero' }

    const refFolio = refFolioAmortissement(input.immobilisation_id, input.exercice)
    const { data: existing } = await supabase
      .from('ecritures_comptables_v2')
      .select('id')
      .eq('societe_id', input.societe_id)
      .eq('ref_folio', refFolio)
      .limit(1)
    if (existing && existing.length > 0) return { ok: true, nb_entries: 0, skipped: 'exists' }

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

    const lignes = buildEcrituresDotation({ ...input, dossier_id: dossierId })
    if (lignes.length === 0) return { ok: true, nb_entries: 0, skipped: 'zero' }

    const { error } = await supabase.from('ecritures_comptables_v2').insert(lignes)
    if (error) return { ok: false, nb_entries: 0, error: error.message }
    return { ok: true, nb_entries: lignes.length }
  } catch (e: any) {
    return { ok: false, nb_entries: 0, error: e?.message || 'Erreur inconnue' }
  }
}
