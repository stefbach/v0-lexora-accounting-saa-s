/**
 * Bcrypt password hashing for payslip and employee credentials.
 * Uses bcrypt with cost 12 for balance between security and performance.
 */
import bcrypt from 'bcrypt'

const BCRYPT_COST = 12

/**
 * Hash a plaintext password using bcrypt.
 * Safe to call with plaintext passwords; never passes them to external APIs.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  if (!plaintext) throw new Error('Password cannot be empty')
  return bcrypt.hash(plaintext, BCRYPT_COST)
}

/**
 * Verify a plaintext password against a bcrypt hash.
 * Returns true if the password matches, false otherwise.
 */
export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  if (!plaintext || !hash) return false
  try {
    return await bcrypt.compare(plaintext, hash)
  } catch (e) {
    return false
  }
}

/**
 * Mask a password for logging/display (shows first 2 and last 2 characters).
 */
export function maskPassword(password: string | null | undefined): string {
  if (!password || password.length <= 4) return '****'
  return password.slice(0, 2) + '••••' + password.slice(-2)
}
