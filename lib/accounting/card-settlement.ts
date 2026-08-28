/**
 * lib/accounting/card-settlement.ts — Règlement carte agrégé (monétique).
 *
 * Besoin relevé par un comptable : les ventes carte d'une journée (parfois via
 * plusieurs acquéreurs/banques) arrivent en banque REGROUPÉES en une seule
 * transaction, NETTE de commission. Il faut pouvoir rapprocher cette ligne
 * bancaire unique avec l'ensemble des ventes carte de la période, et
 * comptabiliser la commission.
 *
 * Les ventes carte du POS transitent par le compte 5118 « monétique en
 * transit » (D 5118 à l'encaissement). Le règlement bancaire solde ce transit :
 *
 *   D 512  (montant NET reçu en banque)
 *   D 6271 (commission = brut − net, si > 0)
 *   C 5118 (BRUT des ventes carte de la période)
 *
 * Ce module calcule la commission et propose la meilleure période dont le brut
 * correspond au net + une commission plausible.
 */

import { round2 } from '@/lib/money'

export const COMPTE_MONETIQUE_TRANSIT = '5118'
export const COMPTE_BANQUE_DEFAUT = '512'
export const COMPTE_COMMISSION_CARTE = '6271'

export interface SettlementCompute {
  brut: number
  net: number
  commission: number
  commission_pct: number
  /** commission plausible : ≥ 0 et ≤ seuil (par défaut 5%). */
  plausible: boolean
}

/**
 * Calcule la commission d'un règlement carte : commission = brut − net.
 * `commissionMaxPct` borne la plausibilité (défaut 5%).
 */
export function computeSettlement(brut: number, net: number, commissionMaxPct = 5): SettlementCompute {
  const b = round2(brut)
  const n = round2(net)
  const commission = round2(b - n)
  const pct = b > 0 ? round2((commission / b) * 100) : 0
  return {
    brut: b,
    net: n,
    commission,
    commission_pct: pct,
    plausible: commission >= 0 && pct <= commissionMaxPct,
  }
}

export interface DailyTransit { date: string; brut: number }

export interface SettlementMatch {
  dates: string[]
  brut: number
  net: number
  commission: number
  commission_pct: number
}

/**
 * Cherche la période (une ou plusieurs dates consécutives) dont le BRUT de
 * transit correspond le mieux à un montant NET reçu, avec une commission
 * plausible (0 ≤ pct ≤ max). Stratégie : on part de la date pivot (celle du
 * règlement, souvent J ou J-1) et on agrège en avançant tant que la commission
 * reste ≥ 0 ; on retient la combinaison dont la commission % est la plus faible
 * mais ≥ 0.
 *
 * Approche simple et déterministe : on teste chaque date isolée, puis chaque
 * fenêtre [i..j] contiguë, et on renvoie celle qui minimise |commission_pct|
 * sous contrainte commission ≥ 0 et pct ≤ max.
 */
export function matchSettlement(
  net: number,
  transits: DailyTransit[],
  commissionMaxPct = 5,
): SettlementMatch | null {
  const sorted = [...transits].filter(t => t.brut > 0).sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length === 0) return null
  const n = round2(net)

  let best: SettlementMatch | null = null
  for (let i = 0; i < sorted.length; i++) {
    let cumBrut = 0
    const dates: string[] = []
    for (let j = i; j < sorted.length; j++) {
      cumBrut = round2(cumBrut + sorted[j].brut)
      dates.push(sorted[j].date)
      const c = computeSettlement(cumBrut, n, commissionMaxPct)
      if (c.plausible) {
        if (!best || c.commission_pct < best.commission_pct) {
          best = { dates: [...dates], brut: cumBrut, net: n, commission: c.commission, commission_pct: c.commission_pct }
        }
      }
      // Dépassement : le brut cumulé excède déjà le net + commission max.
      // Agréger davantage ne ferait qu'augmenter la commission → on arrête
      // cette fenêtre. Tant que le brut reste < net (commission < 0), on
      // continue d'agréger pour se rapprocher du net.
      if (c.commission > 0 && c.commission_pct > commissionMaxPct) break
    }
  }
  return best
}
