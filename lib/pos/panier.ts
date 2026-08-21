/**
 * lib/pos/panier.ts — Calculs du panier POS et validation du payload de
 * vente. Miroir TypeScript exact des calculs de la RPC `valider_vente_pos`
 * (migration 486) : HT = qté × prix × (1 − remise%), TVA = HT × taux%,
 * arrondis au centime (half-up) ligne par ligne, TTC = HT + TVA.
 *
 * Tout montant transite par lib/money (Decimal.js) — jamais de flottant natif.
 */

import { money, round2, roundTo, moneyEquals } from '@/lib/money'
import { COMPTE_PAR_MOYEN, type MoyenPaiement } from './types'

/** Décimales des quantités (NUMERIC(15,3)). */
export const QTE_DP = 3

export interface LignePanier {
  produit_id: string
  quantite: number
  prix_unitaire_ht: number
  remise_pct: number
  taux_tva: number
}

export interface MontantsLigne {
  montant_ht: number
  montant_tva: number
  montant_ttc: number
}

export interface TotauxPanier {
  total_ht: number
  total_tva: number
  total_ttc: number
}

/** Montants d'une ligne — mêmes arrondis que la RPC (centime, half-up). */
export function calculerLigne(
  ligne: Pick<LignePanier, 'quantite' | 'prix_unitaire_ht' | 'remise_pct' | 'taux_tva'>,
): MontantsLigne {
  const ht = round2(
    money(ligne.quantite)
      .times(money(ligne.prix_unitaire_ht))
      .times(money(1).minus(money(ligne.remise_pct).dividedBy(100))),
  )
  const tva = round2(money(ht).times(money(ligne.taux_tva).dividedBy(100)))
  return { montant_ht: ht, montant_tva: tva, montant_ttc: round2(money(ht).plus(tva)) }
}

/** Totaux du panier — somme précise des montants de ligne déjà arrondis. */
export function calculerTotaux(lignes: LignePanier[]): TotauxPanier {
  let ht = money(0)
  let tva = money(0)
  for (const ligne of lignes) {
    const m = calculerLigne(ligne)
    ht = ht.plus(m.montant_ht)
    tva = tva.plus(m.montant_tva)
  }
  return {
    total_ht: round2(ht),
    total_tva: round2(tva),
    total_ttc: round2(ht.plus(tva)),
  }
}

export interface PaiementPayload {
  moyen_paiement: MoyenPaiement
  montant: number
  reference: string | null
}

export interface VentePayload {
  session_id: string
  lignes: LignePanier[]
  paiements: PaiementPayload[]
  totaux: TotauxPanier
}

type Resultat = { ok: true; data: VentePayload } | { ok: false; error: string }

/**
 * Valide le body d'une vente POS : lignes cohérentes, paiements sur des
 * moyens connus, Σ paiements = TTC recalculé (tolérance 1 centime).
 */
export function validateVentePayload(body: unknown): Resultat {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requis' }
  const b = body as Record<string, unknown>

  const session_id = typeof b.session_id === 'string' ? b.session_id.trim() : ''
  if (!session_id) return { ok: false, error: 'session_id requis' }

  if (!Array.isArray(b.lignes) || b.lignes.length === 0) {
    return { ok: false, error: 'Au moins une ligne de vente est requise' }
  }
  const lignes: LignePanier[] = []
  for (const raw of b.lignes) {
    const l = (raw || {}) as Record<string, unknown>
    const produit_id = typeof l.produit_id === 'string' ? l.produit_id.trim() : ''
    if (!produit_id) return { ok: false, error: 'produit_id requis sur chaque ligne' }
    const quantite = Number(l.quantite)
    if (!Number.isFinite(quantite) || quantite <= 0) {
      return { ok: false, error: 'quantite doit être strictement positive' }
    }
    const prix = Number(l.prix_unitaire_ht)
    if (!Number.isFinite(prix) || prix < 0) {
      return { ok: false, error: 'prix_unitaire_ht invalide' }
    }
    const remise = l.remise_pct == null || l.remise_pct === '' ? 0 : Number(l.remise_pct)
    if (!Number.isFinite(remise) || remise < 0 || remise > 100) {
      return { ok: false, error: 'remise_pct doit être comprise entre 0 et 100' }
    }
    const taux = Number(l.taux_tva)
    if (!Number.isFinite(taux) || taux < 0) {
      return { ok: false, error: 'taux_tva invalide' }
    }
    lignes.push({
      produit_id,
      quantite: roundTo(quantite, QTE_DP),
      prix_unitaire_ht: round2(prix),
      remise_pct: roundTo(remise, 2),
      taux_tva: roundTo(taux, 2),
    })
  }

  if (!Array.isArray(b.paiements) || b.paiements.length === 0) {
    return { ok: false, error: 'Au moins un paiement est requis' }
  }
  const paiements: PaiementPayload[] = []
  for (const raw of b.paiements) {
    const p = (raw || {}) as Record<string, unknown>
    const moyen = String(p.moyen_paiement || '') as MoyenPaiement
    if (!COMPTE_PAR_MOYEN[moyen]) {
      return { ok: false, error: `moyen_paiement invalide (${String(p.moyen_paiement)})` }
    }
    const montant = round2(Number(p.montant))
    if (!(montant > 0)) return { ok: false, error: 'Chaque paiement doit avoir un montant positif' }
    paiements.push({
      moyen_paiement: moyen,
      montant,
      reference: p.reference ? String(p.reference).trim().slice(0, 200) : null,
    })
  }

  const totaux = calculerTotaux(lignes)
  const totalPaye = paiements.reduce((acc, p) => acc.plus(money(p.montant)), money(0))
  if (!moneyEquals(totalPaye, totaux.total_ttc)) {
    return {
      ok: false,
      error: `PAIEMENT_DESEQUILIBRE: ${round2(totalPaye)} payé(s) pour un ticket de ${totaux.total_ttc}`,
    }
  }

  return { ok: true, data: { session_id, lignes, paiements, totaux } }
}

/** Reste à payer d'un panier compte tenu des paiements déjà saisis. */
export function resteAPayer(totalTtc: number, paiements: Array<{ montant: number }>): number {
  const paye = paiements.reduce((acc, p) => acc.plus(money(p.montant)), money(0))
  const reste = money(totalTtc).minus(paye)
  return reste.lte(0) ? 0 : round2(reste)
}
