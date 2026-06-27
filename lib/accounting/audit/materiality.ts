/**
 * Matérialité — benchmark indicatif, À CONFIRMER PAR L'AUDITEUR.
 *
 * Approche pragmatique (ISA 320 simplifiée) : on prend le maximum entre un % du
 * total des actifs et un % du chiffre d'affaires, avec un plancher. L'auditeur
 * fixera SA matérialité ; ici on ne fait que cadrer les seuils de signalement.
 */
import type { TrialBalanceLine, Materialite } from './types'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function computeMaterialite(balanceN: TrialBalanceLine[], plancher = 50_000): Materialite {
  // Total actifs ≈ somme des soldes débiteurs des classes 2,3,5 (immobilisations,
  // stocks, trésorerie) + créances tiers débitrices (classe 4 solde > 0).
  let totalActifs = 0
  let revenue = 0
  for (const l of balanceN) {
    if ([2, 3, 5].includes(l.classe) && l.solde > 0) totalActifs += l.solde
    if (l.classe === 4 && l.solde > 0) totalActifs += l.solde
    // Produits (classe 7) : solde normalement créditeur (négatif) → CA = -solde.
    if (l.classe === 7) revenue += Math.max(0, -l.solde)
  }

  const parActifs = totalActifs * 0.01 // 1 % des actifs
  const parRevenue = revenue * 0.005 // 0,5 % du CA
  const base = Math.max(totalActifs, revenue)
  const methode = totalActifs >= revenue ? '1 % du total des actifs' : '0,5 % du chiffre d’affaires'
  const seuil = Math.max(plancher, round2(Math.max(parActifs, parRevenue)))

  return {
    base: round2(base),
    methode,
    seuil,
    seuil_pct: base > 0 ? round2((seuil / base) * 100) : 0,
  }
}
