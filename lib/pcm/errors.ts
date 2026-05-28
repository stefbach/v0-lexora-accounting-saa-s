/**
 * Erreurs typées du module PCM.
 *
 * Chaque erreur porte un code stable (PCM_xxx) pour faciliter le debug,
 * les tests, et le mapping vers des status HTTP côté API.
 */

export type PCMErrorCode =
  | 'PCM_001' // Template introuvable
  | 'PCM_002' // Prérequis module manquant
  | 'PCM_003' // Compte déjà existant (numéro en doublon)
  | 'PCM_004' // Compte introuvable
  | 'PCM_005' // Numéro de compte invalide (format)
  | 'PCM_006' // Compte archivé avec écritures → reclassement requis
  | 'PCM_007' // Société en période clôturée → modification interdite
  | 'PCM_008' // Template JSON invalide
  | 'PCM_009' // Classe incohérente avec le numéro
  | 'PCM_010' // Reclassement : compte cible introuvable
  | 'PCM_011' // Accès société refusé

const HTTP_STATUS: Record<PCMErrorCode, number> = {
  PCM_001: 404,
  PCM_002: 422,
  PCM_003: 409,
  PCM_004: 404,
  PCM_005: 400,
  PCM_006: 422,
  PCM_007: 403,
  PCM_008: 422,
  PCM_009: 400,
  PCM_010: 404,
  PCM_011: 403,
}

export class PCMError extends Error {
  code: PCMErrorCode
  httpStatus: number
  details?: unknown

  constructor(code: PCMErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'PCMError'
    this.code = code
    this.httpStatus = HTTP_STATUS[code]
    this.details = details
  }

  toJSON() {
    return { error: this.message, code: this.code, details: this.details }
  }
}

export function isPCMError(e: unknown): e is PCMError {
  return e instanceof PCMError
}
