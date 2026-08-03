/**
 * Grille tarifaire Lexora 2026 — Package Société & Package GBC / IFRS.
 *
 * Source de vérité applicative pour le calcul d'un palier et d'un
 * dépassement. Doit rester synchronisée avec la migration
 * `supabase/migrations/467_package_societe_gbc_unique.sql`, qui porte les
 * mêmes montants dans la table `plans` (colonnes `prix_mensuel_mur` et
 * `limites`).
 *
 * PRINCIPE
 * --------
 * Un seul axe de prix : le volume moyen de transactions traitées par mois
 * (plus, pour les packages GBC, le nombre d'entités à consolider).
 *
 * Une transaction = une pièce comptable, une facture émise ou reçue, une
 * ligne de relevé bancaire importée, un document passé à l'OCR.
 * Ne comptent PAS : bulletins de paie, salariés, congés, pointages,
 * contrats, utilisateurs — tout cela est illimité sur tous les paliers.
 *
 * C'est la traduction commerciale d'un fait technique : générer 5 ou 100
 * bulletins mobilise le même code déterministe, tandis que le coût marginal
 * réel (OCR, tokens LLM de rapprochement, stockage) suit le nombre de pièces.
 */

export type PricingTier = {
  /** Code du plan correspondant dans la table `plans`. */
  code: string
  /** Prix mensuel en MUR. 0 = tarif négocié (« sur devis »). */
  monthly: number
  /** Plafond de transactions incluses par mois. null = illimité. */
  txMax: number | null
  /** Entités consolidées incluses. null = illimité. */
  entitesMax: number | null
}

export const SOCIETE_TIERS: readonly PricingTier[] = [
  { code: 'societe_essentiel',  monthly: 2500,  txMax: 50,   entitesMax: 1 },
  { code: 'societe_croissance', monthly: 4900,  txMax: 200,  entitesMax: 1 },
  { code: 'societe_pme',        monthly: 9900,  txMax: 500,  entitesMax: 1 },
  { code: 'societe_corporate',  monthly: 18900, txMax: 1500, entitesMax: 1 },
  { code: 'societe_enterprise', monthly: 0,     txMax: null, entitesMax: 1 },
]

export const GBC_TIERS: readonly PricingTier[] = [
  { code: 'gbc_authorised',    monthly: 8500,  txMax: 100,  entitesMax: 1 },
  { code: 'gbc_standard',      monthly: 15000, txMax: 500,  entitesMax: 1 },
  { code: 'gbc_groupe',        monthly: 32000, txMax: 1500, entitesMax: 5 },
  { code: 'gbc_management_co', monthly: 0,     txMax: null, entitesMax: null },
]

/** Rs facturés par transaction au-delà du plafond du palier souscrit. */
export const OVERAGE_MUR_PER_TX = 15
/** Rs/mois par entité consolidée au-delà du plafond (packages GBC). */
export const OVERAGE_MUR_PER_ENTITE = 4500
/** TIBOK est en pay-as-you-go : l'accès est inclus, l'acte est facturé. */
export const TIBOK_MUR_PER_CONSULTATION = 500
/** Engagement annuel : 12 mois d'usage, 10 mois facturés. */
export const ANNUAL_MONTHS_BILLED = 10

/**
 * Index du premier palier dont les plafonds couvrent l'usage donné.
 * Retourne le dernier palier (négocié) si aucun ne couvre.
 */
export function resolveTierIndex(
  tiers: readonly PricingTier[],
  transactions: number,
  entites = 1,
): number {
  for (let i = 0; i < tiers.length; i++) {
    const { txMax, entitesMax } = tiers[i]
    const okTx = txMax === null || transactions <= txMax
    const okEntites = entitesMax === null || entites <= entitesMax
    if (okTx && okEntites) return i
  }
  return tiers.length - 1
}

/** Palier recommandé pour un usage donné. */
export function resolveTier(
  tiers: readonly PricingTier[],
  transactions: number,
  entites = 1,
): PricingTier {
  return tiers[resolveTierIndex(tiers, transactions, entites)]
}

/** Prix mensuel équivalent en engagement annuel (2 mois offerts). */
export function annualMonthlyPrice(monthly: number): number {
  return Math.round((monthly * ANNUAL_MONTHS_BILLED) / 12)
}

/** Prix total d'une année d'engagement. */
export function annualPrice(monthly: number): number {
  return monthly * ANNUAL_MONTHS_BILLED
}

/**
 * Dépassement facturé à un client déjà abonné à `subscribedIndex` qui
 * consomme davantage que son plafond.
 *
 * Le montant est plafonné à l'écart de prix avec le palier supérieur :
 * dépasser ne coûte jamais plus cher que d'avoir souscrit au palier
 * au-dessus. C'est ce qui rend le modèle sûr pour le client — pas de
 * facture surprise — et honnête commercialement : le dépassement est une
 * incitation à monter de palier, pas une pénalité.
 *
 * Le plafond ne s'applique que si le palier supérieur est lui-même chiffré.
 * Face à un palier négocié (prix 0), il n'y a pas d'écart calculable : le
 * dépassement reste dû et déclenche une renégociation.
 */
export function overageMur(
  tiers: readonly PricingTier[],
  subscribedIndex: number,
  transactions: number,
): number {
  const tier = tiers[subscribedIndex]
  if (!tier || tier.txMax === null) return 0

  const excess = transactions - tier.txMax
  if (excess <= 0) return 0

  const raw = excess * OVERAGE_MUR_PER_TX
  const next = tiers[subscribedIndex + 1]
  if (!next || next.monthly === 0) return raw

  return Math.min(raw, next.monthly - tier.monthly)
}

/**
 * Facture mensuelle d'un abonnement : base + dépassement transactions
 * + dépassement entités. Hors consultations TIBOK, facturées à l'acte.
 */
export function monthlyBill(
  tiers: readonly PricingTier[],
  subscribedIndex: number,
  transactions: number,
  entites = 1,
): { base: number; overageTx: number; overageEntites: number; total: number } {
  const tier = tiers[subscribedIndex]
  const overageTx = overageMur(tiers, subscribedIndex, transactions)

  const entitesIncluses = tier?.entitesMax
  const overageEntites = entitesIncluses === null || entitesIncluses === undefined
    ? 0
    : Math.max(0, entites - entitesIncluses) * OVERAGE_MUR_PER_ENTITE

  const base = tier?.monthly ?? 0
  return { base, overageTx, overageEntites, total: base + overageTx + overageEntites }
}
