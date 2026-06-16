import { describe, it, expect } from "vitest"
import { computeFxRealiseEntry } from "./ecritures-factures"
import { isBalanced } from "@/lib/money"

/**
 * Régression du bug d'écart de change réalisé : l'ancienne logique débitait à
 * la fois le tiers (411/401) ET le compte de change (666) → écriture
 * déséquilibrée (Σdébit = 2×|écart|, Σcrédit = 0) et tiers non soldé.
 * Le tiers doit prendre le sens OPPOSÉ du compte de change.
 */
describe("computeFxRealiseEntry — équilibre & sens", () => {
  const cases = [
    { label: "client perte (taux baissé, payé moins en MUR)", ecart: -53534.94, isSupplier: false, gain: false, fxCompte: "666" },
    { label: "client gain (payé plus en MUR)", ecart: +1200.5, isSupplier: false, gain: true, fxCompte: "766" },
    { label: "fournisseur gain (payé moins)", ecart: -800, isSupplier: true, gain: true, fxCompte: "766" },
    { label: "fournisseur perte (payé plus)", ecart: +640.25, isSupplier: true, gain: false, fxCompte: "666" },
  ]

  for (const c of cases) {
    it(`${c.label} → équilibré`, () => {
      const fx = computeFxRealiseEntry(c.ecart, c.isSupplier)
      // La paire (tiers + change) doit être strictement équilibrée.
      expect(isBalanced([fx.tierDebit, fx.fxDebit], [fx.tierCredit, fx.fxCredit])).toBe(true)
      // Et jamais les deux du même côté (le bug initial).
      const totalDebit = fx.tierDebit + fx.fxDebit
      const totalCredit = fx.tierCredit + fx.fxCredit
      expect(totalDebit).toBeCloseTo(fx.absEcart, 2)
      expect(totalCredit).toBeCloseTo(fx.absEcart, 2)
    })

    it(`${c.label} → bon compte & sens`, () => {
      const fx = computeFxRealiseEntry(c.ecart, c.isSupplier)
      expect(fx.isGain).toBe(c.gain)
      expect(fx.compteFx).toBe(c.fxCompte)
      // Perte ⇒ change débité ; gain ⇒ change crédité.
      if (c.gain) {
        expect(fx.fxCredit).toBeGreaterThan(0)
        expect(fx.fxDebit).toBe(0)
        // tiers au sens opposé (débité)
        expect(fx.tierDebit).toBeGreaterThan(0)
        expect(fx.tierCredit).toBe(0)
      } else {
        expect(fx.fxDebit).toBeGreaterThan(0)
        expect(fx.fxCredit).toBe(0)
        expect(fx.tierCredit).toBeGreaterThan(0)
        expect(fx.tierDebit).toBe(0)
      }
    })
  }

  it("client perte : 411 crédité (soldé), 666 débité — cas du ticket", () => {
    // Facture 411 figée à factureMur, payée amount_mur < factureMur.
    // Résidu 411 débiteur de |écart| → doit être CRÉDITÉ pour solder.
    const fx = computeFxRealiseEntry(-53534.94, false)
    expect(fx.tierCredit).toBeCloseTo(53534.94, 2) // 411 crédité
    expect(fx.tierDebit).toBe(0)
    expect(fx.fxDebit).toBeCloseTo(53534.94, 2) // 666 débité
    expect(fx.compteFx).toBe("666")
  })

  it("arrondit |écart| à 2 décimales", () => {
    const fx = computeFxRealiseEntry(-100.12345, false)
    expect(fx.absEcart).toBe(100.12)
  })
})
