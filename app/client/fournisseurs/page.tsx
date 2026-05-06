// Redirect — la page /client/fournisseurs a été fusionnée dans /client/factures
// (filtre "Fournisseurs"). Cette page redirige automatiquement.

import { redirect } from "next/navigation"

export default function FournisseursRedirect() {
  redirect("/client/factures?type=fournisseur")
}
