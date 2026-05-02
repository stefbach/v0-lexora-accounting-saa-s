import { redirect } from "next/navigation"

/**
 * Entry point du wizard d'onboarding. On redirige systématiquement
 * vers l'étape 1 (création de la société). L'utilisateur peut
 * librement repartir en arrière en gardant son brouillon (sessionStorage).
 */
export default function OnboardingEntryPage() {
  redirect("/onboarding/societe")
}
