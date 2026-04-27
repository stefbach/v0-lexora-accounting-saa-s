/**
 * Heures supplémentaires (OT) — moteur universel Lexora.
 *
 * Cadre Workers' Rights Act 2019 Mauritius :
 *   - Seuil hebdomadaire normal : 45h / semaine ISO (lundi → dimanche)
 *   - Tranche OT 1.5× : heures au-delà de 45h sur jours ouvrés/weekends
 *   - Tranche OT 2.0× : intégralité des heures sur jours fériés (table
 *     `jours_feries`). Les samedis et dimanches NON fériés sont traités
 *     comme jours normaux (les sociétés Lexora opèrent souvent le weekend).
 *   - Plafond légal indicatif 55h/semaine → alerte non bloquante.
 *
 * Source des heures : `planning_assignments` du mois où `est_repos = false`
 * et `heures_prevues > 0`, jointes via `plannings.societe_id`. Les paramètres
 * de taux (1.5 / 2.0) sont lus depuis `parametres_paie_mra` (actif=true) —
 * jamais hardcodés, c'est le contrat avec le système de paramétrage.
 *
 * Les bulletins `verrouille = true` ou `statut = 'valide'` sont protégés :
 * `saveOvertimeMois` refuse l'écriture si un seul employé concerné a un
 * bulletin verrouillé sur la période.
 */

import { firstDayOfMonth, lastDayOfMonth } from '@/lib/rh/period'
import { tauxHoraireFromBasic } from '@/lib/rh/disturbance-allowance'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export type StatutJour = 'normal' | 'ferie'

export interface OvertimeLigneJour {
  date: string                    // ISO yyyy-mm-dd
  heures_prevues: number          // depuis planning
  heures_normales: number
  heures_ot_1_5: number
  heures_ot_2: number
  statut_jour: StatutJour
  libelle_ferie?: string
}

export interface OvertimeAlerteSemaine {
  debut_semaine: string           // lundi ISO yyyy-mm-dd
  heures_totales: number
  illegal: boolean                // > 55h
}

export interface OvertimeLigneEmploye {
  employe_id: string
  employe_nom: string
  salaire_base: number
  taux_horaire_base: number
  jours: OvertimeLigneJour[]
  total_ot_1_5_heures: number
  total_ot_2_heures: number
  total_ot_montant: number
  alertes_semaines: OvertimeAlerteSemaine[]
  a_alerte_illegal: boolean
}

export interface SaveOvertimeResult {
  success: boolean              // false uniquement si écriture métier en échec
  nb_lignes_upsert: number
  nb_bulletins_maj: number
  bulletins_bloques: string[]   // employe_id des bulletins verrouillés/validés
  erreurs: string[]             // erreurs métier bloquantes
  warnings: string[]            // erreurs non bloquantes (audit log, observabilité)
}

/** Ligne envoyée par le front au save. Le client peut éditer les heures
 *  totales 1.5× et 2× par employé. Tout le reste (jours, taux, montant)
 *  est ignoré et recalculé côté serveur. */
export interface LigneFront {
  employe_id: string
  total_ot_1_5_heures: number
  total_ot_2_heures: number
}

export interface ErreurValidation {
  employe_id: string
  raison: string
}

export interface PreparerResult {
  lignes_validees: OvertimeLigneEmploye[]
  erreurs_validation: ErreurValidation[]
}

interface ParametresOT {
  heures_standard_semaine: number
  taux_normal: number             // multiplicateur 1.5×
  taux_majore: number             // multiplicateur 2.0×
}

interface FerieInfo {
  libelle: string
  multiplicateur: number          // 1 + majoration_pct/100
}

const PLAFOND_LEGAL_HEBDO = 55

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

/**
 * Retourne le lundi ISO (yyyy-mm-dd) de la semaine contenant `dateIso`.
 * Calcul en UTC pour éviter tout décalage de fuseau côté serveur Node.
 */
export function getSemaineIso(dateIso: string): string {
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00Z`)
  const dow = d.getUTCDay()           // 0 = dimanche, 1 = lundi … 6 = samedi
  const offset = dow === 0 ? -6 : 1 - dow
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

/**
 * Vrai si la date appartient au map de fériés (résolue via la requête
 * cloisonnée pays + société, voir loadFeries).
 */
export function estJourFerie(
  dateIso: string,
  ferieMap: Map<string, FerieInfo>,
): boolean {
  return ferieMap.has(dateIso.slice(0, 10))
}

async function loadParametres(supabase: SupabaseLike): Promise<ParametresOT> {
  const { data } = await supabase
    .from('parametres_paie_mra')
    .select('heures_standard_semaine, heures_sup_taux_normal, heures_sup_taux_majore')
    .eq('actif', true)
    .order('annee', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    heures_standard_semaine: Number(data?.heures_standard_semaine) || 45,
    taux_normal: Number(data?.heures_sup_taux_normal) || 1.5,
    taux_majore: Number(data?.heures_sup_taux_majore) || 2.0,
  }
}

async function loadFeries(
  supabase: SupabaseLike,
  societeId: string,
  dateDebut: string,
  dateFin: string,
): Promise<Map<string, FerieInfo>> {
  const map = new Map<string, FerieInfo>()
  const { data } = await supabase
    .from('jours_feries')
    .select('date, libelle, majoration_pct, societe_id')
    .eq('pays', 'MU')
    .gte('date', dateDebut)
    .lte('date', dateFin)
    .or(`societe_id.is.null,societe_id.eq.${societeId}`)

  for (const row of (data ?? []) as Array<{
    date: string
    libelle: string
    majoration_pct: number | string | null
  }>) {
    const iso = String(row.date).slice(0, 10)
    const pct = Number(row.majoration_pct ?? 100)
    map.set(iso, {
      libelle: row.libelle ?? '',
      multiplicateur: 1 + pct / 100,
    })
  }
  return map
}

interface AssignmentRow {
  employe_id: string
  date: string
  heures_prevues: number | string | null
  est_repos: boolean | null
}

async function loadAssignments(
  supabase: SupabaseLike,
  societeId: string,
  dateDebut: string,
  dateFin: string,
): Promise<AssignmentRow[]> {
  // Join via plannings.societe_id pour scoping multi-société.
  const { data } = await supabase
    .from('planning_assignments')
    .select('employe_id, date, heures_prevues, est_repos, plannings!inner(societe_id)')
    .eq('plannings.societe_id', societeId)
    .gte('date', dateDebut)
    .lte('date', dateFin)
    .eq('est_repos', false)
    .gt('heures_prevues', 0)

  return ((data ?? []) as Array<AssignmentRow & { plannings?: unknown }>).map(r => ({
    employe_id: r.employe_id,
    date: String(r.date).slice(0, 10),
    heures_prevues: r.heures_prevues,
    est_repos: r.est_repos,
  }))
}

interface EmployeRow {
  id: string
  nom: string
  prenom: string
  salaire_base: number | string | null
}

async function loadEmployesActifs(
  supabase: SupabaseLike,
  societeId: string,
): Promise<EmployeRow[]> {
  const { data } = await supabase
    .from('employes')
    .select('id, nom, prenom, salaire_base')
    .eq('societe_id', societeId)
    .eq('actif', true)
    .is('date_depart', null)
  return (data ?? []) as EmployeRow[]
}

/**
 * Calcule le détail OT pour un employé sur le mois.
 * Algorithme :
 *   1. Grouper par semaine ISO (lundi → dimanche)
 *   2. Pour chaque semaine :
 *      - heures_ferie     = somme jours fériés → tout en taux 2×
 *      - heures_normaux   = somme jours non fériés (samedi/dimanche INCLUS)
 *      - normales_semaine = min(heures_normaux, seuil)
 *      - ot15_semaine     = max(0, heures_normaux - seuil) → taux 1.5×
 *      - illegal          = (heures_normaux + heures_ferie) > 55h
 *   3. Distribuer ot15_semaine sur les jours non fériés en partant du
 *      jour le plus tardif : on remplit l'OT à partir de la fin de
 *      semaine, le reste de chaque jour bascule en heures normales.
 */
function calculerOTEmploye(
  employe: EmployeRow,
  jours: AssignmentRow[],
  params: ParametresOT,
  ferieMap: Map<string, FerieInfo>,
): OvertimeLigneEmploye {
  const salaireBase = Number(employe.salaire_base) || 0
  const tauxHoraire = tauxHoraireFromBasic(salaireBase)

  // Détail journalier vide initial — on remplira après distribution OT.
  const detailParDate = new Map<string, OvertimeLigneJour>()
  for (const j of jours) {
    const heures = Number(j.heures_prevues) || 0
    const isFerie = ferieMap.has(j.date)
    const ferieInfo = isFerie ? ferieMap.get(j.date) : undefined
    detailParDate.set(j.date, {
      date: j.date,
      heures_prevues: heures,
      heures_normales: 0,
      heures_ot_1_5: 0,
      heures_ot_2: isFerie ? heures : 0,   // jours fériés : 100% en taux 2×
      statut_jour: isFerie ? 'ferie' : 'normal',
      libelle_ferie: ferieInfo?.libelle,
    })
  }

  // Regrouper par semaine ISO.
  const semaines = new Map<string, AssignmentRow[]>()
  for (const j of jours) {
    const lundi = getSemaineIso(j.date)
    const list = semaines.get(lundi) ?? []
    list.push(j)
    semaines.set(lundi, list)
  }

  const alertes: OvertimeAlerteSemaine[] = []
  let totalOt15 = 0
  let totalOt2 = 0

  for (const [lundi, joursSem] of semaines) {
    let heuresFerie = 0
    let heuresNormaux = 0
    const joursNormaux: AssignmentRow[] = []

    for (const j of joursSem) {
      const h = Number(j.heures_prevues) || 0
      if (ferieMap.has(j.date)) {
        heuresFerie += h
      } else {
        heuresNormaux += h
        joursNormaux.push(j)
      }
    }

    const seuil = params.heures_standard_semaine
    const ot15Semaine = Math.max(0, heuresNormaux - seuil)
    const totalSemaine = heuresNormaux + heuresFerie

    totalOt2 += heuresFerie
    totalOt15 += ot15Semaine

    alertes.push({
      debut_semaine: lundi,
      heures_totales: round2(totalSemaine),
      illegal: totalSemaine > PLAFOND_LEGAL_HEBDO,
    })

    // Distribution OT 1.5× sur les jours non fériés, du plus tardif au
    // plus récent. On consomme l'OT à partir de la fin de semaine.
    let ot15Restant = ot15Semaine
    const joursOrdreInverse = [...joursNormaux].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
    )
    for (const j of joursOrdreInverse) {
      const detail = detailParDate.get(j.date)
      if (!detail) continue
      const h = detail.heures_prevues
      if (ot15Restant <= 0) {
        detail.heures_normales = h
        continue
      }
      const ot = Math.min(h, ot15Restant)
      detail.heures_ot_1_5 = round2(ot)
      detail.heures_normales = round2(h - ot)
      ot15Restant = round2(ot15Restant - ot)
    }
  }

  // Trier le détail final par date croissante pour lisibilité côté UI.
  const joursDetail = [...detailParDate.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  )

  const totalOt15Round = round2(totalOt15)
  const totalOt2Round = round2(totalOt2)
  const montant = round2(
    totalOt15Round * tauxHoraire * params.taux_normal
    + totalOt2Round * tauxHoraire * params.taux_majore,
  )

  return {
    employe_id: employe.id,
    employe_nom: `${employe.prenom ?? ''} ${employe.nom ?? ''}`.trim(),
    salaire_base: salaireBase,
    taux_horaire_base: tauxHoraire,
    jours: joursDetail,
    total_ot_1_5_heures: totalOt15Round,
    total_ot_2_heures: totalOt2Round,
    total_ot_montant: montant,
    alertes_semaines: alertes,
    a_alerte_illegal: alertes.some(a => a.illegal),
  }
}

/**
 * Preview OT pour la société sur la période. Read-only, n'écrit rien.
 * `periode` accepte 'YYYY-MM' ou 'YYYY-MM-DD' (le jour est ignoré).
 */
export async function previewOvertimeMois(
  supabase: SupabaseLike,
  societeId: string,
  periode: string,
): Promise<OvertimeLigneEmploye[]> {
  const dateDebut = firstDayOfMonth(periode)
  const dateFin = lastDayOfMonth(periode)

  const [params, employes, assignments, feries] = await Promise.all([
    loadParametres(supabase),
    loadEmployesActifs(supabase, societeId),
    loadAssignments(supabase, societeId, dateDebut, dateFin),
    loadFeries(supabase, societeId, dateDebut, dateFin),
  ])

  // Indexer assignments par employe_id.
  const parEmploye = new Map<string, AssignmentRow[]>()
  for (const a of assignments) {
    const list = parEmploye.get(a.employe_id) ?? []
    list.push(a)
    parEmploye.set(a.employe_id, list)
  }

  const lignes: OvertimeLigneEmploye[] = []
  for (const emp of employes) {
    const joursEmp = parEmploye.get(emp.id) ?? []
    if (joursEmp.length === 0) continue       // pas de planning ce mois → pas de ligne
    lignes.push(calculerOTEmploye(emp, joursEmp, params, feries))
  }

  // Tri par nom pour stabilité d'affichage.
  lignes.sort((a, b) => a.employe_nom.localeCompare(b.employe_nom))
  return lignes
}

/**
 * Valide les lignes envoyées par le front et reconstruit des
 * `OvertimeLigneEmploye` propres prêts à être passés à `saveOvertimeMois`.
 *
 * Sécurité — la fonction NE FAIT JAMAIS confiance aux montants ou jours
 * envoyés par le front. Elle :
 *   1. Recharge la vérité serveur via `previewOvertimeMois` (planning,
 *      employés actifs, jours fériés, taux).
 *   2. Pour chaque ligne front, lit uniquement `employe_id`,
 *      `total_ot_1_5_heures`, `total_ot_2_heures`.
 *   3. Valide : employé éligible côté serveur, heures positives, plafond
 *      `plafond_heures_total` (200 par défaut), cohérence OT 2× / fériés,
 *      saisies <= capacité physique calculée par la preview (tolérance
 *      0.01h). La sous-saisie est autorisée (mode hybride : auto-calcul
 *      + ajustement manuel à la baisse possible).
 *   4. Redistribue le détail journalier :
 *      - OT 2× : proportionnel sur les jours fériés (heures_prevues),
 *                résidu d'arrondi sur le jour férié le plus tardif.
 *      - OT 1.5× : du jour normal le plus tardif vers le plus récent,
 *                  borné par `heures_prevues` du jour.
 *   5. Recalcule `total_ot_montant` avec les taux DB (jamais front).
 *
 * Comportement :
 *   - `lignesFront` vide → retour immédiat `{[], []}` (pas de chargement DB).
 *   - Doublons d'`employe_id` dans `lignesFront` → LWW (last write wins),
 *     pas d'erreur.
 *   - Employé en preview mais absent du front → IGNORÉ (pas de zéroter
 *     implicite). Pour zéroter, le front doit envoyer
 *     `{ employe_id, total_ot_1_5_heures: 0, total_ot_2_heures: 0 }`.
 *   - Employé front absent de la preview → erreur de validation, ligne
 *     skippée. Permet de poursuivre la validation des autres lignes.
 *     C'est l'API route qui décide de rejeter le batch entier (V1).
 */
export async function preparerLignesPourSave(
  supabase: SupabaseLike,
  societeId: string,
  periode: string,
  lignesFront: LigneFront[],
  options?: { plafond_heures_total?: number },
): Promise<PreparerResult> {
  const plafond = options?.plafond_heures_total ?? 200

  if (!Array.isArray(lignesFront) || lignesFront.length === 0) {
    return { lignes_validees: [], erreurs_validation: [] }
  }

  // Dédoublonnage LWW + filtre des employe_id manifestement invalides.
  const lignesDedup = new Map<string, LigneFront>()
  for (const l of lignesFront) {
    if (l && typeof l.employe_id === 'string' && l.employe_id.length > 0) {
      lignesDedup.set(l.employe_id, l)
    }
  }
  if (lignesDedup.size === 0) {
    return { lignes_validees: [], erreurs_validation: [] }
  }

  // Vérité serveur + paramètres taux (jamais front).
  const [preview, params] = await Promise.all([
    previewOvertimeMois(supabase, societeId, periode),
    loadParametres(supabase),
  ])
  const previewMap = new Map(preview.map(p => [p.employe_id, p]))

  const lignesValidees: OvertimeLigneEmploye[] = []
  const erreurs: ErreurValidation[] = []

  for (const [empId, ligneFront] of lignesDedup) {
    const ot15 = Number(ligneFront.total_ot_1_5_heures)
    const ot2 = Number(ligneFront.total_ot_2_heures)

    if (!Number.isFinite(ot15) || !Number.isFinite(ot2) || ot15 < 0 || ot2 < 0) {
      erreurs.push({
        employe_id: empId,
        raison: 'heures négatives ou non numériques',
      })
      continue
    }

    if (ot15 + ot2 > plafond) {
      erreurs.push({
        employe_id: empId,
        raison: `heures saisies hors limite raisonnable (${round2(ot15 + ot2)}h > ${plafond}h)`,
      })
      continue
    }

    const previewLigne = previewMap.get(empId)
    if (!previewLigne) {
      erreurs.push({
        employe_id: empId,
        raison: 'employé non éligible OT pour cette période',
      })
      continue
    }

    const ferieDays = previewLigne.jours.filter(j => j.statut_jour === 'ferie')
    const sumFerieHeures = ferieDays.reduce((s, j) => s + j.heures_prevues, 0)

    if (ot2 > 0 && sumFerieHeures === 0) {
      erreurs.push({
        employe_id: empId,
        raison: 'OT 2× saisies mais aucun jour férié travaillé ce mois',
      })
      continue
    }

    // Capacité physique : ne JAMAIS accepter une saisie au-delà de ce
    // que le planning + WRA permettent. Sinon le bulletin paie est
    // gonflé artificiellement vs heures_travaillees → incohérence DB,
    // risque d'audit, risque légal (paie d'OT non rattachables à du
    // travail enregistré). Tolérance 0.01h pour absorber les arrondis.
    const TOLERANCE = 0.01
    const capacite_ot_1_5 = previewLigne.total_ot_1_5_heures
    const capacite_ot_2 = previewLigne.total_ot_2_heures
    if (ot15 > capacite_ot_1_5 + TOLERANCE) {
      erreurs.push({
        employe_id: empId,
        raison: `OT 1.5× saisies (${round2(ot15)}h) > capacité physique calculée depuis le planning (${capacite_ot_1_5.toFixed(2)}h)`,
      })
      continue
    }
    if (ot2 > capacite_ot_2 + TOLERANCE) {
      erreurs.push({
        employe_id: empId,
        raison: `OT 2× saisies (${round2(ot2)}h) > capacité physique (jours fériés travaillés : ${capacite_ot_2.toFixed(2)}h)`,
      })
      continue
    }

    // Reconstruction d'un détail journalier neuf basé sur le squelette
    // de la preview (dates, statut_jour, libelle_ferie, heures_prevues).
    const nouveauxJours: OvertimeLigneJour[] = previewLigne.jours.map(j => ({
      date: j.date,
      heures_prevues: j.heures_prevues,
      heures_normales: 0,
      heures_ot_1_5: 0,
      heures_ot_2: 0,
      statut_jour: j.statut_jour,
      libelle_ferie: j.libelle_ferie,
    }))

    // OT 2× — proportionnel sur jours fériés, résidu sur le plus tardif.
    if (ot2 > 0 && sumFerieHeures > 0) {
      const ferieIndicesAsc = nouveauxJours
        .map((j, i) => (j.statut_jour === 'ferie' ? i : -1))
        .filter(i => i >= 0)
        .sort((a, b) =>
          nouveauxJours[a].date < nouveauxJours[b].date ? -1
          : nouveauxJours[a].date > nouveauxJours[b].date ? 1 : 0,
        )
      let alloc = 0
      for (let k = 0; k < ferieIndicesAsc.length - 1; k++) {
        const idx = ferieIndicesAsc[k]
        const part = round2((nouveauxJours[idx].heures_prevues * ot2) / sumFerieHeures)
        nouveauxJours[idx].heures_ot_2 = part
        alloc += part
      }
      // Le plus tardif (dernier en ASC) reçoit le résidu pour que la
      // somme par jour matche exactement total_ot_2_heures (pas de drift).
      const lastIdx = ferieIndicesAsc[ferieIndicesAsc.length - 1]
      nouveauxJours[lastIdx].heures_ot_2 = round2(ot2 - alloc)
    }

    // OT 1.5× — du jour normal le plus tardif vers le plus récent,
    //          borné par heures_prevues du jour.
    if (ot15 > 0) {
      const normalIndicesDesc = nouveauxJours
        .map((j, i) => (j.statut_jour === 'normal' ? i : -1))
        .filter(i => i >= 0)
        .sort((a, b) =>
          nouveauxJours[a].date < nouveauxJours[b].date ? 1
          : nouveauxJours[a].date > nouveauxJours[b].date ? -1 : 0,
        )
      let restant = ot15
      for (const idx of normalIndicesDesc) {
        if (restant <= 0) break
        const j = nouveauxJours[idx]
        const ot = Math.min(j.heures_prevues, restant)
        j.heures_ot_1_5 = round2(ot)
        restant = round2(restant - ot)
      }
      // Avec le check capacité physique en amont, restant ne peut être
      // > 0 qu'à hauteur de la TOLERANCE (0.01h max), absorbé sans bruit.
    }

    // heures_normales = heures_prevues - heures_ot_1_5 - heures_ot_2.
    for (const j of nouveauxJours) {
      const reste = j.heures_prevues - j.heures_ot_1_5 - j.heures_ot_2
      j.heures_normales = round2(reste < 0 ? 0 : reste)
    }

    const montant = round2(
      ot15 * previewLigne.taux_horaire_base * params.taux_normal
      + ot2 * previewLigne.taux_horaire_base * params.taux_majore,
    )

    lignesValidees.push({
      employe_id: previewLigne.employe_id,
      employe_nom: previewLigne.employe_nom,
      salaire_base: previewLigne.salaire_base,
      taux_horaire_base: previewLigne.taux_horaire_base,
      jours: nouveauxJours,
      total_ot_1_5_heures: round2(ot15),
      total_ot_2_heures: round2(ot2),
      total_ot_montant: montant,
      alertes_semaines: previewLigne.alertes_semaines,
      a_alerte_illegal: previewLigne.a_alerte_illegal,
    })
  }

  return { lignes_validees: lignesValidees, erreurs_validation: erreurs }
}

/**
 * Persiste les OT du mois :
 *   1. Refuse si un bulletin du mois est verrouillé/validé pour un employé concerné
 *   2. UPSERT heures_travaillees pour chaque (employe, date) avec OT > 0
 *   3. UPDATE bulletins_paie.heures_sup_montant (uniquement non verrouillés)
 *   4. Audit log (non bloquant — échec → warnings, pas erreurs)
 *
 * Sémantique du retour :
 *   - `success = true` si les écritures métier (heures_travaillees +
 *     bulletins_paie) ont réussi. Une panne audit log ne fait PAS basculer
 *     `success` à false : elle remonte dans `warnings` pour observabilité.
 *   - `erreurs` : pannes métier bloquantes
 *   - `warnings` : pannes non bloquantes (audit, etc.)
 *   - `bulletins_bloques` : liste des employe_id ayant un bulletin
 *     verrouillé/validé (renvoyée AVANT toute écriture, vide sinon).
 *
 * Sécurité : les taux 1.5×/2× sont relus depuis `parametres_paie_mra`
 * (actif=true) et appliqués au `montant_ot` stocké jour par jour. Le
 * front ne peut donc pas influencer ces taux via un payload manipulé.
 */
export async function saveOvertimeMois(
  supabase: SupabaseLike,
  societeId: string,
  periode: string,
  lignes: OvertimeLigneEmploye[],
  user: { id: string; email?: string | null },
): Promise<SaveOvertimeResult> {
  const erreurs: string[] = []
  const warnings: string[] = []
  const periodeDb = firstDayOfMonth(periode)
  const dateFin = lastDayOfMonth(periode)
  const employesIds = lignes.map(l => l.employe_id)

  // 1. Vérifier qu'aucun bulletin n'est verrouillé/validé sur la période
  //    pour les employés concernés.
  if (employesIds.length > 0) {
    const { data: bulsBloques } = await supabase
      .from('bulletins_paie')
      .select('employe_id, statut, verrouille')
      .eq('societe_id', societeId)
      .gte('periode', periodeDb)
      .lte('periode', dateFin)
      .in('employe_id', employesIds)

    const bloques = ((bulsBloques ?? []) as Array<{
      employe_id: string
      statut: string | null
      verrouille: boolean | null
    }>)
      .filter(b => b.statut === 'valide' || b.verrouille === true)
      .map(b => b.employe_id)

    if (bloques.length > 0) {
      return {
        success: false,
        nb_lignes_upsert: 0,
        nb_bulletins_maj: 0,
        bulletins_bloques: bloques,
        erreurs: [`${bloques.length} bulletin(s) verrouillé(s) ou validé(s) — déverrouillez avant de modifier les OT.`],
        warnings: [],
      }
    }
  }

  // 2. Recharger les taux depuis la DB (jamais depuis le front).
  const params = await loadParametres(supabase)

  // 3. UPSERT heures_travaillees — une ligne par (employe, date) avec OT > 0.
  let nbUpsert = 0
  for (const ligne of lignes) {
    const rows = ligne.jours
      .filter(j => j.heures_ot_1_5 > 0 || j.heures_ot_2 > 0)
      .map(j => ({
        employe_id: ligne.employe_id,
        date: j.date,
        heures_normales: j.heures_normales,
        heures_ot_1_5: j.heures_ot_1_5,
        heures_ot_2: j.heures_ot_2,
        montant_ot: round2(
          j.heures_ot_1_5 * ligne.taux_horaire_base * params.taux_normal
          + j.heures_ot_2 * ligne.taux_horaire_base * params.taux_majore,
        ),
        taux_horaire_base: ligne.taux_horaire_base,
        statut_jour: j.statut_jour,
      }))
    if (rows.length === 0) continue
    const { error } = await supabase
      .from('heures_travaillees')
      .upsert(rows, { onConflict: 'employe_id,date' })
    if (error) {
      erreurs.push(`upsert heures_travaillees ${ligne.employe_id}: ${error.message}`)
      continue
    }
    nbUpsert += rows.length
  }

  // 4. UPDATE bulletins_paie.heures_sup_montant (seulement non verrouillés
  //    + non validés). Le filtre côté requête garantit qu'on ne touche
  //    pas à un bulletin protégé même en cas de race condition.
  let nbBulletinsMaj = 0
  for (const ligne of lignes) {
    const { error, count } = await supabase
      .from('bulletins_paie')
      .update({
        heures_sup_montant: ligne.total_ot_montant,
        updated_at: new Date().toISOString(),
      }, { count: 'exact' })
      .eq('societe_id', societeId)
      .gte('periode', periodeDb)
      .lte('periode', dateFin)
      .eq('employe_id', ligne.employe_id)
      .neq('statut', 'valide')
      .eq('verrouille', false)
    if (error) {
      erreurs.push(`update bulletin ${ligne.employe_id}: ${error.message}`)
      continue
    }
    nbBulletinsMaj += Number(count) || 0
  }

  // 5. Audit log — strictement non bloquant : un échec va dans `warnings`,
  //    pas dans `erreurs`, pour ne pas masquer le succès des écritures
  //    métier ci-dessus.
  try {
    const totalMontant = lignes.reduce((s, l) => s + l.total_ot_montant, 0)
    const { error: auditErr } = await supabase.from('paie_audit_log').insert({
      societe_id: societeId,
      periode: periodeDb,
      action: 'ot_save',
      user_id: user.id,
      user_email: user.email ?? null,
      details: {
        nb_employes: lignes.length,
        total_ot_montant: round2(totalMontant),
        nb_lignes_upsert: nbUpsert,
        nb_bulletins_maj: nbBulletinsMaj,
      },
    })
    if (auditErr) {
      warnings.push(`audit_log: ${auditErr.message}`)
    }
  } catch (e) {
    warnings.push(`audit_log: ${e instanceof Error ? e.message : String(e)}`)
  }

  return {
    success: erreurs.length === 0,
    nb_lignes_upsert: nbUpsert,
    nb_bulletins_maj: nbBulletinsMaj,
    bulletins_bloques: [],
    erreurs,
    warnings,
  }
}
