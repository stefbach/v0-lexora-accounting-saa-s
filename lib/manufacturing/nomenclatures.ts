/**
 * lib/manufacturing/nomenclatures.ts — Validation des BOM (mono-niveau v1)
 * et estimation du coût matières au CUMP courant.
 *
 * L'anti-cycle est verrouillé à trois niveaux : ici (payload), dans l'API
 * (composants sans BOM active) et en base (triggers migration 487).
 */

import { money, roundTo } from '@/lib/money'
import { CUMP_DP, QTE_DP } from '@/lib/inventaire/valorisation'

export interface LigneNomenclaturePayload {
  produit_composant_id: string
  quantite: number
  taux_perte_pct: number
  unite: string | null
}

export interface NomenclaturePayload {
  produit_fini_id: string
  libelle: string | null
  version: string
  quantite_produite: number
  lignes: LigneNomenclaturePayload[]
}

type Resultat =
  | { ok: true; data: NomenclaturePayload }
  | { ok: false; error: string }

export function validateNomenclaturePayload(body: unknown): Resultat {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requis' }
  const b = body as Record<string, unknown>

  const produit_fini_id = typeof b.produit_fini_id === 'string' ? b.produit_fini_id.trim() : ''
  if (!produit_fini_id) return { ok: false, error: 'produit_fini_id requis' }

  const quantite_produite = b.quantite_produite === undefined || b.quantite_produite === null || b.quantite_produite === ''
    ? 1
    : Number(b.quantite_produite)
  if (!Number.isFinite(quantite_produite) || quantite_produite <= 0) {
    return { ok: false, error: 'quantite_produite doit être strictement positive' }
  }

  const rawLignes = Array.isArray(b.lignes) ? b.lignes : []
  if (rawLignes.length === 0) {
    return { ok: false, error: 'Au moins un composant est requis' }
  }

  const lignes: LigneNomenclaturePayload[] = []
  const vus = new Set<string>()
  for (const raw of rawLignes) {
    const l = (raw || {}) as Record<string, unknown>
    const produit_composant_id = typeof l.produit_composant_id === 'string' ? l.produit_composant_id.trim() : ''
    if (!produit_composant_id) return { ok: false, error: 'produit_composant_id requis sur chaque ligne' }
    if (produit_composant_id === produit_fini_id) {
      return { ok: false, error: 'BOM_CYCLE: un composant ne peut pas être le produit fini lui-même' }
    }
    if (vus.has(produit_composant_id)) {
      return { ok: false, error: 'Composant en double dans la nomenclature' }
    }
    vus.add(produit_composant_id)

    const quantite = Number(l.quantite)
    if (!Number.isFinite(quantite) || quantite <= 0) {
      return { ok: false, error: 'quantite de composant strictement positive requise' }
    }
    const taux = l.taux_perte_pct === undefined || l.taux_perte_pct === null || l.taux_perte_pct === ''
      ? 0
      : Number(l.taux_perte_pct)
    if (!Number.isFinite(taux) || taux < 0 || taux >= 100) {
      return { ok: false, error: 'taux_perte_pct doit être compris entre 0 et 100 (exclu)' }
    }
    lignes.push({
      produit_composant_id,
      quantite: roundTo(quantite, QTE_DP),
      taux_perte_pct: roundTo(taux, 2),
      unite: l.unite ? String(l.unite).trim().slice(0, 20) : null,
    })
  }

  return {
    ok: true,
    data: {
      produit_fini_id,
      libelle: b.libelle ? String(b.libelle).trim().slice(0, 200) : null,
      version: b.version ? String(b.version).trim().slice(0, 20) : '1',
      quantite_produite: roundTo(quantite_produite, QTE_DP),
      lignes,
    },
  }
}

/**
 * Coût matières estimé PAR UNITÉ de produit fini, au CUMP courant des
 * composants (indicatif — le coût réel vient des OF). Decimal de bout en
 * bout, arrondi final à 4 décimales (NUMERIC(15,4)).
 */
export function coutMatieresEstime(
  lignes: Array<Pick<LigneNomenclaturePayload, 'produit_composant_id' | 'quantite' | 'taux_perte_pct'>>,
  cumpParProduit: Record<string, number>,
  quantiteProduite: number,
): number {
  const lot = money(quantiteProduite)
  if (lot.lte(0)) throw new Error('QUANTITE_INVALIDE: quantite_produite de la BOM non positive')
  const total = lignes.reduce(
    (acc, l) =>
      acc.plus(
        money(l.quantite)
          .times(money(1).plus(money(l.taux_perte_pct).dividedBy(100)))
          .times(money(cumpParProduit[l.produit_composant_id] ?? 0)),
      ),
    money(0),
  )
  return roundTo(total.dividedBy(lot), CUMP_DP)
}
