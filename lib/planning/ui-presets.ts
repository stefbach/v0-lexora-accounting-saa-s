import type { PlanningShift, JourCode } from '@/types/planning'

/**
 * Presets visibles dans la section "Démarrage rapide" de /rh/planning/regles.
 * Différent de lib/planning/presets.ts (qui sert les boutons par société OCC/DDS
 * spécifiques) — ici ce sont des modèles génériques d'activité.
 */

export interface UIPreset {
  key: string
  label: string
  description: string
  icon: string                                  // emoji
  shifts: Omit<PlanningShift, 'id'>[]
  jours_travailles: JourCode[]
}

export const UI_PRESETS: UIPreset[] = [
  {
    key: 'bureau',
    label: 'Bureau standard',
    description: '9h-17h30 · Lundi au Vendredi · Pause 30min',
    icon: '💼',
    shifts: [
      {
        code: 'B', label: 'Bureau', type: 'normal',
        debut: '09:00', fin: '17:30', flexible: false,
        pause_minutes: 30, heures_requises: 8,
        jours: ['lun', 'mar', 'mer', 'jeu', 'ven'],
        couleur: '#2196F3', actif: true,
      },
      {
        code: 'R', label: 'Repos', type: 'repos',
        debut: null, fin: null, flexible: false,
        pause_minutes: 0, heures_requises: 0,
        jours: ['sam', 'dim'],
        couleur: '#9E9E9E', actif: true,
      },
    ],
    jours_travailles: ['lun', 'mar', 'mer', 'jeu', 'ven'],
  },
  {
    key: 'clinique',
    label: 'Clinique / Santé',
    description: '9h-19h avec flex 7h-10h · Pause 1h · Lun-Ven',
    icon: '🏥',
    shifts: [
      {
        code: 'J', label: 'Journée', type: 'normal',
        debut: '09:00', fin: '19:00',
        flexible: true, debut_min: '07:00', debut_max: '10:00',
        pause_minutes: 60, heures_requises: 9,
        jours: ['lun', 'mar', 'mer', 'jeu', 'ven'],
        couleur: '#4CAF50', actif: true,
      },
      {
        code: 'R', label: 'Repos', type: 'repos',
        debut: null, fin: null, flexible: false,
        pause_minutes: 0, heures_requises: 0,
        jours: ['sam', 'dim'],
        couleur: '#9E9E9E', actif: true,
      },
    ],
    jours_travailles: ['lun', 'mar', 'mer', 'jeu', 'ven'],
  },
  {
    key: '3x8',
    label: '3×8 rotation',
    description: 'Matin / Après-midi / Nuit · 7j/7',
    icon: '🔄',
    shifts: [
      {
        code: 'M', label: 'Matin', type: 'normal',
        debut: '06:00', fin: '14:00', flexible: false,
        pause_minutes: 30, heures_requises: 7.5,
        jours: ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'],
        couleur: '#FF9800', actif: true,
      },
      {
        code: 'AM', label: 'Après-midi', type: 'normal',
        debut: '14:00', fin: '22:00', flexible: false,
        pause_minutes: 30, heures_requises: 7.5,
        jours: ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'],
        couleur: '#9C27B0', actif: true,
      },
      {
        code: 'N', label: 'Nuit', type: 'nuit',
        debut: '22:00', fin: '06:00', flexible: false,
        pause_minutes: 30, heures_requises: 7.5,
        jours: ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'],
        couleur: '#3F51B5', actif: true,
      },
    ],
    jours_travailles: ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'],
  },
]

/**
 * WRA reference → explication courte en français (affichée en Tooltip sur
 * les badges `wraRef` de la section Règles légales).
 */
export const WRA_EXPLANATIONS: Record<string, string> = {
  'WRA 2019, Art. 14(1)':    "Limite hebdomadaire de 45 heures normales. Au-delà, heures supplémentaires.",
  'WRA 2019, Art. 14(2)(a)': "Limite journalière de 9 h dans une semaine de 5 jours.",
  'WRA 2019, Art. 14(2)(b)': "Limite journalière de 8 h dans une semaine de 6 jours.",
  'WRA 2019, Art. 15':       "Pause obligatoire de 30 minutes après 6 heures de travail continu.",
  'WRA 2019, Art. 16(1)':    "Repos obligatoire après 6 jours consécutifs de travail.",
  'WRA 2019, Art. 16(2)':    "Repos hebdomadaire minimum de 24 heures consécutives.",
  'WRA 2019, Art. 17':       "Préavis de 7 jours avant changement d'horaire de rotation.",
  'WRA 2019, Art. 2':        "Définition légale du travail de nuit (18h–6h par défaut).",
  'WRA 2019, Art. 20(1)':    "Seuil à partir duquel les heures sont considérées comme supplémentaires.",
  'WRA 2019, Art. 20(2)(a)': "Les 2 premières heures sup sont payées à 1,5× le taux normal.",
  'WRA 2019, Art. 20(2)(b)': "Les heures sup au-delà de 2 h, de nuit ou un férié sont payées 2×.",
  'WRA 2019, Art. 21':       "Multiplicateur pour jours fériés travaillés (généralement 2×).",
  'Politique interne':       "Règle définie par l'entreprise, non imposée par la loi.",
}

export function getWRAExplanation(wraRef: string): string {
  return WRA_EXPLANATIONS[wraRef] || wraRef
}
