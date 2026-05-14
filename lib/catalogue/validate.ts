/**
 * Validation des charges utiles du catalogue produits/services.
 * Extrait dans lib/ pour être testable indépendamment des routes Next.js
 * (vitest n'inclut que lib/ et tests/).
 */

const DEVISES_OK = ['MUR', 'EUR', 'USD', 'GBP'] as const

export interface CataloguePayload {
  description: string
  prix_unitaire: number
  devise: string
  tva_applicable: boolean
  categorie: string | null
  unite: string
  actif: boolean
}

export function validateCataloguePayload(
  body: any,
): { ok: true; data: CataloguePayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requis' }
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (!description) return { ok: false, error: 'description requise' }
  if (description.length > 500) return { ok: false, error: 'description trop longue (max 500)' }

  const prix_unitaire = Number(body.prix_unitaire)
  if (!Number.isFinite(prix_unitaire) || prix_unitaire < 0) {
    return { ok: false, error: 'prix_unitaire invalide' }
  }
  const devise = typeof body.devise === 'string' ? body.devise.toUpperCase() : 'MUR'
  if (!DEVISES_OK.includes(devise as any)) {
    return { ok: false, error: `devise invalide (${DEVISES_OK.join(', ')})` }
  }
  const tva_applicable = body.tva_applicable === true || body.tva_applicable === undefined
  const categorie = body.categorie ? String(body.categorie).trim().slice(0, 100) : null
  const unite = body.unite ? String(body.unite).trim().slice(0, 50) : 'Forfait'
  const actif = body.actif === false ? false : true
  return {
    ok: true,
    data: { description, prix_unitaire, devise, tva_applicable, categorie, unite, actif },
  }
}
