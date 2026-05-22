/**
 * MRA credentials vault - securely retrieves encrypted credentials from database.
 * All credentials are encrypted at rest in Supabase and decrypted server-side only.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/crypto/symmetric'

export interface MRACredentials {
  ebs_id?: string
  api_key?: string
  username?: string
  password?: string
  tan?: string
  environment?: string
}

/**
 * Retrieves and decrypts MRA credentials for a société.
 * Only callable from server-side with admin client.
 * Never returns plaintext without explicit request.
 */
export async function getMRACredentials(
  adminClient: SupabaseClient,
  societeId: string,
  options?: { decrypted?: boolean }
): Promise<MRACredentials | null> {
  const shouldDecrypt = options?.decrypted ?? true

  const { data: creds } = await adminClient
    .from('societe_mra_credentials')
    .select('mra_username, mra_password_enc, mra_tan_enc, mra_api_key_enc, active')
    .eq('societe_id', societeId)
    .eq('active', true)
    .maybeSingle()

  if (!creds) return null

  if (!shouldDecrypt) {
    return {
      username: creds.mra_username || undefined,
      environment: 'sandbox', // default, can be overridden from societes table
    }
  }

  const result: MRACredentials = {
    username: creds.mra_username || undefined,
    environment: 'sandbox',
  }

  try {
    if (creds.mra_password_enc) {
      result.password = decryptSecret(creds.mra_password_enc)
    }
    if (creds.mra_tan_enc) {
      result.tan = decryptSecret(creds.mra_tan_enc)
    }
    if (creds.mra_api_key_enc) {
      result.api_key = decryptSecret(creds.mra_api_key_enc)
    }
  } catch (e) {
    console.error('[getMRACredentials] Decryption failed:', e instanceof Error ? e.message : e)
    throw new Error('Failed to decrypt MRA credentials. Check CRYPT_KEY configuration.')
  }

  return result
}

/**
 * Get only the MRA API key for fiscalisation.
 * Returns null if not configured.
 */
export async function getMRAApiKey(
  adminClient: SupabaseClient,
  societeId: string
): Promise<string | null> {
  const creds = await getMRACredentials(adminClient, societeId, { decrypted: true })
  return creds?.api_key || null
}

/**
 * Check if a société has MRA credentials configured.
 */
export async function hasMRACredentials(
  adminClient: SupabaseClient,
  societeId: string
): Promise<boolean> {
  const { data: creds } = await adminClient
    .from('societe_mra_credentials')
    .select('id')
    .eq('societe_id', societeId)
    .eq('active', true)
    .maybeSingle()

  return !!creds
}
