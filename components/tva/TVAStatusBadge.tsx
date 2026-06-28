import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { t, getLocale } from "@/lib/i18n"
import type { TVAStatut } from "@/lib/types"

interface TVAStatusBadgeProps {
  statut: TVAStatut
  montant?: number
}

function formatMUR(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MUR",
    minimumFractionDigits: 2,
  }).format(amount)
}

const statutConfig: Record<TVAStatut, { labelKey: string; className: string }> = {
  a_payer: {
    labelKey: "scmsc.tva.statut_a_payer",
    className: "bg-red-100 text-red-800 border-red-200",
  },
  credit: {
    labelKey: "scmsc.tva.statut_credit",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  neant: {
    labelKey: "scmsc.tva.statut_neant",
    className: "bg-gray-100 text-gray-800 border-gray-200",
  },
}

export function TVAStatusBadge({ statut, montant }: TVAStatusBadgeProps) {
  const locale = getLocale()
  const config = statutConfig[statut]
  return (
    <Badge variant="outline" className={cn(config.className)}>
      {t(config.labelKey, locale)}
      {montant !== undefined && statut !== "neant" && (
        <span className="ml-1">{formatMUR(montant)}</span>
      )}
    </Badge>
  )
}
