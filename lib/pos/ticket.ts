/**
 * lib/pos/ticket.ts — Modèle de ticket de caisse (reçu) + calcul du rendu.
 *
 * Couche PURE et testable : construit un modèle de ticket à partir d'une vente
 * validée (lignes + paiements) et calcule la monnaie rendue sur les espèces.
 * Le rendu de PRÉSENTATION (impression 80 mm / A) vit dans le composant React.
 */

import type { MoyenPaiement } from './types'
import { LIBELLES_MOYEN_PAIEMENT } from './types'

const round2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100

export interface TicketLine {
  designation: string
  sku?: string | null
  quantite: number
  prix_unitaire_ht: number
  remise_pct?: number
  taux_tva: number
  montant_ttc: number
}

export interface TicketPayment {
  moyen: MoyenPaiement
  montant: number
  reference?: string | null
}

export interface TicketModel {
  societe: string
  numero_ticket: string
  date: string
  lignes: TicketLine[]
  total_ht: number
  total_tva: number
  total_ttc: number
  paiements: Array<TicketPayment & { libelle: string }>
  /** Espèces effectivement remises par le client (≥ part espèces due). */
  recu_especes: number
  /** Monnaie à rendre. */
  rendu: number
}

/**
 * Monnaie rendue : max(0, reçu − dû). Jamais négatif (un « reçu » inférieur
 * au dû n'est pas un rendu mais un solde impayé, hors périmètre du ticket).
 */
export function computeChange(recu: number, du: number): number {
  const r = round2((Number(recu) || 0) - (Number(du) || 0))
  return r > 0 ? r : 0
}

export interface BuildTicketInput {
  societe: string
  numero_ticket: string
  date: string
  total_ht: number
  total_tva: number
  total_ttc: number
  lignes: TicketLine[]
  paiements: TicketPayment[]
  /** Espèces physiquement reçues (pour le rendu) ; défaut = part espèces due. */
  recu_especes?: number
}

export function buildTicketModel(input: BuildTicketInput): TicketModel {
  const paiements = input.paiements.map((p) => ({
    ...p,
    libelle: LIBELLES_MOYEN_PAIEMENT[p.moyen] || p.moyen,
  }))
  const partEspeces = round2(
    input.paiements.filter((p) => p.moyen === 'especes').reduce((s, p) => s + (Number(p.montant) || 0), 0),
  )
  const recu = input.recu_especes != null ? round2(input.recu_especes) : partEspeces
  return {
    societe: input.societe,
    numero_ticket: input.numero_ticket,
    date: input.date,
    lignes: input.lignes,
    total_ht: round2(input.total_ht),
    total_tva: round2(input.total_tva),
    total_ttc: round2(input.total_ttc),
    paiements,
    recu_especes: recu,
    rendu: computeChange(recu, partEspeces),
  }
}
