import { describe, it, expect } from "vitest"
import {
  money,
  round2,
  roundTo,
  sumMoney,
  addMoney,
  subMoney,
  mulMoney,
  convertToMUR,
  convertFromMUR,
  isBalanced,
  balanceDelta,
  moneyEquals,
  formatMoney,
} from "./money"

describe("money() — construction sûre", () => {
  it("élimine la dérive float (0.1 + 0.2 = 0.3)", () => {
    expect(money(0.1).plus(money(0.2)).toNumber()).toBe(0.3)
  })
  it("0 pour null / undefined / NaN / Infinity / chaîne vide", () => {
    expect(money(null).toNumber()).toBe(0)
    expect(money(undefined).toNumber()).toBe(0)
    expect(money(NaN).toNumber()).toBe(0)
    expect(money(Infinity).toNumber()).toBe(0)
    expect(money("").toNumber()).toBe(0)
    expect(money("   ").toNumber()).toBe(0)
  })
  it("parse les chaînes avec espaces (séparateurs de milliers)", () => {
    expect(money("312 380").toNumber()).toBe(312380)
    expect(money("1234.56").toNumber()).toBe(1234.56)
  })
  it("chaîne non numérique → 0 (jamais de NaN propagé)", () => {
    expect(money("abc").toNumber()).toBe(0)
  })
})

describe("round2 — arrondi half away from zero", () => {
  it("arrondit au centime supérieur sur .5", () => {
    expect(round2(2.005)).toBe(2.01)
    expect(round2(1.005)).toBe(1.01)
    expect(round2(0.125)).toBe(0.13)
  })
  it("gère les négatifs symétriquement (away from zero)", () => {
    expect(round2(-2.005)).toBe(-2.01)
  })
  it("idempotent sur un montant déjà à 2 décimales", () => {
    expect(round2(6677.28)).toBe(6677.28)
  })
})

describe("sumMoney — somme précise", () => {
  it("somme sans dérive sur beaucoup de centimes", () => {
    const cents = Array.from({ length: 100 }, () => 0.01)
    expect(sumMoney(cents)).toBe(1)
  })
  it("ignore les valeurs nulles/indéfinies", () => {
    expect(sumMoney([100, null, 50, undefined, NaN])).toBe(150)
  })
  it("exemple rapprochement : 200000 + 165914.94 = 365914.94", () => {
    expect(sumMoney([200000, 165914.94])).toBe(365914.94)
  })
})

describe("add/sub/mul", () => {
  it("addMoney / subMoney", () => {
    expect(addMoney(365914.94, -53534.94)).toBe(312380)
    expect(subMoney(365914.94, 312380)).toBe(53534.94)
  })
  it("mulMoney — TVA 15%", () => {
    expect(mulMoney(1000, 0.15)).toBe(150)
    expect(mulMoney(33.33, 0.15)).toBe(5) // 4.9995 → 5.00
  })
})

describe("conversion de change", () => {
  it("convertToMUR — 6677.28 EUR × 46.78 (arrondi final unique)", () => {
    expect(convertToMUR(6677.28, 46.78)).toBe(312363.16)
  })
  it("convertFromMUR — aller-retour cohérent", () => {
    const mur = convertToMUR(1000, 46.5)
    expect(convertFromMUR(mur, 46.5)).toBe(1000)
  })
  it("taux ≤ 0 lève (pas de division silencieuse)", () => {
    expect(() => convertToMUR(100, 0)).toThrow(/Taux de change invalide/)
    expect(() => convertToMUR(100, -1)).toThrow()
    expect(() => convertFromMUR(100, 0)).toThrow()
  })
})

describe("équilibre partie double", () => {
  it("isBalanced vrai quand Σdébit = Σcrédit", () => {
    // 411 crédité 365914.94 ; 512 débité 312380 + 471 débité 53534.94
    expect(isBalanced([312380, 53534.94], [365914.94])).toBe(true)
  })
  it("isBalanced faux au-delà de la tolérance", () => {
    expect(isBalanced([100], [101])).toBe(false)
  })
  it("tolère une dérive d'1 centime", () => {
    expect(isBalanced([100.0], [100.01])).toBe(true)
    expect(isBalanced([100.0], [100.02])).toBe(false)
  })
  it("balanceDelta signé", () => {
    expect(balanceDelta([100, 50], [120])).toBe(30)
    expect(balanceDelta([120], [100, 50])).toBe(-30)
  })
})

describe("comparaison & format", () => {
  it("moneyEquals à 1 centime près", () => {
    expect(moneyEquals(100, 100.009)).toBe(true)
    expect(moneyEquals(100, 100.02)).toBe(false)
  })
  it("roundTo — taux 4 décimales", () => {
    expect(roundTo(46.78529, 4)).toBe(46.7853)
  })
  it("formatMoney fr-FR + devise", () => {
    // Intl utilise une espace fine insécable (U+202F) comme séparateur de
    // milliers — on normalise les espaces pour comparer le contenu.
    const norm = (s: string) => s.replace(/\s/g, " ")
    expect(norm(formatMoney(312380))).toBe("312 380,00 MUR")
    expect(norm(formatMoney(6677.28, "EUR"))).toBe("6 677,28 EUR")
    expect(norm(formatMoney(null, ""))).toBe("0,00")
  })
})
