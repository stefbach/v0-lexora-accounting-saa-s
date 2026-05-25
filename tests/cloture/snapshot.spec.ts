/**
 * Suite 2 — Snapshots d'exercice (migrations 422 + 423)
 *
 * Couvre :
 *   (A) Inspection statique des migrations 422 (table + RPC
 *       generate_exercice_snapshot) et 423 (RPC
 *       cloture_exercice_with_snapshot).
 *   (B) Tests fonctionnels des helpers TS de
 *       `lib/accounting/exercice-snapshot.ts` (getActiveSnapshot,
 *       generateSnapshot, clotureWithSnapshot, getComparativeTotaux)
 *       avec un mock Supabase exposant `.rpc()` et la chaîne
 *       from/select/eq/order/limit/maybeSingle.
 *   (C) RLS : isolation par société (vérifiée via le filtre sur
 *       societe_id passé par le client).
 *
 * Les tests live DB sont skipped (nécessite Supabase + seed).
 */

import { describe, it, expect, beforeAll, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import {
  getActiveSnapshot,
  listSnapshots,
  generateSnapshot,
  clotureWithSnapshot,
  getComparativeTotaux,
  type ExerciceSnapshot,
} from '@/lib/accounting/exercice-snapshot'

// ──────────────────────────────────────────────────────────────────────
// (A) Inspection statique migrations 422 / 423
// ──────────────────────────────────────────────────────────────────────
const MIG_422_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/422_exercice_snapshots.sql',
)
const MIG_423_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/423_cloture_avec_snapshot.sql',
)

let mig422Sql = ''
let mig423Sql = ''
beforeAll(() => {
  mig422Sql = fs.readFileSync(MIG_422_PATH, 'utf-8')
  mig423Sql = fs.readFileSync(MIG_423_PATH, 'utf-8')
})

describe('mig 422 — table + RPC generate_exercice_snapshot', () => {
  it('crée la table exercice_snapshots avec is_active', () => {
    expect(mig422Sql).toMatch(/CREATE TABLE IF NOT EXISTS\s+public\.exercice_snapshots/i)
    expect(mig422Sql).toMatch(/is_active\s+BOOLEAN/i)
  })

  it('active RLS et déclare des policies', () => {
    expect(mig422Sql).toMatch(/ENABLE ROW LEVEL SECURITY/i)
    expect(mig422Sql).toMatch(/CREATE POLICY\s+snapshots_select/i)
    expect(mig422Sql).toMatch(/CREATE POLICY\s+snapshots_insert/i)
  })

  it('expose la RPC generate_exercice_snapshot', () => {
    expect(mig422Sql).toMatch(
      /CREATE OR REPLACE FUNCTION\s+public\.generate_exercice_snapshot/i,
    )
  })

  it('désactive les snapshots précédents (is_active=false) lors d’une régénération', () => {
    expect(mig422Sql).toMatch(/SET\s+is_active\s*=\s*false/i)
  })
})

describe('mig 423 — RPC cloture_exercice_with_snapshot', () => {
  it('expose la RPC cloture_exercice_with_snapshot', () => {
    expect(mig423Sql).toMatch(
      /CREATE OR REPLACE FUNCTION\s+public\.cloture_exercice_with_snapshot/i,
    )
  })

  it('appelle bien generate_exercice_snapshot en interne', () => {
    expect(mig423Sql).toMatch(/generate_exercice_snapshot\s*\(/i)
  })
})

// ──────────────────────────────────────────────────────────────────────
// (B) Mock Supabase étendu (rpc + order)
// ──────────────────────────────────────────────────────────────────────
type RpcHandler = (name: string, params: any) => Promise<{ data: any; error: any }>

function makeExtendedSupabase(opts: {
  rows: ExerciceSnapshot[]
  rpc?: RpcHandler
  selectError?: { message: string }
}) {
  const state = {
    snapshots: [...opts.rows],
    rpcCalls: [] as { name: string; params: any }[],
    lastFilters: [] as { col: string; val: any }[],
    lastOrder: null as { col: string; ascending: boolean } | null,
    lastLimit: null as number | null,
  }

  const builder: any = {
    _filters: [] as { col: string; val: any }[],
    select(_cols?: string) {
      return this
    },
    eq(col: string, val: any) {
      this._filters.push({ col, val })
      return this
    },
    order(col: string, opts: { ascending: boolean }) {
      state.lastOrder = { col, ascending: opts.ascending }
      return this
    },
    limit(n: number) {
      state.lastLimit = n
      return this
    },
    async maybeSingle() {
      if (opts.selectError) return { data: null, error: opts.selectError }
      state.lastFilters = [...this._filters]
      const matched = state.snapshots.filter(r =>
        this._filters.every((f: any) => (r as any)[f.col] === f.val),
      )
      const sorted = state.lastOrder
        ? [...matched].sort((a: any, b: any) => {
            const av = a[state.lastOrder!.col]
            const bv = b[state.lastOrder!.col]
            return state.lastOrder!.ascending ? (av < bv ? -1 : 1) : av < bv ? 1 : -1
          })
        : matched
      const sliced = state.lastLimit ? sorted.slice(0, state.lastLimit) : sorted
      return { data: sliced[0] ?? null, error: null }
    },
    then(onFulfilled: any, onRejected: any) {
      // For listSnapshots which awaits the chain directly
      const matched = state.snapshots.filter(r =>
        this._filters.every((f: any) => (r as any)[f.col] === f.val),
      )
      const sorted = state.lastOrder
        ? [...matched].sort((a: any, b: any) => {
            const av = a[state.lastOrder!.col]
            const bv = b[state.lastOrder!.col]
            return state.lastOrder!.ascending ? (av < bv ? -1 : 1) : av < bv ? 1 : -1
          })
        : matched
      return Promise.resolve({ data: sorted, error: null }).then(onFulfilled, onRejected)
    },
  }

  return {
    from(_table: string) {
      // Reset le builder pour éviter le partage de filters entre appels
      const fresh = { ...builder, _filters: [] }
      // re-bind les méthodes pour qu'elles utilisent `fresh`
      fresh.select = builder.select.bind(fresh)
      fresh.eq = builder.eq.bind(fresh)
      fresh.order = builder.order.bind(fresh)
      fresh.limit = builder.limit.bind(fresh)
      fresh.maybeSingle = builder.maybeSingle.bind(fresh)
      fresh.then = builder.then.bind(fresh)
      return fresh
    },
    rpc: async (name: string, params: any) => {
      state.rpcCalls.push({ name, params })
      if (opts.rpc) return opts.rpc(name, params)
      return { data: null, error: null }
    },
    _state: state,
  }
}

// ──────────────────────────────────────────────────────────────────────
// (B) Tests helpers lib/accounting/exercice-snapshot.ts
// ──────────────────────────────────────────────────────────────────────
const SOC_A = 'soc-A'
const SOC_B = 'soc-B'

function makeSnapshot(overrides: Partial<ExerciceSnapshot> = {}): ExerciceSnapshot {
  return {
    id: overrides.id ?? 'snap-1',
    societe_id: overrides.societe_id ?? SOC_A,
    exercice: overrides.exercice ?? '2024-2025',
    snapshot_type: overrides.snapshot_type ?? 'all',
    generated_at: overrides.generated_at ?? '2026-05-01T12:00:00Z',
    generated_by: overrides.generated_by ?? 'user-1',
    soldes_json: overrides.soldes_json ?? { periode: {}, cumule: {} },
    ratios_json: overrides.ratios_json ?? null,
    totaux_json: overrides.totaux_json ?? {
      actif_total: 100_000,
      passif_total: 100_000,
      capitaux_propres: 50_000,
      immobilisations: 30_000,
      ca_ht: 200_000,
      charges_total: 180_000,
      resultat_net: 20_000,
      tresorerie_actif: 10_000,
      tresorerie_passif: 0,
    },
    cloture_id: overrides.cloture_id ?? null,
    is_active: overrides.is_active ?? true,
    notes: overrides.notes ?? null,
  }
}

describe('getActiveSnapshot()', () => {
  it('retourne null si aucun snapshot actif', async () => {
    const supabase = makeExtendedSupabase({ rows: [] })
    const snap = await getActiveSnapshot(SOC_A, '2024-2025', 'all', supabase as any)
    expect(snap).toBeNull()
  })

  it('retourne le snapshot actif courant', async () => {
    const expected = makeSnapshot({ id: 'snap-active' })
    const supabase = makeExtendedSupabase({ rows: [expected] })
    const snap = await getActiveSnapshot(SOC_A, '2024-2025', 'all', supabase as any)
    expect(snap).not.toBeNull()
    expect(snap?.id).toBe('snap-active')
    expect(snap?.is_active).toBe(true)
  })

  it('filtre par societe_id (RLS — pas de fuite cross-tenant)', async () => {
    const rows = [
      makeSnapshot({ id: 'snap-A', societe_id: SOC_A }),
      makeSnapshot({ id: 'snap-B', societe_id: SOC_B }),
    ]
    const supabase = makeExtendedSupabase({ rows })
    const snap = await getActiveSnapshot(SOC_A, '2024-2025', 'all', supabase as any)
    expect(snap?.societe_id).toBe(SOC_A)
    expect(snap?.id).toBe('snap-A')

    const snapB = await getActiveSnapshot(SOC_B, '2024-2025', 'all', supabase as any)
    expect(snapB?.societe_id).toBe(SOC_B)
  })

  it('throw si erreur Supabase', async () => {
    const supabase = makeExtendedSupabase({
      rows: [],
      selectError: { message: 'permission denied' },
    })
    await expect(
      getActiveSnapshot(SOC_A, '2024-2025', 'all', supabase as any),
    ).rejects.toThrow(/getActiveSnapshot failed/)
  })
})

describe('generateSnapshot()', () => {
  it('appelle la RPC generate_exercice_snapshot avec les bons paramètres', async () => {
    const supabase = makeExtendedSupabase({
      rows: [],
      rpc: async (_name, _params) => ({ data: 'snap-new-id', error: null }),
    })
    const res = await generateSnapshot(
      SOC_A,
      '2024-2025',
      'all',
      { notes: 'test' },
      supabase as any,
    )
    expect(res.snapshot_id).toBe('snap-new-id')
    expect(supabase._state.rpcCalls).toHaveLength(1)
    expect(supabase._state.rpcCalls[0].name).toBe('generate_exercice_snapshot')
    expect(supabase._state.rpcCalls[0].params).toMatchObject({
      p_societe_id: SOC_A,
      p_exercice: '2024-2025',
      p_type: 'all',
      p_notes: 'test',
    })
  })

  it('throw si la RPC retourne une erreur', async () => {
    const supabase = makeExtendedSupabase({
      rows: [],
      rpc: async () => ({ data: null, error: { message: 'fk violation' } }),
    })
    await expect(
      generateSnapshot(SOC_A, '2024-2025', 'all', {}, supabase as any),
    ).rejects.toThrow(/generate_exercice_snapshot failed/)
  })
})

describe('clotureWithSnapshot()', () => {
  it('appelle la RPC cloture_exercice_with_snapshot et retourne le payload', async () => {
    const expected = {
      societe_id: SOC_A,
      exercice: '2024-2025',
      resultat_exercice: 12_345,
      nb_lignes_cloture: 4,
      nb_lignes_an: 6,
      total_actif_an: 100_000,
      total_passif_an: 100_000,
      equilibre: true,
      snapshot_id: 'snap-cloture-id',
      snapshot_generated_at: '2026-05-01T12:00:00Z',
    }
    const supabase = makeExtendedSupabase({
      rows: [],
      rpc: async (name, _params) => {
        if (name !== 'cloture_exercice_with_snapshot') {
          return { data: null, error: { message: 'wrong rpc' } }
        }
        return { data: expected, error: null }
      },
    })
    const res = await clotureWithSnapshot(SOC_A, '2024-2025', supabase as any)
    expect(res).toMatchObject(expected)
    expect(supabase._state.rpcCalls[0].name).toBe('cloture_exercice_with_snapshot')
    expect(supabase._state.rpcCalls[0].params).toMatchObject({
      p_societe_id: SOC_A,
      p_exercice: '2024-2025',
    })
  })

  it('throw si data null (cas anormal)', async () => {
    const supabase = makeExtendedSupabase({
      rows: [],
      rpc: async () => ({ data: null, error: null }),
    })
    await expect(
      clotureWithSnapshot(SOC_A, '2024-2025', supabase as any),
    ).rejects.toThrow(/empty payload/)
  })
})

describe('getComparativeTotaux() — helper N-1', () => {
  it('retourne null si pas de snapshot actif', async () => {
    const supabase = makeExtendedSupabase({ rows: [] })
    const totaux = await getComparativeTotaux(SOC_A, '2024-2025', supabase as any)
    expect(totaux).toBeNull()
  })

  it('retourne totaux_json depuis le snapshot actif', async () => {
    const snap = makeSnapshot({
      totaux_json: {
        actif_total: 250_000,
        passif_total: 250_000,
        capitaux_propres: 80_000,
        immobilisations: 60_000,
        ca_ht: 500_000,
        charges_total: 420_000,
        resultat_net: 80_000,
        tresorerie_actif: 25_000,
        tresorerie_passif: 0,
      },
    })
    const supabase = makeExtendedSupabase({ rows: [snap] })
    const totaux = await getComparativeTotaux(SOC_A, '2024-2025', supabase as any)
    expect(totaux).not.toBeNull()
    expect(totaux?.actif_total).toBe(250_000)
    expect(totaux?.resultat_net).toBe(80_000)
  })
})

// ──────────────────────────────────────────────────────────────────────
// (C) Live DB — skipped
// ──────────────────────────────────────────────────────────────────────
describe.skip('live DB — RPC cloture_exercice_with_snapshot sur Supabase réel', () => {
  it.skip('skip : nécessite connexion Supabase + seed (mig 422+423 appliquées)', () => {
    // Activer en environnement de test isolé seulement.
  })
})
