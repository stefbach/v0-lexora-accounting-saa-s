/**
 * lib/inventaire/valorisation.ts — Valorisation CUMP (coût unitaire moyen
 * pondéré) en précision arbitraire (Decimal.js via lib/money).
 *
 * Miroir TypeScript exact des calculs de la RPC `appliquer_mouvement_stock`
 * (migration 482) : mêmes arrondis (CUMP 4 décimales, valeurs 2 décimales,
 * quantités 3 décimales), pour la prévisualisation UI, les tests et le
 * recalcul d'audit à partir du journal des mouvements.
 */

import { money, roundTo, round2, type MoneyInput } from '@/lib/money'
import { SENS_PAR_TYPE, type SensMouvement, type TypeMouvement } from './types'

/** Décimales des quantités (NUMERIC(15,3)). */
export const QTE_DP = 3
/** Décimales du CUMP (NUMERIC(15,4)). */
export const CUMP_DP = 4

/**
 * CUMP après une entrée : moyenne pondérée du stock existant (tous dépôts)
 * et de l'entrée. Stock existant ≤ 0 ⇒ le CUMP repart du coût d'entrée.
 */
export function cumpApresEntree(
  qteAvant: MoneyInput,
  cumpAvant: MoneyInput,
  qteEntree: MoneyInput,
  coutEntree: MoneyInput,
): number {
  const qa = money(qteAvant)
  const qe = money(qteEntree)
  if (qe.lte(0)) {
    throw new Error('QUANTITE_INVALIDE: quantité d\'entrée non positive')
  }
  if (qa.lte(0)) return roundTo(coutEntree, CUMP_DP)
  const valeurTotale = qa.times(money(cumpAvant)).plus(qe.times(money(coutEntree)))
  return roundTo(valeurTotale.dividedBy(qa.plus(qe)), CUMP_DP)
}

/** Valeur d'un mouvement : quantité × coût unitaire, arrondie au centime. */
export function valeurMouvement(quantite: MoneyInput, coutUnitaire: MoneyInput): number {
  return round2(money(quantite).times(money(coutUnitaire)))
}

/** Valeur d'un niveau de stock : quantité × CUMP, arrondie au centime. */
export function valeurStock(quantite: MoneyInput, cump: MoneyInput): number {
  return round2(money(quantite).times(money(cump)))
}

export interface MouvementValorisable {
  type_mouvement: TypeMouvement
  quantite: number
  /** Coût d'achat réel pour les entrées ; ignoré pour les sorties (CUMP). */
  cout_unitaire?: number | null
}

export interface EtatStock {
  quantite: number
  cump: number
  valeur: number
}

/**
 * Rejoue un journal de mouvements (ordre chronologique) et reconstruit
 * l'état courant — outil d'audit : doit converger vers stock_niveaux.
 * Une sortie qui excède le stock disponible lève STOCK_INSUFFISANT,
 * comme la RPC.
 */
export function rejouerMouvements(mouvements: MouvementValorisable[]): EtatStock {
  let qte = money(0)
  let cump = money(0)
  for (const mvt of mouvements) {
    const sens: SensMouvement = SENS_PAR_TYPE[mvt.type_mouvement]
    if (!sens) throw new Error(`TYPE_MOUVEMENT_INVALIDE: ${mvt.type_mouvement}`)
    const q = money(mvt.quantite)
    if (q.lte(0)) throw new Error('QUANTITE_INVALIDE: quantité non positive')
    if (sens === 'E') {
      const cout = mvt.cout_unitaire == null ? cump : money(mvt.cout_unitaire)
      cump = money(cumpApresEntree(qte, cump, q, cout))
      qte = qte.plus(q)
    } else {
      if (qte.lt(q)) {
        throw new Error(
          `STOCK_INSUFFISANT: ${qte.toString()} disponible(s), ${q.toString()} demandé(s)`,
        )
      }
      qte = qte.minus(q)
    }
  }
  const quantite = roundTo(qte, QTE_DP)
  const cumpNum = roundTo(cump, CUMP_DP)
  return { quantite, cump: cumpNum, valeur: valeurStock(quantite, cumpNum) }
}
