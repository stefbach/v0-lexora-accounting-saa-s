/**
 * Cron quotidien — envoi automatique des relances de factures impayées.
 *
 * Déclenché par Vercel Cron à 08:00 UTC (12:00 Maurice) cf. vercel.json.
 * Traite UNIQUEMENT les sociétés ayant relances_actif=true.
 *
 * AUTH : Header 'Authorization: Bearer <CRON_SECRET>'.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from '@/lib/claude'
import { runRelancesQuotidiennes } from '@/lib/relances/relances-factures'

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
    return NextResponse.json({ error: 'Non autorisé (cron secret invalide)' }, { status: 401 })
  }

  const t0 = Date.now()
  const supabase = getServiceClient()

  try {
    const summary = await runRelancesQuotidiennes(supabase, { source: 'cron' })
    const duree_ms = Date.now() - t0
    console.log('[cron/relances-factures]', {
      ...summary,
      details: undefined,                       // évite logs verbeux
      nb_details: summary.details.length,
      duree_ms,
    })
    return NextResponse.json({
      ok: true,
      duree_ms,
      societes_traitees: summary.societes_traitees,
      factures_eligibles: summary.factures_eligibles,
      envois_ok: summary.envois_ok,
      envois_echec: summary.envois_echec,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Erreur', duree_ms: Date.now() - t0 },
      { status: 500 },
    )
  }
}
