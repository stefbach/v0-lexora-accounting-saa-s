import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { selectEmailAccount, sendEmail, sendEmailFallbackResend } from '@/lib/email/router'
import { verifyHmac } from '@/lib/security/hmac-auth'

/**
 * POST /api/telegram/internal/email-send
 *
 * Tool agent — envoi d'un email via les comptes email_accounts configurés.
 * Rôle minimum : comptable.
 *
 * Body :
 *   - to            : string | string[] (max 5)
 *   - cc            : string[] (optionnel, max 3)
 *   - subject       : string
 *   - html          : string
 *   - text          : string (optionnel)
 *   - reply_to      : string (optionnel)
 *   - account_id    : string (optionnel — sélection compte explicite)
 *   - contact_id    : string | string[] (optionnel — IDs factures_contacts /
 *                     profiles / employes résolus via contacts.search ;
 *                     leurs emails sont ajoutés à `to` automatiquement et
 *                     court-circuitent la whitelist)
 *
 * Sélection compte : account_id > default user > default société > fallback Resend env.
 * Whitelist destinataires : factures_contacts ou profiles Lexora (anti-spam).
 */
const MAX_RECIPIENTS = 5
const MAX_CC = 3
const MAX_HTML = 50_000

function normalizeEmails(v: unknown): string[] {
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.map(x => String(x))
  return []
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function isWhitelisted(email: string, societe_id: string): Promise<boolean> {
  const admin = getAdminClient()
  const { data: c } = await admin.from('factures_contacts').select('id')
    .eq('societe_id', societe_id).eq('email', email.toLowerCase()).maybeSingle()
  if (c) return true
  const { data: p } = await admin.from('profiles').select('id').eq('email', email.toLowerCase()).maybeSingle()
  if (p) return true
  // Employés de la société (utile pour envoyer un message RH interne)
  const { data: e } = await admin.from('employes').select('id')
    .eq('societe_id', societe_id).ilike('email', email).maybeSingle()
  return !!e
}

/**
 * Résout des contact_id (factures_contacts, profiles ou employes) en emails.
 * Limite à la société active pour les contacts et employes ; les profiles
 * sont globaux mais leur résolution reste sûre (whitelist par défaut).
 *
 * Retourne { resolved: string[] (emails uniques bas-de-casse), warnings: string[] }
 */
async function resolveContactIds(
  contact_ids: string[],
  societe_id: string,
): Promise<{ resolved: string[]; warnings: string[] }> {
  if (contact_ids.length === 0) return { resolved: [], warnings: [] }
  const admin = getAdminClient()
  const resolved = new Set<string>()
  const warnings: string[] = []

  // factures_contacts (scope société)
  const { data: contacts } = await admin
    .from('factures_contacts')
    .select('id, email, nom, entreprise')
    .eq('societe_id', societe_id)
    .in('id', contact_ids)
  const foundContact = new Set((contacts as any[] | null)?.map(c => c.id) || [])
  for (const c of (contacts as any[]) || []) {
    if (c.email && EMAIL_RE.test(c.email)) resolved.add(c.email.toLowerCase())
    else warnings.push(`Contact "${c.entreprise || c.nom || c.id}" sans email valide`)
  }

  // profiles (global)
  const restAfterContacts = contact_ids.filter(id => !foundContact.has(id))
  if (restAfterContacts.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, email, full_name')
      .in('id', restAfterContacts)
    const foundProfile = new Set((profiles as any[] | null)?.map(p => p.id) || [])
    for (const p of (profiles as any[]) || []) {
      if (p.email && EMAIL_RE.test(p.email)) resolved.add(p.email.toLowerCase())
      else warnings.push(`Profil "${p.full_name || p.id}" sans email valide`)
    }

    // employes (scope société)
    const restAfterProfiles = restAfterContacts.filter(id => !foundProfile.has(id))
    if (restAfterProfiles.length > 0) {
      const { data: employes } = await admin
        .from('employes')
        .select('id, email, prenom, nom')
        .eq('societe_id', societe_id)
        .in('id', restAfterProfiles)
      const foundEmploye = new Set((employes as any[] | null)?.map(e => e.id) || [])
      for (const e of (employes as any[]) || []) {
        if (e.email && EMAIL_RE.test(e.email)) resolved.add(e.email.toLowerCase())
        else warnings.push(`Employé "${[e.prenom, e.nom].filter(Boolean).join(' ') || e.id}" sans email valide`)
      }
      for (const id of restAfterProfiles) {
        if (!foundEmploye.has(id)) warnings.push(`contact_id "${id}" introuvable`)
      }
    }
  }

  return { resolved: Array.from(resolved), warnings }
}

export async function POST(req: NextRequest) {
  const _hmac = await verifyHmac(req)
  if (!_hmac.ok) return new Response(JSON.stringify({ error: _hmac.reason }), { status: 401, headers: { 'content-type': 'application/json' } })

  return withTelegramAuth(req, 'email.send', async (ctx, body) => {
    if (!hasRole(ctx, 'comptable')) {
      return { result: null, status: 'denied', error_msg: 'Envoi d\'email réservé aux comptables et plus' }
    }
    let to = normalizeEmails(body?.to).filter(e => EMAIL_RE.test(e))
    const cc = normalizeEmails(body?.cc).filter(e => EMAIL_RE.test(e)).slice(0, MAX_CC)
    const subject = String(body?.subject || '').trim().slice(0, 200)
    const html = String(body?.html || '').slice(0, MAX_HTML)
    const text = body?.text ? String(body.text).slice(0, MAX_HTML) : undefined
    const reply_to = body?.reply_to ? String(body.reply_to) : undefined
    const account_id = body?.account_id ? String(body.account_id) : undefined

    // contact_id : résolution depuis factures_contacts / profiles / employes
    const contact_ids_raw = body?.contact_id
    const contact_ids = Array.isArray(contact_ids_raw)
      ? contact_ids_raw.map((x: unknown) => String(x)).filter(Boolean)
      : (contact_ids_raw ? [String(contact_ids_raw)] : [])
    let contactWarnings: string[] = []
    const resolvedFromContact = new Set<string>()
    if (contact_ids.length > 0) {
      const { resolved, warnings } = await resolveContactIds(contact_ids, ctx.societe_id)
      contactWarnings = warnings
      for (const e of resolved) {
        resolvedFromContact.add(e)
        if (!to.includes(e)) to.push(e)
      }
    }

    to = to.slice(0, MAX_RECIPIENTS)

    if (to.length === 0) {
      const reason = contact_ids.length > 0
        ? `au moins un destinataire valide requis (contact_id résolus : ${contactWarnings.join('; ') || 'aucun'})`
        : 'au moins un destinataire valide requis'
      return { result: null, status: 'error', error_msg: reason }
    }
    if (!subject) return { result: null, status: 'error', error_msg: 'subject requis' }
    if (!html) return { result: null, status: 'error', error_msg: 'html requis' }

    // Anti-XSS
    if (/<script\b/i.test(html) || /\bon\w+=/i.test(html)) {
      return { result: null, status: 'error', error_msg: 'HTML interdit (script ou handler inline)' }
    }

    // Whitelist destinataires (les emails déjà résolus depuis contact_id la skippent — déjà
    // dans nos tables donc whitelistés par construction).
    const toCheck = [...to, ...cc].filter(e => !resolvedFromContact.has(e))
    const checks = await Promise.all(toCheck.map(e => isWhitelisted(e, ctx.societe_id)))
    const unauthorized = toCheck.filter((_, i) => !checks[i])
    if (unauthorized.length > 0) {
      return {
        result: null, status: 'denied',
        error_msg: `Destinataires non autorisés : ${unauthorized.join(', ')}. Ajoute-les comme contact dans Lexora d'abord.`,
      }
    }

    // Sélection compte + envoi
    const account = await selectEmailAccount({ societe_id: ctx.societe_id, user_id: ctx.user_id, account_id })
    const msg = { to, cc, subject, html, text, reply_to }
    const result = account
      ? await sendEmail(account, msg)
      : await sendEmailFallbackResend(msg)

    if (!result.ok) {
      return { result: null, status: 'error', error_msg: result.error || 'Envoi échoué' }
    }

    // Audit cross-canal
    const admin = getAdminClient()
    await admin.from('notifications').insert({
      destinataire_id: ctx.user_id, destinataire_type: 'client',
      societe_id: ctx.societe_id, type: 'telegram_agent_email',
      titre: subject, message: text?.slice(0, 500) || html.replace(/<[^>]+>/g, '').slice(0, 500),
      niveau: 'info', envoye_email: true, cron_name: null,
    }).then(() => {}, () => {})

    return {
      result: {
        message_id: result.message_id,
        account_id: result.account_id || null,
        provider: result.provider,
        from: account ? account.from_email : 'onboarding@resend.dev (fallback)',
        to, cc, subject,
        contact_warnings: contactWarnings.length > 0 ? contactWarnings : undefined,
      },
    }
  })
}
