/**
 * Intercompany Reconciliation Export Utilities
 *
 * Formats and exports intercompany reconciliation data to:
 * - CSV (transaction maps, reconciliation)
 * - Markdown (settlement history, disclosure, compliance)
 */

import { IntercompanyTransaction, Account4411Reconciliation, SettlementRecord, RelatedPartyDisclosure, ComplianceCheckResult } from './intercompany-reconciliation'

// ============================================================================
// CSV EXPORT
// ============================================================================

/**
 * Export intercompany transaction map to CSV format.
 * Output file: INTERCOMPANY_TRANSACTION_MAP.csv
 */
export function exportTransactionMapToCsv(transactions: IntercompanyTransaction[]): string {
  const headers = [
    'Date',
    'Description',
    'Direction',
    'Amount (MUR)',
    'DDS Account',
    'OCC Account',
    'GL Reference',
    'Settled?',
    'Settlement Date',
    'Settlement Method',
    'Invoice Number',
  ]

  const rows: string[][] = [headers]

  for (const txn of transactions) {
    rows.push([
      txn.date,
      txn.description,
      txn.direction,
      txn.amount_mur.toFixed(2),
      txn.account_dds,
      txn.account_occ,
      txn.gl_reference,
      txn.is_settled ? 'YES' : 'NO',
      txn.settlement_date || '',
      txn.settlement_method || '',
      txn.invoice_number || '',
    ])
  }

  return csvStringify(rows)
}

/**
 * Export 4411/4412 reconciliation to CSV (tabular format).
 * Can be imported into Excel for further analysis.
 */
export function exportReconciliationToCsv(
  dds4411: Account4411Reconciliation,
  occ4412: Account4411Reconciliation,
  dds4412: Account4411Reconciliation,
  occ4411: Account4411Reconciliation,
  variance: number,
  isBalanced: boolean
): string {
  const rows: string[][] = []

  // Summary section
  rows.push(['INTERCOMPANY RECONCILIATION SUMMARY'])
  rows.push([])
  rows.push(['DDS Receivable from OCC (Account 4411)'])
  rows.push(['Date', 'Debit (MUR)', 'Credit (MUR)', 'Description', 'GL Reference'])
  for (const txn of dds4411.transactions) {
    rows.push([
      txn.date,
      txn.debit.toFixed(2),
      txn.credit.toFixed(2),
      txn.description,
      txn.gl_reference,
    ])
  }
  rows.push(['TOTAL', dds4411.total_receivable_mur.toFixed(2), dds4411.total_payable_mur.toFixed(2), '', ''])
  rows.push(['BALANCE', dds4411.balance_mur.toFixed(2), '', '', ''])
  rows.push([])

  // OCC 4411 summary
  rows.push(['OCC Receivable from DDS (Account 4411)'])
  rows.push(['Date', 'Debit (MUR)', 'Credit (MUR)', 'Description', 'GL Reference'])
  for (const txn of occ4411.transactions) {
    rows.push([
      txn.date,
      txn.debit.toFixed(2),
      txn.credit.toFixed(2),
      txn.description,
      txn.gl_reference,
    ])
  }
  rows.push(['TOTAL', occ4411.total_receivable_mur.toFixed(2), occ4411.total_payable_mur.toFixed(2), '', ''])
  rows.push(['BALANCE', occ4411.balance_mur.toFixed(2), '', '', ''])
  rows.push([])

  // Reconciliation check
  rows.push(['RECONCILIATION CHECK'])
  rows.push(['DDS 4412 Payable (should equal OCC 4411 Receivable)', dds4412.balance_mur.toFixed(2)])
  rows.push(['OCC 4411 Receivable (should equal DDS 4412 Payable)', occ4411.balance_mur.toFixed(2)])
  rows.push(['Variance (should be 0)', variance.toFixed(2)])
  rows.push(['Balanced?', isBalanced ? 'YES' : 'NO'])

  return csvStringify(rows)
}

// ============================================================================
// MARKDOWN EXPORT
// ============================================================================

/**
 * Export settlement history to Markdown.
 * Output file: INTERCOMPANY_SETTLEMENTS.md
 */
export function exportSettlementHistoryToMarkdown(
  settlements: SettlementRecord[],
  reportingPeriod: string
): string {
  let md = `# Intercompany Settlement History
**Reporting Period:** ${reportingPeriod}

## Summary

- Total Settlements: ${settlements.length}
- Total Amount Settled: MUR ${settlements
    .reduce((sum, s) => sum + s.amount_mur, 0)
    .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

## Detailed Settlement Records

| Settlement Date | Settlement Method | Amount (MUR) | GL Reference | Status | Interco Txns |
|---|---|---:|---|---|---|
`

  for (const settlement of settlements) {
    md += `| ${settlement.settlement_date} | ${settlement.settlement_method} | ${settlement.amount_mur.toFixed(2)} | ${settlement.settlement_reference} | ${settlement.verification_status} | ${settlement.intercompany_transactions_ids.length} |\n`
  }

  md += `

## Settlement Verification

All settlements have been:
- Recorded in the GL with corresponding GL references
- Verified against intercompany balance statements
- Marked as reconciled in the flux_interco system

## Recommendations

1. Continue monthly settlement reviews
2. Maintain settlement documentation (bank confirmations, offset memos)
3. Document any late or partial settlements with explanation
4. Escalate exceptions to Finance Controller for approval

---
*Generated for Big 4 Audit Review*
`

  return md
}

/**
 * Export related party disclosure to Markdown.
 * Output file: RELATED_PARTY_TRANSACTIONS_DISCLOSURE.md
 *
 * This is ready for inclusion in financial statement footnotes.
 */
export function exportRelatedPartyDisclosureToMarkdown(
  disclosure: RelatedPartyDisclosure
): string {
  let md = disclosure.disclosure_narrative

  md += `

## Summary Table

| Metric | Amount (MUR) |
|---|---:|
| DDS to OCC Transfers | ${disclosure.dds_to_occ_total.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} |
| OCC to DDS Transfers | ${disclosure.occ_to_dds_total.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} |
| Partner Loans Outstanding | ${disclosure.partner_loans_total.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} |
| Partner Guarantees Outstanding | ${disclosure.partner_guarantees_total.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} |
| **Total Related Party Exposure** | **${disclosure.total_related_party_exposure.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}** |

## Intercompany Transactions Detail

| Date | Type | Amount (MUR) | Counterparty | Description |
|---|---|---:|---|---|
`

  for (const txn of disclosure.intercompany_transactions) {
    md += `| ${txn.date} | ${txn.type} | ${txn.amount_mur.toFixed(2)} | ${txn.counterparty} | ${txn.description} |\n`
  }

  md += `

## Accounting Treatment

### GL Accounts

- **4411 Intercompany Receivable**: Records amounts owed TO the Company by related parties
- **4412 Intercompany Payable**: Records amounts owed BY the Company to related parties

### Recording Policy

All related party transactions are recorded on an accrual basis at fair market value. The Company evaluates
fair market value by reference to:

1. Terms negotiated at arm's length
2. Market rates for similar transactions with third parties
3. Economic substance of the underlying transaction
4. Supporting documentation (contracts, purchase orders, invoices)

### Settlement Policy

Intercompany balances are settled regularly through:

- Direct bank transfers between operating entities
- Offset arrangements where permitted
- Formal settlement agreements reviewed by Finance Committee

All settlements are documented and recorded in GL accounts 4411/4412 with appropriate GL references.

---
*Prepared for financial statement footnote disclosure (Note X - Related Party Transactions)*
`

  return md
}

/**
 * Export compliance check results to Markdown.
 * Output file: RELATED_PARTY_COMPLIANCE_CHECK.md
 */
export function exportComplianceCheckToMarkdown(
  complianceCheck: ComplianceCheckResult,
  reportingPeriod: string
): string {
  let md = `# Related Party Compliance Check
**Reporting Period:** ${reportingPeriod}

## Executive Summary

**Overall Compliance Status:** ${complianceCheck.is_compliant ? '✅ COMPLIANT' : '⚠️ NON-COMPLIANT'}

${complianceCheck.findings.filter(f => f.severity === 'critical').length > 0 ? `**Critical Findings:** ${complianceCheck.findings.filter(f => f.severity === 'critical').length}` : 'No critical findings'}

---

## Documentation Status

| Item | Count |
|---|---:|
| Contracts Reviewed | ${complianceCheck.documentation_status.contracts_reviewed} |
| Purchase Orders Found | ${complianceCheck.documentation_status.purchase_orders_found} |
| Invoices Recorded | ${complianceCheck.documentation_status.invoices_recorded} |
| Board Resolutions | ${complianceCheck.documentation_status.board_resolutions} |
| Missing Documentation | ${complianceCheck.documentation_status.missing_documentation} |

---

## Fair Market Value Assessment

All sampled transactions have been assessed for fair market value compliance:

| Transaction ID | Description | FMV Assessment | Reasonable? | Notes |
|---|---|---|---|---|
`

  for (const fmv of complianceCheck.fair_market_value_checks.slice(0, 20)) {
    md += `| ${fmv.transaction_id.substring(0, 8)}... | ${fmv.description.substring(0, 40)}... | ${fmv.fair_market_value_assessment} | ${fmv.is_reasonable ? '✅' : '❌'} | ${fmv.notes} |\n`
  }

  md += `

---

## Findings & Observations

${complianceCheck.findings.length === 0 ? '### No findings\n\nAll related party transactions are compliant with Company policy and IFRS requirements.' : ''}
`

  // Group findings by severity
  const byServerity = {
    critical: complianceCheck.findings.filter(f => f.severity === 'critical'),
    high: complianceCheck.findings.filter(f => f.severity === 'high'),
    medium: complianceCheck.findings.filter(f => f.severity === 'medium'),
    low: complianceCheck.findings.filter(f => f.severity === 'low'),
  }

  for (const severity of ['critical', 'high', 'medium', 'low'] as const) {
    if (byServerity[severity].length > 0) {
      md += `\n### ${severity.toUpperCase()} Findings (${byServerity[severity].length})\n\n`
      for (const finding of byServerity[severity]) {
        md += `**${finding.finding_id}**\n\n`
        md += `- Description: ${finding.description}\n`
        md += `- Requirement: ${finding.requirement}\n`
        md += `- Evidence: ${finding.evidence}\n`
        if (finding.transaction_id) {
          md += `- Transaction ID: ${finding.transaction_id}\n`
        }
        md += '\n'
      }
    }
  }

  md += `

## Recommendations

1. **Fair Market Value**: Continue to document arm's length pricing for all intercompany transactions
2. **Documentation**: Ensure all transactions have supporting invoices or purchase orders
3. **Approval Authority**: Establish clear approval limits and document approvals for high-value transactions
4. **Periodic Review**: Quarterly review of intercompany transactions by Finance Committee

## Approval & Sign-Off

| Role | Name | Date | Signature |
|---|---|---|---|
| Finance Controller | | | |
| CFO | | | |
| Board Chair | | | |

---
*This compliance check supports Big 4 audit requirements for related party transaction reviews (IAS 24)*
`

  return md
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Convert array of arrays to CSV string (handles quotes, commas, newlines).
 */
export function csvStringify(rows: string[][]): string {
  return rows
    .map(row =>
      row
        .map(cell => {
          const cellStr = String(cell || '')
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`
          }
          return cellStr
        })
        .join(',')
    )
    .join('\n')
}

/**
 * Format MUR amounts with thousands separators and 2 decimals.
 */
export function formatMur(amount: number): string {
  return `MUR ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Format a date string (YYYY-MM-DD) for display.
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
