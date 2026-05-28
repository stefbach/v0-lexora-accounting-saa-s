import { describe, it, expect } from 'vitest'
import { initializePCM } from './initialize'
import { PCMError } from './errors'

/**
 * Mock Supabase minimal dédié au test d'initialize : supporte
 * select/eq/maybeSingle, insert, upsert. Stocke les tables en mémoire.
 */
function makeMock(tables: Record<string, any[]>) {
  const inserted: Record<string, any[]> = {}
  const upserted: Record<string, any[]> = {}

  function builder(table: string) {
    let rows = [...(tables[table] || [])]
    const filters: Array<[string, any]> = []
    const api: any = {
      select() { return api },
      eq(col: string, val: any) { filters.push([col, val]); rows = rows.filter(r => r[col] === val); return api },
      maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }) },
      insert(newRows: any[]) {
        const arr = Array.isArray(newRows) ? newRows : [newRows]
        inserted[table] = (inserted[table] || []).concat(arr)
        tables[table] = (tables[table] || []).concat(arr)
        return Promise.resolve({ data: arr, error: null })
      },
      upsert(newRows: any[]) {
        const arr = Array.isArray(newRows) ? newRows : [newRows]
        upserted[table] = (upserted[table] || []).concat(arr)
        return Promise.resolve({ data: arr, error: null })
      },
      then(resolve: any) { return Promise.resolve({ data: rows, error: null }).then(resolve) },
    }
    return api
  }

  // Templates retournés par loadTemplateFromDb
  builder.__inserted = inserted
  builder.__upserted = upserted
  return { from: (t: string) => builder(t), __inserted: inserted, __upserted: upserted }
}

const coreTemplate = {
  code: 'core_maurice', nom: 'CORE', description: null, type: 'core', is_active: true,
  juridiction_code: 'MU', version: '1.0.0', prerequisites: [],
  comptes_json: {
    comptes: [
      { numero: '401', intitule: 'Fournisseurs', classe: 4, type: 'passif', sens_normal: 'credit', lettrable: true, obligatoire: true },
      { numero: '411', intitule: 'Clients', classe: 4, type: 'actif', sens_normal: 'debit', lettrable: true, obligatoire: true },
    ],
  },
}

const holdingTemplate = {
  code: 'module_holding', nom: 'Holding', description: null, type: 'module', is_active: true,
  juridiction_code: 'MU', version: '1.0.0', prerequisites: ['core_maurice'],
  comptes_json: {
    comptes: [
      { numero: '451', intitule: 'CC liées', classe: 4, type: 'mixte', sens_normal: 'mixte', lettrable: true, obligatoire: false },
    ],
  },
}

describe('initializePCM', () => {
  it('crée les comptes du CORE sur une société vierge', async () => {
    const mock = makeMock({
      pcm_templates: [coreTemplate],
      comptes_societes: [],
      pcm_modules_actifs: [],
    })
    const res = await initializePCM(mock as any, {
      societeId: 'soc-1', coreTemplateCode: 'core_maurice', moduleCodes: [],
    })
    expect(res.comptes_created).toBe(2)
    expect(res.comptes_skipped).toBe(0)
    expect(mock.__inserted.comptes_societes).toHaveLength(2)
  })

  it('est idempotent : comptes déjà présents non recréés', async () => {
    const mock = makeMock({
      pcm_templates: [coreTemplate],
      comptes_societes: [{ societe_id: 'soc-1', numero: '401' }],
      pcm_modules_actifs: [],
    })
    const res = await initializePCM(mock as any, {
      societeId: 'soc-1', coreTemplateCode: 'core_maurice', moduleCodes: [],
    })
    expect(res.comptes_created).toBe(1) // seul 411 créé
    expect(res.comptes_skipped).toBe(1) // 401 ignoré
  })

  it('refuse un module dont le prérequis manque (PCM_002)', async () => {
    const mock = makeMock({
      pcm_templates: [
        coreTemplate,
        { ...holdingTemplate, prerequisites: ['module_inexistant'] },
      ],
      comptes_societes: [],
      pcm_modules_actifs: [],
    })
    await expect(initializePCM(mock as any, {
      societeId: 'soc-1', coreTemplateCode: 'core_maurice', moduleCodes: ['module_holding'],
    })).rejects.toBeInstanceOf(PCMError)
  })
})
