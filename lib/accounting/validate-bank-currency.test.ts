import { describe, it, expect } from "vitest"
import {
  isValidCurrency,
  resolveBankCurrency,
  compareCurrency,
  BankCurrencyError,
  SUPPORTED_CURRENCIES,
} from "./validate-bank-currency"

describe("isValidCurrency", () => {
  it("accepte les devises supportées (insensible casse/espaces)", () => {
    expect(isValidCurrency("EUR")).toBe(true)
    expect(isValidCurrency("eur")).toBe(true)
    expect(isValidCurrency(" mur ")).toBe(true)
  })
  it("rejette inconnu / non-string", () => {
    expect(isValidCurrency("JPYX")).toBe(false)
    expect(isValidCurrency("BTC")).toBe(false)
    expect(isValidCurrency(123)).toBe(false)
    expect(isValidCurrency(null)).toBe(false)
  })
  it("toutes les SUPPORTED_CURRENCIES sont valides", () => {
    for (const c of SUPPORTED_CURRENCIES) expect(isValidCurrency(c)).toBe(true)
  })
})

describe("resolveBankCurrency — priorité stricte, pas de fallback MUR", () => {
  it("utilise la devise extraite si valide", () => {
    const r = resolveBankCurrency({ extractedDevise: "eur" })
    expect(r).toMatchObject({ currency: "EUR", source: "extraction", confident: true })
  })
  it("fallback IBAN UNIQUEMENT pour pays whitelisté (MU)", () => {
    const r = resolveBankCurrency({ extractedDevise: "", iban: "MU17BOMM0101101030300200000USD" })
    expect(r).toMatchObject({ currency: "USD", source: "iban", confident: true })
  })
  it("refuse le suffixe IBAN d'un pays NON whitelisté (faux positif)", () => {
    // IBAN FR finissant par 'EUR' par coïncidence → refusé
    const r = resolveBankCurrency({ extractedDevise: "", iban: "FR7630006000011234567890EUR" })
    expect(r.confident).toBe(false)
    expect(r.currency).toBeNull()
  })
  it("extraction vide + IBAN inéligible → null + raison (PAS de MUR silencieux)", () => {
    const r = resolveBankCurrency({ extractedDevise: "", iban: null })
    expect(r.confident).toBe(false)
    expect(r.currency).toBeNull()
    if (!r.confident) expect(r.reason).toMatch(/revue humaine|fallback MUR/i)
  })
})

describe("compareCurrency — détection de conflit", () => {
  it("match quand identiques", () => {
    expect(compareCurrency("EUR", "eur")).toBe("match")
  })
  it("conflict quand deux valeurs connues différentes", () => {
    expect(compareCurrency("EUR", "USD")).toBe("conflict")
  })
  it("no_existing quand seule la nouvelle est connue", () => {
    expect(compareCurrency(null, "USD")).toBe("no_existing")
  })
  it("no_new quand seule l'existante est connue, ou aucune", () => {
    expect(compareCurrency("EUR", null)).toBe("no_new")
    expect(compareCurrency(null, null)).toBe("no_new")
  })
})

describe("BankCurrencyError", () => {
  it("porte un code typé", () => {
    const e = new BankCurrencyError("conflit", "CONFLICT")
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe("CONFLICT")
    expect(e.name).toBe("BankCurrencyError")
  })
})
