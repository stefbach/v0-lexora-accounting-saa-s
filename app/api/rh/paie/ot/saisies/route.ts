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

    if (!periode || !societe_id) {
      return NextResponse.json({ error: 'periode et societe_id requis' }, { status: 400 })
    }

    // Mig 439 — Postgres function avec JOIN. Même pattern que primes.
    const { data: rows, error: rpcErr } = await supabase.rpc('get_ot_societe_mois', {
      p_periode: `${periode}-01`,
      p_societe_id: societe_id,
    })

    if (rpcErr) {
      return NextResponse.json({
        saisies: [], nb: 0, _debug: { error: rpcErr.message },
      })
    }

    const enriched = (rows || []).map((r: any) => ({
      id: r.id, employe_id: r.employe_id, date: r.date,
      heures_normales: r.heures_normales,
      heures_ot_1_5: r.heures_ot_1_5,
      heures_ot_2: r.heures_ot_2,
      montant_ot: r.montant_ot,
      taux_horaire_base: r.taux_horaire_base,
      statut_jour: r.statut_jour,
      employe: { id: r.employe_id, nom: r.emp_nom, prenom: r.emp_prenom, poste: r.emp_poste },
    }))

    return NextResponse.json({
      saisies: enriched,
      nb: enriched.length,
      periode: `${periode}-01`,
      _debug: { rpc_count: rows?.length || 0 },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
