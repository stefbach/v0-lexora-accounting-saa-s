/**
 * lib/pos/remise-globale.ts — Remise globale sur ticket (couche PURE).
 *
 * Une remise « globale » (sur le total) est répartie proportionnellement sur
 * les lignes du panier, en la combinant avec les remises de ligne déjà saisies.
 * Objectif : la RPC valider_vente_pos calcule tout à partir des lignes (HT, TVA,
 * vente, COGS) ; en injectant la remise dans les lignes, l'encaissement et les
 * écritures restent justes SANS écriture de remise dédiée ni changement de
 * schéma.
 *
 * Formule : pour une fraction globale g ∈ [0,1[, la remise effective d'une ligne
 * dont la remise propre est r devient  1 − (1 − r)·(1 − g).  Mettre à l'échelle
 * le net de chaque ligne par (1 − g) met HT, TVA et TTC à la même échelle : la
 * baisse de TTC vaut donc exactement g × TTC_avant.
 */

import { calculerTotaux, type LignePanier } from './panier'

export type RemiseGlobale =
  | { type: 'pct'; valeur: number }
  | { type: 'montant'; valeur: number }
  | null

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/** TTC du panier avant remise globale (remises de ligne incluses). */
function ttcAvant(lignes: LignePanier[]): number {
  return calculerTotaux(lignes).total_ttc
}

/**
 * Fraction de remise globale g ∈ [0, 1[ à appliquer, dérivée d'un % direct ou
 * d'un montant MUR (converti en fraction du TTC avant remise). Bornée : on ne
 * descend jamais sous 0 ni au-dessus de ~100 % (plancher à un centime près).
 */
export function tauxRemiseGlobale(lignes: LignePanier[], remise: RemiseGlobale): number {
  if (!remise || !Number.isFinite(remise.valeur) || remise.valeur <= 0) return 0
  if (remise.type === 'pct') return clamp01(remise.valeur / 100)
  const base = ttcAvant(lignes)
  if (base <= 0) return 0
  return clamp01(remise.valeur / base)
}

/**
 * Renvoie les lignes avec la remise globale répartie (remise_pct effectif).
 * Les autres champs (produit_id, quantité, prix, TVA) sont conservés tels quels.
 */
export function appliquerRemiseGlobale<T extends LignePanier>(lignes: T[], remise: RemiseGlobale): T[] {
  const g = tauxRemiseGlobale(lignes, remise)
  if (g <= 0) return lignes
  return lignes.map((l) => {
    const r = Math.min(100, Math.max(0, Number(l.remise_pct) || 0)) / 100
    const eff = 1 - (1 - r) * (1 - g)
    return { ...l, remise_pct: Math.round(eff * 1e6) / 1e4 } // % arrondi à 1e-4
  })
}

/** Montant TTC effectivement remisé par la remise globale (≥ 0). */
export function montantRemiseGlobale(lignes: LignePanier[], remise: RemiseGlobale): number {
  const g = tauxRemiseGlobale(lignes, remise)
  if (g <= 0) return 0
  return Math.round(ttcAvant(lignes) * g * 100) / 100
}
