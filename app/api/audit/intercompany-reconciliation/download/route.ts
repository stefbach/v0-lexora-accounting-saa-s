/**
 * Intercompany Reconciliation File Download
 *
 * Generates and downloads individual reconciliation files in their native formats:
 * - CSV files (transaction map, reconciliation)
 * - Markdown files (settlement history, disclosure, compliance)
 *
 * Endpoint: GET /api/audit/intercompany-reconciliation/download?file=FILENAME&start=YYYY-MM-DD&end=YYYY-MM-DD
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

type FileType =
  | 'transaction_map_csv'
  | 'reconciliation_csv'
  | 'settlement_history_md'
  | 'related_party_disclosure_md'
  | 'compliance_check_md'

const FILE_CONFIGS: Record<
  FileType,
  {
    filename: string
    mimetype: string
    extension: string
  }
> = {
  transaction_map_csv: {
    filename: 'INTERCOMPANY_TRANSACTION_MAP.csv',
    mimetype: 'text/csv',
    extension: 'csv',
  },
  reconciliation_csv: {
    filename: 'INTERCOMPANY_4411_4412_RECONCILIATION.csv',
    mimetype: 'text/csv',
    extension: 'csv',
  },
  settlement_history_md: {
    filename: 'INTERCOMPANY_SETTLEMENTS.md',
    mimetype: 'text/markdown',
    extension: 'md',
  },
  related_party_disclosure_md: {
    filename: 'RELATED_PARTY_TRANSACTIONS_DISCLOSURE.md',
    mimetype: 'text/markdown',
    extension: 'md',
  },
  compliance_check_md: {
    filename: 'RELATED_PARTY_COMPLIANCE_CHECK.md',
    mimetype: 'text/markdown',
    extension: 'md',
  },
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
    const fileType = searchParams.get('file') as FileType | null
    const startDate = searchParams.get('start') || getCurrentYearStart()
    const endDate = searchParams.get('end') || getCurrentDate()

    // Validate file type
    if (!fileType || !FILE_CONFIGS[fileType]) {
      return NextResponse.json(
        {
          error: 'Invalid file type',
          available_files: Object.keys(FILE_CONFIGS),
        },
        { status: 400 }
      )
    }

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

    console.log(`[Download] Generating ${fileType} for ${startDate} to ${endDate}`)

    let content: string
    const config = FILE_CONFIGS[fileType]

    // Generate requested file
    switch (fileType) {
      case 'transaction_map_csv': {
        const transactions = await getIntercompanyTransactionMap(
          supabase,
          startDate,
          endDate
        )
        content = exportTransactionMapToCsv(transactions)
        break
      }

      case 'reconciliation_csv': {
        const reconciliation = await reconcile4411and4412(
          supabase,
          startDate,
          endDate
        )
        content = exportReconciliationToCsv(
          reconciliation.dds_4411_receivable,
          reconciliation.occ_4412_payable,
          reconciliation.dds_4412_payable,
          reconciliation.occ_4411_receivable,
          reconciliation.variance_mur,
          reconciliation.is_balanced
        )
        break
      }

      case 'settlement_history_md': {
        const settlements = await getSettlementHistory(
          supabase,
          startDate,
          endDate
        )
        content = exportSettlementHistoryToMarkdown(
          settlements,
          `${startDate} to ${endDate}`
        )
        break
      }

      case 'related_party_disclosure_md': {
        const disclosure = await getRelatedPartyDisclosure(
          supabase,
          extractYear(startDate)
        )
        content = exportRelatedPartyDisclosureToMarkdown(disclosure)
        break
      }

      case 'compliance_check_md': {
        const compliance = await checkRelatedPartyCompliance(
          supabase,
          startDate,
          endDate
        )
        content = exportComplianceCheckToMarkdown(
          compliance,
          `${startDate} to ${endDate}`
        )
        break
      }

      default:
        return NextResponse.json(
          { error: 'Invalid file type' },
          { status: 400 }
        )
    }

    // Log download event
    await logDownloadEvent(supabase, user.id, fileType, startDate, endDate)

    // Return file with appropriate headers
    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `${timestamp}_${config.filename}`

    const response = new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': config.mimetype,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': Buffer.byteLength(content, 'utf-8').toString(),
      },
    })

    return response
  } catch (error: unknown) {
    console.error('[Intercompany Download] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      {
        error: 'Failed to generate and download file',
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

async function logDownloadEvent(
  supabase: any,
  userId: string,
  fileType: FileType,
  startDate: string,
  endDate: string
): Promise<void> {
  try {
    await supabase.from('audit_trail').insert({
      user_id: userId,
      action: 'EXPORT',
      table_name: 'flux_interco',
      description: `Downloaded intercompany reconciliation file: ${fileType} (${startDate} to ${endDate})`,
      new_values: {
        file_type: fileType,
        period_start: startDate,
        period_end: endDate,
      },
    })
  } catch (error) {
    console.warn('[Audit Log] Failed to log download event:', error)
  }
}
