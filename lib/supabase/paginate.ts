/**
 * Helper de pagination pour contourner la limite Supabase / PostgREST par défaut
 * (1000 rows par requête). Indispensable pour toute requête qui peut renvoyer
 * plus de 1000 lignes (ex: ecritures_comptables_v2 sur sociétés actives, factures
 * sur gros clients, transactions bancaires, etc.).
 *
 * Sans ce helper, les requêtes étaient silencieusement tronquées → P&L,
 * grand-livre, balance comptable sous-estimés sur les sociétés > 1000 écritures.
 *
 * Bug observé en prod (Obesity Care Clinic, 2026-05-03) :
 *   1352 écritures comptables → P&L Salaires 2,75M au lieu de 3,79M (perte ~1M).
 *
 * Usage (passer une FACTORY pour que chaque page reparte d'un builder neuf —
 * un builder Supabase ne peut pas être ré-utilisé après un .range() suivi
 * d'un await) :
 *
 *   const ecritures = await fetchAllPaginated(() =>
 *     supabase.from('ecritures_comptables_v2').select('*')
 *       .eq('societe_id', X).order('date_ecriture', { ascending: false })
 *   )
 *
 * La factory ne doit PAS appeler .range() ou .limit() — le helper s'en charge.
 */

type SupabaseQueryBuilder = any  // PostgrestFilterBuilder type signature trop complexe
type QueryFactory = () => SupabaseQueryBuilder

/**
 * Récupère TOUTES les rows d'une requête Supabase en paginant par batch.
 * Continue jusqu'à recevoir une page incomplète (= dernière page).
 *
 * @param factory    Factory function qui retourne un nouveau Supabase builder
 *                   (sans .range() ni .limit())
 * @param pageSize   Taille de batch (défaut 1000 — Supabase max sans config)
 * @param maxRows    Garde-fou anti-runaway (défaut 100K)
 * @returns          Tableau de toutes les rows concaténées
 *
 * NOTE : si maxRows est atteint, on log un warning et on retourne ce qu'on a.
 * Pour des sociétés > 100K écritures, prévoir une vue agrégée côté DB.
 */
export async function fetchAllPaginated<T = any>(
  factory: QueryFactory,
  pageSize: number = 1000,
  maxRows: number = 100000,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await factory().range(from, from + pageSize - 1)
    if (error) {
      console.error('[fetchAllPaginated] error:', error.message)
      break
    }
    const batch = (data || []) as T[]
    all.push(...batch)
    if (batch.length < pageSize) break // dernière page (incomplète)
    from += pageSize
    if (from >= maxRows) {
      console.warn(`[fetchAllPaginated] cap atteint à ${from} rows (maxRows=${maxRows}). Considérer une vue agrégée DB.`)
      break
    }
  }
  return all
}
