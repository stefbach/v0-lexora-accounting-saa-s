/**
 * FIX 9 — Règles comptables universelles (PCG / Mauritius).
 *
 * Source unique pour les sept règles transversales qui doivent être
 * respectées à chaque écriture / lettrage / rapprochement. Chaque
 * endpoint qui manipule des écritures peut importer l'helper voulu
 * pour faire respecter la règle sans dupliquer la logique.
 *
 *   R1 — Équilibre par écriture
 *        Débit total = Crédit total (à l'epsilon près). Violation →
 *        l'écriture n'est pas comptablement valide.
 *
 *   R2 — Unicité du lettrage
 *        Une écriture ne peut pas porter deux codes de lettre
 *        différents simultanément. Si on veut changer la lettre, il
 *        faut d'abord délettrer.
 *
 *   R3 — 580 toujours soldé (cf. FIX 5)
 *        Le compte 580 (virements internes en transit) doit être
 *        soldé à la clôture. Alertes côté GET rapprochement.
 *
 *   R4 — Pas de lettrage forcé (cf. FIX 6)
 *        Si |écart| > seuil auto, refuser le lettrage tant que
 *        l'utilisateur n'a pas qualifié l'écart (change / escompte /
 *        pénalité / exceptionnel).
 *
 *   R5 — Clôture
 *        Aucune modification ne peut être appliquée à une écriture
 *        dont la date est antérieure ou égale à la cloture_date du
 *        dossier (ou de l'exercice fiscal).
 *
 *   R6 — Irréversibilité du rapprochement
 *        Une écriture lettrée/rapprochée ne peut pas voir ses champs
 *        métier (compte, montant, journal, date) modifiés. Seul le
 *        délettrage permet de retirer la lettre, et c'est un geste
 *        conscient qui doit être tracé.
 *
 *   R7 — Pas de lettre sur 6xxx/7xxx (cf. FIX 2)
 *        Le lettrage est réservé aux comptes de tiers (401/411/421/...)
 *        et de transit (580). Jamais sur les comptes de résultat.
 *
 * Les helpers retournent `null` quand la règle est respectée et une
 * chaîne explicative quand elle est violée — c'est à l'appelant de
 * décider quoi faire (rejeter l'action, logger, afficher une alerte).
 */

import { accountClass } from './classification-rules' // pour R7 helper si besoin — non utilisé directement ici

const EPSILON = 0.01 // MUR — seuil de tolérance arrondi

export interface EcritureLike {
  id?: string | null
  compte?: string | null
  debit?: number | string | null
  credit?: number | string | null
  date_ecriture?: string | null
  lettre?: string | null
  journal?: string | null
}

/**
 * R1 — Valide que la somme des débits = somme des crédits pour un
 * ensemble d'écritures qui doivent former une pièce équilibrée.
 * Retourne null si OK, sinon un message d'erreur.
 */
export function assertEquilibre(ecritures: EcritureLike[]): string | null {
  if (!ecritures || ecritures.length === 0) return null
  const totalDebit = ecritures.reduce((s, e) => s + (Number(e.debit) || 0), 0)
  const totalCredit = ecritures.reduce((s, e) => s + (Number(e.credit) || 0), 0)
  const delta = Math.abs(totalDebit - totalCredit)
  if (delta > EPSILON) {
    return `R1 violée — écriture déséquilibrée : débit ${totalDebit.toFixed(2)} ≠ crédit ${totalCredit.toFixed(2)} (écart ${delta.toFixed(2)})`
  }
  return null
}

/**
 * R2 — Valide qu'aucune des écritures fournies ne porte déjà une
 * lettre différente de celle qu'on veut poser. Empêche d'écraser
 * silencieusement un lettrage antérieur.
 */
export function assertLettrageUnique(
  ecritures: EcritureLike[],
  newLettre: string,
): string | null {
  if (!newLettre) return null
  for (const e of ecritures || []) {
    if (e.lettre && e.lettre !== newLettre) {
      return `R2 violée — écriture ${e.id || '(sans id)'} déjà lettrée « ${e.lettre} » — délettrer avant de poser « ${newLettre} »`
    }
  }
  return null
}

/**
 * R5 — Valide que l'écriture est postérieure strictement à la
 * cloture_date fournie. Retourne null si pas de clôture ou si la date
 * est après la clôture, sinon un message d'erreur.
 */
export function assertAfterCloture(
  ecriture: EcritureLike,
  cloture_date: string | null | undefined,
): string | null {
  if (!cloture_date) return null
  if (!ecriture?.date_ecriture) return null
  if (ecriture.date_ecriture <= cloture_date) {
    return `R5 violée — écriture du ${ecriture.date_ecriture} avant/à la clôture du ${cloture_date} — modification interdite`
  }
  return null
}

/**
 * R6 — Valide qu'une écriture déjà rapprochée (lettre posée) ne voit
 * pas ses champs métier modifiés. Compare les champs critiques entre
 * l'état actuel et l'état demandé.
 */
export function assertIrreversibilite(
  current: EcritureLike,
  requested: Partial<EcritureLike>,
): string | null {
  if (!current?.lettre) return null // pas encore lettrée → OK
  // Changer la lettre est permis (via délettrage explicite) — géré par R2.
  const immutable: Array<keyof EcritureLike> = ['compte', 'debit', 'credit', 'date_ecriture', 'journal']
  for (const k of immutable) {
    if (requested[k] !== undefined && requested[k] !== current[k]) {
      return `R6 violée — écriture ${current.id || '(sans id)'} est lettrée « ${current.lettre} » ; ${String(k)} ne peut être modifié sans délettrage préalable`
    }
  }
  return null
}

/**
 * R7 — Valide qu'aucune des écritures n'est sur un compte de résultat
 * (6xxx/7xxx) au moment où on tente de poser une lettre. S'appuie sur
 * accountClass : 'charge' et 'produit' sont interdits.
 */
export function assertNoLettreOnResultat(ecritures: EcritureLike[]): string | null {
  for (const e of ecritures || []) {
    const cls = accountClass(e.compte)
    if (cls === 'charge' || cls === 'produit' || cls === 'skip') {
      return `R7 violée — écriture sur compte ${e.compte} (classe: ${cls}) ne peut pas être lettrée`
    }
  }
  return null
}

/**
 * Applique toutes les règles pertinentes au lettrage d'un groupe
 * d'écritures. Retourne la première violation ou null si tout OK.
 */
export function validateLettrageGroup(params: {
  ecritures: EcritureLike[]
  newLettre: string
  cloture_date?: string | null
}): string | null {
  const { ecritures, newLettre, cloture_date } = params
  // R7 (classe compte) avant R1 (équilibre) car inutile de valider
  // l'équilibre si un compte de résultat est dans le lot.
  return (
    assertNoLettreOnResultat(ecritures) ||
    assertLettrageUnique(ecritures, newLettre) ||
    assertEquilibre(ecritures) ||
    (cloture_date
      ? (ecritures.map(e => assertAfterCloture(e, cloture_date)).find(Boolean) || null)
      : null)
  )
}
