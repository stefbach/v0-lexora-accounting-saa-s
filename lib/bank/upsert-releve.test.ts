import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { classifyReleveOverlap } from './upsert-releve'

/**
 * Regression test — mig 435 fix.
 *
 * Contexte : la mig 410 a livré une RPC `replace_releve_bancaire` avec
 * `RETURNS TABLE (releve_id UUID, version INTEGER, previous_id UUID)`, ce
 * qui crée une variable PL/pgSQL implicite `version`. Or la même migration
 * ajoute aussi une colonne `version` sur `releves_bancaires`. Conséquence :
 *
 *   ERROR: 42702: column reference "version" is ambiguous
 *   QUERY: SELECT id, version FROM releves_bancaires ... FOR UPDATE
 *
 * → toute insertion de relevé (web + Telegram) plantait silencieusement,
 *   ce qui s'est traduit côté UI par "aucun relevé n'apparaît dans l'onglet
 *   banque". Cassé pendant ~plusieurs semaines en prod sans alerte.
 *
 * Ce test garde-fou empêche la rechute :
 *  - lit toutes les migrations qui définissent `replace_releve_bancaire`
 *  - vérifie que le SELECT FOR UPDATE qualifie la colonne `version` avec
 *    un alias de table (ex. `rb.version`)
 *
 * Si quelqu'un ré-écrit la RPC à l'avenir et oublie le qualificateur, le
 * test casse en CI avant le déploiement.
 */

const MIGRATIONS_DIR = join(__dirname, '../../supabase/migrations')

function stripSqlComments(sql: string): string {
  // Drop `-- ...` line comments AND `/* ... */` block comments so they don't
  // pollute the regex matches (the migration header comments document the
  // historical bug verbatim and would otherwise be detected as code).
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
}

function findReplaceReleveRpcMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => {
      const content = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
      return /CREATE OR REPLACE FUNCTION\s+public\.replace_releve_bancaire/i.test(content)
    })
    .sort()
}

describe('classifyReleveOverlap — anti-doublon relevés (décision au mois près)', () => {
  const semestre = { date_debut: '2026-01-05', date_fin: '2026-06-30' } // relevé Jan→Juin

  it('absorbe un relevé mensuel dont le mois est couvert MALGRÉ un début 01 vs 05', () => {
    // Cas réel : mensuel janvier 01→31 vs semestriel démarrant le 05. Au jour
    // près l\'ancien code ne l\'absorbait pas → doublon janvier.
    expect(classifyReleveOverlap(semestre, { date_debut: '2026-01-01', date_fin: '2026-01-31' })).toBe('absorb')
  })

  it('absorbe les mois intérieurs (février, avril)', () => {
    expect(classifyReleveOverlap(semestre, { date_debut: '2026-02-01', date_fin: '2026-02-28' })).toBe('absorb')
    expect(classifyReleveOverlap(semestre, { date_debut: '2026-04-01', date_fin: '2026-04-30' })).toBe('absorb')
  })

  it('n\'absorbe PAS un relevé qui déborde avant la plage (déc. + jan.)', () => {
    // Décembre 2025 n\'est pas couvert par un relevé Jan→Juin → risque de perte.
    expect(classifyReleveOverlap(semestre, { date_debut: '2025-12-20', date_fin: '2026-01-31' })).toBe('partiel')
  })

  it('signale un nouveau relevé contenu dans un existant plus large', () => {
    expect(classifyReleveOverlap({ date_debut: '2026-03-01', date_fin: '2026-03-31' }, semestre)).toBe('contenu_dans_existant')
  })

  it('ignore un relevé sans recoupement (juillet)', () => {
    expect(classifyReleveOverlap(semestre, { date_debut: '2026-07-01', date_fin: '2026-07-31' })).toBe('none')
  })

  it('absorbe un relevé scrapé partiel du mois courant couvert par le relevé officiel du mois', () => {
    const aoutOfficiel = { date_debut: '2026-08-01', date_fin: '2026-08-31' }
    expect(classifyReleveOverlap(aoutOfficiel, { date_debut: '2026-08-17', date_fin: '2026-08-20' })).toBe('absorb')
  })
})

describe('replace_releve_bancaire RPC (anti-rechute 42702)', () => {
  it('au moins une migration définit la RPC', () => {
    const files = findReplaceReleveRpcMigrations()
    expect(files.length).toBeGreaterThan(0)
  })

  it('la version la plus récente qualifie la colonne `version` dans le SELECT FOR UPDATE', () => {
    const files = findReplaceReleveRpcMigrations()
    const latest = files[files.length - 1]
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, latest), 'utf8'))

    const forUpdateSelectMatch = sql.match(
      /SELECT[\s\S]{0,400}?FROM\s+releves_bancaires[\s\S]{0,400}?FOR\s+UPDATE/i,
    )
    expect(forUpdateSelectMatch, `Le SELECT FOR UPDATE est introuvable dans ${latest}`).toBeTruthy()

    const block = forUpdateSelectMatch![0]

    // Doit utiliser un alias de table (rb.version OU releves_bancaires.version)
    const isQualified =
      /\b[a-z_]+\.version\b/i.test(block) ||
      /\breleves_bancaires\.version\b/i.test(block)

    expect(
      isQualified,
      `Colonne \`version\` non qualifiée dans ${latest} — rechute 42702 garantie.\n\nBloc fautif :\n${block}`,
    ).toBe(true)
  })

  it("aucune migration plus récente ne réintroduit un SELECT ambigu", () => {
    const files = findReplaceReleveRpcMigrations()
    for (const f of files) {
      // On ne vérifie que mig >= 435 (le fix). Les mig antérieures peuvent
      // contenir le bug historique — c'est leur trace.
      const num = parseInt(f.match(/^(\d+)/)?.[1] || '0', 10)
      if (num < 435) continue

      const sql = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
      const forUpdate = sql.match(
        /SELECT[\s\S]{0,400}?FROM\s+releves_bancaires[\s\S]{0,400}?FOR\s+UPDATE/i,
      )
      if (!forUpdate) continue

      const block = forUpdate[0]
      const isQualified =
        /\b[a-z_]+\.version\b/i.test(block) ||
        /\breleves_bancaires\.version\b/i.test(block)

      expect(isQualified, `${f} contient un SELECT FOR UPDATE non qualifié sur \`version\``).toBe(true)
    }
  })
})
