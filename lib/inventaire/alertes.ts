/**
 * lib/inventaire/alertes.ts — Détection des seuils de stock.
 * Priorité : rupture > seuil_bas > surstockage > rien.
 */

import { money } from '@/lib/money'
import type { TypeAlerte } from './types'

export interface SeuilsProduit {
  seuil_alerte?: number | null
  stock_mini?: number | null
  stock_maxi?: number | null
}

export interface AlerteDetectee {
  type_alerte: TypeAlerte
  seuil_reference: number | null
}

/**
 * Évalue la quantité courante d'un produit (par dépôt) contre ses seuils.
 * Retourne `null` quand aucune alerte n'est justifiée.
 *
 *  - rupture     : quantité ≤ 0
 *  - seuil_bas   : quantité ≤ seuil_alerte (ou, à défaut, ≤ stock_mini > 0)
 *  - surstockage : stock_maxi défini et quantité > stock_maxi
 */
export function evaluerSeuil(quantite: number, seuils: SeuilsProduit): AlerteDetectee | null {
  const q = money(quantite)
  if (q.lte(0)) return { type_alerte: 'rupture', seuil_reference: 0 }

  const seuilBas =
    seuils.seuil_alerte != null && seuils.seuil_alerte > 0
      ? seuils.seuil_alerte
      : seuils.stock_mini != null && seuils.stock_mini > 0
        ? seuils.stock_mini
        : null
  if (seuilBas != null && q.lte(money(seuilBas))) {
    return { type_alerte: 'seuil_bas', seuil_reference: seuilBas }
  }

  if (seuils.stock_maxi != null && seuils.stock_maxi > 0 && q.gt(money(seuils.stock_maxi))) {
    return { type_alerte: 'surstockage', seuil_reference: seuils.stock_maxi }
  }
  return null
}
