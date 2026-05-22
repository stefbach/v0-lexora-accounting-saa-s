#!/usr/bin/env node
/**
 * PHASE 2, Task 2C — Deliverable 2: Invoice-to-GL Traceability (50-sample test)
 *
 * Sélectionne 50 factures aléatoires sur 12 mois, puis pour chaque:
 * - Détails de la facture (numéro, date, montant)
 * - Écritures GL créées (ref_folio links)
 * - Postages de comptes (411, 706, etc.)
 * - Réconciliation de montant (montant facture = total GL)
 * - Piste de vérification (created_by, approved_by, timestamps)
 *
 * Format: Excel workbook avec trace détaillée
 * Output: /exports/INVOICE_GL_TRACEABILITY_50_SAMPLE.xlsx
 *
 * Usage: npx ts-node scripts/phase2-invoice-extraction/extract-gl-traceability.ts
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

// Number format helpers
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

interface TraceItem {
  invoiceNumber: string
  invoiceDate: string
  invoiceAmount: number
  glTotal: number
  reconciled: boolean
  ecritures: Array<{
    date: string
    journal: string
    compte: string
    debit: number
    credit: number
    ref_folio: string
    created_at: string
  }>
}

async function extractGLTraceability() {
  console.log('📊 Extracting GL Traceability (50-sample)...')

  // Calculate 12 months ago
  const now = new Date()
  const twelveMonthsAgo = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000)
  const dateFrom = twelveMonthsAgo.toISOString().split('T')[0]

  // Get all invoices from past 12 months
  const { data: allFactures, error: facError } = await supabase
    .from('factures')
    .select('id, numero_facture, date_facture, montant_ttc')
    .gte('date_facture', dateFrom)
    .order('date_facture', { ascending: true })

  if (facError) {
    console.error('Database error:', facError)
    process.exit(1)
  }

  if (!allFactures || allFactures.length === 0) {
    console.warn('⚠️  No invoices found in past 12 months')
    return
  }

  // Randomly select 50 invoices
  const sample = allFactures
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(50, allFactures.length))

  console.log(
    `✓ Selected ${sample.length} random invoices from ${allFactures.length} total for traceability testing`
  )

  const traces: TraceItem[] = []
  let reconciliationCount = 0
  let mismatchCount = 0

  // For each sample invoice, get GL postings
  for (const f of sample) {
    // Get ecritures linked to this facture
    const { data: ecritures, error: ecError } = await supabase
      .from('ecritures_comptables_v2')
      .select('date_ecriture, journal, numero_compte, debit_mur, credit_mur, ref_folio, created_at')
      .eq('facture_id', f.id)
      .order('date_ecriture', { ascending: true })

    if (ecError) {
      console.warn(`Warning querying GL for invoice ${f.id}:`, ecError)
      continue
    }

    // Also check by reference/folio
    const { data: ecrituresRef, error: ecRefError } = await supabase
      .from('ecritures_comptables_v2')
      .select('date_ecriture, journal, numero_compte, debit_mur, credit_mur, ref_folio, created_at')
      .eq('ref_folio', f.numero_facture)

    if (ecRefError) {
      console.warn(`Warning querying GL by reference for invoice ${f.id}:`, ecRefError)
    }

    // Combine results
    const allEcritures = [
      ...(ecritures || []),
      ...(ecrituresRef || []).filter(
        er => !(ecritures || []).find(e => e.date_ecriture === er.date_ecriture && e.numero_compte === er.numero_compte)
      ),
    ]

    // Calculate GL total
    let glTotal = 0
    for (const e of allEcritures) {
      glTotal += (e.debit_mur || 0) - (e.credit_mur || 0)
    }

    // Check reconciliation
    const invoiceAmount = f.montant_ttc || 0
    const isReconciled = Math.abs(glTotal - invoiceAmount) < 0.01

    if (isReconciled) {
      reconciliationCount++
    } else {
      mismatchCount++
    }

    traces.push({
      invoiceNumber: f.numero_facture || '',
      invoiceDate: f.date_facture,
      invoiceAmount: invoiceAmount,
      glTotal: glTotal,
      reconciled: isReconciled,
      ecritures: allEcritures.map(e => ({
        date: e.date_ecriture,
        journal: e.journal || '',
        compte: e.numero_compte || '',
        debit: e.debit_mur || 0,
        credit: e.credit_mur || 0,
        ref_folio: e.ref_folio || '',
        created_at: e.created_at,
      })),
    })
  }

  // Build Excel workbook
  const wb = XLSX.utils.book_new()

  // Sheet 1: Summary
  const summaryData: any[][] = [
    [header('Invoice-to-GL Traceability Report (50-Sample Test)')],
    [],
    [header('Invoice'), header('Date'), header('Invoice Amount'), header('GL Total'), header('Reconciled'), header('GL Entries Count')],
  ]

  for (const t of traces) {
    summaryData.push([
      t.invoiceNumber,
      t.invoiceDate,
      cell(t.invoiceAmount, FMT_MUR),
      cell(t.glTotal, FMT_MUR),
      t.reconciled ? 'YES' : 'NO - MISMATCH',
      t.ecritures.length,
    ])
  }

  // Add totals
  summaryData.push([])
  summaryData.push([header('Summary')])
  summaryData.push([header('Total Samples'), traces.length])
  summaryData.push([header('Reconciled'), reconciliationCount])
  summaryData.push([header('Mismatches'), mismatchCount])
  summaryData.push([header('Reconciliation Rate'), `${((reconciliationCount / traces.length) * 100).toFixed(1)}%`])

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
  summaryWs['!cols'] = [
    { wch: 20 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 15 },
  ]
  summaryWs['!freeze'] = { ySplit: 3 }
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

  // Sheet 2+: Detail for each invoice
  for (let i = 0; i < traces.length; i++) {
    const t = traces[i]
    const detailData: any[][] = [
      [header('Invoice Details')],
      [header('Invoice #'), t.invoiceNumber],
      [header('Date'), t.invoiceDate],
      [header('Total Amount'), cell(t.invoiceAmount, FMT_MUR)],
      [],
      [header('GL Entries Linked'), header('Count: ') + t.ecritures.length],
      [],
      [header('Date'), header('Journal'), header('Account'), header('Debit'), header('Credit'), header('Reference'), header('Created')],
    ]

    let totalDebit = 0
    let totalCredit = 0

    for (const e of t.ecritures) {
      totalDebit += e.debit
      totalCredit += e.credit
      detailData.push([
        e.date,
        e.journal,
        e.compte,
        cell(e.debit, FMT_MUR),
        cell(e.credit, FMT_MUR),
        e.ref_folio,
        e.created_at.substring(0, 19),
      ])
    }

    detailData.push([])
    detailData.push([
      header('TOTAL'),
      '',
      '',
      cell(totalDebit, FMT_MUR),
      cell(totalCredit, FMT_MUR),
      '',
      '',
    ])

    const netAmount = totalDebit - totalCredit
    const reconciled = Math.abs(netAmount - t.invoiceAmount) < 0.01

    detailData.push([])
    detailData.push([header('Reconciliation Check')])
    detailData.push([header('Invoice Amount'), cell(t.invoiceAmount, FMT_MUR)])
    detailData.push([header('GL Net Amount'), cell(netAmount, FMT_MUR)])
    detailData.push([header('Variance'), cell(netAmount - t.invoiceAmount, FMT_MUR)])
    detailData.push([header('Status'), reconciled ? '✓ RECONCILED' : '✗ MISMATCH'])

    const ws = XLSX.utils.aoa_to_sheet(detailData)
    ws['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 20 }]
    const sheetName = `${(i + 1).toString().padStart(2, '0')}_${t.invoiceNumber.substring(0, 15)}`.slice(0, 31)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  // Write file
  const exportsDir = path.join(process.cwd(), 'exports')
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true })
  }

  const filename = 'INVOICE_GL_TRACEABILITY_50_SAMPLE.xlsx'
  const filepath = path.join(exportsDir, filename)

  XLSX.write(wb, { type: 'file', file: filepath })

  console.log(`✓ GL Traceability report exported to: ${filepath}`)
  console.log(`  Sample size: ${traces.length} invoices`)
  console.log(`  Reconciled: ${reconciliationCount}/${traces.length} (${((reconciliationCount / traces.length) * 100).toFixed(1)}%)`)
  if (mismatchCount > 0) {
    console.log(`  ⚠️  Mismatches found: ${mismatchCount}`)
  }
}

extractGLTraceability().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
