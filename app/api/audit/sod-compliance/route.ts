import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/audit/sod-compliance
 *
 * Check Separation of Duties (SOD) compliance for transactions
 *
 * Query parameters:
 * - transaction_type (required): Type of transaction (invoice_create, invoice_approve, payment_approve, gl_entry, payroll)
 * - table_name (optional): Table to check (ecritures_comptables_v2, factures, bulletins_paie)
 * - user_role (optional): User role to check permission for
 * - amount_mur (optional): Transaction amount in MUR to validate
 * - check_violations (optional): true to scan for SOD violations in the table
 *
 * Response: SOD compliance status and rules
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Check authorization - admins and comptables can view
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const userRole = profile?.role
  if (!userRole || !['admin', 'comptable', 'comptable_dedie'].includes(userRole)) {
    return NextResponse.json(
      { error: 'Only admins and comptables can access SOD compliance' },
      { status: 403 }
    )
  }

  // Parse query parameters
  const url = new URL(request.url)
  const transactionType = url.searchParams.get('transaction_type')
  const tableName = url.searchParams.get('table_name')
  const checkUserRole = url.searchParams.get('user_role')
  const amountMur = url.searchParams.get('amount_mur')
  const checkViolations = url.searchParams.get('check_violations') === 'true'

  if (!transactionType) {
    return NextResponse.json(
      { error: 'Missing required parameter: transaction_type' },
      { status: 400 }
    )
  }

  // Get SOD matrix entry for this transaction type
  const { data: sodRules, error: sodError } = await supabase
    .from('sod_matrix')
    .select('*')
    .eq('transaction_type', transactionType)

  if (sodError) {
    console.error('SOD matrix query error:', sodError)
    return NextResponse.json(
      { error: 'Failed to retrieve SOD rules', details: sodError.message },
      { status: 500 }
    )
  }

  let complianceStatus = {
    transaction_type: transactionType,
    rules: sodRules,
    user_compliance: null as any,
    violations: null as any
  }

  // Check user role compliance if provided
  if (checkUserRole && amountMur) {
    const amount = parseFloat(amountMur)
    const userRule = sodRules.find(rule => rule.role === checkUserRole)

    if (!userRule) {
      complianceStatus.user_compliance = {
        role: checkUserRole,
        can_perform: false,
        reason: 'Role not found in SOD matrix'
      }
    } else if (userRule.max_amount_mur && amount > userRule.max_amount_mur) {
      complianceStatus.user_compliance = {
        role: checkUserRole,
        can_perform: false,
        requires_approval: userRule.requires_approval,
        approver_role: userRule.approver_role,
        reason: `Amount (${amount} MUR) exceeds user limit (${userRule.max_amount_mur} MUR)`
      }
    } else {
      complianceStatus.user_compliance = {
        role: checkUserRole,
        can_perform: true,
        requires_approval: userRule.requires_approval,
        approver_role: userRule.approver_role,
        reason: 'User authorized for this transaction'
      }
    }
  }

  // Check for SOD violations in the specified table
  if (checkViolations && tableName) {
    try {
      let violations = []

      if (tableName === 'ecritures_comptables_v2') {
        const { data: violatingEntries } = await supabase
          .from('ecritures_comptables_v2')
          .select('id, numero_compte, description, debit_mur, credit_mur, created_by, approved_by, approval_status, created_at')
          .gt('debit_mur', 10000)
          .eq('approval_status', 'approved')

        violations = violatingEntries
          ?.filter(entry => entry.created_by === entry.approved_by)
          .map(entry => ({
            id: entry.id,
            type: 'GL Entry',
            account: entry.numero_compte,
            description: entry.description,
            amount: entry.debit_mur || entry.credit_mur,
            created_by: entry.created_by,
            approved_by: entry.approved_by,
            violation: 'Creator equals approver for high-value transaction',
            created_at: entry.created_at
          })) || []
      }

      if (tableName === 'factures') {
        const { data: violatingInvoices } = await supabase
          .from('factures')
          .select('id, numero_facture, montant_mur, created_by, approved_by, approval_status, date_facture')
          .gt('montant_mur', 10000)
          .eq('approval_status', 'approved')

        violations = violatingInvoices
          ?.filter(invoice => invoice.created_by === invoice.approved_by)
          .map(invoice => ({
            id: invoice.id,
            type: 'Invoice',
            number: invoice.numero_facture,
            amount: invoice.montant_mur,
            created_by: invoice.created_by,
            approved_by: invoice.approved_by,
            violation: 'Creator equals approver for high-value transaction',
            created_at: invoice.date_facture
          })) || []
      }

      if (tableName === 'bulletins_paie') {
        const { data: violatingPayroll } = await supabase
          .from('bulletins_paie')
          .select('id, periode, salaire_net, created_by, approved_by, approval_status, created_at')
          .gt('salaire_net', 10000)
          .eq('approval_status', 'approved')

        violations = violatingPayroll
          ?.filter(payroll => payroll.created_by === payroll.approved_by)
          .map(payroll => ({
            id: payroll.id,
            type: 'Payroll',
            period: payroll.periode,
            amount: payroll.salaire_net,
            created_by: payroll.created_by,
            approved_by: payroll.approved_by,
            violation: 'Creator equals approver for high-value transaction',
            created_at: payroll.created_at
          })) || []
      }

      complianceStatus.violations = {
        table: tableName,
        total_violations: violations.length,
        records: violations
      }
    } catch (err) {
      console.error('Violation check error:', err)
      complianceStatus.violations = {
        error: 'Failed to check for violations'
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: complianceStatus
  })
}
