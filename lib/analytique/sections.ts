/**
 * lib/analytique/sections.ts — Comptabilité analytique (dimension unifiée).
 *
 * Couche PURE et testable : types, validation de section, et calcul du P&L
 * analytique d'une section à partir des écritures qui lui sont rattachées
 * (ecritures_comptables_v2.section_analytique_id, migration 500).
 *
 * Convention P&L analytique : charges = comptes classe 6 (sens débit),
 * produits = comptes classe 7 (sens crédit). Marge = produits − charges.
 */

export const SECTION_TYPES = ['chantier', 'production', 'centre_cout', 'projet'] as const
export type SectionType = (typeof SECTION_TYPES)[number]

export const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  chantier: 'Chantier / Affaire',
  production: 'Ordre de fabrication',
  centre_cout: 'Centre de coût',
  projet: 'Projet',
}

export interface SectionPayload {
  code: string
  libelle: string
  type: SectionType
  budget_montant: number | null
  budget_heures: number | null
}

type Resultat =
  | { ok: true; data: SectionPayload }
  | { ok: false; error: string }

function optNum(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Valide une section créée manuellement (centre de coût / projet).
 * Les sections `chantier`/`production` sont créées automatiquement depuis
 * les jobs / ordres de fabrication — pas via ce formulaire.
 */
export function validateSectionPayload(body: unknown): Resultat {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requis' }
  const b = body as Record<string, unknown>

  const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : ''
  if (!code) return { ok: false, error: 'code requis' }
  if (code.length > 40) return { ok: false, error: 'code trop long (max 40)' }

  const libelle = typeof b.libelle === 'string' ? b.libelle.trim() : ''
  if (!libelle) return { ok: false, error: 'libelle requis' }
  if (libelle.length > 200) return { ok: false, error: 'libelle trop long (max 200)' }

  const type = b.type as SectionType
  if (!SECTION_TYPES.includes(type)) return { ok: false, error: 'type invalide' }

  const budget_montant = optNum(b.budget_montant)
  if (budget_montant !== null && budget_montant < 0) return { ok: false, error: 'budget_montant invalide' }
  const budget_heures = optNum(b.budget_heures)
  if (budget_heures !== null && budget_heures < 0) return { ok: false, error: 'budget_heures invalide' }

  return { ok: true, data: { code, libelle, type, budget_montant, budget_heures } }
}

export interface EcritureAnalytique {
  numero_compte: string
  debit_mur: number | string | null
  credit_mur: number | string | null
}

export interface SectionPnl {
  produits: number
  charges: number
  marge: number
  marge_pct: number | null
  nb_ecritures: number
}

const n = (v: number | string | null | undefined): number => {
  const x = typeof v === 'string' ? Number(v) : (v ?? 0)
  return Number.isFinite(x as number) ? (x as number) : 0
}
const round2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100

/**
 * Calcule le P&L analytique d'une section à partir de ses écritures.
 * Classe 6 → charges (débit − crédit) ; classe 7 → produits (crédit − débit).
 */
export function computeSectionPnl(ecritures: EcritureAnalytique[]): SectionPnl {
  let produits = 0
  let charges = 0
  for (const e of ecritures) {
    const cls = String(e.numero_compte || '').charAt(0)
    const d = n(e.debit_mur)
    const c = n(e.credit_mur)
    if (cls === '7') produits += c - d
    else if (cls === '6') charges += d - c
  }
  produits = round2(produits)
  charges = round2(charges)
  const marge = round2(produits - charges)
  return {
    produits,
    charges,
    marge,
    marge_pct: produits !== 0 ? round2((marge / produits) * 100) : null,
    nb_ecritures: ecritures.length,
  }
}

/** Regroupe des écritures par section_analytique_id (null = non analytique). */
export function groupBySection<T extends { section_analytique_id: string | null }>(
  rows: T[],
): Map<string | null, T[]> {
  const m = new Map<string | null, T[]>()
  for (const r of rows) {
    const k = r.section_analytique_id ?? null
    const arr = m.get(k)
    if (arr) arr.push(r)
    else m.set(k, [r])
  }
  return m
}
