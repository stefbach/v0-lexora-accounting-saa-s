/**
 * Helper de chargement du référentiel banques_mauritius (mig 211).
 * Retourne une Map<code, code_mcb_bp> consommée par genererVirementMCB_BPV1.
 *
 * Caching : pas de cache module-level — l'admin peut mettre à jour les
 * codes en cours de session et on veut la valeur fraîche. Si besoin de
 * perf, ajouter un cache TTL côté Redis ou similaire.
 */

import type { BankCodesMap } from './banques-mauritius'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

export async function loadBankCodesMap(supabase: AdminClient): Promise<BankCodesMap> {
  const { data, error } = await supabase
    .from('banques_mauritius')
    .select('code, code_mcb_bp, est_mcb_interne')

  if (error) {
    console.warn('[banques-mauritius-db] load error:', error.message)
    // Fallback : map vide → genererVirementMCB_BPV1 throwra BankCodeMissingError
    // dès qu'une ligne inter-banque sera rencontrée. Préférable à un fichier
    // BP-V1 silencieusement faux.
    return new Map()
  }

  const map: BankCodesMap = new Map()
  for (const r of (data || [])) {
    const code = String(r.code).toUpperCase()
    // est_mcb_interne === true → code_mcb_bp doit rester null (ligne type 1)
    if (r.est_mcb_interne) {
      map.set(code, null)
    } else {
      // Si code_mcb_bp est NULL en DB (banque non confirmée), on stocke null
      // dans la map pour que la validation amont du générateur lève
      // l'erreur explicite.
      map.set(code, r.code_mcb_bp ? String(r.code_mcb_bp) : null)
    }
  }
  return map
}
