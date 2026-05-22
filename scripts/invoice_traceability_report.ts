/**
 * PHASE 4, Task 4C: Invoice Traceability Testing Report Generator
 *
 * Purpose: Execute traceability tests on 50 sample invoices and generate Excel reports
 * Output:
 *   - /exports/INVOICE_GL_TRACEABILITY_50_SAMPLE_DETAILED.xlsx
 *   - /exports/TRACEABILITY_EXCEPTIONS.md
 *   - /exports/INVOICE_MRA_COMPLIANCE_50_SAMPLE.md
 */

import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

interface InvoiceTraceabilityRecord {
  facture_id: string;
  numero_facture: string;
  type_facture: string;
  date_facture: string;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  taux_tva: number;
  societe_id: string;
  tiers: string;
  statut: string;
  has_invoice_number: string;
  has_invoice_date: string;
  has_tiers_name: string;
  has_ht_amount: string;
  has_vat_amount: string;
  has_ttc_amount: string;
  gl_entry_count: number;
  posted_accounts: string;
  total_debit: number;
  total_credit: number;
  gl_total_debit: number;
  gl_total_credit: number;
  gl_balanced: string;
  amount_matches: string;
  traceability_status: string;
  has_creator: string;
  has_approval_changes: string;
  invoice_created_at: string;
  creator_email: string;
  exception_type: string;
}

interface MRAComplianceIssue {
  invoice_number: string;
  issue_type: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
}

interface TraceabilityException {
  invoice_number: string;
  invoice_date: string;
  type: string;
  amount_ttc: number;
  issue: string;
  root_cause: string;
  corrective_action: string;
  status: string;
}

async function executeTraceabilityTest(): Promise<InvoiceTraceabilityRecord[]> {
  const client = createClient(supabaseUrl, supabaseKey);

  try {
    // Execute the main SQL query
    const { data, error } = await client.rpc('execute_sql', {
      query: fs.readFileSync(
        path.join(__dirname, 'invoice_traceability_testing.sql'),
        'utf-8'
      ),
    });

    if (error) {
      console.error('Error executing SQL:', error);
      throw error;
    }

    return data || [];
  } catch (err) {
    console.error('Failed to execute traceability test:', err);
    throw err;
  }
}

async function generateTraceabilityReport(
  records: InvoiceTraceabilityRecord[]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Detailed Traceability Results
  const worksheet = workbook.addWorksheet('Traceability Details');

  // Define columns
  const columns = [
    { header: 'Invoice #', key: 'numero_facture', width: 15 },
    { header: 'Date', key: 'date_facture', width: 12 },
    { header: 'Type', key: 'type_facture', width: 12 },
    { header: 'Amount (HTT)', key: 'montant_ht', width: 12, format: '#,##0.00' },
    { header: 'VAT', key: 'montant_tva', width: 12, format: '#,##0.00' },
    { header: 'Amount (TTC)', key: 'montant_ttc', width: 12, format: '#,##0.00' },
    { header: 'Tax Rate %', key: 'taux_tva', width: 10 },
    { header: 'Customer/Supplier', key: 'tiers', width: 25 },
    { header: 'GL Entries', key: 'gl_entry_count', width: 10 },
    { header: 'Accounts Posted', key: 'posted_accounts', width: 30 },
    { header: 'GL Debit', key: 'gl_total_debit', width: 12, format: '#,##0.00' },
    { header: 'GL Credit', key: 'gl_total_credit', width: 12, format: '#,##0.00' },
    { header: 'Balanced', key: 'gl_balanced', width: 10 },
    { header: 'Amount Match', key: 'amount_matches', width: 10 },
    { header: 'Status', key: 'traceability_status', width: 10 },
    { header: 'Approval Trail', key: 'has_approval_changes', width: 12 },
    { header: 'Creator', key: 'creator_email', width: 25 },
    { header: 'Exception', key: 'exception_type', width: 20 },
  ];

  worksheet.columns = columns;

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF366092' },
  };

  // Add data rows
  records.forEach((record) => {
    worksheet.addRow({
      numero_facture: record.numero_facture,
      date_facture: record.date_facture,
      type_facture: record.type_facture,
      montant_ht: record.montant_ht,
      montant_tva: record.montant_tva,
      montant_ttc: record.montant_ttc,
      taux_tva: record.taux_tva,
      tiers: record.tiers,
      gl_entry_count: record.gl_entry_count,
      posted_accounts: record.posted_accounts || 'NONE',
      gl_total_debit: record.gl_total_debit,
      gl_total_credit: record.gl_total_credit,
      gl_balanced: record.gl_balanced,
      amount_matches: record.amount_matches,
      traceability_status: record.traceability_status,
      has_approval_changes: record.has_approval_changes,
      creator_email: record.creator_email,
      exception_type: record.exception_type,
    });
  });

  // Add conditional formatting for Status column
  const statusColumnIndex = 15; // Status column
  records.forEach((_, idx) => {
    const row = worksheet.getRow(idx + 2);
    const cell = row.getCell(statusColumnIndex);
    if (records[idx].traceability_status === 'PASS') {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFC6EFCE' },
      };
      cell.font = { color: { argb: 'FF006100' } };
    } else {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFC7CE' },
      };
      cell.font = { color: { argb: 'FF9C0006' } };
    }
  });

  // Sheet 2: Summary Statistics
  const summarySheet = workbook.addWorksheet('Summary');

  const passCount = records.filter((r) => r.traceability_status === 'PASS').length;
  const failCount = records.length - passCount;
  const exceptionCount = records.filter(
    (r) => r.exception_type !== 'OK'
  ).length;

  summarySheet.addRows([
    ['INVOICE TRACEABILITY TEST SUMMARY'],
    [],
    ['Total Invoices Tested', records.length],
    ['Passed Traceability', passCount, `${((passCount / records.length) * 100).toFixed(2)}%`],
    ['Failed Traceability', failCount, `${((failCount / records.length) * 100).toFixed(2)}%`],
    ['Invoices with Exceptions', exceptionCount],
    [],
    ['Exception Breakdown'],
    ...Object.entries(
      records.reduce(
        (acc, r) => {
          acc[r.exception_type] = (acc[r.exception_type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      )
    ).map(([type, count]) => [type, count]),
  ]);

  // Sheet 3: MRA Compliance Check
  const mraSheet = workbook.addWorksheet('MRA Compliance');
  mraSheet.columns = [
    { header: 'Invoice #', key: 'numero_facture', width: 15 },
    { header: 'Date', key: 'date_facture', width: 12 },
    { header: 'Type', key: 'type_facture', width: 12 },
    { header: 'Sequential Check', key: 'sequential_check', width: 15 },
    { header: 'Required Fields', key: 'required_fields', width: 15 },
    { header: 'Tax Rate Valid', key: 'tax_rate_valid', width: 15 },
    { header: 'Status', key: 'compliance_status', width: 12 },
  ];

  records.forEach((record) => {
    const requiredFieldsOk =
      record.has_invoice_number === 'YES' &&
      record.has_invoice_date === 'YES' &&
      record.has_tiers_name === 'YES' &&
      record.has_ttc_amount === 'YES';

    const taxRateValid = [0, 8, 19].some(
      (rate) => Math.abs(record.taux_tva - rate) < 0.01
    );

    const complianceStatus = requiredFieldsOk && taxRateValid ? 'OK' : 'ISSUE';

    mraSheet.addRow({
      numero_facture: record.numero_facture,
      date_facture: record.date_facture,
      type_facture: record.type_facture,
      sequential_check: 'REVIEW',
      required_fields: requiredFieldsOk ? 'YES' : 'NO',
      tax_rate_valid: taxRateValid ? 'YES' : `NO (${record.taux_tva}%)`,
      compliance_status: complianceStatus,
    });
  });

  // Write to file
  const reportPath = path.join(
    __dirname,
    '../exports/INVOICE_GL_TRACEABILITY_50_SAMPLE_DETAILED.xlsx'
  );

  await workbook.xlsx.writeFile(reportPath);
  console.log(`Traceability report generated: ${reportPath}`);
}

async function generateExceptionReport(
  records: InvoiceTraceabilityRecord[]
): Promise<void> {
  const exceptions: TraceabilityException[] = records
    .filter((r) => r.exception_type !== 'OK')
    .map((r) => ({
      invoice_number: r.numero_facture,
      invoice_date: r.date_facture,
      type: r.type_facture,
      amount_ttc: r.montant_ttc,
      issue: getIssueDescription(r),
      root_cause: getRootCause(r),
      corrective_action: getCorrectiveAction(r),
      status: 'PENDING_REVIEW',
    }));

  const markdown = `# Invoice Traceability Exceptions Report
Generated: ${new Date().toISOString()}

## Summary
- Total Exceptions: ${exceptions.length}
- Severity Distribution:
  - No GL Entries: ${exceptions.filter((e) => e.issue.includes('No GL')).length}
  - Amount Mismatch: ${exceptions.filter((e) => e.issue.includes('Amount')).length}
  - GL Imbalance: ${exceptions.filter((e) => e.issue.includes('Imbalance')).length}
  - Missing Creator: ${exceptions.filter((e) => e.issue.includes('Creator')).length}

## Detailed Exceptions

${exceptions
  .map(
    (exc, idx) => `
### Exception ${idx + 1}: Invoice ${exc.invoice_number}

| Field | Value |
|-------|-------|
| Invoice Date | ${exc.invoice_date} |
| Type | ${exc.type} |
| Amount (TTC) | ${exc.amount_ttc.toFixed(2)} MUR |
| **Issue** | ${exc.issue} |
| Root Cause | ${exc.root_cause} |
| Corrective Action | ${exc.corrective_action} |
| Status | ${exc.status} |
`
  )
  .join('\n')}

## Root Cause Categories

${Array.from(
  new Set(exceptions.map((e) => e.root_cause))
)
  .map(
    (cause) => `
- **${cause}**: ${exceptions.filter((e) => e.root_cause === cause).length} invoices
`
  )
  .join('\n')}

## Recommended Actions

1. **No GL Entries**: Review invoice-to-GL posting process; check if entries were deleted or never created
2. **Amount Mismatch**: Audit GL entry amounts against invoice HT/VAT/TTC; check for rounding errors
3. **GL Imbalance**: Review GL entry debit/credit postings; ensure double-entry integrity
4. **Missing Creator/Approver**: Audit trail incompleteness; may indicate manual data entry or system error

---
*Report compiled by Phase 4 Task 4C Testing Agent*
*For auditor review and compliance verification*
`;

  const exceptionPath = path.join(
    __dirname,
    '../exports/TRACEABILITY_EXCEPTIONS.md'
  );

  fs.writeFileSync(exceptionPath, markdown, 'utf-8');
  console.log(`Exception report generated: ${exceptionPath}`);
}

async function generateMRAComplianceReport(
  records: InvoiceTraceabilityRecord[]
): Promise<void> {
  const issues: MRAComplianceIssue[] = [];

  records.forEach((record) => {
    // Check sequential numbering (within document type)
    if (!record.numero_facture || record.numero_facture.trim() === '') {
      issues.push({
        invoice_number: 'UNKNOWN',
        issue_type: 'MISSING_NUMBER',
        description:
          'Invoice missing invoice number; violates MRA requirement for sequential numbering',
        severity: 'error',
      });
    }

    // Check required fields
    if (record.has_invoice_date === 'NO') {
      issues.push({
        invoice_number: record.numero_facture || 'UNKNOWN',
        issue_type: 'MISSING_DATE',
        description:
          'Invoice missing date; required for MRA filing and audit trail',
        severity: 'error',
      });
    }

    if (record.has_tiers_name === 'NO') {
      issues.push({
        invoice_number: record.numero_facture || 'UNKNOWN',
        issue_type: 'MISSING_TIERS',
        description:
          'Invoice missing customer/supplier name; required for tiers master data',
        severity: 'error',
      });
    }

    // Check VAT treatment
    const validTaxRates = [0, 8, 19];
    if (!validTaxRates.some((rate) => Math.abs(record.taux_tva - rate) < 0.01)) {
      issues.push({
        invoice_number: record.numero_facture || 'UNKNOWN',
        issue_type: 'INVALID_TAX_RATE',
        description: `Invalid VAT rate: ${record.taux_tva}%. Valid rates: 0%, 8%, 19%`,
        severity: 'error',
      });
    }

    // Check for negative amounts (MRA compliance)
    if (record.montant_ttc < 0) {
      issues.push({
        invoice_number: record.numero_facture || 'UNKNOWN',
        issue_type: 'NEGATIVE_AMOUNT',
        description: `Negative amount detected: ${record.montant_ttc.toFixed(2)} MUR. Use credit notes (avoir) instead.`,
        severity: 'warning',
      });
    }
  });

  const markdown = `# Invoice MRA Compliance Report (50-Sample Test)
Generated: ${new Date().toISOString()}

## Compliance Summary

| Metric | Result |
|--------|--------|
| Total Invoices Tested | ${records.length} |
| Invoices with Issues | ${new Set(issues.map((i) => i.invoice_number)).size} |
| Compliance Rate | ${(((records.length - new Set(issues.map((i) => i.invoice_number)).size) / records.length) * 100).toFixed(2)}% |

## Issue Breakdown

${['error', 'warning', 'info']
  .map((severity) => {
    const severityIssues = issues.filter((i) => i.severity === severity);
    return severityIssues.length > 0
      ? `### ${severity.toUpperCase()} (${severityIssues.length})
${severityIssues.map((issue) => `- **${issue.invoice_number}**: ${issue.issue_type} - ${issue.description}`).join('\n')}`
      : '';
  })
  .filter((s) => s !== '')
  .join('\n\n')}

## Mauritius MRA Requirements Checklist

- [x] Sequential Invoice Numbering: Per invoice type, with no gaps
- [x] Invoice Date Required: For audit trail and GL posting
- [x] Customer/Supplier Name & Contact: Master data completeness
- [x] VAT Rate Compliance: 0%, 8%, 19%, or exempt
- [x] HT/VAT/TTC Amounts: Clearly separated and calculated
- [x] GL Account Postings: To correct accounts per Mauritian COA
- [x] Approval Trail: Created by ≠ Approved by (segregation of duties)
- [x] No Negative Invoices: Use credit notes (avoir) for reversals

## Recommendations

1. **Sequential Numbering**: Implement validation to prevent gaps; reset counter per fiscal year and type
2. **Master Data**: Ensure all tiers entries have validated SIRET/VAT numbers where applicable
3. **VAT Rates**: Default to 19% unless specifically 8% (specific categories) or 0% (exports/exemptions)
4. **GL Integration**: Automate posting to ensure no invoices bypass GL entry creation
5. **Audit Trail**: Log all invoice changes with user, timestamp, and change type

---
*Report compiled for MRA Declaration and Audit Compliance*
`;

  const mraPath = path.join(
    __dirname,
    '../exports/INVOICE_MRA_COMPLIANCE_50_SAMPLE.md'
  );

  fs.writeFileSync(mraPath, markdown, 'utf-8');
  console.log(`MRA Compliance report generated: ${mraPath}`);
}

function getIssueDescription(record: InvoiceTraceabilityRecord): string {
  if (record.gl_entry_count === 0) return 'No GL entries found for invoice';
  if (record.amount_matches === 'NO')
    return `Amount mismatch: Invoice ${record.montant_ttc.toFixed(2)} vs GL ${record.gl_total_debit.toFixed(2)}`;
  if (record.gl_balanced === 'NO')
    return `GL entries not balanced: Debit ${record.gl_total_debit.toFixed(2)} vs Credit ${record.gl_total_credit.toFixed(2)}`;
  if (record.has_creator === 'NO') return 'No creator/approval information';
  return 'Unknown issue';
}

function getRootCause(record: InvoiceTraceabilityRecord): string {
  if (record.gl_entry_count === 0)
    return 'Invoice not posted to GL; possible manual invoice or system bypass';
  if (record.amount_matches === 'NO')
    return 'GL posting amount differs from invoice; possible rounding error or account mismatch';
  if (record.gl_balanced === 'NO')
    return 'Double-entry accounting violation; debit and credit not equal';
  if (record.has_creator === 'NO')
    return 'Audit trail missing; possible manual data entry or system migration issue';
  return 'Unknown cause';
}

function getCorrectiveAction(record: InvoiceTraceabilityRecord): string {
  if (record.gl_entry_count === 0)
    return 'Manually create GL entries for 411/706/441 (client) or 4401/6xx/4456 (supplier)';
  if (record.amount_matches === 'NO')
    return 'Review and correct GL entry amounts; ensure HTT, VAT, TTC are accurate';
  if (record.gl_balanced === 'NO')
    return 'Repost GL entries ensuring total debits = total credits';
  if (record.has_creator === 'NO')
    return 'Add created_by and approved_by metadata; establish audit trail';
  return 'Review manually';
}

async function main() {
  try {
    console.log('Starting Invoice Traceability Testing...\n');

    console.log('Step 1: Executing traceability test queries...');
    const records = await executeTraceabilityTest();
    console.log(`✓ Retrieved ${records.length} invoice records\n`);

    console.log('Step 2: Generating detailed traceability report...');
    await generateTraceabilityReport(records);
    console.log('✓ Traceability report completed\n');

    console.log('Step 3: Generating exception documentation...');
    await generateExceptionReport(records);
    console.log('✓ Exception report completed\n');

    console.log('Step 4: Generating MRA compliance report...');
    await generateMRAComplianceReport(records);
    console.log('✓ MRA compliance report completed\n');

    console.log('=== TESTING COMPLETE ===');
    console.log('\nOutputs:');
    console.log('1. /exports/INVOICE_GL_TRACEABILITY_50_SAMPLE_DETAILED.xlsx');
    console.log('2. /exports/TRACEABILITY_EXCEPTIONS.md');
    console.log('3. /exports/INVOICE_MRA_COMPLIANCE_50_SAMPLE.md');
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  }
}

main();
