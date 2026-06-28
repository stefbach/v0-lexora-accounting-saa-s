/**
 * Cron mensuel — recompute soldes_conges.al_acquis (G5 Modèle C).
 *
 * Déclenché par Vercel Cron le 1er du mois à 01:00 UTC (05:00 Maurice)
 * cf. vercel.json.
 *
 * Logique : pour chaque employé actif (date_depart IS NULL), rafraîchir
 * al_acquis via la RPC get_conges_droits_v2 en utilisant date_ref =
 * LEAST(CURRENT_DATE, soldes_conges.periode_fin). UPDATE uniquement si
 * delta >= 0.01 pour éviter les no-op dans les audit logs.
 *
 * AUTH : Vercel envoie un header 'Authorization: Bearer <CRON_SECRET>'.
 * verifyCronSecret (lib/claude.ts) contrôle la valeur.
 *
 * Le endpoint admin équivalent /api/admin/recompute-accrual-mensuel
 * reste accessible pour déclenchement manuel (auth par role=admin).
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from '@/lib/claude'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return apiError('unauthorized_cron', 401)
  }

  const t0 = Date.now()
  const supabase = getServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  try {
    const { data: employes, error: empErr } = await supabase
      .from('employes')
      .select('id, date_arrivee')
      .is('date_depart', null)
    if (empErr) {
      return NextResponse.json({ error: empErr.message, duree_ms: Date.now() - t0 }, { status: 500 })
    }

    let nbUpdated = 0
    const errors: Array<{ employe_id: string; error: string }> = []

    for (const emp of employes || []) {
      if (!emp.date_arrivee) continue
      const { data: solde } = await supabase
        .from('soldes_conges')
        .select('id, periode_fin, al_acquis')
        .eq('employe_id', emp.id)
        .lte('periode_debut', today)
        .gte('periode_fin', today)
        .maybeSingle()
      if (!solde) continue

      const dateRef =
        solde.periode_fin && String(solde.periode_fin) < today
          ? String(solde.periode_fin)
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
      date_reference: today,
      source: 'vercel-cron',
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Erreur serveur', duree_ms: Date.now() - t0 },
      { status: 500 },
    )
  }
}
