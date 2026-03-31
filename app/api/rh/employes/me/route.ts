import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Champs que l'employé peut modifier lui-même
const EMPLOYEE_EDITABLE_FIELDS = [
  'mobile', 'telephone', 'email',
  'adresse', 'adresse2', 'ville', 'code_postal',
  'date_naissance', 'genre', 'statut_marital', 'nationalite',
  'bank_name', 'bank_account', 'iban',
  'contact_urgence_nom', 'contact_urgence_tel', 'contact_urgence_relation',
]

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    // ── Étape 1 : chercher par auth_user_id ──────────────────────────────────
    const { data: byAuthId } = await supabase
      .from('employes')
      .select('*')
      .eq('auth_user_id', user.id)
      .is('date_depart', null)
      .maybeSingle()

    if (byAuthId) return NextResponse.json({ employe: byAuthId })

    // ── Étape 2 : chercher par email ─────────────────────────────────────────
    if (user.email) {
      const { data: byEmail } = await supabase
        .from('employes')
        .select('*')
        .eq('email', user.email)
        .is('date_depart', null)
        .maybeSingle()

      if (byEmail) return NextResponse.json({ employe: byEmail })
    }

    // ── Étape 3 : chercher via profiles.employe_id ───────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('employe_id')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.employe_id) {
      const { data: byProfile } = await supabase
        .from('employes')
        .select('*')
        .eq('id', profile.employe_id)
        .is('date_depart', null)
        .maybeSingle()

      if (byProfile) return NextResponse.json({ employe: byProfile })
    }

    // ── Étape 4 : aucun lien trouvé ──────────────────────────────────────────
    return NextResponse.json({
      employe: null,
      email: user.email,
      message: "Compte non lié à un employé. Communiquez votre email au RH: " + user.email,
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    )
  }
}

// PATCH — L'employé modifie ses propres informations (champs limités)
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    // Trouver l'employé lié à ce user
    const meRes = await GET()
    const meData = await meRes.json()
    const employe = meData.employe
    if (!employe) return NextResponse.json({ error: 'Aucun profil employé lié' }, { status: 404 })

    const body = await request.json()

    // Filtrer: ne garder que les champs autorisés
    const updates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body)) {
      if (EMPLOYEE_EDITABLE_FIELDS.includes(key)) {
        updates[key] = value
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Aucun champ modifiable fourni' }, { status: 400 })
    }

    const admin = getAdminClient()
    const { data, error } = await admin.from('employes').update(updates).eq('id', employe.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ employe: data, message: 'Informations mises à jour' })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
