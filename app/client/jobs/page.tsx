import { redirect } from "next/navigation"

/**
 * Le module « Affaires & Chantiers » est fusionné dans la Comptabilité
 * analytique (sections de type chantier). Cette page redirige vers le module
 * unifié. Les données (jobs, imputations de temps) restent intactes en base.
 */
export default function JobsRedirect() {
  redirect("/client/analytique")
}
