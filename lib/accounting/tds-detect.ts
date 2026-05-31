/**
 * Détection TDS unifiée à la saisie d'une facture fournisseur.
 *
 * Wrappe autoClassifyTds + computeTds (lib/accounting/tds) pour produire un
 * résultat unique réutilisable depuis :
 *   - le hook documents/upload (après création facture OCR)
 *   - l'endpoint /api/client/mra/tds-detect (suggestion live à la saisie)
 *   - l'agent Telegram (outil tds_detect)
 *
 * Ne MUTE rien : renvoie juste le diagnostic. La persistance est faite par
 * l'appelant (UPDATE facture.tds_*).
 */
import { autoClassifyTds, computeTds, TDS_RATES, type TdsCategory } from './tds'

export type TdsDetectInput = {
  montant_ht?: number | null
  montant_ttc?: number | null
  numero_compte?: string | null   // ex: '6132100'
  description?: string | null     // libellé facture
  tiers_country?: string | null   // ISO code (ex: 'FR', 'GB', 'MU')
}

export type TdsDetectResult = {
  applies: boolean
  category: TdsCategory
  category_label: string
  rate_pct: number
  threshold_mur: number
  base_mur: number               // montant HT (ou TTC à défaut) utilisé pour le calcul
  tds_amount_mur: number         // retenue à payer à la MRA
  net_to_supplier_mur: number    // ce que touche réellement le fournisseur
  rationale: string              // pourquoi cette catégorie (pour log/UI)
}

/**
 * Détecte si une facture est soumise à TDS Maurice et calcule la retenue.
 * Préfère montant_ht (base TDS Maurice). Fallback montant_ttc si HT manquant.
 */
export function detectTds(input: TdsDetectInput): TdsDetectResult {
  const base = Number(input.montant_ht ?? input.montant_ttc ?? 0) || 0
  const category = autoClassifyTds({
    numero_compte: input.numero_compte ?? null,
    description: input.description ?? null,
    tiers_country: input.tiers_country ?? null,
  })
  const def = TDS_RATES[category]
  const { amount, applies, rate } = computeTds(base, category)
  const net = applies ? Math.round((base - amount) * 100) / 100 : base
  const rationale = applies
    ? `Détecté ${def.label} (${rate}%) sur ${base} MUR — TDS ${amount} → net fournisseur ${net}`
    : category === 'none'
      ? 'Aucune catégorie TDS détectée'
      : `${def.label} sous le seuil ${def.threshold} MUR — pas de retenue`
  return {
    applies,
    category,
    category_label: def.label,
    rate_pct: rate,
    threshold_mur: def.threshold,
    base_mur: base,
    tds_amount_mur: applies ? amount : 0,
    net_to_supplier_mur: net,
    rationale,
  }
}
