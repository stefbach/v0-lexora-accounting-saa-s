/**
 * lib/manufacturing/ecritures.ts — Écritures comptables de transformation
 * (inventaire permanent, production propre — §1.4 de la spec) :
 *
 *   Consommation matières (lancement OF), une pièce OF-<id>-CONSO :
 *     D 3300 En-cours de production      Σ valeurs THÉORIQUES
 *     C <compte_stock composant>         Σ valeurs RÉELLES (par compte)
 *     D/C 6586 Pertes sur stocks         écart réel − théorique
 *     (surconsommation → D 6586 ; sous-consommation → C 6586, contre-passation)
 *
 *   Production (clôture OF), une pièce OF-<id>-PROD :
 *     D <compte_stock produit fini>      cout_matieres_reel + cout_main_oeuvre_reel
 *     C 3300 En-cours de production      idem
 *   ⇒ le 3300 d'un OF clôturé est structurellement soldé à zéro
 *     (Σ débits CONSO = Σ crédits PROD = même valeur stockée sur l'OF).
 *
 * Règles : équilibre R1 vérifié avant insertion (isBalanced), journal OD
 * (le journal « PRD » de la spec est à valider avec la session
 * Comptable/PCM avant création — même choix que le socle Inventaire),
 * idempotence par ref_folio.
 */

import { isBalanced, round2, sumMoney } from '@/lib/money'
import { nomCompteStock } from '@/lib/inventaire/ecritures'
import {
  COMPTE_EN_COURS_PRODUCTION,
  COMPTE_PERTES_STOCKS,
  COMPTE_PRODUITS_FINIS,
} from './types'

// Client admin ou serveur — même convention que lib/inventaire/ecritures.ts
type SupabaseClient = any

const NOMS_COMPTES_MFG: Record<string, string> = {
  '3100': 'Matières premières',
  [COMPTE_EN_COURS_PRODUCTION]: 'En-cours de production',
  [COMPTE_PRODUITS_FINIS]: 'Produits finis',
  '6031': 'Variation des stocks de matières premières',
  '7131': 'Production stockée',
}

export function nomCompteManufacturing(compte: string): string {
  return NOMS_COMPTES_MFG[compte] || nomCompteStock(compte)
}

export function refFolioConsommationOF(ordreId: string): string {
  return `OF-${ordreId}-CONSO`
}

export function refFolioProductionOF(ordreId: string): string {
  return `OF-${ordreId}-PROD`
}

export interface EcritureOFLine {
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

export interface OrdrePourEcritures {
  id: string
  societe_id: string
  dossier_id?: string | null
  numero_of: string
}

export interface ConsommationPourEcritures {
  compte_stock: string
  designation: string
  sku: string
  valeur_theorique: number
  valeur_reelle: number
}

function baseLine(of: OrdrePourEcritures, refFolio: string, date: string, libelle: string) {
  return {
    societe_id: of.societe_id,
    dossier_id: of.dossier_id ?? null,
    date_ecriture: date,
    journal: 'OD' as const,
    ref_folio: refFolio,
    libelle,
    description: libelle,
    exercice: date.slice(0, 4),
  }
}

/**
 * Pièce de consommation matières d'un OF. Pure et ÉQUILIBRÉE par
 * construction : D(3300) + D(6586 si surconso) = C(stocks) + C(6586 si
 * sous-conso). Retourne [] si tout est nul.
 */
export function buildEcrituresConsommationOF(
  of: OrdrePourEcritures,
  consommations: ConsommationPourEcritures[],
  date: string,
): EcritureOFLine[] {
  const totalTheorique = sumMoney(consommations.map((c) => c.valeur_theorique))
  const totalReel = sumMoney(consommations.map((c) => c.valeur_reelle))
  if (totalTheorique <= 0 && totalReel <= 0) return []

  const libelle = `Consommation matières OF ${of.numero_of}`
  const base = baseLine(of, refFolioConsommationOF(of.id), date, libelle)
  const lignes: EcritureOFLine[] = []

  // D 3300 — quantités théoriques valorisées (entrent dans le coût de revient)
  if (totalTheorique > 0) {
    lignes.push({
      ...base,
      numero_compte: COMPTE_EN_COURS_PRODUCTION,
      nom_compte: nomCompteManufacturing(COMPTE_EN_COURS_PRODUCTION),
      debit_mur: totalTheorique,
      credit_mur: 0,
    })
  }

  // C <compte_stock> — sortie réelle de stock, groupée par compte
  const parCompte = new Map<string, number[]>()
  for (const c of consommations) {
    const compte = c.compte_stock
    if (!parCompte.has(compte)) parCompte.set(compte, [])
    parCompte.get(compte)!.push(c.valeur_reelle)
  }
  for (const [compte, valeurs] of parCompte) {
    const total = sumMoney(valeurs)
    if (total <= 0) continue
    lignes.push({
      ...base,
      numero_compte: compte,
      nom_compte: nomCompteManufacturing(compte),
      debit_mur: 0,
      credit_mur: total,
    })
  }

  // Écart anormal → 6586 (surconso : débit ; sous-conso : crédit)
  const ecart = round2(totalReel - totalTheorique)
  if (ecart !== 0) {
    lignes.push({
      ...base,
      numero_compte: COMPTE_PERTES_STOCKS,
      nom_compte: nomCompteStock(COMPTE_PERTES_STOCKS),
      libelle: `Écart matières OF ${of.numero_of}`,
      description: `Écart matières OF ${of.numero_of}`,
      debit_mur: ecart > 0 ? ecart : 0,
      credit_mur: ecart < 0 ? -ecart : 0,
    })
  }

  if (!isBalanced(lignes.map((l) => l.debit_mur), lignes.map((l) => l.credit_mur))) {
    throw new Error('R1 violée — écriture de consommation OF déséquilibrée')
  }
  return lignes
}

/**
 * Pièce d'entrée en stock du produit fini (clôture OF) :
 * D compte_stock produit fini / C 3300, au montant EXACT imputé à
 * l'en-cours — garantit le solde 3300 = 0 pour l'OF.
 */
export function buildEcrituresProductionOF(
  of: OrdrePourEcritures,
  produitFini: { designation: string; sku: string; compte_stock?: string | null },
  montant: number,
  quantite: number,
  date: string,
): EcritureOFLine[] {
  const valeur = round2(montant)
  if (valeur <= 0) return []

  const compteStock = produitFini.compte_stock || COMPTE_PRODUITS_FINIS
  const libelle =
    `Production OF ${of.numero_of} — ${produitFini.designation} (${produitFini.sku}) × ${quantite}`
  const base = baseLine(of, refFolioProductionOF(of.id), date, libelle)

  const lignes: EcritureOFLine[] = [
    {
      ...base,
      numero_compte: compteStock,
      nom_compte: nomCompteManufacturing(compteStock),
      debit_mur: valeur,
      credit_mur: 0,
    },
    {
      ...base,
      numero_compte: COMPTE_EN_COURS_PRODUCTION,
      nom_compte: nomCompteManufacturing(COMPTE_EN_COURS_PRODUCTION),
      debit_mur: 0,
      credit_mur: valeur,
    },
  ]

  if (!isBalanced(lignes.map((l) => l.debit_mur), lignes.map((l) => l.credit_mur))) {
    throw new Error('R1 violée — écriture de production OF déséquilibrée')
  }
  return lignes
}

async function insertPiece(
  supabase: SupabaseClient,
  of: OrdrePourEcritures,
  refFolio: string,
  build: (dossierId: string | null) => EcritureOFLine[],
): Promise<{ ok: boolean; nb_entries: number; error?: string }> {
  try {
    let dossierId = of.dossier_id ?? null
    if (!dossierId) {
      const { data: dossier } = await supabase
        .from('dossiers')
        .select('id')
        .eq('societe_id', of.societe_id)
        .limit(1)
        .maybeSingle()
      dossierId = dossier?.id || null
    }

    const lignes = build(dossierId)
    if (lignes.length === 0) return { ok: true, nb_entries: 0 }

    // Idempotence — une pièce comptable unique par étape d'OF.
    const { data: existing } = await supabase
      .from('ecritures_comptables_v2')
      .select('id')
      .eq('societe_id', of.societe_id)
      .eq('ref_folio', refFolio)
      .limit(1)
    if (existing && existing.length > 0) return { ok: true, nb_entries: 0 }

    const { error } = await supabase.from('ecritures_comptables_v2').insert(lignes)
    if (error) return { ok: false, nb_entries: 0, error: error.message }
    return { ok: true, nb_entries: lignes.length }
  } catch (e: any) {
    return { ok: false, nb_entries: 0, error: e?.message || 'Erreur inconnue' }
  }
}

/** Insère la pièce de consommation (idempotente par ref_folio OF-<id>-CONSO). */
export async function createEcrituresConsommationOF(
  supabase: SupabaseClient,
  of: OrdrePourEcritures,
  consommations: ConsommationPourEcritures[],
  date: string,
): Promise<{ ok: boolean; nb_entries: number; error?: string }> {
  return insertPiece(supabase, of, refFolioConsommationOF(of.id), (dossierId) =>
    buildEcrituresConsommationOF({ ...of, dossier_id: dossierId }, consommations, date),
  )
}

/** Insère la pièce de production (idempotente par ref_folio OF-<id>-PROD). */
export async function createEcrituresProductionOF(
  supabase: SupabaseClient,
  of: OrdrePourEcritures,
  produitFini: { designation: string; sku: string; compte_stock?: string | null },
  montant: number,
  quantite: number,
  date: string,
): Promise<{ ok: boolean; nb_entries: number; error?: string }> {
  return insertPiece(supabase, of, refFolioProductionOF(of.id), (dossierId) =>
    buildEcrituresProductionOF({ ...of, dossier_id: dossierId }, produitFini, montant, quantite, date),
  )
}
