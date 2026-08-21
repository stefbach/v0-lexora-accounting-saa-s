/**
 * Helpers partagés des routes /api/client/manufacturing/ordres/*.
 * (fichier non-route — pas de handler HTTP ici)
 */

import {
  assertSocieteAccess,
  ResourceNotFoundError,
} from '@/lib/supabase/assert-societe-access'

export const SELECT_OF_DETAIL =
  '*, nomenclatures(id, version, libelle, quantite_produite, produit_fini_id, ' +
  'produits(id, sku, designation, unite_mesure, cout_unitaire_moyen, compte_stock), ' +
  'lignes_nomenclature(produit_composant_id, quantite, unite, taux_perte_pct, ordre, ' +
  'produits(id, sku, designation, unite_mesure, cout_unitaire_moyen, compte_stock))), ' +
  'depots(nom)'

/** Charge un OF (détail complet) et vérifie l'accès société de l'utilisateur. */
export async function loadOrdreAndAssertAccess(supabase: any, userId: string, id: string) {
  const { data, error } = await supabase
    .from('ordres_fabrication')
    .select(SELECT_OF_DETAIL)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Lookup OF: ${error.message}`)
  if (!data) throw new ResourceNotFoundError('Ordre de fabrication introuvable')
  await assertSocieteAccess(supabase, userId, data.societe_id)
  return data
}

/** Mapping des erreurs RPC OF → statut HTTP. */
export function statusForRpcError(message: string): number {
  if (message.includes('STOCK_INSUFFISANT')) return 409
  if (message.includes('OF_STATUT_INVALIDE')) return 409
  if (message.includes('PERIOD_LOCKED')) return 423
  if (message.includes('INTROUVABLE')) return 404
  return 400
}
