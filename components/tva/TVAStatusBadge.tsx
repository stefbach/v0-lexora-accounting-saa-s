import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
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

const statutConfig: Record<TVAStatut, { label: string; className: string }> = {
  a_payer: {
    label: "À PAYER",
    className: "bg-red-100 text-red-800 border-red-200",
  },
  credit: {
    label: "CRÉDIT",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  neant: {
    label: "NÉANT",
    className: "bg-gray-100 text-gray-800 border-gray-200",
  },
}

export function TVAStatusBadge({ statut, montant }: TVAStatusBadgeProps) {
  const config = statutConfig[statut]
  return (
    <Badge variant="outline" className={cn(config.className)}>
      {config.label}
      {montant !== undefined && statut !== "neant" && (
        <span className="ml-1">{formatMUR(montant)}</span>
      )}
    </Badge>
  )
}
