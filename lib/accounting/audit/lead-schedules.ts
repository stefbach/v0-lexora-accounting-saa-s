/**
 * Génération des feuilles maîtresses (lead schedules) — la 1ʳᵉ chose que tout
 * auditeur réclame : chaque poste des états financiers rapproché à la balance,
 * avec comparatif N / N-1 et variation.
 *
 * Regroupement par préfixe à 2 chiffres du numéro de compte (sous-classe PCM),
 * data-driven (pas de mapping codé en dur fragile). La rubrique reprend le
 * libellé de classe + le préfixe ; les lignes portent leur propre libellé.
 */
import type { TrialBalanceLine, LeadSchedule, LeadScheduleLine } from './types'

export const CLASSE_LABELS: Record<number, string> = {
  1: 'Capitaux propres & passifs long terme',
  2: 'Immobilisations',
  3: 'Stocks',
  4: 'Tiers',
  5: 'Trésorerie & finances',
  6: 'Charges',
  7: 'Produits',
}

export function classeLabel(classe: number): string {
  return CLASSE_LABELS[classe] || `Classe ${classe}`
}

function variationPct(n: number, n1: number): number | null {
  if (n1 === 0) return null
  return ((n - n1) / Math.abs(n1)) * 100
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Construit les feuilles maîtresses à partir de la balance N et N-1.
 * @param balanceN  lignes de balance de l'exercice courant
 * @param balanceN1 lignes de balance de l'exercice précédent (peut être vide)
 * @param seuilMaterialite seuil au-delà duquel une variation est signalée
 */
export function buildLeadSchedules(
  balanceN: TrialBalanceLine[],
  balanceN1: TrialBalanceLine[],
  seuilMaterialite: number,
): LeadSchedule[] {
  const n1ByCompte = new Map<string, number>()
  for (const l of balanceN1) n1ByCompte.set(l.numero_compte, l.solde)

  // Index N-1 pour repérer les comptes disparus (présents N-1, absents N).
  const comptesN = new Set(balanceN.map((l) => l.numero_compte))

  // Regroupe toutes les lignes (N + comptes disparus) par préfixe 2 chiffres.
  type Bucket = { classe: number; lines: Map<string, LeadScheduleLine> }
  const buckets = new Map<string, Bucket>()

  const prefix2 = (compte: string) => (compte || '').slice(0, 2).padEnd(2, '0')

  const ensureLine = (bucket: Bucket, compte: string, libelle: string): LeadScheduleLine => {
    let line = bucket.lines.get(compte)
    if (!line) {
      line = { numero_compte: compte, libelle, solde_n: 0, solde_n1: 0, variation: 0, variation_pct: null }
      bucket.lines.set(compte, line)
    }
    return line
  }

  for (const l of balanceN) {
    const code = prefix2(l.numero_compte)
    if (!buckets.has(code)) buckets.set(code, { classe: l.classe, lines: new Map() })
    const bucket = buckets.get(code)!
    const line = ensureLine(bucket, l.numero_compte, l.libelle)
    line.solde_n = round2(l.solde)
    line.solde_n1 = round2(n1ByCompte.get(l.numero_compte) ?? 0)
  }

  // Comptes présents N-1 mais disparus en N (solde_n = 0).
  for (const l of balanceN1) {
    if (comptesN.has(l.numero_compte)) continue
    const code = prefix2(l.numero_compte)
    if (!buckets.has(code)) buckets.set(code, { classe: l.classe, lines: new Map() })
    const bucket = buckets.get(code)!
    const line = ensureLine(bucket, l.numero_compte, l.libelle)
    line.solde_n1 = round2(l.solde)
  }

  const schedules: LeadSchedule[] = []
  for (const [code, bucket] of buckets) {
    const lines = [...bucket.lines.values()]
      .map((line) => {
        const variation = round2(line.solde_n - line.solde_n1)
        return { ...line, variation, variation_pct: variationPct(line.solde_n, line.solde_n1) }
      })
      .sort((a, b) => a.numero_compte.localeCompare(b.numero_compte))

    const total_n = round2(lines.reduce((s, l) => s + l.solde_n, 0))
    const total_n1 = round2(lines.reduce((s, l) => s + l.solde_n1, 0))
    const variation = round2(total_n - total_n1)
    schedules.push({
      code,
      caption: `${classeLabel(bucket.classe)} — ${code}`,
      classe: bucket.classe,
      lines,
      total_n,
      total_n1,
      variation,
      variation_pct: variationPct(total_n, total_n1),
      flagged: Math.abs(variation) >= seuilMaterialite,
    })
  }

  return schedules.sort((a, b) => a.code.localeCompare(b.code))
}
