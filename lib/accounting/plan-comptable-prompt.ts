/**
 * lib/accounting/plan-comptable-prompt.ts
 *
 * Charge le plan comptable RÉEL d'une société pour l'injecter dans le prompt
 * d'analyse de facture fournisseur (via injectPlanComptable). Corrige la dérive
 * entre la nomenclature conceptuelle codée en dur et le plan déployé : l'IA ne
 * peut plus émettre un compte inexistant (6510 au lieu de 651, 6011 au lieu de
 * 601, etc.).
 */

import type { ComptePourPrompt } from '@/lib/ai/prompts'

/** Comptes hors classe 6 pertinents pour une écriture d'achat (TVA, TDS, fournisseurs). */
const COMPTES_ACHAT_HORS_CLASSE_6 = ['4456', '4452', '401', '4010', '4011']

/**
 * Comptes réels et POSTABLES d'une société pertinents pour la comptabilisation
 * d'une facture fournisseur : toutes les charges (classe 6) + TVA/TDS/
 * fournisseurs. Dégradation propre (tableau vide) en cas d'erreur : le prompt
 * retombe alors sur la nomenclature conceptuelle.
 */
export async function fetchComptesPourPrompt(
  supabase: any,
  societeId: string,
): Promise<ComptePourPrompt[]> {
  try {
    const { data, error } = await supabase
      .from('plan_comptable')
      .select('compte, libelle, categorie_ifrs, classe, postable')
      .eq('societe_id', societeId)
      .eq('actif', true)
      .eq('postable', true)
      .limit(500)
    if (error || !data) return []
    return (data as any[])
      .filter((c) => c.classe === '6' || COMPTES_ACHAT_HORS_CLASSE_6.includes(String(c.compte)))
      .map((c) => ({ compte: String(c.compte), libelle: String(c.libelle || ''), categorie_ifrs: c.categorie_ifrs ?? null }))
  } catch {
    return []
  }
}
