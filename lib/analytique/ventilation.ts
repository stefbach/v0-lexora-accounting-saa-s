/**
 * lib/analytique/ventilation.ts — Répartition analytique (couche PURE).
 *
 * Détermine la nature/montant net d'une écriture (classe 6 = charge, 7 = produit)
 * et valide/compose la répartition de ce montant entre sections.
 */

const round2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100
const n = (v: number | string | null | undefined): number => {
  const x = typeof v === 'string' ? Number(v) : (v ?? 0)
  return Number.isFinite(x as number) ? (x as number) : 0
}

export type NatureEcriture = 'charge' | 'produit' | 'autre'

export interface EcritureNet {
  nature: NatureEcriture
  net: number
}

/**
 * Montant net ventilable d'une ligne d'écriture :
 *   classe 6 → charge (débit − crédit), classe 7 → produit (crédit − débit).
 * `net` est le montant positif à répartir ; 0 (ou négatif) = rien à ventiler.
 */
export function ecritureNet(numeroCompte: string, debit: number | string | null, credit: number | string | null): EcritureNet {
  const cls = String(numeroCompte || '').charAt(0)
  const d = n(debit)
  const c = n(credit)
  if (cls === '6') return { nature: 'charge', net: round2(d - c) }
  if (cls === '7') return { nature: 'produit', net: round2(c - d) }
  return { nature: 'autre', net: 0 }
}

export interface Allocation {
  section_analytique_id: string
  montant: number
}

type ValidationResult =
  | { ok: true; allocations: Allocation[]; total: number }
  | { ok: false; error: string }

/**
 * Valide une répartition : montants > 0, pas de section en double, et
 * Σ montants ≤ net (tolérance 0.01). Renvoie les allocations arrondies.
 */
export function validateAllocations(net: number, allocations: Allocation[]): ValidationResult {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return { ok: false, error: 'Au moins une section requise' }
  }
  if (net <= 0) return { ok: false, error: 'Écriture non ventilable (montant net nul)' }

  const seen = new Set<string>()
  let total = 0
  const out: Allocation[] = []
  for (const a of allocations) {
    if (!a.section_analytique_id) return { ok: false, error: 'Section manquante' }
    if (seen.has(a.section_analytique_id)) return { ok: false, error: 'Section en double' }
    seen.add(a.section_analytique_id)
    const m = round2(n(a.montant))
    if (m <= 0) return { ok: false, error: 'Montant de répartition invalide' }
    total = round2(total + m)
    out.push({ section_analytique_id: a.section_analytique_id, montant: m })
  }
  if (total > round2(net) + 0.01) {
    return { ok: false, error: `Répartition (${total}) supérieure au montant à ventiler (${net})` }
  }
  return { ok: true, allocations: out, total }
}

export interface PartPct {
  section_analytique_id: string
  pct: number
}

/**
 * Compose des allocations à partir de pourcentages (le reste d'arrondi va sur
 * la dernière part) — utile pour les clés de répartition.
 */
export function splitByPercentages(net: number, parts: PartPct[]): Allocation[] {
  const valid = parts.filter((p) => p.section_analytique_id && n(p.pct) > 0)
  if (valid.length === 0 || net <= 0) return []
  const out: Allocation[] = []
  let cumul = 0
  valid.forEach((p, i) => {
    const montant = i === valid.length - 1
      ? round2(net - cumul)
      : round2((net * n(p.pct)) / 100)
    cumul = round2(cumul + montant)
    if (montant > 0) out.push({ section_analytique_id: p.section_analytique_id, montant })
  })
  return out
}
