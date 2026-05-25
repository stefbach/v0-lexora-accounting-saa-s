/**
 * Suite 1 — Trigger de verrouillage des écritures sur exercices clôturés
 * Migration : supabase/migrations/421_cloture_lock_trigger.sql
 *
 * Stratégie : double validation
 *   (A) Inspection statique du SQL de la migration 421 — garantit que les
 *       fonctions, table, trigger et bypass attendus sont déclarés.
 *   (B) Simulation fonctionnelle du comportement attendu via un mini
 *       moteur JS qui reproduit la logique du trigger (is_in_closed_exercice,
 *       bypass CL/AN, admin override + audit dans cloture_lock_overrides).
 *
 * Pas de connexion réelle à Supabase (les tests live DB sont skipped et
 * documentés).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ──────────────────────────────────────────────────────────────────────
// (A) Lecture de la migration 421 pour validation statique
// ──────────────────────────────────────────────────────────────────────
const MIG_421_PATH = path.resolve(
  __dirname,
  '../../supabase/migrations/421_cloture_lock_trigger.sql',
)

let mig421Sql = ''
beforeAll(() => {
  mig421Sql = fs.readFileSync(MIG_421_PATH, 'utf-8')
})

describe('mig 421 — structure SQL', () => {
  it('déclare la fonction is_in_closed_exercice(UUID, DATE)', () => {
    expect(mig421Sql).toMatch(
      /CREATE OR REPLACE FUNCTION\s+public\.is_in_closed_exercice\s*\(\s*p_societe_id\s+UUID\s*,\s*p_date\s+DATE\s*\)/i,
    )
    expect(mig421Sql).toMatch(/RETURNS\s+BOOLEAN/i)
  })

  it('crée la table WORM cloture_lock_overrides', () => {
    expect(mig421Sql).toMatch(
      /CREATE TABLE IF NOT EXISTS\s+public\.cloture_lock_overrides/i,
    )
    expect(mig421Sql).toMatch(/ENABLE ROW LEVEL SECURITY/i)
    // RLS UPDATE / DELETE = false (WORM)
    expect(mig421Sql).toMatch(/cloture_lock_overrides_no_update/i)
    expect(mig421Sql).toMatch(/cloture_lock_overrides_no_delete/i)
  })

  it('attache le trigger BEFORE INSERT/UPDATE/DELETE sur ecritures_comptables_v2', () => {
    expect(mig421Sql).toMatch(/CREATE TRIGGER\s+ecriture_cloture_lock/i)
    expect(mig421Sql).toMatch(
      /BEFORE\s+INSERT\s+OR\s+UPDATE\s+OR\s+DELETE\s+ON\s+public\.ecritures_comptables_v2/i,
    )
    expect(mig421Sql).toMatch(/EXECUTE FUNCTION\s+public\.check_ecriture_in_closed_exercice/i)
  })

  it('exempte les journaux techniques CL et AN', () => {
    // Doit contenir le bypass v_journal IN ('CL', 'AN')
    expect(mig421Sql).toMatch(/v_journal\s+IN\s*\(\s*'CL'\s*,\s*'AN'\s*\)/)
  })

  it('autorise les admins (admin, super_admin) avec audit', () => {
    expect(mig421Sql).toMatch(/role\s+IN\s*\(\s*'admin'\s*,\s*'super_admin'\s*\)/i)
    // Audit INSERT obligatoire dans cloture_lock_overrides
    expect(mig421Sql).toMatch(
      /INSERT INTO\s+public\.cloture_lock_overrides/i,
    )
  })

  it('lève une exception en cas de rejet (RAISE EXCEPTION)', () => {
    expect(mig421Sql).toMatch(/RAISE EXCEPTION/i)
    expect(mig421Sql).toMatch(/exercice\s+clôtur/i)
  })
})

// ──────────────────────────────────────────────────────────────────────
// (B) Simulation fonctionnelle du trigger en JS
// ──────────────────────────────────────────────────────────────────────
type Exercice = {
  societe_id: string
  annee: string
  date_debut: string // YYYY-MM-DD
  date_fin: string
  statut: 'ouvert' | 'cloture'
}

type Ecriture = {
  id: string
  societe_id: string
  date_ecriture: string
  journal_code: string
}

type OverrideRow = {
  societe_id: string
  exercice: string | null
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  ecriture_id: string
  user_id: string
  user_role: string
}

function isInClosedExercice(
  exercices: Exercice[],
  societe_id: string,
  date: string,
): boolean {
  return exercices.some(
    e =>
      e.societe_id === societe_id &&
      e.statut === 'cloture' &&
      date >= e.date_debut &&
      date <= e.date_fin,
  )
}

function simulateTrigger(opts: {
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  ecriture: Ecriture
  exercices: Exercice[]
  userRole: 'admin' | 'super_admin' | 'comptable' | 'client' | null
  userId: string
  overrideAudit: OverrideRow[]
}): { ok: true } | { ok: false; error: string } {
  const { op, ecriture, exercices, userRole, userId, overrideAudit } = opts

  // 1) Bypass journaux techniques
  if (ecriture.journal_code === 'CL' || ecriture.journal_code === 'AN') {
    return { ok: true }
  }

  // 2) Date hors exercice clôturé → pass-through
  if (!isInClosedExercice(exercices, ecriture.societe_id, ecriture.date_ecriture)) {
    return { ok: true }
  }

  // 3) Override admin
  const isAdmin = userRole === 'admin' || userRole === 'super_admin'
  if (isAdmin) {
    const exo = exercices.find(
      e =>
        e.societe_id === ecriture.societe_id &&
        e.statut === 'cloture' &&
        ecriture.date_ecriture >= e.date_debut &&
        ecriture.date_ecriture <= e.date_fin,
    )
    overrideAudit.push({
      societe_id: ecriture.societe_id,
      exercice: exo?.annee ?? null,
      action: op,
      ecriture_id: ecriture.id,
      user_id: userId,
      user_role: userRole as string,
    })
    return { ok: true }
  }

  // 4) Rejet
  return {
    ok: false,
    error: `Écriture rejetée : exercice clôturé (date ${ecriture.date_ecriture}, société ${ecriture.societe_id}, journal ${ecriture.journal_code}, op ${op}).`,
  }
}

const SOC = 'soc-A'
const exercices: Exercice[] = [
  {
    societe_id: SOC,
    annee: '2023-2024',
    date_debut: '2023-07-01',
    date_fin: '2024-06-30',
    statut: 'cloture',
  },
  {
    societe_id: SOC,
    annee: '2024-2025',
    date_debut: '2024-07-01',
    date_fin: '2025-06-30',
    statut: 'cloture',
  },
  {
    societe_id: SOC,
    annee: '2025-2026',
    date_debut: '2025-07-01',
    date_fin: '2026-06-30',
    statut: 'ouvert',
  },
]

describe('is_in_closed_exercice() — comportement attendu', () => {
  it('retourne true si la date tombe dans un exercice clôturé', () => {
    expect(isInClosedExercice(exercices, SOC, '2024-03-15')).toBe(true)
    expect(isInClosedExercice(exercices, SOC, '2025-06-30')).toBe(true)
  })

  it('retourne false si la date tombe dans un exercice ouvert', () => {
    expect(isInClosedExercice(exercices, SOC, '2025-12-01')).toBe(false)
    expect(isInClosedExercice(exercices, SOC, '2026-06-30')).toBe(false)
  })

  it('retourne false si la société n’a pas d’exercice clôturé sur cette date', () => {
    expect(isInClosedExercice(exercices, 'soc-B', '2024-03-15')).toBe(false)
  })

  it('retourne false sur la frontière d’ouverture (date_debut de l’exo ouvert)', () => {
    expect(isInClosedExercice(exercices, SOC, '2025-07-01')).toBe(false)
  })
})

describe('trigger — INSERT', () => {
  it('REJETTE un INSERT standard (journal VTE) sur date d’exo clôturé', () => {
    const audit: OverrideRow[] = []
    const res = simulateTrigger({
      op: 'INSERT',
      ecriture: { id: 'e1', societe_id: SOC, date_ecriture: '2024-03-15', journal_code: 'VTE' },
      exercices,
      userRole: 'comptable',
      userId: 'u-compta',
      overrideAudit: audit,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/clôtur/i)
    expect(audit).toHaveLength(0)
  })

  it('ACCEPTE un INSERT standard sur date d’exo OUVERT', () => {
    const audit: OverrideRow[] = []
    const res = simulateTrigger({
      op: 'INSERT',
      ecriture: { id: 'e2', societe_id: SOC, date_ecriture: '2025-12-01', journal_code: 'VTE' },
      exercices,
      userRole: 'comptable',
      userId: 'u-compta',
      overrideAudit: audit,
    })
    expect(res.ok).toBe(true)
    expect(audit).toHaveLength(0)
  })

  it('ACCEPTE un INSERT journal CL sur exercice clôturé (clôture)', () => {
    const audit: OverrideRow[] = []
    const res = simulateTrigger({
      op: 'INSERT',
      ecriture: { id: 'e3', societe_id: SOC, date_ecriture: '2024-06-30', journal_code: 'CL' },
      exercices,
      userRole: 'comptable',
      userId: 'u-compta',
      overrideAudit: audit,
    })
    expect(res.ok).toBe(true)
    expect(audit).toHaveLength(0)
  })

  it('ACCEPTE un INSERT journal AN sur exercice clôturé (à-nouveaux)', () => {
    const audit: OverrideRow[] = []
    const res = simulateTrigger({
      op: 'INSERT',
      ecriture: { id: 'e4', societe_id: SOC, date_ecriture: '2024-07-01', journal_code: 'AN' },
      exercices,
      userRole: 'comptable',
      userId: 'u-compta',
      overrideAudit: audit,
    })
    expect(res.ok).toBe(true)
    expect(audit).toHaveLength(0)
  })
})

describe('trigger — UPDATE / DELETE', () => {
  it('REJETTE un UPDATE sur écriture existante dans exo clôturé', () => {
    const audit: OverrideRow[] = []
    const res = simulateTrigger({
      op: 'UPDATE',
      ecriture: { id: 'e5', societe_id: SOC, date_ecriture: '2023-09-10', journal_code: 'ACH' },
      exercices,
      userRole: 'comptable',
      userId: 'u-compta',
      overrideAudit: audit,
    })
    expect(res.ok).toBe(false)
    expect(audit).toHaveLength(0)
  })

  it('REJETTE un DELETE sur écriture existante dans exo clôturé (non-admin)', () => {
    const audit: OverrideRow[] = []
    const res = simulateTrigger({
      op: 'DELETE',
      ecriture: { id: 'e6', societe_id: SOC, date_ecriture: '2024-02-14', journal_code: 'BNQ' },
      exercices,
      userRole: 'comptable',
      userId: 'u-compta',
      overrideAudit: audit,
    })
    expect(res.ok).toBe(false)
    expect(audit).toHaveLength(0)
  })
})

describe('trigger — override admin avec audit WORM', () => {
  it('ACCEPTE un INSERT admin sur exo clôturé et insère une trace audit', () => {
    const audit: OverrideRow[] = []
    const res = simulateTrigger({
      op: 'INSERT',
      ecriture: { id: 'e7', societe_id: SOC, date_ecriture: '2024-04-01', journal_code: 'OD' },
      exercices,
      userRole: 'admin',
      userId: 'u-admin',
      overrideAudit: audit,
    })
    expect(res.ok).toBe(true)
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({
      societe_id: SOC,
      exercice: '2023-2024',
      action: 'INSERT',
      ecriture_id: 'e7',
      user_id: 'u-admin',
      user_role: 'admin',
    })
  })

  it('ACCEPTE un DELETE super_admin sur exo clôturé et insère une trace audit', () => {
    const audit: OverrideRow[] = []
    const res = simulateTrigger({
      op: 'DELETE',
      ecriture: { id: 'e8', societe_id: SOC, date_ecriture: '2024-12-20', journal_code: 'BNQ' },
      exercices,
      userRole: 'super_admin',
      userId: 'u-superadmin',
      overrideAudit: audit,
    })
    expect(res.ok).toBe(true)
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({
      societe_id: SOC,
      exercice: '2024-2025',
      action: 'DELETE',
      ecriture_id: 'e8',
      user_role: 'super_admin',
    })
  })

  it('un comptable n’est PAS considéré admin (pas d’override)', () => {
    const audit: OverrideRow[] = []
    const res = simulateTrigger({
      op: 'UPDATE',
      ecriture: { id: 'e9', societe_id: SOC, date_ecriture: '2024-01-15', journal_code: 'VTE' },
      exercices,
      userRole: 'comptable',
      userId: 'u-compta',
      overrideAudit: audit,
    })
    expect(res.ok).toBe(false)
    expect(audit).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────────────────────────────
// (C) Live DB — skipped : nécessite Supabase service role et seed real
// ──────────────────────────────────────────────────────────────────────
describe.skip('live DB — trigger ecriture_cloture_lock sur Supabase réel', () => {
  it.skip('REJETTE un INSERT VTE sur exo clôturé en base réelle (requiert SUPABASE_SERVICE_ROLE_KEY + seed)', () => {
    // Désactivé : ce test exige une connexion Supabase live et seed
    // un exercice clôturé. À activer en environnement de test isolé
    // (pas la prod dqepdoimpqhmuhkklxva — voir CLAUDE.md).
  })
})
