/**
 * lib/inventaire/produits.ts — Validation des charges utiles produit.
 * Extrait dans lib/ pour être testable indépendamment des routes Next.js
 * (même pattern que lib/catalogue/validate.ts).
 */

const COMPTE_RE = /^[0-9]{3,10}$/
const UNITES_MAX = 30

export interface ProduitPayload {
  sku: string
  code_barre: string | null
  designation: string
  description: string | null
  categorie: string | null
  unite_mesure: string
  gere_en_stock: boolean
  prix_vente_ht: number
  taux_tva: number
  compte_stock: string
  compte_achat: string
  compte_vente: string
  compte_variation_stock: string
  stock_mini: number
  stock_maxi: number | null
  seuil_alerte: number | null
  actif: boolean
}

type Resultat =
  | { ok: true; data: ProduitPayload }
  | { ok: false; error: string }

function num(value: unknown, fallback: number): number | null {
  if (value === undefined || value === null || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function validateProduitPayload(body: unknown): Resultat {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requis' }
  const b = body as Record<string, unknown>

  const sku = typeof b.sku === 'string' ? b.sku.trim().toUpperCase() : ''
  if (!sku) return { ok: false, error: 'sku requis' }
  if (sku.length > 60) return { ok: false, error: 'sku trop long (max 60)' }

  const designation = typeof b.designation === 'string' ? b.designation.trim() : ''
  if (!designation) return { ok: false, error: 'designation requise' }
  if (designation.length > 300) return { ok: false, error: 'designation trop longue (max 300)' }

  const prix_vente_ht = num(b.prix_vente_ht, 0)
  if (prix_vente_ht === null || prix_vente_ht < 0) return { ok: false, error: 'prix_vente_ht invalide' }

  const taux_tva = num(b.taux_tva, 15)
  if (taux_tva === null || taux_tva < 0 || taux_tva > 100) return { ok: false, error: 'taux_tva invalide (0-100)' }

  const stock_mini = num(b.stock_mini, 0)
  if (stock_mini === null || stock_mini < 0) return { ok: false, error: 'stock_mini invalide' }

  const stock_maxi = b.stock_maxi === undefined || b.stock_maxi === null || b.stock_maxi === ''
    ? null : Number(b.stock_maxi)
  if (stock_maxi !== null && (!Number.isFinite(stock_maxi) || stock_maxi <= 0)) {
    return { ok: false, error: 'stock_maxi invalide' }
  }

  const seuil_alerte = b.seuil_alerte === undefined || b.seuil_alerte === null || b.seuil_alerte === ''
    ? null : Number(b.seuil_alerte)
  if (seuil_alerte !== null && (!Number.isFinite(seuil_alerte) || seuil_alerte < 0)) {
    return { ok: false, error: 'seuil_alerte invalide' }
  }

  const comptes: Array<[keyof ProduitPayload, string]> = [
    ['compte_stock', typeof b.compte_stock === 'string' && b.compte_stock.trim() ? b.compte_stock.trim() : '3701'],
    ['compte_achat', typeof b.compte_achat === 'string' && b.compte_achat.trim() ? b.compte_achat.trim() : '601'],
    ['compte_vente', typeof b.compte_vente === 'string' && b.compte_vente.trim() ? b.compte_vente.trim() : '701'],
    ['compte_variation_stock', typeof b.compte_variation_stock === 'string' && b.compte_variation_stock.trim() ? b.compte_variation_stock.trim() : '6037'],
  ]
  for (const [champ, compte] of comptes) {
    if (!COMPTE_RE.test(compte)) return { ok: false, error: `${String(champ)} invalide (${compte})` }
  }

  return {
    ok: true,
    data: {
      sku,
      code_barre: b.code_barre ? String(b.code_barre).trim().slice(0, 100) : null,
      designation,
      description: b.description ? String(b.description).trim().slice(0, 2000) : null,
      categorie: b.categorie ? String(b.categorie).trim().slice(0, 100) : null,
      unite_mesure: b.unite_mesure ? String(b.unite_mesure).trim().slice(0, UNITES_MAX) : 'unite',
      gere_en_stock: b.gere_en_stock !== false,
      prix_vente_ht,
      taux_tva,
      compte_stock: comptes[0][1],
      compte_achat: comptes[1][1],
      compte_vente: comptes[2][1],
      compte_variation_stock: comptes[3][1],
      stock_mini,
      stock_maxi,
      seuil_alerte,
      actif: b.actif !== false,
    },
  }
}
