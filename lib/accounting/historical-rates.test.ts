import { describe, it, expect, beforeEach } from "vitest"
import { createMockSupabase } from "@/tests/__mocks__/supabase"
import {
  getHistoricalRate,
  getHistoricalRatesForDates,
  MissingHistoricalRateError,
  _clearHistoricalRateCache,
} from "./historical-rates"

// Le cache est process-wide → on le purge avant chaque test pour l'isolation.
beforeEach(() => _clearHistoricalRateCache())

function seeded() {
  const m = createMockSupabase()
  m._seed("taux_change_historique", [
    { devise: "EUR", date_taux: "2025-11-01", taux_vers_mur: 53.0 },
    { devise: "EUR", date_taux: "2025-11-10", taux_vers_mur: 53.5 },
    { devise: "USD", date_taux: "2026-01-01", taux_vers_mur: 46.5 },
  ])
  return m
}

describe("getHistoricalRate", () => {
  it("MUR → 1 sans requête DB", async () => {
    const m = seeded()
    expect(await getHistoricalRate(m, "2025-11-15", "MUR")).toBe(1)
    expect(m._state.selects).toHaveLength(0)
  })

  it("taux exact à la date", async () => {
    expect(await getHistoricalRate(seeded(), "2025-11-10", "EUR")).toBe(53.5)
  })

  it("carry-over : prend le taux le plus récent ≤ date", async () => {
    const m = seeded()
    expect(await getHistoricalRate(m, "2025-11-15", "EUR")).toBe(53.5) // 11-10
    _clearHistoricalRateCache()
    expect(await getHistoricalRate(m, "2025-11-05", "EUR")).toBe(53.0) // 11-01
  })

  it("insensible à la casse + tronque l'ISO complet", async () => {
    expect(await getHistoricalRate(seeded(), "2025-11-10T08:30:00Z", "eur")).toBe(53.5)
  })

  it("aucun taux ≤ date → MissingHistoricalRateError", async () => {
    await expect(getHistoricalRate(seeded(), "2025-01-01", "EUR")).rejects.toBeInstanceOf(MissingHistoricalRateError)
  })

  it("met en cache : 2e appel ne requête plus la DB", async () => {
    const m = seeded()
    await getHistoricalRate(m, "2025-11-10", "EUR")
    const after1 = m._state.selects.length
    await getHistoricalRate(m, "2025-11-10", "EUR")
    expect(m._state.selects.length).toBe(after1) // pas de nouvelle requête
  })

  it("erreur DB → remonte (pas de fallback silencieux)", async () => {
    const m = createMockSupabase({ errorOn: ({ table }) => (table === "taux_change_historique" ? { message: "boom" } : null) })
    await expect(getHistoricalRate(m, "2025-11-10", "EUR")).rejects.toThrow(/boom/)
  })
})

describe("getHistoricalRatesForDates — batch", () => {
  it("vide → {}", async () => {
    expect(await getHistoricalRatesForDates(seeded(), [])).toEqual({})
  })

  it("MUR résolu localement à 1", async () => {
    const r = await getHistoricalRatesForDates(seeded(), [{ date: "2026-02-02", devise: "MUR" }])
    expect(r["2026-02-02|MUR"]).toBe(1)
  })

  it("plusieurs dates même devise → carry-over correct", async () => {
    const r = await getHistoricalRatesForDates(seeded(), [
      { date: "2025-11-15", devise: "EUR" },
      { date: "2025-11-05", devise: "EUR" },
      { date: "2026-01-05", devise: "USD" },
    ])
    expect(r["2025-11-15|EUR"]).toBe(53.5)
    expect(r["2025-11-05|EUR"]).toBe(53.0)
    expect(r["2026-01-05|USD"]).toBe(46.5)
  })

  it("tuple sans taux → omis du résultat", async () => {
    const r = await getHistoricalRatesForDates(seeded(), [{ date: "2025-01-01", devise: "EUR" }])
    expect(r["2025-01-01|EUR"]).toBeUndefined()
  })
})

describe("MissingHistoricalRateError", () => {
  it("porte date + devise", () => {
    const e = new MissingHistoricalRateError("2025-01-01", "EUR")
    expect(e.date).toBe("2025-01-01")
    expect(e.devise).toBe("EUR")
    expect(e.name).toBe("MissingHistoricalRateError")
  })
})
