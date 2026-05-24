/**
 * Recompute nocturne de l'accrual AL Modèle C (sprint G5).
 *
 * POST /api/admin/recompute-accrual-mensuel
 *   Body :  { societe_id?: string }
 *   Auth :  admin / super_admin uniquement.
 *   Action: pour chaque employé actif (date_depart IS NULL), recalcule
 *           soldes_conges.al_acquis via la RPC get_conges_droits_v2
 *           sur la période courante (periode_debut <= today <= periode_fin).
 *   Retour: { nb_updated, nb_employes, duree_ms }
 *
 * Conçu pour être appelé par un cron quotidien (ex: 03:00 UTC+4).
 * L'accrual est purement dérivé de la date d'arrivée + date courante,
 * donc il est safe à recomputer tous les jours — aucun risque de
 * surcharger un travail manuel RH (les RH ne modifient pas al_acquis).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(request: Request) {
  const t0 = Date.now()
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { data: prof } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (!prof || !['admin', 'super_admin'].includes((prof as any).role)) {
      return NextResponse.json({ error: 'Accès admin requis' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({} as any))
    const societeId: string | null = body?.societe_id || null

    // Liste des employés actifs à traiter.
    let empQuery = supabase
      .from('employes')
      .select('id, date_arrivee, societe_id')
      .is('date_depart', null)
    if (societeId) empQuery = empQuery.eq('societe_id', societeId)
    const { data: employes, error: empErr } = await empQuery
    if (empErr) {
      return NextResponse.json({ error: empErr.message }, { status: 500 })
    }

    const today = new Date().toISOString().slice(0, 10)
    let nbUpdated = 0
    const errors: Array<{ employe_id: string; error: string }> = []

    for (const emp of employes || []) {
      if (!emp.date_arrivee) continue
      // Charge le solde courant de l'employé (periode_debut <= today <= periode_fin).
      const { data: solde } = await supabase
        .from('soldes_conges')
        .select('id, periode_fin, al_acquis')
        .eq('employe_id', emp.id)
        .lte('periode_debut', today)
        .gte('periode_fin', today)
        .maybeSingle()
      if (!solde) continue

      // Recalcule via la RPC v2 pour garantir cohérence (si la règle
      // change côté DB, un redeploy suffit — pas besoin de rebuild code).
      const dateRef = (solde.periode_fin && solde.periode_fin < today)
        ? solde.periode_fin
        : today
      const { data: v2, error: rpcErr } = await supabase
        .rpc('get_conges_droits_v2', {
          p_date_arrivee: emp.date_arrivee,
          p_date_reference: dateRef,
        })
        .maybeSingle()
      if (rpcErr || !v2) {
        errors.push({ employe_id: emp.id, error: rpcErr?.message || 'RPC null' })
        continue
      }
      const newAcquis = Number((v2 as { al_acquis?: number }).al_acquis) || 0
      const oldAcquis = Number(solde.al_acquis) || 0
      // Ne fait un UPDATE que si la valeur a changé (>0.01 delta) — évite
      // de polluer les audit logs avec des no-op.
      if (Math.abs(newAcquis - oldAcquis) < 0.01) continue

      const { error: updErr } = await supabase
        .from('soldes_conges')
        .update({ al_acquis: newAcquis })
        .eq('id', solde.id)
      if (updErr) {
        errors.push({ employe_id: emp.id, error: updErr.message })
        continue
      }
      nbUpdated++
    }

    return NextResponse.json({
      ok: true,
      nb_updated: nbUpdated,
      nb_employes: (employes || []).length,
      nb_erreurs: errors.length,
      erreurs: errors.slice(0, 20),
      duree_ms: Date.now() - t0,
      societe_id: societeId,
      date_reference: today,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Erreur serveur', duree_ms: Date.now() - t0 },
      { status: 500 },
    )
  }
}
