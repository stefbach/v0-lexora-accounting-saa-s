/**
 * Détection des "unpaid implicites" — jours d'AL ou SL pris au-delà
 * du droit cycle anniversaire qui doivent être déduits comme unpaid.
 *
 * Sémantique :
 *   - Si soldes_conges.al_pris > al_droit → l'excédent (al_pris - al_droit)
 *     représente des jours de congé pris au-delà du droit, donc à déduire.
 *   - Idem SL avec sl_pris vs sl_droit.
 *   - Total = al_excedent + sl_excedent (cumulé sur le cycle anniversaire).
 *
 * Idempotence (clé pour éviter double-déduction entre recalculs successifs) :
 *   La fonction retourne le restant à déduire SUR LE MOIS COURANT, en
 *   soustrayant ce qui a déjà été déduit en implicite dans les bulletins
 *   antérieurs du cycle (avant `periodeDebut`, exclusif).
 *
 *   "implicite_deja_deduit" = (sum jours_ul des bulletins antérieurs du
 *   cycle) - (sum nb_jours des demandes UL explicites approuvées
 *   antérieures du cycle). C'est la portion de jours_ul stockée qui
 *   correspond à l'excédent AL/SL et non à des demandes UL formelles.
 *
 * Cas typiques :
 *   - 1er recalcul avril, employé avec excedent=0.5 et 0 bulletin antérieur
 *     → retourne 0.5 → bulletin avril stocke jours_ul=0.5
 *   - 2e recalcul même avril → mois courant exclu du sum antérieur,
 *     retourne toujours 0.5 → bulletin réécrit à 0.5 (idempotent)
 *   - Recalcul mai : bulletin avril compté en antérieur (0.5),
 *     retourne max(0, 0.5 - 0.5) = 0 → bulletin mai pas impacté
 *
 * Limitation V1 : si une demande UL explicite chevauche la frontière
 * "mois courant", la portion antérieure est comptée full (`nb_jours`)
 * dans le sum explicit, ce qui peut sous-estimer l'implicite à déduire
 * de quelques heures. Cas rare ; à raffiner si on observe des erreurs.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export interface UnpaidImpliciteResult {
  jours: number               // 0 si rien à déduire ce mois
  motif?: string              // détail pour log/debug — undefined si jours=0
}

interface SoldeRow {
  periode_debut: string
  periode_fin: string
  al_droit: number | string | null
  al_pris: number | string | null
  sl_droit: number | string | null
  sl_pris: number | string | null
}

interface BulletinRow {
  periode: string
  jours_ul: number | string | null
}

interface DemandeULRow {
  nb_jours: number | string | null
}

export async function calculerUnpaidImplicite(
  supabase: SupabaseLike,
  employeId: string,
  periodeDebut: string,    // 'YYYY-MM-DD' = 1er du mois courant
  periodeFin: string,      // 'YYYY-MM-DD' = dernier jour du mois courant
): Promise<UnpaidImpliciteResult> {
  // 1. Cycle anniversaire courant depuis soldes_conges. Le mois courant
  //    doit être contenu dans [periode_debut, periode_fin] du cycle.
  const { data: solde, error } = await supabase
    .from('soldes_conges')
    .select('periode_debut, periode_fin, al_droit, al_pris, sl_droit, sl_pris')
    .eq('employe_id', employeId)
    .lte('periode_debut', periodeDebut)
    .gte('periode_fin', periodeFin)
    .maybeSingle()

  if (error) {
    console.warn(
      `[unpaid] soldes_conges SELECT failed for employe=${employeId} ` +
      `periode=${periodeDebut}: ${error.message}`,
    )
    return { jours: 0 }
  }
  if (!solde) {
    // Pas de ligne pour le cycle anniversaire → l'employé n'est pas suivi
    // par le système de soldes (cas legacy ou nouveau venu). On ne déduit
    // rien d'implicite.
    return { jours: 0 }
  }

  const s = solde as SoldeRow
  const al_droit = Number(s.al_droit) || 0
  const al_pris  = Number(s.al_pris)  || 0
  const sl_droit = Number(s.sl_droit) || 0
  const sl_pris  = Number(s.sl_pris)  || 0

  const al_excedent = Math.max(0, al_pris - al_droit)
  const sl_excedent = Math.max(0, sl_pris - sl_droit)
  const excedent_total = al_excedent + sl_excedent
  if (excedent_total === 0) return { jours: 0 }

  // 2. Bulletins antérieurs du cycle (strictement avant le mois courant).
  //    On somme leur jours_ul stockés.
  const { data: bulletinsAnterieurs } = await supabase
    .from('bulletins_paie')
    .select('periode, jours_ul')
    .eq('employe_id', employeId)
    .gte('periode', s.periode_debut)
    .lte('periode', s.periode_fin)
    .lt('periode', periodeDebut)

  const sum_jours_ul_ant = ((bulletinsAnterieurs ?? []) as BulletinRow[])
    .reduce((acc, b) => acc + (Number(b.jours_ul) || 0), 0)

  // 3. Demandes UL EXPLICITES antérieures (type_conge='UL' approuvées),
  //    dans la même fenêtre [cycle_debut, mois_courant - 1].
  const { data: ulExplicitesAnt } = await supabase
    .from('demandes_conges')
    .select('nb_jours')
    .eq('employe_id', employeId)
    .eq('statut', 'approuve')
    .eq('type_conge', 'UL')
    .gte('date_debut', s.periode_debut)
    .lt('date_debut', periodeDebut)

  const sum_explicit_ul_ant = ((ulExplicitesAnt ?? []) as DemandeULRow[])
    .reduce((acc, c) => acc + (Number(c.nb_jours) || 0), 0)

  // 4. Implicite déjà déduit = jours_ul stocké antérieur - UL explicites
  //    antérieures. Floor à 0 (sécurité contre données corrompues).
  const implicite_deja_deduit = Math.max(0, sum_jours_ul_ant - sum_explicit_ul_ant)

  // 5. À déduire ce mois = excédent total - implicite déjà capté ailleurs.
  const a_deduire = Math.max(0, excedent_total - implicite_deja_deduit)

  if (a_deduire === 0) return { jours: 0 }

  return {
    jours: a_deduire,
    motif:
      `AL excès ${al_excedent}j + SL excès ${sl_excedent}j = ${excedent_total}j cycle ` +
      `(${s.periode_debut}→${s.periode_fin}) ; déjà déduit en implicite ${implicite_deja_deduit}j ; ` +
      `à déduire ce mois ${a_deduire}j`,
  }
}
