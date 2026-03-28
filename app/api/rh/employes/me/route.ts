import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

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
