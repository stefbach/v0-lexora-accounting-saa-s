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
  const DEBUG = true // temporary — flip to false once Gavena-style issues are diagnosed
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const adminClient = getAdminClient()

    if (DEBUG) {
      console.log('[employes/me] user.id=%s email=%s', user.id, user.email)
    }

    // ── Étape 1 : chercher par auth_user_id (lien direct le plus fiable) ─────
    const step1 = await adminClient
      .from('employes')
      .select('*')
      .eq('auth_user_id', user.id)
      .is('date_depart', null)
      .maybeSingle()
    const byAuthId = step1.data

    if (DEBUG) {
      console.log('[employes/me] step1 (auth_user_id=%s) hit=%s error=%s',
        user.id,
        byAuthId ? `${byAuthId.id} (${byAuthId.prenom} ${byAuthId.nom})` : 'null',
        step1.error?.message || 'none')
    }

    if (byAuthId) return NextResponse.json({ employe: byAuthId })

    // Step 1 bis: same query WITHOUT the date_depart filter — if this matches
    // while step 1 didn't, date_depart is the culprit and we report it so the
    // RH team can fix the data.
    if (DEBUG) {
      const step1bis = await adminClient
        .from('employes').select('id, nom, prenom, date_depart, auth_user_id')
        .eq('auth_user_id', user.id).maybeSingle()
      if (step1bis.data) {
        console.log('[employes/me] step1-bis: employe exists but EXCLUDED by date_depart filter → id=%s date_depart=%s',
          step1bis.data.id, step1bis.data.date_depart)
      }
    }

    // ── Étape 2 : chercher via profiles.employe_id ──────────────────────────
    const profileRes = await adminClient
      .from('profiles')
      .select('employe_id, role')
      .eq('id', user.id)
      .maybeSingle()
    const profile = profileRes.data

    if (DEBUG) {
      console.log('[employes/me] step2 profile lookup: employe_id=%s role=%s error=%s',
        profile?.employe_id || 'null',
        profile?.role || 'null',
        profileRes.error?.message || 'none')
    }

    if (profile?.employe_id) {
      const byProfileRes = await adminClient
        .from('employes')
        .select('*')
        .eq('id', profile.employe_id)
        .is('date_depart', null)
        .maybeSingle()
      const byProfile = byProfileRes.data

      if (DEBUG) {
        console.log('[employes/me] step2 employe via profile.employe_id=%s hit=%s auth_user_id_on_row=%s',
          profile.employe_id,
          byProfile ? `${byProfile.id} (${byProfile.prenom} ${byProfile.nom})` : 'null',
          byProfile?.auth_user_id || 'null')
      }

      if (byProfile) {
        // Auto-link auth_user_id for future lookups
        if (!byProfile.auth_user_id) {
          await adminClient.from('employes').update({ auth_user_id: user.id }).eq('id', byProfile.id)
          if (DEBUG) console.log('[employes/me] auto-linked auth_user_id on employe %s', byProfile.id)
        } else if (byProfile.auth_user_id !== user.id) {
          // Known bad case: employes row linked to ANOTHER auth id (duplicate
          // auth user or stale link). Surface it loudly.
          console.warn('[employes/me] MISMATCH: employe.auth_user_id=%s ≠ session user.id=%s — employe %s',
            byProfile.auth_user_id, user.id, byProfile.id)
        }
        return NextResponse.json({ employe: byProfile })
      }
    }

    // ── Étape 3 : chercher par email (fallback, case-insensitive) ─────────────
    if (user.email) {
      const emailLower = user.email.toLowerCase().trim()
      // Get all active employees and match case-insensitively
      const { data: allActive } = await adminClient
        .from('employes')
        .select('*')
        .is('date_depart', null)
        .is('auth_user_id', null)  // only match unlinked employees

      const matches = (allActive || []).filter((e: any) =>
        e.email && e.email.toLowerCase().trim() === emailLower
      )

      if (DEBUG) {
        console.log('[employes/me] step3 email=%s matches_unlinked=%d',
          emailLower, matches.length)
      }

      if (matches.length === 1) {
        // Auto-link auth_user_id for future lookups
        await adminClient.from('employes').update({ auth_user_id: user.id }).eq('id', matches[0].id)
        // Also link profiles.employe_id
        await adminClient.from('profiles').update({ employe_id: matches[0].id }).eq('id', user.id)
        if (DEBUG) console.log('[employes/me] step3 auto-linked employe %s to user %s', matches[0].id, user.id)
        return NextResponse.json({ employe: matches[0] })
      }
    }

    if (DEBUG) {
      // Last-resort diagnostic: is there an employes row with THIS email at
      // all, even linked to another user?
      if (user.email) {
        const { data: bySameEmail } = await adminClient
          .from('employes').select('id, nom, prenom, email, auth_user_id, date_depart')
          .ilike('email', user.email.trim())
          .limit(5)
        console.log('[employes/me] step4 email-match diagnostic (any link state): %j', bySameEmail)
      }
    }

    // ── Étape 4 : aucun lien trouvé ──────────────────────────────────────────
    return NextResponse.json({
      employe: null,
      email: user.email,
      message: "Compte non lié à un employé. Communiquez votre email au RH: " + user.email,
    })
  } catch (e: unknown) {
    console.error('[employes/me] error:', e)
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
