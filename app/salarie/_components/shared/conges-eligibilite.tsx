"use client"
/**
 * B.2 — Helpers + composants partagés pour afficher le statut d'éligibilité
 * WRA 2019 (Maurice) dans l'espace salarié.
 *
 * 3 statuts (cf. API /api/rh/conges?action=balances) :
 *   - not_eligible : ancienneté < 6 mois → 0 AL, 0 SL
 *   - accruing     : 6-11 mois → accrual 1/mois, max 6
 *   - eligible     : ≥ 12 mois → droit plein 22/15
 */
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, Clock, Lock } from "lucide-react"

export type EligibilityStatus = "not_eligible" | "accruing" | "eligible"

export function formatDateFR(iso: string | null | undefined): string {
  if (!iso) return "—"
  const s = String(iso).slice(0, 10)
  const [y, m, d] = s.split("-")
  if (!y || !m || !d) return s
  return `${d}/${m}/${y}`
}

export function formatPeriodeFR(debut: string | null | undefined, fin: string | null | undefined): string {
  if (!debut || !fin) return "—"
  return `${formatDateFR(debut)} → ${formatDateFR(fin)}`
}

/** date_arrivee + 6 mois (ISO YYYY-MM-DD) */
export function computeDatePlus6Months(dateArrivee: string | null | undefined): string | null {
  if (!dateArrivee) return null
  const d = new Date(String(dateArrivee).slice(0, 10) + "T12:00:00")
  d.setMonth(d.getMonth() + 6)
  return d.toISOString().slice(0, 10)
}

export function EligibiliteBadge({ status }: { status: EligibilityStatus }) {
  if (status === "eligible") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 gap-1 font-medium">
        <CheckCircle2 className="w-3 h-3" /> Droit plein
      </Badge>
    )
  }
  if (status === "accruing") {
    return (
      <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 gap-1 font-medium">
        <Clock className="w-3 h-3" /> Acquisition
      </Badge>
    )
  }
  return (
    <Badge className="bg-gray-200 text-gray-600 hover:bg-gray-200 gap-1 font-medium">
      <Lock className="w-3 h-3" /> Pas éligible
    </Badge>
  )
}

/**
 * Bannière d'information pour le tab Congés selon le statut.
 * Renvoie null si eligible (pas de message bloquant à afficher).
 */
export function EligibiliteBannerConges({
  status,
  eligibilityDate,
  dateArrivee,
  alDroit,
  slDroit,
}: {
  status: EligibilityStatus
  eligibilityDate: string | null
  dateArrivee: string | null
  alDroit: number
  slDroit: number
}) {
  if (status === "not_eligible") {
    const date6m = computeDatePlus6Months(dateArrivee)
    return (
      <Card className="border-red-300 bg-red-50 rounded-xl shadow-sm">
        <CardContent className="p-4 flex items-start gap-3">
          <Lock className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <div className="text-sm text-red-900 space-y-1">
            <p className="font-semibold">Vous n'êtes pas encore éligible aux congés annuels.</p>
            <p>
              Vous pourrez faire vos premières demandes à partir du{" "}
              <strong>{formatDateFR(date6m)}</strong> (acquisition de 1 jour/mois jusqu'au
              12<sup>e</sup> mois).
            </p>
            <p className="text-xs opacity-80">
              Loi mauricienne WRA 2019 : 6 mois minimum avant acquisition.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }
  if (status === "accruing") {
    return (
      <Card className="border-orange-300 bg-orange-50 rounded-xl shadow-sm">
        <CardContent className="p-4 flex items-start gap-3">
          <Clock className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
          <div className="text-sm text-orange-900 space-y-1">
            <p className="font-semibold">Vous êtes en période d'acquisition.</p>
            <p>
              Vous avez <strong>{alDroit} AL</strong> et <strong>{slDroit} SL</strong> accumulés (max
              6 chacun au 11<sup>e</sup> mois).
            </p>
            <p>
              Droit plein (22 AL + 15 SL) à partir du{" "}
              <strong>{formatDateFR(eligibilityDate)}</strong>.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }
  return null
}
