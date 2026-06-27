/**
 * PBC list (Prepared By Client) — checklist dynamique des pièces à fournir à
 * l'auditeur, adaptée au régime de la société via getActiveModules().
 * Pré-cochée selon ce que Lexora possède déjà (`fourni`).
 */
import type { ModuleActivation } from '@/lib/accounting/regime'
import type { PbcItem } from './types'

/** Indique ce que Lexora détient déjà, pour pré-cocher la PBC list. */
export type PbcEvidence = {
  hasBalance: boolean
  hasGrandLivre: boolean
  hasReleveBancaire: boolean
  hasFactures: boolean
  hasSubstanceData: boolean
  hasUboData: boolean
  hasTpData: boolean
  hasLeases: boolean
  hasConsolidation: boolean
}

export function buildPbcChecklist(modules: ModuleActivation, ev: PbcEvidence): PbcItem[] {
  const items: PbcItem[] = []

  // Socle comptable — toujours requis.
  items.push(
    { code: 'GL', categorie: 'Comptabilité', intitule: 'Balance générale + grand livre de l’exercice', obligatoire: true, fourni: ev.hasBalance && ev.hasGrandLivre },
    { code: 'BANK', categorie: 'Banque', intitule: 'Relevés bancaires + rapprochements de clôture', obligatoire: true, fourni: ev.hasReleveBancaire },
    { code: 'INV', categorie: 'Tiers', intitule: 'Factures ventes/achats & balance âgée tiers', obligatoire: true, fourni: ev.hasFactures },
    { code: 'FS', categorie: 'États financiers', intitule: 'États financiers Full IFRS (brouillon) + notes', obligatoire: true, fourni: false },
    { code: 'OB', categorie: 'Comptabilité', intitule: 'Justification des soldes d’ouverture (N-1 audité)', obligatoire: true, fourni: false },
  )

  // Modules GBC conditionnels.
  if (modules.substance_required) {
    items.push({ code: 'SUB', categorie: 'Substance (CIGA)', intitule: 'Dossier substance : dépenses MU, employés qualifiés, PV de board, locaux', obligatoire: true, fourni: ev.hasSubstanceData })
  }
  if (modules.tp_required) {
    items.push({ code: 'TP', categorie: 'Transfer Pricing', intitule: 'Documentation TP (local file) des transactions intragroupe', obligatoire: true, fourni: ev.hasTpData })
  }
  if (modules.ubo_required) {
    items.push({ code: 'UBO', categorie: 'Beneficial Ownership', intitule: 'Registre des bénéficiaires effectifs + KYC à jour', obligatoire: true, fourni: ev.hasUboData })
  }
  if (modules.ifrs16_leases_active) {
    items.push({ code: 'LEASE', categorie: 'IFRS 16', intitule: 'Contrats de location + calculs droit d’usage / dette locative', obligatoire: true, fourni: ev.hasLeases })
  }
  if (modules.consolidation_active) {
    items.push({ code: 'CONSO', categorie: 'Consolidation', intitule: 'Périmètre de consolidation + éliminations intragroupe', obligatoire: true, fourni: ev.hasConsolidation })
  }
  if (modules.crs_fatca_active) {
    items.push({ code: 'CRS', categorie: 'CRS / FATCA', intitule: 'Déclarations CRS/FATCA + comptes déclarables', obligatoire: true, fourni: false })
  }
  if (modules.per_active) {
    items.push({ code: 'PER', categorie: 'Fiscalité', intitule: 'Calcul PER 80 % + Foreign Tax Credit + attestation de substance', obligatoire: true, fourni: false })
  }
  if (modules.pillar_two_eligible) {
    items.push({ code: 'P2', categorie: 'Pillar Two', intitule: 'GloBE Information Return (si groupe > 750M €)', obligatoire: false, fourni: false })
  }

  // Gouvernance — toujours utile.
  items.push(
    { code: 'MIN', categorie: 'Gouvernance', intitule: 'Procès-verbaux des assemblées et du conseil', obligatoire: true, fourni: false },
    { code: 'LIC', categorie: 'FSC', intitule: 'Licence FSC en cours de validité + frais annuels payés', obligatoire: true, fourni: false },
  )

  return items
}
