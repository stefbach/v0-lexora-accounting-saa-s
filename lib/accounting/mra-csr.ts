/**
 * MRA — Corporate Social Responsibility (CSR) Fund
 *
 * Référence loi : Income Tax Act 1995 — Section 50L
 * (Corporate Social Responsibility) + Finance Act 2009.
 *
 * « Every company shall set up a CSR Fund equivalent to 2 % of its
 *   chargeable income of the preceding year. The CSR Fund applies to
 *   all resident companies except specific exempt categories listed in
 *   the Income Tax Regulations. »
 *
 * Points clés :
 *   - Taux : 2 % du chargeable income (revenu imposable) de l'exercice
 *     précédent.
 *   - Pas de seuil de revenu : l'application est universelle pour les
 *     sociétés résidentes.
 *   - Les exemptions sont strictement catégorielles (régime fiscal,
 *     secteur d'activité). Elles ne dépendent pas d'un montant.
 *   - Depuis 2017, 75 % du fonds CSR doit être versé au MRA pour
 *     redistribution ; 25 % peut être géré directement par la société.
 *     Cette répartition ne change pas le calcul brut (2 %).
 *
 * Voir : /home/user/v0-lexora-accounting-saa-s/docs/audit-partials/wave2-D-mra-fiscal.md
 *        — Problème 2.b (CSR mal plafonné).
 */

/**
 * Régimes / secteurs explicitement exonérés de CSR par les
 * Income Tax Regulations.
 *
 * Codes utilisés :
 *   - 'gbc1'                : Global Business License historique (FSC)
 *   - 'authorised_company'  : Authorised Company (ex-GBC2), non résidente fiscale
 *   - 'freeport'            : Sociétés en zone Freeport
 *   - 'societe_exoneree_is' : Sociétés exonérées d'impôt sur les sociétés
 *   - 'film_production'     : Sociétés de production audiovisuelle (Film Rebate Scheme)
 *
 * NB : les codes correspondent à la colonne `societes.regime`
 * (cf. lib/accounting/regime.ts) + drapeaux secteur additionnels.
 */
export const CSR_EXEMPT_REGIMES = [
  'gbc1',
  'authorised_company',
  'freeport',
  'societe_exoneree_is',
  'film_production',
] as const

export type CsrExemptRegime = (typeof CSR_EXEMPT_REGIMES)[number]

/**
 * Indique si un régime / secteur est exonéré de CSR.
 *
 * @param regime    Valeur de `societes.regime` ou code secteur équivalent
 *                  (insensible à la casse, undefined/null tolérés).
 */
export function isCsrExempt(regime: string | null | undefined): boolean {
  if (!regime) return false
  const normalized = regime.trim().toLowerCase()
  return (CSR_EXEMPT_REGIMES as readonly string[]).includes(normalized)
}

/**
 * Calcule la contribution CSR due au MRA.
 *
 * Formule : `max(0, chargeableIncome) × 2 %`
 * Exemption : si `regime` figure dans `CSR_EXEMPT_REGIMES`, retourne 0.
 *
 * @param chargeableIncome  Chargeable income (revenu imposable) en MUR.
 *                          Les valeurs négatives sont traitées comme 0.
 * @param regime            Code régime fiscal de la société (ex. 'domestic',
 *                          'gbc1', 'freeport'). Voir CSR_EXEMPT_REGIMES.
 * @param overrideExempt    Drapeau facultatif (`societes.csr_exempt`) qui
 *                          force l'exonération indépendamment du régime
 *                          (cas particuliers validés par MRA).
 * @returns                 Montant CSR en MUR (≥ 0).
 */
export function computeCSR(
  chargeableIncome: number,
  regime: string | null | undefined,
  overrideExempt = false,
): number {
  if (overrideExempt) return 0
  if (isCsrExempt(regime)) return 0
  if (!Number.isFinite(chargeableIncome) || chargeableIncome <= 0) return 0
  return chargeableIncome * 0.02
}
