/**
 * Employee password management for payslip access.
 * Passwords are hashed with bcrypt and stored separately from other employee data.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { hashPassword, verifyPassword } from '@/lib/crypto/password-hash'

/**
 * Set or update an employee's payslip password.
 * The password is hashed before storage.
 * Only callable from server-side.
 */
export async function setEmployeePayslipPassword(
  adminClient: SupabaseClient,
  employeId: string,
  plaintext: string,
): Promise<{ success: boolean; error?: string }> {
  if (!plaintext || plaintext.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters' }
  }

  try {
    const hash = await hashPassword(plaintext)
    const { error } = await adminClient
      .from('employes')
      .update({
        payslip_password_hash: hash,
        password_migration_status: 'hashed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', employeId)

    if (error) {
      return { success: false, error: error.message }
    }

    // Audit the password hash
    try {
      await adminClient.from('employe_password_audit').insert({
        employe_id: employeId,
        action: 'password_set',
      })
    } catch (auditErr) {
      console.warn('[setEmployeePayslipPassword] Failed to audit password change:', auditErr)
    }

    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return { success: false, error: `Password hashing failed: ${msg}` }
  }
}

/**
 * Verify an employee's payslip password.
 * Returns true if the password matches the stored hash.
 */
export async function verifyEmployeePayslipPassword(
  adminClient: SupabaseClient,
  employeId: string,
  plaintext: string,
): Promise<boolean> {
  if (!plaintext) return false

  try {
    const { data: employe } = await adminClient
      .from('employes')
      .select('payslip_password_hash')
      .eq('id', employeId)
      .maybeSingle()

    if (!employe?.payslip_password_hash) return false

    return await verifyPassword(plaintext, employe.payslip_password_hash)
  } catch (e) {
    console.error('[verifyEmployeePayslipPassword] Error:', e)
    return false
  }
}

/**
 * Check if an employee has a payslip password configured.
 */
export async function hasPayslipPassword(
  adminClient: SupabaseClient,
  employeId: string,
): Promise<boolean> {
  try {
    const { data: employe } = await adminClient
      .from('employes')
      .select('payslip_password_hash')
      .eq('id', employeId)
      .maybeSingle()

    return !!employe?.payslip_password_hash
  } catch (e) {
    return false
  }
}

/**
 * Migrate plaintext passwords to bcrypt hashes (batch operation for admin).
 * Should be run periodically or as part of deployment.
 */
export async function migrateEmployeePasswords(
  adminClient: SupabaseClient,
  limit: number = 100,
): Promise<{ migrated: number; errors: number }> {
  // Find employees with plaintext passwords and pending migration status
  const { data: empleados } = await adminClient
    .from('employes')
    .select('id, payslip_password')
    .eq('password_migration_status', 'pending')
    .not('payslip_password', 'is', null)
    .limit(limit)

  if (!empleados || empleados.length === 0) {
    return { migrated: 0, errors: 0 }
  }

  let migrated = 0
  let errors = 0

  for (const emp of empleados) {
    try {
      const hash = await hashPassword(emp.payslip_password as string)
      await adminClient
        .from('employes')
        .update({
          payslip_password_hash: hash,
          password_migration_status: 'hashed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', emp.id)

      migrated++
    } catch (e) {
      console.error(`Failed to migrate password for employee ${emp.id}:`, e)
      errors++
    }
  }

  return { migrated, errors }
}
