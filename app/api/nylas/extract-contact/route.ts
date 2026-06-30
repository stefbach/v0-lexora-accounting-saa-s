import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { callClaudeJSON, callClaudeVisionJSON } from '@/lib/claude'
import { resolveNylasAccount } from '@/lib/nylas/account'
import { getNylasMessage, downloadNylasAttachment, isNylasConfigured } from '@/lib/nylas/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 90

interface Body {
  societe_id?: string
  message_id?: string
  account_id?: string | null
  // Fallback si pas de message_id (extraction depuis le contenu fourni).
  subject?: string; from_name?: string; from_email?: string; body?: string
}

type Extracted = {
  nom?: string; entreprise?: string; email?: string; telephone?: string; mobile?: string
  adresse?: string; ville?: string; pays?: string; vat_number?: string; site_web?: string
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 6000)
}

/** Parse minimal d'une vCard (.vcf). */
function parseVCard(vcf: string): Extracted {
  const get = (re: RegExp) => { const m = vcf.match(re); return m ? m[1].trim() : undefined }
  const tels = [...vcf.matchAll(/^TEL[^:]*:(.+)$/gim)].map((m) => m[1].trim())
  return {
    nom: get(/^FN[^:]*:(.+)$/im) || get(/^N[^:]*:(.+)$/im)?.replace(/;/g, ' ').trim(),
    entreprise: get(/^ORG[^:]*:(.+)$/im)?.replace(/;/g, ' ').trim(),
    email: get(/^EMAIL[^:]*:(.+)$/im),
    telephone: tels[0],
    mobile: tels.find((t, i) => i > 0) || undefined,
    adresse: get(/^ADR[^:]*:(.+)$/im)?.replace(/;+/g, ' ').trim(),
    site_web: get(/^URL[^:]*:(.+)$/im),
  }
}

const merge = (base: Extracted, add: Extracted): Extracted => {
  const out = { ...base }
  for (const k of Object.keys(add) as (keyof Extracted)[]) if (!out[k] && add[k]) out[k] = add[k]
  return out
}

/**
 * POST /api/nylas/extract-contact
 * Récupère la carte de visite dans l'email d'origine : pièce jointe vCard
 * (.vcf), image (OCR via vision), puis signature texte — et enregistre le
 * contact dans factures_contacts.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquant' }, { status: 503 })

  const b = await req.json().catch(() => null) as Body | null
  if (!b?.societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

  const admin = getAdminClient()
  let ext: Extracted = {}
  let fromName = b.from_name || ''
  let fromEmail = b.from_email || ''
  let bodyText = b.body || ''
  const sourcesUsed: string[] = []

  // 1. Récupère l'email d'origine + ses pièces jointes (carte de visite).
  if (b.message_id && isNylasConfigured()) {
    const acc = await resolveNylasAccount(admin, user.id, b.societe_id, b.account_id)
    if (acc) {
      try {
        const msg = await getNylasMessage(acc.grantId, b.message_id)
        fromName = msg.from?.name || fromName
        fromEmail = msg.from?.email || fromEmail
        bodyText = msg.body || bodyText
        for (const att of msg.attachments) {
          const ct = (att.contentType || '').toLowerCase()
          const isVcard = ct.includes('vcard') || /\.vcf$/i.test(att.filename)
          const isImage = ct.startsWith('image/')
          if (!isVcard && !isImage) continue
          try {
            const { buffer, contentType } = await downloadNylasAttachment(acc.grantId, att.id, b.message_id)
            if (isVcard) {
              ext = merge(ext, parseVCard(Buffer.from(buffer).toString('utf-8')))
              sourcesUsed.push('vCard')
            } else if (isImage) {
              const base64 = Buffer.from(buffer).toString('base64')
              const visioned = await callClaudeVisionJSON<Extracted>(
                "Tu lis une carte de visite sur cette image et extrais les coordonnées. Réponds STRICTEMENT en JSON {\"nom\":\"\",\"entreprise\":\"\",\"email\":\"\",\"telephone\":\"\",\"mobile\":\"\",\"adresse\":\"\",\"ville\":\"\",\"pays\":\"\",\"vat_number\":\"\",\"site_web\":\"\"}. N'invente rien.",
                'Extrais les coordonnées de cette carte de visite.',
                base64, (contentType || att.contentType || 'image/jpeg').split(';')[0],
              ).catch(() => ({} as Extracted))
              ext = merge(ext, visioned)
              if (Object.values(visioned).some(Boolean)) sourcesUsed.push('image')
            }
          } catch { /* pièce jointe illisible — on continue */ }
        }
      } catch { /* email illisible — fallback texte */ }
    }
  }

  // 2. Complète avec la signature texte (sans écraser la carte de visite).
  try {
    const corps = stripHtml(bodyText)
    const sig = await callClaudeJSON<Extracted>(
      `Tu extrais les coordonnées (signature / carte de visite) d'un email. Réponds STRICTEMENT en JSON {"nom":"","entreprise":"","email":"","telephone":"","mobile":"","adresse":"","ville":"","pays":"","vat_number":"","site_web":""}. N'invente rien ; "" si absent.`,
      `Expéditeur : ${fromName} <${fromEmail}>\nObjet : ${b.subject || ''}\n\nContenu :\n"""\n${corps}\n"""`,
      1024,
    )
    ext = merge(ext, sig)
    if (Object.values(sig).some(Boolean)) sourcesUsed.push('signature')
  } catch { /* extraction texte optionnelle */ }

  const email = (ext.email || fromEmail || '').trim().toLowerCase()
  const nom = (ext.nom || fromName || '').trim()
  if (!email && !nom) return NextResponse.json({ error: 'Aucune coordonnée exploitable trouvée.' }, { status: 422 })

  if (email) {
    const { data: existing } = await admin.from('factures_contacts').select('id').eq('societe_id', b.societe_id).eq('email', email).maybeSingle()
    if (existing?.id) {
      const upd = { nom: nom || undefined, entreprise: ext.entreprise || undefined, telephone: ext.telephone || undefined, mobile: ext.mobile || undefined, adresse: ext.adresse || undefined, ville: ext.ville || undefined, pays: ext.pays || undefined, vat_number: ext.vat_number || undefined, site_web: ext.site_web || undefined }
      await admin.from('factures_contacts').update(upd).eq('id', (existing as any).id)
      return NextResponse.json({ ok: true, updated: true, sources: sourcesUsed, contact: { nom, entreprise: ext.entreprise, email } })
    }
  }

  const row = {
    societe_id: b.societe_id, nom: nom || null, entreprise: ext.entreprise || null, email: email || null,
    telephone: ext.telephone || null, mobile: ext.mobile || null, adresse: ext.adresse || null,
    ville: ext.ville || null, pays: ext.pays || null, vat_number: ext.vat_number || null,
    site_web: ext.site_web || null, actif: true,
  }
  const { error } = await admin.from('factures_contacts').insert(row)
  if (error) return NextResponse.json({ error: `Enregistrement échoué : ${error.message}` }, { status: 500 })
  return NextResponse.json({ ok: true, created: true, sources: sourcesUsed, contact: { nom, entreprise: ext.entreprise, email } })
}
