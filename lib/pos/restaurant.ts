/**
 * lib/pos/restaurant.ts — Modèle restaurant (couche PURE).
 *
 * Validation des tables et des lignes d'addition, et calcul des totaux d'une
 * addition (réutilise calculerTotaux du panier). Aucune I/O.
 */

import { calculerTotaux, type TotauxPanier } from './panier'

export interface TablePayload {
  code: string
  nom: string | null
  zone: string | null
  capacite: number | null
}

type Res<T> = { ok: true; data: T } | { ok: false; error: string }

const optInt = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

export function validateTablePayload(body: unknown): Res<TablePayload> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requis' }
  const b = body as Record<string, unknown>
  const code = typeof b.code === 'string' ? b.code.trim() : ''
  if (!code) return { ok: false, error: 'code requis' }
  if (code.length > 20) return { ok: false, error: 'code trop long (max 20)' }
  const capacite = optInt(b.capacite)
  if (capacite !== null && capacite <= 0) return { ok: false, error: 'capacité invalide' }
  return {
    ok: true,
    data: {
      code,
      nom: b.nom ? String(b.nom).trim().slice(0, 100) : null,
      zone: b.zone ? String(b.zone).trim().slice(0, 60) : null,
      capacite,
    },
  }
}

export interface AdditionLignePayload {
  produit_id: string
  quantite: number
  prix_unitaire_ht: number
  remise_pct: number
  taux_tva: number
  note: string | null
}

export function validateAdditionLignePayload(body: unknown, prixDefaut?: number, tvaDefaut?: number): Res<AdditionLignePayload> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requis' }
  const b = body as Record<string, unknown>
  const produit_id = String(b.produit_id || '')
  if (!produit_id) return { ok: false, error: 'produit_id requis' }

  const quantite = Number(b.quantite)
  if (!Number.isFinite(quantite) || quantite <= 0) return { ok: false, error: 'quantité invalide' }

  const prix = b.prix_unitaire_ht === undefined || b.prix_unitaire_ht === null || b.prix_unitaire_ht === ''
    ? (prixDefaut ?? 0) : Number(b.prix_unitaire_ht)
  if (!Number.isFinite(prix) || prix < 0) return { ok: false, error: 'prix_unitaire_ht invalide' }

  const remise = b.remise_pct === undefined || b.remise_pct === null || b.remise_pct === '' ? 0 : Number(b.remise_pct)
  if (!Number.isFinite(remise) || remise < 0 || remise > 100) return { ok: false, error: 'remise invalide (0-100)' }

  const tva = b.taux_tva === undefined || b.taux_tva === null || b.taux_tva === ''
    ? (tvaDefaut ?? 15) : Number(b.taux_tva)
  if (!Number.isFinite(tva) || tva < 0) return { ok: false, error: 'taux_tva invalide' }

  return {
    ok: true,
    data: {
      produit_id, quantite, prix_unitaire_ht: prix, remise_pct: remise, taux_tva: tva,
      note: b.note ? String(b.note).trim().slice(0, 200) : null,
    },
  }
}

export interface LigneAdditionPourTotaux {
  quantite: number
  prix_unitaire_ht: number
  remise_pct: number
  taux_tva: number
}

/** Totaux HT/TVA/TTC d'une addition (mêmes règles que le panier POS). */
export function additionTotaux(lignes: LigneAdditionPourTotaux[]): TotauxPanier {
  return calculerTotaux(
    lignes.map((l) => ({
      produit_id: '',
      quantite: Number(l.quantite) || 0,
      prix_unitaire_ht: Number(l.prix_unitaire_ht) || 0,
      remise_pct: Number(l.remise_pct) || 0,
      taux_tva: Number(l.taux_tva) || 0,
    })),
  )
}

/** Mappe les lignes d'addition vers le format p_lignes de valider_vente_pos. */
export function additionLignesToVente(lignes: Array<LigneAdditionPourTotaux & { produit_id: string }>) {
  return lignes.map((l) => ({
    produit_id: l.produit_id,
    quantite: Number(l.quantite) || 0,
    prix_unitaire_ht: Number(l.prix_unitaire_ht) || 0,
    remise_pct: Number(l.remise_pct) || 0,
    taux_tva: Number(l.taux_tva) || 0,
  }))
}
