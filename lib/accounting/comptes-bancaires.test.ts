import { describe, it, expect } from "vitest"
import { getCompteComptable, isCanonicalCompteComptable } from "./comptes-bancaires"

describe("getCompteComptable — génération 512<banque><devise>", () => {
  it("exemples documentés", () => {
    expect(getCompteComptable("Mauritius Commercial Bank", "MUR")).toBe("512100")
    expect(getCompteComptable("MCB", "EUR")).toBe("512101")
    expect(getCompteComptable("SBM", "USD")).toBe("512202")
    expect(getCompteComptable("HSBC Mauritius", "EUR")).toBe("512801")
  })

  it("banque inconnue → code 99", () => {
    expect(getCompteComptable("Banque Imaginaire", "MUR")).toBe("512990")
  })

  it("devise inconnue → code 9", () => {
    expect(getCompteComptable("MCB", "XYZ")).toBe("512109")
  })

  it("tolère le bruit OCR / variations de nommage", () => {
    expect(getCompteComptable("Mauritius Commercial Bank Ltd.", "MUR")).toBe("512100")
    expect(getCompteComptable("standard chartered", "USD")).toBe("512702")
    expect(getCompteComptable("ABSA Bank (ex-Barclays)", "MUR")).toBe("512300")
  })

  it("null/undefined → fallback banque 99 + devise MUR (0)", () => {
    expect(getCompteComptable(null, null)).toBe("512990")
    expect(getCompteComptable(undefined, "EUR")).toBe("512991")
  })

  it("toujours 6 digits format 512xxx", () => {
    for (const b of ["MCB", "SBM", "HSBC", "Inconnu", ""]) {
      for (const d of ["MUR", "EUR", "USD", "ZZZ", ""]) {
        expect(getCompteComptable(b, d)).toMatch(/^512\d{3}$/)
      }
    }
  })
})

describe("isCanonicalCompteComptable", () => {
  it("vrai pour 512xxx", () => {
    expect(isCanonicalCompteComptable("512100")).toBe(true)
    expect(isCanonicalCompteComptable("512990")).toBe(true)
  })
  it("faux pour autre chose / vide", () => {
    expect(isCanonicalCompteComptable("411000")).toBe(false)
    expect(isCanonicalCompteComptable("51210")).toBe(false) // 5 digits
    expect(isCanonicalCompteComptable("512100A")).toBe(false)
    expect(isCanonicalCompteComptable(null)).toBe(false)
    expect(isCanonicalCompteComptable("")).toBe(false)
  })
})
