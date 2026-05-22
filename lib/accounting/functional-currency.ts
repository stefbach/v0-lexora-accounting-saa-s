/**
 * Helpers IAS 21 — Monnaie fonctionnelle et translation MUR.
 *
 * Phase A.1 du roadmap GBC. Permet à Lexora de tenir une comptabilité
 * primaire dans une devise ≠ MUR (typiquement USD pour les Global Business
 * Companies) tout en générant le reporting MUR pour la MRA.
 *
 * Règles IAS 21 §23 appliquées par classification de compte :
 *   • Items monétaires (trésorerie, créances, dettes) → closing rate
 *   • Items non monétaires au coût (immo, stocks) → historical rate
 *   • P&L (charges, produits) → transaction rate (ou taux moyen)
 *   • Capitaux propres → historical rate
 *   • CTA (compte 1078) → ne pas re-translater (résultat de la translation)
 *
 * L'écart résultant va en OCI (compte 1078) — IAS 21 §39.
 */

export type AccountClass = 'monetary' | 'non_monetary' | 'pnl' | 'equity' | 'equity_cta' | 'other'

/**
 * Classifie un numéro de compte PCM selon IAS 21 §23.
 * Doit rester en sync avec la fonction Postgres ias21_classify_account()
 * (migration 249).
 */
export function classifyAccount(numeroCompte: string): AccountClass {
  if (!numeroCompte) return 'other'
  const c = numeroCompte.trim()

  // Items monétaires (trésorerie, créances, dettes)
  if (c.startsWith('5')) return 'monetary'                // Trésorerie classe 5
  if (c.startsWith('40') || c.startsWith('41') || c.startsWith('42')
    || c.startsWith('43') || c.startsWith('44') || c.startsWith('45')
    || c.startsWith('46')) return 'monetary'              // Créances/dettes/comptes courants
  if (c.startsWith('16') || c.startsWith('17')) return 'monetary' // Emprunts

  // Capitaux propres (sauf 1078 lui-même)
  if (c.startsWith('1')) {
    if (c === '1078') return 'equity_cta'
    return 'equity'
  }

  // Items non monétaires (immo, stocks)
  if (c.startsWith('2') || c.startsWith('3')) return 'non_monetary'

  // P&L
  if (c.startsWith('6') || c.startsWith('7') || c.startsWith('8')) return 'pnl'

  return 'other'
}

/**
 * Rates supplied for a translation moment.
 *   • closingRate  : taux au date de clôture (pour items monétaires)
 *   • historical   : map compte → taux historique (pour items non monétaires
 *                    et capitaux propres). Si absent, fallback closingRate.
 *   • transaction  : taux à la date de transaction (pour P&L) — peut être
 *                    le taux moyen mensuel si non disponible
 */
export type TranslationRates = {
  closing: number              // ex: USD/MUR au 30/06/2026
  historical?: Record<string, number>
  transaction?: number         // taux du jour ou moyen mensuel
  average?: number             // taux moyen période (pour P&L)
}

/**
 * Détermine le taux de change applicable pour translater un montant en
 * monnaie fonctionnelle vers MUR.
 *
 * @param numeroCompte  Compte PCM (ex: '512', '411', '6411')
 * @param rates         Taux disponibles pour cette translation
 * @returns             Taux à appliquer : fonctionnelle → MUR
 */
export function getTranslationRate(numeroCompte: string, rates: TranslationRates): number {
  const klass = classifyAccount(numeroCompte)

  switch (klass) {
    case 'monetary':
      return rates.closing
    case 'non_monetary':
    case 'equity':
      // Taux historique si dispo, sinon closing comme fallback (audit warning)
      return rates.historical?.[numeroCompte] ?? rates.closing
    case 'pnl':
      // Taux moyen période si dispo, sinon transaction, sinon closing
      return rates.average ?? rates.transaction ?? rates.closing
    case 'equity_cta':
      // Le CTA est le résultat de la translation — ne pas le re-translater.
      // On retourne 1 et l'appelant doit traiter ce cas à part.
      return 1
    case 'other':
    default:
      return rates.closing
  }
}

/**
 * Translate un montant fonctionnel vers MUR selon IAS 21.
 * @param amountFonctionnelle Montant dans la devise de l'entité (ex: USD)
 * @param numeroCompte        Compte PCM pour déterminer le taux
 * @param rates               Taux disponibles
 * @returns                   Montant traduit en MUR
 */
export function translateToMUR(
  amountFonctionnelle: number,
  numeroCompte: string,
  rates: TranslationRates,
): { amount_mur: number; rate_used: number; classification: AccountClass } {
  const classification = classifyAccount(numeroCompte)
  const rate = getTranslationRate(numeroCompte, rates)
  return {
    amount_mur: Math.round(amountFonctionnelle * rate * 100) / 100,
    rate_used: rate,
    classification,
  }
}

/**
 * Vérifie si une société utilise une monnaie fonctionnelle ≠ MUR.
 * À utiliser en garde-fou avant de créer une écriture multi-devise.
 */
export function isMultiCurrencyEntity(deviseFonctionnelle: string | null | undefined): boolean {
  return !!deviseFonctionnelle && deviseFonctionnelle.toUpperCase() !== 'MUR'
}

/**
 * Construit une écriture comptable correcte pour IAS 21 :
 *   • debit_fonctionnelle / credit_fonctionnelle : montant primaire
 *   • debit_mur / credit_mur : translation MUR
 *   • taux_fonct_vers_mur : taux utilisé (audit trail)
 *
 * Cette fonction est le POINT D'ENTRÉE unique pour créer des écritures
 * dans une société multi-devise. À utiliser depuis les routes API qui
 * écrivent dans ecritures_comptables_v2.
 */
export type EcritureInput = {
  numero_compte: string
  debit_fonctionnelle?: number
  credit_fonctionnelle?: number
  devise_origine?: string  // devise de la transaction d'origine si ≠ fonctionnelle
}

export type EcritureOutput = {
  numero_compte: string
  debit_fonctionnelle: number
  credit_fonctionnelle: number
  debit_mur: number
  credit_mur: number
  devise_origine: string
  taux_fonct_vers_mur: number
}

export function buildMultiCurrencyEcriture(
  e: EcritureInput,
  rates: TranslationRates,
  deviseFonctionnelle: string,
): EcritureOutput {
  const debitF  = Number(e.debit_fonctionnelle)  || 0
  const creditF = Number(e.credit_fonctionnelle) || 0
  const rate = getTranslationRate(e.numero_compte, rates)
  return {
    numero_compte: e.numero_compte,
    debit_fonctionnelle:  debitF,
    credit_fonctionnelle: creditF,
    debit_mur:  Math.round(debitF  * rate * 100) / 100,
    credit_mur: Math.round(creditF * rate * 100) / 100,
    devise_origine: e.devise_origine || deviseFonctionnelle,
    taux_fonct_vers_mur: rate,
  }
}
