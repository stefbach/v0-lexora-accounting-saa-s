/**
 * lib/manufacturing/ordres.ts — Cycle de vie des ordres de fabrication :
 * quantités théoriques (explosion de BOM), validation des payloads de
 * lancement/clôture, coût de revient. Miroir TypeScript des règles des RPC
 * `consommer_ordre_fabrication` / `produire_ordre_fabrication` (mig 489).
 */

import { money, round2, roundTo } from '@/lib/money'
import { CUMP_DP, QTE_DP } from '@/lib/inventaire/valorisation'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Quantité théorique d'un composant pour un OF (§1.2 de la spec) :
 * quantite_ligne × (quantite_a_produire / quantite_produite_bom) × (1 + taux_perte).
 * Le taux de perte représente le rebut NORMAL attendu — il entre dans le
 * coût de revient (l'écart au-delà part en 6586).
 */
export function quantiteTheorique(
  quantiteLigne: number,
  tauxPertePct: number,
  quantiteAProduire: number,
  quantiteProduiteBom: number,
): number {
  const lot = money(quantiteProduiteBom)
  if (lot.lte(0)) throw new Error('QUANTITE_INVALIDE: quantite_produite de la BOM non positive')
  if (money(quantiteAProduire).lte(0)) throw new Error('QUANTITE_INVALIDE: quantité à produire non positive')
  return roundTo(
    money(quantiteLigne)
      .times(money(quantiteAProduire).dividedBy(lot))
      .times(money(1).plus(money(tauxPertePct).dividedBy(100))),
    QTE_DP,
  )
}

export interface LigneConsommationTheorique {
  produit_id: string
  quantite_theorique: number
}

/** Explosion de la BOM pour une quantité à produire donnée. */
export function buildLignesConsommation(
  lignesBom: Array<{ produit_composant_id: string; quantite: number; taux_perte_pct: number }>,
  quantiteAProduire: number,
  quantiteProduiteBom: number,
): LigneConsommationTheorique[] {
  return lignesBom.map((l) => ({
    produit_id: l.produit_composant_id,
    quantite_theorique: quantiteTheorique(l.quantite, l.taux_perte_pct, quantiteAProduire, quantiteProduiteBom),
  }))
}

// ── Payloads ──────────────────────────────────────────────────────────

export interface OrdrePayload {
  nomenclature_id: string
  quantite_a_produire: number
  depot_id: string | null
  date_planifiee: string | null
  notes: string | null
}

type ResultatOrdre = { ok: true; data: OrdrePayload } | { ok: false; error: string }

export function validateOrdrePayload(body: unknown): ResultatOrdre {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requis' }
  const b = body as Record<string, unknown>

  const nomenclature_id = typeof b.nomenclature_id === 'string' ? b.nomenclature_id.trim() : ''
  if (!nomenclature_id) return { ok: false, error: 'nomenclature_id requis' }

  const quantite = Number(b.quantite_a_produire)
  if (!Number.isFinite(quantite) || quantite <= 0) {
    return { ok: false, error: 'quantite_a_produire doit être strictement positive' }
  }

  return {
    ok: true,
    data: {
      nomenclature_id,
      quantite_a_produire: roundTo(quantite, QTE_DP),
      depot_id: typeof b.depot_id === 'string' && b.depot_id.trim() ? b.depot_id.trim() : null,
      date_planifiee:
        typeof b.date_planifiee === 'string' && DATE_RE.test(b.date_planifiee) ? b.date_planifiee : null,
      notes: b.notes ? String(b.notes).trim().slice(0, 1000) : null,
    },
  }
}

export interface LigneLancement {
  produit_id: string
  quantite_theorique: number
  quantite_reelle: number
}

type ResultatLancement =
  | { ok: true; data: { lignes: LigneLancement[]; date: string } }
  | { ok: false; error: string }

/** Lignes de consommation saisies au lancement (réel prérempli = théorique). */
export function validateLancementPayload(body: unknown): ResultatLancement {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requis' }
  const b = body as Record<string, unknown>

  const rawLignes = Array.isArray(b.lignes) ? b.lignes : []
  if (rawLignes.length === 0) return { ok: false, error: 'Au moins une ligne de consommation requise' }

  const lignes: LigneLancement[] = []
  const vus = new Set<string>()
  for (const raw of rawLignes) {
    const l = (raw || {}) as Record<string, unknown>
    const produit_id = typeof l.produit_id === 'string' ? l.produit_id.trim() : ''
    if (!produit_id) return { ok: false, error: 'produit_id requis sur chaque ligne' }
    if (vus.has(produit_id)) return { ok: false, error: 'Composant en double dans la consommation' }
    vus.add(produit_id)

    const reelle = Number(l.quantite_reelle)
    if (!Number.isFinite(reelle) || reelle <= 0) {
      return { ok: false, error: 'quantite_reelle strictement positive requise' }
    }
    const theorique = l.quantite_theorique === undefined || l.quantite_theorique === null
      ? reelle
      : Number(l.quantite_theorique)
    if (!Number.isFinite(theorique) || theorique < 0) {
      return { ok: false, error: 'quantite_theorique invalide' }
    }
    lignes.push({
      produit_id,
      quantite_theorique: roundTo(theorique, QTE_DP),
      quantite_reelle: roundTo(reelle, QTE_DP),
    })
  }

  const date = typeof b.date === 'string' && DATE_RE.test(b.date)
    ? b.date
    : new Date().toISOString().slice(0, 10)

  return { ok: true, data: { lignes, date } }
}

type ResultatProduction =
  | { ok: true; data: { quantite_produite: number; date: string } }
  | { ok: false; error: string }

export function validateProductionPayload(body: unknown): ResultatProduction {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requis' }
  const b = body as Record<string, unknown>
  const quantite = Number(b.quantite_produite)
  if (!Number.isFinite(quantite) || quantite <= 0) {
    return { ok: false, error: 'quantite_produite doit être strictement positive' }
  }
  const date = typeof b.date === 'string' && DATE_RE.test(b.date)
    ? b.date
    : new Date().toISOString().slice(0, 10)
  return { ok: true, data: { quantite_produite: roundTo(quantite, QTE_DP), date } }
}

// ── Coûts ─────────────────────────────────────────────────────────────

/**
 * Coût de revient unitaire figé à la clôture :
 * (matières imputées à l'en-cours + main d'œuvre) / quantité produite.
 * Jamais recalculé rétroactivement (R6 / §1.8 de la spec).
 */
export function coutUnitaireRevient(
  coutMatieres: number,
  coutMainOeuvre: number,
  quantiteProduite: number,
): number {
  const q = money(quantiteProduite)
  if (q.lte(0)) throw new Error('QUANTITE_INVALIDE: quantité produite non positive')
  return roundTo(money(coutMatieres).plus(money(coutMainOeuvre)).dividedBy(q), CUMP_DP)
}

/** Écart de valeur réel − théorique (positif = surconsommation → 6586 débit). */
export function ecartConsommation(valeurTheorique: number, valeurReelle: number): number {
  return round2(money(valeurReelle).minus(money(valeurTheorique)))
}

/** Numéro d'OF lisible : OF-<année>-<séquence 4 chiffres>. */
export function numeroOF(annee: number | string, sequence: number): string {
  return `OF-${annee}-${String(sequence).padStart(4, '0')}`
}
