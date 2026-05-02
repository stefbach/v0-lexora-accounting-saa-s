/**
 * In-memory Supabase client mock for Lexora unit tests.
 *
 * Goals:
 *   • No network. 100% deterministic.
 *   • Supports the chaining patterns used across lib/accounting/** :
 *       .from(table)
 *         .select(cols?)
 *         .insert(rows)
 *         .update(patch)
 *         .delete()
 *         .eq / .neq / .in / .is / .gt / .lt / .gte / .lte
 *         .limit(n)
 *         .maybeSingle() / .single()
 *         await (thenable → { data, error })
 *   • Lets tests pre-populate tables and later assert on captured calls
 *     (insertedRows, updatedRows, deleteFilters, …).
 *
 * The builder is fully thenable so `await supabase.from(...).eq(...)` resolves
 * to `{ data, error }` just like @supabase/supabase-js. Terminal helpers
 * (`.maybeSingle()` / `.single()`) resolve to `{ data, error }` as well.
 *
 * Intentionally simplified — only the operators used by the modules under
 * test are implemented. Add more as needed.
 */

export type TableName = string

export interface MockSupabaseOptions {
  /** Pre-populated rows keyed by table name. */
  tables?: Record<TableName, any[]>
  /**
   * Optional per-operation error injection — the callback receives the
   * table + kind and returns a Supabase-style error or null.
   * Use for "simulate DB error" tests.
   */
  errorOn?: (ctx: { table: string; kind: 'select' | 'insert' | 'update' | 'delete' }) => { message: string } | null
  /**
   * Optional `rpc(name, args)` handler. If a key matches the RPC name, the
   * function is called and its return value is wrapped as `{ data, error }`.
   * Throwing inside the handler turns into an `{ data:null, error:{message} }`
   * shape, mirroring supabase-js behaviour.
   */
  rpcs?: Record<string, (args: any) => any>
}

type Filter =
  | { op: 'eq'; col: string; val: any }
  | { op: 'neq'; col: string; val: any }
  | { op: 'in'; col: string; val: any[] }
  | { op: 'is'; col: string; val: any }
  | { op: 'gt'; col: string; val: any }
  | { op: 'gte'; col: string; val: any }
  | { op: 'lt'; col: string; val: any }
  | { op: 'lte'; col: string; val: any }

interface InsertCall {
  table: string
  rows: any[]
}
interface UpdateCall {
  table: string
  patch: any
  filters: Filter[]
}
interface DeleteCall {
  table: string
  filters: Filter[]
}
interface SelectCall {
  table: string
  cols: string
  filters: Filter[]
  limit: number | null
}

export interface MockSupabaseClient {
  /** Supabase-like surface. */
  from: (table: string) => QueryBuilder
  /** RPC stub — resolves via `MockSupabaseOptions.rpcs[name]` when defined. */
  rpc: (name: string, args?: any) => Promise<{ data: any; error: any }>
  /** Captured state for assertions. */
  _state: {
    tables: Record<TableName, any[]>
    inserts: InsertCall[]
    updates: UpdateCall[]
    deletes: DeleteCall[]
    selects: SelectCall[]
  }
  /** Helpers. */
  _seed: (table: string, rows: any[]) => void
  _reset: () => void
}

interface QueryBuilder extends PromiseLike<{ data: any; error: any }> {
  select: (cols?: string) => QueryBuilder
  insert: (rows: any | any[]) => QueryBuilder
  update: (patch: any) => QueryBuilder
  delete: () => QueryBuilder
  eq: (col: string, val: any) => QueryBuilder
  neq: (col: string, val: any) => QueryBuilder
  in: (col: string, val: any[]) => QueryBuilder
  is: (col: string, val: any) => QueryBuilder
  gt: (col: string, val: any) => QueryBuilder
  gte: (col: string, val: any) => QueryBuilder
  lt: (col: string, val: any) => QueryBuilder
  lte: (col: string, val: any) => QueryBuilder
  limit: (n: number) => QueryBuilder
  maybeSingle: () => Promise<{ data: any; error: any }>
  single: () => Promise<{ data: any; error: any }>
}

function applyFilters(rows: any[], filters: Filter[]): any[] {
  return rows.filter(r => {
    for (const f of filters) {
      const v = r?.[f.col]
      switch (f.op) {
        case 'eq':
          if (v !== f.val) return false
          break
        case 'neq':
          if (v === f.val) return false
          break
        case 'in':
          if (!f.val.includes(v)) return false
          break
        case 'is':
          // .is('col', null) → match null/undefined
          if (f.val === null) {
            if (v !== null && v !== undefined) return false
          } else if (v !== f.val) return false
          break
        case 'gt':
          if (!(Number(v) > Number(f.val))) return false
          break
        case 'gte':
          if (!(Number(v) >= Number(f.val))) return false
          break
        case 'lt':
          if (!(Number(v) < Number(f.val))) return false
          break
        case 'lte':
          if (!(Number(v) <= Number(f.val))) return false
          break
      }
    }
    return true
  })
}

export function createMockSupabase(options: MockSupabaseOptions = {}): MockSupabaseClient {
  const state: MockSupabaseClient['_state'] = {
    tables: { ...(options.tables || {}) },
    inserts: [],
    updates: [],
    deletes: [],
    selects: [],
  }

  function makeBuilder(table: string): QueryBuilder {
    type Kind = 'select' | 'insert' | 'update' | 'delete'
    let kind: Kind = 'select'
    let cols = '*'
    let insertRows: any[] = []
    let updatePatch: any = null
    const filters: Filter[] = []
    let limitN: number | null = null

    const ensureTable = () => {
      if (!state.tables[table]) state.tables[table] = []
      return state.tables[table]
    }

    const maybeError = (opKind: Kind) => {
      if (!options.errorOn) return null
      return options.errorOn({ table, kind: opKind })
    }

    const execute = async (): Promise<{ data: any; error: any }> => {
      const err = maybeError(kind)
      if (err) return { data: null, error: err }

      if (kind === 'select') {
        state.selects.push({ table, cols, filters: [...filters], limit: limitN })
        let rows = applyFilters(ensureTable(), filters)
        if (limitN !== null) rows = rows.slice(0, limitN)
        return { data: rows, error: null }
      }

      if (kind === 'insert') {
        state.inserts.push({ table, rows: [...insertRows] })
        const inserted = insertRows.map((r, i) => ({
          id: r.id ?? `mock-${table}-${state.inserts.length}-${i}`,
          ...r,
        }))
        ensureTable().push(...inserted)
        return { data: inserted, error: null }
      }

      if (kind === 'update') {
        state.updates.push({ table, patch: updatePatch, filters: [...filters] })
        const rows = ensureTable()
        const matched = applyFilters(rows, filters)
        for (const m of matched) {
          Object.assign(m, updatePatch)
        }
        return { data: matched, error: null }
      }

      if (kind === 'delete') {
        state.deletes.push({ table, filters: [...filters] })
        const rows = ensureTable()
        const matched = applyFilters(rows, filters)
        state.tables[table] = rows.filter(r => !matched.includes(r))
        return { data: matched, error: null }
      }

      return { data: null, error: { message: 'unknown kind' } }
    }

    const builder: QueryBuilder = {
      select(c?: string) {
        // If a previous op was insert/update, `.select()` is a chainable no-op
        // that triggers returning the rows — we keep kind as-is so that insert
        // returning .select() still returns inserted rows.
        if (kind === 'select') cols = c || '*'
        return builder
      },
      insert(rows: any | any[]) {
        kind = 'insert'
        insertRows = Array.isArray(rows) ? rows : [rows]
        return builder
      },
      update(patch: any) {
        kind = 'update'
        updatePatch = patch
        return builder
      },
      delete() {
        kind = 'delete'
        return builder
      },
      eq(col, val) { filters.push({ op: 'eq', col, val }); return builder },
      neq(col, val) { filters.push({ op: 'neq', col, val }); return builder },
      in(col, val) { filters.push({ op: 'in', col, val }); return builder },
      is(col, val) { filters.push({ op: 'is', col, val }); return builder },
      gt(col, val) { filters.push({ op: 'gt', col, val }); return builder },
      gte(col, val) { filters.push({ op: 'gte', col, val }); return builder },
      lt(col, val) { filters.push({ op: 'lt', col, val }); return builder },
      lte(col, val) { filters.push({ op: 'lte', col, val }); return builder },
      limit(n: number) { limitN = n; return builder },
      async maybeSingle() {
        const { data, error } = await execute()
        if (error) return { data: null, error }
        if (Array.isArray(data)) {
          return { data: data[0] ?? null, error: null }
        }
        return { data: data ?? null, error: null }
      },
      async single() {
        const { data, error } = await execute()
        if (error) return { data: null, error }
        if (Array.isArray(data)) {
          if (data.length !== 1) {
            return {
              data: null,
              error: { message: `expected 1 row, got ${data.length}` },
            }
          }
          return { data: data[0], error: null }
        }
        return { data, error: null }
      },
      then(onFulfilled, onRejected) {
        return execute().then(onFulfilled as any, onRejected)
      },
    }

    return builder
  }

  return {
    from: makeBuilder,
    async rpc(name: string, args?: any) {
      const handler = options.rpcs?.[name]
      if (!handler) return { data: null, error: { message: `rpc ${name} not stubbed` } }
      try {
        const data = await handler(args)
        return { data, error: null }
      } catch (e: any) {
        return { data: null, error: { message: e?.message || 'rpc threw' } }
      }
    },
    _state: state,
    _seed(table, rows) {
      state.tables[table] = [...(state.tables[table] || []), ...rows]
    },
    _reset() {
      state.tables = {}
      state.inserts = []
      state.updates = []
      state.deletes = []
      state.selects = []
    },
  }
}
