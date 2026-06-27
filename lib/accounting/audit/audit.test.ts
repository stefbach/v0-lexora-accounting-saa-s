import { describe, it, expect } from 'vitest'
import { buildLeadSchedules } from './lead-schedules'
import { computeMaterialite } from './materiality'
import { runAuditTests } from './tests'
import { buildPbcChecklist } from './pbc'
import { assembleAuditFile } from './index'
import type { TrialBalanceLine, EcritureStats } from './types'
import type { ModuleActivation } from '@/lib/accounting/regime'

const line = (p: Partial<TrialBalanceLine>): TrialBalanceLine => ({
  numero_compte: '2110', libelle: 'Test', classe: 2, type_compte: 'actif',
  sens_normal: 'D', total_debit: 0, total_credit: 0, solde: 0, ...p,
})

const emptyStats: EcritureStats = { comptesNonMappes: [], doublons: [], horsExercice: [], tiersNonLettres: [] }

const gbcModules: ModuleActivation = {
  gbc_modules_active: true, per_active: true, substance_required: true, ubo_required: true,
  tp_required: true, consolidation_active: false, crs_fatca_active: false,
  pillar_two_eligible: false, ias21_translation_active: true, ifrs16_leases_active: true,
}

const evidence = {
  hasBalance: true, hasGrandLivre: true, hasReleveBancaire: true, hasFactures: false,
  hasSubstanceData: false, hasUboData: false, hasTpData: false, hasLeases: false, hasConsolidation: false,
}

describe('buildLeadSchedules', () => {
  it('regroupe par préfixe 2 chiffres et calcule la variation N/N-1', () => {
    const n = [line({ numero_compte: '2110', solde: 1000 }), line({ numero_compte: '2120', solde: 500 })]
    const n1 = [line({ numero_compte: '2110', solde: 800 })]
    const ls = buildLeadSchedules(n, n1, 100)
    expect(ls).toHaveLength(1)
    expect(ls[0].code).toBe('21')
    expect(ls[0].total_n).toBe(1500)
    expect(ls[0].total_n1).toBe(800)
    expect(ls[0].variation).toBe(700)
    expect(ls[0].flagged).toBe(true) // 700 >= seuil 100
  })

  it('conserve un compte présent N-1 mais disparu en N', () => {
    const n: TrialBalanceLine[] = []
    const n1 = [line({ numero_compte: '5210', classe: 5, solde: 300 })]
    const ls = buildLeadSchedules(n, n1, 1000)
    expect(ls[0].lines[0].solde_n).toBe(0)
    expect(ls[0].lines[0].solde_n1).toBe(300)
  })
})

describe('computeMaterialite', () => {
  it('prend le max entre 1% actifs et 0,5% CA, avec plancher', () => {
    const bal = [
      line({ numero_compte: '2110', classe: 2, solde: 10_000_000 }), // actifs
      line({ numero_compte: '7010', classe: 7, solde: -5_000_000 }), // CA = 5M
    ]
    const m = computeMaterialite(bal)
    // 1% de 10M = 100k > 0,5% de 5M = 25k → seuil 100k
    expect(m.seuil).toBe(100_000)
    expect(m.methode).toContain('actifs')
  })
  it('applique le plancher quand les montants sont faibles', () => {
    const m = computeMaterialite([line({ numero_compte: '2110', solde: 1000 })])
    expect(m.seuil).toBe(50_000)
  })
})

describe('runAuditTests', () => {
  it('T1 détecte une balance déséquilibrée', () => {
    const bal = [line({ total_debit: 100, total_credit: 90, solde: 10 })]
    const f = runAuditTests({ balanceN: bal, leadSchedules: [], stats: emptyStats, seuilMaterialite: 1000 })
    const t1 = f.find((x) => x.test === 'T1_equilibre')
    expect(t1?.severity).toBe('critical')
  })
  it('ne signale rien sur une balance équilibrée et propre', () => {
    const bal = [line({ total_debit: 100, total_credit: 100, solde: 0 })]
    const f = runAuditTests({ balanceN: bal, leadSchedules: [], stats: emptyStats, seuilMaterialite: 1000 })
    expect(f.find((x) => x.test === 'T1_equilibre')).toBeUndefined()
  })
  it('T6 cut-off est critique', () => {
    const stats: EcritureStats = { ...emptyStats, horsExercice: [{ numero_compte: '6110', date: '2030-01-01', montant: 500 }] }
    const f = runAuditTests({ balanceN: [], leadSchedules: [], stats, seuilMaterialite: 1000 })
    expect(f.find((x) => x.test === 'T6_cutoff')?.severity).toBe('critical')
  })
})

describe('buildPbcChecklist', () => {
  it('inclut les items GBC selon les modules actifs et pré-coche le fourni', () => {
    const pbc = buildPbcChecklist(gbcModules, evidence)
    expect(pbc.find((p) => p.code === 'SUB')).toBeTruthy() // substance requise
    expect(pbc.find((p) => p.code === 'TP')).toBeTruthy()
    expect(pbc.find((p) => p.code === 'GL')?.fourni).toBe(true)
    expect(pbc.find((p) => p.code === 'INV')?.fourni).toBe(false)
  })
})

describe('assembleAuditFile', () => {
  it('produit un dossier complet avec disclaimer et résumé cohérent', () => {
    const n = [
      line({ numero_compte: '2110', classe: 2, solde: 1000, total_debit: 1000, total_credit: 0 }),
      line({ numero_compte: '1010', classe: 1, sens_normal: 'C', solde: -1000, total_debit: 0, total_credit: 1000 }),
    ]
    const file = assembleAuditFile({
      societe_id: 's1', exercice: '2025-2026', exercice_n1: '2024-2025',
      regime: 'gbc1', devise: 'USD', genere_le: '2026-06-27T00:00:00Z',
      modules: gbcModules, balanceN: n, balanceN1: [], stats: emptyStats, evidence,
    })
    expect(file.equilibre).toBe(true)
    expect(file.disclaimer).toContain('MIPA')
    expect(file.resume.pbc_total).toBe(file.pbc.length)
    expect(file.leadSchedules.length).toBeGreaterThan(0)
  })
})
