#!/usr/bin/env node

/**
 * PHASE 2, Task 2A - Finance Extraction Agent
 *
 * Mission: Extract and verify 12 months of complete financial data ready for Big 4 auditors.
 *
 * Deliverables:
 * 1. General Ledger Export (GL_12MONTHS_COMPLETE.csv)
 * 2. Monthly Trial Balance (TRIAL_BALANCE_12MONTHS.csv)
 * 3. Monthly Summary Reports (MONTHLY_SUMMARIES.xlsx)
 * 4. Data Quality Report (DATA_QUALITY_AUDIT.md)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const EXPORTS_DIR = path.join(process.cwd(), 'exports');

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface GeneralLedgerRow {
  date: string;
  account: string;
  debit: number;
  credit: number;
  description: string;
  journal: string;
  ref_folio: string;
  created_by: string;
  approved_by: string;
  created_at: string;
  fiscal_year: string;
  societe_name: string;
  account_name: string;
}

interface TrialBalanceRow {
  month_end_date: string;
  account_number: string;
  account_name: string;
  debit_balance: number;
  credit_balance: number;
  balance: number;
}

interface DataQualityResult {
  check_type: string;
  metric: string;
  value: string;
}

interface MonthlyBalance {
  month: string;
  debits: number;
  credits: number;
  variance: number;
}

interface SuspiciousEntry {
  id: string;
  date_ecriture: string;
  numero_compte: string;
  journal: string;
  amount: number;
  issue_type: string;
}

// Ensure exports directory exists
function ensureExportsDir() {
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
    console.log(`Created exports directory: ${EXPORTS_DIR}`);
  }
}

// Convert array of objects to CSV
function toCsv(data: any[], headers: string[]): string {
  const csvRows: string[] = [];

  // Add header row
  csvRows.push(headers.map(h => `"${h}"`).join(','));

  // Add data rows
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '""';
      if (typeof value === 'number') return value.toString();
      // Escape quotes in strings
      const strValue = value.toString().replace(/"/g, '""');
      return `"${strValue}"`;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

// Export 1: General Ledger (12 months)
async function exportGeneralLedger() {
  console.log('\n[1/4] Exporting General Ledger (12 months)...');

  const { data, error } = await supabase
    .rpc('get_general_ledger_12months');

  if (error) {
    console.error('Error fetching general ledger:', error);
    return null;
  }

  const rows = data as GeneralLedgerRow[];
  console.log(`  ✓ Retrieved ${rows.length} ledger entries`);

  // Validate: Sum(debit) = Sum(credit)
  const totalDebits = rows.reduce((sum, r) => sum + (r.debit || 0), 0);
  const totalCredits = rows.reduce((sum, r) => sum + (r.credit || 0), 0);
  const variance = Math.abs(totalDebits - totalCredits);

  console.log(`  ✓ Total Debits: ${totalDebits.toFixed(2)} MUR`);
  console.log(`  ✓ Total Credits: ${totalCredits.toFixed(2)} MUR`);
  console.log(`  ✓ Variance: ${variance.toFixed(2)} MUR`);

  if (variance > 0.01) {
    console.warn(`  ⚠ WARNING: GL does not balance! Variance: ${variance.toFixed(2)}`);
  }

  // Generate CSV
  const headers = [
    'date', 'account', 'debit', 'credit', 'description',
    'journal', 'ref_folio', 'created_by', 'approved_by',
    'created_at', 'fiscal_year', 'societe_name', 'account_name'
  ];

  const csv = toCsv(rows, headers);
  const outputPath = path.join(EXPORTS_DIR, 'GL_12MONTHS_COMPLETE.csv');
  fs.writeFileSync(outputPath, csv, 'utf-8');

  console.log(`  ✓ Exported to: ${outputPath}`);
  return outputPath;
}

// Export 2: Monthly Trial Balance (12 months)
async function exportTrialBalance() {
  console.log('\n[2/4] Exporting Monthly Trial Balance (12 months)...');

  const { data, error } = await supabase
    .rpc('get_monthly_trial_balance');

  if (error) {
    console.error('Error fetching trial balance:', error);
    return null;
  }

  const rows = data as TrialBalanceRow[];
  console.log(`  ✓ Retrieved ${rows.length} trial balance entries`);

  // Validate: Each month should balance
  const monthlyBalances = new Map<string, { debits: number; credits: number }>();

  for (const row of rows) {
    const key = row.month_end_date;
    if (!monthlyBalances.has(key)) {
      monthlyBalances.set(key, { debits: 0, credits: 0 });
    }
    const mb = monthlyBalances.get(key)!;
    mb.debits += row.debit_balance || 0;
    mb.credits += row.credit_balance || 0;
  }

  console.log('  Monthly Balance Validation:');
  let unbalancedMonths = 0;
  for (const [month, totals] of monthlyBalances.entries()) {
    const variance = Math.abs(totals.debits - totals.credits);
    if (variance > 0.01) {
      console.warn(`    ⚠ ${month}: Variance ${variance.toFixed(2)}`);
      unbalancedMonths++;
    } else {
      console.log(`    ✓ ${month}: Balanced`);
    }
  }

  if (unbalancedMonths > 0) {
    console.warn(`  ⚠ WARNING: ${unbalancedMonths} month(s) do not balance`);
  }

  // Generate CSV
  const headers = [
    'month_end_date', 'account_number', 'account_name',
    'debit_balance', 'credit_balance', 'balance'
  ];

  const csv = toCsv(rows, headers);
  const outputPath = path.join(EXPORTS_DIR, 'TRIAL_BALANCE_12MONTHS.csv');
  fs.writeFileSync(outputPath, csv, 'utf-8');

  console.log(`  ✓ Exported to: ${outputPath}`);
  return outputPath;
}

// Export 3: Monthly Summary Reports (placeholder - will need Excel library)
async function exportMonthlySummaries() {
  console.log('\n[3/4] Exporting Monthly Summary Reports...');

  const { data, error } = await supabase
    .rpc('get_monthly_summary_reports');

  if (error) {
    console.error('Error fetching monthly summaries:', error);
    return null;
  }

  const rows = data as any[];
  console.log(`  ✓ Retrieved ${rows.length} summary rows`);

  // For now, export as CSV with all months combined
  // In production, use a library like `exceljs` to create proper workbook
  const headers = [
    'month_label', 'category', 'numero_compte', 'nom_compte',
    'total_amount', 'contra_amount', 'net_amount'
  ];

  const csv = toCsv(rows, headers);
  const outputPath = path.join(EXPORTS_DIR, 'MONTHLY_SUMMARIES.csv');
  fs.writeFileSync(outputPath, csv, 'utf-8');

  console.log(`  ✓ Exported to: ${outputPath}`);
  console.log(`  ℹ Note: For Excel workbook, install exceljs and run with --format=xlsx`);

  return outputPath;
}

// Export 4: Data Quality Report
async function exportDataQualityReport() {
  console.log('\n[4/4] Generating Data Quality Audit Report...');

  const { data, error } = await supabase
    .rpc('get_data_quality_checks');

  if (error) {
    console.error('Error fetching data quality checks:', error);
    return null;
  }

  const results = data as DataQualityResult[];
  console.log(`  ✓ Retrieved ${results.length} quality check results`);

  // Generate markdown report
  let report = `# Data Quality Audit Report
Generated: ${new Date().toISOString()}

## Executive Summary

This report validates 12 months of financial data for Big 4 auditor review.

### Key Metrics

`;

  // Group results by check type
  const byType = new Map<string, DataQualityResult[]>();
  for (const result of results) {
    if (!byType.has(result.check_type)) {
      byType.set(result.check_type, []);
    }
    byType.get(result.check_type)!.push(result);
  }

  // Completeness section
  if (byType.has('COMPLETENESS')) {
    report += `## Completeness\n\n`;
    const completed = byType.get('COMPLETENESS')!;
    const total = completed.find(r => r.metric === 'Total Transactions');

    if (total) {
      const totalNum = parseInt(total.value);
      let complete = totalNum;
      let missing = 0;

      for (const result of completed) {
        if (result.metric.startsWith('Missing') || result.metric === 'Zero Amount Entries') {
          missing += parseInt(result.value);
        }
      }

      const completionRate = totalNum > 0 ? ((totalNum - missing) / totalNum * 100).toFixed(2) : '0.00';
      report += `- **Completion Rate: ${completionRate}%** (${totalNum - missing}/${totalNum} transactions complete)\n`;

      for (const result of completed) {
        if (result.metric !== 'Total Transactions') {
          report += `- ${result.metric}: ${result.value}\n`;
        }
      }
    }
  }

  // Accuracy section
  if (byType.has('ACCURACY')) {
    report += `\n## Accuracy (Double-Entry Principle)\n\n`;
    const accuracy = byType.get('ACCURACY')!;

    for (const result of accuracy) {
      if (result.metric === 'Balance Variance (should be 0)') {
        const variance = parseFloat(result.value);
        const status = variance < 0.01 ? '✓' : '✗';
        report += `- ${status} ${result.metric}: ${result.value} MUR\n`;
      } else {
        report += `- ${result.metric}: ${result.value}\n`;
      }
    }
  }

  // Reconciliation section
  if (byType.has('RECONCILIATION')) {
    report += `\n## Reconciliation\n\n`;
    for (const result of byType.get('RECONCILIATION')!) {
      report += `- ${result.metric}: ${result.value}\n`;
    }
  }

  // Exceptions section
  if (byType.has('EXCEPTIONS')) {
    report += `\n## Exceptions & Issues\n\n`;
    for (const result of byType.get('EXCEPTIONS')!) {
      report += `- ${result.metric}: ${result.value}\n`;
    }
  }

  report += `
## Audit Trail

All entries are logged in the audit_trail table with:
- User who created the entry (created_by)
- Timestamp of creation (created_at)
- User who approved (approved_by)
- Approval timestamp (approved_at)

## Recommendations

1. Review any unbalanced months
2. Reconcile unmatched receivables/payables
3. Verify large transactions (> 1,000,000 MUR)
4. Follow up on entries with missing audit fields

---
Report generated for Big 4 audit compliance
`;

  const outputPath = path.join(EXPORTS_DIR, 'DATA_QUALITY_AUDIT.md');
  fs.writeFileSync(outputPath, report, 'utf-8');

  console.log(`  ✓ Generated report: ${outputPath}`);
  return outputPath;
}

// Main execution
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('PHASE 2, Task 2A - Finance Extraction Agent');
  console.log('═══════════════════════════════════════════════════════════');

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERROR: Supabase credentials not configured');
    console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  ensureExportsDir();

  try {
    const results = await Promise.all([
      exportGeneralLedger(),
      exportTrialBalance(),
      exportMonthlySummaries(),
      exportDataQualityReport()
    ]);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✓ Finance Extraction Complete');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\nExports available at: ${EXPORTS_DIR}`);
    results.forEach((r, i) => {
      if (r) console.log(`  ${i + 1}. ${path.basename(r)}`);
    });

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
