import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { trySendViaNylas } from '@/lib/nylas/send'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/client/factures/[id]/send
 * Envoie la facture (PDF en pièce jointe) au client par email, via la boîte
 * Nylas connectée. Résout l'email du contact, génère/récupère le PDF.
 * Body optionnel : { to?, subject?, message?, account_id? }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params
  const b = await req.json().catch(() => ({})) as { to?: string; subject?: string; message?: string; account_id?: string | null }
  const admin = getAdminClient()

  // Facture + société + contact.
  const { data: facture, error } = await admin
    .from('factures')
    .select('id, numero_facture, societe_id, type_facture, contact_id, montant_ttc, devise, statut')
    .eq('id', id)
    .maybeSingle()
  if (error || !facture) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
  const f = facture as any

  // Email du client : explicite > contact de la facture.
  let to = (b.to || '').trim()
  let contactNom = ''
  if (f.contact_id) {
    const { data: c } = await admin.from('factures_contacts').select('nom, entreprise, email').eq('id', f.contact_id).maybeSingle()
    if (c) { contactNom = (c as any).entreprise || (c as any).nom || ''; if (!to) to = ((c as any).email || '').trim() }
  }
  if (!to) return NextResponse.json({ error: 'Aucun email client (renseigne l\'email du contact de la facture).' }, { status: 400 })

  const { data: societe } = await admin.from('societes').select('nom').eq('id', f.societe_id).maybeSingle()
  const societeNom = (societe as any)?.nom || 'Lexora'
  const numero = f.numero_facture || id.slice(0, 8)

  // PDF : on passe par la route PDF existante (cache Storage ou régénération),
  // en suivant la redirection vers l'URL signée.
  let pdfBase64 = ''
  try {
    const origin = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, '')
    const pdfRes = await fetch(`${origin}/api/client/factures/${id}/pdf`, {
      headers: { cookie: req.headers.get('cookie') || '' },
      redirect: 'follow',
    })
    if (!pdfRes.ok) throw new Error(`PDF ${pdfRes.status}`)
    pdfBase64 = Buffer.from(await pdfRes.arrayBuffer()).toString('base64')
  } catch (e) {
    return NextResponse.json({ error: `Génération du PDF échouée : ${e instanceof Error ? e.message : 'erreur'}` }, { status: 502 })
  }

  const subject = (b.subject || '').trim() || `Facture ${numero} — ${societeNom}`
  const intro = (b.message || '').trim()
    || `Bonjour${contactNom ? ` ${contactNom}` : ''},<br><br>Veuillez trouver ci-joint la facture <strong>${numero}</strong>.<br><br>Cordialement,<br>${societeNom}`
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a">${intro}</div>`

  const r = await trySendViaNylas(admin, {
    user_id: user.id,
    societe_id: f.societe_id,
    account_id: b.account_id ?? null,
    msg: {
      to: [to], subject, html,
      attachments: [{ filename: `Facture_${numero}.pdf`, content: pdfBase64, contentType: 'application/pdf' }],
    },
  })
  if (!r) return NextResponse.json({ error: 'Aucune boîte connectée — connecte une boîte sur /client/email-accounts.' }, { status: 404 })
  if (!r.ok) return NextResponse.json({ error: r.error || 'Échec envoi' }, { status: 502 })
  return NextResponse.json({ ok: true, to, from: r.account_email, message_id: r.message_id })
}
