// Brand colors + timezone + month labels shared across all salarie tabs.
// Extracted from the monolithic page.tsx during sprint-salarie V0.1.

export const NAVY = "#0B0F2E"
export const GOLD = "#D4AF37"
export const BLUE = "#4191FF"
export const GREEN = "#2ECC8A"
export const MU_TZ = "Indian/Mauritius"

export const MONTH_NAMES_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]

export type Tab =
  | "dashboard" | "profil" | "bulletins" | "planning"
  | "primes" | "conges" | "documents" | "trajets"
  | "sante" | "contrats"

export const KNOWN_TABS: Tab[] = [
  "dashboard", "profil", "bulletins", "planning",
  "primes", "conges", "documents", "trajets",
  "sante", "contrats",
]
