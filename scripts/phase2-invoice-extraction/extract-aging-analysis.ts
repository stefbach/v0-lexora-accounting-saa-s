#!/usr/bin/env node
/**
 * PHASE 2, Task 2C — Deliverable 4: Outstanding Invoices Analysis
 *
 * Rapport de vieillissement des créances/dettes:
 * - Factures impayées > 30, 60, 90, 120 jours
 * - Suivi du statut de paiement
 * - Évaluation de la recouvrabilité
 *
 * Format: Excel workbook avec analyses détaillées
 * Output: /exports/AGING_ANALYSIS.xlsx
 *
 * Usage: npx ts-node scripts/phase2-invoice-extraction/extract-aging-analysis.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
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

const FMT_MUR = '#,##0.00;[Red](#,##0.00);"–"'
const FMT_DATE = 'dd/mm/yyyy'

function cell(v: any, fmt?: string): XLSX.CellObject {
  if (v === null || v === undefined || v === '') {
    return { t: 's', v: '' }
  }
  if (typeof v === 'number') {
    return fmt ? { t: 'n', v, z: fmt } : { t: 'n', v }
  }
  if (v instanceof Date) {
    return { t: 'd', v, z: fmt || FMT_DATE }
  }
  return { t: 's', v: String(v) }
}

function header(label: string): XLSX.CellObject {
  return { t: 's', v: label }
}

interface AgingBucket {
  name: string
  min: number
  max: number
  count: number
  amount: number
  invoices: Array<{
    invoiceNumber: string
    date: string
    tiers: string
    amount: number
    daysOutstanding: number
    status: string
  }>
}

async function extractAgingAnalysis() {
  console.log('📅 Extracting Outstanding Invoices Aging Analysis...')

  const now = new Date()

  // Get all outstanding invoices (not paid, not cancelled)
  const { data: outstandingFactures, error: facError } = await supabase
    .from('factures')
    .select(
      `
      id,
      numero_facture,
      date_facture,
      type_facture,
      tiers,
      montant_ttc,
      montant_mur,
      statut,
      solde_non_paye
      `
    )
    .in('statut', ['en_attente', 'partiel', 'retard'])
    .order('date_facture', { ascending: true })

  if (facError) {
    console.error('Database error:', facError)
    process.exit(1)
  }

  if (!outstandingFactures || outstandingFactures.length === 0) {
    console.log('✓ No outstanding invoices found - all invoices are paid or cancelled')
    return
  }

  console.log(`✓ Found ${outstandingFactures.length} outstanding invoices`)

  // Create aging buckets
  const buckets: AgingBucket[] = [
    { name: '0-30 days', min: 0, max: 30, count: 0, amount: 0, invoices: [] },
    { name: '31-60 days', min: 31, max: 60, count: 0, amount: 0, invoices: [] },
    { name: '61-90 days', min: 61, max: 90, count: 0, amount: 0, invoices: [] },
    { name: '91-120 days', min: 91, max: 120, count: 0, amount: 0, invoices: [] },
    { name: '120+ days (OVERDUE)', min: 121, max: 999999, count: 0, amount: 0, invoices: [] },
  ]

  // Categorize invoices
  for (const f of outstandingFactures) {
    const invoiceDate = new Date(f.date_facture)
    const daysOutstanding = Math.floor((now.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24))
    const amountOutstanding = f.solde_non_paye || f.montant_ttc || 0

    for (const bucket of buckets) {
      if (daysOutstanding >= bucket.min && daysOutstanding <= bucket.max) {
        bucket.count++
        bucket.amount += amountOutstanding

        bucket.invoices.push({
          invoiceNumber: f.numero_facture || '',
          date: f.date_facture,
          tiers: f.tiers || '',
          amount: amountOutstanding,
          daysOutstanding: daysOutstanding,
          status: f.statut,
        })
        break
      }
    }
  }

  // Build Excel workbook
  const wb = XLSX.utils.book_new()

  // Sheet 1: Summary Dashboard
  const summaryData: any[][] = [
    [header('Outstanding Invoices - Aging Analysis')],
    [header(`As of: ${now.toISOString().split('T')[0]}`)],
    [],
    [header('Aging Bucket'), header('Count'), header('Total Amount'), header('Average Days Outstanding')],
  ]

  let totalCount = 0
  let totalAmount = 0

  for (const bucket of buckets) {
    const avgDays = bucket.invoices.length > 0
      ? Math.round(
          bucket.invoices.reduce((sum, inv) => sum + inv.daysOutstanding, 0) / bucket.invoices.length
        )
      : 0

    summaryData.push([
      bucket.name,
      bucket.count,
      cell(bucket.amount, FMT_MUR),
      avgDays,
    ])

    totalCount += bucket.count
    totalAmount += bucket.amount
  }

  summaryData.push([])
  summaryData.push([header('TOTAL'), totalCount, cell(totalAmount, FMT_MUR), ''])

  // Add risk assessment
  summaryData.push([])
  summaryData.push([header('Risk Assessment')])

  const overdue120 = buckets.find(b => b.name === '120+ days (OVERDUE)')?.amount || 0
  const overdue60 = buckets
    .filter(b => b.min >= 61)
    .reduce((sum, b) => sum + b.amount, 0)

  const riskLevel = overdue120 / totalAmount > 0.1 ? 'HIGH' : overdue120 > 0 ? 'MEDIUM' : 'LOW'

  summaryData.push([header('Risk Level'), riskLevel])
  summaryData.push([header('Amount > 60 days'), cell(overdue60, FMT_MUR)])
  summaryData.push([header('Amount > 120 days'), cell(overdue120, FMT_MUR)])
  summaryData.push([header('% Overdue (>120d)'), `${((overdue120 / totalAmount) * 100).toFixed(1)}%`])

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
  summaryWs['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 18 }, { wch: 22 }]
  summaryWs['!freeze'] = { ySplit: 4 }
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

  // Sheet 2+: Detail for each bucket
  for (const bucket of buckets) {
    if (bucket.invoices.length === 0) continue

    const bucketData: any[][] = [
      [header(`${bucket.name} (${bucket.count} invoices)`)],
      [header(`Total Amount: `), cell(bucket.amount, FMT_MUR)],
      [],
      [
        header('Invoice #'),
        header('Date'),
        header('Days Outstanding'),
        header('Customer/Supplier'),
        header('Amount Outstanding'),
        header('Status'),
      ],
    ]

    // Sort by days outstanding (descending)
    const sorted = [...bucket.invoices].sort((a, b) => b.daysOutstanding - a.daysOutstanding)

    for (const inv of sorted) {
      bucketData.push([
        inv.invoiceNumber,
        inv.date,
        inv.daysOutstanding,
        `"${inv.tiers}"`,
        cell(inv.amount, FMT_MUR),
        inv.status === 'retard' ? 'OVERDUE' : inv.status === 'partiel' ? 'PARTIAL' : 'PENDING',
      ])
    }

    const ws = XLSX.utils.aoa_to_sheet(bucketData)
    ws['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 30 }, { wch: 18 }, { wch: 12 }]
    ws['!freeze'] = { ySplit: 4 }

    const sheetName = bucket.name.slice(0, 31).replace(/[/\\?*[\]]/g, '_')
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  // Sheet 3: By Type (Client vs Fournisseur)
  const typeData: any[][] = [
    [header('Outstanding Invoices by Type')],
    [],
    [header('Type'), header('Count'), header('Total Amount'), header('Avg Days Outstanding')],
  ]

  const byType: Record<string, { count: number; amount: number; days: number[] }> = {}

  for (const f of outstandingFactures) {
    const type = f.type_facture || 'unknown'
    if (!byType[type]) {
      byType[type] = { count: 0, amount: 0, days: [] }
    }
    const invoiceDate = new Date(f.date_facture)
    const days = Math.floor((now.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24))
    byType[type].count++
    byType[type].amount += f.solde_non_paye || f.montant_ttc || 0
    byType[type].days.push(days)
  }

  for (const [type, stats] of Object.entries(byType)) {
    const avgDays = Math.round(stats.days.reduce((a, b) => a + b, 0) / stats.days.length)
    typeData.push([
      type,
      stats.count,
      cell(stats.amount, FMT_MUR),
      avgDays,
    ])
  }

  const typeWs = XLSX.utils.aoa_to_sheet(typeData)
  typeWs['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 22 }]
  typeWs['!freeze'] = { ySplit: 3 }
  XLSX.utils.book_append_sheet(wb, typeWs, 'By Type')

  // Sheet 4: Collection Strategy
  const strategyData: any[][] = [
    [header('Collection Strategy & Recommendations')],
    [],
    [header('Age Range'), header('Recommended Action'), header('Current Amount'), header('Count')],
    [header('0-30 days'), header('Standard reminder'), cell(buckets[0].amount, FMT_MUR), buckets[0].count],
    [header('31-60 days'), header('Follow-up phone call'), cell(buckets[1].amount, FMT_MUR), buckets[1].count],
    [header('61-90 days'), header('Formal payment demand'), cell(buckets[2].amount, FMT_MUR), buckets[2].count],
    [header('91-120 days'), header('Legal notice'), cell(buckets[3].amount, FMT_MUR), buckets[3].count],
    [header('120+ days'), header('Escalation/Legal action'), cell(buckets[4].amount, FMT_MUR), buckets[4].count],
  ]

  const strategyWs = XLSX.utils.aoa_to_sheet(strategyData)
  strategyWs['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 18 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, strategyWs, 'Strategy')

  // Write file
  const exportsDir = path.join(process.cwd(), 'exports')
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true })
  }

  const filename = 'AGING_ANALYSIS.xlsx'
  const filepath = path.join(exportsDir, filename)

  XLSX.writeFile(wb, filepath)

  console.log(`✓ Aging analysis exported to: ${filepath}`)
  console.log(`  Total outstanding: ${totalCount} invoices / ${totalAmount.toFixed(2)} MUR`)
  console.log(`  Overdue (>120 days): ${buckets[4].count} invoices / ${buckets[4].amount.toFixed(2)} MUR`)
  console.log(`  Risk Level: ${riskLevel}`)
}

extractAgingAnalysis().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
