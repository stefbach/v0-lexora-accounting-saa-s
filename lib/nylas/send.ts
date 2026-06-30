/**
 * Envoi d'email via un compte Nylas connecté. Renvoie null si aucun compte
 * Nylas n'est connecté → le caller retombe sur sa logique existante.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/crypto/symmetric'
import { sendNylasEmail, isNylasConfigured, type NylasEmailMessage } from './client'

export type NylasSendResult = { ok: boolean; message_id?: string; provider: 'nylas'; account_email?: string; error?: string }

export async function trySendViaNylas(
  admin: SupabaseClient,
  args: { user_id: string; societe_id?: string | null; account_id?: string | null; msg: NylasEmailMessage },
): Promise<NylasSendResult | null> {
  if (!isNylasConfigured()) return null

  const { data: accounts } = await admin
    .from('user_oauth_accounts')
    .select('id, account_email, access_token_enc, societe_id')
    .eq('user_id', args.user_id)
    .eq('provider', 'nylas')
    .eq('active', true)
  if (!accounts || accounts.length === 0) return null

  const list = accounts as Array<{ id: string; account_email: string; access_token_enc: string | null; societe_id: string | null }>
  const chosen = (args.account_id && list.find((a) => a.id === args.account_id))
    || (args.societe_id && list.find((a) => a.societe_id === args.societe_id))
    || list[0]
  if (!chosen?.access_token_enc) return null

  try {
    const grantId = decryptSecret(chosen.access_token_enc)
    const r = await sendNylasEmail(grantId, args.msg)
    return { ok: r.ok, message_id: r.message_id, provider: 'nylas', account_email: chosen.account_email, error: r.error }
  } catch (e) {
    return { ok: false, provider: 'nylas', account_email: chosen.account_email, error: e instanceof Error ? e.message : 'Nylas send error' }
  }
}
