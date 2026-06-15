import { describe, it, expect } from "vitest"
import { createMockSupabase } from "@/tests/__mocks__/supabase"
import { reclassEcritures, type ReclassParams } from "./reclass"
import { PCMError } from "./errors"

function params(o: Partial<ReclassParams> = {}): ReclassParams {
  return { societeId: "soc-1", fromCompte: "471", toCompte: "627", dryRun: true, ...o }
}

function seeded() {
  const m = createMockSupabase()
  m._seed("comptes_societes", [
    { societe_id: "soc-1", numero: "627", intitule: "Services bancaires", archive: false },
    { societe_id: "soc-1", numero: "999", intitule: "Archivé", archive: true },
  ])
  m._seed("ecritures_comptables_v2", [
    { id: "e1", societe_id: "soc-1", numero_compte: "471", journal: "BNQ", date_ecriture: "2026-05-01", libelle: "Frais X", debit_mur: 250, credit_mur: 0 },
    { id: "e2", societe_id: "soc-1", numero_compte: "471", journal: "BNQ", date_ecriture: "2026-05-10", libelle: "Frais Y", debit_mur: 150, credit_mur: 0 },
    { id: "e3", societe_id: "soc-1", numero_compte: "512", journal: "BNQ", date_ecriture: "2026-05-10", libelle: "Autre", debit_mur: 999, credit_mur: 0 },
  ])
  return m
}

describe("reclassEcritures — garde-fous", () => {
  it("compte source == cible → PCMError", async () => {
    await expect(reclassEcritures(seeded(), params({ fromCompte: "471", toCompte: "471" })))
      .rejects.toBeInstanceOf(PCMError)
  })
  it("compte cible introuvable → PCMError", async () => {
    await expect(reclassEcritures(seeded(), params({ toCompte: "888" }))).rejects.toBeInstanceOf(PCMError)
  })
  it("compte cible archivé → PCMError", async () => {
    await expect(reclassEcritures(seeded(), params({ toCompte: "999" }))).rejects.toBeInstanceOf(PCMError)
  })
})

describe("reclassEcritures — dry-run", () => {
  it("compte les écritures du compte source + totaux, sans UPDATE", async () => {
    const m = seeded()
    const r = await reclassEcritures(m, params({ dryRun: true }))
    expect(r.dry_run).toBe(true)
    expect(r.nb_ecritures).toBe(2) // e1, e2 (pas e3 sur 512)
    expect(r.total_debit).toBe(400)
    expect(r.executed).toBe(0)
    expect(r.sample).toHaveLength(2)
    expect(m._state.updates).toHaveLength(0) // aucun UPDATE en dry-run
  })
})

describe("reclassEcritures — exécution", () => {
  it("UPDATE numero_compte/nom_compte, executed = nb mis à jour", async () => {
    const m = seeded()
    const r = await reclassEcritures(m, params({ dryRun: false }))
    expect(r.executed).toBe(2)
    // les écritures 471 sont désormais sur 627
    const e1 = m._state.tables["ecritures_comptables_v2"].find((x: any) => x.id === "e1")
    expect(e1.numero_compte).toBe("627")
    expect(e1.nom_compte).toBe("Services bancaires")
    // e3 (512) intact
    expect(m._state.tables["ecritures_comptables_v2"].find((x: any) => x.id === "e3").numero_compte).toBe("512")
  })

  it("⚠️ AUCUN audit log émis par le helper (lacune de traçabilité connue)", async () => {
    // Documente le finding : reclass fait un UPDATE de masse sans écrire dans
    // une table d'audit. Si ce comportement change (ajout d'un pcm_audit_log),
    // ce test devra être mis à jour — il sert de garde sur la régression inverse.
    const m = seeded()
    await reclassEcritures(m, params({ dryRun: false }))
    const auditWrites = m._state.inserts.filter((i) => /audit/i.test(i.table))
    expect(auditWrites).toHaveLength(0)
  })

  it("propage l'erreur d'UPDATE en PCMError", async () => {
    const m = createMockSupabase({ errorOn: ({ table, kind }) => (table === "ecritures_comptables_v2" && kind === "update" ? { message: "locked" } : null) })
    m._seed("comptes_societes", [{ societe_id: "soc-1", numero: "627", intitule: "Services", archive: false }])
    m._seed("ecritures_comptables_v2", [{ id: "e1", societe_id: "soc-1", numero_compte: "471", journal: "BNQ", date_ecriture: "2026-05-01", libelle: "F", debit_mur: 250, credit_mur: 0 }])
    await expect(reclassEcritures(m, params({ dryRun: false }))).rejects.toBeInstanceOf(PCMError)
  })
})

describe("reclassEcritures — filtres", () => {
  it("filtre par journal + plage de dates", async () => {
    const m = seeded()
    const r = await reclassEcritures(m, params({ filter: { journal: "BNQ", date_debut: "2026-05-05", date_fin: "2026-05-31" } }))
    expect(r.nb_ecritures).toBe(1) // seul e2 (10/05) dans la fenêtre
  })
})
