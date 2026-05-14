/**
 * Beneficial Ownership (UBO) helpers — FSC AML Act + FATF.
 */

export type IdType = 'passport' | 'national_id' | 'driver_license'
export type NatureControle = 'shares' | 'voting' | 'board' | 'contract' | 'other'

export const UBO_DECLARATION_THRESHOLD_PCT = 10
export const UBO_CONTROLLING_THRESHOLD_PCT = 25
export const UBO_UPDATE_DEADLINE_DAYS = 30

export function isDeclarationRequired(pctDetention: number): boolean {
  return pctDetention >= UBO_DECLARATION_THRESHOLD_PCT
}

export function controlLevel(pctDetention: number): 'controlling' | 'significant' | 'minor' {
  if (pctDetention >= UBO_CONTROLLING_THRESHOLD_PCT) return 'controlling'
  if (pctDetention >= UBO_DECLARATION_THRESHOLD_PCT)  return 'significant'
  return 'minor'
}

export type UboKycDoc = {
  type: 'passport_copy' | 'utility_bill' | 'bank_reference' | 'pep_declaration' | 'sanctions_check' | 'other'
  file_id: string                // référence vers Storage Supabase
  uploaded_at: string
  expires_at?: string
}

/**
 * Vérifie si un UBO a fourni tous les documents KYC requis.
 * Standard FSC :
 *   - passport_copy
 *   - utility_bill (preuve d'adresse < 3 mois)
 *   - sanctions_check
 */
export function isKycComplete(docs: UboKycDoc[]): boolean {
  const types = new Set(docs.map(d => d.type))
  return types.has('passport_copy') && types.has('utility_bill') && types.has('sanctions_check')
}

/**
 * Détermine si une attestation annuelle est nécessaire (UBO non vérifié
 * depuis > 12 mois).
 */
export function needsAnnualAttestation(lastVerifiedAt: string | null | undefined): boolean {
  if (!lastVerifiedAt) return true
  const last = new Date(lastVerifiedAt).getTime()
  const oneYearMs = 365 * 86_400_000
  return (Date.now() - last) > oneYearMs
}
