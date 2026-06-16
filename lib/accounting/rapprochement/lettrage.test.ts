import { describe, it, expect } from "vitest"
import { createMockSupabase } from "@/tests/__mocks__/supabase"
import {
  resolveCompteForClassification,
  lettrageCroiseTolerance,
  selectClosestByDate,
  computeEcartCompte,
  ecartRequiresQualification,
  genLettreCode,
  payTypeFromFactureType,
  txAbsoluteAmount,
  findAchCandidatesForBnq,
  CLASSIFICATIONS_AVEC_LETTRAGE_CROISE,
} from "./lettrage"

describe("resolveCompteForClassification", () => {
  it("mappe les classifications connues, sinon 471", () => {
    expect(resolveCompteForClassification("perte_change")).toBe("666")
    expect(resolveCompteForClassification("gain_change")).toBe("766")
    expect(resolveCompteForClassification("inconnue")).toBe("471")
  })
})

describe("lettrageCroiseTolerance", () => {
  it("plancher 0.5 MUR, sinon 0.5%", () => {
    expect(lettrageCroiseTolerance(50)).toBe(0.5) // 0.25 < 0.5 → plancher
    expect(lettrageCroiseTolerance(10000)).toBe(50) // 0.5%
  })
})

describe("selectClosestByDate", () => {
  it("null si vide", () => {
    expect(selectClosestByDate([], new Date("2026-05-10"))).toBeNull()
  })
  it("choisit le candidat le plus proche en date", () => {
    const c = [
      { id: "a", date_ecriture: "2026-05-01" },
      { id: "b", date_ecriture: "2026-05-09" },
      { id: "c", date_ecriture: "2026-06-01" },
    ]
    expect(selectClosestByDate(c, new Date("2026-05-10"))?.id).toBe("b")
  })
})

describe("computeEcartCompte — routage + sens", () => {
  it("auto < 100 MUR → 758 (gain) / 658 (perte), régularisation", () => {
    const gain = computeEcartCompte(50, 50, "L1", undefined)
    expect(gain.compte).toBe("758")
    expect(gain.credit).toBe(50)
    const perte = computeEcartCompte(50, -50, "L1", undefined)
    expect(perte.compte).toBe("658")
  })
  it("change → 766 gain (7→crédit) / 666 perte (6→débit)", () => {
    const gain = computeEcartCompte(500, 500, "L1", "change")
    expect(gain.compte).toBe("766")
    expect(gain.credit).toBe(500)
    expect(gain.debit).toBe(0)
    const perte = computeEcartCompte(500, -500, "L1", "change")
    expect(perte.compte).toBe("666")
    expect(perte.debit).toBe(500)
  })
  it("escompte 765/665, penalite 631, exceptionnel 758/658", () => {
    expect(computeEcartCompte(500, 500, "L", "escompte").compte).toBe("765")
    expect(computeEcartCompte(500, -500, "L", "escompte").compte).toBe("665")
    expect(computeEcartCompte(500, -500, "L", "penalite").compte).toBe("631")
    expect(computeEcartCompte(500, 500, "L", "exceptionnel").compte).toBe("758")
  })
  it("a_regulariser → 471, sens 4xxx = inverse du signe (neutralise 411/401)", () => {
    const pos = computeEcartCompte(500, 500, "L", "a_regulariser")
    expect(pos.compte).toBe("471")
    expect(pos.credit).toBe(500) // signe > 0 → crédit
    const neg = computeEcartCompte(500, -500, "L", "a_regulariser")
    expect(neg.debit).toBe(500)
  })
})

describe("ecartRequiresQualification — règle R4", () => {
  it("typeEcart fourni → déjà qualifié (false)", () => {
    expect(ecartRequiresQualification(5000, 100000, "change")).toBe(false)
  })
  it("petit écart (≤ 100 MUR ou ≤ 2%) → false", () => {
    expect(ecartRequiresQualification(50, 100000, undefined)).toBe(false)
    expect(ecartRequiresQualification(150, 100000, undefined)).toBe(false) // 0.15% < 2%
  })
  it("écart > 100 ET > 2% → true (qualification requise)", () => {
    expect(ecartRequiresQualification(5000, 100000, undefined)).toBe(true)
  })
})

describe("helpers divers", () => {
  it("genLettreCode : préfixe + 4 chiffres", () => {
    expect(genLettreCode("RM")).toMatch(/^RM\d{4}$/)
    expect(genLettreCode("M")).toMatch(/^M\d{4}$/)
  })
  it("payTypeFromFactureType", () => {
    expect(payTypeFromFactureType("fournisseur")).toBe("supplier")
    expect(payTypeFromFactureType("client")).toBe("client")
    expect(payTypeFromFactureType(null)).toBe("client")
  })
  it("txAbsoluteAmount : max(debit, credit)", () => {
    expect(txAbsoluteAmount({ debit: 0, credit: 3120 })).toBe(3120)
    expect(txAbsoluteAmount({ debit: 500, credit: 0 })).toBe(500)
    expect(txAbsoluteAmount({})).toBe(0)
  })
  it("CLASSIFICATIONS_AVEC_LETTRAGE_CROISE contient salaire & MRA", () => {
    expect(CLASSIFICATIONS_AVEC_LETTRAGE_CROISE.has("salaire")).toBe(true)
    expect(CLASSIFICATIONS_AVEC_LETTRAGE_CROISE.has("paiement_mra")).toBe(true)
    expect(CLASSIFICATIONS_AVEC_LETTRAGE_CROISE.has("achat")).toBe(false)
  })
})

describe("findAchCandidatesForBnq — contrepartie ACH (DB mock)", () => {
  it("BNQ débit → cherche un crédit opposé non lettré ±2%, trié date desc", async () => {
    const m = createMockSupabase()
    m._seed("ecritures_comptables_v2", [
      { id: "x1", dossier_id: "d1", compte: "401", lettre: null, credit: 10000, debit: 0, date_ecriture: "2026-05-01" },
      { id: "x2", dossier_id: "d1", compte: "401", lettre: null, credit: 10100, debit: 0, date_ecriture: "2026-05-09" },
      { id: "x3", dossier_id: "d1", compte: "401", lettre: "DEJA", credit: 10000, debit: 0, date_ecriture: "2026-05-05" }, // lettré → exclu
      { id: "x4", dossier_id: "d1", compte: "401", lettre: null, credit: 50000, debit: 0, date_ecriture: "2026-05-08" }, // hors ±2%
    ])
    const res = await findAchCandidatesForBnq(m as any, { dossierId: "d1", compte: "401", bnqAmount: 10000, isDebit: true })
    const ids = res.map((r) => r.id)
    expect(ids).toContain("x1")
    expect(ids).toContain("x2")
    expect(ids).not.toContain("x3") // déjà lettré
    expect(ids).not.toContain("x4") // montant trop éloigné
    // trié date desc → x2 (09) avant x1 (01)
    expect(ids.indexOf("x2")).toBeLessThan(ids.indexOf("x1"))
  })
})
