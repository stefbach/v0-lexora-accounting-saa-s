/**
 * lib/jobcosting/ecritures.ts — Écritures comptables du Job Costing.
 *
 * Réf. spec §2.4 :
 *   - Consommation de stock imputée à un job (inventaire permanent) :
 *       D compte_variation_stock (6037) / C compte_stock (3701), taggée job_id.
 *   - Reclassement analytique de main d'œuvre (OPTIONNEL) :
 *       D 6422 Charges de personnel — jobs / C 6411 Salaires bruts, taggée job_id.
 *     Neutre pour le total des charges de personnel (deux comptes 64x).
 *
 * Règles : équilibre R1 vérifié avant insertion (isBalanced), journal OD,
 * idempotence par ref_folio, tag analytique job_id sur chaque ligne.
 */

import { isBalanced, round2 } from '@/lib/money'
import { ensureSectionForJob, tagLines } from '@/lib/analytique/link'
import {
  COMPTE_PERSONNEL_JOBS,
  COMPTE_SALAIRES_BRUTS,
} from './types'

type SupabaseClient = any

export const COMPTE_STOCK_DEFAUT = '3701'
export const COMPTE_VARIATION_DEFAUT = '6037'

const NOMS_COMPTES: Record<string, string> = {
  '3701': 'Stock de marchandises',
  '6037': 'Variation des stocks de marchandises',
  [COMPTE_PERSONNEL_JOBS]: 'Charges de personnel — jobs facturables',
  [COMPTE_SALAIRES_BRUTS]: 'Salaires et appointements bruts',
}

function nomCompte(compte: string): string {
  return NOMS_COMPTES[compte] || `Compte ${compte}`
}

export interface EcritureJobLine {
  societe_id: string
  dossier_id: string | null
  job_id: string
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
  /** Dimension analytique unifiée (mig 500) — renseignée à l'insertion. */
  section_analytique_id?: string | null
}

export function refFolioConsommationJob(mouvementId: string): string {
  return `STK-${mouvementId}`
}

export function refFolioReclassementJob(jobId: string): string {
  return `JOBMO-${jobId}`
}

function ligneDouble(
  base: Omit<EcritureJobLine, 'numero_compte' | 'nom_compte' | 'debit_mur' | 'credit_mur'>,
  compteDebit: string,
  compteCredit: string,
  montant: number,
): EcritureJobLine[] {
  const lignes: EcritureJobLine[] = [
    { ...base, numero_compte: compteDebit, nom_compte: nomCompte(compteDebit), debit_mur: montant, credit_mur: 0 },
    { ...base, numero_compte: compteCredit, nom_compte: nomCompte(compteCredit), debit_mur: 0, credit_mur: montant },
  ]
  if (!isBalanced(lignes.map((l) => l.debit_mur), lignes.map((l) => l.credit_mur))) {
    throw new Error('R1 violée — écriture job déséquilibrée')
  }
  return lignes
}

export interface ConsommationJobPourEcritures {
  mouvement_id: string
  societe_id: string
  dossier_id?: string | null
  job_id: string
  valeur_mouvement: number
  date_mouvement: string
  quantite: number
  designation: string
  sku: string
  compte_stock?: string | null
  compte_variation_stock?: string | null
}

/**
 * Écriture de destockage d'une consommation imputée à un job :
 * D variation (6037) / C stock (3701), taggée job_id. Pure — [] si valeur nulle.
 */
export function buildEcrituresConsommationJob(c: ConsommationJobPourEcritures): EcritureJobLine[] {
  const valeur = round2(c.valeur_mouvement)
  if (valeur <= 0) return []
  const stock = c.compte_stock || COMPTE_STOCK_DEFAUT
  const variation = c.compte_variation_stock || COMPTE_VARIATION_DEFAUT
  const libelle = `Consommation job — ${c.designation} (${c.sku}) × ${c.quantite}`
  const base = {
    societe_id: c.societe_id,
    dossier_id: c.dossier_id ?? null,
    job_id: c.job_id,
    date_ecriture: c.date_mouvement,
    journal: 'OD' as const,
    ref_folio: refFolioConsommationJob(c.mouvement_id),
    libelle,
    description: libelle,
    exercice: c.date_mouvement.slice(0, 4),
  }
  return ligneDouble(base, variation, stock, valeur)
}

export interface ReclassementJobPourEcritures {
  job_id: string
  societe_id: string
  dossier_id?: string | null
  code: string
  montant: number
  date_ecriture: string
  /** Compte de personnel d'origine (défaut 6411). */
  compte_origine?: string | null
}

/**
 * Écriture de reclassement analytique de main d'œuvre (optionnelle) :
 * D 6422 / C 6411, taggée job_id. Pure — [] si montant nul.
 */
export function buildEcrituresReclassementJob(r: ReclassementJobPourEcritures): EcritureJobLine[] {
  const montant = round2(r.montant)
  if (montant <= 0) return []
  const origine = r.compte_origine || COMPTE_SALAIRES_BRUTS
  const libelle = `Reclassement MO job ${r.code}`
  const base = {
    societe_id: r.societe_id,
    dossier_id: r.dossier_id ?? null,
    job_id: r.job_id,
    date_ecriture: r.date_ecriture,
    journal: 'OD' as const,
    ref_folio: refFolioReclassementJob(r.job_id),
    libelle,
    description: libelle,
    exercice: r.date_ecriture.slice(0, 4),
  }
  return ligneDouble(base, COMPTE_PERSONNEL_JOBS, origine, montant)
}

async function resolveDossier(supabase: SupabaseClient, societeId: string, dossierId: string | null): Promise<string | null> {
  if (dossierId) return dossierId
  const { data } = await supabase
    .from('dossiers')
    .select('id')
    .eq('societe_id', societeId)
    .limit(1)
    .maybeSingle()
  return data?.id || null
}

async function insertIdempotent(
  supabase: SupabaseClient,
  societeId: string,
  refFolio: string,
  lignes: EcritureJobLine[],
): Promise<{ ok: boolean; nb_entries: number; error?: string }> {
  if (lignes.length === 0) return { ok: true, nb_entries: 0 }
  const { data: existing } = await supabase
    .from('ecritures_comptables_v2')
    .select('id')
    .eq('societe_id', societeId)
    .eq('ref_folio', refFolio)
    .limit(1)
  if (existing && existing.length > 0) return { ok: true, nb_entries: 0 }
  const { error } = await supabase.from('ecritures_comptables_v2').insert(lignes)
  if (error) return { ok: false, nb_entries: 0, error: error.message }
  return { ok: true, nb_entries: lignes.length }
}

/** Insère l'écriture de consommation stock (idempotent par ref_folio). */
export async function createEcrituresForConsommationJob(
  supabase: SupabaseClient,
  c: ConsommationJobPourEcritures,
): Promise<{ ok: boolean; nb_entries: number; error?: string }> {
  try {
    const dossierId = await resolveDossier(supabase, c.societe_id, c.dossier_id ?? null)
    const lignes = buildEcrituresConsommationJob({ ...c, dossier_id: dossierId })
    const sectionId = await ensureSectionForJob(supabase, c.societe_id, c.job_id)
    const tagged = tagLines(lignes, { section_analytique_id: sectionId })
    return insertIdempotent(supabase, c.societe_id, refFolioConsommationJob(c.mouvement_id), tagged)
  } catch (e: any) {
    return { ok: false, nb_entries: 0, error: e?.message || 'Erreur inconnue' }
  }
}

/** Insère l'écriture de reclassement MO (idempotent par ref_folio). */
export async function createEcrituresForReclassementJob(
  supabase: SupabaseClient,
  r: ReclassementJobPourEcritures,
): Promise<{ ok: boolean; nb_entries: number; error?: string }> {
  try {
    const dossierId = await resolveDossier(supabase, r.societe_id, r.dossier_id ?? null)
    const lignes = buildEcrituresReclassementJob({ ...r, dossier_id: dossierId })
    const sectionId = await ensureSectionForJob(supabase, r.societe_id, r.job_id)
    const tagged = tagLines(lignes, { section_analytique_id: sectionId })
    return insertIdempotent(supabase, r.societe_id, refFolioReclassementJob(r.job_id), tagged)
  } catch (e: any) {
    return { ok: false, nb_entries: 0, error: e?.message || 'Erreur inconnue' }
  }
}
