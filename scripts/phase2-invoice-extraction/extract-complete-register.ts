#!/usr/bin/env node
/**
 * PHASE 2, Task 2C — Deliverable 1: Complete Invoice Register (12 months)
 *
 * Extraction et export CSV de TOUS les enregistrements de factures des 12 derniers mois.
 * Colonnes: invoice_number, invoice_date, customer/supplier, amount_ht, amount_ttc, tva_amount, status, payment_date, payment_reference
 * Tri: Par date, puis par type (client/fournisseur)
 *
 * Usage: npx ts-node scripts/phase2-invoice-extraction/extract-complete-register.ts
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

interface InvoiceRow {
  invoice_number: string
  invoice_date: string
  type_facture: string
  tiers: string
  amount_ht: number
  amount_ttc: number
  tva_amount: number
  tva_rate: number
  status: string
  last_payment_date: string | null
  payment_reference: string | null
  days_outstanding: number | null
}

async function extractCompleteRegister() {
  console.log('📋 Extracting complete invoice register (12 months)...')

  // Calculate 12 months ago
  const now = new Date()
  const twelveMonthsAgo = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000)
  const dateFrom = twelveMonthsAgo.toISOString().split('T')[0]

  // Query all factures from past 12 months
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
      montant_ttc,
      montant_tva,
      taux_tva,
      statut,
      created_at,
      updated_at
      `
    )
    .gte('date_facture', dateFrom)
    .order('date_facture', { ascending: true })
    .order('type_facture', { ascending: true })

  if (facError) {
    console.error('Database error:', facError)
    process.exit(1)
  }

  if (!factures || factures.length === 0) {
    console.warn('⚠️  No invoices found in past 12 months')
    return
  }

  console.log(`✓ Found ${factures.length} invoices in past 12 months`)

  // Get payment history for each invoice
  const { data: paiements, error: paiError } = await supabase
    .from('factures_paiements')
    .select('facture_id, date_paiement, reference, montant_mur')

  if (paiError) {
    console.error('Payment query error:', paiError)
    process.exit(1)
  }

  const paiementMap = new Map<string, { date: string; ref: string; montant: number }[]>()
  if (paiements) {
    for (const p of paiements) {
      if (!paiementMap.has(p.facture_id)) {
        paiementMap.set(p.facture_id, [])
      }
      paiementMap.get(p.facture_id)!.push({
        date: p.date_paiement,
        ref: p.reference,
        montant: p.montant_mur,
      })
    }
  }

  // Transform to output format
  const rows: InvoiceRow[] = []

  for (const f of factures) {
    // Get last payment info
    const payments = paiementMap.get(f.id) || []
    const lastPayment = payments.length > 0 ? payments[payments.length - 1] : null
    const paymentRef = lastPayment ? payments.map(p => p.ref).filter(r => r).join(', ') : null

    // Calculate days outstanding
    let daysOutstanding = null
    if (f.statut !== 'paye' && f.statut !== 'annule') {
      const invoiceDate = new Date(f.date_facture)
      daysOutstanding = Math.floor((now.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24))
    }

    rows.push({
      invoice_number: f.numero_facture || '',
      invoice_date: f.date_facture,
      type_facture: f.type_facture,
      tiers: f.tiers || '',
      amount_ht: f.montant_ht || 0,
      amount_ttc: f.montant_ttc || 0,
      tva_amount: f.montant_tva || 0,
      tva_rate: f.taux_tva || 0,
      status: f.statut,
      last_payment_date: lastPayment?.date || null,
      payment_reference: paymentRef,
      days_outstanding: daysOutstanding,
    })
  }

  // Generate CSV
  const headers = [
    'invoice_number',
    'invoice_date',
    'type_facture',
    'tiers',
    'amount_ht',
    'amount_ttc',
    'tva_amount',
    'tva_rate',
    'status',
    'last_payment_date',
    'payment_reference',
    'days_outstanding',
  ]

  const csvLines = [headers.join(',')]

  for (const row of rows) {
    const line = [
      `"${row.invoice_number}"`,
      row.invoice_date,
      row.type_facture,
      `"${row.tiers}"`,
      row.amount_ht.toFixed(2),
      row.amount_ttc.toFixed(2),
      row.tva_amount.toFixed(2),
      row.tva_rate.toFixed(2),
      row.status,
      row.last_payment_date || '',
      `"${row.payment_reference || ''}"`,
      row.days_outstanding !== null ? row.days_outstanding : '',
    ]
    csvLines.push(line.join(','))
  }

  const csv = csvLines.join('\n')

  // Write to exports directory
  const exportsDir = path.join(process.cwd(), 'exports')
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true })
  }

  const filename = 'INVOICE_REGISTER_COMPLETE.csv'
  const filepath = path.join(exportsDir, filename)
  fs.writeFileSync(filepath, csv, 'utf-8')

  console.log(`✓ Complete invoice register exported to: ${filepath}`)
  console.log(`  Total invoices: ${rows.length}`)
  console.log(`  Date range: ${dateFrom} to ${new Date().toISOString().split('T')[0]}`)
  console.log(`  Breakdown:`)
  const byType = rows.reduce((acc, r) => {
    acc[r.type_facture] = (acc[r.type_facture] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  for (const [type, count] of Object.entries(byType)) {
    console.log(`    - ${type}: ${count}`)
  }
  const byStatus = rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  console.log(`  Status breakdown:`)
  for (const [status, count] of Object.entries(byStatus)) {
    console.log(`    - ${status}: ${count}`)
  }
}

extractCompleteRegister().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
