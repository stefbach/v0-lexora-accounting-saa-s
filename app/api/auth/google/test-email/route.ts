import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { sendGmail } from '@/lib/google/gmail-client'
import { ensureGmailEmailAccounts } from '@/lib/email/gmail-backfill'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/auth/google/test-email
 *   body : { account_email? }
 *
 * Envoie un email de TEST depuis le compte Gmail connecté (scope gmail.send)
 * vers cette même adresse, pour valider la chaîne d'envoi de bout en bout
 * depuis la page /client/settings/google-accounts.
 *
 * Auth : session web (l'utilisateur doit être connecté).
 * Effet de bord utile : matérialise la boîte d'envoi (email_accounts gmail_oauth)
 * via ensureGmailEmailAccounts si elle manquait.
 */
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentification requise' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as any
  const wantedEmail = body?.account_email ? String(body.account_email).toLowerCase() : null

  const admin = getAdminClient()

  // Récupère un compte Google de l'user avec le scope gmail.send
  let q = admin
    .from('user_oauth_accounts')
    .select('account_email, societe_id, scopes')
    .eq('user_id', user.id)
    .eq('provider', 'google')
    .eq('active', true)
    .contains('scopes', [GMAIL_SEND_SCOPE])
  if (wantedEmail) q = q.ilike('account_email', wantedEmail)
  const { data: accounts } = await q.limit(1)

  const account = (accounts || [])[0] as any
  if (!account) {
    return NextResponse.json({
      error: 'Aucun compte Google avec autorisation d\'envoi Gmail (gmail.send). ' +
             'Reconnecte ton compte via « Reconnecter (+ Email) » pour accorder ce scope.',
    }, { status: 400 })
  }

  // Matérialise la boîte d'envoi pour la société liée (best-effort)
  if (account.societe_id) {
    await ensureGmailEmailAccounts(user.id, account.societe_id)
  }

  const to = account.account_email
  try {
    const { message_id } = await sendGmail(user.id, {
      from_email: account.account_email,
      from_name: user.email || null,
      to: [to],
      subject: '✅ Test d\'envoi Gmail — Lexora',
      html: `<p>Bonjour,</p>` +
            `<p>Ceci est un <strong>email de test</strong> envoyé par Lexora depuis ton compte Gmail <b>${account.account_email}</b>.</p>` +
            `<p>Si tu reçois ce message, l'envoi d'emails (web + agent Telegram) est <strong>opérationnel</strong> 🎉.</p>` +
            `<p style="color:#888;font-size:12px;">Envoyé le ${new Date().toLocaleString('fr-FR')} — scope gmail.send.</p>`,
      text: `Test d'envoi Gmail depuis ${account.account_email}. Si tu reçois ce message, l'envoi est opérationnel.`,
    })
    return NextResponse.json({
      ok: true,
      message_id,
      to,
      message: `Email de test envoyé à ${to}. Vérifie ta boîte de réception (et les spams).`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Échec de l\'envoi de test' }, { status: 500 })
  }
}
