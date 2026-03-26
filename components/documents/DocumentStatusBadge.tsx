import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import type { DocumentStatus } from "@/lib/types"

interface DocumentStatusBadgeProps {
  statut: DocumentStatus
}

const statusConfig: Record<DocumentStatus, { label: string; className: string }> = {
  en_attente: {
    label: "En attente",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  en_cours: {
    label: "En cours",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  traite: {
    label: "Traité",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  erreur: {
    label: "Erreur",
    className: "bg-red-100 text-red-800 border-red-200",
  },
}

export function DocumentStatusBadge({ statut }: DocumentStatusBadgeProps) {
  const config = statusConfig[statut]
  return (
    <Badge variant="outline" className={cn(config.className)}>
      {config.label}
    </Badge>
  )
}
