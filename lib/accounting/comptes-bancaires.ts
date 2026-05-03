/**
 * Helper pour générer automatiquement le compte comptable d'un compte bancaire
 * (numero du PCM Maurice 512xxx) selon la banque + la devise.
 *
 * Convention : 512<BB><D>
 *   BB = code banque (2 digits) — voir BANK_CODES (aligné sur banques_mauritius mig 211)
 *   D  = code devise (1 digit)  — voir DEVISE_CODES
 *
 * Exemples :
 *   getCompteComptable('Mauritius Commercial Bank', 'MUR') → '512100'
 *   getCompteComptable('MCB', 'EUR')                       → '512101'
 *   getCompteComptable('SBM', 'USD')                       → '512202'
 *   getCompteComptable('HSBC Mauritius', 'EUR')            → '512801'
 *   getCompteComptable('Banque inconnue', 'MUR')           → '512990'
 *
 * Utilisation : appelé dans le flow OCR upload (app/api/documents/upload/route.ts)
 * lors de la détection d'un nouveau compte bancaire ou d'une mise à jour
 * d'un compte existant qui n'a pas encore de compte_comptable. Permet une
 * onboarding 100% automatique des comptes bancaires sans config manuelle.
 *
 * Si un client a plusieurs comptes dans la même banque + même devise, le 2e
 * compte aura le MÊME compte_comptable. Le user devra alors discriminer
 * manuellement (ex: 512100 → 512100A, 512100B). Cas rare en pratique.
 */

// ── Codes banque (2 digits) ──────────────────────────────────────────────────
// Aligné sur la table banques_mauritius (migration 211). Toute nouvelle
// banque ajoutée à banques_mauritius doit aussi être ajoutée ici.
const BANK_CODES: Record<string, string> = {
  // Banques mauriciennes commerciales
  MCB: '10',          // Mauritius Commercial Bank
  SBM: '20',          // State Bank of Mauritius
  ABSA: '30',         // ABSA Bank Mauritius (ex-Barclays)
  BANKONE: '40',      // Bank One
  AFRASIA: '50',      // AfrAsia Bank
  MAUBANK: '60',      // MauBank
  SCB: '70',          // Standard Chartered
  HSBC: '80',         // HSBC Mauritius
  SBI: '90',          // State Bank of India (Mauritius)
  BOB: '91',          // Bank of Baroda
  ABC: '92',          // ABC Banking Corporation
  BNP: '93',          // BNP Paribas Mauritius
  CITI: '94',         // Citibank Mauritius
  HABIB: '95',        // Habib Bank
  INVESTEC: '96',     // Investec
  BCP: '97',          // Banque de Commerce et de Placements
}

// Code générique pour banque non identifiée
const BANK_CODE_UNKNOWN = '99'

// ── Codes devise (1 digit) ───────────────────────────────────────────────────
const DEVISE_CODES: Record<string, string> = {
  MUR: '0',  // Roupie mauricienne (devise locale)
  EUR: '1',
  USD: '2',
  GBP: '3',
  AUD: '4',
  CAD: '5',
  CHF: '6',
  ZAR: '7',
  INR: '8',
}

// Code générique pour devise non identifiée
const DEVISE_CODE_UNKNOWN = '9'

/**
 * Normalise le nom d'une banque pour le matching (uppercase, alphanumeric only).
 * Ex: "Mauritius Commercial Bank Ltd." → "MAURITIUSCOMMERCIALBANKLTD"
 */
function normalizeBankName(banque: string): string {
  return banque.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Détecte le code banque (2 digits) depuis un nom potentiellement non normé.
 * Cherche d'abord les codes exacts (ex: "MCB"), puis les noms longs
 * ("MAURITIUSCOMMERCIALBANK") en commençant par les plus spécifiques.
 *
 * Retourne BANK_CODE_UNKNOWN si aucune correspondance.
 */
function detectBankCode(banque: string | null | undefined): string {
  if (!banque) return BANK_CODE_UNKNOWN
  const norm = normalizeBankName(banque)
  if (!norm) return BANK_CODE_UNKNOWN

  // Match avec patterns spécifiques (par ordre de priorité)
  // On utilise des aliases connus pour gérer les variations de nommage par OCR
  const PATTERNS: Array<[string[], string]> = [
    [['MAURITIUSCOMMERCIALBANK', 'MCB'], BANK_CODES.MCB],
    [['STATEBANKOFMAURITIUS', 'SBM'], BANK_CODES.SBM],
    [['ABSABANK', 'BARCLAYSMAURITIUS', 'BARCLAYS', 'ABSA'], BANK_CODES.ABSA],
    [['BANKONE', 'BANK1'], BANK_CODES.BANKONE],
    [['AFRASIA', 'AFRASIABANK'], BANK_CODES.AFRASIA],
    [['MAUBANK'], BANK_CODES.MAUBANK],
    [['STANDARDCHARTERED', 'SCB', 'STANCHART'], BANK_CODES.SCB],
    [['HSBC', 'HSBCMAURITIUS'], BANK_CODES.HSBC],
    [['STATEBANKOFINDIA', 'SBIMAURITIUS', 'SBI'], BANK_CODES.SBI],
    [['BANKOFBARODA', 'BOB'], BANK_CODES.BOB],
    [['ABCBANKING', 'ABCBANK', 'ABC'], BANK_CODES.ABC],
    [['BNPPARIBAS', 'BNP'], BANK_CODES.BNP],
    [['CITIBANK', 'CITI'], BANK_CODES.CITI],
    [['HABIBBANK', 'HABIB'], BANK_CODES.HABIB],
    [['INVESTEC'], BANK_CODES.INVESTEC],
    [['BCP', 'BANQUEDECOMMERCE'], BANK_CODES.BCP],
  ]

  for (const [aliases, code] of PATTERNS) {
    for (const alias of aliases) {
      if (norm.includes(alias)) return code
    }
  }
  return BANK_CODE_UNKNOWN
}

/**
 * Détecte le code devise (1 digit) depuis une chaîne potentiellement non normée.
 * Retourne DEVISE_CODE_UNKNOWN si la devise n'est pas identifiée.
 */
function detectDeviseCode(devise: string | null | undefined): string {
  if (!devise) return DEVISE_CODES.MUR // Fallback raisonnable : MUR (devise locale)
  const norm = devise.toUpperCase().replace(/[^A-Z]/g, '')
  return DEVISE_CODES[norm] || DEVISE_CODE_UNKNOWN
}

/**
 * Génère le compte comptable PCM (512xxx) pour un compte bancaire selon la
 * banque et la devise. Garantit toujours un format 6 digits commençant par
 * 512 — jamais NULL, jamais vide.
 *
 * @param banque  Nom de la banque (ex: "Mauritius Commercial Bank", "MCB", "SBM")
 * @param devise  Code devise ISO 4217 (ex: "MUR", "EUR", "USD")
 * @returns       Compte comptable 6 digits (ex: "512100", "512801", "512990")
 */
export function getCompteComptable(
  banque: string | null | undefined,
  devise: string | null | undefined,
): string {
  const bankCode = detectBankCode(banque)
  const deviseCode = detectDeviseCode(devise)
  return `512${bankCode}${deviseCode}`
}

/**
 * Vérifie si un compte_comptable est dans le format canonique 512xxx généré
 * par getCompteComptable. Utile pour identifier les comptes legacy à backfiller.
 */
export function isCanonicalCompteComptable(compteComptable: string | null | undefined): boolean {
  if (!compteComptable) return false
  return /^512\d{3}$/.test(compteComptable)
}
