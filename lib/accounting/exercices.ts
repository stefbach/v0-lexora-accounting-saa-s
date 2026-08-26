/**
 * Gestion des exercices fiscaux — logique pure (testable).
 *
 * Un exercice = une plage de dates (date_debut → date_fin) + un statut :
 *   - 'ouvert'     : saisie/modification libres.
 *   - 'verrouille' : GEL réversible — aucune écriture ne peut être créée /
 *                    modifiée / supprimée dans la plage (garde-fou DB, mig 496).
 *                    « Réajuster » = déverrouiller.
 *   - 'cloture'    : clôture comptable définitive (écritures CL/AN + snapshot
 *                    immuable) puis gel. Réouvrable pour réajuster.
 *
 * Tout est indexé sur les DATES (pas le libellé texte, qui est incohérent en
 * base : certains exercices sont libellés en année civile « 2025 », d'autres en
 * « 2025-2026 »). Le verrou (mig 421) et la clôture (RPC 225) travaillent tous
 * deux sur les bornes de dates : on garantit ici que label ⇄ dates restent
 * alignés en dérivant les dates avec la MÊME règle que la RPC.
 */

export type ExerciceStatut = 'ouvert' | 'verrouille' | 'cloture'

export interface ExerciceDates {
  date_debut: string // YYYY-MM-DD
  date_fin: string   // YYYY-MM-DD
}

export type ExerciceAction = 'verrouiller' | 'deverrouiller' | 'cloturer' | 'rouvrir'

/**
 * Dérive les bornes de dates d'un exercice depuis son LABEL, avec exactement la
 * règle de la RPC `cloture_exercice` (mig 225) pour aligner verrou et clôture :
 *   - « YYYY-YYYY » → 1er juillet YYYY1 → 30 juin YYYY2 (exercice mauricien).
 *   - « YYYY »      → 1er janvier → 31 décembre (année civile).
 * Préfixe « FY » toléré. `null` si le label n'est pas reconnu.
 */
export function exerciceDatesFromLabel(label: string): ExerciceDates | null {
  const l = (label || '').trim().replace(/^FY/i, '')
  const m2 = /^(\d{4})-(\d{4})$/.exec(l)
  if (m2) {
    if (Number(m2[2]) !== Number(m2[1]) + 1) return null // exercice = 2 années consécutives
    return { date_debut: `${m2[1]}-07-01`, date_fin: `${m2[2]}-06-30` }
  }
  const m1 = /^(\d{4})$/.exec(l)
  if (m1) return { date_debut: `${m1[1]}-01-01`, date_fin: `${m1[1]}-12-31` }
  return null
}

/** Transitions de statut autorisées (garde-fou métier). */
const TRANSITIONS: Record<ExerciceStatut, ExerciceStatut[]> = {
  ouvert: ['verrouille', 'cloture'],
  verrouille: ['ouvert', 'cloture'], // déverrouiller (réajuster) ou clôturer directement
  cloture: ['ouvert'],               // rouvrir (réajuster)
}

export function canTransition(from: ExerciceStatut, to: ExerciceStatut): boolean {
  if (from === to) return false
  return (TRANSITIONS[from] || []).includes(to)
}

/** Statut cible d'une action métier. */
export const ACTION_TO_STATUT: Record<ExerciceAction, ExerciceStatut> = {
  verrouiller: 'verrouille',
  deverrouiller: 'ouvert',
  cloturer: 'cloture',
  rouvrir: 'ouvert',
}

/** Valide qu'une action est applicable à un exercice dans un statut donné. */
export function actionIsAllowed(action: ExerciceAction, from: ExerciceStatut): boolean {
  return canTransition(from, ACTION_TO_STATUT[action])
}

export interface SeededExercice extends ExerciceDates {
  annee: string
}

/**
 * Construit la liste d'exercices à SEEDER à partir des libellés d'exercice
 * présents sur les écritures. Dédoublonne, ignore les libellés non reconnus,
 * dérive les dates (label ⇄ dates alignés), trie du plus récent au plus ancien.
 */
export function seedExercicesFromLabels(labels: Array<string | null | undefined>): SeededExercice[] {
  const seen = new Set<string>()
  const out: SeededExercice[] = []
  for (const raw of labels) {
    const label = (raw || '').trim()
    if (!label || seen.has(label)) continue
    const dates = exerciceDatesFromLabel(label)
    if (!dates) continue
    seen.add(label)
    out.push({ annee: label, ...dates })
  }
  return out.sort((a, b) => b.date_debut.localeCompare(a.date_debut))
}
