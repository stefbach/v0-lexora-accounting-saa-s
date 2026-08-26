/**
 * lib/analytique/cles.ts — Clés de répartition (couche PURE).
 *
 * Normalise des poids (surface, effectif, %…) en pourcentages, et valide la
 * définition d'une clé. La répartition effective d'un montant réutilise
 * splitByPercentages (lib/analytique/ventilation.ts).
 */

const round4 = (x: number): number => Math.round((x + Number.EPSILON) * 10000) / 10000
const num = (v: number | string | null | undefined): number => {
  const x = typeof v === 'string' ? Number(v) : (v ?? 0)
  return Number.isFinite(x as number) ? (x as number) : 0
}

export const CLE_BASES = ['pourcentage', 'surface', 'effectif', 'ca', 'manuel'] as const
export type CleBase = (typeof CLE_BASES)[number]

export const CLE_BASE_LABELS: Record<CleBase, string> = {
  pourcentage: 'Pourcentage',
  surface: 'Surface (m²)',
  effectif: 'Effectif',
  ca: "Chiffre d'affaires",
  manuel: 'Manuel',
}

export interface CleLigne {
  section_analytique_id: string
  poids: number
}

export interface CleLignePct extends CleLigne {
  pct: number
}

/** Normalise des poids en pourcentages (Σ = 100, reste sur la dernière part). */
export function normalizeWeights(lignes: CleLigne[]): CleLignePct[] {
  const valid = lignes.filter((l) => l.section_analytique_id && num(l.poids) > 0)
  const total = valid.reduce((s, l) => s + num(l.poids), 0)
  if (total <= 0) return []
  let cumul = 0
  return valid.map((l, i) => {
    const pct = i === valid.length - 1 ? round4(100 - cumul) : round4((num(l.poids) / total) * 100)
    cumul = round4(cumul + pct)
    return { section_analytique_id: l.section_analytique_id, poids: num(l.poids), pct }
  })
}

export interface ClePayload {
  code: string
  libelle: string
  base: CleBase
  lignes: CleLigne[]
}

type Resultat =
  | { ok: true; data: ClePayload }
  | { ok: false; error: string }

export function validateClePayload(body: unknown): Resultat {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requis' }
  const b = body as Record<string, unknown>

  const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : ''
  if (!code) return { ok: false, error: 'code requis' }
  if (code.length > 40) return { ok: false, error: 'code trop long (max 40)' }

  const libelle = typeof b.libelle === 'string' ? b.libelle.trim() : ''
  if (!libelle) return { ok: false, error: 'libelle requis' }

  const base = (b.base as CleBase) || 'pourcentage'
  if (!CLE_BASES.includes(base)) return { ok: false, error: 'base invalide' }

  const rawLignes = Array.isArray(b.lignes) ? b.lignes : []
  const seen = new Set<string>()
  const lignes: CleLigne[] = []
  for (const l of rawLignes as any[]) {
    const sid = String(l?.section_analytique_id || '')
    const poids = num(l?.poids)
    if (!sid || poids <= 0) continue
    if (seen.has(sid)) return { ok: false, error: 'Section en double dans la clé' }
    seen.add(sid)
    lignes.push({ section_analytique_id: sid, poids })
  }
  if (lignes.length === 0) return { ok: false, error: 'Au moins une section pondérée requise' }

  return { ok: true, data: { code, libelle, base, lignes } }
}
