/**
 * SEC-003 — RLS cross-tenant isolation (extension V5-41).
 *
 * Échantillonne 10 tables Lexora protégées par RLS (sur ~30+ déclarées
 * via `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` dans
 * supabase/migrations/**) et vérifie deux choses :
 *
 *   1. Le DDL active bien RLS pour chacune de ces tables (vérif statique
 *      sur les .sql, defense-in-depth contre un drop accidentel).
 *
 *   2. Avec le mock supabase simulant le filtre `eq('societe_id', x)`
 *      appliqué côté client, une requête tenant A ne récupère JAMAIS
 *      les lignes du tenant B.
 *
 * Note : les vraies policies PostgreSQL sont validées en E2E sur le
 * projet Supabase live (`dqepdoimpqhmuhkklxva`) — cf. CLAUDE.md.
 *
 * Run :  npx vitest run tests/security/rls-isolation.spec.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { createMockSupabase } from '../__mocks__/supabase'

const REPO_ROOT = resolve(__dirname, '../..')
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'supabase/migrations')

// ── Échantillon des 10 tables critiques côté RLS ─────────────────────────
// Couvre : RH/paie, comptable, banque, juridique, ROC, alertes, planning,
// notifications, audit, GBC/IFRS. Si l'une de ces tables disparaît, ce
// test casse — c'est volontaire (signal architectural).
const SAMPLE_RLS_TABLES = [
  'bulletins_paie',         // RH / paie
  'demandes_conges',         // RH / congés
  'pointages',               // RH / pointeuse
  'trajets_kilometriques',   // RH / km
  'affectations_comptables', // comptable / PCM
  'lignes_rapprochement',    // banque / rapprochement
  'actionnaires',            // juridique / ROC
  'annual_returns_roc',      // juridique / ROC
  'alertes',                 // notifications
  'beneficial_owners',       // GBC / compliance
] as const

// Index pré-calculé : toutes les statements RLS du dossier migrations.
let RLS_STATEMENTS_CACHE: string | null = null
function loadAllMigrations(): string {
  if (RLS_STATEMENTS_CACHE !== null) return RLS_STATEMENTS_CACHE
  let aggregated = ''
  if (!existsSync(MIGRATIONS_DIR)) {
    RLS_STATEMENTS_CACHE = ''
    return ''
  }
  for (const file of readdirSync(MIGRATIONS_DIR)) {
    if (!file.endsWith('.sql')) continue
    aggregated += '\n' + readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8')
  }
  RLS_STATEMENTS_CACHE = aggregated
  return aggregated
}

describe('SEC-003 (extension V5-41) — RLS sur 10 tables échantillonnées', () => {
  it('le dossier supabase/migrations existe', () => {
    expect(existsSync(MIGRATIONS_DIR)).toBe(true)
  })

  describe('vérif DDL : ENABLE ROW LEVEL SECURITY présent', () => {
    const sql = loadAllMigrations()

    for (const table of SAMPLE_RLS_TABLES) {
      it(`table "${table}" — ENABLE ROW LEVEL SECURITY déclaré dans une migration`, () => {
        // Accepte les 3 formes rencontrées dans le repo :
        //   ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;
        //   ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
        //   EXECUTE 'ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY';
        const re = new RegExp(
          `ALTER TABLE\\s+(?:public\\.)?${table}\\s+ENABLE ROW LEVEL SECURITY`,
          'i',
        )
        expect(re.test(sql), `RLS non trouvé pour ${table}`).toBe(true)
      })
    }
  })

  describe('isolation cross-tenant via mock supabase (filtre societe_id)', () => {
    for (const table of SAMPLE_RLS_TABLES) {
      it(`table "${table}" — tenant A ne voit pas les rows tenant B`, async () => {
        const supabase = createMockSupabase({
          tables: {
            [table]: [
              { id: `${table}-A1`, societe_id: 'sA', payload: 'A-1' },
              { id: `${table}-A2`, societe_id: 'sA', payload: 'A-2' },
              { id: `${table}-B1`, societe_id: 'sB', payload: 'B-1' },
              { id: `${table}-B2`, societe_id: 'sB', payload: 'B-2' },
              { id: `${table}-B3`, societe_id: 'sB', payload: 'B-3' },
            ],
          },
        })
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .eq('societe_id', 'sA')

        expect(error).toBeNull()
        expect(data).toHaveLength(2)
        expect(data?.every((r: any) => r.societe_id === 'sA')).toBe(true)
        expect(data?.some((r: any) => r.societe_id === 'sB')).toBe(false)
      })
    }
  })

  describe('contrôle global', () => {
    it('au moins 25 tables ont ENABLE ROW LEVEL SECURITY (cible ~30+)', () => {
      const sql = loadAllMigrations()
      const matches = sql.match(/ENABLE ROW LEVEL SECURITY/gi) ?? []
      // Le nombre brut peut dépasser le nb de tables (re-grants), donc
      // on capte aussi le nombre de tables distinctes via une regex plus fine.
      const tableMatches = sql.matchAll(
        /ALTER TABLE\s+(?:public\.)?([a-z_][a-z0-9_]*)\s+ENABLE ROW LEVEL SECURITY/gi,
      )
      const distinctTables = new Set<string>()
      for (const m of tableMatches) distinctTables.add(m[1].toLowerCase())
      expect(matches.length).toBeGreaterThanOrEqual(25)
      expect(distinctTables.size).toBeGreaterThanOrEqual(25)
    })
  })

  it.skip('live RLS check (requires Supabase live + JWT)', async () => {
    // Validation E2E : ouvrir 2 sessions JWT (tenant A vs B) et tester
    // que SELECT cross-tenant retourne 0 rows sans le filtre côté client.
    // Câblé dans la suite E2E externalisée — non exécuté en CI unit.
  })
})
