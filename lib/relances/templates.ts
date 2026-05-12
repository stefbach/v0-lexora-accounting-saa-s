/**
 * Templates de relances clients (3 niveaux, ton croissant).
 *
 * Format simple {{placeholder}} : on évite les libs de templating pour
 * limiter la surface d'attaque (un client malveillant pourrait injecter
 * du code Handlebars sinon).
 */

export interface RelanceTemplateVars {
  numero_facture: string
  client_nom: string
  societe_nom: string
  montant_du: string        // ex. "12 500,00 MUR"
  date_facture: string      // ex. "15/04/2026"
  date_echeance: string     // ex. "15/05/2026"
  jours_retard: number
}

export interface RelanceTemplate {
  niveau: 1 | 2 | 3
  sujet: string
  message_text: string      // pour WhatsApp (texte brut)
  message_html: string      // pour Email
}

function render(tpl: string, vars: RelanceTemplateVars): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = (vars as any)[key]
    return v == null ? '' : String(v)
  })
}

const N1_SUJET = 'Rappel : facture {{numero_facture}} en attente de règlement'
const N1_TEXT = `Bonjour {{client_nom}},

Sauf erreur de notre part, votre facture {{numero_facture}} du {{date_facture}}, d'un montant de {{montant_du}}, dont l'échéance était le {{date_echeance}}, n'a pas encore été réglée à ce jour ({{jours_retard}} jours de retard).

Il s'agit peut-être d'un oubli — merci de bien vouloir régulariser dès que possible.

Si le règlement est déjà parti, merci d'ignorer ce message.

Cordialement,
{{societe_nom}}`

const N2_SUJET = '2e relance : facture {{numero_facture}} impayée'
const N2_TEXT = `Bonjour {{client_nom}},

Nous vous avons adressé un premier rappel concernant la facture {{numero_facture}} du {{date_facture}} d'un montant de {{montant_du}}, échue le {{date_echeance}} ({{jours_retard}} jours de retard).

À ce jour, nous n'avons toujours pas reçu votre règlement. Nous vous remercions de bien vouloir procéder au paiement sous 8 jours.

À défaut de règlement de votre part, nous nous verrons contraints d'engager une procédure de recouvrement.

Cordialement,
{{societe_nom}}`

const N3_SUJET = 'Mise en demeure — facture {{numero_facture}}'
const N3_TEXT = `Bonjour {{client_nom}},

Malgré nos précédentes relances, la facture {{numero_facture}} du {{date_facture}} d'un montant de {{montant_du}} reste impayée à ce jour ({{jours_retard}} jours de retard).

La présente vaut MISE EN DEMEURE de régler ce solde sous huitaine, soit dans un délai de 8 jours à compter de la réception du présent message.

À défaut de règlement dans ce délai, nous nous verrons contraints, à regret, de transmettre votre dossier à notre service contentieux pour engager une procédure judiciaire de recouvrement, ainsi que de réclamer l'intégralité des intérêts de retard et frais légaux applicables.

Nous restons toutefois à votre disposition pour convenir d'un échéancier amiable.

Cordialement,
{{societe_nom}}`

function toHtml(text: string): string {
  // Texte brut → HTML très conservateur (paragraphes + retours ligne).
  // On échappe pour ne pas exposer d'XSS si un nom contient un < ou >.
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .split(/\n\s*\n/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

export function buildTemplate(niveau: 1 | 2 | 3, vars: RelanceTemplateVars): RelanceTemplate {
  const sources: Record<1 | 2 | 3, { sujet: string; text: string }> = {
    1: { sujet: N1_SUJET, text: N1_TEXT },
    2: { sujet: N2_SUJET, text: N2_TEXT },
    3: { sujet: N3_SUJET, text: N3_TEXT },
  }
  const src = sources[niveau]
  const text = render(src.text, vars)
  return {
    niveau,
    sujet: render(src.sujet, vars),
    message_text: text,
    message_html: toHtml(text),
  }
}
