/**
 * Cron quotidien — génère les factures récurrentes dues.
 *
 * Déclenché par Vercel Cron à 06:00 UTC (10:00 Maurice) cf. vercel.json.
 * Itère sur toutes les sociétés (le moteur filtre les modèles éligibles).
 *
 * AUTH : Header 'Authorization: Bearer <CRON_SECRET>'.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from '@/lib/claude'
import { runRecurrencesQuotidiennes } from '@/lib/recurrences/recurrences-factures'

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
    const summary = await runRecurrencesQuotidiennes(supabase)
    const duree_ms = Date.now() - t0
    console.warn('[cron/factures-recurrentes]', {
      modeles_traites: summary.modeles_traites,
      factures_creees: summary.factures_creees,
      erreurs: summary.erreurs,
      duree_ms,
    })
    return NextResponse.json({
      ok: true,
      duree_ms,
      modeles_traites: summary.modeles_traites,
      factures_creees: summary.factures_creees,
      erreurs: summary.erreurs,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Erreur', duree_ms: Date.now() - t0 },
      { status: 500 },
    )
  }
}
