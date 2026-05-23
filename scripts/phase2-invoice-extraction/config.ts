/**
 * Configuration for Phase 2, Task 2C — Invoice Extraction
 *
 * Central configuration for all extraction parameters and constants.
 * Modify these values to adjust extraction behavior.
 */

export const EXTRACTION_CONFIG = {
  // Date range for extractions
  period: {
    months: 12,
    description: 'Last 12 months',
  },

  // GL Traceability sample size
  glTraceability: {
    sampleSize: 50,
    description: '50 random invoices for detailed GL reconciliation',
    toleranceAmount: 0.01, // MUR — tolerance for rounding
  },

  // MRA Compliance
  mraCompliance: {
    requiredFields: [
      'numero_facture',
      'date_facture',
      'tiers',
      'montant_ht',
      'montant_ttc',
      'taux_tva',
    ],
    validVATRates: [0, 8, 19],
    description: 'Mauritian (MRA) compliance requirements',
  },

  // Invoice status classifications
  statuses: {
    outstanding: ['en_attente', 'partiel', 'retard'],
    completed: ['paye', 'annule'],
  },

  // Aging buckets for outstanding invoices
  agingBuckets: [
    { name: '0-30 days', min: 0, max: 30, action: 'Standard reminder' },
    { name: '31-60 days', min: 31, max: 60, action: 'Follow-up phone call' },
    { name: '61-90 days', min: 61, max: 90, action: 'Formal payment demand' },
    { name: '91-120 days', min: 91, max: 120, action: 'Legal notice' },
    { name: '120+ days (OVERDUE)', min: 121, max: 999999, action: 'Escalation/Legal action' },
  ],

  // Success criteria
  successCriteria: {
    completeRegister: {
      invoicesCovered: '100% of invoices from past 12 months',
      requiredColumns: 12,
      sortOrder: 'By date, then by type',
    },
    glTraceability: {
      sampleSize: 50,
      reconciliationRate: '100% (within 0.01 MUR)',
      glMatchRequired: true,
    },
    mraCompliance: {
      criticalIssues: 0,
      missingRequiredFields: 0,
      invalidVATRates: 0,
      duplicateNumbers: 0,
    },
    agingAnalysis: {
      allOutstandingInvoicesIncluded: true,
      accurateDaysCalculation: true,
      collectionStrategyProvided: true,
    },
  },

  // Export paths
  exportPaths: {
    base: 'exports',
    completeRegister: 'INVOICE_REGISTER_COMPLETE.csv',
    glTraceability: 'INVOICE_GL_TRACEABILITY_50_SAMPLE.xlsx',
    mraCompliance: 'INVOICE_MRA_COMPLIANCE.md',
    agingAnalysis: 'AGING_ANALYSIS.xlsx',
  },

  // Excel formatting
  excel: {
    formats: {
      currency: '#,##0.00;[Red](#,##0.00);"–"', // Mauritian accounting style
      date: 'dd/mm/yyyy',
      percent: '0.00%;[Red](0.00%)',
      integer: '#,##0;[Red](#,##0);"–"',
    },
    columnWidths: {
      invoiceNumber: 20,
      date: 12,
      currency: 18,
      name: 30,
      status: 12,
      reference: 20,
    },
  },

  // CSV formatting
  csv: {
    delimiter: ',',
    lineTerminator: '\n',
    quoteCharacter: '"',
    quoteEscapeCharacter: '"',
    encoding: 'utf-8',
  },

  // Logging/Verbose
  verbose: true,
  logLevel: 'info', // 'debug' | 'info' | 'warn' | 'error'
}

/**
 * MRA Compliance Rules
 *
 * Reference: Mauritius Revenue Authority (MRA) requirements for invoicing
 */
export const MRA_RULES = {
  invoiceNumbering: {
    required: true,
    sequential: true,
    perType: true,
    gaps: {
      warning: 10, // warn if gap > 10 numbers
      error: 100,  // error if gap > 100 numbers
    },
  },

  requiredFields: {
    invoiceNumber: 'numéro de facture',
    date: 'date de la facture',
    customer: 'nom et adresse du client',
    supplier: 'nom et adresse du fournisseur',
    amount: 'montant TTC',
    vatAmount: 'montant TVA',
    vatRate: 'taux TVA',
    siret: 'SIRET (entreprise) ou BRN (Mauritius)',
  },

  vatRates: {
    standard: 19,
    reduced: [8, 0],
    exempt: 'exempt ou non applicable',
  },

  validStatuses: [
    'en_attente',  // pending
    'partiel',     // partially paid
    'paye',        // paid
    'retard',      // overdue
    'annule',      // cancelled
  ],

  auditTrail: {
    required: ['created_by', 'created_at', 'updated_at'],
    optional: ['approved_by', 'approved_at'],
  },
}

/**
 * GL Account Mappings for Mauritius Accounting
 *
 * Standard accounting accounts used in Lexora:
 */
export const GL_ACCOUNTS = {
  // Assets
  '110': 'Cash and cash equivalents',
  '120': 'Bank accounts',
  '130': 'Petty cash',

  // Receivables
  '410': 'Customers (domestic)',
  '411': 'Customers invoices',
  '412': 'Customers advances',

  // Payables
  '401': 'Suppliers (domestic)',
  '402': 'Suppliers invoices',
  '403': 'Suppliers advances',
  '404': 'Employee advances',

  // Revenue
  '700': 'Sales of goods',
  '701': 'Sales of services',
  '702': 'Royalties',
  '705': 'Other operating income',
  '706': 'Income from services',

  // Expenses
  '600': 'Purchases of goods',
  '601': 'Purchases of services',
  '602': 'Raw materials',
  '603': 'Supplies',
  '604': 'Transportation',
  '605': 'Utilities',
  '606': 'Repairs and maintenance',
  '607': 'Insurance',
  '608': 'Advertising and marketing',
  '609': 'Professional fees',

  // VAT
  '441': 'VAT receivable',
  '442': 'VAT payable',

  // Bank
  '512': 'Bank (main account)',
  '513': 'Bank (secondary)',
  '514': 'Bank (USD account)',
}

/**
 * Payment modes recognized by Lexora
 */
export const PAYMENT_MODES = [
  'virement',   // Bank transfer
  'cheque',     // Check
  'espece',     // Cash
  'carte',      // Card
  'prelevement', // Direct debit
  'autre',      // Other
]

/**
 * Invoice types
 */
export const INVOICE_TYPES = {
  client: {
    code: 'client',
    name: 'Customer Invoices',
    description: 'Factures de vente (revenue)',
  },
  fournisseur: {
    code: 'fournisseur',
    name: 'Supplier Invoices',
    description: 'Factures d\'achat (expenses)',
  },
}

/**
 * Journal codes used in GL
 */
export const JOURNAL_CODES = {
  'ACH': 'Purchases Journal (Achat)',
  'VTE': 'Sales Journal (Vente)',
  'BQ': 'Bank Journal (Banque)',
  'OD': 'Manual Journal (Opération Divers)',
  'SAL': 'Payroll Journal (Salaires)',
}

export default EXTRACTION_CONFIG
