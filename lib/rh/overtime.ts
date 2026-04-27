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
import { calculerPeriodePaie } from '@/lib/rh/periode-paie'

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

/** Saisie journalière libre par l'utilisateur. Une entrée par (employé,
 *  date) explicitement saisie. Pas de référence au planning : le RH
 *  valide ce qu'il valide, sans plafond ni borne par jour. */
export interface SaisieJourOT {
  date: string                // ISO yyyy-mm-dd
  heures_ot_1_5: number       // ≥ 0
  heures_ot_2: number         // ≥ 0
  motif?: string              // info éphémère côté UI, non stocké en DB en V1
}

/** Ligne envoyée par le front au save. La saisie est libre : pas de
 *  référence au planning, pas de plafond global. Si l'employé n'a aucun
 *  OT à payer, envoyer `jours: []` (la ligne est validée à 0, le bulletin
 *  recevra heures_sup_montant=0). */
export interface LigneFront {
  employe_id: string
  jours: SaisieJourOT[]
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
 * Lit le total montant_ot persisté en heures_travaillees pour un
 * employé sur une période. Source de vérité pour le bulletin paie
 * quand la saisie OT manuelle a été faite via la section
 * /rh/paie/primes (lib saveOvertimeMois). Retourne 0 si aucune ligne.
 *
 * Utilisé par le moteur de recalcul (app/api/rh/paie/route.ts) pour
 * que `bulletins_paie.heures_sup_montant` ne soit plus écrasé à 0
 * après un click "Recalculer la paie" — la lib est l'unique source
 * de vérité quand elle a écrit (priorité sur le calcul auto depuis
 * pointages).
 *
 * `periodeDebut` / `periodeFin` : 'YYYY-MM-DD'. Le caller fournit la
 * fenêtre déjà résolue selon le cycle paie société (calendaire vs
 * cut_off — résolu par calculerPeriodePaie en amont).
 */
export async function lireMontantOTDuMois(
  supabase: SupabaseLike,
  employeId: string,
  periodeDebut: string,
  periodeFin: string,
): Promise<number> {
  const { data } = await supabase
    .from('heures_travaillees')
    .select('montant_ot')
    .eq('employe_id', employeId)
    .gte('date', periodeDebut)
    .lte('date', periodeFin)
  if (!data || data.length === 0) return 0
  return (data as Array<{ montant_ot?: number | string | null }>).reduce(
    (s, r) => s + (Number(r.montant_ot) || 0),
    0,
  )
}

/**
 * Preview OT pour la société sur la période. Read-only, n'écrit rien.
 *
 * `periode` accepte 'YYYY-MM' ou 'YYYY-MM-DD' (le jour est ignoré). Il
 * identifie le bulletin paie cible (1er du mois logique), PAS la fenêtre
 * physique des plannings : celle-ci est résolue via `calculerPeriodePaie`
 * pour respecter la config société (mode calendaire ou cut_off_jour).
 *   - mode calendaire (défaut) : 01/MM → dernier jour de MM
 *   - mode cut_off_jour=24      : 25/MM-1 → 24/MM
 *
 * Cette fenêtre s'applique au filtrage planning_assignments ET
 * jours_feries — sinon un férié de la période réelle mais hors mois
 * calendaire serait raté (et inversement).
 */
export async function previewOvertimeMois(
  supabase: SupabaseLike,
  societeId: string,
  periode: string,
): Promise<OvertimeLigneEmploye[]> {
  const dateRef = firstDayOfMonth(periode)

  const [params, employes, periodeInfo] = await Promise.all([
    loadParametres(supabase),
    loadEmployesActifs(supabase, societeId),
    calculerPeriodePaie(supabase, societeId, dateRef),
  ])
  const dateDebut = periodeInfo.periode_debut
  const dateFin = periodeInfo.periode_fin

  const [assignments, feries] = await Promise.all([
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
 * Valide les lignes saisies par l'UI (mode saisie détaillée libre par
 * date) et reconstruit des `OvertimeLigneEmploye` propres prêts à
 * `saveOvertimeMois`.
 *
 * Sécurité — la fonction NE FAIT JAMAIS confiance aux taux, montants ou
 * statut_jour envoyés par le front. Elle relit en DB :
 *   - paramètres taux 1.5× / 2× depuis `parametres_paie_mra`
 *   - fenêtre période (calendaire ou cut_off) via `calculerPeriodePaie`
 *   - employés actifs de la société (filtre actif=true + date_depart IS NULL)
 *   - jours fériés sur la fenêtre (table jours_feries)
 *
 * Validation par ligne :
 *   1. employe_id existe et appartient à la société active
 *   2. champ `jours` est un array (peut être vide → ligne validée à 0)
 *   3. chaque jour a une date dans [periode_debut, periode_fin] et heures ≥ 0
 *   Erreur sur n'importe quel point → ligne entière skippée, push dans
 *   `erreurs_validation`. Les autres lignes continuent (l'API route
 *   choisit de rejeter le batch entier en V1).
 *
 * Construction OvertimeLigneEmploye :
 *   - statut_jour résolu serveur via ferieMap (front ignoré)
 *   - heures_prevues / heures_normales = 0 (saisie libre, pas de
 *     référence planning : si saisi en OT, c'est de l'OT)
 *   - heures_ot_1_5 / heures_ot_2 = valeurs front
 *   - total_ot_montant recalculé avec taux DB (jamais front)
 *   - alertes_semaines = [] et a_alerte_illegal = false. L'alerte 55h
 *     WRA légale n'a de sens qu'avec visibilité sur les heures normales
 *     du planning ; elle vit donc dans `previewOvertimeMois` et n'est
 *     PAS recalculée ici. L'UI affichera les alertes preview à côté de
 *     la saisie.
 *
 * Comportement :
 *   - lignesFront vide → retour immédiat `{ [], [] }` (pas d'appel DB)
 *   - Doublons employe_id → LWW silencieux
 *   - Doublons (employe_id, date) à l'intérieur d'une ligne → LWW silencieux
 *   - PAS de plafond OT (ni 200h global, ni capacité physique du
 *     planning). Le RH valide ce qu'il valide. Décision Dr Bach Avr 2026.
 *   - Le motif éventuel sur SaisieJourOT est ignoré (info UI éphémère,
 *     pas stockée en DB en V1).
 *
 * `_options` est réservé pour V2 (compat signature). Doit valoir `{}`.
 */
export async function preparerLignesPourSave(
  supabase: SupabaseLike,
  societeId: string,
  periode: string,
  lignesFront: LigneFront[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _options?: Record<string, never>,
): Promise<PreparerResult> {
  const erreurs_validation: ErreurValidation[] = []
  const lignes_validees: OvertimeLigneEmploye[] = []

  if (!Array.isArray(lignesFront) || lignesFront.length === 0) {
    return { lignes_validees, erreurs_validation }
  }

  // Dédup LigneFront par employe_id (LWW silencieux). Au passage on drop
  // les entrées dont employe_id est manifestement invalide.
  const lignesDedup = new Map<string, LigneFront>()
  for (const l of lignesFront) {
    if (l && typeof l.employe_id === 'string' && l.employe_id.length > 0) {
      lignesDedup.set(l.employe_id, l)
    }
  }
  if (lignesDedup.size === 0) {
    return { lignes_validees, erreurs_validation }
  }

  // Vérité serveur en parallèle (params + fenêtre + employés). loadFeries
  // dépend de la fenêtre → second tour.
  const dateRef = firstDayOfMonth(periode)
  const [params, periodeInfo, employes] = await Promise.all([
    loadParametres(supabase),
    calculerPeriodePaie(supabase, societeId, dateRef),
    loadEmployesActifs(supabase, societeId),
  ])
  const dateDebut = periodeInfo.periode_debut
  const dateFin = periodeInfo.periode_fin
  const feries = await loadFeries(supabase, societeId, dateDebut, dateFin)

  const employeMap = new Map(employes.map(e => [e.id, e]))

  for (const [empId, ligneFront] of lignesDedup) {
    const employe = employeMap.get(empId)
    if (!employe) {
      erreurs_validation.push({
        employe_id: empId,
        raison: 'employé inconnu ou inactif pour cette société',
      })
      continue
    }

    if (!Array.isArray(ligneFront.jours)) {
      erreurs_validation.push({
        employe_id: empId,
        raison: 'champ jours manquant ou invalide',
      })
      continue
    }

    // Dédup des jours saisis par date (LWW silencieux). Drop ceux dont la
    // date est manifestement invalide (string < 10 caractères).
    const joursMap = new Map<string, SaisieJourOT>()
    for (const j of ligneFront.jours) {
      if (j && typeof j.date === 'string' && j.date.length >= 10) {
        joursMap.set(j.date.slice(0, 10), j)
      }
    }

    // Validation des jours (date dans la fenêtre + heures ≥ 0).
    let ligneError: string | null = null
    for (const j of joursMap.values()) {
      const dateIso = j.date.slice(0, 10)
      if (dateIso < dateDebut || dateIso > dateFin) {
        ligneError = `date ${dateIso} hors période paie [${dateDebut}, ${dateFin}]`
        break
      }
      const ot15 = Number(j.heures_ot_1_5)
      const ot2 = Number(j.heures_ot_2)
      if (!Number.isFinite(ot15) || !Number.isFinite(ot2) || ot15 < 0 || ot2 < 0) {
        ligneError = 'heures négatives ou non numériques non autorisées'
        break
      }
    }
    if (ligneError) {
      erreurs_validation.push({ employe_id: empId, raison: ligneError })
      continue
    }

    // Construction OvertimeLigneEmploye à partir de la saisie libre.
    const salaireBase = Number(employe.salaire_base) || 0
    const tauxHoraire = tauxHoraireFromBasic(salaireBase)
    const jours: OvertimeLigneJour[] = []
    let totalOt15 = 0
    let totalOt2 = 0
    for (const j of joursMap.values()) {
      const dateIso = j.date.slice(0, 10)
      const ot15 = round2(Number(j.heures_ot_1_5))
      const ot2 = round2(Number(j.heures_ot_2))
      const ferieInfo = feries.get(dateIso)
      jours.push({
        date: dateIso,
        heures_prevues: 0,            // saisie libre, pas de référence planning
        heures_normales: 0,           // si saisi en OT, c'est de l'OT
        heures_ot_1_5: ot15,
        heures_ot_2: ot2,
        statut_jour: ferieInfo ? 'ferie' : 'normal',
        libelle_ferie: ferieInfo?.libelle,
      })
      totalOt15 += ot15
      totalOt2 += ot2
    }
    jours.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

    const totalOt15Round = round2(totalOt15)
    const totalOt2Round = round2(totalOt2)
    const montant = round2(
      totalOt15Round * tauxHoraire * params.taux_normal
      + totalOt2Round * tauxHoraire * params.taux_majore,
    )

    // alertes_semaines : non recalculé ici. L'alerte 55h WRA légale
    // n'est pertinente qu'avec les heures normales planning, dont la
    // saisie libre n'a pas connaissance. Elle vit dans previewOvertimeMois.
    lignes_validees.push({
      employe_id: empId,
      employe_nom: `${employe.prenom ?? ''} ${employe.nom ?? ''}`.trim(),
      salaire_base: salaireBase,
      taux_horaire_base: tauxHoraire,
      jours,
      total_ot_1_5_heures: totalOt15Round,
      total_ot_2_heures: totalOt2Round,
      total_ot_montant: montant,
      alertes_semaines: [],
      a_alerte_illegal: false,
    })
  }

  return { lignes_validees, erreurs_validation }
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
