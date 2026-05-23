/**
 * Validation helpers for Phase 2, Task 2C — Invoice Extraction
 *
 * Provides functions to validate extracted data against business rules
 * and compliance requirements.
 */

import { MRA_RULES, GL_ACCOUNTS, PAYMENT_MODES, INVOICE_TYPES } from './config'

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  info: string[]
}

/**
 * Validate invoice number format and sequencing
 */
export function validateInvoiceNumber(
  number: string | null,
  previousNumber: string | null
): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [], info: [] }

  if (!number) {
    result.errors.push('Invoice number is required (MRA compliance)')
    result.isValid = false
    return result
  }

  // Check if numeric part can be extracted
  const match = number.match(/\d+/)
  if (!match) {
    result.warnings.push(`Invoice number has no numeric component: ${number}`)
  } else {
    result.info.push(`Invoice number ${number} contains numeric ID ${match[0]}`)
  }

  return result
}

/**
 * Validate invoice date
 */
export function validateInvoiceDate(date: string | null): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [], info: [] }

  if (!date) {
    result.errors.push('Invoice date is required (MRA compliance)')
    result.isValid = false
    return result
  }

  const d = new Date(date)
  if (isNaN(d.getTime())) {
    result.errors.push(`Invalid date format: ${date}`)
    result.isValid = false
    return result
  }

  // Check if date is in future (warning)
  if (d > new Date()) {
    result.warnings.push(`Invoice date is in the future: ${date}`)
  }

  result.info.push(`Invoice date: ${date}`)
  return result
}

/**
 * Validate VAT rate
 */
export function validateVATRate(rate: number | null): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [], info: [] }

  if (rate === null || rate === undefined) {
    result.warnings.push('VAT rate not specified (assumed 0% or exempt)')
    return result
  }

  const validRates = MRA_RULES.vatRates.standard + '%, ' +
    MRA_RULES.vatRates.reduced.join('%, ') + '%, exempt'

  if (!MRA_RULES.vatRates.reduced.includes(rate) && rate !== MRA_RULES.vatRates.standard) {
    result.errors.push(
      `Invalid VAT rate: ${rate}%. Valid rates for Mauritius: ${validRates}`
    )
    result.isValid = false
    return result
  }

  result.info.push(`VAT rate: ${rate}%`)
  return result
}

/**
 * Validate VAT amount calculation
 */
export function validateVATAmount(
  amountHT: number | null,
  vat_rate: number | null,
  vat_amount: number | null
): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [], info: [] }

  if (!amountHT || !vat_rate || !vat_amount) {
    result.info.push('Insufficient data to validate VAT amount calculation')
    return result
  }

  const expectedVAT = (amountHT * vat_rate) / 100
  const tolerance = 0.01

  if (Math.abs(expectedVAT - vat_amount) > tolerance) {
    result.errors.push(
      `VAT amount mismatch: expected ${expectedVAT.toFixed(2)}, got ${vat_amount.toFixed(2)}`
    )
    result.isValid = false
    return result
  }

  result.info.push(`VAT calculation correct: ${amountHT} × ${vat_rate}% = ${vat_amount}`)
  return result
}

/**
 * Validate payment status
 */
export function validatePaymentStatus(status: string | null): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [], info: [] }

  const validStatuses = MRA_RULES.validStatuses

  if (!status) {
    result.warnings.push('Payment status not specified')
    return result
  }

  if (!validStatuses.includes(status)) {
    result.errors.push(
      `Invalid status: ${status}. Valid statuses: ${validStatuses.join(', ')}`
    )
    result.isValid = false
    return result
  }

  result.info.push(`Status: ${status}`)
  return result
}

/**
 * Validate GL account number
 */
export function validateGLAccount(accountNumber: string | null): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [], info: [] }

  if (!accountNumber) {
    result.warnings.push('GL account not specified')
    return result
  }

  // Check if account is known (optional)
  if (GL_ACCOUNTS[accountNumber as keyof typeof GL_ACCOUNTS]) {
    const accountName = GL_ACCOUNTS[accountNumber as keyof typeof GL_ACCOUNTS]
    result.info.push(`Account ${accountNumber}: ${accountName}`)
  } else {
    result.warnings.push(`Account ${accountNumber} not in standard chart of accounts`)
  }

  return result
}

/**
 * Validate payment mode
 */
export function validatePaymentMode(mode: string | null): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [], info: [] }

  if (!mode) {
    result.warnings.push('Payment mode not specified')
    return result
  }

  if (!PAYMENT_MODES.includes(mode)) {
    result.errors.push(
      `Invalid payment mode: ${mode}. Valid modes: ${PAYMENT_MODES.join(', ')}`
    )
    result.isValid = false
    return result
  }

  result.info.push(`Payment mode: ${mode}`)
  return result
}

/**
 * Validate invoice type
 */
export function validateInvoiceType(type: string | null): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [], info: [] }

  if (!type) {
    result.errors.push('Invoice type is required')
    result.isValid = false
    return result
  }

  const validTypes = Object.keys(INVOICE_TYPES)
  if (!validTypes.includes(type)) {
    result.errors.push(`Invalid invoice type: ${type}. Valid types: ${validTypes.join(', ')}`)
    result.isValid = false
    return result
  }

  const typeInfo = INVOICE_TYPES[type as keyof typeof INVOICE_TYPES]
  result.info.push(`Type: ${typeInfo.name} (${typeInfo.description})`)
  return result
}

/**
 * Validate GL reconciliation between invoice and GL entries
 */
export function validateGLReconciliation(
  invoiceAmount: number,
  glTotal: number,
  tolerance: number = 0.01
): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [], info: [] }

  const variance = Math.abs(invoiceAmount - glTotal)

  if (variance > tolerance) {
    result.errors.push(
      `GL reconciliation failed: Invoice ${invoiceAmount.toFixed(2)} vs GL ${glTotal.toFixed(2)} (variance: ${variance.toFixed(2)})`
    )
    result.isValid = false
    return result
  }

  if (variance > 0) {
    result.warnings.push(`Rounding difference: ${variance.toFixed(4)} MUR`)
  }

  result.info.push(`GL reconciliation OK: ${invoiceAmount.toFixed(2)} = ${glTotal.toFixed(2)}`)
  return result
}

/**
 * Validate days outstanding for aging analysis
 */
export function validateDaysOutstanding(
  invoiceDate: string | null,
  status: string | null,
  calculatedDays: number | null
): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [], info: [] }

  if (!invoiceDate) {
    result.errors.push('Invoice date required for days outstanding calculation')
    result.isValid = false
    return result
  }

  // Days outstanding should only be calculated for unpaid invoices
  const paidStatuses = ['paye', 'annule']
  if (status && paidStatuses.includes(status)) {
    if (calculatedDays !== null && calculatedDays > 0) {
      result.warnings.push(
        `Paid invoice should have 0 days outstanding, but has ${calculatedDays}`
      )
    }
    return result
  }

  if (calculatedDays === null) {
    result.warnings.push('Days outstanding not calculated for unpaid invoice')
    return result
  }

  // Check for unreasonable values
  if (calculatedDays < 0) {
    result.errors.push(`Days outstanding cannot be negative: ${calculatedDays}`)
    result.isValid = false
    return result
  }

  if (calculatedDays > 3650) { // >10 years
    result.warnings.push(`Invoice is extremely old: ${calculatedDays} days (${(calculatedDays / 365).toFixed(1)} years)`)
  }

  result.info.push(`Days outstanding: ${calculatedDays}`)
  return result
}

/**
 * Validate complete invoice record
 */
export function validateInvoiceRecord(invoice: {
  numero_facture?: string | null
  date_facture?: string | null
  type_facture?: string | null
  tiers?: string | null
  montant_ht?: number | null
  montant_tva?: number | null
  taux_tva?: number | null
  montant_ttc?: number | null
  statut?: string | null
  solde_non_paye?: number | null
}): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [], info: [] }

  // Validate each field
  const numberRes = validateInvoiceNumber(invoice.numero_facture || null, null)
  const dateRes = validateInvoiceDate(invoice.date_facture || null)
  const typeRes = validateInvoiceType(invoice.type_facture || null)
  const statusRes = validatePaymentStatus(invoice.statut || null)
  const vatRes = validateVATRate(invoice.taux_tva || null)

  // Combine results
  result.errors.push(...numberRes.errors, ...dateRes.errors, ...typeRes.errors, ...statusRes.errors, ...vatRes.errors)
  result.warnings.push(...numberRes.warnings, ...dateRes.warnings, ...typeRes.warnings, ...statusRes.warnings, ...vatRes.warnings)
  result.info.push(...numberRes.info, ...dateRes.info, ...typeRes.info, ...statusRes.info, ...vatRes.info)

  // VAT amount check
  if (invoice.montant_ht && invoice.taux_tva && invoice.montant_tva) {
    const vatRes = validateVATAmount(invoice.montant_ht, invoice.taux_tva, invoice.montant_tva)
    result.errors.push(...vatRes.errors)
    result.warnings.push(...vatRes.warnings)
  }

  result.isValid = result.errors.length === 0

  return result
}

/**
 * Generate validation summary
 */
export function summarizeValidation(results: ValidationResult[]): {
  totalRecords: number
  validRecords: number
  errorCount: number
  warningCount: number
  successRate: string
} {
  const totalRecords = results.length
  const validRecords = results.filter(r => r.isValid).length
  const errorCount = results.reduce((sum, r) => sum + r.errors.length, 0)
  const warningCount = results.reduce((sum, r) => sum + r.warnings.length, 0)
  const successRate = ((validRecords / totalRecords) * 100).toFixed(1)

  return {
    totalRecords,
    validRecords,
    errorCount,
    warningCount,
    successRate,
  }
}
