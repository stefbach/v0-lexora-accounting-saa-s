import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { t, getLocale } from "@/lib/i18n"
import type { DocumentStatus } from "@/lib/types"

interface DocumentStatusBadgeProps {
  statut: DocumentStatus
}

const statusConfig: Record<DocumentStatus, { labelKey: string; className: string }> = {
  en_attente: {
    labelKey: "scmsc.doc.statut_en_attente",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  en_cours: {
    labelKey: "scmsc.doc.statut_en_cours",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  traite: {
    labelKey: "scmsc.doc.statut_traite",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  erreur: {
    labelKey: "scmsc.doc.statut_erreur",
    className: "bg-red-100 text-red-800 border-red-200",
  },
}

export function DocumentStatusBadge({ statut }: DocumentStatusBadgeProps) {
  const locale = getLocale()
  const config = statusConfig[statut]
  return (
    <Badge variant="outline" className={cn(config.className)}>
      {t(config.labelKey, locale)}
    </Badge>
  )
}
