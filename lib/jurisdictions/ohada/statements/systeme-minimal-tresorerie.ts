/**
 * Système Minimal de Trésorerie (SMT) – SYSCOHADA
 * Réservé aux TPE (Très Petites Entreprises) avec CA HT < 60 millions XOF/XAF
 * Référence: AUDCIF (Acte Uniforme relatif au Droit Comptable et à l'Information Financière)
 */

import type {
  StatementInput,
  BalanceSheet,
  IncomeStatement,
  FinancialNotes,
} from '../../core/financial-statements.interface'

// ─── Interfaces ──────────────────────────────────────────────────────────────

/** État Recettes-Dépenses (équivalent simplifié du compte de résultat) */
export interface SMTRecettesDepenses {
  periodStart: Date
  periodEnd: Date
  currency: string

  recettes: {
    ventes: number
    prestationsDeServices: number
    autresRecettes: number
    totalRecettes: number
  }

  depenses: {
    achatsMarchandises: number
    chargesDePersonnel: number
    loyer: number
    eauElectriciteTelephone: number
    transport: number
    autresCharges: number
    impotsEtTaxes: number
    totalDepenses: number
  }

  resultat: number // recettes - dépenses
}

/** Situation de Trésorerie */
export interface SMTTresorerie {
  periodStart: Date
  periodEnd: Date
  currency: string

  soldeInitialCaisse: number
  soldeInitialBanque: number
  soldeInitial: number // caisse + banque

  encaissements: number
  decaissements: number

  soldeFinalCaisse: number
  soldeFinalBanque: number
  soldeFinal: number // caisse + banque

  variationNette: number // soldeFinal - soldeInitial
}

/** Tableau de Patrimoine Simplifié */
export interface SMTPatrimoine {
  periodEnd: Date
  currency: string

  actif: {
    immobilisations: number       // valeur brute simple
    stocks: number                // inventaire physique
    creancesClients: number
    tresorerie: number
    totalActif: number
  }

  passif: {
    capital: number
    resultat: number
    emprunts: number
    fournisseurs: number
    autresDettes: number
    totalPassif: number
  }

  balanced: boolean               // actif === passif
}

/** Résultat du contrôle d'éligibilité au SMT */
export interface SMTEligibilityResult {
  eligible: boolean
  reason?: string
}

// ─── Seuils AUDCIF ───────────────────────────────────────────────────────────

export const SMT_SEUIL_CA_XOF = 60_000_000    // 60 millions XOF/XAF
export const SMT_SEUIL_EFFECTIF = 20

// ─── Contrôle d'éligibilité ──────────────────────────────────────────────────

/**
 * Vérifie si une entité est éligible au Système Minimal de Trésorerie.
 * @param caHT         Chiffre d'affaires HT annuel en XOF/XAF
 * @param effectif     Nombre de salariés
 * @param activiteReglementee  L'activité est-elle réglementée (banque, assurance, etc.)
 */
export function checkSMTEligibility(
  caHT: number,
  effectif: number,
  activiteReglementee: boolean,
): SMTEligibilityResult {
  if (activiteReglementee) {
    return {
      eligible: false,
      reason: 'Les entités exerçant une activité réglementée ne peuvent pas utiliser le SMT.',
    }
  }
  if (caHT >= SMT_SEUIL_CA_XOF) {
    return {
      eligible: false,
      reason: `Le chiffre d'affaires HT (${caHT.toLocaleString()} XOF) dépasse le seuil SMT de ${SMT_SEUIL_CA_XOF.toLocaleString()} XOF.`,
    }
  }
  if (effectif >= SMT_SEUIL_EFFECTIF) {
    return {
      eligible: false,
      reason: `L'effectif (${effectif} salariés) dépasse le seuil SMT de ${SMT_SEUIL_EFFECTIF} salariés.`,
    }
  }
  return { eligible: true }
}

// ─── Générateurs d'états financiers SMT ──────────────────────────────────────

/**
 * Génère l'état Recettes-Dépenses à partir des soldes de comptes fournis dans StatementInput.
 * Les montants sont lus via les métadonnées étendues de l'input (champ `comptes` attendu).
 */
export async function generateSMTRecettesDepenses(
  input: StatementInput & { comptes?: Record<string, number> },
): Promise<SMTRecettesDepenses> {
  const c = input.comptes ?? {}

  const ventes = Math.abs(c['701'] ?? 0)
  const prestationsDeServices = Math.abs(c['706'] ?? 0)
  const autresRecettes = Math.abs(c['75'] ?? 0) + Math.abs(c['77'] ?? 0)
  const totalRecettes = ventes + prestationsDeServices + autresRecettes

  const achatsMarchandises = Math.abs(c['601'] ?? 0) + Math.abs(c['602'] ?? 0)
  const chargesDePersonnel = Math.abs(c['66'] ?? 0)
  const loyer = Math.abs(c['622'] ?? 0)
  const eauElectriciteTelephone = Math.abs(c['624'] ?? 0) + Math.abs(c['626'] ?? 0)
  const transport = Math.abs(c['625'] ?? 0)
  const autresCharges = Math.abs(c['628'] ?? 0) + Math.abs(c['65'] ?? 0)
  const impotsEtTaxes = Math.abs(c['64'] ?? 0)
  const totalDepenses =
    achatsMarchandises +
    chargesDePersonnel +
    loyer +
    eauElectriciteTelephone +
    transport +
    autresCharges +
    impotsEtTaxes

  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    currency: input.currency ?? 'XOF',
    recettes: { ventes, prestationsDeServices, autresRecettes, totalRecettes },
    depenses: {
      achatsMarchandises,
      chargesDePersonnel,
      loyer,
      eauElectriciteTelephone,
      transport,
      autresCharges,
      impotsEtTaxes,
      totalDepenses,
    },
    resultat: totalRecettes - totalDepenses,
  }
}

/**
 * Génère la Situation de Trésorerie à partir des soldes de comptes de trésorerie.
 */
export async function generateSMTTresorerie(
  input: StatementInput & {
    comptes?: Record<string, number>
    soldesInitiaux?: Record<string, number>
  },
): Promise<SMTTresorerie> {
  const c = input.comptes ?? {}
  const si = input.soldesInitiaux ?? {}

  const soldeInitialCaisse = si['571'] ?? 0
  const soldeInitialBanque = (si['521'] ?? 0) + (si['511'] ?? 0)
  const soldeInitial = soldeInitialCaisse + soldeInitialBanque

  const encaissements = Math.abs(c['encaissements'] ?? 0)
  const decaissements = Math.abs(c['decaissements'] ?? 0)

  const soldeFinalCaisse = c['571'] ?? 0
  const soldeFinalBanque = (c['521'] ?? 0) + (c['511'] ?? 0)
  const soldeFinal = soldeFinalCaisse + soldeFinalBanque

  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    currency: input.currency ?? 'XOF',
    soldeInitialCaisse,
    soldeInitialBanque,
    soldeInitial,
    encaissements,
    decaissements,
    soldeFinalCaisse,
    soldeFinalBanque,
    soldeFinal,
    variationNette: soldeFinal - soldeInitial,
  }
}

/**
 * Génère le Tableau de Patrimoine Simplifié (bilan TPE).
 */
export async function generateSMTPatrimoine(
  input: StatementInput & { comptes?: Record<string, number> },
): Promise<SMTPatrimoine> {
  const c = input.comptes ?? {}

  // ACTIF
  const immobilisations = Math.abs(c['2'] ?? 0)
  const stocks = Math.abs(c['3'] ?? 0)
  const creancesClients = Math.abs(c['411'] ?? 0)
  const tresorerie = Math.abs(c['571'] ?? 0) + Math.abs(c['521'] ?? 0) + Math.abs(c['511'] ?? 0)
  const totalActif = immobilisations + stocks + creancesClients + tresorerie

  // PASSIF
  const capital = Math.abs(c['101'] ?? 0)
  const resultat = c['130'] ?? 0 // peut être négatif
  const emprunts = Math.abs(c['16'] ?? 0)
  const fournisseurs = Math.abs(c['401'] ?? 0)
  const autresDettes = Math.abs(c['42'] ?? 0) + Math.abs(c['43'] ?? 0) + Math.abs(c['44'] ?? 0)
  const totalPassif = capital + resultat + emprunts + fournisseurs + autresDettes

  return {
    periodEnd: input.periodEnd,
    currency: input.currency ?? 'XOF',
    actif: { immobilisations, stocks, creancesClients, tresorerie, totalActif },
    passif: { capital, resultat, emprunts, fournisseurs, autresDettes, totalPassif },
    balanced: Math.abs(totalActif - totalPassif) < 1,
  }
}
