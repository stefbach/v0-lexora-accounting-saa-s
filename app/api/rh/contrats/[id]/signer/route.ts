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

// ── POST /api/rh/contrats/[id]/signer ────────────────────────────────────────
// Action : "generer_token" | "signer"
//
// generer_token → génère un token de signature unique et retourne le lien
// signer        → valide la signature avec le token + IP + timestamp

export async function POST(request: Request, { params }: Params) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { id } = await params
    const body = await request.json()
    const action: string = body.action || 'signer'

    // ── 1. Générer un token de signature (RH uniquement, auth requise) ──────
    if (action === 'generer_token') {
      if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

      const token = randomUUID()
      const { error } = await supabase
        .from('contrats_employes')
        .update({ token_signature: token })
        .eq('id', id)

      if (error) throw error

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.lexora.mu'
      const lienSignature = `${baseUrl}/signer-contrat?token=${token}`

      return NextResponse.json({ token, lien_signature: lienSignature })
    }

    // ── 2. Signer avec le token (pas d'auth requise — accès public par lien) ─
    if (action === 'signer') {
      const { token } = body
      if (!token) return NextResponse.json({ error: 'Token manquant' }, { status: 400 })

      const adminSupabase = getAdminClient()

      // Vérifier le token
      const { data: contrat, error: fetchErr } = await adminSupabase
        .from('contrats_employes')
        .select('id, statut, token_signature, date_signature')
        .eq('id', id)
        .single()

      if (fetchErr || !contrat) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })
      if (contrat.token_signature !== token) return NextResponse.json({ error: 'Token invalide' }, { status: 403 })
      if (contrat.statut === 'signe') return NextResponse.json({ error: 'Contrat déjà signé' }, { status: 409 })

      // Extraire IP
      const forwarded = request.headers.get('x-forwarded-for')
      const ip = forwarded ? forwarded.split(',')[0].trim() : 'inconnue'

      const { data: signed, error: updateErr } = await adminSupabase
        .from('contrats_employes')
        .update({
          statut: 'signe',
          date_signature: new Date().toISOString(),
          ip_signature: ip,
          token_signature: null, // invalider le token après signature
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

// ── GET /api/rh/contrats/[id]/signer ─────────────────────────────────────────
// Vérifie qu'un token est valide (avant d'afficher la page de signature)
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

    // Retourner info sans données sensibles
    const { token_signature: _, ...safe } = contrat as any
    return NextResponse.json({ contrat: safe, valide: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
