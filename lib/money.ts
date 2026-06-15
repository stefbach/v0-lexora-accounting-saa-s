/**
 * lib/money.ts — Arithmétique monétaire à précision arbitraire.
 *
 * Conformité fintech (CLAUDE.md) : INTERDICTION des flottants natifs JS pour
 * manipuler de la monnaie. Toute somme, conversion de change ou arrondi de
 * montant doit passer par ce module, adossé à `decimal.js`, pour éliminer les
 * dérives d'arrondi (ex. `0.1 + 0.2 !== 0.3`) qui font diverger les écritures
 * des relevés bancaires et cassent l'équilibre de la partie double.
 *
 * Conventions :
 *  - Monnaie de tenue : MUR, 2 décimales.
 *  - Arrondi commercial par défaut : « half away from zero » (ROUND_HALF_UP),
 *    conforme aux pratiques MRA / TVA mauricienne.
 *  - Les taux de change gardent leur pleine précision jusqu'à l'arrondi final.
 *
 * Le module expose à la fois des helpers `number` (pour l'UI / la persistance
 * existante en `numeric`) et l'accès brut à `Decimal` pour les chaînes de
 * calcul longues où l'on veut différer l'arrondi.
 */

import Decimal from "decimal.js"

// Précision large : 30 chiffres significatifs couvrent largement les montants
// et taux manipulés (PIB-échelle × taux 6 décimales) sans perte.
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP })

export type Money = Decimal
export type MoneyInput = number | string | Decimal

/** Nombre de décimales de la monnaie de tenue (MUR). */
export const MONEY_DP = 2
/** Tolérance d'équilibre / d'écart (1 centime). */
export const MONEY_EPSILON = 0.01

/**
 * Construit un montant précis à partir d'un nombre, d'une chaîne ou d'un
 * Decimal. `null`/`undefined`/`NaN` → 0 (sécurité : un montant non défini ne
 * doit jamais propager un NaN dans une écriture comptable).
 */
export function money(value: MoneyInput | null | undefined): Money {
  if (value == null) return new Decimal(0)
  if (value instanceof Decimal) return value
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return new Decimal(0)
    return new Decimal(value)
  }
  const trimmed = String(value).trim().replace(/\s/g, "")
  if (trimmed === "" ) return new Decimal(0)
  try {
    return new Decimal(trimmed)
  } catch {
    return new Decimal(0)
  }
}

/** Arrondit à 2 décimales (half away from zero) et renvoie un `number`. */
export function round2(value: MoneyInput | null | undefined): number {
  return money(value).toDecimalPlaces(MONEY_DP, Decimal.ROUND_HALF_UP).toNumber()
}

/** Arrondit à `dp` décimales (taux de change, quantités) → `number`. */
export function roundTo(value: MoneyInput | null | undefined, dp: number): number {
  return money(value).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).toNumber()
}

/** Somme précise d'une liste de montants → `number` arrondi à 2 décimales. */
export function sumMoney(values: Array<MoneyInput | null | undefined>): number {
  const total = values.reduce<Decimal>((acc, v) => acc.plus(money(v)), new Decimal(0))
  return total.toDecimalPlaces(MONEY_DP, Decimal.ROUND_HALF_UP).toNumber()
}

/** a + b (arrondi 2 décimales). */
export function addMoney(a: MoneyInput, b: MoneyInput): number {
  return round2(money(a).plus(money(b)))
}

/** a − b (arrondi 2 décimales). */
export function subMoney(a: MoneyInput, b: MoneyInput): number {
  return round2(money(a).minus(money(b)))
}

/** a × facteur (arrondi 2 décimales). Pour TVA, proratas, etc. */
export function mulMoney(a: MoneyInput, factor: MoneyInput): number {
  return round2(money(a).times(money(factor)))
}

/**
 * Conversion devise → MUR à précision arbitraire : montant × taux, arrondi à
 * 2 décimales seulement à la fin. `taux` ≤ 0 ⇒ lève (un taux nul/négatif est
 * une erreur de données, pas une division silencieuse).
 */
export function convertToMUR(montant: MoneyInput, taux: MoneyInput): number {
  const t = money(taux)
  if (t.lte(0)) {
    throw new Error(`Taux de change invalide (${t.toString()}) — conversion MUR impossible`)
  }
  return round2(money(montant).times(t))
}

/** MUR → devise (division précise). `taux` ≤ 0 ⇒ lève. */
export function convertFromMUR(montantMur: MoneyInput, taux: MoneyInput): number {
  const t = money(taux)
  if (t.lte(0)) {
    throw new Error(`Taux de change invalide (${t.toString()}) — conversion impossible`)
  }
  return round2(money(montantMur).dividedBy(t))
}

/**
 * Vérifie l'équilibre d'une écriture (partie double) : Σdébit ≈ Σcrédit à
 * `epsilon` près (défaut 1 centime). Calcul en précision arbitraire pour ne
 * jamais rejeter (ou accepter) à tort à cause d'une dérive float.
 */
export function isBalanced(
  debits: Array<MoneyInput | null | undefined>,
  credits: Array<MoneyInput | null | undefined>,
  epsilon: number = MONEY_EPSILON,
): boolean {
  const d = debits.reduce<Decimal>((a, v) => a.plus(money(v)), new Decimal(0))
  const c = credits.reduce<Decimal>((a, v) => a.plus(money(v)), new Decimal(0))
  return d.minus(c).abs().lte(epsilon)
}

/** Écart signé Σdébit − Σcrédit (arrondi 2 décimales). */
export function balanceDelta(
  debits: Array<MoneyInput | null | undefined>,
  credits: Array<MoneyInput | null | undefined>,
): number {
  const d = debits.reduce<Decimal>((a, v) => a.plus(money(v)), new Decimal(0))
  const c = credits.reduce<Decimal>((a, v) => a.plus(money(v)), new Decimal(0))
  return round2(d.minus(c))
}

/** Deux montants sont-ils égaux à `epsilon` près (défaut 1 centime) ? */
export function moneyEquals(a: MoneyInput, b: MoneyInput, epsilon: number = MONEY_EPSILON): boolean {
  return money(a).minus(money(b)).abs().lte(epsilon)
}

/** Formatage d'affichage fr-FR (2 décimales) + code devise optionnel. */
export function formatMoney(value: MoneyInput | null | undefined, devise = "MUR"): string {
  const n = round2(value)
  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
  return devise ? `${formatted} ${devise}` : formatted
}

export { Decimal }
