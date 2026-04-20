import type { PlanningShift } from '@/types/planning'

/**
 * Presets de créneaux pour les sociétés principales. Utilisés par le bouton
 * "Charger preset" dans /rh/planning/regles. L'`id` de chaque shift est
 * généré à la volée au chargement (crypto.randomUUID) pour rester unique.
 */

export const PRESET_OCC_SHIFTS: Omit<PlanningShift, 'id'>[] = [
  {
    code: 'J',
    label: 'Journée',
    type: 'normal',
    debut: '09:00',
    fin: '19:00',
    flexible: true,
    debut_min: '07:00',
    debut_max: '10:00',
    pause_minutes: 60,
    heures_requises: 9,
    jours: ['lun', 'mar', 'mer', 'jeu', 'ven'],
    couleur: '#4CAF50',
    actif: true,
  },
  {
    code: 'R',
    label: 'Repos',
    type: 'repos',
    debut: null,
    fin: null,
    flexible: false,
    pause_minutes: 0,
    heures_requises: 0,
    jours: ['sam', 'dim'],
    couleur: '#9E9E9E',
    actif: true,
  },
]

export const PRESET_DDS_SHIFTS: Omit<PlanningShift, 'id'>[] = [
  {
    code: 'B',
    label: 'Bureau',
    type: 'normal',
    debut: '09:00',
    fin: '17:30',
    flexible: true,
    debut_min: '08:00',
    debut_max: '10:00',
    pause_minutes: 30,
    heures_requises: 8,
    jours: ['lun', 'mar', 'mer', 'jeu', 'ven'],
    couleur: '#2196F3',
    actif: true,
  },
  {
    code: 'R',
    label: 'Repos',
    type: 'repos',
    debut: null,
    fin: null,
    flexible: false,
    pause_minutes: 0,
    heures_requises: 0,
    jours: ['sam', 'dim'],
    couleur: '#9E9E9E',
    actif: true,
  },
]

/**
 * Hydrate un preset (Omit<id>) en shifts complets prêts à insérer, en
 * générant un uuid v4 côté client pour chaque créneau.
 */
export function hydratePreset(preset: Omit<PlanningShift, 'id'>[]): PlanningShift[] {
  const gen = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? () => crypto.randomUUID()
    : () => `s_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
  return preset.map(s => ({ ...s, id: gen() }))
}
