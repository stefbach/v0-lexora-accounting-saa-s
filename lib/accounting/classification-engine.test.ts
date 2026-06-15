import { describe, it, expect } from "vitest"
import {
  classifyTransaction,
  detectDirector,
  getComplianceSeverity,
  type ClassificationRule,
  type BankTransaction,
} from "./classification-engine"

function rule(o: Partial<ClassificationRule> = {}): ClassificationRule {
  return {
    id: "r1",
    rule_code: "R01",
    societe_id: null,
    priority: 1,
    active: true,
    pattern_libelle: null,
    pattern_tiers: null,
    pattern_journal: null,
    amount_min: null,
    amount_max: null,
    classification: "frais_bancaires",
    compte_debit: "627",
    compte_credit: "512",
    libelle_template: null,
    requires_validation: false,
    compliance_flag: null,
    legal_warning: null,
    ...o,
  }
}

function tx(o: Partial<BankTransaction> = {}): BankTransaction {
  return { date: "2026-05-10", libelle: "FRAIS BANCAIRES", tiers_detecte: null, debit: 250, credit: 0, devise: "MUR", ...o }
}

describe("classifyTransaction", () => {
  it("matche par pattern libellé (regex/substring séparés par |)", () => {
    const r = classifyTransaction(tx({ libelle: "Commission MCB" }), [
      rule({ pattern_libelle: "frais|commission" }),
    ])
    expect(r.matched).toBe(true)
    expect(r.compte_debit).toBe("627")
  })

  it("respecte l'ordre de priorité (plus petit d'abord)", () => {
    const r = classifyTransaction(tx({ libelle: "PAIEMENT X" }), [
      rule({ rule_code: "R05", priority: 5, pattern_libelle: "paiement", classification: "B" }),
      rule({ rule_code: "R02", priority: 2, pattern_libelle: "paiement", classification: "A" }),
    ])
    expect(r.rule_code).toBe("R02")
    expect(r.classification).toBe("A")
  })

  it("ignore les règles inactives", () => {
    const r = classifyTransaction(tx({ libelle: "loyer" }), [
      rule({ active: false, pattern_libelle: "loyer" }),
    ])
    expect(r.matched).toBe(false)
  })

  it("filtre par montant min/max", () => {
    const rules = [rule({ pattern_libelle: "paie", amount_min: 1000, amount_max: 5000 })]
    expect(classifyTransaction(tx({ libelle: "paie", debit: 500 }), rules).matched).toBe(false)
    expect(classifyTransaction(tx({ libelle: "paie", debit: 6000 }), rules).matched).toBe(false)
    expect(classifyTransaction(tx({ libelle: "paie", debit: 3000 }), rules).matched).toBe(true)
  })

  it("matche par tiers", () => {
    const r = classifyTransaction(tx({ libelle: "VIR", tiers_detecte: "Mauritius Telecom" }), [
      rule({ pattern_tiers: "telecom|emtel" }),
    ])
    expect(r.matched).toBe(true)
  })

  it("interpole le libellé template ({{tiers}})", () => {
    const r = classifyTransaction(tx({ libelle: "VIR", tiers_detecte: "ACME" }), [
      rule({ pattern_libelle: "vir", libelle_template: "Règlement {{tiers}}" }),
    ])
    expect(r.libelle).toBe("Règlement ACME")
  })

  it("aucun match → { matched: false }", () => {
    expect(classifyTransaction(tx({ libelle: "inconnu" }), [rule({ pattern_libelle: "loyer" })])).toEqual({ matched: false })
  })

  it("propage compliance_flag / legal_warning / requires_validation", () => {
    const r = classifyTransaction(tx({ libelle: "pret dirigeant" }), [
      rule({ pattern_libelle: "pret dirigeant", requires_validation: true, compliance_flag: "director_loan", legal_warning: "Companies Act s.166" }),
    ])
    expect(r.requires_validation).toBe(true)
    expect(r.compliance_flag).toBe("director_loan")
    expect(r.legal_warning).toMatch(/s.166/)
  })
})

describe("detectDirector", () => {
  const directors = [{ id: "d1", nom_complet: "Stephane Henri Bach", role: "admin" }]

  it("matche par ≥ 2 mots du nom dans le tiers", () => {
    const r = detectDirector(tx({ tiers_detecte: "MR STEPHANE BACH" }), directors)
    expect(r?.matched).toBe(true)
    expect(r?.director_id).toBe("d1")
  })

  it("ne matche pas un tiers sans rapport", () => {
    expect(detectDirector(tx({ tiers_detecte: "MAURITIUS TELECOM" }), directors)).toBeNull()
  })

  it("ignore les noms trop courts", () => {
    expect(detectDirector(tx({ tiers_detecte: "ABC" }), [{ id: "d2", nom_complet: "Li", role: "admin" }])).toBeNull()
  })
})

describe("getComplianceSeverity", () => {
  it("critical pour director_loan / unbalanced_od", () => {
    expect(getComplianceSeverity("director_loan")).toBe("critical")
    expect(getComplianceSeverity("unbalanced_od")).toBe("critical")
  })
  it("partial_payment selon le montant", () => {
    expect(getComplianceSeverity("partial_payment", 20000)).toBe("high")
    expect(getComplianceSeverity("partial_payment", 5000)).toBe("medium")
  })
  it("high tds_missing, medium period_locked, low par défaut", () => {
    expect(getComplianceSeverity("tds_missing")).toBe("high")
    expect(getComplianceSeverity("period_locked")).toBe("medium")
    expect(getComplianceSeverity("inconnu")).toBe("low")
  })
})
