/**
 * Moteur d'audit-readiness GBC — orchestrateur pur.
 *
 * Assemble le dossier d'audit (feuilles maîtresses + tests + PBC list) à partir
 * de données déjà calculées côté serveur. Aucune I/O, aucune dépendance horaire
 * (le timestamp est fourni par l'appelant) → entièrement testable.
 *
 * ⚠️ Pré-audit uniquement. L'opinion d'audit reste émise par un auditeur agréé
 * MIPA indépendant. Voir `DISCLAIMER`.
 */
import type { ModuleActivation } from '@/lib/accounting/regime'
import type { TrialBalanceLine, EcritureStats, AuditFile } from './types'
import { buildLeadSchedules } from './lead-schedules'
import { computeMaterialite } from './materiality'
import { runAuditTests } from './tests'
import { buildPbcChecklist, type PbcEvidence } from './pbc'

export * from './types'
export { buildLeadSchedules, classeLabel, CLASSE_LABELS } from './lead-schedules'
export { computeMaterialite } from './materiality'
export { runAuditTests } from './tests'
export { buildPbcChecklist } from './pbc'
export type { PbcEvidence } from './pbc'

export const DISCLAIMER =
  "Document de pré-audit généré par Lexora à partir des données comptables. Il ne " +
  "constitue PAS une opinion d'audit. L'audit statutaire de la GBC doit être réalisé " +
  "et signé par un auditeur agréé MIPA indépendant (Companies Act 2001, règles FSC)."

export function assembleAuditFile(input: {
  societe_id: string
  exercice: string
  exercice_n1: string | null
  regime: string
  devise: string
  genere_le: string
  modules: ModuleActivation
  balanceN: TrialBalanceLine[]
  balanceN1: TrialBalanceLine[]
  stats: EcritureStats
  evidence: PbcEvidence
}): AuditFile {
  const {
    societe_id, exercice, exercice_n1, regime, devise, genere_le,
    modules, balanceN, balanceN1, stats, evidence,
  } = input

  const materialite = computeMaterialite(balanceN)
  const leadSchedules = buildLeadSchedules(balanceN, balanceN1, materialite.seuil)
  const findings = runAuditTests({ balanceN, leadSchedules, stats, seuilMaterialite: materialite.seuil })
  const pbc = buildPbcChecklist(modules, evidence)

  const totalDebit = balanceN.reduce((s, l) => s + l.total_debit, 0)
  const totalCredit = balanceN.reduce((s, l) => s + l.total_credit, 0)
  const equilibre = Math.abs(totalDebit - totalCredit) < 0.01

  return {
    societe_id,
    exercice,
    exercice_n1,
    regime,
    devise,
    genere_le,
    equilibre,
    materialite,
    leadSchedules,
    findings,
    pbc,
    resume: {
      nb_comptes: balanceN.length,
      nb_findings_critical: findings.filter((f) => f.severity === 'critical').length,
      nb_findings_warning: findings.filter((f) => f.severity === 'warning').length,
      nb_lead_flagged: leadSchedules.filter((l) => l.flagged).length,
      pbc_fournis: pbc.filter((p) => p.fourni).length,
      pbc_total: pbc.length,
    },
    disclaimer: DISCLAIMER,
  }
}
