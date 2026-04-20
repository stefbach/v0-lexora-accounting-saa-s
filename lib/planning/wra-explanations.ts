/**
 * Explications courtes pour chaque référence WRA 2019, affichées en Tooltip
 * sur les badges `wraRef` dans la section "Règles légales" de la page
 * /rh/planning/regles.
 */
export const WRA_EXPLANATIONS: Record<string, string> = {
  "WRA 2019, Art. 14(1)":    "Limite hebdomadaire de 45 heures normales. Au-delà, heures supplémentaires.",
  "WRA 2019, Art. 14(2)(a)": "Limite journalière de 9 h dans une semaine de 5 jours.",
  "WRA 2019, Art. 14(2)(b)": "Limite journalière de 8 h dans une semaine de 6 jours.",
  "WRA 2019, Art. 15":       "Pause obligatoire de 30 minutes après 6 heures de travail continu.",
  "WRA 2019, Art. 16(1)":    "Repos obligatoire après 6 jours consécutifs de travail.",
  "WRA 2019, Art. 16(2)":    "Repos hebdomadaire minimum de 24 heures consécutives.",
  "WRA 2019, Art. 17":       "Préavis de 7 jours avant changement d'horaire de rotation.",
  "WRA 2019, Art. 2":        "Définition légale du travail de nuit (18h–6h par défaut).",
  "WRA 2019, Art. 20(1)":    "Seuil à partir duquel les heures sont considérées comme supplémentaires.",
  "WRA 2019, Art. 20(2)(a)": "Les 2 premières heures sup sont payées à 1,5× le taux normal.",
  "WRA 2019, Art. 20(2)(b)": "Les heures sup au-delà de 2 h, de nuit ou un férié sont payées 2×.",
  "WRA 2019, Art. 21":       "Multiplicateur pour jours fériés travaillés (généralement 2×).",
  "Politique interne":       "Règle définie par l'entreprise, non imposée par la loi.",
}

export function getWRAExplanation(wraRef: string): string {
  return WRA_EXPLANATIONS[wraRef] || wraRef
}
