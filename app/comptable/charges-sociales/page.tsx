import { redirect } from "next/navigation"

/**
 * /comptable/charges-sociales était un clone textuel de /comptable/balance
 * (tous les libellés `cab.charges.*` pointaient en réalité vers les
 * traductions de balance, et l'API appelée était `/api/comptable/balance`).
 *
 * En attendant une vraie page charges sociales (lecture `bulletins_paie`
 * + écritures sur comptes 437/438, cf. wave 3), on redirige vers la
 * page Balance officielle.
 */
export default function ChargesSocialesPage() {
  redirect("/comptable/balance")
}
