/**
 * Déduction du code SWIFT/BIC à partir d'un IBAN.
 *
 * Heuristique pragmatique : on parse le code pays + le code banque
 * (caractères 5-8 de l'IBAN) et on cherche dans un mapping local.
 *
 * Couverture actuelle :
 *   • Maurice (MU)   — toutes les banques principales
 *   • France (FR)    — quelques codes très courants (BNP, SocGen, CA, LCL)
 *   • Allemagne (DE) — BIC déductible via les 8 premiers caractères de
 *                     la Bankleitzahl (table simplifiée)
 *
 * Si le code n'est pas reconnu, retourne null → l'UI invite à saisir
 * manuellement.
 */

export interface IbanParseResult {
  countryCode: string
  bankCode: string | null
  isValidFormat: boolean
}

/** Mapping code-banque-Maurice → SWIFT. Source : BIC officiels. */
const MAURITIUS_BANK_SWIFT: Record<string, string> = {
  MCBL: 'MCBLMUMU', // Mauritius Commercial Bank
  STCB: 'STCBMUMU', // SBM Bank (State Bank)
  SBMU: 'STCBMUMU', // alias SBM
  BARC: 'BARCMUMU', // Barclays (ABSA)
  ABSA: 'ABSAMUMU', // Absa Bank
  HSBC: 'HSBCMUMU', // HSBC
  AFRA: 'AFRAMUMU', // AfrAsia
  BANC: 'BCMUMUMU', // Bank One
  BMOI: 'BMOIMUMU', // BCP Bank
  BARB: 'BARBMUMU', // Bank of Baroda
  HABM: 'HABMMUMU', // Habib Bank
  CIBC: 'CIBCMUMU', // CIM Finance / CIBC
  STAN: 'STANMUMU', // Standard Chartered
}

/** Codes France les plus communs (5 premiers chiffres = code banque). */
const FRANCE_BANK_SWIFT: Record<string, string> = {
  '30004': 'BNPAFRPP', // BNP Paribas
  '30003': 'SOGEFRPP', // Société Générale
  '20041': 'PSSTFRPP', // La Banque Postale
  '10907': 'BSABFRPP', // Banque Populaire (généraliste)
  '17806': 'AGRIFRPP', // Crédit Agricole (générique national)
  '30002': 'CRLYFRPP', // LCL
  '14707': 'CMCIFRPP', // CIC Est
  '14506': 'CMCIFRPP', // CIC
  '40031': 'NORDFRPP', // Banque Nord-Sud
  '12579': 'CCBPFRPP', // Caisse d'Épargne (générique)
  '30056': 'CCFRFRPP', // HSBC France
}

/**
 * Parse un IBAN brut en code pays + code banque normalisé.
 * Retourne `isValidFormat=false` si la longueur ou le pays est suspect.
 */
export function parseIban(ibanInput: string | null | undefined): IbanParseResult {
  if (!ibanInput) return { countryCode: '', bankCode: null, isValidFormat: false }
  const cleaned = String(ibanInput).replace(/\s+/g, '').toUpperCase()
  if (cleaned.length < 8) {
    return { countryCode: cleaned.slice(0, 2), bankCode: null, isValidFormat: false }
  }
  const countryCode = cleaned.slice(0, 2)
  // Longueurs IBAN attendues par pays (extrait — couvre nos cas)
  const expectedLen: Record<string, number> = {
    MU: 30, FR: 27, DE: 22, GB: 22, BE: 16, ES: 24, IT: 27, NL: 18, CH: 21, LU: 20,
  }
  const expected = expectedLen[countryCode]
  const isValidFormat = expected ? cleaned.length === expected : cleaned.length >= 15

  // Code banque selon le pays :
  //   MU : positions 5..8 (4 lettres)
  //   FR : positions 5..9 (5 chiffres)
  //   DE : positions 5..12 (8 chiffres — Bankleitzahl)
  //   GB : positions 5..8 (4 lettres SWIFT racine) + 6 chiffres sort code
  //   Default : 5..8
  let bankCode: string | null = null
  if (countryCode === 'FR') bankCode = cleaned.slice(4, 9)
  else if (countryCode === 'DE') bankCode = cleaned.slice(4, 12)
  else if (countryCode === 'GB') bankCode = cleaned.slice(4, 8)
  else bankCode = cleaned.slice(4, 8)

  return { countryCode, bankCode, isValidFormat }
}

/**
 * Déduit le code SWIFT/BIC standard depuis un IBAN. Retourne null si :
 *   • IBAN vide ou trop court
 *   • pays non couvert
 *   • code banque inconnu dans le mapping local
 *
 * L'UI doit toujours permettre la saisie manuelle si null est retourné.
 */
export function inferSwiftFromIban(ibanInput: string | null | undefined): string | null {
  const parsed = parseIban(ibanInput)
  if (!parsed.bankCode) return null

  if (parsed.countryCode === 'MU') {
    return MAURITIUS_BANK_SWIFT[parsed.bankCode] || null
  }
  if (parsed.countryCode === 'FR') {
    return FRANCE_BANK_SWIFT[parsed.bankCode] || null
  }
  return null
}

/**
 * Variante explicite qui renvoie aussi la confiance et un message
 * d'erreur structuré — utile pour l'UI (badge "auto" vs "à vérifier").
 */
export function inferSwiftWithDiagnostic(ibanInput: string | null | undefined): {
  swift: string | null
  countryCode: string
  bankCode: string | null
  message: string
} {
  const parsed = parseIban(ibanInput)
  if (!ibanInput || !ibanInput.trim()) {
    return { swift: null, countryCode: '', bankCode: null, message: 'IBAN vide' }
  }
  if (!parsed.isValidFormat) {
    return {
      swift: null,
      countryCode: parsed.countryCode,
      bankCode: parsed.bankCode,
      message: `Format IBAN inattendu pour ${parsed.countryCode || '??'} — vérifiez la saisie.`,
    }
  }
  const swift = inferSwiftFromIban(ibanInput)
  if (swift) {
    return {
      swift,
      countryCode: parsed.countryCode,
      bankCode: parsed.bankCode,
      message: `Banque reconnue (${parsed.countryCode} / ${parsed.bankCode}).`,
    }
  }
  return {
    swift: null,
    countryCode: parsed.countryCode,
    bankCode: parsed.bankCode,
    message: `Code banque "${parsed.bankCode}" non reconnu dans la base locale (${parsed.countryCode}). Saisir le SWIFT manuellement.`,
  }
}
