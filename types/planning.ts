/**
 * Types partagés par la config de planning (societes.shifts_planning /
 * config_planning / regles_planning — séparés par migration 148).
 */

export type ShiftType = 'normal' | 'nuit' | 'ferie' | 'astreinte' | 'teletravail' | 'garde' | 'repos'
export type JourCode = 'lun' | 'mar' | 'mer' | 'jeu' | 'ven' | 'sam' | 'dim'
export type SemaineType = '5j' | '5.5j' | '6j'
export type TypeRotation = 'fixe' | 'tournante' | 'mixte'

export interface PlanningShift {
  id: string              // uuid v4 généré côté client (crypto.randomUUID)
  code: string            // Ex: "J", "N", "R" — max 3 caractères, unique
  label: string           // Ex: "Journée", "Nuit", "Repos"
  type: ShiftType
  debut: string | null    // "HH:MM" ou null pour repos
  fin: string | null
  flexible: boolean
  debut_min?: string
  debut_max?: string
  pause_minutes: number
  heures_requises: number
  jours: JourCode[]
  couleur: string         // hex #RRGGBB
  actif: boolean
}

export interface PlanningRegleLegale {
  key: string
  type: 'number' | 'boolean' | 'time' | 'percent'
  unit: string
  label: string
  value: number | boolean | string
  wraRef: string
  enabled: boolean
  category: 'heures' | 'repos' | 'ot' | 'equipe'
}

export interface PlanningConfig {
  jours_travailles: JourCode[]
  semaine_type: SemaineType
  jour_repos_principal: JourCode
  type_rotation: TypeRotation
}

export interface ReglesPlanningComplet {
  regles_planning: PlanningRegleLegale[]
  shifts_planning: PlanningShift[]
  config_planning: PlanningConfig
}

export const JOURS_LABELS: Record<JourCode, { long: string; short: string }> = {
  lun: { long: 'Lundi',    short: 'Lun' },
  mar: { long: 'Mardi',    short: 'Mar' },
  mer: { long: 'Mercredi', short: 'Mer' },
  jeu: { long: 'Jeudi',    short: 'Jeu' },
  ven: { long: 'Vendredi', short: 'Ven' },
  sam: { long: 'Samedi',   short: 'Sam' },
  dim: { long: 'Dimanche', short: 'Dim' },
}

export const JOURS_ORDER: JourCode[] = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']

export const DEFAULT_CONFIG: PlanningConfig = {
  jours_travailles: ['lun', 'mar', 'mer', 'jeu', 'ven'],
  semaine_type: '5j',
  jour_repos_principal: 'dim',
  type_rotation: 'fixe',
}

export const DEFAULT_REGLES_WRA: PlanningRegleLegale[] = [
  { key: 'max_heures_semaine',       label: 'Heures max par semaine',                value: 45,        unit: 'heures',              wraRef: 'WRA 2019, Art. 14(1)',      category: 'heures', enabled: true, type: 'number' },
  { key: 'max_heures_jour',          label: 'Heures max par jour (semaine 5j)',      value: 9,         unit: 'heures',              wraRef: 'WRA 2019, Art. 14(2)(a)',   category: 'heures', enabled: true, type: 'number' },
  { key: 'max_heures_jour_6j',       label: 'Heures max par jour (semaine 6j)',      value: 8,         unit: 'heures',              wraRef: 'WRA 2019, Art. 14(2)(b)',   category: 'heures', enabled: true, type: 'number' },
  { key: 'pause_minimum_minutes',    label: 'Pause minimum par 6h travaillées',      value: 30,        unit: 'minutes',             wraRef: 'WRA 2019, Art. 15',         category: 'heures', enabled: true, type: 'number' },
  { key: 'max_jours_consecutifs',    label: 'Jours consécutifs max avant repos',     value: 6,         unit: 'jours',               wraRef: 'WRA 2019, Art. 16(1)',      category: 'repos',  enabled: true, type: 'number' },
  { key: 'repos_minimum_semaine',    label: 'Repos minimum par semaine',             value: 1,         unit: 'jour (24h consécutives)', wraRef: 'WRA 2019, Art. 16(2)',  category: 'repos',  enabled: true, type: 'number' },
  { key: 'rotation_preavis_jours',   label: 'Préavis avant changement de rotation',  value: 7,         unit: 'jours',               wraRef: 'WRA 2019, Art. 17',         category: 'repos',  enabled: true, type: 'number' },
  { key: 'nuit_debut',               label: 'Début travail de nuit',                 value: '18:00',   unit: '',                    wraRef: 'WRA 2019, Art. 2',          category: 'repos',  enabled: true, type: 'time'   },
  { key: 'nuit_fin',                 label: 'Fin travail de nuit',                   value: '06:00',   unit: '',                    wraRef: 'WRA 2019, Art. 2',          category: 'repos',  enabled: true, type: 'time'   },
  { key: 'ot_apres_heures',          label: 'OT commence après X heures/jour',       value: 9,         unit: 'heures',              wraRef: 'WRA 2019, Art. 20(1)',      category: 'ot',     enabled: true, type: 'number' },
  { key: 'ot_taux_15x',              label: 'Taux 1.5x (2 premières heures OT)',     value: true,      unit: '',                    wraRef: 'WRA 2019, Art. 20(2)(a)',   category: 'ot',     enabled: true, type: 'boolean' },
  { key: 'ot_taux_2x',               label: 'Taux 2x (fériés / nuit)',               value: true,      unit: '',                    wraRef: 'WRA 2019, Art. 20(2)(b)',   category: 'ot',     enabled: true, type: 'boolean' },
  { key: 'ferie_travaille_taux',     label: 'Taux jour férié travaillé',             value: 2.0,       unit: 'x salaire',           wraRef: 'WRA 2019, Art. 21',         category: 'ot',     enabled: true, type: 'number' },
  { key: 'max_employes_absents_pct', label: 'Max employés absents même jour',        value: 30,        unit: '%',                   wraRef: 'Politique interne',         category: 'equipe', enabled: true, type: 'percent' },
]
