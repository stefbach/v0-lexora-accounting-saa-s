import { redirect } from "next/navigation"

/**
 * Le module « Production » est fusionné dans la Comptabilité analytique
 * (sections de type production). Cette page redirige vers le module unifié.
 * Les données (nomenclatures, ordres de fabrication) restent intactes en base.
 */
export default function ManufacturingRedirect() {
  redirect("/client/analytique")
}
