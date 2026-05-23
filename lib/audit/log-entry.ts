/**
 * Audit Log Entry Utilities
 *
 * Helpers for creating audit log entries from the application layer.
 * (Note: Database triggers handle automatic logging on table changes)
 *
 * Use these functions to log custom actions like:
 * - Manual approvals/rejections
 * - Exports and reports
 * - Login/logout events
 * - Corrections and reversals
 */

import { SupabaseClient } from '@supabase/supabase-js'

export interface LogAuditEntryInput {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'READ' | 'EXPORT' | 'LOGIN' | 'LOGOUT' | 'APPROVE' | 'REJECT'
  table_name: string
  row_id?: string
  old_values?: Record<string, any>
  new_values?: Record<string, any>
  description?: string
  ip_address?: string
  user_agent?: string
}

/**
 * Create a manual audit log entry.
 *
 * Used for actions not automatically captured by database triggers.
 *
 * @param supabase Supabase client
 * @param input Audit entry data
 * @returns true if successful, false otherwise
 *
 * Example:
 * ```ts
 * await logAuditEntry(supabase, {
 *   action: 'APPROVE',
 *   table_name: 'factures',
 *   row_id: invoiceId,
 *   description: 'Invoice approved by manager',
 * })
 * ```
 */
export async function logAuditEntry(
  supabase: SupabaseClient,
  input: LogAuditEntryInput,
  userId?: string,
  userEmail?: string,
  userRole?: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.from('audit_trail').insert({
      action: input.action,
      table_name: input.table_name,
      row_id: input.row_id,
      old_values: input.old_values,
      new_values: input.new_values,
      description: input.description,
      ip_address: input.ip_address,
      user_agent: input.user_agent,
      user_id: userId,
      user_email: userEmail,
      user_role: userRole,
      timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.error('Failed to log audit entry:', error)
      return false
    }

    return true
  } catch (err) {
    console.error('Error logging audit entry:', err)
    return false
  }
}

/**
 * Log an approval action with before/after state.
 *
 * @example
 * ```ts
 * await logApproval(supabase, {
 *   table_name: 'factures',
 *   row_id: invoiceId,
 *   approved_by: userId,
 *   status: 'approved',
 *   comment: 'Invoice verified and approved',
 *   amount: 5000
 * })
 * ```
 */
export async function logApproval(
  supabase: SupabaseClient,
  options: {
    table_name: string
    row_id: string
    approved_by: string
    status: 'approved' | 'rejected'
    comment?: string
    amount?: number
  },
  userId?: string,
  userEmail?: string,
  userRole?: string
) {
  return logAuditEntry(
    supabase,
    {
      action: options.status === 'approved' ? 'APPROVE' : 'REJECT',
      table_name: options.table_name,
      row_id: options.row_id,
      new_values: {
        approval_status: options.status,
        approved_by: options.approved_by,
        approval_date: new Date().toISOString(),
        ...(options.amount && { amount: options.amount }),
      },
      description: `${options.status === 'approved' ? 'Approved' : 'Rejected'}: ${options.comment || ''}`,
    },
    userId,
    userEmail,
    userRole
  )
}

/**
 * Log an export action (for audit trail of who exported what data).
 *
 * @example
 * ```ts
 * await logExport(supabase, {
 *   table_name: 'ecritures_comptables_v2',
 *   format: 'csv',
 *   row_count: 250,
 *   filters: { date_range: '2025-01-01 to 2025-12-31' }
 * })
 * ```
 */
export async function logExport(
  supabase: SupabaseClient,
  options: {
    table_name: string
    format: 'csv' | 'excel' | 'pdf'
    row_count: number
    filters?: Record<string, any>
  },
  userId?: string,
  userEmail?: string,
  userRole?: string
) {
  return logAuditEntry(
    supabase,
    {
      action: 'EXPORT',
      table_name: options.table_name,
      new_values: {
        export_format: options.format,
        row_count: options.row_count,
        filters: options.filters,
        exported_at: new Date().toISOString(),
      },
      description: `Exported ${options.row_count} rows from ${options.table_name} as ${options.format}`,
    },
    userId,
    userEmail,
    userRole
  )
}

/**
 * Log an authentication event.
 *
 * @example
 * ```ts
 * await logAuthEvent(supabase, {
 *   event: 'login',
 *   success: true,
 *   ip_address: '192.168.1.1',
 *   user_agent: 'Mozilla/5.0...'
 * })
 * ```
 */
export async function logAuthEvent(
  supabase: SupabaseClient,
  options: {
    event: 'login' | 'logout' | 'login_failed'
    success: boolean
    ip_address?: string
    user_agent?: string
    reason?: string
  },
  userId?: string,
  userEmail?: string
) {
  const actionMap = {
    login: 'LOGIN',
    logout: 'LOGOUT',
    login_failed: 'LOGIN',
  } as const

  return logAuditEntry(
    supabase,
    {
      action: actionMap[options.event],
      table_name: 'auth_events',
      new_values: {
        event: options.event,
        success: options.success,
        timestamp: new Date().toISOString(),
        ...(options.reason && { reason: options.reason }),
      },
      description: `User ${options.event}: ${options.success ? 'success' : 'failed'}${options.reason ? ` (${options.reason})` : ''}`,
      ip_address: options.ip_address,
      user_agent: options.user_agent,
    },
    userId,
    userEmail,
    'user'
  )
}

/**
 * Extract IP address and user agent from request headers.
 *
 * @example
 * ```ts
 * const { ip, userAgent } = extractRequestInfo(request)
 * await logAuditEntry(supabase, entry, userId, userEmail, userRole, ip, userAgent)
 * ```
 */
export function extractRequestInfo(request: Request): {
  ip: string | null
  userAgent: string | null
} {
  const ip =
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    null

  const userAgent = request.headers.get('user-agent')

  return {
    ip,
    userAgent,
  }
}

/**
 * Compare old and new values to extract only changed fields.
 *
 * @example
 * ```ts
 * const changes = extractChanges(oldRecord, newRecord)
 * // { numero_compte: { old: '512100', new: '455' } }
 * ```
 */
export function extractChanges(
  oldValues: Record<string, any>,
  newValues: Record<string, any>
): Record<string, { old: any; new: any }> {
  const changes: Record<string, { old: any; new: any }> = {}

  const allKeys = [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])]

  for (const key of allKeys) {
    if (JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])) {
      changes[key] = {
        old: oldValues[key],
        new: newValues[key],
      }
    }
  }

  return changes
}

/**
 * Build a human-readable description of changes.
 *
 * @example
 * ```ts
 * const desc = buildChangeDescription('factures', changes)
 * // "Updated amount from 5000 to 5500 MUR, status from draft to approved"
 * ```
 */
export function buildChangeDescription(
  tableName: string,
  changes: Record<string, { old: any; new: any }>
): string {
  const fieldDescriptions: string[] = []

  const fieldLabels: Record<string, string> = {
    numero_compte: 'account number',
    numero_facture: 'invoice number',
    montant_mur: 'amount',
    debit_mur: 'debit',
    credit_mur: 'credit',
    description: 'description',
    approval_status: 'status',
    salaire_net: 'net salary',
  }

  for (const [field, { old: oldVal, new: newVal }] of Object.entries(changes)) {
    const label = fieldLabels[field] || field
    fieldDescriptions.push(`${label} from ${oldVal} to ${newVal}`)
  }

  if (fieldDescriptions.length === 0) {
    return `Updated record in ${tableName}`
  }

  return `Updated ${fieldDescriptions.join(', ')}`
}
