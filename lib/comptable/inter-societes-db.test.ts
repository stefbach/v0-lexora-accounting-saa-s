import { describe, it, expect } from "vitest"
import { createMockSupabase } from "@/tests/__mocks__/supabase"
import { getSocietesDuMemeGroupe, resolveInterSocieteForTransaction } from "./inter-societes"

function mock(rows: any[]) {
  const m = createMockSupabase()
  m._seed("societes", rows)
  return m
}

describe("getSocietesDuMemeGroupe", () => {
  it("societe_id vide → []", async () => {
    expect(await getSocietesDuMemeGroupe(mock([]), "")).toEqual([])
  })

  it("source introuvable → []", async () => {
    expect(await getSocietesDuMemeGroupe(mock([]), "soc-x")).toEqual([])
  })

  it("priorité groupe_id : renvoie les sociétés du même groupe (hors soi)", async () => {
    const m = mock([
      { id: "s1", nom: "Holding", groupe_id: "g1", client_id: "c1" },
      { id: "s2", nom: "Filiale A", groupe_id: "g1", client_id: "c1" },
      { id: "s3", nom: "Filiale B", groupe_id: "g1", client_id: "c2" },
      { id: "s4", nom: "Hors groupe", groupe_id: "g2", client_id: "c1" },
    ])
    const res = await getSocietesDuMemeGroupe(m, "s1")
    const ids = res.map((r) => r.id).sort()
    expect(ids).toEqual(["s2", "s3"]) // s1 exclu, s4 autre groupe
  })

  it("fallback client_id quand pas de groupe_id", async () => {
    const m = mock([
      { id: "s1", nom: "Iso 1", groupe_id: null, client_id: "c9" },
      { id: "s2", nom: "Iso 2", groupe_id: null, client_id: "c9" },
      { id: "s3", nom: "Autre client", groupe_id: null, client_id: "c8" },
    ])
    const res = await getSocietesDuMemeGroupe(m, "s1")
    expect(res.map((r) => r.id)).toEqual(["s2"])
  })

  it("ni groupe_id ni client_id → []", async () => {
    const m = mock([{ id: "s1", nom: "Seule", groupe_id: null, client_id: null }])
    expect(await getSocietesDuMemeGroupe(m, "s1")).toEqual([])
  })
})

describe("resolveInterSocieteForTransaction", () => {
  it("aucune société liée → is_inter false / method none", async () => {
    const m = mock([{ id: "s1", nom: "Seule", groupe_id: null, client_id: null }])
    const r = await resolveInterSocieteForTransaction(m, "s1", "VIR ACME", "ACME")
    expect(r.is_inter).toBe(false)
    expect(r.match_method).toBe("none")
    expect(r.score).toBe(0)
  })

  it("société liée dont le nom matche le libellé → is_inter true", async () => {
    const m = mock([
      { id: "s1", nom: "Holding Ltd", groupe_id: "g1", client_id: "c1" },
      { id: "s2", nom: "ACME Trading Ltd", groupe_id: "g1", client_id: "c1" },
    ])
    const r = await resolveInterSocieteForTransaction(m, "s1", "VIREMENT ACME TRADING LTD", "ACME TRADING")
    expect(r.is_inter).toBe(true)
    expect(r.societe_dest_id).toBe("s2")
    expect(r.score).toBeGreaterThan(0)
  })
})
