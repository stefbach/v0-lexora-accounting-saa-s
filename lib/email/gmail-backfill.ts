/**
 * Backfill auto-réparant : tout compte Google connecté (table
 * `user_oauth_accounts`) qui possède le scope `gmail.send` doit être
 * utilisable comme boîte d'envoi (`email_accounts`, provider `gmail_oauth`).
 *
 * Pourquoi : la création de la ligne `email_accounts` se fait normalement au
 * callback OAuth (cf. app/api/auth/google/callback). Mais si la société n'était
 * pas encore liée à cet instant, ou si le compte a été connecté avant l'ajout
 * du scope Gmail, la ligne peut manquer → l'agent Telegram (qui lit
 * `email_accounts`) ne « voit » pas le Gmail pourtant connecté.
 *
 * Ce helper, appelé en lecture avant de lister/envoyer, crée idempotemment la
 * ligne manquante. Aucun token n'est dupliqué : la ligne gmail_oauth pointe
 * vers `user_oauth_accounts` via (user_id, from_email) et l'envoi réel passe
 * par lib/google/gmail-client → getGoogleAccessToken.
 */
import { getAdminClient } from '@/lib/supabase/admin'

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'

/**
 * S'assure que chaque compte Google de l'utilisateur disposant du scope
 * `gmail.send` a une ligne `email_accounts` (provider gmail_oauth) dans la
 * société active. Best-effort : n'émet jamais d'exception (logge seulement).
 *
 * @returns le nombre de comptes email Gmail créés (0 si tout existait déjà).
 */
export async function ensureGmailEmailAccounts(
  user_id: string,
  societe_id: string,
): Promise<number> {
  if (!user_id || !societe_id) return 0
  try {
    const admin = getAdminClient()

    // Comptes Google actifs de l'user avec le scope gmail.send
    const { data: googleAccounts } = await admin
      .from('user_oauth_accounts')
      .select('account_email, label, scopes')
      .eq('user_id', user_id)
      .eq('provider', 'google')
      .eq('active', true)
      .contains('scopes', [GMAIL_SEND_SCOPE])

    if (!googleAccounts || googleAccounts.length === 0) return 0

    let created = 0
    for (const g of googleAccounts as any[]) {
      const email = String(g.account_email || '').toLowerCase()
      if (!email) continue

      // Existe déjà dans cette société ?
      const { data: existing } = await admin
        .from('email_accounts')
        .select('id')
        .eq('societe_id', societe_id)
        .eq('user_id', user_id)
        .eq('provider', 'gmail_oauth')
        .ilike('from_email', email)
        .maybeSingle()
      if (existing) continue

      // Premier compte email perso de l'user dans cette société → défaut
      const { count } = await admin
        .from('email_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('societe_id', societe_id)
        .eq('user_id', user_id)
        .eq('active', true)

      const payload: any = {
        societe_id,
        user_id,
        provider: 'gmail_oauth',
        label: g.label ? `Gmail — ${g.label}` : `Gmail — ${g.account_email}`,
        from_email: g.account_email,
        from_name: g.label || null,
        active: true,
      }
      if ((count || 0) === 0) payload.is_default_for_user = true

      const { error } = await admin.from('email_accounts').insert(payload)
      if (!error) created++
    }
    return created
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('[gmail-backfill] ensureGmailEmailAccounts:', e?.message || e)
    return 0
  }
}
