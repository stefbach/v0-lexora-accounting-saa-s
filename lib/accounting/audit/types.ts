/**
 * Moteur d'audit-readiness GBC — types partagés.
 *
 * Rappel garde-fou : Lexora PRÉPARE le dossier d'audit (pré-audit). L'opinion
 * d'audit reste émise et signée par un auditeur agréé MIPA indépendant.
 * Aucune sortie de ce module ne constitue une opinion d'audit.
 */

/** Ligne de balance générale (trial balance) agrégée par compte. */
export type TrialBalanceLine = {
  numero_compte: string
  libelle: string
  classe: number // 1..7
  type_compte: string // actif | passif | charge | produit | capitaux
  sens_normal: 'D' | 'C'
  total_debit: number
  total_credit: number
  /** solde = total_debit - total_credit (signé). */
  solde: number
}

/** Ligne d'une feuille maîtresse (lead schedule) : un compte, N vs N-1. */
export type LeadScheduleLine = {
  numero_compte: string
  libelle: string
  solde_n: number
  solde_n1: number
  variation: number
  variation_pct: number | null // null si N-1 = 0
}

/** Feuille maîtresse : regroupement de comptes par rubrique d'états financiers. */
export type LeadSchedule = {
  code: string // préfixe 2 chiffres, ex "21"
  caption: string // libellé de la rubrique
  classe: number
  lines: LeadScheduleLine[]
  total_n: number
  total_n1: number
  variation: number
  variation_pct: number | null
  /** true si la variation dépasse le seuil de matérialité → à investiguer. */
  flagged: boolean
}

export type AuditSeverity = 'info' | 'warning' | 'critical'

/** Constat d'un test d'audit automatique (toujours explicable). */
export type AuditFinding = {
  test: string // identifiant du test, ex "T1_equilibre"
  severity: AuditSeverity
  titre: string
  explication: string // langage naturel — exigible par l'auditeur
  /** Références concrètes (comptes, pièces) pour la traçabilité. */
  refs?: Array<{ numero_compte?: string; montant?: number; detail?: string }>
}

/** Élément de la PBC list (Prepared By Client) — pièces à fournir à l'auditeur. */
export type PbcItem = {
  code: string
  categorie: string // ex "Substance", "Transfer Pricing", "Banque"
  intitule: string
  obligatoire: boolean
  /** true si Lexora dispose déjà de l'élément (pré-coché). */
  fourni: boolean
  note?: string
}

/** Statistiques niveau écriture (calculées côté serveur, passées aux tests). */
export type EcritureStats = {
  /** Comptes présents dans les écritures mais absents du plan comptable. */
  comptesNonMappes: string[]
  /** Doublons potentiels : même date + compte + montant + description. */
  doublons: Array<{ numero_compte: string; date: string; montant: number; description: string; count: number }>
  /** Écritures hors de la fenêtre de l'exercice (cut-off). */
  horsExercice: Array<{ numero_compte: string; date: string; montant: number }>
  /** Comptes de tiers (classe 4) avec écritures non lettrées. */
  tiersNonLettres: Array<{ numero_compte: string; nb: number; montant: number }>
}

/** Indice de matérialité (benchmark, à confirmer par l'auditeur). */
export type Materialite = {
  base: number
  methode: string
  seuil: number // matérialité globale
  seuil_pct: number
}

/** Dossier d'audit-readiness complet (sortie du moteur). */
export type AuditFile = {
  societe_id: string
  exercice: string
  exercice_n1: string | null
  regime: string
  devise: string
  genere_le: string // ISO — fourni par l'appelant (pas de Date.now ici)
  equilibre: boolean
  materialite: Materialite
  leadSchedules: LeadSchedule[]
  findings: AuditFinding[]
  pbc: PbcItem[]
  resume: {
    nb_comptes: number
    nb_findings_critical: number
    nb_findings_warning: number
    nb_lead_flagged: number
    pbc_fournis: number
    pbc_total: number
  }
  disclaimer: string
}
