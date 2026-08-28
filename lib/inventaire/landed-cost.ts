/**
 * lib/inventaire/landed-cost.ts — Coût de revient à l'import (landed cost).
 *
 * Besoin relevé par un comptable : « pour le stock, il faut faire le costing de
 * chaque produit importé en y ajoutant sa quote-part de fret et autres charges
 * de dédouanement ». Sans ça, le coût de stock (et donc les marges) est faux.
 *
 * Ce module répartit des charges annexes (fret, assurance, douane, manutention…)
 * sur les lignes d'une réception import, au prorata de la VALEUR FOB ou de la
 * QUANTITÉ, et calcule le coût unitaire « landed » à utiliser pour la
 * valorisation du stock (CUMP).
 *
 * Rigueur monétaire (CLAUDE.md) : calcul des ratios via decimal.js, arrondi
 * final à 2 décimales, et RÉCONCILIATION du centime d'arrondi (la somme des
 * quote-parts est exactement égale au total des charges — le reliquat est
 * imputé à la ligne de plus fort poids).
 */

import Decimal from 'decimal.js'
import { round2 } from '@/lib/money'

export type MethodeRepartition = 'valeur' | 'quantite'

export interface LigneImport {
  produit_id: string
  designation?: string
  quantite: number
  /** Prix d'achat unitaire hors charges annexes (FOB / EXW). */
  prix_unitaire_fob: number
}

export interface ChargeAnnexe {
  libelle: string
  montant: number
}

export interface LigneLandedResult {
  produit_id: string
  designation?: string
  quantite: number
  prix_unitaire_fob: number
  valeur_fob: number
  charges_reparties: number
  cout_total_landed: number
  cout_unitaire_landed: number
}

export interface LandedCostResult {
  methode: MethodeRepartition
  total_fob: number
  total_charges: number
  total_landed: number
  lignes: LigneLandedResult[]
}

/**
 * Répartit les charges annexes sur les lignes et calcule le coût landed.
 * Pure. Lève si une quantité est ≤ 0 (une ligne de réception a une quantité).
 */
export function repartirLandedCost(
  lignes: LigneImport[],
  charges: ChargeAnnexe[],
  methode: MethodeRepartition = 'valeur',
): LandedCostResult {
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return { methode, total_fob: 0, total_charges: 0, total_landed: 0, lignes: [] }
  }
  for (const l of lignes) {
    if (!(Number(l.quantite) > 0)) {
      throw new Error(`Quantité invalide pour ${l.produit_id} (doit être > 0)`)
    }
  }

  const totalCharges = round2(charges.reduce((s, c) => s + (Number(c.montant) || 0), 0))

  // Poids de répartition par ligne
  const poids = lignes.map((l) => {
    const q = new Decimal(l.quantite)
    const fob = new Decimal(l.prix_unitaire_fob || 0)
    return methode === 'quantite' ? q : q.mul(fob)
  })
  const totalPoids = poids.reduce((s, p) => s.plus(p), new Decimal(0))

  // Quote-part de charges par ligne (Decimal → round2)
  const chargesReparties: number[] = lignes.map((_, i) => {
    if (totalPoids.isZero()) {
      // Aucun poids (tout à 0) : répartition égale par nombre de lignes
      return round2(new Decimal(totalCharges).div(lignes.length).toNumber())
    }
    return round2(new Decimal(totalCharges).mul(poids[i]).div(totalPoids).toNumber())
  })

  // Réconciliation du centime : ajuster la ligne de plus fort poids
  const sommeReparties = round2(chargesReparties.reduce((s, v) => s + v, 0))
  const reliquat = round2(totalCharges - sommeReparties)
  if (reliquat !== 0 && chargesReparties.length > 0) {
    let idxMax = 0
    for (let i = 1; i < poids.length; i++) if (poids[i].gt(poids[idxMax])) idxMax = i
    chargesReparties[idxMax] = round2(chargesReparties[idxMax] + reliquat)
  }

  const resultLignes: LigneLandedResult[] = lignes.map((l, i) => {
    const valeurFob = round2(new Decimal(l.quantite).mul(l.prix_unitaire_fob || 0).toNumber())
    const coutTotal = round2(valeurFob + chargesReparties[i])
    const coutUnitaire = round2(new Decimal(coutTotal).div(l.quantite).toNumber())
    return {
      produit_id: l.produit_id,
      designation: l.designation,
      quantite: l.quantite,
      prix_unitaire_fob: round2(l.prix_unitaire_fob || 0),
      valeur_fob: valeurFob,
      charges_reparties: chargesReparties[i],
      cout_total_landed: coutTotal,
      cout_unitaire_landed: coutUnitaire,
    }
  })

  const totalFob = round2(resultLignes.reduce((s, l) => s + l.valeur_fob, 0))
  return {
    methode,
    total_fob: totalFob,
    total_charges: totalCharges,
    total_landed: round2(totalFob + totalCharges),
    lignes: resultLignes,
  }
}
