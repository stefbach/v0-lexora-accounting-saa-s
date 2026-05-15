/**
 * Chiffrement symétrique AES-256-GCM pour les credentials sensibles (MRA, OAuth).
 * Clé : env CRYPT_KEY (32 bytes hex, soit 64 hex chars).
 *
 * Pour générer une clé :
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Format stocké : `${ivHex}:${authTagHex}:${cipherHex}` (3 segments).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.CRYPT_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('CRYPT_KEY env manquante ou invalide (attendu 64 hex chars = 32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return ''
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`
}

export function decryptSecret(encoded: string): string {
  if (!encoded) return ''
  const parts = encoded.split(':')
  if (parts.length !== 3) throw new Error('Format chiffré invalide')
  const [ivHex, tagHex, ctHex] = parts
  const key = getKey()
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const ct = Buffer.from(ctHex, 'hex')
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

export function maskSecret(s: string | null | undefined): string {
  if (!s) return ''
  if (s.length <= 4) return '****'
  return s.slice(0, 2) + '••••' + s.slice(-2)
}
