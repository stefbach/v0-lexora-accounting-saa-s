/**
 * lib/inventaire/ecritures.ts — Génération des écritures comptables des
 * mouvements de stock valorisés (inventaire permanent, CUMP).
 *
 * Réf. spec : docs/roadmap/inventaire-pos.md §1.4 :
 *   Entrée (réception, retour client)   D 3701 / C 6037
 *   Sortie (vente, retour fournisseur)  D 6037 / C 3701
 *   Ajustement inventaire (+)           D 3701 / C 6588
 *   Ajustement inventaire (−)           D 6588 / C 3701
 *   Perte / casse                       D 6586 / C 3701
 *   Transfert inter-dépôts              — (quantité seule, pas d'écriture)
 *
 * Règles : équilibre R1 vérifié avant insertion (isBalanced), ref_folio
 * `STK-<mouvement_id>`, journal OD, idempotence par ref_folio.
 */

import { isBalanced, round2 } from '@/lib/money'
import type { MouvementStock, TypeMouvement } from './types'

// Client admin ou serveur — même convention que lib/accounting/ecritures-factures.ts
type SupabaseClient = any

export const COMPTE_STOCK_DEFAUT = '3701'
export const COMPTE_VARIATION_DEFAUT = '6037'
export const COMPTE_PERTES_STOCK = '6586'
export const COMPTE_ECARTS_INVENTAIRE = '6588'

/**
 * Contrepartie des à-nouveaux (solde d'ouverture). Un stock initial n'est PAS
 * un achat de la période : c'est un solde d'ouverture qui doit s'imputer sur
 * les capitaux propres (report à nouveau), jamais sur un compte de charge de
 * la classe 6 — sinon on crée un résultat fictif (une entrée D3701/C6037 sans
 * la charge d'achat 607 en face gonfle le résultat du montant du stock).
 * Même compte que la RPC `enregistrer_soldes_ouverture` (journal AN).
 */
export const COMPTE_CONTREPARTIE_OUVERTURE = '1101'

const NOMS_COMPTES: Record<string, string> = {
  [COMPTE_STOCK_DEFAUT]: 'Stock de marchandises',
  [COMPTE_VARIATION_DEFAUT]: 'Variation des stocks de marchandises',
  [COMPTE_PERTES_STOCK]: 'Pertes sur stocks',
  [COMPTE_ECARTS_INVENTAIRE]: 'Écarts d\'inventaire',
  [COMPTE_CONTREPARTIE_OUVERTURE]: 'Report à nouveau — solde d\'ouverture',
}

export function nomCompteStock(compte: string): string {
  return NOMS_COMPTES[compte] || `Compte ${compte}`
}

export interface EcritureStockLine {
  societe_id: string
  dossier_id: string | null
  date_ecriture: string
  journal: 'OD' | 'AN'
  ref_folio: string
  numero_compte: string
  nom_compte: string
  libelle: string
  description: string
  debit_mur: number
  credit_mur: number
  exercice: string
}

export interface MouvementPourEcritures {
  id: string
  societe_id: string
  dossier_id?: string | null
  type_mouvement: TypeMouvement
  valeur_mouvement: number
  date_mouvement: string
  quantite: number
}

export interface ProduitPourEcritures {
  designation: string
  sku: string
  compte_stock?: string | null
  compte_variation_stock?: string | null
}

/** ref_folio d'un mouvement de stock — distinct de FAC-<id>. */
export function refFolioMouvement(mouvementId: string): string {
  return `STK-${mouvementId}`
}

interface Contrepartie {
  debit: string
  credit: string
}

/** Comptes débit/crédit selon le type de mouvement (null = pas d'écriture). */
export function contrepartieMouvement(
  type: TypeMouvement,
  comptes: { stock: string; variation: string },
): Contrepartie | null {
  switch (type) {
    case 'entree_achat':
    case 'retour_client':
      return { debit: comptes.stock, credit: comptes.variation }
    case 'sortie_vente':
    case 'retour_fournisseur':
      return { debit: comptes.variation, credit: comptes.stock }
    case 'ajustement_inventaire_plus':
      return { debit: comptes.stock, credit: COMPTE_ECARTS_INVENTAIRE }
    case 'ajustement_inventaire_moins':
      return { debit: COMPTE_ECARTS_INVENTAIRE, credit: comptes.stock }
    case 'perte_casse':
      return { debit: COMPTE_PERTES_STOCK, credit: comptes.stock }
    case 'transfert_sortie':
    case 'transfert_entree':
      return null
  }
}

/**
 * Construit les lignes d'écriture ÉQUILIBRÉES d'un mouvement valorisé.
 * Pure — retourne [] pour un transfert ou un mouvement de valeur nulle.
 */
export function buildEcrituresMouvementStock(
  mouvement: MouvementPourEcritures,
  produit: ProduitPourEcritures,
): EcritureStockLine[] {
  const valeur = round2(mouvement.valeur_mouvement)
  if (valeur <= 0) return []

  const comptes = {
    stock: produit.compte_stock || COMPTE_STOCK_DEFAUT,
    variation: produit.compte_variation_stock || COMPTE_VARIATION_DEFAUT,
  }
  const contrepartie = contrepartieMouvement(mouvement.type_mouvement, comptes)
  if (!contrepartie) return []

  const libelle =
    `Stock ${mouvement.type_mouvement.replace(/_/g, ' ')} — ${produit.designation} (${produit.sku}) × ${mouvement.quantite}`
  const base = {
    societe_id: mouvement.societe_id,
    dossier_id: mouvement.dossier_id ?? null,
    date_ecriture: mouvement.date_mouvement,
    journal: 'OD' as const,
    ref_folio: refFolioMouvement(mouvement.id),
    libelle,
    description: libelle,
    exercice: mouvement.date_mouvement.slice(0, 4),
  }

  const lignes: EcritureStockLine[] = [
    {
      ...base,
      numero_compte: contrepartie.debit,
      nom_compte: nomCompteStock(contrepartie.debit),
      debit_mur: valeur,
      credit_mur: 0,
    },
    {
      ...base,
      numero_compte: contrepartie.credit,
      nom_compte: nomCompteStock(contrepartie.credit),
      debit_mur: 0,
      credit_mur: valeur,
    },
  ]

  // R1 — garde-fou partie double (structurel ici, mais jamais implicite).
  if (!isBalanced(lignes.map((l) => l.debit_mur), lignes.map((l) => l.credit_mur))) {
    throw new Error('R1 violée — écriture de stock déséquilibrée')
  }
  return lignes
}

/**
 * Écriture de STOCK INITIAL (solde d'ouverture d'un import).
 *
 * Un stock initial n'est pas une entrée d'achat de la période : c'est un
 * à-nouveau. La contrepartie est le report à nouveau (capitaux propres),
 * journal AN, à la date d'ouverture de l'exercice — pas un compte de
 * variation de stock (classe 6), qui gonflerait le résultat d'un profit
 * fictif égal à la valeur du stock.
 *
 *   D <compte_stock>   (actif — bilan)
 *   C 1101             (capitaux propres — bilan)
 */
export function buildEcritureStockInitial(
  mouvement: MouvementPourEcritures,
  produit: ProduitPourEcritures,
  opts?: { compteContrepartie?: string; dateOuverture?: string },
): EcritureStockLine[] {
  const valeur = round2(mouvement.valeur_mouvement)
  if (valeur <= 0) return []

  const compteStock = produit.compte_stock || COMPTE_STOCK_DEFAUT
  const compteContrepartie = opts?.compteContrepartie || COMPTE_CONTREPARTIE_OUVERTURE
  const dateEcriture = opts?.dateOuverture || mouvement.date_mouvement

  const libelle =
    `Stock initial (à-nouveau) — ${produit.designation} (${produit.sku}) × ${mouvement.quantite}`
  const base = {
    societe_id: mouvement.societe_id,
    dossier_id: mouvement.dossier_id ?? null,
    date_ecriture: dateEcriture,
    journal: 'AN' as const,
    ref_folio: refFolioMouvement(mouvement.id),
    libelle,
    description: libelle,
    exercice: dateEcriture.slice(0, 4),
  }

  const lignes: EcritureStockLine[] = [
    {
      ...base,
      numero_compte: compteStock,
      nom_compte: nomCompteStock(compteStock),
      debit_mur: valeur,
      credit_mur: 0,
    },
    {
      ...base,
      numero_compte: compteContrepartie,
      nom_compte: nomCompteStock(compteContrepartie),
      debit_mur: 0,
      credit_mur: valeur,
    },
  ]

  if (!isBalanced(lignes.map((l) => l.debit_mur), lignes.map((l) => l.credit_mur))) {
    throw new Error('R1 violée — écriture de stock initial déséquilibrée')
  }
  return lignes
}

/**
 * Insère l'écriture de stock initial (à-nouveau) — même idempotence par
 * ref_folio que createEcrituresForMouvementStock, mais imputée sur le report
 * à nouveau (journal AN) et non sur la variation de stock.
 */
export async function createEcritureStockInitial(
  supabase: SupabaseClient,
  mouvement: MouvementPourEcritures | MouvementStock,
  produit: ProduitPourEcritures,
  opts?: { compteContrepartie?: string; dateOuverture?: string },
): Promise<{ ok: boolean; nb_entries: number; error?: string }> {
  try {
    let dossierId = mouvement.dossier_id ?? null
    if (!dossierId) {
      const { data: dossier } = await supabase
        .from('dossiers')
        .select('id')
        .eq('societe_id', mouvement.societe_id)
        .limit(1)
        .maybeSingle()
      dossierId = dossier?.id || null
    }

    const lignes = buildEcritureStockInitial({ ...mouvement, dossier_id: dossierId }, produit, opts)
    if (lignes.length === 0) return { ok: true, nb_entries: 0 }

    const { data: existing } = await supabase
      .from('ecritures_comptables_v2')
      .select('id')
      .eq('societe_id', mouvement.societe_id)
      .eq('ref_folio', refFolioMouvement(mouvement.id))
      .limit(1)
    if (existing && existing.length > 0) return { ok: true, nb_entries: 0 }

    const { error } = await supabase.from('ecritures_comptables_v2').insert(lignes)
    if (error) return { ok: false, nb_entries: 0, error: error.message }
    return { ok: true, nb_entries: lignes.length }
  } catch (e: any) {
    return { ok: false, nb_entries: 0, error: e?.message || 'Erreur inconnue' }
  }
}

/**
 * Insère les écritures d'un mouvement dans ecritures_comptables_v2.
 * Idempotent par ref_folio ; complète dossier_id si absent du mouvement.
 */
export async function createEcrituresForMouvementStock(
  supabase: SupabaseClient,
  mouvement: MouvementPourEcritures | MouvementStock,
  produit: ProduitPourEcritures,
): Promise<{ ok: boolean; nb_entries: number; error?: string }> {
  try {
    let dossierId = mouvement.dossier_id ?? null
    if (!dossierId) {
      const { data: dossier } = await supabase
        .from('dossiers')
        .select('id')
        .eq('societe_id', mouvement.societe_id)
        .limit(1)
        .maybeSingle()
      dossierId = dossier?.id || null
    }

    const lignes = buildEcrituresMouvementStock({ ...mouvement, dossier_id: dossierId }, produit)
    if (lignes.length === 0) return { ok: true, nb_entries: 0 }

    // Idempotence — un mouvement immuable ⇒ une seule pièce comptable.
    const { data: existing } = await supabase
      .from('ecritures_comptables_v2')
      .select('id')
      .eq('societe_id', mouvement.societe_id)
      .eq('ref_folio', refFolioMouvement(mouvement.id))
      .limit(1)
    if (existing && existing.length > 0) return { ok: true, nb_entries: 0 }

    const { error } = await supabase.from('ecritures_comptables_v2').insert(lignes)
    if (error) return { ok: false, nb_entries: 0, error: error.message }
    return { ok: true, nb_entries: lignes.length }
  } catch (e: any) {
    return { ok: false, nb_entries: 0, error: e?.message || 'Erreur inconnue' }
  }
}
