import { describe, it, expect } from "vitest"
import { convertToMUR, assertKnownCurrency, UnknownCurrencyError } from "./taux-change"

const RATES = { EUR: 46.5, USD: 44.8, GBP: 54.2 }

describe("convertToMUR — conversion vers MUR", () => {
  it("MUR → MUR : montant inchangé (pas de conversion)", () => {
    expect(convertToMUR(1000, "MUR", RATES)).toBe(1000)
    expect(convertToMUR(1000, "mur", RATES)).toBe(1000)
  })

  it("MULTIPLIE par le taux (garde-fou anti-inversion)", () => {
    // Régression : un bug d'inversion ferait 100/46.5 ≈ 2.15 au lieu de 4650.
    expect(convertToMUR(100, "EUR", RATES)).toBe(4650)
    expect(convertToMUR(100, "USD", RATES)).toBe(4480)
    // jamais la division
    expect(convertToMUR(100, "EUR", RATES)).not.toBeCloseTo(100 / 46.5, 2)
  })

  it("insensible à la casse du code devise", () => {
    expect(convertToMUR(10, "eur", RATES)).toBe(convertToMUR(10, "EUR", RATES))
  })

  it("montant 0 → 0", () => {
    expect(convertToMUR(0, "EUR", RATES)).toBe(0)
  })

  it("devise inconnue, mode non strict → fallback 1:1", () => {
    expect(convertToMUR(500, "JPY", RATES)).toBe(500)
  })

  it("devise inconnue, mode strict → lève UnknownCurrencyError", () => {
    expect(() => convertToMUR(500, "JPY", RATES, true)).toThrow(UnknownCurrencyError)
  })

  it("devise vide → montant inchangé (traité comme MUR)", () => {
    expect(convertToMUR(750, "", RATES)).toBe(750)
  })
})

describe("assertKnownCurrency — garde de devise", () => {
  it("passe pour une devise connue (insensible à la casse)", () => {
    expect(() => assertKnownCurrency("EUR", RATES)).not.toThrow()
    expect(() => assertKnownCurrency("usd", RATES)).not.toThrow()
  })

  it("lève pour une devise inconnue / vide", () => {
    expect(() => assertKnownCurrency("JPY", RATES)).toThrow(UnknownCurrencyError)
    expect(() => assertKnownCurrency("", RATES)).toThrow(UnknownCurrencyError)
  })

  it("UnknownCurrencyError porte la devise et la liste connue (debug)", () => {
    try {
      assertKnownCurrency("JPY", RATES)
      expect.unreachable("aurait dû lever")
    } catch (e) {
      expect(e).toBeInstanceOf(UnknownCurrencyError)
      const err = e as UnknownCurrencyError
      expect(err.devise).toBe("JPY")
      expect(err.knownCurrencies).toEqual(["EUR", "GBP", "USD"])
    }
  })
})
