"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Building2, Users, Target, TrendingUp, Activity as ActivityIcon } from "lucide-react"
import type { CrmCompany, CrmActivity, CrmProspectStatus } from "@/lib/crm/types"
import { StatusBadge } from "@/components/crm/StatusBadge"
import { ActivityTimeline } from "@/components/crm/ActivityTimeline"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

const panelStyle: React.CSSProperties = {
  border: "1px solid #D8DFED",
  borderRadius: 18,
  background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
  boxShadow:
    "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.9)",
}

const STATUS_ORDER: CrmProspectStatus[] = ["nouveau", "a_qualifier", "qualifie", "contacte", "en_discussion", "gagne", "perdu", "opt_out"]

export default function CrmDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<CrmCompany[]>([])
  const [activities, setActivities] = useState<CrmActivity[]>([])
  const [contactsCount, setContactsCount] = useState<number>(0)
  const [decisionMakers, setDecisionMakers] = useState<number>(0)

  useEffect(() => {
    const load = async () => {
      try {
        const [cRes, aRes, contRes, dmRes] = await Promise.all([
          fetch("/api/crm/companies?limit=200"),
          fetch("/api/crm/activities?limit=20"),
          fetch("/api/crm/contacts?limit=1"),
          fetch("/api/crm/contacts?decision_maker=true&limit=1"),
        ])
        const cJson = cRes.ok ? await cRes.json() : { data: [] }
        const aJson = aRes.ok ? await aRes.json() : { data: [] }
        const contJson = contRes.ok ? await contRes.json() : { total: 0 }
        const dmJson = dmRes.ok ? await dmRes.json() : { total: 0 }
        setCompanies(cJson.data || [])
        setActivities(aJson.data || [])
        setContactsCount(contJson.total ?? (contJson.data?.length || 0))
        setDecisionMakers(dmJson.total ?? (dmJson.data?.length || 0))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    )
  }

  const total = companies.length
  const byStatus: Record<CrmProspectStatus, number> = {
    nouveau: 0, a_qualifier: 0, qualifie: 0, contacte: 0, en_discussion: 0, gagne: 0, perdu: 0, opt_out: 0,
  }
  for (const c of companies) byStatus[c.statut] = (byStatus[c.statut] || 0) + 1

  const topScored = [...companies]
    .filter((c) => (c.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5)

  const gagnesCount = byStatus.gagne || 0
  const conversionRate = total > 0 ? Math.round((gagnesCount / total) * 100) : 0

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold" style={{ color: NAVY }}>CRM Prospection</h1>
        <p className="text-sm text-muted-foreground mt-1">Pipeline commercial et opportunites Lexora</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div style={panelStyle} className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Building2 className="h-4 w-4" /> Prospects</div>
          <div className="mt-2 text-3xl font-bold" style={{ color: NAVY }}>{total}</div>
        </div>
        <div style={panelStyle} className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Users className="h-4 w-4" /> Contacts</div>
          <div className="mt-2 text-3xl font-bold" style={{ color: NAVY }}>{contactsCount}</div>
        </div>
        <div style={panelStyle} className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Target className="h-4 w-4" /> Decideurs</div>
          <div className="mt-2 text-3xl font-bold" style={{ color: NAVY }}>{decisionMakers}</div>
        </div>
        <div style={panelStyle} className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><TrendingUp className="h-4 w-4" /> Conversion</div>
          <div className="mt-2 text-3xl font-bold" style={{ color: NAVY }}>{conversionRate}%</div>
          <div className="text-xs text-muted-foreground mt-1">{gagnesCount} gagne(s) / {total}</div>
        </div>
      </div>

      <Card style={panelStyle}>
        <CardHeader>
          <CardTitle className="text-base">Repartition par statut</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {STATUS_ORDER.map((s) => (
              <div key={s} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2">
                <StatusBadge status={s} />
                <span className="text-sm font-semibold text-gray-800">{byStatus[s] || 0}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card style={panelStyle}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Top 5 prospects par score</CardTitle>
          </CardHeader>
          <CardContent>
            {topScored.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Aucun prospect score pour le moment.</p>
            ) : (
              <ul className="space-y-2">
                {topScored.map((c) => (
                  <li key={c.id} className="flex items-center justify-between rounded-md border bg-white px-3 py-2 hover:bg-gray-50">
                    <Link href={`/crm/prospects/${c.id}`} className="font-medium text-sm" style={{ color: NAVY }}>{c.nom}</Link>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={c.statut} />
                      <span className="text-sm font-bold" style={{ color: GOLD }}>{c.score}/100</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card style={panelStyle}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><ActivityIcon className="h-4 w-4" /> Activites recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityTimeline activities={activities} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
