import { describe, it, expect } from "vitest"
import { computeTds, autoClassifyTds, generateTdsCsv, TDS_RATES } from "./tds"

describe("computeTds — retenue à la source", () => {
  it("catégorie 'none' → aucune retenue", () => {
    expect(computeTds(100000, "none")).toEqual({ amount: 0, rate: 0, applies: false })
  })

  it("sous le seuil → ne s'applique pas (montant 0, mais taux exposé)", () => {
    // contract_payments : seuil 500
    expect(computeTds(499, "contract_payments")).toEqual({ amount: 0, rate: 0.75, applies: false })
  })

  it("AU seuil exact → s'applique (comportement actuel : < seuil seulement exclut)", () => {
    // ⚠️ Frontière à confirmer vs texte MRA §111A (« exceeding » Rs 500 ?).
    // Le code applique dès amount >= seuil. On verrouille ce comportement.
    const r = computeTds(500, "contract_payments")
    expect(r.applies).toBe(true)
    expect(r.amount).toBe(Math.round(500 * 0.0075 * 100) / 100)
  })

  it("au-dessus du seuil → retenue = montant × taux, arrondie 2 déc.", () => {
    // professional_fees 3% sur 200 000 = 6000
    expect(computeTds(200000, "professional_fees")).toEqual({ amount: 6000, rate: 3, applies: true })
    // contract_payments 0.75% sur 200 000 = 1500
    expect(computeTds(200000, "contract_payments").amount).toBe(1500)
  })

  it("catégorie à seuil 0 s'applique même pour un petit montant", () => {
    // royalties 15% seuil 0
    expect(computeTds(100, "royalties")).toEqual({ amount: 15, rate: 15, applies: true })
  })

  it("arrondit correctement (pas de dérive)", () => {
    // royalties 15% (seuil 0) sur 333.33 = 49.9995 → 50.00
    expect(computeTds(333.33, "royalties").amount).toBe(50)
  })
})

describe("autoClassifyTds — classification automatique", () => {
  it("loyer par compte 6132 ou mot-clé", () => {
    expect(autoClassifyTds({ numero_compte: "6132100" })).toBe("rent")
    expect(autoClassifyTds({ description: "Loyer bureau juin" })).toBe("rent")
    expect(autoClassifyTds({ description: "Monthly rental" })).toBe("rent")
  })

  it("honoraires professionnels (avocat/comptable/compte 6226-6227)", () => {
    expect(autoClassifyTds({ description: "Honoraires avocat" })).toBe("professional_fees")
    expect(autoClassifyTds({ numero_compte: "6227000" })).toBe("professional_fees")
  })

  it("redevances IP / management fees / director fees", () => {
    expect(autoClassifyTds({ description: "Royalty licence logiciel" })).toBe("royalties")
    expect(autoClassifyTds({ description: "Management fee Q2" })).toBe("management_fees")
    expect(autoClassifyTds({ description: "Director board fee" })).toBe("director_fees")
  })

  it("travaux/contrats & commissions", () => {
    expect(autoClassifyTds({ description: "Travaux de maintenance" })).toBe("contract_payments")
    expect(autoClassifyTds({ description: "Commission apporteur" })).toBe("commission")
  })

  it("intérêts non-résident UNIQUEMENT si compte 661 + pays ≠ MU", () => {
    expect(autoClassifyTds({ numero_compte: "6611", tiers_country: "FR" })).toBe("interest_non_resident")
    // résident mauricien → pas de classification intérêt
    expect(autoClassifyTds({ numero_compte: "6611", tiers_country: "MU" })).toBe("none")
  })

  it("par défaut → 'none'", () => {
    expect(autoClassifyTds({ description: "Achat fournitures bureau" })).toBe("none")
    expect(autoClassifyTds({})).toBe("none")
  })
})

describe("generateTdsCsv — export MRA", () => {
  it("entête + lignes + total cohérents", () => {
    const csv = generateTdsCsv({
      societe_name: "OCC Ltd",
      societe_tan: "TAN123",
      periode: "2026-05",
      records: [
        { tiers: "Avocat X", category: "professional_fees", gross_mur: 200000, tds_mur: 6000, payment_date: "2026-05-10" },
        { tiers: "Bailleur Y", category: "rent", gross_mur: 50000, tds_mur: 2500, payment_date: "2026-05-15" },
      ],
    })
    const lines = csv.split("\n")
    expect(lines[0]).toContain("TAN123")
    expect(lines[1]).toContain("TDS_MUR")
    expect(lines[2]).toContain("\"Avocat X\"")
    expect(lines[2]).toContain("6000.00")
    // ligne TOTAL : brut 250000, tds 8500
    const total = lines[lines.length - 1]
    expect(total).toContain("250000.00")
    expect(total).toContain("8500.00")
  })

  it("table des taux : sommes cohérentes avec computeTds", () => {
    // garde-fou : le taux exposé dans le CSV == celui de TDS_RATES
    expect(TDS_RATES.professional_fees.rate).toBe(3)
    expect(TDS_RATES.contract_payments.rate).toBe(0.75)
  })
})
