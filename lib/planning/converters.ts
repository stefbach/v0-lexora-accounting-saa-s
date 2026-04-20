import type { PlanningShift, JourCode } from '@/types/planning'

/**
 * Converters pour bridger l'ancien type Creneau utilisé dans
 * app/rh/planning/page.tsx avec le nouveau PlanningShift (types/planning.ts).
 *
 * L'ancien type stockait la couleur sous forme de classes Tailwind (legacy
 * UI), alors que le nouveau type utilise du hex. Cette couche traduit dans
 * les deux sens pour que la grande page planning continue à fonctionner
 * pendant la transition.
 */

export interface Creneau {
  id: string
  nom: string
  code: string
  heure_debut: string
  heure_fin: string
  pause_debut: string
  pause_fin: string
  pause_minutes: number
  heures_effectives: number
  couleur: string       // Tailwind classes pour l'UI legacy (bg-… text-…)
  jours?: string[]      // Pour persistance DB (lun, mar, …)
}

const COLOR_MAP_HEX_TO_TW: Record<string, string> = {
  '#4CAF50': 'bg-emerald-500 text-white',
  '#2196F3': 'bg-blue-500 text-white',
  '#FF9800': 'bg-orange-500 text-white',
  '#9C27B0': 'bg-purple-500 text-white',
  '#3F51B5': 'bg-indigo-600 text-white',
  '#E91E63': 'bg-pink-500 text-white',
  '#009688': 'bg-teal-500 text-white',
  '#F44336': 'bg-red-500 text-white',
  '#00BCD4': 'bg-cyan-600 text-white',
  '#9E9E9E': 'bg-gray-200 text-gray-600',
}

const COLOR_MAP_TW_TO_HEX: Record<string, string> = Object.fromEntries(
  Object.entries(COLOR_MAP_HEX_TO_TW).map(([k, v]) => [v, k]),
)

export function hexToTailwind(hex: string): string {
  return COLOR_MAP_HEX_TO_TW[hex.toUpperCase()] || 'bg-blue-500 text-white'
}

export function tailwindToHex(tw: string): string {
  return COLOR_MAP_TW_TO_HEX[tw] || '#2196F3'
}

export function shiftToCreneau(s: PlanningShift): Creneau {
  return {
    id: s.id,
    nom: s.label,
    code: s.code,
    heure_debut: s.debut || '',
    heure_fin: s.fin || '',
    pause_debut: '',
    pause_fin: '',
    pause_minutes: s.pause_minutes,
    heures_effectives: s.heures_requises,
    couleur: hexToTailwind(s.couleur),
    jours: s.jours,
  }
}

export function creneauToShift(
  c: Creneau,
  defaultJours: JourCode[] = ['lun', 'mar', 'mer', 'jeu', 'ven'],
): PlanningShift {
  const nomLower = c.nom.toLowerCase()
  const type: PlanningShift['type'] = nomLower.includes('repos')
    ? 'repos'
    : nomLower.includes('nuit')
      ? 'nuit'
      : 'normal'
  return {
    id: c.id,
    code: c.code,
    label: c.nom,
    type,
    debut: c.heure_debut || null,
    fin: c.heure_fin || null,
    flexible: false,
    pause_minutes: c.pause_minutes,
    heures_requises: c.heures_effectives,
    jours: ((c.jours as JourCode[] | undefined) ?? defaultJours),
    couleur: tailwindToHex(c.couleur),
    actif: true,
  }
}
