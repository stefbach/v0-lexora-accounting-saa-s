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

      // Sauvegarder le token avec TTL 48h + reset compteur tentatives (mig 165)
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      const { error: updateErr } = await adminSupabase
        .from('contrats_employes')
        .update({
          token_signature: token,
          token_signature_expires_at: expiresAt,
          token_signature_attempts: 0,
        })
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

    // ── 2bis. Sprint 5 AMÉLIO F — Signature authentifiée (employé connecté
    //          depuis /salarie/contrats, pas besoin de token WhatsApp). ────
    if (action === 'signer_self') {
      if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

      const adminSupabase = getAdminClient()
      // Vérifier que l'utilisateur connecté est bien l'employé du contrat
      const { data: contrat, error: fetchErr } = await adminSupabase
        .from('contrats_employes')
        .select('id, employe_id, statut')
        .eq('id', id)
        .maybeSingle()
      if (fetchErr || !contrat) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })

      const { data: emp } = await adminSupabase
        .from('employes')
        .select('id, auth_user_id, email')
        .eq('id', contrat.employe_id)
        .maybeSingle()
      const isSelf = !!emp && (emp.auth_user_id === user.id || (!!user.email && emp.email === user.email))
      if (!isSelf) return NextResponse.json({ error: 'Seul l\'employé concerné peut signer ce contrat' }, { status: 403 })
      if (contrat.statut === 'signe') return NextResponse.json({ error: 'Contrat déjà signé' }, { status: 409 })
      if (contrat.statut === 'signe_employe') return NextResponse.json({ error: 'Vous avez déjà signé ce contrat — en attente de contresignature' }, { status: 409 })

      const forwarded = request.headers.get('x-forwarded-for')
      const ip = forwarded ? forwarded.split(',')[0].trim() : 'inconnue'

      const { data: signed, error: updateErr } = await adminSupabase
        .from('contrats_employes')
        .update({
          statut: 'signe_employe',
          date_signature_employe: new Date().toISOString(),
          ip_signature_employe: ip,
          token_signature: null,
          token_signature_employe: null,
        })
        .eq('id', id)
        .select()
        .single()
      if (updateErr) throw updateErr
      return NextResponse.json({ message: 'Contrat signé avec succès', contrat: signed })
    }

    // ── 2. Signer avec le token ───────────────────────────────────────────
    if (action === 'signer') {
      const { token } = body
      if (!token) return NextResponse.json({ error: 'Token manquant' }, { status: 400 })

      const adminSupabase = getAdminClient()

      const { data: contrat, error: fetchErr } = await adminSupabase
        .from('contrats_employes')
        .select('id, statut, token_signature, date_signature, token_signature_expires_at, token_signature_attempts')
        .eq('id', id)
        .single()

      if (fetchErr || !contrat) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })
      if (contrat.token_signature !== token) return NextResponse.json({ error: 'Token invalide ou expiré' }, { status: 403 })
      if (contrat.statut === 'signe') return NextResponse.json({ error: 'Contrat déjà signé' }, { status: 409 })

      // Mig 165 — Vérifier expiration du token (48h). Si NULL = ancien contrat, pas de régression.
      const contratTyped = contrat as typeof contrat & {
        token_signature_expires_at?: string | null
        token_signature_attempts?: number | null
      }
      if (contratTyped.token_signature_expires_at) {
        const expiresAt = new Date(contratTyped.token_signature_expires_at)
        if (expiresAt < new Date()) {
          return NextResponse.json({
            error: 'Le lien de signature a expiré (48h). Contactez votre RH pour un nouveau lien.',
            code: 'token_expired',
          }, { status: 410 })
        }
      }

      // Mig 165 — Vérifier compteur tentatives (max 3)
      const attempts = contratTyped.token_signature_attempts ?? 0
      if (attempts >= 3) {
        return NextResponse.json({
          error: 'Trop de tentatives de signature. Contactez votre RH.',
          code: 'too_many_attempts',
        }, { status: 429 })
      }

      // Incrément compteur tentatives
      await adminSupabase
        .from('contrats_employes')
        .update({ token_signature_attempts: attempts + 1 })
        .eq('id', id)

      const forwarded = request.headers.get('x-forwarded-for')
      const ip = forwarded ? forwarded.split(',')[0].trim() : 'inconnue'

      const { data: signed, error: updateErr } = await adminSupabase
        .from('contrats_employes')
        .update({
          statut:                  'signe_employe',
          date_signature_employe:  new Date().toISOString(),
          ip_signature_employe:    ip,
          token_signature:         null,   // invalider le token
          token_signature_employe: null,
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
        id, type_contrat, date_debut, statut, token_signature, token_signature_expires_at,
        employe:employes ( prenom, nom, poste ),
        societe:societes ( nom )
      `)
      .eq('id', id)
      .single()

    if (error || !contrat) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })
    if (contrat.token_signature !== token) return NextResponse.json({ error: 'Token invalide ou expiré' }, { status: 403 })
    if (contrat.statut === 'signe') return NextResponse.json({ error: 'Contrat déjà signé' }, { status: 409 })

    // Mig 165 — Vérifier expiration du token (48h). Si NULL = ancien contrat, pas de régression.
    const contratTyped = contrat as typeof contrat & { token_signature_expires_at?: string | null }
    if (contratTyped.token_signature_expires_at) {
      const expiresAt = new Date(contratTyped.token_signature_expires_at)
      if (expiresAt < new Date()) {
        return NextResponse.json({
          error: 'Le lien de signature a expiré (48h). Contactez votre RH pour un nouveau lien.',
          code: 'token_expired',
        }, { status: 410 })
      }
    }

    const { token_signature: _, ...safe } = contrat as Record<string, unknown>
    return NextResponse.json({ contrat: safe, valide: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
