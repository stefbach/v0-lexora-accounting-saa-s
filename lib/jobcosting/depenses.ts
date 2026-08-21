/**
 * lib/jobcosting/depenses.ts — Validation des dépenses de job (coûts
 * non-salariaux imputés à un job). Réf. spec §2.2.
 */

import { roundTo } from '@/lib/money'
import type { TypeDepense } from './types'

const TYPES_DEPENSE: TypeDepense[] = [
  'achat_materiel',
  'sous_traitance',
  'frais_deplacement',
  'autre',
]
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface DepensePayload {
  type_depense: TypeDepense
  description: string | null
  montant_ht: number
  devise: string
  facture_fournisseur_id: string | null
  note_frais_id: string | null
  facturable: boolean
  marge_refacturation_pct: number
  date_depense: string
}

type Resultat =
  | { ok: true; data: DepensePayload }
  | { ok: false; error: string }

export function validateDepensePayload(body: unknown): Resultat {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requis' }
  const b = body as Record<string, unknown>

  const type_depense = TYPES_DEPENSE.includes(b.type_depense as TypeDepense)
    ? (b.type_depense as TypeDepense)
    : 'autre'

  const montant_ht = Number(b.montant_ht)
  if (!Number.isFinite(montant_ht) || montant_ht < 0) {
    return { ok: false, error: 'montant_ht invalide' }
  }

  let marge = 0
  if (b.marge_refacturation_pct !== undefined && b.marge_refacturation_pct !== null && b.marge_refacturation_pct !== '') {
    const m = Number(b.marge_refacturation_pct)
    if (!Number.isFinite(m) || m < 0 || m > 1000) {
      return { ok: false, error: 'marge_refacturation_pct invalide (0-1000)' }
    }
    marge = m
  }

  const date_depense =
    typeof b.date_depense === 'string' && DATE_RE.test(b.date_depense)
      ? b.date_depense
      : new Date().toISOString().slice(0, 10)

  return {
    ok: true,
    data: {
      type_depense,
      description: b.description ? String(b.description).trim().slice(0, 500) : null,
      montant_ht: roundTo(montant_ht, 2),
      devise: typeof b.devise === 'string' && b.devise.trim() ? b.devise.trim().toUpperCase().slice(0, 3) : 'MUR',
      facture_fournisseur_id:
        typeof b.facture_fournisseur_id === 'string' && b.facture_fournisseur_id.trim()
          ? b.facture_fournisseur_id.trim()
          : null,
      note_frais_id:
        typeof b.note_frais_id === 'string' && b.note_frais_id.trim() ? b.note_frais_id.trim() : null,
      facturable: b.facturable !== false,
      marge_refacturation_pct: marge,
      date_depense,
    },
  }
}

export interface ConsommationStockPayload {
  produit_id: string
  depot_id: string | null
  quantite: number
  date_mouvement: string
  facturable: boolean
  marge_refacturation_pct: number
  motif: string | null
}

/**
 * Valide une demande de consommation de stock imputée à un job (route
 * /jobs/[id]/consommation → RPC consommer_stock_job).
 */
export function validateConsommationStockPayload(body: unknown): { ok: true; data: ConsommationStockPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requis' }
  const b = body as Record<string, unknown>

  const produit_id = typeof b.produit_id === 'string' ? b.produit_id.trim() : ''
  if (!produit_id) return { ok: false, error: 'produit_id requis' }

  const quantite = Number(b.quantite)
  if (!Number.isFinite(quantite) || quantite <= 0) {
    return { ok: false, error: 'quantite doit être strictement positive' }
  }

  let marge = 0
  if (b.marge_refacturation_pct !== undefined && b.marge_refacturation_pct !== null && b.marge_refacturation_pct !== '') {
    const m = Number(b.marge_refacturation_pct)
    if (!Number.isFinite(m) || m < 0 || m > 1000) return { ok: false, error: 'marge_refacturation_pct invalide' }
    marge = m
  }

  const date_mouvement =
    typeof b.date_mouvement === 'string' && DATE_RE.test(b.date_mouvement)
      ? b.date_mouvement
      : new Date().toISOString().slice(0, 10)

  return {
    ok: true,
    data: {
      produit_id,
      depot_id: typeof b.depot_id === 'string' && b.depot_id.trim() ? b.depot_id.trim() : null,
      quantite: roundTo(quantite, 3),
      date_mouvement,
      facturable: b.facturable !== false,
      marge_refacturation_pct: marge,
      motif: b.motif ? String(b.motif).trim().slice(0, 500) : null,
    },
  }
}
