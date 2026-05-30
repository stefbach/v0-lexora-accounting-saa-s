/**
 * Logique pure des régularisations TVA période antérieure.
 *
 * Extrait du endpoint /api/comptable/tva/regularisations pour être testable
 * unitairement (compta : l'exactitude prime). Aucune dépendance réseau / DB.
 *
 * Principe métier : des factures d'une période déjà déclarée et figée sont
 * saisies après coup → l'écart de TVA (recalculé vs déclaré MRA) est porté en
 * régularisation sur la période courante (prior-period adjustment MRA). La
 * compta reste à la vraie date, aucune écriture n'est créée.
 */

export const SENS = ['collectee', 'deductible', 'net'] as const
export type Sens = (typeof SENS)[number]
export const TYPES = ['ecart_auto', 'manuel'] as const
export type TypeRegul = (typeof TYPES)[number]
export const STATUTS = ['proposee', 'incluse', 'ignoree'] as const
export type StatutRegul = (typeof STATUTS)[number]

export const isYM = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}$/.test(s)

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** Bornes SQL (1er → dernier jour) d'un mois YYYY-MM. */
export function moisBornes(periode: string): { debut: string; fin: string } {
  const [y, m] = periode.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return { debut: `${periode}-01`, fin: `${periode}-${String(lastDay).padStart(2, '0')}` }
}

/** Date limite MRA : 20 du mois qui suit la période. */
export function dateLimiteFromPeriode(periode: string): string {
  const [y, m] = periode.split('-').map(Number)
  const mm = m === 12 ? 1 : m + 1
  const yy = m === 12 ? y + 1 : y
  return `${yy}-${String(mm).padStart(2, '0')}-20`
}

export interface FactureLike {
  type_facture?: string | null
  montant_tva?: number | string | null
  devise?: string | null
  client_offshore?: boolean | null
}

/**
 * TVA d'une facture selon sa nature (mêmes règles que l'onglet Rattrapage) :
 *  - client local taxable (pas offshore, MUR)  → collectée
 *  - fournisseur local (MUR)                    → déductible
 *  - étranger / offshore                        → 0 (hors champ TVA locale)
 */
export function tvaFacture(f: FactureLike): { collectee: number; deductible: number } {
  const tva = Number(f.montant_tva) || 0
  const isForeign = !!f.devise && f.devise !== 'MUR'
  if (f.type_facture === 'client' && !f.client_offshore && !isForeign) {
    return { collectee: tva, deductible: 0 }
  }
  if (f.type_facture === 'fournisseur' && !isForeign) {
    return { collectee: 0, deductible: tva }
  }
  return { collectee: 0, deductible: 0 }
}

/** Net TVA estimé (collectée − déductible) d'un lot de factures. */
export function netteFactures(factures: FactureLike[]): number {
  let collectee = 0, deductible = 0
  for (const f of factures) {
    const t = tvaFacture(f)
    collectee += t.collectee
    deductible += t.deductible
  }
  return round2(collectee - deductible)
}

/**
 * Écart de régularisation = TVA recalculée − montant déclaré à la MRA.
 * + = à payer en plus sur la période courante ; − = crédit.
 */
export function computeEcart(recalc: number, declare: number): number {
  return round2((Number(recalc) || 0) - (Number(declare) || 0))
}

export interface LigneInput {
  periode_origine?: string | null
  libelle?: string | null
  montant?: number | string | null
  sens?: string | null
  type?: string | null
  facture_id?: string | null
  motif?: string | null
  statut?: string | null
}

export interface LigneNormalisee {
  periode_origine: string | null
  libelle: string
  montant: number
  sens: Sens
  type: TypeRegul
  facture_id: string | null
  motif: string | null
  statut: StatutRegul
}

/**
 * Normalise/valide une ligne saisie. Retourne null si la ligne est vide
 * (libellé absent) → elle est ignorée à l'enregistrement.
 */
export function normalizeLigne(l: LigneInput): LigneNormalisee | null {
  const libelle = (l?.libelle ?? '').toString().trim()
  if (libelle.length === 0) return null
  return {
    periode_origine: isYM(l.periode_origine) ? l.periode_origine : null,
    libelle: libelle.slice(0, 300),
    montant: round2(Number(l.montant) || 0),
    sens: (SENS as readonly string[]).includes(l.sens as string) ? (l.sens as Sens) : 'net',
    type: l.type === 'ecart_auto' ? 'ecart_auto' : 'manuel',
    facture_id: l.facture_id || null,
    motif: l.motif ? String(l.motif).slice(0, 500) : null,
    statut: (STATUTS as readonly string[]).includes(l.statut as string) ? (l.statut as StatutRegul) : 'incluse',
  }
}

/** Total signé des lignes incluses (= montant reporté sur la période courante). */
export function totalInclus(lignes: Array<{ montant?: number | string | null; statut?: string | null }>): number {
  const t = lignes
    .filter(l => l.statut === 'incluse')
    .reduce((s, l) => s + (Number(l.montant) || 0), 0)
  return round2(t)
}
