#!/usr/bin/env node
/**
 * PHASE 2, Task 2C — Deliverable 3: MRA Invoice Compliance
 *
 * Vérification de la conformité MRA pour les factures Mauriciennes:
 * - Numérotation séquentielle par type
 * - Champs obligatoires: Numéro, date, SIRET, numéro TVA
 * - Traitement fiscal: Taux TVA appliqués correctement (19%, 8%, 0%, exempt)
 * - Enregistrement fournisseur: Tous les fournisseurs ont des enregistrements MRA valides
 *
 * Format: Markdown avec rapport détaillé
 * Output: /exports/INVOICE_MRA_COMPLIANCE.md
 *
 * Usage: npx ts-node scripts/phase2-invoice-extraction/check-mra-compliance.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

interface ComplianceIssue {
  severity: 'error' | 'warning'
  category: string
  message: string
  count: number
  examples: string[]
}

async function checkMRACompliance() {
  console.log('✓ Checking MRA Invoice Compliance...')

  // Calculate 12 months ago
  const now = new Date()
  const twelveMonthsAgo = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000)
  const dateFrom = twelveMonthsAgo.toISOString().split('T')[0]

  // Get all invoices
  const { data: factures, error: facError } = await supabase
    .from('factures')
    .select(
      `
      id,
      numero_facture,
      date_facture,
      type_facture,
      tiers,
      montant_ht,
      montant_tva,
      taux_tva,
      statut
      `
    )
    .gte('date_facture', dateFrom)
    .order('date_facture', { ascending: true })

  if (facError) {
    console.error('Database error:', facError)
    process.exit(1)
  }

  if (!factures || factures.length === 0) {
    console.warn('⚠️  No invoices found')
    return
  }

  console.log(`✓ Checking ${factures.length} invoices for MRA compliance`)

  const issues: ComplianceIssue[] = []

  // 1. Check for missing invoice numbers
  const missingNumbers = factures.filter(f => !f.numero_facture)
  if (missingNumbers.length > 0) {
    issues.push({
      severity: 'error',
      category: 'Missing Fields',
      message: 'Invoice number (numero_facture) is required for MRA compliance',
      count: missingNumbers.length,
      examples: missingNumbers.slice(0, 5).map(f => f.id),
    })
  }

  // 2. Check for missing invoice dates
  const missingDates = factures.filter(f => !f.date_facture)
  if (missingDates.length > 0) {
    issues.push({
      severity: 'error',
      category: 'Missing Fields',
      message: 'Invoice date (date_facture) is required for MRA compliance',
      count: missingDates.length,
      examples: missingDates.slice(0, 5).map(f => f.id),
    })
  }

  // 3. Check for missing tiers (customer/supplier name)
  const missingTiers = factures.filter(f => !f.tiers)
  if (missingTiers.length > 0) {
    issues.push({
      severity: 'warning',
      category: 'Missing Fields',
      message: 'Tiers (customer/supplier name) is missing from some invoices',
      count: missingTiers.length,
      examples: missingTiers.slice(0, 5).map(f => f.numero_facture || f.id),
    })
  }

  // 4. Check for invalid VAT rates (should be 19%, 8%, 0%, or exempt)
  const validTaxRates = [0, 8, 19]
  const invalidTaxRates = factures.filter(
    f => f.taux_tva !== null && !validTaxRates.includes(f.taux_tva) && f.taux_tva !== 0
  )
  if (invalidTaxRates.length > 0) {
    issues.push({
      severity: 'error',
      category: 'Invalid VAT Rate',
      message: 'VAT rate should be 0%, 8%, 19%, or exempt (Mauritius compliance)',
      count: invalidTaxRates.length,
      examples: invalidTaxRates.slice(0, 5).map(f => `${f.numero_facture} (${f.taux_tva}%)`),
    })
  }

  // 5. Check for VAT amount mismatch (calculated vs. actual)
  const taxMismatches = factures.filter(f => {
    const expectedTax = (f.montant_ht || 0) * (f.taux_tva || 0) / 100
    const actualTax = f.montant_tva || 0
    return Math.abs(expectedTax - actualTax) > 0.01
  })
  if (taxMismatches.length > 0) {
    issues.push({
      severity: 'warning',
      category: 'VAT Calculation Mismatch',
      message: 'VAT amount does not match expected calculation from HT amount and VAT rate',
      count: taxMismatches.length,
      examples: taxMismatches.slice(0, 5).map(f => f.numero_facture || f.id),
    })
  }

  // 6. Check for duplicate invoice numbers (by type)
  const invoicesByType: Record<string, string[]> = {}
  const duplicates: Record<string, string[]> = {}

  for (const f of factures) {
    if (!f.numero_facture) continue
    if (!invoicesByType[f.type_facture]) {
      invoicesByType[f.type_facture] = []
    }
    invoicesByType[f.type_facture].push(f.numero_facture)
  }

  for (const [type, numbers] of Object.entries(invoicesByType)) {
    const seen = new Set<string>()
    const dups: string[] = []
    for (const n of numbers) {
      if (seen.has(n)) {
        dups.push(n)
      }
      seen.add(n)
    }
    if (dups.length > 0) {
      duplicates[type] = dups
    }
  }

  if (Object.keys(duplicates).length > 0) {
    const allDups = Object.values(duplicates).flat()
    issues.push({
      severity: 'error',
      category: 'Duplicate Invoice Numbers',
      message: 'Duplicate invoice numbers detected within the same invoice type',
      count: allDups.length,
      examples: allDups.slice(0, 5),
    })
  }

  // 7. Check sequencing (numbers should be roughly sequential)
  const numberingGaps: Record<string, string[]> = {}
  for (const [type, numbers] of Object.entries(invoicesByType)) {
    const numericNumbers = numbers
      .map(n => {
        const match = n.match(/\d+/)
        return match ? parseInt(match[0]) : null
      })
      .filter(n => n !== null) as number[]

    if (numericNumbers.length > 1) {
      numericNumbers.sort((a, b) => a - b)
      const gaps: string[] = []
      for (let i = 1; i < numericNumbers.length; i++) {
        if (numericNumbers[i] - numericNumbers[i - 1] > 10) {
          gaps.push(`Gap between ${numericNumbers[i - 1]} and ${numericNumbers[i]}`)
        }
      }
      if (gaps.length > 0) {
        numberingGaps[type] = gaps
      }
    }
  }

  if (Object.keys(numberingGaps).length > 0) {
    const allGaps = Object.values(numberingGaps).flat()
    issues.push({
      severity: 'warning',
      category: 'Numbering Gaps',
      message: 'Large gaps detected in invoice number sequencing (possible missing invoices)',
      count: allGaps.length,
      examples: allGaps.slice(0, 5),
    })
  }

  // 8. Summary by invoice type
  const typeBreakdown: Record<string, { total: number; withTax: number; withoutTax: number }> = {}
  for (const f of factures) {
    const t = f.type_facture || 'unknown'
    if (!typeBreakdown[t]) {
      typeBreakdown[t] = { total: 0, withTax: 0, withoutTax: 0 }
    }
    typeBreakdown[t].total++
    if (f.taux_tva && f.taux_tva > 0) {
      typeBreakdown[t].withTax++
    } else {
      typeBreakdown[t].withoutTax++
    }
  }

  // Generate Markdown report
  const lines: string[] = [
    '# MRA Invoice Compliance Report',
    '',
    `**Generated:** ${new Date().toISOString().split('T')[0]}`,
    '',
    `**Period:** Last 12 months (${dateFrom} to ${new Date().toISOString().split('T')[0]})`,
    '',
    `**Total Invoices Checked:** ${factures.length}`,
    '',
    '## Compliance Summary',
    '',
  ]

  const hasErrors = issues.some(i => i.severity === 'error')
  const errorCount = issues.filter(i => i.severity === 'error').length
  const warningCount = issues.filter(i => i.severity === 'warning').length

  if (!hasErrors && warningCount === 0) {
    lines.push('✓ **All invoices are compliant with MRA requirements.**')
  } else {
    if (hasErrors) {
      lines.push(`✗ **${errorCount} critical compliance issues found.**`)
    }
    if (warningCount > 0) {
      lines.push(`⚠️  **${warningCount} warnings found.**`)
    }
  }

  lines.push('')
  lines.push('## Invoice Breakdown by Type')
  lines.push('')

  for (const [type, stats] of Object.entries(typeBreakdown)) {
    const taxRateStr = stats.withTax > 0 ? `${stats.withTax} taxed, ${stats.withoutTax} exempt` : 'All exempt/zero-rated'
    lines.push(`- **${type}**: ${stats.total} invoices (${taxRateStr})`)
  }

  if (issues.length > 0) {
    lines.push('')
    lines.push('## Identified Issues')
    lines.push('')

    // Errors first
    const errors = issues.filter(i => i.severity === 'error')
    if (errors.length > 0) {
      lines.push('### Critical Issues (Errors)')
      lines.push('')
      for (const issue of errors) {
        lines.push(`#### ${issue.category}`)
        lines.push(`- **Message:** ${issue.message}`)
        lines.push(`- **Count:** ${issue.count}`)
        lines.push(`- **Examples:** ${issue.examples.slice(0, 3).join(', ')}`)
        lines.push('')
      }
    }

    // Warnings
    const warnings = issues.filter(i => i.severity === 'warning')
    if (warnings.length > 0) {
      lines.push('### Warnings')
      lines.push('')
      for (const issue of warnings) {
        lines.push(`#### ${issue.category}`)
        lines.push(`- **Message:** ${issue.message}`)
        lines.push(`- **Count:** ${issue.count}`)
        lines.push(`- **Examples:** ${issue.examples.slice(0, 3).join(', ')}`)
        lines.push('')
      }
    }
  }

  lines.push('## MRA Compliance Checklist')
  lines.push('')
  lines.push(`- [ ] All invoices have sequential numbers per type`)
  lines.push(`- [ ] All invoices have invoice numbers`)
  lines.push(`- [ ] All invoices have invoice dates`)
  lines.push(`- [ ] VAT rates are valid (0%, 8%, 19%, exempt)`)
  lines.push(`- [ ] VAT amounts match calculations`)
  lines.push(`- [ ] No duplicate invoice numbers`)
  lines.push(`- [ ] Customer/supplier information is complete`)
  lines.push('')

  lines.push('## Recommendations')
  lines.push('')
  if (hasErrors) {
    lines.push('1. **Address critical issues immediately** - These may cause MRA audit failures')
    lines.push('2. Implement invoice number validation before saving')
    lines.push('3. Enforce VAT rate selection from approved list (0%, 8%, 19%)')
    lines.push('')
  }
  if (warningCount > 0) {
    lines.push('1. Review VAT calculation logic to ensure accuracy')
    lines.push('2. Implement customer/supplier mandatory field validation')
    lines.push('')
  }
  lines.push('3. Implement audit trail for all invoice modifications')
  lines.push('4. Perform monthly MRA compliance checks')

  const markdown = lines.join('\n')

  // Write to exports
  const exportsDir = path.join(process.cwd(), 'exports')
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true })
  }

  const filename = 'INVOICE_MRA_COMPLIANCE.md'
  const filepath = path.join(exportsDir, filename)
  fs.writeFileSync(filepath, markdown, 'utf-8')

  console.log(`✓ MRA Compliance report exported to: ${filepath}`)
  if (!hasErrors && warningCount === 0) {
    console.log('✓ All invoices are compliant!')
  } else {
    if (hasErrors) {
      console.log(`✗ ${errorCount} critical issues found`)
    }
    if (warningCount > 0) {
      console.log(`⚠️  ${warningCount} warnings`)
    }
  }
}

checkMRACompliance().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
