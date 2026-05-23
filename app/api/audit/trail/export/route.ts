import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  queryAuditTrail,
  formatAuditForCsv,
  csvStringify,
  type AuditQueryOptions,
} from '@/lib/audit/query-builder'
import { buildWorkbook, aoaSheet, cell, header, FMT_DATE, xlsxResponse } from '@/lib/export/xlsx-helpers'

/**
 * GET /api/audit/trail/export
 *
 * Export audit trail as CSV or Excel file
 *
 * Query parameters:
 * - table_name (required): Table to export (ecritures_comptables_v2, factures, etc.)
 * - format (required): csv or excel
 * - row_id (optional): Specific record
 * - user_id (optional): Filter by user
 * - start_date (optional): ISO date
 * - end_date (optional): ISO date
 * - action (optional): Filter by action type
 *
 * Returns: File download (CSV or Excel)
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Check authorization
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const userRole = profile?.role
  if (!userRole || !['admin', 'auditor'].includes(userRole)) {
    return NextResponse.json(
      { error: 'Only admins and auditors can export audit trail' },
      { status: 403 }
    )
  }

  // Parse parameters
  const url = new URL(request.url)
  const tableName = url.searchParams.get('table_name')
  const format = (url.searchParams.get('format') || 'csv').toLowerCase()
  const rowId = url.searchParams.get('row_id')
  const userId = url.searchParams.get('user_id')
  const startDate = url.searchParams.get('start_date')
  const endDate = url.searchParams.get('end_date')
  const action = url.searchParams.get('action')

  if (!tableName) {
    return NextResponse.json(
      { error: 'Missing required parameter: table_name' },
      { status: 400 }
    )
  }

  if (!['csv', 'excel'].includes(format)) {
    return NextResponse.json(
      { error: 'Invalid format. Must be csv or excel' },
      { status: 400 }
    )
  }

  try {
    // Query audit trail (no pagination for full export)
    const result = await queryAuditTrail(supabase, {
      table_name: tableName,
      row_id: rowId || undefined,
      user_id: userId || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      action: action || undefined,
      limit: 10000, // Large limit for full export
    })

    const filename = `audit-${tableName}-${new Date().toISOString().split('T')[0]}`

    if (format === 'csv') {
      const csvRows = formatAuditForCsv(result.entries)
      const csvContent = csvStringify(csvRows)
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv;charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    // Excel format
    const xlsxRows: any[][] = [
      [
        header('Timestamp'),
        header('User Email'),
        header('User Role'),
        header('Action'),
        header('Table'),
        header('Row ID'),
        header('Description'),
        header('Old Values'),
        header('New Values'),
      ],
    ]

    for (const entry of result.entries) {
      xlsxRows.push([
        cell(entry.timestamp, FMT_DATE),
        cell(entry.user_email || ''),
        cell(entry.user_role || ''),
        cell(entry.action),
        cell(entry.table_name),
        cell(entry.row_id || ''),
        cell(entry.description || ''),
        cell(JSON.stringify(entry.old_values || {}, null, 2)),
        cell(JSON.stringify(entry.new_values || {}, null, 2)),
      ])
    }

    const ws = aoaSheet(xlsxRows, {
      colWidths: [20, 25, 15, 12, 25, 36, 30, 40, 40],
      freezeTopRows: 1,
    })

    const buf = buildWorkbook(
      [{ name: 'Audit Trail', ws }],
      {
        title: `Audit Trail - ${tableName}`,
        author: 'Lexora',
        subject: `Audit trail export for ${tableName}`,
      }
    )

    return xlsxResponse(buf, `${filename}.xlsx`)
  } catch (error) {
    console.error('Audit export error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to export audit trail', details: errorMessage },
      { status: 500 }
    )
  }
}
