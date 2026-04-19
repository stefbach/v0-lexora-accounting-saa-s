import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const SALT = 'lexora-pii-v1'

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const secret = process.env.PII_ENCRYPTION_KEY
  if (!secret) {
    throw new Error('PII_ENCRYPTION_KEY environment variable is not set. Required for NIC/NPF/IBAN encryption.')
  }
  if (secret.length < 32) {
    throw new Error('PII_ENCRYPTION_KEY must be at least 32 characters long.')
  }
  cachedKey = scryptSync(secret, SALT, 32)
  return cachedKey
}

/**
 * Encrypts a plaintext PII string.
 * Returns a base64 string in the format: "v1:{iv_base64}:{authTag_base64}:{ciphertext_base64}"
 * Empty or null values are returned as-is (no encryption needed).
 */
export function encryptPii(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === '') return null
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`
}

/**
 * Decrypts a ciphertext previously produced by encryptPii.
 * Returns null if input is null or not in the expected format.
 * Throws if decryption fails (tampered data or wrong key).
 */
export function decryptPii(ciphertext: string | null | undefined): string | null {
  if (ciphertext == null || ciphertext === '') return null
  if (!ciphertext.startsWith('v1:')) {
    // Legacy plaintext value — return as-is (for backward compat during migration)
    return ciphertext
  }
  const parts = ciphertext.split(':')
  if (parts.length !== 4) return null
  const [, ivB64, authTagB64, cipherB64] = parts
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')
  const encrypted = Buffer.from(cipherB64, 'base64')
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

/** Masque une PII pour affichage UI (ex: "1234****1234") */
export function maskPii(plaintext: string | null | undefined, keepStart = 4, keepEnd = 4): string | null {
  if (plaintext == null || plaintext === '') return null
  const len = plaintext.length
  if (len <= keepStart + keepEnd) return '*'.repeat(len)
  return plaintext.slice(0, keepStart) + '*'.repeat(len - keepStart - keepEnd) + plaintext.slice(-keepEnd)
}

/** Vérifie si une valeur ressemble à un ciphertext */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('v1:') && value.split(':').length === 4
}
