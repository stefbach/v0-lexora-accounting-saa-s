import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/audit/trail
 *
 * Query audit trail for a specific record or user activity
 *
 * Query parameters:
 * - table_name (required): Table name to audit (e.g., 'ecritures_comptables_v2', 'factures')
 * - row_id (optional): Specific record UUID to trace
 * - user_id (optional): User whose actions to audit
 * - start_date (optional): ISO 8601 start date
 * - end_date (optional): ISO 8601 end date
 * - action (optional): Filter by action type (CREATE, UPDATE, DELETE, READ, EXPORT, etc.)
 * - limit (optional): Number of records (default 100, max 1000)
 * - offset (optional): Pagination offset (default 0)
 *
 * Response: Array of audit trail entries with full change history
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

  if (profile?.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only admins can access audit trail' },
      { status: 403 }
    )
  }

  // Parse query parameters
  const url = new URL(request.url)
  const tableName = url.searchParams.get('table_name')
  const rowId = url.searchParams.get('row_id')
  const userId = url.searchParams.get('user_id')
  const startDate = url.searchParams.get('start_date')
  const endDate = url.searchParams.get('end_date')
  const action = url.searchParams.get('action')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000)
  const offset = parseInt(url.searchParams.get('offset') || '0')

  // Validate required parameters
  if (!tableName) {
    return NextResponse.json(
      { error: 'Missing required parameter: table_name' },
      { status: 400 }
    )
  }

  // Build query
  let query = supabase
    .from('audit_trail')
    .select('id, timestamp, user_email, user_role, action, old_values, new_values, description', {
      count: 'exact'
    })
    .eq('table_name', tableName)
    .order('timestamp', { ascending: false })
    .range(offset, offset + limit - 1)

  // Apply optional filters
  if (rowId) {
    query = query.eq('row_id', rowId)
  }

  if (userId) {
    query = query.eq('user_id', userId)
  }

  if (action) {
    query = query.eq('action', action)
  }

  if (startDate) {
    query = query.gte('timestamp', startDate)
  }

  if (endDate) {
    query = query.lte('timestamp', endDate)
  }

  const { data: auditTrail, error, count } = await query

  if (error) {
    console.error('Audit trail query error:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve audit trail', details: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    data: auditTrail,
    pagination: {
      total: count,
      limit,
      offset,
      returned: auditTrail?.length || 0
    },
    query: {
      table_name: tableName,
      row_id: rowId,
      user_id: userId,
      start_date: startDate,
      end_date: endDate,
      action: action
    }
  })
}
