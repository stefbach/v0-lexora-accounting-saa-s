import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/claude'
import { fetchAndStoreRates } from '@/lib/taux-change'

export const dynamic = 'force-dynamic'

// Cron quotidien — 5:30 UTC = 9:30 Maurice (UTC+4), juste après que la
// Bank of Mauritius publie ses taux indicatifs consolidés du jour.
// Stratégie en cascade (cf. lib/taux-change.ts) :
//   1. BOM (USD, EUR, GBP, JPY, AUD, CAD, CNY, INR) → source 'bom-mu'
//   2. ExchangeRate-API pour les autres (ZAR, AED, SGD, CHF, KES...)
//   3. Fallbacks hardcodés en dernier recours
// BOM ne publie pas le week-end ni les jours fériés — le cron tourne
// quand même, on garde l'ancien taux DB pour ces jours-là.
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const result = await fetchAndStoreRates()

  // success=false ne signifie pas "rien n'a marché" : la cascade renvoie
  // toujours des taux (fallback hardcodés). success=false = au moins 2
  // sources externes ont échoué → on alerte mais on ne fait pas planter
  // le cron (les taux du jour précédent restent valables côté DB).
  if (!result.success) {
    console.error('[CRON maj-taux-change] Sources externes en échec:', result.error)
    return NextResponse.json({
      status: 'degraded',
      message: 'BOM et ExchangeRate-API indisponibles — taux fallback servis depuis cache hardcodé',
      error: result.error,
      rates: result.rates,
      timestamp: new Date().toISOString(),
    })
  }

  // Note partielle : si BOM a réussi mais ExchangeRate-API non (ou vice
  // versa), `error` contient quand même le détail pour qu'on suive en logs.
  if (result.error) {
    console.warn('[CRON maj-taux-change] Succès partiel:', result.error)
  } else {
    console.warn('[CRON maj-taux-change] Toutes sources OK')
  }

  return NextResponse.json({
    status: 'ok',
    rates: result.rates,
    warnings: result.error || null,
    timestamp: new Date().toISOString(),
  })
}
