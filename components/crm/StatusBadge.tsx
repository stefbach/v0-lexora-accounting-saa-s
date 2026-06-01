"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { CrmProspectStatus } from "@/lib/crm/types"

const STATUS_STYLES: Record<CrmProspectStatus, string> = {
  nouveau: "bg-gray-100 text-gray-800 hover:bg-gray-100",
  a_qualifier: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  qualifie: "bg-indigo-100 text-indigo-800 hover:bg-indigo-100",
  contacte: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  en_discussion: "bg-purple-100 text-purple-800 hover:bg-purple-100",
  gagne: "bg-green-100 text-green-800 hover:bg-green-100",
  perdu: "bg-red-100 text-red-800 hover:bg-red-100",
  opt_out: "bg-stone-100 text-stone-600 hover:bg-stone-100",
}

const STATUS_LABELS: Record<CrmProspectStatus, string> = {
  nouveau: "Nouveau",
  a_qualifier: "A qualifier",
  qualifie: "Qualifie",
  contacte: "Contacte",
  en_discussion: "En discussion",
  gagne: "Gagne",
  perdu: "Perdu",
  opt_out: "Opt-out",
}

export function StatusBadge({ status, className }: { status: CrmProspectStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("border-0 font-medium", STATUS_STYLES[status], className)}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

export const STATUS_OPTIONS: { value: CrmProspectStatus; label: string }[] = (Object.keys(STATUS_LABELS) as CrmProspectStatus[]).map((v) => ({
  value: v,
  label: STATUS_LABELS[v],
}))
