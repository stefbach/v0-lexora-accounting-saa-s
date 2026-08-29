/**
 * lib/reporting/synthese-mensuelle.ts — Synthèse mensuelle « en clair » (cible A).
 *
 * Pour le dirigeant autonome (non-comptable) : transforme les agrégats déjà
 * calculés par /api/client/financial (sur une plage = un mois) en réponses
 * simples aux 5 questions qu'il se pose vraiment :
 *   1. Est-ce que j'ai gagné de l'argent ce mois-ci ?
 *   2. Combien est entré / sorti ?
 *   3. Combien je dois reverser à la MRA (TVA) ?
 *   4. Qui me doit de l'argent ?
 *   5. À qui je dois de l'argent ?
 *
 * Pur → aucune dépendance UI/réseau, entièrement testable. Les montants sont
 * en MUR et manipulés via lib/money (jamais de flottant natif pour la monnaie).
 */

import { subMoney, sumMoney, round2 } from '@/lib/money'

export type Ton = 'positif' | 'negatif' | 'neutre' | 'attention'

export interface SyntheseInput {
  /** Libellé lisible du mois, ex. « juillet 2026 ». */
  mois_label: string
  /** Chiffre d'affaires du mois (totalRevenue). */
  revenus: number
  /** Dépenses du mois (totalExpenses). */
  depenses: number
  /** TVA nette : >0 = à reverser à la MRA, <0 = crédit de TVA (tvaNette). */
  tva_nette: number
  /** Créances clients à la fin du mois (creances). */
  creances: number
  /** Dettes fournisseurs (dettesFournisseurs). */
  dettes_fournisseurs: number
  /** Dettes fiscales — TVA/IS/TDS dues (dettesFiscales). */
  dettes_fiscales: number
  /** Dettes sociales — PAYE/CSG/NSF dues (dettesSociales). */
  dettes_sociales: number
  /** Trésorerie : solde bancaire total en MUR (totalBankMUR). */
  tresorerie: number
  /** CA du mois précédent, pour la tendance (lastMonthRevenue). Optionnel. */
  revenus_mois_precedent?: number
}

export interface Carte {
  cle: string
  titre: string
  montant: number
  /** Explication en langage clair (sans le montant, affiché à part). */
  phrase: string
  ton: Ton
}

export interface Synthese {
  mois_label: string
  resultat: number
  total_dettes: number
  verdict: { phrase: string; ton: Ton }
  cartes: Carte[]
}

/** Seuil sous lequel un montant est considéré comme « nul » (arrondi 2 déc.). */
const EPS = 0.01

/** Tendance du CA vs mois précédent, en phrase courte (ou vide). */
function tendanceRevenus(revenus: number, precedent?: number): string {
  if (precedent === undefined || precedent <= EPS) return ''
  const delta = subMoney(revenus, precedent)
  if (Math.abs(delta) <= EPS) return ' Stable par rapport au mois dernier.'
  const pct = Math.round((delta / precedent) * 100)
  return delta > 0
    ? ` En hausse de ${pct}% par rapport au mois dernier.`
    : ` En baisse de ${Math.abs(pct)}% par rapport au mois dernier.`
}

/**
 * Construit la synthèse mensuelle en clair à partir des agrégats financiers.
 */
export function construireSynthese(input: SyntheseInput): Synthese {
  const revenus = round2(input.revenus)
  const depenses = round2(input.depenses)
  const resultat = subMoney(revenus, depenses)
  const tva = round2(input.tva_nette)
  const creances = round2(input.creances)
  const total_dettes = sumMoney([
    input.dettes_fournisseurs, input.dettes_fiscales, input.dettes_sociales,
  ])
  const tresorerie = round2(input.tresorerie)

  const cartes: Carte[] = []

  // 1 — Résultat du mois
  cartes.push({
    cle: 'resultat',
    titre: 'Résultat du mois',
    montant: resultat,
    ton: resultat > EPS ? 'positif' : resultat < -EPS ? 'negatif' : 'neutre',
    phrase:
      resultat > EPS
        ? 'Votre activité a été bénéficiaire : vous avez gagné plus que vous n’avez dépensé.'
        : resultat < -EPS
          ? 'Vos dépenses ont dépassé vos recettes ce mois-ci — un mois à perte.'
          : 'Recettes et dépenses s’équilibrent : ni gain ni perte ce mois-ci.',
  })

  // 2 — Revenus (CA)
  cartes.push({
    cle: 'revenus',
    titre: 'Ce que vous avez facturé',
    montant: revenus,
    ton: 'neutre',
    phrase: ('Chiffre d’affaires du mois.' + tendanceRevenus(revenus, input.revenus_mois_precedent)).trim(),
  })

  // 3 — Dépenses
  cartes.push({
    cle: 'depenses',
    titre: 'Ce que vous avez dépensé',
    montant: depenses,
    ton: 'neutre',
    phrase: 'Total des charges et achats du mois.',
  })

  // 4 — TVA à reverser
  cartes.push({
    cle: 'tva',
    titre: tva >= -EPS ? 'TVA à reverser à la MRA' : 'Crédit de TVA',
    montant: Math.abs(tva),
    ton: tva > EPS ? 'attention' : 'neutre',
    phrase:
      tva > EPS
        ? 'Montant de TVA collectée (net) à reverser à la MRA à l’échéance.'
        : tva < -EPS
          ? 'La MRA vous doit ce montant : votre TVA déductible dépasse la TVA collectée.'
          : 'Rien à reverser ce mois-ci.',
  })

  // 5 — Ce qu'on vous doit (créances clients)
  cartes.push({
    cle: 'creances',
    titre: 'Ce qu’on vous doit',
    montant: creances,
    ton: creances > EPS ? 'attention' : 'positif',
    phrase:
      creances > EPS
        ? 'Factures client encore impayées — de l’argent à encaisser.'
        : 'Aucune facture client en attente de paiement. Bravo !',
  })

  // 6 — Ce que vous devez (fournisseurs + fiscal + social)
  cartes.push({
    cle: 'dettes',
    titre: 'Ce que vous devez',
    montant: total_dettes,
    ton: total_dettes > EPS ? 'attention' : 'positif',
    phrase:
      total_dettes > EPS
        ? 'Total dû : fournisseurs, taxes (MRA) et charges sociales confondus.'
        : 'Vous n’avez aucune dette en cours. Situation saine.',
  })

  // 7 — Trésorerie
  cartes.push({
    cle: 'tresorerie',
    titre: 'Ce que vous avez en banque',
    montant: tresorerie,
    ton: tresorerie > EPS ? 'positif' : 'attention',
    phrase:
      tresorerie > EPS
        ? 'Solde disponible sur vos comptes, aujourd’hui.'
        : 'Trésorerie à zéro ou négative — surveillez vos encaissements.',
  })

  return {
    mois_label: input.mois_label,
    resultat,
    total_dettes,
    verdict: construireVerdict(resultat, tresorerie, total_dettes),
    cartes,
  }
}

/** Verdict global en une phrase, honnête et sans jargon. */
function construireVerdict(resultat: number, tresorerie: number, dettes: number): { phrase: string; ton: Ton } {
  if (resultat < -EPS) {
    return {
      ton: 'negatif',
      phrase: 'Mois à perte : vos dépenses ont dépassé vos recettes. Regardez le détail ci-dessous et priorisez les encaissements.',
    }
  }
  if (resultat <= EPS) {
    return { ton: 'neutre', phrase: 'Mois à l’équilibre : ni gain ni perte. Rien d’alarmant.' }
  }
  // résultat positif
  if (tresorerie <= EPS) {
    return {
      ton: 'attention',
      phrase: 'Mois bénéficiaire, mais votre trésorerie est basse : vos bénéfices sont sans doute immobilisés dans des factures impayées.',
    }
  }
  if (dettes > tresorerie) {
    return {
      ton: 'attention',
      phrase: 'Mois bénéficiaire et trésorerie positive, mais ce que vous devez dépasse ce que vous avez en banque : anticipez les échéances.',
    }
  }
  return {
    ton: 'positif',
    phrase: 'Bon mois : activité bénéficiaire, trésorerie positive et dettes maîtrisées.',
  }
}
