/**
 * Seuils par défaut pour validation des factures.
 *
 * Ces valeurs peuvent être surchargées en passant options à validateMontantRaisonnable.
 * Pour une configuration par société, utiliser plutôt `societes.params_validation` (JSONB)
 * à implémenter dans une migration future (~Wave 3 ou 4).
 */

export interface ValidationIssue {
  field: string
  severity: 'error' | 'warning' | 'info'
  message: string
  suggested_value?: unknown
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
  confidence_penalty: number
}

const BANK_NAMES_BLACKLIST: readonly string[] = [
  'mcb', 'mauritius commercial bank', 'sbm', 'state bank of mauritius',
  'absa', 'barclays', 'hsbc', 'maubank', 'bank', 'banque', 'banking',
  'bmo', 'bnp', 'afrasia', 'abc banking', 'warwyck', 'standard chartered',
  'bank of valletta', 'bov',
  'jpmorgan', 'citibank', 'deutsche bank', 'credit suisse', 'ubs',
  'natwest', 'lloyds', 'rbs', 'santander',
  'stripe', 'paypal', 'wise', 'revolut', 'transferwise',
  'visa', 'mastercard', 'amex', 'american express',
  'western union', 'moneygram', 'apple pay', 'meta pay',
]

function isBlacklistedName(name: string): boolean {
  if (!name) return false
  const lower = name.toLowerCase().trim()
  if (!lower || lower.length < 2) return false
  return BANK_NAMES_BLACKLIST.some((b) => lower.includes(b))
}

function toNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^\d.,-]/g, '').replace(/,/g, '.')
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function toStringSafe(val: unknown): string {
  if (typeof val === 'string') return val
  if (val == null) return ''
  return String(val)
}

export function validateIBAN(iban: string): boolean {
  if (!iban) return false
  const cleaned = iban.replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(cleaned)) return false
  if (cleaned.length < 15 || cleaned.length > 34) return false
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4)
  let expanded = ''
  for (const ch of rearranged) {
    if (ch >= '0' && ch <= '9') {
      expanded += ch
    } else {
      expanded += (ch.charCodeAt(0) - 55).toString()
    }
  }
  let remainder = 0
  for (const digit of expanded) {
    remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

export function validateBRN(brn: string): boolean {
  if (!brn) return false
  const cleaned = brn.replace(/\s+/g, '').toUpperCase()
  if (/^\d{7,8}$/.test(cleaned)) return true
  if (/^C\d{7,9}$/.test(cleaned)) return true
  if (/^[A-Z]\d{7,9}$/.test(cleaned)) return true
  return false
}

export function validateTVAConsistency(
  ht: number,
  tva: number,
  ttc: number,
  taux?: number
): { ok: boolean; ecart: number } {
  if (!Number.isFinite(ht) || !Number.isFinite(tva) || !Number.isFinite(ttc)) {
    return { ok: false, ecart: Number.POSITIVE_INFINITY }
  }
  const expected = ht + tva
  const ecart = Math.abs(expected - ttc)
  const tolerance = Math.max(1, Math.abs(ttc) * 0.005)
  let ok = ecart <= tolerance

  if (ok && typeof taux === 'number' && Number.isFinite(taux) && ht > 0) {
    const expectedTva = ht * (taux / 100)
    const tvaEcart = Math.abs(expectedTva - tva)
    const tvaTol = Math.max(1, Math.abs(expectedTva) * 0.02)
    if (tvaEcart > tvaTol) ok = false
  }

  return { ok, ecart }
}

export function validateDatePlausible(dateStr: string): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return false
  const now = new Date()
  if (d.getTime() > now.getTime() + 24 * 60 * 60 * 1000) return false
  const threeYearsAgo = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate())
  if (d.getTime() < threeYearsAgo.getTime()) return false
  return true
}

export function validateMontantRaisonnable(
  montant: number,
  devise?: string,
  options?: { maxMur?: number; maxOther?: number }
): boolean {
  if (!Number.isFinite(montant)) return false
  if (montant <= 0) return false
  const maxMur = options?.maxMur ?? 10_000_000
  const maxOther = options?.maxOther ?? 500_000
  const max = devise && devise.toUpperCase() !== 'MUR' ? maxOther : maxMur
  return montant < max
}

export function validateFactureExtraction(
  extraction: Record<string, unknown>
): ValidationResult {
  const issues: ValidationIssue[] = []
  let penalty = 0

  const ht = toNumber(extraction.montant_ht)
  const tva = toNumber(extraction.montant_tva)
  const ttc = toNumber(extraction.montant_ttc)
  const taux = toNumber(extraction.taux_tva)
  const devise = toStringSafe(extraction.devise) || 'MUR'

  if (ttc == null || ttc <= 0) {
    issues.push({
      field: 'montant_ttc',
      severity: 'error',
      message: 'montant_ttc absent ou invalide',
    })
    penalty += 25
  } else {
    if (!validateMontantRaisonnable(ttc, devise)) {
      issues.push({
        field: 'montant_ttc',
        severity: 'error',
        message: `montant_ttc hors fourchette raisonnable (${ttc} ${devise})`,
      })
      penalty += 20
    } else if (devise.toUpperCase() === 'MUR' && ttc > 5_000_000) {
      issues.push({
        field: 'montant_ttc',
        severity: 'warning',
        message: `montant_ttc inhabituel (${ttc} ${devise}) — vérifier`,
      })
      penalty += 5
    }
  }

  if (ht != null && tva != null && ttc != null) {
    const check = validateTVAConsistency(ht, tva, ttc, taux ?? undefined)
    if (!check.ok) {
      issues.push({
        field: 'montant_ttc',
        severity: 'error',
        message: `HT+TVA != TTC (écart ${check.ecart.toFixed(2)})`,
        suggested_value: ht + tva,
      })
      penalty += 15
    }
  }

  if (taux != null && taux !== 0 && taux !== 15) {
    issues.push({
      field: 'taux_tva',
      severity: 'warning',
      message: `Taux TVA inhabituel à Maurice (${taux}%) — attendu 0 ou 15`,
    })
    penalty += 5
  }

  const dateFacture = toStringSafe(extraction.date_facture || extraction.date_document)
  if (!dateFacture) {
    issues.push({
      field: 'date_facture',
      severity: 'error',
      message: 'date_facture absente',
    })
    penalty += 10
  } else if (!validateDatePlausible(dateFacture)) {
    issues.push({
      field: 'date_facture',
      severity: 'error',
      message: `date_facture implausible (${dateFacture})`,
    })
    penalty += 15
  }

  const tiers = toStringSafe(
    extraction.fournisseur || extraction.client || extraction.emetteur || extraction.tiers
  )
  if (!tiers) {
    issues.push({
      field: 'fournisseur',
      severity: 'error',
      message: 'fournisseur/client absent',
    })
    penalty += 15
  } else if (isBlacklistedName(tiers)) {
    issues.push({
      field: 'fournisseur',
      severity: 'error',
      message: `Nom tiers dans blacklist (probablement une banque/processeur): ${tiers}`,
    })
    penalty += 20
  }

  const iban = toStringSafe(extraction.iban)
  if (iban && !validateIBAN(iban)) {
    issues.push({
      field: 'iban',
      severity: 'warning',
      message: `IBAN invalide (checksum mod-97 échoue): ${iban}`,
    })
    penalty += 5
  }

  const brn = toStringSafe(extraction.brn)
  if (brn && !validateBRN(brn)) {
    issues.push({
      field: 'brn',
      severity: 'warning',
      message: `Format BRN invalide: ${brn}`,
    })
    penalty += 5
  }

  const numero = toStringSafe(extraction.numero_facture || extraction.numero_reference)
  if (!numero) {
    issues.push({
      field: 'numero_facture',
      severity: 'warning',
      message: 'numero_facture absent',
    })
    penalty += 5
  }

  const hasError = issues.some((i) => i.severity === 'error')
  return {
    valid: !hasError,
    issues,
    confidence_penalty: Math.min(100, penalty),
  }
}

export function validateReleveBancaireExtraction(
  extraction: Record<string, unknown>
): ValidationResult {
  const issues: ValidationIssue[] = []
  let penalty = 0

  const numeroCompte = toStringSafe(extraction.numero_compte || extraction.iban)
  if (!numeroCompte) {
    issues.push({
      field: 'numero_compte',
      severity: 'error',
      message: 'numero_compte/iban absent',
    })
    penalty += 20
  } else if (
    toStringSafe(extraction.iban) &&
    !validateIBAN(toStringSafe(extraction.iban))
  ) {
    issues.push({
      field: 'iban',
      severity: 'warning',
      message: `IBAN invalide: ${extraction.iban}`,
    })
    penalty += 5
  }

  const soldeOuv = toNumber(extraction.solde_ouverture ?? extraction.solde_debut)
  const soldeClot = toNumber(extraction.solde_cloture ?? extraction.solde_fin)

  if (soldeOuv == null) {
    issues.push({
      field: 'solde_ouverture',
      severity: 'warning',
      message: 'solde_ouverture absent',
    })
    penalty += 10
  }
  if (soldeClot == null) {
    issues.push({
      field: 'solde_cloture',
      severity: 'warning',
      message: 'solde_cloture absent',
    })
    penalty += 10
  }

  const lignesRaw = extraction.lignes ?? extraction.transactions
  const lignes: Array<Record<string, unknown>> = Array.isArray(lignesRaw)
    ? (lignesRaw.filter((l) => typeof l === 'object' && l !== null) as Array<
        Record<string, unknown>
      >)
    : []

  if (lignes.length === 0) {
    issues.push({
      field: 'lignes',
      severity: 'warning',
      message: 'Aucune transaction détectée',
    })
    penalty += 10
  }

  if (soldeOuv != null && soldeClot != null && lignes.length > 0) {
    let totalCredit = 0
    let totalDebit = 0
    for (const l of lignes) {
      const montant = toNumber(l.montant) ?? 0
      const sens = toStringSafe(l.sens).toLowerCase()
      if (sens === 'credit') totalCredit += montant
      else if (sens === 'debit') totalDebit += montant
      else if (montant > 0) totalCredit += montant
      else totalDebit += Math.abs(montant)
    }
    const expected = soldeOuv + totalCredit - totalDebit
    const ecart = Math.abs(expected - soldeClot)
    const tolerance = Math.max(1, Math.abs(soldeClot) * 0.001)
    if (ecart > tolerance) {
      issues.push({
        field: 'solde_cloture',
        severity: 'error',
        message: `Solde incohérent: ouverture+crédits-débits=${expected.toFixed(2)} != clôture=${soldeClot.toFixed(2)} (écart ${ecart.toFixed(2)})`,
        suggested_value: expected,
      })
      penalty += 15
    }
  }

  const periodeDebut = toStringSafe(extraction.periode_debut)
  const periodeFin = toStringSafe(extraction.periode_fin)
  if (!periodeDebut || !periodeFin) {
    issues.push({
      field: 'periode',
      severity: 'warning',
      message: 'periode_debut/periode_fin absente',
    })
    penalty += 5
  } else {
    const dDebut = new Date(periodeDebut)
    const dFin = new Date(periodeFin)
    if (!Number.isNaN(dDebut.getTime()) && !Number.isNaN(dFin.getTime())) {
      let outOfRange = 0
      for (const l of lignes) {
        const dateStr = toStringSafe(l.date)
        if (!dateStr) continue
        const d = new Date(dateStr)
        if (Number.isNaN(d.getTime())) continue
        if (d.getTime() < dDebut.getTime() - 24 * 3600 * 1000 ||
            d.getTime() > dFin.getTime() + 24 * 3600 * 1000) {
          outOfRange += 1
        }
      }
      if (outOfRange > 0) {
        issues.push({
          field: 'lignes.date',
          severity: 'warning',
          message: `${outOfRange} transaction(s) hors période ${periodeDebut}..${periodeFin}`,
        })
        penalty += Math.min(10, outOfRange * 2)
      }
    }
  }

  const titulaire = toStringSafe(extraction.nom_societe || extraction.titulaire)
  if (titulaire && isBlacklistedName(titulaire)) {
    issues.push({
      field: 'titulaire',
      severity: 'error',
      message: `Titulaire = nom de banque (${titulaire}) — erreur d'extraction`,
    })
    penalty += 20
  }

  const hasError = issues.some((i) => i.severity === 'error')
  return {
    valid: !hasError,
    issues,
    confidence_penalty: Math.min(100, penalty),
  }
}
