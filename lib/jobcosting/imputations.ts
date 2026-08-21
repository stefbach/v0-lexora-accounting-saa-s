/**
 * lib/jobcosting/imputations.ts — Validation et contrôles d'une imputation de
 * temps. L'application effective (snapshot du coût horaire, cumul du job/OF,
 * verrou R5) est faite par la RPC `imputer_temps_job` (mig 492).
 * Réf. spec : §1.5 / §2.2 / §2.5.
 */

import { money, roundTo } from '@/lib/money'
import type { TypeHeures } from './types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TYPES_HEURES: TypeHeures[] = ['normale', 'heures_sup', 'deplacement']

export interface ImputationPayload {
  job_id: string | null
  ordre_fabrication_id: string | null
  employe_id: string
  pointage_id: string | null
  date_prestation: string
  heures: number
  type_heures: TypeHeures
  tache: string | null
  description: string | null
  facturable: boolean
  taux_horaire_facture: number | null
  cout_horaire_charge: number | null
}

type Resultat =
  | { ok: true; data: ImputationPayload }
  | { ok: false; error: string }

export function validateImputationPayload(body: unknown): Resultat {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body JSON requis' }
  const b = body as Record<string, unknown>

  const employe_id = typeof b.employe_id === 'string' ? b.employe_id.trim() : ''
  if (!employe_id) return { ok: false, error: 'employe_id requis' }

  const job_id = typeof b.job_id === 'string' && b.job_id.trim() ? b.job_id.trim() : null
  const ordre_fabrication_id =
    typeof b.ordre_fabrication_id === 'string' && b.ordre_fabrication_id.trim()
      ? b.ordre_fabrication_id.trim()
      : null
  if ((job_id === null) === (ordre_fabrication_id === null)) {
    return { ok: false, error: 'Exactement un rattachement requis (job OU ordre de fabrication)' }
  }

  const heures = Number(b.heures)
  if (!Number.isFinite(heures) || heures <= 0) {
    return { ok: false, error: 'heures doit être strictement positif' }
  }
  if (heures > 24) {
    return { ok: false, error: 'heures ne peut excéder 24 pour une journée' }
  }

  const type_heures = TYPES_HEURES.includes(b.type_heures as TypeHeures)
    ? (b.type_heures as TypeHeures)
    : 'normale'

  let taux_horaire_facture: number | null = null
  if (b.taux_horaire_facture !== undefined && b.taux_horaire_facture !== null && b.taux_horaire_facture !== '') {
    const t = Number(b.taux_horaire_facture)
    if (!Number.isFinite(t) || t < 0) return { ok: false, error: 'taux_horaire_facture invalide' }
    taux_horaire_facture = t
  }

  let cout_horaire_charge: number | null = null
  if (b.cout_horaire_charge !== undefined && b.cout_horaire_charge !== null && b.cout_horaire_charge !== '') {
    const c = Number(b.cout_horaire_charge)
    if (!Number.isFinite(c) || c < 0) return { ok: false, error: 'cout_horaire_charge invalide' }
    cout_horaire_charge = roundTo(c, 4)
  }

  const date_prestation =
    typeof b.date_prestation === 'string' && DATE_RE.test(b.date_prestation)
      ? b.date_prestation
      : new Date().toISOString().slice(0, 10)

  return {
    ok: true,
    data: {
      job_id,
      ordre_fabrication_id,
      employe_id,
      pointage_id: typeof b.pointage_id === 'string' && b.pointage_id.trim() ? b.pointage_id.trim() : null,
      date_prestation,
      heures: roundTo(heures, 2),
      type_heures,
      tache: b.tache ? String(b.tache).trim().slice(0, 200) : null,
      description: b.description ? String(b.description).trim().slice(0, 1000) : null,
      facturable: b.facturable !== false,
      taux_horaire_facture,
      cout_horaire_charge,
    },
  }
}

/**
 * Nombre d'heures d'un pointage : (sortie − entrée) − pause.
 * Format des heures : 'HH:MM' ou 'HH:MM:SS'. Retourne 0 si incomplet.
 */
export function heuresPointage(pointage: {
  heure_entree?: string | null
  heure_sortie?: string | null
  heure_pause_debut?: string | null
  heure_pause_fin?: string | null
}): number {
  const toMin = (t?: string | null): number | null => {
    if (!t || typeof t !== 'string') return null
    const m = t.match(/^(\d{1,2}):(\d{2})/)
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2])
  }
  const entree = toMin(pointage.heure_entree)
  const sortie = toMin(pointage.heure_sortie)
  if (entree == null || sortie == null || sortie <= entree) return 0
  let minutes = sortie - entree
  const pd = toMin(pointage.heure_pause_debut)
  const pf = toMin(pointage.heure_pause_fin)
  if (pd != null && pf != null && pf > pd) minutes -= pf - pd
  return roundTo(money(minutes).dividedBy(60), 2)
}

export interface ControleHeuresResult {
  ok: boolean
  heures_totales: number
  heures_pointees: number | null
  depassement: number
}

/**
 * Contrôle §1.5 : la somme des heures imputées (existantes + nouvelle) pour un
 * employé et une date ne doit pas dépasser les heures pointées + tolérance.
 * Si `heuresPointees` est null (consultant sans pointeuse), le contrôle passe
 * toujours — la saisie hors-pointeuse est explicitement autorisée (§2.8).
 */
export function controleHeuresJournee(
  heuresDejaImputees: number,
  heuresNouvelles: number,
  heuresPointees: number | null,
  toleranceHeures = 0,
): ControleHeuresResult {
  const total = roundTo(money(heuresDejaImputees).plus(money(heuresNouvelles)), 2)
  if (heuresPointees == null) {
    return { ok: true, heures_totales: total, heures_pointees: null, depassement: 0 }
  }
  const plafond = money(heuresPointees).plus(money(toleranceHeures))
  const depassement = money(total).gt(plafond)
    ? roundTo(money(total).minus(plafond), 2)
    : 0
  return {
    ok: depassement === 0,
    heures_totales: total,
    heures_pointees: heuresPointees,
    depassement,
  }
}
