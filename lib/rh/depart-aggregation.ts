/**
 * Agrégation des composants du breakdown départ vers les colonnes du bulletin
 * de paie "solde tout compte". Source canonique de la logique de transport
 * pour TOUTES sociétés présentes et futures.
 *
 * Composants câblés (mig 440 fortification) :
 *   - salaire_prorata        → salaire_base
 *   - allocations_prorata    → transport_allowance
 *   - conges_al + conges_sl + conges_vl → special_allowance_1
 *   - treizieme_mois (+ primesExtra - retenuesManuelles) → special_allowance_2
 *   - preavis                → departure_notice
 *   - indemnite_licenciement → special_allowance_3
 *
 * Si un futur dev ajoute un composant au breakdown (ex. `prime_anciennete`),
 * il DOIT être câblé ici ET ajouté au test `depart-aggregation.test.ts`.
 *
 * Pour empêcher les régressions silencieuses (cf. bug Mélanie RAVINA où le VL
 * de 24 871 MUR avait été oublié), la fonction `validateBreakdownCovered`
 * peut être appelée après agrégation pour s'assurer que le total bulletin
 * matche le total breakdown (écart < 1 MUR).
 */

export interface BreakdownDepart {
  salaire_prorata?: { montant: number } | null
  allocations_prorata?: { montant: number } | null
  conges_al?: { montant: number } | null
  conges_sl?: { montant: number } | null
  conges_vl?: { montant: number } | null
  treizieme_mois?: { montant: number } | null
  preavis?: { montant: number } | null
  indemnite_licenciement?: { montant: number } | null
  total?: number
}

export interface BulletinAggregation {
  salaire_base: number
  transport_allowance: number
  /** AL + SL + VL agrégés. Toujours inclure les 3. */
  special_allowance_1: number
  /** 13e mois + primes extra - retenues manuelles. */
  special_allowance_2: number
  departure_notice: number
  special_allowance_3: number
  /** Somme de tous les composants (brut bulletin). */
  brut: number
}

export function aggregateBulletinFromBreakdown(
  breakdown: BreakdownDepart | null | undefined,
  options: { primesExtra?: number; retenuesManuelles?: number } = {},
): BulletinAggregation {
  const primesExtra = options.primesExtra ?? 0
  const retenuesManuelles = options.retenuesManuelles ?? 0

  const salaireBaseBulletin = breakdown?.salaire_prorata?.montant || 0
  const transportBulletin = breakdown?.allocations_prorata?.montant || 0
  const alPayout = breakdown?.conges_al?.montant || 0
  const slPayout = breakdown?.conges_sl?.montant || 0
  const vlPayout = breakdown?.conges_vl?.montant || 0
  const congesPayoutTotal = alPayout + slPayout + vlPayout
  const treizBulletin = breakdown?.treizieme_mois?.montant || 0
  const preavisBulletin = breakdown?.preavis?.montant || 0
  const severanceBulletin = breakdown?.indemnite_licenciement?.montant || 0
  const specialAlw2Adjusted = treizBulletin + primesExtra - retenuesManuelles

  const brut =
    salaireBaseBulletin +
    transportBulletin +
    congesPayoutTotal +
    specialAlw2Adjusted +
    preavisBulletin +
    severanceBulletin

  return {
    salaire_base: salaireBaseBulletin,
    transport_allowance: transportBulletin,
    special_allowance_1: congesPayoutTotal,
    special_allowance_2: specialAlw2Adjusted,
    departure_notice: preavisBulletin,
    special_allowance_3: severanceBulletin,
    brut: Math.round(brut * 100) / 100,
  }
}

/**
 * Vérifie que la somme du bulletin agrégé matche bien le total annoncé par
 * le breakdown (à 1 MUR près). Retourne un message d'erreur explicite si
 * désaccord, ou null si tout est cohérent.
 *
 * Sentinelle anti-régression : si quelqu'un ajoute un composant au breakdown
 * sans le câbler ici, l'écart sera détecté à la 1ère utilisation.
 */
export function validateBreakdownCovered(
  breakdown: BreakdownDepart | null | undefined,
  agg: BulletinAggregation,
  retenuesManuelles = 0,
): string | null {
  if (!breakdown || !breakdown.total) return null
  // brut+retenues doit égaler breakdown.total (les retenues sont soustraites
  // de special_allowance_2 mais font partie du STC brut "officiel")
  const reconstructedTotal = agg.brut + retenuesManuelles
  const ecart = Math.abs(breakdown.total - reconstructedTotal)
  if (ecart > 1) {
    return (
      `[breakdown coverage] breakdown.total=${breakdown.total} mais bulletin brut+retenues=${reconstructedTotal} ` +
      `(écart=${ecart.toFixed(2)} MUR). Un composant breakdown n'est pas câblé dans le bulletin. ` +
      `Composants connus : salaire_prorata, allocations_prorata, conges_al, conges_sl, conges_vl, ` +
      `treizieme_mois, preavis, indemnite_licenciement. Ajouter le nouveau composant dans ` +
      `aggregateBulletinFromBreakdown() (lib/rh/depart-aggregation.ts).`
    )
  }
  return null
}
