# PHASE 2, TASK 2B — Implementation Checklist
## Banking Extraction Agent — Ready-to-Code Guide

---

## TABLE OF CONTENTS

1. [Pre-Implementation Checklist](#pre-implementation-checklist)
2. [Phase 1: Infrastructure (Days 1-2)](#phase-1-infrastructure-days-1-2)
3. [Phase 2: Data Extraction (Days 3-5)](#phase-2-data-extraction-days-3-5)
4. [Phase 3: Report Generation (Days 6-8)](#phase-3-report-generation-days-6-8)
5. [Phase 4: Validation & QA (Days 9-10)](#phase-4-validation--qa-days-9-10)
6. [Testing & Verification](#testing--verification)
7. [Deployment & Sign-Off](#deployment--sign-off)

---

## PRE-IMPLEMENTATION CHECKLIST

**Before coding begins, verify:**

- [ ] Database has 12 months of bank statements (releves_bancaires)
  - SQL: `SELECT COUNT(*), COUNT(DISTINCT periodo), COUNT(DISTINCT compte_bancaire_id) FROM releves_bancaires WHERE periode >= '2025-07' AND periode <= '2026-06';`
  - Expected: 24 rows (12 months × 2 accounts)

- [ ] GL entries exist for FY2025-2026 in account 5121
  - SQL: `SELECT COUNT(*), COUNT(DISTINCT societe_id) FROM ecritures_comptables_v2 WHERE numero_compte IN ('5121', '512100', '512101') AND date_ecriture >= '2025-07-01';`
  - Expected: 1000+ entries across 2+ companies

- [ ] transactions_bancaires table populated
  - SQL: `SELECT COUNT(*), COUNT(DISTINCT releve_id) FROM transactions_bancaires WHERE date_transaction >= '2025-07-01';`
  - Expected: 5000+ transactions

- [ ] lettrages table has some existing matches (baseline)
  - SQL: `SELECT COUNT(*) FROM lettrages WHERE created_at >= '2025-07-01';`
  - Expected: 1000+ matches (should be 80%+ of transactions)

- [ ] comptes_bancaires table configured correctly
  - SQL: `SELECT * FROM comptes_bancaires WHERE societe_id IN (SELECT id FROM societes WHERE client_id = [CLIENT_ID]);`
  - Expected: 2 accounts (512100 MUR, 512101 EUR) with correct currency codes

- [ ] Node.js version compatible (14+)
  - CLI: `node --version`

- [ ] `/exports` directory writable
  - CLI: `mkdir -p /exports/BANK_RECS && touch /exports/test.txt && rm /exports/test.txt`

---

## PHASE 1: INFRASTRUCTURE (Days 1-2)

### 1.1 Create Directory Structure

**File:** Shell script  
**Command:**
```bash
mkdir -p /exports/BANK_RECS/512100_MUR
mkdir -p /exports/BANK_RECS/512101_EUR
mkdir -p /exports/BANK_STATEMENTS/512100_MUR
mkdir -p /exports/BANK_STATEMENTS/512101_EUR
touch /exports/BANK_RECS/512100_MUR/.gitkeep
touch /exports/BANK_RECS/512101_EUR/.gitkeep
touch /exports/BANK_STATEMENTS/512100_MUR/.gitkeep
touch /exports/BANK_STATEMENTS/512101_EUR/.gitkeep
```

**Verification:**
```bash
find /exports -type d | wc -l  # Should be 5 (parent + 4 dirs)
```

---

### 1.2 Create TypeScript Type Definitions

**File:** `lib/types/banking-export.ts`

```typescript
// Banking export types for reconciliation reports
export interface BankReconciliationReport {
  societeId: string;
  societeNom: string;
  compteId: string;
  numeroCompte: string;
  devise: string;
  periode: string;
  
  // Bank statement section
  bankStatementBalance: number;
  bankOpeningBalance: number;
  bankTotalDebits: number;
  bankTotalCredits: number;
  bankTransactionCount: number;
  
  // GL section
  glBalance: number;
  glOpeningBalance: number;
  glTotalDebits: number;
  glTotalCredits: number;
  glEntryCount: number;
  
  // Reconciliation
  reconciliationDifference: number;
  outstandingDeposits: Transaction[];
  outstandingChecks: Transaction[];
  unmatchedTransactions: Transaction[];
  
  // Sign-off
  preparedBy: string;
  datePrepared: Date;
  reviewedBy?: string;
  dateReviewed?: Date;
  
  // Audit metadata
  matchPercentage: number;
  varianceCategory: 'BALANCED' | 'MINOR_VARIANCE' | 'SIGNIFICANT_VARIANCE';
  auditFlags: string[];
}

export interface Transaction {
  id: string;
  date: Date;
  description: string;
  amount: number;
  currency: string;
  amountMur: number;
  status: 'matched' | 'unmatched' | 'partial';
  daysOld: number;
}

export interface TransactionMatch {
  bankTxId: string;
  bankTxDate: Date;
  bankAmount: number;
  bankCurrency: string;
  bankDescription: string;
  
  glEntryId?: string;
  glEntryDate?: Date;
  glAmount?: number;
  glJournal?: string;
  glDescription?: string;
  
  matchStatus: 'matched' | 'unmatched' | 'partial';
  daysUnmatched: number;
  justification: string;
}

export interface VarianceAnalysis {
  periode: string;
  societeId: string;
  bankBalance: number;
  glBalance: number;
  variance: number;
  varianceCategory: 'BALANCED' | 'MINOR_VARIANCE' | 'SIGNIFICANT_VARIANCE';
  rootCauses: RootCause[];
  correctionEntries?: CorrectionEntry[];
  notes: string;
}

export interface RootCause {
  category: 'pending_deposit' | 'outstanding_check' | 'unmatched' | 'error';
  items: Transaction[];
  totalAmount: number;
  explanation: string;
}

export interface CorrectionEntry {
  id: string;
  journalCode: string;
  description: string;
  amount: number;
  dateApplied: Date;
  reference: string;
}
```

**Checklist:**
- [ ] File created at `lib/types/banking-export.ts`
- [ ] All interfaces exported
- [ ] TypeScript compiles without errors: `npx tsc --noEmit`

---

### 1.3 Create Configuration File

**File:** `lib/banking/config.ts`

```typescript
// Banking extraction configuration
export const BANKING_CONFIG = {
  // Fiscal year settings (Mauritius: July-June)
  FY_START: '2025-07-01',
  FY_END: '2026-06-30',
  FY_LABEL: 'FY2025-2026',
  
  // Account mappings
  BANK_ACCOUNTS: {
    MUR: {
      accountId: '512100',
      currency: 'MUR',
      bankName: 'MCB (Mauritius Commercial Bank)',
    },
    EUR: {
      accountId: '512101',
      currency: 'EUR',
      bankName: 'MCB (Mauritius Commercial Bank)',
    },
  },
  
  // GL account codes (all valid formats that map to 5121)
  GL_ACCOUNT_CODES: ['5121', '51210', '512100', '512101'],
  
  // Reconciliation thresholds
  THRESHOLDS: {
    ROUNDING_TOLERANCE: 1.00,          // 1 MUR
    VARIANCE_FLAG: 100.00,              // Flag variances > 100 MUR
    OUTSTANDING_DAYS_FLAG: 30,          // Flag items > 30 days old
  },
  
  // Export paths
  EXPORT_BASE: '/exports',
  EXPORT_DIRS: {
    RECONCILIATION_REPORTS: '/exports/BANK_RECS',
    BANK_STATEMENTS: '/exports/BANK_STATEMENTS',
  },
  
  // Report file naming
  REPORT_FILENAME_TEMPLATE: '[ACCOUNT]/[YYYY_MM]_RECONCILIATION.pdf',
  BANK_STATEMENT_TEMPLATE: '[ACCOUNT]/[YYYY_MM].pdf',
  CSV_SUMMARY: 'BANK_MATCHING_SUMMARY.csv',
  VARIANCE_REPORT: 'RECONCILIATION_VARIANCES.md',
};

export const COMPANIES = {
  DDS: {
    id: 'soc_dds_id',        // Replace with actual UUID
    name: 'DDS Mauritius Ltd',
    code: 'DDS',
  },
  OCC: {
    id: 'soc_occ_id',        // Replace with actual UUID
    name: 'OCC Mauritius Ltd',
    code: 'OCC',
  },
};

export const MONTHS_IN_FY = [
  '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
];
```

**Checklist:**
- [ ] File created at `lib/banking/config.ts`
- [ ] All company UUIDs inserted (get from database)
- [ ] Paths verified to match actual directory structure

---

## PHASE 2: DATA EXTRACTION (Days 3-5)

### 2.1 Create GL Balance Service

**File:** `lib/banking/gl-balance-service.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import { BANKING_CONFIG, COMPANIES } from './config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface GLBalanceData {
  periodEnd: string;
  societeId: string;
  societeNom: string;
  numeroCom:pte: string;
  totalDebits: number;
  totalCredits: number;
  balanceMur: number;
  nbEntries: number;
}

export async function getGLBalance(
  societeId: string,
  period: string,
  accountCode: string = '5121'
): Promise<GLBalanceData | null> {
  const [year, month] = period.split('-');
  const monthEnd = new Date(Number(year), Number(month), 0);
  const monthStart = new Date(Number(year), Number(month) - 1, 1);

  const { data, error } = await supabase
    .from('ecritures_comptables_v2')
    .select('debit_mur, credit_mur, numero_compte')
    .eq('societe_id', societeId)
    .gte('date_ecriture', monthStart.toISOString().split('T')[0])
    .lte('date_ecriture', monthEnd.toISOString().split('T')[0])
    .in('numero_compte', BANKING_CONFIG.GL_ACCOUNT_CODES);

  if (error) {
    console.error('GL Balance query error:', error);
    return null;
  }

  if (!data || data.length === 0) {
    return {
      periodEnd: monthEnd.toISOString().split('T')[0],
      societeId,
      societeNom: Object.values(COMPANIES).find(c => c.id === societeId)?.name || 'Unknown',
      numeroCom:pte: accountCode,
      totalDebits: 0,
      totalCredits: 0,
      balanceMur: 0,
      nbEntries: 0,
    };
  }

  const totalDebits = data.reduce((sum, row) => sum + (row.debit_mur || 0), 0);
  const totalCredits = data.reduce((sum, row) => sum + (row.credit_mur || 0), 0);

  return {
    periodEnd: monthEnd.toISOString().split('T')[0],
    societeId,
    societeNom: Object.values(COMPANIES).find(c => c.id === societeId)?.name || 'Unknown',
    numeroCom:pte: accountCode,
    totalDebits: Math.round(totalDebits * 100) / 100,
    totalCredits: Math.round(totalCredits * 100) / 100,
    balanceMur: Math.round((totalDebits - totalCredits) * 100) / 100,
    nbEntries: data.length,
  };
}

export async function getAllGLBalances(
  societeId: string
): Promise<GLBalanceData[]> {
  const results: GLBalanceData[] = [];

  for (const period of BANKING_CONFIG.MONTHS_IN_FY) {
    const balance = await getGLBalance(societeId, period);
    if (balance) results.push(balance);
  }

  return results;
}
```

**Checklist:**
- [ ] File created at `lib/banking/gl-balance-service.ts`
- [ ] Function signatures match interfaces
- [ ] Error handling for missing data
- [ ] Test: `npm run ts-check`

---

### 2.2 Create Bank Statement Service

**File:** `lib/banking/bank-statement-service.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface BankStatementData {
  periode: string;
  societeId: string;
  compteId: string;
  numeroCompte: string;
  devise: string;
  accountName: string;
  soldeOuverture: number;
  totalDebits: number;
  totalCredits: number;
  soldeCloture: number;
  calculatedBalance: number;
  transactionCount: number;
  statusRapprochement: string;
}

export async function getBankStatement(
  societeId: string,
  compteId: string,
  period: string
): Promise<BankStatementData | null> {
  const { data: statement, error: stmtError } = await supabase
    .from('releves_bancaires')
    .select(
      `
      *,
      comptes_bancaires (numero_compte, devise, nom),
      transactions_bancaires (id, statut_lettrage)
      `
    )
    .eq('societe_id', societeId)
    .eq('compte_bancaire_id', compteId)
    .eq('periode', period)
    .single();

  if (stmtError) {
    console.error('Bank statement query error:', stmtError);
    return null;
  }

  if (!statement) return null;

  return {
    periode: statement.periode,
    societeId: statement.societe_id,
    compteId: statement.compte_bancaire_id,
    numeroCompte: statement.comptes_bancaires.numero_compte,
    devise: statement.comptes_bancaires.devise,
    accountName: statement.comptes_bancaires.nom,
    soldeOuverture: statement.solde_ouverture,
    totalDebits: statement.total_debits,
    totalCredits: statement.total_credits,
    soldeCloture: statement.solde_cloture,
    calculatedBalance:
      statement.solde_ouverture +
      statement.total_credits -
      statement.total_debits,
    transactionCount: statement.transactions_bancaires?.length || 0,
    statusRapprochement: statement.statut_rapprochement,
  };
}

export async function getAllBankStatements(
  societeId: string
): Promise<BankStatementData[]> {
  const { data, error } = await supabase
    .from('releves_bancaires')
    .select(
      `
      *,
      comptes_bancaires (numero_compte, devise, nom),
      transactions_bancaires (id)
      `
    )
    .eq('societe_id', societeId)
    .gte('periode', '2025-07')
    .lte('periode', '2026-06');

  if (error) {
    console.error('Bank statements query error:', error);
    return [];
  }

  return data.map(stmt => ({
    periode: stmt.periode,
    societeId: stmt.societe_id,
    compteId: stmt.compte_bancaire_id,
    numeroCompte: stmt.comptes_bancaires.numero_compte,
    devise: stmt.comptes_bancaires.devise,
    accountName: stmt.comptes_bancaires.nom,
    soldeOuverture: stmt.solde_ouverture,
    totalDebits: stmt.total_debits,
    totalCredits: stmt.total_credits,
    soldeCloture: stmt.solde_cloture,
    calculatedBalance:
      stmt.solde_ouverture + stmt.total_credits - stmt.total_debits,
    transactionCount: stmt.transactions_bancaires?.length || 0,
    statusRapprochement: stmt.statut_rapprochement,
  }));
}
```

**Checklist:**
- [ ] File created at `lib/banking/bank-statement-service.ts`
- [ ] Joins to comptes_bancaires working
- [ ] Query filters for FY2025-2026

---

### 2.3 Create Transaction Matcher Service

**File:** `lib/banking/transaction-matcher.ts` (stub — implement in Phase 3)

```typescript
import { TransactionMatch } from '@/lib/types/banking-export';

export async function matchTransactions(
  societeId: string,
  period: string
): Promise<TransactionMatch[]> {
  // Queries to implement:
  // 1. SELECT all transactions_bancaires for period
  // 2. FOR EACH: Check if lettrage exists
  // 3. If yes: JOIN to ecritures_comptables_v2, mark 'matched'
  // 4. If no: Mark 'unmatched', calculate days_old
  // 5. Return array

  console.log('TODO: Implement matchTransactions');
  return [];
}
```

**Checklist:**
- [ ] Stub file created at `lib/banking/transaction-matcher.ts`
- [ ] Will be fully implemented in Phase 3

---

## PHASE 3: REPORT GENERATION (Days 6-8)

### 3.1 Create PDF Generator (using pdf-lib)

**File:** `lib/banking/pdf-generator.ts` (stub)

```typescript
import { PDFDocument, rgb, PDFPage } from 'pdf-lib';
import { BankReconciliationReport } from '@/lib/types/banking-export';
import { BANKING_CONFIG } from './config';

export async function generateReconciliationPDF(
  report: BankReconciliationReport
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const { width, height } = page.getSize();

  // TODO: Implement PDF layout
  // 1. Header (company name, account, period)
  // 2. Bank section (statement balance)
  // 3. GL section (ledger balance)
  // 4. Reconciliation worksheet
  // 5. Exception listing
  // 6. Sign-off

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

export async function generateAllReconciliationPDFs(
  reports: BankReconciliationReport[]
): Promise<Map<string, Buffer>> {
  const results = new Map<string, Buffer>();

  for (const report of reports) {
    const pdf = await generateReconciliationPDF(report);
    const filename = `${report.numeroCompte}/${report.periode}_RECONCILIATION.pdf`;
    results.set(filename, pdf);
  }

  return results;
}
```

**Checklist:**
- [ ] Install dependencies: `npm install pdf-lib`
- [ ] Stub created at `lib/banking/pdf-generator.ts`
- [ ] Will be fully implemented in Phase 3

---

### 3.2 Create CSV Generator

**File:** `lib/banking/csv-generator.ts`

```typescript
import { TransactionMatch } from '@/lib/types/banking-export';

export function generateTransactionMatchingCSV(
  matches: TransactionMatch[]
): string {
  const headers = [
    'bank_tx_id',
    'bank_tx_date',
    'bank_amount',
    'bank_currency',
    'bank_libelle',
    'gl_entry_id',
    'gl_entry_date',
    'gl_amount',
    'gl_montant_mur',
    'gl_journal',
    'match_status',
    'days_unmatched',
    'justification',
  ];

  const rows = matches.map(m => [
    m.bankTxId,
    m.bankTxDate.toISOString().split('T')[0],
    m.bankAmount,
    m.bankCurrency,
    m.bankDescription.replace(/"/g, '""'),
    m.glEntryId || '',
    m.glEntryDate ? m.glEntryDate.toISOString().split('T')[0] : '',
    m.glAmount || '',
    m.glAmount || '',
    m.glJournal || '',
    m.matchStatus,
    m.daysUnmatched,
    m.justification.replace(/"/g, '""'),
  ]);

  // CSV format with proper quoting
  const csvContent = [
    headers.map(h => `"${h}"`).join(','),
    ...rows.map(row =>
      row.map(cell => {
        if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return `"${cell}"`;
      }).join(',')
    ),
  ].join('\n');

  return csvContent;
}
```

**Checklist:**
- [ ] File created at `lib/banking/csv-generator.ts`
- [ ] CSV format properly quoted
- [ ] Test with commas/quotes in strings

---

### 3.3 Create API Endpoint for Export

**File:** `app/api/exports/banking/reconciliations/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { societe_ids, format } = body;

    // TODO: Validate inputs
    // TODO: Call data extraction services
    // TODO: Call report generation services
    // TODO: Return file download URL or stream

    return NextResponse.json({
      status: 'success',
      message: 'Export generation started',
      downloadUrl: '/exports/BANK_RECS/',
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Export failed' },
      { status: 500 }
    );
  }
}
```

**Checklist:**
- [ ] File created at `app/api/exports/banking/reconciliations/route.ts`
- [ ] POST endpoint handles request body
- [ ] Error handling in place

---

## PHASE 4: VALIDATION & QA (Days 9-10)

### 4.1 Create Validation Service

**File:** `lib/banking/validator.ts`

```typescript
import { BankReconciliationReport } from '@/lib/types/banking-export';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
}

export function validateReconciliationReport(
  report: BankReconciliationReport
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  // Completeness checks
  if (!report.societeId) errors.push('Missing societeId');
  if (!report.periode) errors.push('Missing periode');
  if (report.bankTransactionCount === 0) warnings.push('No bank transactions found');

  // Balance checks
  const variance = Math.abs(report.bankStatementBalance - report.glBalance);
  if (variance > 100) {
    warnings.push(`Variance > 100 MUR: ${variance}`);
  } else if (variance > 1) {
    info.push(`Minor variance: ${variance} MUR`);
  } else {
    info.push('Balance matched perfectly');
  }

  // Outstanding items checks
  const totalOld = [
    ...report.outstandingDeposits,
    ...report.outstandingChecks,
    ...report.unmatchedTransactions,
  ].filter(tx => tx.daysOld > 30);

  if (totalOld.length > 0) {
    errors.push(`${totalOld.length} items > 30 days old must be investigated`);
  }

  // Sign-off checks
  if (!report.preparedBy) warnings.push('Missing sign-off: preparedBy');
  if (!report.datePrepared) warnings.push('Missing sign-off: datePrepared');

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    info,
  };
}

export function validateAllReports(
  reports: BankReconciliationReport[]
): Map<string, ValidationResult> {
  const results = new Map<string, ValidationResult>();

  for (const report of reports) {
    const key = `${report.numeroCompte}/${report.periode}`;
    results.set(key, validateReconciliationReport(report));
  }

  return results;
}
```

**Checklist:**
- [ ] File created at `lib/banking/validator.ts`
- [ ] All validation rules implemented
- [ ] Test with sample data

---

### 4.2 Create Completeness Checker

**File:** `lib/banking/completeness-checker.ts`

```typescript
export interface CompletenessCheck {
  totalExpected: number;
  totalFound: number;
  percentage: number;
  missing: string[];
  isComplete: boolean;
}

export function checkCompletenessofReports(
  reports: any[],
  requiredMonths: number = 12,
  requiredAccounts: number = 2
): CompletenessCheck {
  const totalExpected = requiredMonths * requiredAccounts;
  const totalFound = reports.length;
  const percentage = (totalFound / totalExpected) * 100;

  const reportMap = new Map<string, boolean>();
  const months = ['07', '08', '09', '10', '11', '12', '01', '02', '03', '04', '05', '06'];
  const accounts = ['512100_MUR', '512101_EUR'];
  const years = ['2025', '2026'];

  // Mark found
  for (const report of reports) {
    const key = `${report.numeroCompte}/${report.periode}`;
    reportMap.set(key, true);
  }

  // Find missing
  const missing: string[] = [];
  for (const account of accounts) {
    for (const month of months) {
      const year = month <= '06' ? '2026' : '2025';
      const key = `${account}/${year}-${month}`;
      if (!reportMap.has(key)) {
        missing.push(key);
      }
    }
  }

  return {
    totalExpected,
    totalFound,
    percentage,
    missing,
    isComplete: missing.length === 0,
  };
}
```

**Checklist:**
- [ ] File created at `lib/banking/completeness-checker.ts`
- [ ] All months checked (Jul 2025 - Jun 2026)
- [ ] Both accounts checked (MUR, EUR)

---

## TESTING & VERIFICATION

### Unit Tests

**File:** `__tests__/banking/services.test.ts` (optional)

```typescript
import { getGLBalance } from '@/lib/banking/gl-balance-service';

describe('GL Balance Service', () => {
  it('should fetch GL balance for a period', async () => {
    const balance = await getGLBalance('soc_dds_id', '2025-07');
    expect(balance).toBeDefined();
    expect(balance?.balanceMur).toBeGreaterThanOrEqual(0);
  });

  it('should return 0 if no entries', async () => {
    const balance = await getGLBalance('soc_nonexistent', '2025-07');
    expect(balance?.nbEntries).toBe(0);
  });
});
```

**Checklist:**
- [ ] Unit tests created (optional but recommended)
- [ ] Test command: `npm run test`

---

### Manual Testing Checklist

**Before final sign-off, verify:**

- [ ] **Month 1 (Jul 2025):**
  - [ ] GL balance matches bank statement balance (or explained)
  - [ ] PDF generated correctly
  - [ ] All transactions listed

- [ ] **Month 6 (Dec 2025):**
  - [ ] (Mid-year spot check)
  - [ ] Forex transactions handled correctly (if any EUR)
  - [ ] Sign-offs present

- [ ] **Month 12 (Jun 2026):**
  - [ ] (Year-end spot check)
  - [ ] All accounts reconciled
  - [ ] Variance analysis complete

- [ ] **CSV export:**
  - [ ] Opens in Excel without errors
  - [ ] All 12+ months of data present
  - [ ] 0 unmatched items > 30 days old

- [ ] **Variance report:**
  - [ ] Markdown renders correctly
  - [ ] Root causes documented
  - [ ] Audit conclusion clear

---

## DEPLOYMENT & SIGN-OFF

### Pre-Deployment Checklist

- [ ] All code compiles: `npm run build`
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] All tests pass: `npm run test` (if applicable)
- [ ] All 24 PDF reports generated successfully
- [ ] All CSV exports valid and complete
- [ ] All variance narratives documented
- [ ] Finance team reviewed 5 spot-check months
- [ ] No outstanding items > 30 days old

### Deployment Steps

1. **Merge PR to main**
   ```bash
   git checkout main
   git pull origin main
   git merge --ff-only feature/banking-extraction
   ```

2. **Deploy to production**
   ```bash
   npm run build
   npm run start
   ```

3. **Verify endpoints live**
   ```bash
   curl https://your-domain.com/api/exports/banking/reconciliations
   ```

### Post-Deployment

- [ ] Export files accessible at `/exports/BANK_RECS/`
- [ ] CSV downloadable from exports endpoint
- [ ] PDF reports printable and audit-quality
- [ ] All 24 files present in correct directories
- [ ] Finance Controller signs off (physical or digital)
- [ ] Archive to audit drive (Big4 auditor access)

---

## FINAL SIGN-OFF TEMPLATE

```markdown
# BANKING EXTRACTION — PHASE 2, TASK 2B

## Completion Attestation

I certify that the following deliverables have been completed:

### Reconciliation Reports (24 files)
- [ ] Account 512100 (MUR): 12 monthly PDFs
- [ ] Account 512101 (EUR): 12 monthly PDFs
- All reports include complete bank statement balance, GL balance, reconciliation, and sign-off

### Transaction Matching Report
- [ ] CSV file: BANK_MATCHING_SUMMARY.csv
- [ ] Contains all bank transactions (matched and unmatched)
- [ ] All items > 30 days old investigated
- [ ] 0 outstanding exceptions

### Bank Statement Images
- [ ] Account 512100: 12 original PDFs
- [ ] Account 512101: 12 original PDFs
- All statements organized by account and month

### Variance Analysis Report
- [ ] RECONCILIATION_VARIANCES.md complete
- [ ] Executive summary with findings
- [ ] Monthly detail for each variance
- [ ] Root cause analysis for variances > 100 MUR
- [ ] Audit conclusion

## Success Metrics ✅

| Metric | Target | Actual | Status |
|---|---|---|---|
| Monthly reconciliations | 24 | ___ | ✓/✗ |
| Bank bal = GL bal | 100% | __% | ✓/✗ |
| Unmatched items > 30d | 0 | ___ | ✓/✗ |
| Documentation complete | 100% | __% | ✓/✗ |
| Audit-ready | Yes | ___ | ✓/✗ |

## Sign-Off

**Prepared by:**  
Name: ____________________  
Date: ____________________  
Signature: ____________________  

**Reviewed by:**  
Name: ____________________  
Date: ____________________  
Signature: ____________________  

**Approved by Finance Controller:**  
Name: ____________________  
Date: ____________________  
Signature: ____________________  

---

**Deliverables Location:** `/exports/`  
**Archive Date:** ____________________  
**Big4 Auditor Access:** [Yes / No]  
```

---

*Last updated: 2026-05-22*  
*Ready to implement: YES ✓*
