/**
 * Résolution du compte Nylas connecté d'un utilisateur (grant_id déchiffré).
 * Mutualisé entre l'envoi, la lecture de la boîte et l'agent IA.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/crypto/symmetric'

export type NylasAccount = {
  id: string
  account_email: string
  grantId: string
  societe_id: string | null
}

/**
 * Renvoie un compte Nylas actif de l'utilisateur, avec le grant_id déchiffré.
 * Priorité : accountId explicite > compte de la société active > premier compte.
 * null si aucun.
 */
export async function resolveNylasAccount(
  admin: SupabaseClient,
  userId: string,
  societeId?: string | null,
  accountId?: string | null,
): Promise<NylasAccount | null> {
  const { data: accounts } = await admin
    .from('user_oauth_accounts')
    .select('id, account_email, access_token_enc, societe_id')
    .eq('user_id', userId)
    .eq('provider', 'nylas')
    .eq('active', true)
  if (!accounts || accounts.length === 0) return null

  const list = accounts as Array<{ id: string; account_email: string; access_token_enc: string | null; societe_id: string | null }>
  const chosen = (accountId && list.find((a) => a.id === accountId))
    || (societeId && list.find((a) => a.societe_id === societeId))
    || list[0]
  if (!chosen?.access_token_enc) return null

  try {
    return {
      id: chosen.id,
      account_email: chosen.account_email,
      grantId: decryptSecret(chosen.access_token_enc),
      societe_id: chosen.societe_id,
    }
  } catch {
    return null
  }
}
