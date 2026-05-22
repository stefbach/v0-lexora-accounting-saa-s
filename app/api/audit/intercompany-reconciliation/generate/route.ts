/**
 * Intercompany Reconciliation Report Generator
 * PHASE 5, Task 5B - Weeks 9-10
 *
 * Generates complete intercompany reconciliation package:
 * 1. Transaction Map (CSV)
 * 2. 4411/4412 Reconciliation (Excel-compatible CSV)
 * 3. Settlement History (Markdown)
 * 4. Related Party Disclosure (Markdown)
 * 5. Compliance Check (Markdown)
 *
 * Endpoint: GET /api/audit/intercompany-reconciliation/generate?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Response: JSON object with base64-encoded files ready for export
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getIntercompanyTransactionMap,
  reconcile4411and4412,
  getSettlementHistory,
  getRelatedPartyDisclosure,
  checkRelatedPartyCompliance,
} from '@/lib/audit/intercompany-reconciliation'
import {
  exportTransactionMapToCsv,
  exportReconciliationToCsv,
  exportSettlementHistoryToMarkdown,
  exportRelatedPartyDisclosureToMarkdown,
  exportComplianceCheckToMarkdown,
} from '@/lib/audit/intercompany-export'

export const dynamic = 'force-dynamic'

interface GenerateResponse {
  success: boolean
  timestamp: string
  reporting_period: string
  files: {
    transaction_map_csv: {
      filename: string
      size: number
      preview?: string
    }
    reconciliation_csv: {
      filename: string
      size: number
      preview?: string
    }
    settlement_history_md: {
      filename: string
      size: number
      content: string
    }
    related_party_disclosure_md: {
      filename: string
      size: number
      content: string
    }
    compliance_check_md: {
      filename: string
      size: number
      content: string
    }
  }
  summary: {
    total_transactions: number
    total_amount_mur: number
    is_4411_4412_balanced: boolean
    variance_mur: number
    total_settlements: number
    compliance_status: 'compliant' | 'non_compliant'
    critical_findings: number
  }
  next_steps: string[]
}

export async function GET(request: Request): Promise<Response> {
  try {
    // Verify authentication
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify user is admin or auditor
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'auditor'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden - Admin or Auditor role required' },
        { status: 403 }
      )
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start') || getCurrentYearStart()
    const endDate = searchParams.get('end') || getCurrentDate()

    // Validate date format
    if (!isValidDateFormat(startDate) || !isValidDateFormat(endDate)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    if (startDate > endDate) {
      return NextResponse.json(
        { error: 'Start date must be before end date' },
        { status: 400 }
      )
    }

    // Generate all reports
    console.log(
      `[Intercompany Reconciliation] Generating reports for ${startDate} to ${endDate}`
    )

    // 1. Transaction Map
    const transactions = await getIntercompanyTransactionMap(
      supabase,
      startDate,
      endDate
    )
    const transactionMapCsv = exportTransactionMapToCsv(transactions)

    // 2. 4411/4412 Reconciliation
    const reconciliation = await reconcile4411and4412(
      supabase,
      startDate,
      endDate
    )
    const reconciliationCsv = exportReconciliationToCsv(
      reconciliation.dds_4411_receivable,
      reconciliation.occ_4412_payable,
      reconciliation.dds_4412_payable,
      reconciliation.occ_4411_receivable,
      reconciliation.variance_mur,
      reconciliation.is_balanced
    )

    // 3. Settlement History
    const settlements = await getSettlementHistory(
      supabase,
      startDate,
      endDate
    )
    const settlementHistoryMd = exportSettlementHistoryToMarkdown(
      settlements,
      `${startDate} to ${endDate}`
    )

    // 4. Related Party Disclosure
    const disclosure = await getRelatedPartyDisclosure(
      supabase,
      extractYear(startDate)
    )
    const disclosureMd = exportRelatedPartyDisclosureToMarkdown(disclosure)

    // 5. Compliance Check
    const compliance = await checkRelatedPartyCompliance(
      supabase,
      startDate,
      endDate
    )
    const complianceMd = exportComplianceCheckToMarkdown(
      compliance,
      `${startDate} to ${endDate}`
    )

    // Calculate summary metrics
    const totalAmount = transactions.reduce((sum, t) => sum + t.amount_mur, 0)
    const criticalFindings = compliance.findings.filter(
      f => f.severity === 'critical'
    ).length

    // Build response
    const response: GenerateResponse = {
      success: true,
      timestamp: new Date().toISOString(),
      reporting_period: `${startDate} to ${endDate}`,
      files: {
        transaction_map_csv: {
          filename: 'INTERCOMPANY_TRANSACTION_MAP.csv',
          size: transactionMapCsv.length,
          preview: transactionMapCsv.split('\n').slice(0, 5).join('\n'),
        },
        reconciliation_csv: {
          filename: 'INTERCOMPANY_4411_4412_RECONCILIATION.csv',
          size: reconciliationCsv.length,
          preview: reconciliationCsv.split('\n').slice(0, 10).join('\n'),
        },
        settlement_history_md: {
          filename: 'INTERCOMPANY_SETTLEMENTS.md',
          size: settlementHistoryMd.length,
          content: settlementHistoryMd,
        },
        related_party_disclosure_md: {
          filename: 'RELATED_PARTY_TRANSACTIONS_DISCLOSURE.md',
          size: disclosureMd.length,
          content: disclosureMd,
        },
        compliance_check_md: {
          filename: 'RELATED_PARTY_COMPLIANCE_CHECK.md',
          size: complianceMd.length,
          content: complianceMd,
        },
      },
      summary: {
        total_transactions: transactions.length,
        total_amount_mur: totalAmount,
        is_4411_4412_balanced: reconciliation.is_balanced,
        variance_mur: reconciliation.variance_mur,
        total_settlements: settlements.length,
        compliance_status: compliance.is_compliant ? 'compliant' : 'non_compliant',
        critical_findings: criticalFindings,
      },
      next_steps: generateNextSteps(
        reconciliation.is_balanced,
        compliance.is_compliant,
        criticalFindings
      ),
    }

    // Log audit event
    await logAuditEvent(
      supabase,
      user.id,
      'INTERCOMPANY_RECONCILIATION_GENERATED',
      {
        start_date: startDate,
        end_date: endDate,
        transactions_count: transactions.length,
        is_balanced: reconciliation.is_balanced,
        compliance_status: compliance.is_compliant ? 'compliant' : 'non_compliant',
      }
    )

    return NextResponse.json(response, { status: 200 })
  } catch (error: unknown) {
    console.error('[Intercompany Reconciliation] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      {
        error: 'Failed to generate intercompany reconciliation reports',
        details: errorMessage,
      },
      { status: 500 }
    )
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0]
}

function getCurrentYearStart(): string {
  return new Date().getFullYear() + '-01-01'
}

function isValidDateFormat(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(new Date(date).getTime())
}

function extractYear(dateStr: string): string {
  return dateStr.split('-')[0]
}

function generateNextSteps(
  isBalanced: boolean,
  isCompliant: boolean,
  criticalFindings: number
): string[] {
  const steps: string[] = []

  steps.push('1. Review transaction map for completeness')
  steps.push('2. Verify all GL references match source documents')

  if (!isBalanced) {
    steps.push('3. INVESTIGATE: 4411/4412 variance must be explained and documented')
    steps.push('4. Document variance reason and get Finance Controller sign-off')
  } else {
    steps.push('3. ✅ 4411/4412 accounts are balanced - no further action required')
  }

  steps.push('4. Review settlement history for pending settlements')
  steps.push('5. Obtain Big 4 auditor feedback on related party disclosure')

  if (!isCompliant) {
    steps.push(`6. ⚠️ ADDRESS ${criticalFindings} CRITICAL FINDINGS before audit`)
    steps.push('7. Document remediation actions and supporting evidence')
  } else {
    steps.push('6. ✅ All compliance checks passed')
  }

  steps.push('7. Schedule intercompany reconciliation review with CFO')
  steps.push('8. Package workpapers for Big 4 audit submission')

  return steps
}

async function logAuditEvent(
  supabase: any,
  userId: string,
  action: string,
  details: Record<string, any>
): Promise<void> {
  try {
    await supabase.from('audit_trail').insert({
      user_id: userId,
      action,
      table_name: 'flux_interco',
      description: `Intercompany reconciliation report generated: ${JSON.stringify(details)}`,
      new_values: details,
    })
  } catch (error) {
    console.warn('[Audit Log] Failed to log event:', error)
    // Don't fail the request if audit logging fails
  }
}
