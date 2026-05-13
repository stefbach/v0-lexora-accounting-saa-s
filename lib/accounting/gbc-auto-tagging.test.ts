import { describe, it, expect } from 'vitest'
import { applyGbcAutoTagging } from './gbc-auto-tagging'

/**
 * Tests d'intégration légers pour le helper auto-tagging GBC.
 * Le client Supabase est mocké : on vérifie que la bonne séquence
 * d'opérations est demandée selon le profil de la société (MUR vs GBC).
 */

type MockOpts = {
  societe?: any
  taux?: any
  ecritures?: any[]
  relations?: any[]
  prevFacture?: any
}

function mockSupabase(opts: MockOpts = {}) {
  const updates: any[] = []
  const inserts: any[] = []

  // ChainBuilder : permet de chainer .select.eq.is.like.or.order.limit puis terminer
  // soit avec .single/.maybeSingle, soit par un await direct (thenable).
  function chain(table: string, filters: any[] = [], terminal?: string) {
    const ctx: any = { _table: table, _filters: filters }

    // Résolution finale selon le contexte
    const resolve = (): { data: any; error: any } => {
      if (terminal === 'single' && table === 'societes') {
        return { data: opts.societe ?? null, error: opts.societe ? null : { message: 'not found' } }
      }
      if (terminal === 'maybeSingle' && table === 'taux_change') {
        return { data: opts.taux ?? null, error: null }
      }
      if (table === 'societes_relationships') return { data: opts.relations || [], error: null }
      if (table === 'ecritures_comptables_v2') return { data: opts.ecritures || [], error: null }
      if (table === 'factures' && filters.some(f => f[1] === 'related_party' && f[2] === true)) {
        return { data: opts.prevFacture ? [opts.prevFacture] : [], error: null }
      }
      return { data: [], error: null }
    }

    const obj: any = {
      select: () => chain(table, filters),
      eq:     (col: string, val: any) => chain(table, [...filters, ['eq', col, val]]),
      is:     (col: string, val: any) => chain(table, [...filters, ['is', col, val]]),
      like:   (col: string, val: any) => chain(table, [...filters, ['like', col, val]]),
      or:     (f: string) => chain(table, [...filters, ['or', f]]),
      order:  () => chain(table, filters),
      limit:  () => chain(table, filters),
      single: () => Promise.resolve(chain(table, filters, 'single')._resolve()),
      maybeSingle: () => Promise.resolve(chain(table, filters, 'maybeSingle')._resolve()),
      then:   (onFulfilled: any, onRejected?: any) => Promise.resolve(resolve()).then(onFulfilled, onRejected),
      _resolve: resolve,
    }
    return obj
  }

  return {
    from: (table: string) => ({
      select: () => chain(table),
      update: (vals: any) => {
        const upd: any = { _table: table, vals, _filters: [] as any[] }
        const updChain: any = {
          eq: (col: string, val: any) => { upd._filters.push(['eq', col, val]); return updChain },
          like: (col: string, val: any) => { upd._filters.push(['like', col, val]); return updChain },
          then: (onFulfilled: any) => Promise.resolve({ data: null, error: null }).then(onFulfilled),
        }
        updates.push(upd)
        return updChain
      },
      insert: (vals: any) => {
        inserts.push({ _table: table, vals })
        return Promise.resolve({ data: null, error: null })
      },
    }),
    _updates: updates,
    _inserts: inserts,
  } as any
}

describe('applyGbcAutoTagging', () => {
  it('société MUR-only : pas de translation IAS 21, mais PER possible si tiers étranger', async () => {
    const sb = mockSupabase({
      societe: { id: 'soc-1', nom: 'Acme Ltd', devise_fonctionnelle: 'MUR' },
    })
    const r = await applyGbcAutoTagging(sb, {
      facture_id: 'fac-1', societe_id: 'soc-1',
      tiers: 'Foreign Holdings ZA',
      tiers_country_iso: 'ZA',
      type_facture: 'client',
      numero_compte_principal: '761',
      description: 'Dividend payment',
      montant_mur: 100000,
    })
    expect(r.per_category).toBe('foreign_dividends')
    expect(r.ias21_translated).toBe(false)  // MUR-only → pas de translation
    expect(r.related_party).toBe(false)
  })

  it('société GBC USD avec taux change : applique la translation IAS 21', async () => {
    const sb = mockSupabase({
      societe: { id: 'soc-2', nom: 'Holdings USD', devise_fonctionnelle: 'USD' },
      taux: { taux: 47.5 },
      ecritures: [
        { id: 'e1', numero_compte: '512', debit_mur: 47500, credit_mur: 0 },
        { id: 'e2', numero_compte: '706', debit_mur: 0, credit_mur: 47500 },
      ],
    })
    const r = await applyGbcAutoTagging(sb, {
      facture_id: 'fac-2', societe_id: 'soc-2',
      tiers: 'Customer USA', type_facture: 'client',
      numero_compte_principal: '706',
      montant_mur: 47500,
    })
    expect(r.ias21_translated).toBe(true)
    expect(r.ias21_rate_used).toBe(47.5)
  })

  it('tiers est une société du groupe : flag related_party + crée TP transaction si seuil > 1M', async () => {
    const sb = mockSupabase({
      societe: { id: 'soc-3', nom: 'Parent Ltd', devise_fonctionnelle: 'USD' },
      taux: { taux: 47.5 },
      relations: [{
        parent_societe_id: 'soc-3',
        child_societe_id: 'soc-4',
        child: { nom: 'Subsidiary Ltd' },
        parent: { nom: 'Parent Ltd' },
      }],
    })
    const r = await applyGbcAutoTagging(sb, {
      facture_id: 'fac-3', societe_id: 'soc-3',
      tiers: 'Subsidiary Ltd', type_facture: 'fournisseur',
      numero_compte_principal: '607',
      montant_mur: 6_000_000,
      date_facture: '2025-09-15',
    })
    expect(r.related_party).toBe(true)
    expect(r.related_party_type).toBe('subsidiary')
    expect(r.tp_transaction_created).toBe(true)
    expect(sb._inserts.filter((i: any) => i._table === 'tp_transactions').length).toBe(1)
  })

  it('société introuvable : retourne avec warning', async () => {
    const sb = mockSupabase({ societe: null })
    const r = await applyGbcAutoTagging(sb, {
      facture_id: 'fac-x', societe_id: 'unknown',
      tiers: 'X', type_facture: 'client', montant_mur: 1000,
    })
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(r.per_category).toBeNull()
  })

  it('facture fournisseur : pas de classification PER (PER = revenus uniquement)', async () => {
    const sb = mockSupabase({
      societe: { id: 'soc-5', nom: 'X', devise_fonctionnelle: 'MUR' },
    })
    const r = await applyGbcAutoTagging(sb, {
      facture_id: 'fac-5', societe_id: 'soc-5',
      tiers: 'Foreign Supplier ZA',
      tiers_country_iso: 'ZA',
      type_facture: 'fournisseur',
      numero_compte_principal: '607',
      montant_mur: 50000,
    })
    expect(r.per_category).toBeNull()
  })

  it('taux change introuvable : translation skipped avec warning', async () => {
    const sb = mockSupabase({
      societe: { id: 'soc-6', nom: 'X', devise_fonctionnelle: 'EUR' },
      taux: null,
    })
    const r = await applyGbcAutoTagging(sb, {
      facture_id: 'fac-6', societe_id: 'soc-6',
      tiers: 'X', type_facture: 'client', montant_mur: 1000,
    })
    expect(r.ias21_translated).toBe(false)
    expect(r.warnings.some(w => w.includes('Taux'))).toBe(true)
  })
})
