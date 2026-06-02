/**
 * Templates email HTML pro pour le système de prise de RDV.
 *
 * Le logo Lexora est rendu en HTML pur (typographie + couleurs Navy/Gold) pour
 * que tous les clients mail l'affichent correctement, sans dépendre d'images
 * externes (qui sont souvent bloquées par les clients mail).
 */

const NAVY = '#0B0F2E'
const GOLD = '#D4AF37'
const TEXT = '#1F2544'
const MUTED = '#6B7390'
const SOFT = '#F5F6FB'

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/** Logo Lexora en HTML pur (couleurs Navy + accent Gold sur X). */
function lexoraLogoHtml(): string {
  return `<span style="font-family:'Helvetica Neue',Arial,sans-serif;font-weight:800;letter-spacing:2px;font-size:22px;color:${NAVY};">LE<span style="color:${GOLD};">X</span>ORA</span>`
}

export type ConfirmationVars = {
  prospect_name: string
  prospect_email: string
  start_iso: string
  end_iso: string
  timezone: string
  location_type: 'online' | 'in_person'
  in_person_address: string | null
  meet_url: string | null
  cancel_token: string
  base_url: string
}

/** Email de confirmation HTML envoyé au prospect après réservation. */
export function buildConfirmationEmail(v: ConfirmationVars): { subject: string; html: string; text: string } {
  const startD = new Date(v.start_iso)
  const dateLabel = startD.toLocaleDateString('fr-FR', {
    timeZone: v.timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const timeLabel = `${startD.toLocaleTimeString('fr-FR', { timeZone: v.timezone, hour: '2-digit', minute: '2-digit' })} (heure de Maurice)`
  const cancelUrl = `${v.base_url}/rdv/cancel?token=${encodeURIComponent(v.cancel_token)}`

  const locationBlock = v.location_type === 'online'
    ? `<tr><td style="padding:8px 0;color:${MUTED};font-size:13px;">Format</td><td style="padding:8px 0;color:${TEXT};font-size:14px;"><strong>Visioconférence Google Meet</strong></td></tr>` +
      (v.meet_url ? `<tr><td colspan="2" style="padding:6px 0 0 0;"><a href="${esc(v.meet_url)}" style="display:inline-block;background:${NAVY};color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:600;font-family:'Helvetica Neue',Arial,sans-serif;">Rejoindre la visioconférence</a></td></tr>` : '')
    : `<tr><td style="padding:8px 0;color:${MUTED};font-size:13px;">Lieu</td><td style="padding:8px 0;color:${TEXT};font-size:14px;"><strong>${esc(v.in_person_address || 'À préciser')}</strong></td></tr>`

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Confirmation</title></head>
<body style="margin:0;padding:0;background:${SOFT};font-family:'Helvetica Neue',Arial,sans-serif;color:${TEXT};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${SOFT};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(11,15,46,0.08);">
        <tr><td style="padding:28px 32px 18px 32px;border-bottom:1px solid #EEF0F7;">
          ${lexoraLogoHtml()}
          <div style="margin-top:4px;font-size:11px;letter-spacing:2px;color:${MUTED};text-transform:uppercase;">L'ERP IA-native pour Maurice</div>
        </td></tr>

        <tr><td style="padding:28px 32px 8px 32px;">
          <h1 style="margin:0 0 8px 0;font-size:22px;color:${NAVY};font-weight:600;">Votre rendez-vous est confirmé</h1>
          <p style="margin:0;color:${MUTED};font-size:14px;line-height:1.5;">Bonjour ${esc(v.prospect_name)},<br>nous avons hâte de vous présenter Lexora.</p>
        </td></tr>

        <tr><td style="padding:8px 32px 24px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #EEF0F7;border-bottom:1px solid #EEF0F7;">
            <tr><td style="padding:14px 0 8px 0;color:${MUTED};font-size:13px;">Date</td><td style="padding:14px 0 8px 0;color:${TEXT};font-size:14px;"><strong>${esc(dateLabel)}</strong></td></tr>
            <tr><td style="padding:8px 0;color:${MUTED};font-size:13px;">Horaire</td><td style="padding:8px 0;color:${TEXT};font-size:14px;"><strong>${esc(timeLabel)}</strong></td></tr>
            <tr><td style="padding:8px 0;color:${MUTED};font-size:13px;">Durée</td><td style="padding:8px 0 14px 0;color:${TEXT};font-size:14px;"><strong>30 minutes</strong></td></tr>
            ${locationBlock}
          </table>
        </td></tr>

        <tr><td style="padding:8px 32px 24px 32px;">
          <h2 style="margin:0 0 10px 0;font-size:14px;color:${NAVY};font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Avant la démo (5 min)</h2>
          <ul style="margin:0;padding-left:18px;color:${TEXT};font-size:14px;line-height:1.7;">
            <li>Prévoyez un casque ou un environnement calme.</li>
            <li>Notez 2 ou 3 difficultés concrètes que vous rencontrez en compta ou en RH.</li>
            <li>Si possible, ayez sous la main un état financier récent.</li>
          </ul>
          <p style="margin:14px 0 0 0;color:${MUTED};font-size:13px;line-height:1.5;">La démo est personnalisée à votre activité plutôt qu'une présentation standard.</p>
        </td></tr>

        <tr><td style="padding:8px 32px 28px 32px;border-top:1px solid #EEF0F7;">
          <p style="margin:14px 0 0 0;color:${MUTED};font-size:12px;line-height:1.5;">
            Vous ne pouvez plus venir ? <a href="${esc(cancelUrl)}" style="color:${NAVY};">Annuler ce rendez-vous</a>.<br>
            Une invitation Google Calendar a aussi été envoyée à cette adresse.
          </p>
        </td></tr>

        <tr><td style="padding:18px 32px;background:${NAVY};color:#fff;font-size:11px;letter-spacing:1px;text-transform:uppercase;text-align:center;">
          Lexora · L'ERP a changé d'ère
        </td></tr>
      </table>

      <p style="margin:14px 0 0 0;color:${MUTED};font-size:11px;text-align:center;">
        Lexora SAS · Maurice · <a href="https://www.lexora.finance" style="color:${MUTED};">www.lexora.finance</a>
      </p>
    </td></tr>
  </table>
</body></html>`

  const text = [
    `LEXORA — Confirmation de rendez-vous`,
    ``,
    `Bonjour ${v.prospect_name},`,
    ``,
    `Votre démo Lexora est confirmée :`,
    `  • ${dateLabel}`,
    `  • ${timeLabel}`,
    `  • Durée : 30 minutes`,
    `  • ${v.location_type === 'online' ? `Visioconférence Google Meet${v.meet_url ? ` : ${v.meet_url}` : ''}` : `Lieu : ${v.in_person_address || 'À préciser'}`}`,
    ``,
    `AVANT LA DÉMO (5 min) :`,
    `  • Prévoyez un casque ou un environnement calme.`,
    `  • Notez 2 ou 3 difficultés concrètes en compta ou RH.`,
    `  • Si possible, ayez sous la main un état financier récent.`,
    ``,
    `Annuler : ${cancelUrl}`,
    ``,
    `À bientôt,`,
    `L'équipe Lexora`,
    `www.lexora.finance`,
  ].join('\n')

  return {
    subject: `Confirmation — Démo Lexora le ${dateLabel} à ${timeLabel}`,
    html, text,
  }
}

/** Email de notification interne au owner (toi). */
export function buildOwnerNotificationEmail(v: ConfirmationVars & {
  prospect_company: string | null
  prospect_phone: string | null
  notes: string | null
}): { subject: string; html: string; text: string } {
  const startD = new Date(v.start_iso)
  const when = `${startD.toLocaleDateString('fr-FR', { timeZone: v.timezone, weekday: 'long', day: 'numeric', month: 'long' })} à ${startD.toLocaleTimeString('fr-FR', { timeZone: v.timezone, hour: '2-digit', minute: '2-digit' })}`

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:${SOFT};font-family:'Helvetica Neue',Arial,sans-serif;color:${TEXT};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${SOFT};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(11,15,46,0.08);">
        <tr><td style="padding:24px 28px 14px 28px;border-bottom:1px solid #EEF0F7;">${lexoraLogoHtml()}</td></tr>
        <tr><td style="padding:22px 28px;">
          <h1 style="margin:0 0 6px 0;font-size:18px;color:${NAVY};font-weight:600;">Nouveau rendez-vous</h1>
          <p style="margin:0 0 16px 0;color:${MUTED};font-size:13px;">${esc(when)} · ${v.location_type === 'online' ? 'En ligne' : 'Présentiel'}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr><td style="padding:6px 0;color:${MUTED};font-size:12px;width:90px;">Prospect</td><td style="padding:6px 0;font-size:14px;color:${TEXT};"><strong>${esc(v.prospect_name)}</strong></td></tr>
            <tr><td style="padding:6px 0;color:${MUTED};font-size:12px;">Email</td><td style="padding:6px 0;font-size:14px;"><a href="mailto:${esc(v.prospect_email)}" style="color:${NAVY};">${esc(v.prospect_email)}</a></td></tr>
            ${v.prospect_company ? `<tr><td style="padding:6px 0;color:${MUTED};font-size:12px;">Société</td><td style="padding:6px 0;font-size:14px;color:${TEXT};">${esc(v.prospect_company)}</td></tr>` : ''}
            ${v.prospect_phone ? `<tr><td style="padding:6px 0;color:${MUTED};font-size:12px;">Téléphone</td><td style="padding:6px 0;font-size:14px;color:${TEXT};">${esc(v.prospect_phone)}</td></tr>` : ''}
            ${v.notes ? `<tr><td style="padding:10px 0;color:${MUTED};font-size:12px;vertical-align:top;">Message</td><td style="padding:10px 0;font-size:14px;color:${TEXT};line-height:1.5;">${esc(v.notes).replace(/\n/g, '<br>')}</td></tr>` : ''}
          </table>
        </td></tr>
        <tr><td style="padding:14px 28px;background:${NAVY};color:#fff;font-size:11px;letter-spacing:1px;text-transform:uppercase;text-align:center;">Lexora · Notification interne</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const text = `Nouveau RDV Lexora\n\n${v.prospect_name} (${v.prospect_email})\n${when}\n${v.location_type === 'online' ? `Visio Meet${v.meet_url ? `: ${v.meet_url}` : ''}` : `Lieu: ${v.in_person_address || 'à préciser'}`}\n${v.prospect_company ? `Société: ${v.prospect_company}\n` : ''}${v.prospect_phone ? `Téléphone: ${v.prospect_phone}\n` : ''}${v.notes ? `\nMessage:\n${v.notes}\n` : ''}`

  return {
    subject: `Nouveau RDV — ${v.prospect_name} (${when})`,
    html, text,
  }
}
