/**
 * Helper d'envoi d'email — credentials Lexora RH via Gmail SMTP.
 *
 * Utilise nodemailer avec un transporter SMTP Gmail (smtp.gmail.com:465
 * SSL, App Password Google Workspace). Transporter mémoïsé au niveau
 * du module pour ne pas réauthentifier à chaque envoi.
 *
 * Sécurité :
 *   - GMAIL_USER + GMAIL_APP_PASSWORD lus depuis process.env (jamais
 *     côté client). Pas de NEXT_PUBLIC_.
 *   - Le password de l'employé est envoyé en clair dans l'email
 *     (décision Mégane assumée). NE JAMAIS logger le password en clair
 *     côté serveur — uniquement l'email destinataire.
 */

import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

let _transporter: Transporter | null = null

function getTransporter(): Transporter {
  if (_transporter) return _transporter
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) {
    throw new Error('GMAIL_USER ou GMAIL_APP_PASSWORD non configuré (vérifier Vercel env vars)')
  }
  _transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  })
  return _transporter
}

interface SendCredentialsArgs {
  to: string
  password: string
  loginUrl: string
  prenom?: string
  nom?: string
}

export interface SendCredentialsResult {
  ok: boolean
  messageId?: string
  error?: string
}

/**
 * Envoie un email avec les identifiants à un employé.
 * Format français, HTML simple + version texte fallback.
 * Pas de mention "changer le mot de passe au 1er login" (le password
 * reste fixe, redéfini par l'admin via le bouton "Renvoyer
 * credentials" en cas de besoin).
 */
export async function sendCredentialsEmail({
  to,
  password,
  loginUrl,
  prenom,
  nom,
}: SendCredentialsArgs): Promise<SendCredentialsResult> {
  if (!to || !password || !loginUrl) {
    return { ok: false, error: 'to, password et loginUrl requis' }
  }

  const greeting = prenom
    ? `Bonjour ${prenom}${nom ? ' ' + nom : ''},`
    : 'Bonjour,'

  const safePassword = String(password)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const html = `
<!DOCTYPE html>
<html lang="fr">
  <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;color:#1a1a1a;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e5e5e5;max-width:600px;">
            <tr>
              <td style="background:#0B0F2E;padding:20px 24px;border-radius:8px 8px 0 0;">
                <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">Lexora RH — Vos accès</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;font-size:14px;line-height:1.6;">
                <p style="margin:0 0 16px;">${greeting}</p>
                <p style="margin:0 0 16px;">Voici vos identifiants pour vous connecter à votre espace Lexora RH :</p>
                <table cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #e5e5e5;border-radius:6px;width:100%;margin:0 0 16px;">
                  <tr>
                    <td style="padding:14px 16px;">
                      <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Lien de connexion</p>
                      <p style="margin:0;"><a href="${loginUrl}" style="color:#0B0F2E;text-decoration:underline;font-weight:500;">${loginUrl}</a></p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;border-top:1px solid #e5e5e5;">
                      <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Identifiant (email)</p>
                      <p style="margin:0;font-family:monospace;">${to}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;border-top:1px solid #e5e5e5;">
                      <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Mot de passe</p>
                      <p style="margin:0;font-family:monospace;font-size:15px;font-weight:600;">${safePassword}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:13px;color:#444;">Conservez ces identifiants. Pour toute question, contactez votre RH.</p>
              </td>
            </tr>
            <tr>
              <td style="background:#fafafa;padding:14px 24px;border-radius:0 0 8px 8px;border-top:1px solid #e5e5e5;font-size:11px;color:#888;text-align:center;">
                Email envoyé automatiquement — ne pas répondre.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim()

  const text = [
    greeting,
    '',
    'Voici vos identifiants pour vous connecter à votre espace Lexora RH :',
    '',
    `Lien de connexion : ${loginUrl}`,
    `Identifiant (email) : ${to}`,
    `Mot de passe : ${password}`,
    '',
    'Conservez ces identifiants. Pour toute question, contactez votre RH.',
    '',
    '— Email envoyé automatiquement, ne pas répondre.',
  ].join('\n')

  try {
    const fromUser = process.env.GMAIL_USER!
    const info = await getTransporter().sendMail({
      from: `"Lexora RH" <${fromUser}>`,
      to,
      subject: 'Vos accès à Lexora RH',
      text,
      html,
    })
    return { ok: true, messageId: info.messageId }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Important : on log le destinataire mais JAMAIS le password.
    console.error(`[sendCredentialsEmail] échec envoi à ${to}: ${msg}`)
    return { ok: false, error: msg }
  }
}
