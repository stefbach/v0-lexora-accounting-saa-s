"use client"

import { Badge } from "@/components/ui/badge"
import { Globe, Phone, Briefcase, Linkedin, Hand, FileText, Building2, Users } from "lucide-react"
import type { CrmSource } from "@/lib/crm/types"

const SOURCE_META: Record<CrmSource, { label: string; icon: typeof Globe; cls: string }> = {
  cbrd: { label: "CBRD", icon: Globe, cls: "bg-sky-50 text-sky-700 border-sky-200" },
  yellowpages_mu: { label: "Yellow Pages", icon: Phone, cls: "bg-amber-50 text-amber-700 border-amber-200" },
  mcci: { label: "MCCI", icon: Building2, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  apollo: { label: "Apollo", icon: Briefcase, cls: "bg-violet-50 text-violet-700 border-violet-200" },
  linkedin: { label: "LinkedIn", icon: Linkedin, cls: "bg-blue-50 text-blue-700 border-blue-200" },
  manuel: { label: "Manuel", icon: Hand, cls: "bg-slate-50 text-slate-700 border-slate-200" },
  import_csv: { label: "CSV", icon: FileText, cls: "bg-zinc-50 text-zinc-700 border-zinc-200" },
  referral: { label: "Referral", icon: Users, cls: "bg-rose-50 text-rose-700 border-rose-200" },
}

export const SOURCE_OPTIONS: { value: CrmSource; label: string }[] = (Object.keys(SOURCE_META) as CrmSource[]).map(
  (v) => ({ value: v, label: SOURCE_META[v].label })
)

export function SourceBadge({ source }: { source: CrmSource }) {
  const meta = SOURCE_META[source] ?? SOURCE_META.manuel
  const Icon = meta.icon
  return (
    <Badge variant="outline" className={`gap-1 ${meta.cls}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  )
}
