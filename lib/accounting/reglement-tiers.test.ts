import { describe, it, expect } from "vitest"
import { createMockSupabase } from "@/tests/__mocks__/supabase"
import { createEcrituresReglementTiers, type ReglementTiersParams } from "./reglement-tiers"
import { isBalanced } from "@/lib/money"

function params(o: Partial<ReglementTiersParams> = {}): ReglementTiersParams {
  return {
    societe_id: "soc-1",
    date_paiement: "2026-05-10",
    amount_mur: 10000,
    type: "supplier",
    tiers: "ACME Ltd",
    facture_id: "fac-1",
    facture_numero: "ACH-2026-001",
    compte_tiers: "455",
    nom_compte_tiers: "CCA Stéphane Bach",
    ref_folio: "REG-fac-1",
    lettre_code: "RT001",
    ...o,
  }
}

function mockWithDossier() {
  const m = createMockSupabase()
  m._seed("dossiers", [{ id: "doss-1", societe_id: "soc-1" }])
  return m
}

describe("createEcrituresReglementTiers — règlement hors banque", () => {
  it("FOURNISSEUR : D 401 / C 455, écriture équilibrée", async () => {
    const m = mockWithDossier()
    const r = await createEcrituresReglementTiers(m as any, params({ type: "supplier" }))
    expect(r.ok).toBe(true)
    const rows = m._state.inserts.flatMap((i) => i.rows)
    expect(rows).toHaveLength(2)
    const c401 = rows.find((x) => x.numero_compte === "401")
    const c455 = rows.find((x) => x.numero_compte === "455")
    expect(c401.debit_mur).toBe(10000)
    expect(c401.credit_mur).toBe(0)
    expect(c455.credit_mur).toBe(10000)
    expect(c455.debit_mur).toBe(0)
    expect(isBalanced(rows.map((x) => x.debit_mur), rows.map((x) => x.credit_mur))).toBe(true)
  })

  it("CLIENT : D 455 / C 411, écriture équilibrée", async () => {
    const m = mockWithDossier()
    const r = await createEcrituresReglementTiers(m as any, params({ type: "client", facture_id: "fac-2", ref_folio: "REG-fac-2" }))
    expect(r.ok).toBe(true)
    const rows = m._state.inserts.flatMap((i) => i.rows)
    const c411 = rows.find((x) => x.numero_compte === "411")
    const c455 = rows.find((x) => x.numero_compte === "455")
    expect(c411.credit_mur).toBe(10000)
    expect(c455.debit_mur).toBe(10000)
    expect(isBalanced(rows.map((x) => x.debit_mur), rows.map((x) => x.credit_mur))).toBe(true)
  })

  it("journal OD-TIERS + lettre + facture_id propagés", async () => {
    const m = mockWithDossier()
    await createEcrituresReglementTiers(m as any, params())
    const rows = m._state.inserts.flatMap((i) => i.rows)
    for (const x of rows) {
      expect(x.journal).toBe("OD-TIERS")
      expect(x.lettre).toBe("RT001")
      expect(x.facture_id).toBe("fac-1")
    }
  })

  it("idempotence : ref_folio déjà présent → pas de doublon", async () => {
    const m = mockWithDossier()
    m._seed("ecritures_comptables_v2", [{ id: "ex-1", societe_id: "soc-1", ref_folio: "REG-fac-1" }])
    const r = await createEcrituresReglementTiers(m as any, params())
    expect(r.ok).toBe(true)
    expect(r.ids).toEqual(["ex-1"])
    // aucune insertion
    expect(m._state.inserts).toHaveLength(0)
  })

  it("lettre le VTE/ACH d'origine (lettrage croisé via .like)", async () => {
    const m = mockWithDossier()
    // facture ACH d'origine, ligne 401 non lettrée
    m._seed("ecritures_comptables_v2", [
      { id: "ach-1", societe_id: "soc-1", facture_id: "fac-1", journal: "ACH", numero_compte: "401100", lettre: null },
    ])
    await createEcrituresReglementTiers(m as any, params({ type: "supplier" }))
    // une mise à jour ciblant la ligne 401% non lettrée doit avoir été émise
    const upd = m._state.updates.find((u) => u.patch.lettre === "RT001")
    expect(upd).toBeTruthy()
  })

  it("erreur d'insertion → { ok:false }", async () => {
    const m = createMockSupabase({ errorOn: ({ kind }) => (kind === "insert" ? { message: "insert failed" } : null) })
    m._seed("dossiers", [{ id: "doss-1", societe_id: "soc-1" }])
    const r = await createEcrituresReglementTiers(m as any, params())
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/insert failed/)
  })
})
