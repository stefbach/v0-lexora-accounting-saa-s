import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { selectEmailAccount, sendEmail, sendEmailFallbackResend } from '@/lib/email/router'

/**
 * Envoi d'un email rédigé via l'Assistant de rédaction.
 *
 * Réutilise le routeur email multi-provider (lib/email/router) :
 *   compte explicite > défaut user > défaut société > fast-path Gmail OAuth
 *   > fallback Resend global.
 *
 * Body : { societe_id, to, subject, body, account_id?, cc?, reply_to? }
 *   - `body` = texte brut avec gras **double astérisque** (converti en HTML).
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Convertit le texte (gras **…** + sauts de ligne) en HTML email simple. */
function toEmailHtml(body: string): string {
  const safe = escapeHtml(body)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap">${safe}</div>`
}

/** Version texte brut : retire les marqueurs de gras. */
function toPlain(body: string): string {
  return body.replace(/\*\*(.+?)\*\*/g, '$1')
}

export async function POST(req: NextRequest) {
  try {
    const user = await resolveUserAuth(req)
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const b = await req.json().catch(() => null)
    if (!b) return NextResponse.json({ error: 'Format de la requête invalide' }, { status: 400 })

    const societe_id = String(b.societe_id || '').trim()
    const to = String(b.to || '').trim().toLowerCase()
    const subject = String(b.subject || '').trim()
    const body = String(b.body || '')
    const account_id = b.account_id ? String(b.account_id) : null
    const cc = Array.isArray(b.cc) ? b.cc.filter((x: unknown) => typeof x === 'string') : undefined
    const reply_to = b.reply_to ? String(b.reply_to) : undefined

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!EMAIL_RE.test(to)) return NextResponse.json({ error: 'Adresse destinataire invalide' }, { status: 400 })
    if (!subject) return NextResponse.json({ error: "L'objet est requis" }, { status: 400 })
    if (!body.trim()) return NextResponse.json({ error: 'Le corps du message est vide' }, { status: 400 })

    // Contrôle d'accès : l'user doit avoir accès à la société émettrice.
    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    const html = toEmailHtml(body)
    const text = toPlain(body)
    const msg = { to: [to], cc, subject, html, text, reply_to }

    // Sélection du compte email de la société (ou compte explicite).
    const account = await selectEmailAccount({ societe_id, user_id: user.id, account_id })

    // Fast-path Gmail OAuth : compte Google avec scope gmail.send connecté mais
    // pas (encore) de ligne email_accounts pour la société active.
    const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
    let gmailFastPath: { from_email: string; from_name: string | null } | null = null
    if (!account) {
      const { data: gAccounts } = await admin
        .from('user_oauth_accounts')
        .select('account_email, label')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .eq('active', true)
        .contains('scopes', [GMAIL_SCOPE])
        .limit(1)
      const g = (gAccounts || [])[0] as { account_email?: string; label?: string } | undefined
      if (g?.account_email) gmailFastPath = { from_email: g.account_email, from_name: g.label || null }
    }

    let result: { ok: boolean; message_id?: string; account_id?: string; provider?: string; error?: string }
    if (account) {
      result = await sendEmail(account, msg)
    } else if (gmailFastPath) {
      try {
        const { sendGmail } = await import('@/lib/google/gmail-client')
        const { message_id } = await sendGmail(user.id, {
          from_email: gmailFastPath.from_email,
          from_name: gmailFastPath.from_name,
          to: [to], cc, bcc: undefined, subject, html, text, reply_to,
        })
        result = { ok: true, message_id, provider: 'gmail_oauth' }
      } catch (e: unknown) {
        result = { ok: false, error: e instanceof Error ? e.message : 'Échec envoi Gmail', provider: 'gmail_oauth' }
      }
    } else {
      result = await sendEmailFallbackResend(msg)
    }

    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Envoi échoué' }, { status: 502 })
    }
    return NextResponse.json({ ok: true, message_id: result.message_id, provider: result.provider })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erreur'
    // assertSocieteAccess lève une erreur d'accès → 403
    const status = /access|accès|forbidden|autoris/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
