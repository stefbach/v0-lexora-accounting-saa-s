/**
 * POST /api/rh/depart/envoyer-docs
 *
 * Envoie au collaborateur (par email) les documents de fin de contrat
 * sélectionnés. Génère chaque PDF en appelant l'endpoint correspondant
 * en interne, puis envoie un email Resend avec pièces jointes.
 *
 * Body :
 *   {
 *     employe_id: UUID,
 *     docs: ('certificat' | 'attestation' | 'solde' | 'workfare')[],
 *     recipient_email?: string,    // override de l'email employé
 *     message?: string,            // message custom dans le corps
 *     subject?: string,
 *   }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { userHasAccessToEmploye } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface DocSpec {
  key: 'certificat' | 'attestation' | 'solde' | 'workfare'
  path: string
  filename: (emp: any) => string
}

const DOC_REGISTRY: Record<string, DocSpec> = {
  certificat: {
    key: 'certificat',
    path: '/api/rh/depart/certificat',
    filename: e => `Certificat_Travail_${e.prenom}_${e.nom}.pdf`,
  },
  attestation: {
    key: 'attestation',
    path: '/api/rh/depart/attestation',
    filename: e => `Attestation_Fin_Contrat_${e.prenom}_${e.nom}.pdf`,
  },
  solde: {
    key: 'solde',
    path: '/api/rh/depart/solde-tout-compte',
    filename: e => `Solde_Tout_Compte_${e.prenom}_${e.nom}.pdf`,
  },
  workfare: {
    key: 'workfare',
    path: '/api/rh/depart/workfare',
    filename: e => `Declaration_Workfare_${e.prenom}_${e.nom}.pdf`,
  },
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { employe_id, docs, recipient_email, message, subject } = body
    if (!employe_id) return NextResponse.json({ error: 'employe_id requis' }, { status: 400 })
    if (!Array.isArray(docs) || docs.length === 0) {
      return NextResponse.json({ error: 'docs[] requis' }, { status: 400 })
    }
    if (!(await userHasAccessToEmploye(user.id, employe_id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const admin = getAdminClient()
    const { data: emp } = await admin.from('employes').select('*').eq('id', employe_id).single()
    if (!emp) return NextResponse.json({ error: 'Employé introuvable' }, { status: 404 })
    if (!emp.date_depart) {
      return NextResponse.json({ error: "Documents officiels disponibles seulement après confirmation du départ." }, { status: 400 })
    }

    const to = recipient_email || emp.email || emp.email_personnel
    if (!to) return NextResponse.json({ error: "L'employé n'a pas d'adresse email — saisis un destinataire." }, { status: 400 })

    const { data: soc } = await admin.from('societes').select('nom, email').eq('id', emp.societe_id).maybeSingle()

    // Génère chaque PDF en appelant les endpoints internes (auth via cookie)
    const cookie = request.headers.get('cookie') || ''
    const origin = new URL(request.url).origin
    const attachments: Array<{ filename: string; content: string }> = []
    const generationErrors: string[] = []

    for (const d of docs as string[]) {
      const spec = DOC_REGISTRY[d as keyof typeof DOC_REGISTRY]
      if (!spec) { generationErrors.push(`Document inconnu: ${d}`); continue }
      const url = `${origin}${spec.path}?employe_id=${employe_id}`
      try {
        const r = await fetch(url, { headers: { cookie }, cache: 'no-store' })
        if (!r.ok) {
          const j = await r.json().catch(() => ({ error: r.statusText }))
          generationErrors.push(`${d}: ${j.error || r.statusText}`)
          continue
        }
        const buf = Buffer.from(await r.arrayBuffer())
        attachments.push({ filename: spec.filename(emp), content: buf.toString('base64') })
      } catch (e: any) {
        generationErrors.push(`${d}: ${e?.message || 'fetch failed'}`)
      }
    }

    if (attachments.length === 0) {
      return NextResponse.json({
        error: `Aucun document n'a pu être généré.`,
        details: generationErrors,
      }, { status: 500 })
    }

    // Envoi via Resend
    const apiKey = process.env.RESEND_API_KEY
    const from = process.env.RESEND_FROM || `RH <rh@${(soc?.email || 'lexora.finance').split('@').pop()}>`
    if (!apiKey) {
      return NextResponse.json({ error: 'RESEND_API_KEY non configuré côté serveur' }, { status: 500 })
    }

    const subj = subject || `${soc?.nom || 'Société'} — Documents de fin de contrat`
    const msg = message || `Bonjour ${emp.prenom || ''},\n\nVous trouverez en pièces jointes les documents officiels relatifs à la fin de votre contrat de travail.\n\nNous vous souhaitons une bonne continuation.\n\nCordialement,\n${soc?.nom || ''}`

    const html = `
      <div style="font-family: Arial, sans-serif; color: #1F2937; max-width: 600px;">
        <h2 style="color: #0B0F2E;">${soc?.nom || 'Société'} — Fin de contrat</h2>
        <p style="white-space: pre-wrap;">${msg.replace(/</g, '&lt;')}</p>
        <p style="margin-top: 24px;"><strong>Documents joints :</strong></p>
        <ul>
          ${attachments.map(a => `<li>${a.filename}</li>`).join('')}
        </ul>
        <p style="color: #6B7280; font-size: 12px; margin-top: 32px;">
          Documents émis le ${new Date().toLocaleDateString('fr-FR')}. Conservez-les précieusement.
        </p>
      </div>
    `.trim()

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from, to: [to], subject: subj, html,
        attachments,
        reply_to: soc?.email || undefined,
      }),
    })
    if (!resendRes.ok) {
      const t = await resendRes.text().catch(() => '')
      return NextResponse.json({ error: `Resend: ${t.slice(0, 400)}` }, { status: 502 })
    }
    const j = await resendRes.json().catch(() => ({}))

    return NextResponse.json({
      success: true,
      message_id: j?.id,
      recipient: to,
      sent_docs: attachments.map(a => a.filename),
      generation_errors: generationErrors.length ? generationErrors : undefined,
    })
  } catch (e: unknown) {
    console.error('[depart/envoyer-docs]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
