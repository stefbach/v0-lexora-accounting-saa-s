/**
 * Envoi d'email via un compte Aurinko connecté (Gmail/Outlook/iCloud/IMAP).
 * Sélection : compte du même utilisateur, priorité au compte rattaché à la
 * société active. Renvoie null si aucun compte Aurinko n'est connecté → le
 * caller retombe sur sa logique existante (compte email / Resend).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/crypto/symmetric'
import { sendAurinkoEmail, isAurinkoConfigured, type AurinkoEmailMessage } from './client'

export type AurinkoSendResult = { ok: boolean; message_id?: string; provider: 'aurinko'; account_email?: string; error?: string }

export async function trySendViaAurinko(
  admin: SupabaseClient,
  args: { user_id: string; societe_id?: string | null; msg: AurinkoEmailMessage },
): Promise<AurinkoSendResult | null> {
  if (!isAurinkoConfigured()) return null

  // Compte Aurinko actif de l'utilisateur ; priorité société active.
  const { data: accounts } = await admin
    .from('user_oauth_accounts')
    .select('id, account_email, access_token_enc, societe_id')
    .eq('user_id', args.user_id)
    .eq('provider', 'aurinko')
    .eq('active', true)
  if (!accounts || accounts.length === 0) return null

  const list = accounts as Array<{ id: string; account_email: string; access_token_enc: string | null; societe_id: string | null }>
  const chosen =
    (args.societe_id && list.find((a) => a.societe_id === args.societe_id)) ||
    list[0]
  if (!chosen?.access_token_enc) return null

  try {
    const token = decryptSecret(chosen.access_token_enc)
    const r = await sendAurinkoEmail(token, args.msg)
    return { ok: r.ok, message_id: r.message_id, provider: 'aurinko', account_email: chosen.account_email, error: r.error }
  } catch (e) {
    return { ok: false, provider: 'aurinko', account_email: chosen.account_email, error: e instanceof Error ? e.message : 'Aurinko send error' }
  }
}
