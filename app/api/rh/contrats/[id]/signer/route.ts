import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

type Params = { params: Promise<{ id: string }> }

// ── Envoi WhatsApp via WATI ──────────────────────────────────────────────────
async function envoyerWhatsApp(telephone: string, message: string): Promise<void> {
  const watiUrl = process.env.WATI_API_URL
  const watiKey = process.env.WATI_API_KEY
  if (!watiUrl || !watiKey) {
    console.warn('[signer] WATI non configuré — WhatsApp non envoyé')
    return
  }

  // Normaliser le numéro : retirer +, espaces, tirets
  const numero = telephone.replace(/[\s\-\+]/g, '')

  try {
    const res = await fetch(`${watiUrl}/api/v1/sendSessionMessage/${numero}`, {
      method: 'POST',
      headers: {
        'Authorization': watiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messageText: message }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('[signer] WATI erreur:', res.status, err)
    }
  } catch (err) {
    console.error('[signer] WATI exception:', err)
  }
}

// ── POST /api/rh/contrats/[id]/signer ────────────────────────────────────────
// action: "generer_token" | "signer"
export async function POST(request: Request, { params }: Params) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { id } = await params
    const body = await request.json()
    const action: string = body.action || 'signer'

    // ── 1. Générer token + envoyer WhatsApp ───────────────────────────────
    if (action === 'generer_token') {
      if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

      const token = randomUUID()

      // Récupérer contrat + employé + société
      const adminSupabase = getAdminClient()
      const { data: contrat, error: contratErr } = await adminSupabase
        .from('contrats_employes')
        .select(`
          id, type_contrat,
          employe:employes ( prenom, nom, telephone, email ),
          societe:societes ( nom )
        `)
        .eq('id', id)
        .single()

      if (contratErr || !contrat) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })

      // Sauvegarder le token
      const { error: updateErr } = await adminSupabase
        .from('contrats_employes')
        .update({ token_signature: token })
        .eq('id', id)

      if (updateErr) throw updateErr

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.lexora.mu'
      const lienSignature = `${baseUrl}/signer-contrat?id=${id}&token=${token}`

      const emp = contrat.employe as any
      const soc = contrat.societe as any
      const prenomNom = `${emp?.prenom || ''} ${emp?.nom || ''}`.trim()

      // Envoi WhatsApp si téléphone disponible
      let whatsappEnvoye = false
      if (emp?.telephone) {
        const message =
          `Bonjour ${emp.prenom || ''},\n\n` +
          `*${soc?.nom || 'Votre employeur'}* vous invite à signer votre contrat de travail (${contrat.type_contrat || 'CDI'}) via *Lexora RH*.\n\n` +
          `👉 Consultez et signez ici :\n${lienSignature}\n\n` +
          `_Ce lien est à usage unique et sécurisé. Votre signature a valeur juridique conformément à l'Electronic Transactions Act 2000 de Maurice._\n\n` +
          `— Lexora RH (envoyé au nom de ${soc?.nom || 'votre employeur'})`

        await envoyerWhatsApp(emp.telephone, message)
        whatsappEnvoye = true
      }

      return NextResponse.json({
        token,
        lien_signature: lienSignature,
        whatsapp_envoye: whatsappEnvoye,
        telephone: emp?.telephone || null,
        employe: prenomNom,
      })
    }

    // ── 2. Signer avec le token ───────────────────────────────────────────
    if (action === 'signer') {
      const { token } = body
      if (!token) return NextResponse.json({ error: 'Token manquant' }, { status: 400 })

      const adminSupabase = getAdminClient()

      const { data: contrat, error: fetchErr } = await adminSupabase
        .from('contrats_employes')
        .select('id, statut, token_signature, date_signature')
        .eq('id', id)
        .single()

      if (fetchErr || !contrat) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })
      if (contrat.token_signature !== token) return NextResponse.json({ error: 'Token invalide ou expiré' }, { status: 403 })
      if (contrat.statut === 'signe') return NextResponse.json({ error: 'Contrat déjà signé' }, { status: 409 })

      const forwarded = request.headers.get('x-forwarded-for')
      const ip = forwarded ? forwarded.split(',')[0].trim() : 'inconnue'

      const { data: signed, error: updateErr } = await adminSupabase
        .from('contrats_employes')
        .update({
          statut: 'signe',
          date_signature: new Date().toISOString(),
          ip_signature: ip,
          token_signature: null,
        })
        .eq('id', id)
        .select()
        .single()

      if (updateErr) throw updateErr
      return NextResponse.json({ message: 'Contrat signé avec succès', contrat: signed })
    }

    return NextResponse.json({ error: 'Action inconnue. Utilisez "generer_token" ou "signer"' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// ── GET /api/rh/contrats/[id]/signer — vérifie token ─────────────────────────
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const url = new URL(request.url)
    const token = url.searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'Token manquant' }, { status: 400 })

    const adminSupabase = getAdminClient()
    const { data: contrat, error } = await adminSupabase
      .from('contrats_employes')
      .select(`
        id, type_contrat, date_debut, statut, token_signature,
        employe:employes ( prenom, nom, poste ),
        societe:societes ( nom )
      `)
      .eq('id', id)
      .single()

    if (error || !contrat) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })
    if (contrat.token_signature !== token) return NextResponse.json({ error: 'Token invalide ou expiré' }, { status: 403 })
    if (contrat.statut === 'signe') return NextResponse.json({ error: 'Contrat déjà signé' }, { status: 409 })

    const { token_signature: _, ...safe } = contrat as any
    return NextResponse.json({ contrat: safe, valide: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
