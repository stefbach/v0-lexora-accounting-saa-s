/**
 * lib/reporting/estimation-impot.ts — Estimation d'impôt « live » (cible A).
 *
 * Pour le dirigeant autonome : une estimation *indicative* de ce qu'il devra à
 * la MRA, calculée en continu à partir de ses chiffres, pour éviter la mauvaise
 * surprise. Couvre les deux postes qui l'inquiètent le plus :
 *   - l'impôt sur les sociétés (CIT/IS) sur le résultat de l'exercice ;
 *   - la TVA nette à reverser sur la période.
 *
 * NB : ce n'est pas la déclaration officielle. Le calcul CIT officiel (avec
 * retraitements fiscaux, FTC, crédits TDS/APS) reste côté comptable
 * (app/api/comptable/mra/cit + table cit_returns). Ici on donne un ordre de
 * grandeur honnête, sur la base du résultat comptable avant retraitements.
 *
 * Pur → testable. Montants MUR via lib/money (jamais de flottant natif).
 */

import { round2, mulMoney, sumMoney } from '@/lib/money'

/** Taux d'IS selon le régime mauricien (aligné sur app/api/comptable/mra/cit). */
export function tauxISPct(regime?: string | null): number {
  return regime === 'gbc1' || regime === 'authorised_company' ? 3 : 15
}

export interface EstimationInput {
  /** Résultat comptable cumulé de l'exercice en cours (peut être négatif). */
  resultat_exercice: number
  /** Régime de la société (domestic par défaut → 15 %). */
  regime?: string | null
  /** TVA nette de la période : >0 = à reverser, <0 = crédit. */
  tva_nette: number
  /** La société est-elle assujettie à la TVA ? (sinon, poste TVA masqué). */
  tva_assujetti: boolean
}

export interface LigneImpot {
  cle: 'is' | 'tva'
  titre: string
  /** Base de calcul (résultat, TVA collectée nette…). */
  base: number
  /** Taux appliqué en % (null si non pertinent, ex. TVA déjà nette). */
  taux_pct: number | null
  /** Montant estimé dû (toujours ≥ 0 ; un crédit est signalé à part). */
  montant: number
  /** Vrai si c'est un crédit en votre faveur plutôt qu'un dû. */
  credit: boolean
  /** Repère d'échéance MRA en langage clair. */
  echeance: string
  /** Explication en langage simple. */
  explication: string
}

export interface EstimationImpot {
  lignes: LigneImpot[]
  /** Total estimé à provisionner (somme des dus, hors crédits). */
  total_a_provisionner: number
  taux_is_pct: number
}

/**
 * Construit l'estimation d'impôt indicative à partir des chiffres du dirigeant.
 */
export function estimerImpot(input: EstimationInput): EstimationImpot {
  const taux = tauxISPct(input.regime)
  const resultat = round2(input.resultat_exercice)
  const tva = round2(input.tva_nette)
  const lignes: LigneImpot[] = []

  // ── Impôt sur les sociétés (IS/CIT) ─────────────────────────────────────
  const baseIS = Math.max(0, resultat)
  const impotIS = round2(mulMoney(baseIS, taux / 100))
  lignes.push({
    cle: 'is',
    titre: 'Impôt sur les sociétés (estimé)',
    base: baseIS,
    taux_pct: taux,
    montant: impotIS,
    credit: false,
    echeance: 'À payer dans les 6 mois suivant la clôture de l’exercice.',
    explication:
      resultat > 0
        ? `Environ ${taux} % de votre résultat de l’exercice. Provisionnez-le dès maintenant pour ne pas être surpris.`
        : 'Résultat nul ou déficitaire : pas d’impôt sur les sociétés estimé sur cette base.',
  })

  // ── TVA nette à reverser ────────────────────────────────────────────────
  if (input.tva_assujetti) {
    const credit = tva < 0
    lignes.push({
      cle: 'tva',
      titre: credit ? 'TVA — crédit en votre faveur' : 'TVA à reverser',
      base: Math.abs(tva),
      taux_pct: null,
      montant: Math.abs(tva),
      credit,
      echeance: credit
        ? 'Reportable sur la prochaine déclaration de TVA.'
        : 'À reverser à la MRA à l’échéance de votre déclaration (mensuelle ou trimestrielle).',
      explication: credit
        ? 'Votre TVA déductible dépasse la TVA collectée : la MRA vous doit ce montant.'
        : 'TVA collectée sur vos ventes, nette de la TVA déductible sur vos achats.',
    })
  }

  const total_a_provisionner = sumMoney(
    lignes.filter(l => !l.credit).map(l => l.montant),
  )

  return { lignes, total_a_provisionner, taux_is_pct: taux }
}
