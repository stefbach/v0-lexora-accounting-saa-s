/**
 * Suite 3 — Intégration : /api/client/financial doit utiliser le snapshot
 * de l'exercice N-1 quand celui-ci est clôturé.
 *
 * Contrat attendu (route à modifier après mig 422+423) :
 *
 *   exercice N-1 statut          | snapshot existant | data_source réponse
 *   -----------------------------+-------------------+--------------------
 *   cloture                      | oui               | 'snapshot'
 *   cloture                      | non               | 'live' (fallback)
 *   ouvert                       | (peu importe)     | 'live'
 *
 * Le format de réponse JSON doit comporter au minimum :
 *   { exercice, data_source, totaux: { actif, passif, resultat }, ... }
 *
 * On teste la logique de sélection (pure function) — la route Next.js
 * elle-même est testée en e2e (live DB) et donc skipped ici.
 */

import { describe, it, expect } from 'vitest'

// ──────────────────────────────────────────────────────────────────────
// Implémentation de référence — sélection de la source N-1
// (sera intégrée dans app/api/client/financial/route.ts par CLO-C)
// ──────────────────────────────────────────────────────────────────────

type ExerciceStatut = 'ouvert' | 'cloture'

type SnapshotPayload = {
  actif: number
  passif: number
  resultat: number
  [k: string]: any
}

type FinancialN1Result = {
  exercice: string
  data_source: 'snapshot' | 'live'
  totaux: { actif: number; passif: number; resultat: number }
}

interface Deps {
  // Récupère le statut de l’exercice N-1
  getExerciceStatut: (societeId: string, exercice: string) => Promise<ExerciceStatut | null>
  // Récupère le snapshot actif (ou null)
  getActiveSnapshot: (
    societeId: string,
    exercice: string,
  ) => Promise<SnapshotPayload | null>
  // Calcul live à partir des écritures
  computeLive: (
    societeId: string,
    exercice: string,
  ) => Promise<{ actif: number; passif: number; resultat: number }>
}

async function getFinancialN1(
  deps: Deps,
  args: { societe_id: string; exercice_n1: string },
): Promise<FinancialN1Result> {
  const statut = await deps.getExerciceStatut(args.societe_id, args.exercice_n1)

  if (statut === 'cloture') {
    const snap = await deps.getActiveSnapshot(args.societe_id, args.exercice_n1)
    if (snap) {
      return {
        exercice: args.exercice_n1,
        data_source: 'snapshot',
        totaux: {
          actif: snap.actif,
          passif: snap.passif,
          resultat: snap.resultat,
        },
      }
    }
    // Fallback live (cas exceptionnel : exo clôturé sans snapshot)
    const live = await deps.computeLive(args.societe_id, args.exercice_n1)
    return {
      exercice: args.exercice_n1,
      data_source: 'live',
      totaux: live,
    }
  }

  // Exo ouvert (ou inconnu) → live
  const live = await deps.computeLive(args.societe_id, args.exercice_n1)
  return {
    exercice: args.exercice_n1,
    data_source: 'live',
    totaux: live,
  }
}

// ──────────────────────────────────────────────────────────────────────
// Helpers de fixture
// ──────────────────────────────────────────────────────────────────────
function makeDeps(opts: {
  statut: ExerciceStatut | null
  snapshot: SnapshotPayload | null
  live: { actif: number; passif: number; resultat: number }
}): Deps {
  return {
    getExerciceStatut: async () => opts.statut,
    getActiveSnapshot: async () => opts.snapshot,
    computeLive: async () => opts.live,
  }
}

const ARGS = { societe_id: 'soc-A', exercice_n1: '2024-2025' }

// ──────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────
describe('financial N-1 — exercice clôturé + snapshot dispo', () => {
  it('utilise le snapshot (data_source = "snapshot")', async () => {
    const deps = makeDeps({
      statut: 'cloture',
      snapshot: { actif: 100_000, passif: 100_000, resultat: 15_000 },
      live: { actif: 999, passif: 999, resultat: 999 }, // ne doit pas être utilisé
    })
    const res = await getFinancialN1(deps, ARGS)
    expect(res.data_source).toBe('snapshot')
    expect(res.totaux.actif).toBe(100_000)
    expect(res.totaux.passif).toBe(100_000)
    expect(res.totaux.resultat).toBe(15_000)
    expect(res.exercice).toBe('2024-2025')
  })

  it('le snapshot fige les valeurs : un recalcul live ultérieur ne les change pas', async () => {
    // Même contexte : statut cloture, snapshot avec valeurs A
    const deps = makeDeps({
      statut: 'cloture',
      snapshot: { actif: 50_000, passif: 50_000, resultat: 7_000 },
      // live retournerait des valeurs différentes si on l'appelait
      live: { actif: 60_000, passif: 60_000, resultat: 8_000 },
    })
    const res = await getFinancialN1(deps, ARGS)
    expect(res.data_source).toBe('snapshot')
    expect(res.totaux.actif).toBe(50_000)
    expect(res.totaux.resultat).toBe(7_000)
  })
})

describe('financial N-1 — exercice clôturé SANS snapshot', () => {
  it('tombe en fallback live (data_source = "live")', async () => {
    const deps = makeDeps({
      statut: 'cloture',
      snapshot: null,
      live: { actif: 42_000, passif: 42_000, resultat: 3_000 },
    })
    const res = await getFinancialN1(deps, ARGS)
    expect(res.data_source).toBe('live')
    expect(res.totaux.actif).toBe(42_000)
    expect(res.totaux.resultat).toBe(3_000)
  })
})

describe('financial N-1 — exercice ouvert', () => {
  it('utilise toujours le live (data_source = "live")', async () => {
    const deps = makeDeps({
      statut: 'ouvert',
      // Même si un snapshot existe (cas anormal), exo ouvert → live forcé
      snapshot: { actif: 1, passif: 1, resultat: 1 },
      live: { actif: 80_000, passif: 80_000, resultat: 10_000 },
    })
    const res = await getFinancialN1(deps, ARGS)
    expect(res.data_source).toBe('live')
    expect(res.totaux.actif).toBe(80_000)
    expect(res.totaux.resultat).toBe(10_000)
  })

  it('fonctionne aussi si l’exercice est inconnu (null) → live', async () => {
    const deps = makeDeps({
      statut: null,
      snapshot: null,
      live: { actif: 0, passif: 0, resultat: 0 },
    })
    const res = await getFinancialN1(deps, ARGS)
    expect(res.data_source).toBe('live')
    expect(res.totaux).toEqual({ actif: 0, passif: 0, resultat: 0 })
  })
})

describe('format de réponse — cohérence dans les 3 cas', () => {
  const cases: Array<{
    label: string
    deps: Deps
    expectedSource: 'snapshot' | 'live'
  }> = [
    {
      label: 'cloture + snapshot',
      deps: makeDeps({
        statut: 'cloture',
        snapshot: { actif: 1, passif: 1, resultat: 0 },
        live: { actif: 9, passif: 9, resultat: 9 },
      }),
      expectedSource: 'snapshot',
    },
    {
      label: 'cloture + pas de snapshot',
      deps: makeDeps({
        statut: 'cloture',
        snapshot: null,
        live: { actif: 2, passif: 2, resultat: 0 },
      }),
      expectedSource: 'live',
    },
    {
      label: 'ouvert',
      deps: makeDeps({
        statut: 'ouvert',
        snapshot: null,
        live: { actif: 3, passif: 3, resultat: 0 },
      }),
      expectedSource: 'live',
    },
  ]

  for (const c of cases) {
    it(`[${c.label}] le format de réponse contient exercice / data_source / totaux`, async () => {
      const res = await getFinancialN1(c.deps, ARGS)
      expect(res).toHaveProperty('exercice')
      expect(res).toHaveProperty('data_source')
      expect(res).toHaveProperty('totaux')
      expect(res.totaux).toHaveProperty('actif')
      expect(res.totaux).toHaveProperty('passif')
      expect(res.totaux).toHaveProperty('resultat')
      expect(res.data_source).toBe(c.expectedSource)
      expect(typeof res.totaux.actif).toBe('number')
      expect(typeof res.totaux.passif).toBe('number')
      expect(typeof res.totaux.resultat).toBe('number')
    })
  }
})

// ──────────────────────────────────────────────────────────────────────
// Live DB — skipped : nécessite la route effective + Supabase + seed
// ──────────────────────────────────────────────────────────────────────
describe.skip('live DB — GET /api/client/financial avec exercice N-1', () => {
  it.skip('snapshot path : retourne data_source="snapshot" en environnement réel', () => {
    // Désactivé : nécessite Next test runner + Supabase live + seed exo
    // clôturé avec snapshot. À activer en e2e dédié.
  })
})
