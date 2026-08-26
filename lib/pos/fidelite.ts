/**
 * lib/pos/fidelite.ts — Programme de fidélité POS (couche PURE).
 *
 * Modèle auditable : chaque variation de points est un mouvement (gain sur
 * vente, utilisation, ajustement) ; le solde d'un client est la somme des
 * mouvements. Aucune I/O ici — juste les règles.
 *
 * Règle de gain par défaut : 1 point par tranche pleine de POINTS_PAR_MUR MUR
 * TTC encaissés (plancher). Paramétrable par société ultérieurement.
 */

export const POINTS_PAR_MUR = 100

export type TypeMouvementFidelite = 'gain' | 'utilisation' | 'ajustement'

export interface MouvementFidelite {
  points: number
  type?: TypeMouvementFidelite
}

/** Points gagnés pour un montant TTC encaissé (entier, plancher, ≥ 0). */
export function pointsGagnes(montantTtc: number, tauxParPoint: number = POINTS_PAR_MUR): number {
  const ttc = Number(montantTtc)
  const taux = Number(tauxParPoint)
  if (!Number.isFinite(ttc) || ttc <= 0 || !Number.isFinite(taux) || taux <= 0) return 0
  return Math.floor(ttc / taux)
}

/** Solde de points = somme des mouvements (les gains sont +, les autres selon leur signe). */
export function soldeFidelite(mouvements: MouvementFidelite[]): number {
  return mouvements.reduce((s, m) => s + (Number(m.points) || 0), 0)
}
