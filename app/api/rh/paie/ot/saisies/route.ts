import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!key || !url) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * GET /api/rh/paie/ot/saisies?periode=YYYY-MM&societe_id=...
 *
 * Retourne les heures supplémentaires DÉJÀ SAUVEGARDÉES (table heures_travaillees)
 * pour la période + société. Permet à la page /rh/paie/primes de pré-remplir
 * la section "OT validés à payer" au chargement, au lieu de partir vide.
 */
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient() ?? supabaseAuth
    const { searchParams } = new URL(request.url)
    const periode = searchParams.get('periode')   // YYYY-MM
    const societe_id = searchParams.get('societe_id')

    if (!periode) {
      return NextResponse.json({ error: 'periode requis (YYYY-MM)' }, { status: 400 })
    }

    // Calcul des bornes mois
    const [year, month] = periode.split('-').map(Number)
    const dateDebut = `${periode}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const dateFin = `${periode}-${String(lastDay).padStart(2, '0')}`

    // 1) Toutes les heures sauvegardées du mois
    const { data: htRaw, error: htErr } = await supabase
      .from('heures_travaillees')
      .select('id, employe_id, date, heures_normales, heures_ot_1_5, heures_ot_2, montant_ot, taux_horaire_base, statut_jour')
      .gte('date', dateDebut)
      .lte('date', dateFin)
      .order('date', { ascending: true })

    if (htErr) {
      return NextResponse.json({
        saisies: [], nb: 0, _debug: { error: htErr.message },
      })
    }

    // 2) Tous les employés (pour filtrer par société + enrichir)
    const { data: empsRaw } = await supabase
      .from('employes')
      .select('id, nom, prenom, poste, societe_id')

    const empMap = new Map((empsRaw || []).map((e: any) => [e.id, e]))

    // 3) Filtrer par société si demandé
    let filtered = htRaw || []
    if (societe_id) {
      filtered = filtered.filter((h: any) => empMap.get(h.employe_id)?.societe_id === societe_id)
    }

    // 4) Ne garder que les jours avec OT > 0 (on cache les 0 pour l'UI)
    filtered = filtered.filter((h: any) =>
      (Number(h.heures_ot_1_5) || 0) > 0 || (Number(h.heures_ot_2) || 0) > 0,
    )

    // 5) Enrichir avec infos employé
    const enriched = filtered.map((h: any) => ({
      ...h,
      employe: empMap.get(h.employe_id) || null,
    }))

    return NextResponse.json({
      saisies: enriched,
      nb: enriched.length,
      periode: dateDebut,
      _debug: {
        nb_total_mois: htRaw?.length || 0,
        apres_filtre_societe: filtered.length,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
