/**
 * lib/pos/types.ts — Types partagés du module Point de vente.
 * Réf. spec : docs/roadmap/inventaire-pos.md §2.2.
 */

export type MoyenPaiement = 'especes' | 'carte' | 'mobile_money' | 'virement'

/** Compte d'encaissement par moyen — même mapping que la RPC valider_vente_pos. */
export const COMPTE_PAR_MOYEN: Record<MoyenPaiement, string> = {
  especes: '530',
  carte: '5118',
  mobile_money: '5118',
  virement: '512',
}

export const MOYENS_PAIEMENT = Object.keys(COMPTE_PAR_MOYEN) as MoyenPaiement[]

export const LIBELLES_MOYEN_PAIEMENT: Record<MoyenPaiement, string> = {
  especes: 'Espèces',
  carte: 'Carte bancaire',
  mobile_money: 'Mobile money',
  virement: 'Virement',
}

export type StatutSession = 'ouverte' | 'fermee'

export type StatutVente =
  | 'brouillon'
  | 'validee'
  | 'annulee'
  | 'remboursee'
  | 'remboursee_partiel'

export interface SessionCaisse {
  id: string
  societe_id: string
  depot_id: string
  caissier_id: string
  statut: StatutSession
  fond_ouverture: number
  fond_fermeture_theorique: number | null
  fond_fermeture_compte: number | null
  ecart_caisse: number | null
  ouverte_at: string
  fermee_at: string | null
  notes: string | null
}

export interface VentePos {
  id: string
  societe_id: string
  session_caisse_id: string
  depot_id: string
  numero_ticket: string
  date_vente: string
  montant_ht: number
  montant_tva: number
  montant_ttc: number
  statut: StatutVente
}

export interface LigneVentePos {
  id: string
  vente_pos_id: string
  produit_id: string
  quantite: number
  prix_unitaire_ht: number
  remise_pct: number
  taux_tva: number
  montant_ht: number
  montant_tva: number
  montant_ttc: number
  cout_unitaire_cump: number | null
  mouvement_stock_id: string | null
}

export interface PaiementPos {
  id: string
  vente_pos_id: string
  moyen_paiement: MoyenPaiement
  montant: number
  reference: string | null
  compte_comptable: string
}
