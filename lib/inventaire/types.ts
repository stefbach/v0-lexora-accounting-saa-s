/**
 * lib/inventaire/types.ts — Types partagés du module Stock / Inventaire.
 * Réf. spec : docs/roadmap/inventaire-pos.md §1.2.
 */

export type TypeMouvement =
  | 'entree_achat'
  | 'sortie_vente'
  | 'ajustement_inventaire_plus'
  | 'ajustement_inventaire_moins'
  | 'transfert_sortie'
  | 'transfert_entree'
  | 'retour_client'
  | 'retour_fournisseur'
  | 'perte_casse'

export type SensMouvement = 'E' | 'S'

/** Sens de chaque type — même mapping que la RPC appliquer_mouvement_stock. */
export const SENS_PAR_TYPE: Record<TypeMouvement, SensMouvement> = {
  entree_achat: 'E',
  retour_client: 'E',
  ajustement_inventaire_plus: 'E',
  transfert_entree: 'E',
  sortie_vente: 'S',
  retour_fournisseur: 'S',
  ajustement_inventaire_moins: 'S',
  transfert_sortie: 'S',
  perte_casse: 'S',
}

export const TYPES_MOUVEMENT = Object.keys(SENS_PAR_TYPE) as TypeMouvement[]

export const LIBELLES_TYPE_MOUVEMENT: Record<TypeMouvement, string> = {
  entree_achat: 'Entrée — réception achat',
  sortie_vente: 'Sortie — vente',
  ajustement_inventaire_plus: 'Ajustement inventaire (+)',
  ajustement_inventaire_moins: 'Ajustement inventaire (−)',
  transfert_sortie: 'Transfert — sortie dépôt',
  transfert_entree: 'Transfert — entrée dépôt',
  retour_client: 'Retour client',
  retour_fournisseur: 'Retour fournisseur',
  perte_casse: 'Perte / casse',
}

export interface Produit {
  id: string
  societe_id: string
  sku: string
  code_barre: string | null
  designation: string
  description: string | null
  categorie: string | null
  unite_mesure: string
  gere_en_stock: boolean
  methode_valorisation: 'CUMP'
  cout_unitaire_moyen: number
  prix_vente_ht: number
  taux_tva: number
  compte_stock: string
  compte_achat: string
  compte_vente: string
  compte_variation_stock: string
  stock_mini: number
  stock_maxi: number | null
  seuil_alerte: number | null
  actif: boolean
}

export interface Depot {
  id: string
  societe_id: string
  nom: string
  type: 'entrepot' | 'boutique' | 'point_de_vente'
  est_defaut: boolean
  actif: boolean
}

export interface StockNiveau {
  id: string
  societe_id: string
  produit_id: string
  depot_id: string
  quantite: number
  valeur_stock: number
}

export interface MouvementStock {
  id: string
  societe_id: string
  dossier_id: string | null
  produit_id: string
  depot_id: string
  type_mouvement: TypeMouvement
  sens: SensMouvement
  quantite: number
  cout_unitaire: number
  valeur_mouvement: number
  reference_type: string
  date_mouvement: string
  motif: string | null
}

export type TypeAlerte = 'seuil_bas' | 'rupture' | 'surstockage'

export interface AlerteStock {
  id: string
  societe_id: string
  produit_id: string
  depot_id: string | null
  type_alerte: TypeAlerte
  seuil_reference: number | null
  quantite_constatee: number
  statut: 'active' | 'resolue' | 'ignoree'
}
