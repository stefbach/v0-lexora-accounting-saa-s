import { z } from 'zod'

// Account number validation (SYSCOHADA format: 1-9 prefix, 2-6 digits)
const accountNumberSchema = z.string().regex(/^[1-9]\d{1,5}$/, {
  message: 'Numéro de compte invalide. Doit être 2-6 chiffres commençant par 1-9.',
})

// Journal code validation
const journalCodeSchema = z.enum(['VTE', 'ACH', 'BNQ', 'SAL', 'OD', 'AN'], {
  message: 'Code journal invalide. Utilisez VTE, ACH, BNQ, SAL, OD, ou AN.',
})

// Journal line schema
export const journalLineSchema = z.object({
  accountNumber: accountNumberSchema,
  debit: z.number().nonnegative('Le débit doit être positif ou zéro'),
  credit: z.number().nonnegative('Le crédit doit être positif ou zéro'),
  description: z.string().optional(),
  auxiliaryAccount: z.string().optional(),
  analyticalCode: z.string().optional(),  // Class 9
  taxCode: z.string().optional(),
  reconciliationCode: z.string().optional(),
}).refine(
  (line) => line.debit === 0 || line.credit === 0,
  { message: 'Une ligne ne peut être à la fois débit et crédit' }
).refine(
  (line) => line.debit > 0 || line.credit > 0,
  { message: 'Une ligne doit avoir un débit OU un crédit > 0' }
)

// Journal entry schema
export const journalEntrySchema = z.object({
  date: z.coerce.date(),
  reference: z.string().min(1, 'Référence requise').max(50),
  description: z.string().min(1, 'Description requise').max(255),
  journalCode: journalCodeSchema,
  jurisdictionCode: z.enum(['MU', 'SN', 'CI', 'ML', 'BF', 'NE', 'BJ', 'TG', 'GW', 'CM', 'GA', 'CG', 'TD', 'CF', 'GQ', 'KM', 'CD', 'GN']),
  societeId: z.string().uuid(),
  lines: z.array(journalLineSchema).min(2, 'Une écriture doit avoir au moins 2 lignes'),
  status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'POSTED', 'REVERSED']).default('DRAFT'),
}).refine(
  (entry) => {
    const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0)
    const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0)
    return Math.abs(totalDebit - totalCredit) < 0.01
  },
  { message: 'Écriture non équilibrée: total débit ≠ total crédit (R1)' }
)

// Export types
export type JournalLineInput = z.input<typeof journalLineSchema>
export type JournalEntryInput = z.input<typeof journalEntrySchema>

// Validation helpers
export function validateJournalEntry(entry: unknown) {
  return journalEntrySchema.safeParse(entry)
}

export function parseJournalEntry(entry: unknown) {
  return journalEntrySchema.parse(entry)
}
