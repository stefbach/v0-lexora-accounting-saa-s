/**
 * Sprint 12 FEATURE 5 — /rh/paie/validation est fusionné avec /rh/paie
 * (onglet "Validation"). Cette page reste en place pour préserver les
 * bookmarks / liens externes pendant un sprint avant suppression complète.
 *
 * Redirect côté serveur vers /rh/paie?tab=validation.
 */

import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default function PayrollValidationRedirectPage() {
  redirect("/rh/paie?tab=validation")
}
