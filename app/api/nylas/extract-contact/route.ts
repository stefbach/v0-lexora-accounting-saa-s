import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { callClaudeJSON } from '@/lib/claude'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Body {
  societe_id?: string
  subject?: string
  from_name?: string
  from_email?: string
  body?: string // corps de l'email (HTML ou texte)
}

type Extracted = {
  nom?: string; entreprise?: string; email?: string; telephone?: string; mobile?: string
  adresse?: string; ville?: string; pays?: string; vat_number?: string; site_web?: string
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 6000)
}

/**
 * POST /api/nylas/extract-contact
 * Extrait les coordonnées (carte de visite / signature) d'un email via l'IA
 * et les enregistre dans factures_contacts (dédup par email).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquant' }, { status: 503 })

  const b = await req.json().catch(() => null) as Body | null
  if (!b?.societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
  const corps = stripHtml(b.body || '')

  let ext: Extracted = {}
  try {
    const system = `Tu extrais les coordonnées d'un contact (carte de visite / signature) à partir d'un email. Réponds STRICTEMENT en JSON :
{"nom": "", "entreprise": "", "email": "", "telephone": "", "mobile": "", "adresse": "", "ville": "", "pays": "", "vat_number": "", "site_web": ""}
N'invente rien : laisse "" si l'info est absente. Utilise l'expéditeur si la signature est vide.`
    const userPrompt = `Expéditeur : ${b.from_name || ''} <${b.from_email || ''}>\nObjet : ${b.subject || ''}\n\nContenu :\n"""\n${corps}\n"""`
    ext = await callClaudeJSON<Extracted>(system, userPrompt, 1024)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Extraction échouée' }, { status: 502 })
  }

  const email = (ext.email || b.from_email || '').trim().toLowerCase()
  const nom = (ext.nom || b.from_name || '').trim()
  if (!email && !nom) return NextResponse.json({ error: 'Aucune coordonnée exploitable trouvée.' }, { status: 422 })

  const admin = getAdminClient()
  // Dédup par email dans la société.
  if (email) {
    const { data: existing } = await admin.from('factures_contacts').select('id').eq('societe_id', b.societe_id).eq('email', email).maybeSingle()
    if (existing?.id) {
      const upd = { nom: nom || undefined, entreprise: ext.entreprise || undefined, telephone: ext.telephone || undefined, mobile: ext.mobile || undefined, adresse: ext.adresse || undefined, ville: ext.ville || undefined, pays: ext.pays || undefined, vat_number: ext.vat_number || undefined, site_web: ext.site_web || undefined }
      await admin.from('factures_contacts').update(upd).eq('id', (existing as any).id)
      return NextResponse.json({ ok: true, updated: true, contact: { nom, entreprise: ext.entreprise, email } })
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
  return NextResponse.json({ ok: true, created: true, contact: { nom, entreprise: ext.entreprise, email } })
}
