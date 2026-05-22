import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  queryAuditTrail,
  getRecordWithAuditTrail,
  formatAuditForCsv,
  csvStringify,
  type AuditQueryOptions,
} from '@/lib/audit/query-builder'
import { buildWorkbook, aoaSheet, cell, header, FMT_DATE, xlsxResponse, fmtMUR } from '@/lib/export/xlsx-helpers'

/**
 * GET /api/audit/trail
 *
 * Query audit trail for a specific record or user activity
 *
 * Query parameters:
 * - table_name (required): Table name to audit (e.g., 'ecritures_comptables_v2', 'factures')
 * - row_id (optional): Specific record UUID to trace
 * - user_id (optional): User whose actions to audit
 * - user_email (optional): Filter by user email
 * - start_date (optional): ISO 8601 start date
 * - end_date (optional): ISO 8601 end date
 * - action (optional): Filter by action type (CREATE, UPDATE, DELETE, READ, EXPORT, etc.)
 * - description_search (optional): Full-text search in descriptions
 * - field_name (optional): Filter by changed field (e.g., 'numero_compte')
 * - limit (optional): Number of records (default 100, max 1000)
 * - offset (optional): Pagination offset (default 0)
 * - format (optional): Export format (json, csv, excel) - default json
 * - include_record (optional): For single row_id, include current record data
 *
 * Response: Audit trail entries with pagination or export file
 *
 * IMMUTABILITY: Audit logs are append-only. Database triggers prevent UPDATE/DELETE.
 *
 * PERFORMANCE:
 * - Queries use partition by timestamp (monthly partitions)
 * - Indexes: (table_name, row_id, timestamp), (user_id), (action)
 * - Target: <500ms for typical queries
 *
 * SECURITY:
 * - Admin-only access (enforced at database level via RLS)
 * - Rate limited: 100 requests/minute
 * - Row-level security for record access
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Check authorization - only admins can view audit trail
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // Admin or auditor can access
  const userRole = profile?.role
  if (!userRole || !['admin', 'auditor'].includes(userRole)) {
    return NextResponse.json(
      { error: 'Only admins and auditors can access audit trail' },
      { status: 403 }
    )
  }

  // Parse query parameters
  const url = new URL(request.url)
  const tableName = url.searchParams.get('table_name')
  const rowId = url.searchParams.get('row_id')
  const userId = url.searchParams.get('user_id')
  const userEmail = url.searchParams.get('user_email')
  const startDate = url.searchParams.get('start_date')
  const endDate = url.searchParams.get('end_date')
  const action = url.searchParams.get('action')
  const descriptionSearch = url.searchParams.get('description_search')
  const fieldName = url.searchParams.get('field_name')
  const format = (url.searchParams.get('format') || 'json').toLowerCase()
  const includeRecord = url.searchParams.get('include_record') === 'true'
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000)
  const offset = parseInt(url.searchParams.get('offset') || '0')

  // Validate required parameters
  if (!tableName) {
    return NextResponse.json(
      { error: 'Missing required parameter: table_name' },
      { status: 400 }
    )
  }

  // Validate format
  if (!['json', 'csv', 'excel'].includes(format)) {
    return NextResponse.json(
      { error: 'Invalid format. Must be json, csv, or excel' },
      { status: 400 }
    )
  }

  try {
    // Build query options
    const queryOptions: AuditQueryOptions = {
      table_name: tableName,
      row_id: rowId || undefined,
      user_id: userId || undefined,
      user_email: userEmail || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      action: action || undefined,
      description_search: descriptionSearch || undefined,
      field_name: fieldName || undefined,
      limit,
      offset,
    }

    // Execute query
    const result = await queryAuditTrail(supabase, queryOptions)

    // If single row_id requested with include_record, fetch current values
    let recordData = null
    if (rowId && includeRecord) {
      try {
        const fullRecord = await getRecordWithAuditTrail(supabase, tableName, rowId)
        recordData = fullRecord?.record
      } catch (err) {
        console.warn('Failed to fetch record data:', err)
      }
    }

    // Format response based on requested format
    if (format === 'csv') {
      const csvRows = formatAuditForCsv(result.entries)
      const csvContent = csvStringify(csvRows)
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv;charset=utf-8',
          'Content-Disposition': `attachment; filename="audit-trail-${tableName}-${new Date().toISOString().split('T')[0]}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    if (format === 'excel') {
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
          subject: `Audit trail for ${tableName}`,
        }
      )

      return xlsxResponse(
        buf,
        `audit-trail-${tableName}-${new Date().toISOString().split('T')[0]}.xlsx`
      )
    }

    // Default: JSON response
    const response: any = {
      success: true,
      data: result.entries,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        returned: result.returned,
      },
      query: {
        table_name: tableName,
        row_id: rowId,
        user_id: userId,
        user_email: userEmail,
        start_date: startDate,
        end_date: endDate,
        action: action,
        description_search: descriptionSearch,
        field_name: fieldName,
      },
    }

    if (recordData) {
      response.record = recordData
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Audit trail query error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to retrieve audit trail', details: errorMessage },
      { status: 500 }
    )
  }
}
