"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Search, Building2 } from "lucide-react"
import { StatusBadge, STATUS_OPTIONS } from "@/components/crm/StatusBadge"
import { SourceBadge, SOURCE_OPTIONS } from "@/components/crm/SourceBadge"
import { AddProspectDialog } from "@/components/crm/AddProspectDialog"
import { ConnectorSearchDialog } from "@/components/crm/ConnectorSearchDialog"
import { EmptyState } from "@/components/ui/empty-state"
import type { CrmCompany } from "@/lib/crm/types"

const NAVY = "#0B0F2E"

const panelStyle: React.CSSProperties = {
  border: "1px solid #D8DFED",
  borderRadius: 18,
  background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16)",
}

export default function ProspectsPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<CrmCompany[]>([])
  const [q, setQ] = useState("")
  const [statut, setStatut] = useState<string>("all")
  const [source, setSource] = useState<string>("all")
  const [counts, setCounts] = useState<Record<string, number>>({})

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("limit", "200")
      if (q.trim()) params.set("q", q.trim())
      if (statut !== "all") params.set("statut", statut)
      if (source !== "all") params.set("source", source)
      const res = await fetch(`/api/crm/companies?${params.toString()}`)
      const json = await res.json()
      setItems(json.data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statut, source])

  useEffect(() => {
    const ids = items.map((i) => i.id)
    if (ids.length === 0) { setCounts({}); return }
    fetch(`/api/crm/contacts?limit=1000`).then(r => r.ok ? r.json() : { data: [] }).then(j => {
      const map: Record<string, number> = {}
      for (const c of (j.data || []) as Array<{ company_id: string | null }>) {
        if (c.company_id) map[c.company_id] = (map[c.company_id] || 0) + 1
      }
      setCounts(map)
    }).catch(() => {})
  }, [items])

  const filteredCount = useMemo(() => items.length, [items])

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: NAVY }}>Prospects</h1>
          <p className="text-sm text-muted-foreground mt-1">{filteredCount} societe(s)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ConnectorSearchDialog onSuccess={load} />
          <AddProspectDialog onCreated={() => load()} />
        </div>
      </div>

      <Card style={panelStyle} className="p-4">
        <form
          onSubmit={(e) => { e.preventDefault(); load() }}
          className="flex flex-col md:flex-row gap-3"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Rechercher nom, BRN, industrie..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={statut} onValueChange={setStatut}>
            <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="Statut" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              {STATUS_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes sources</SelectItem>
              {SOURCE_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
            </SelectContent>
          </Select>
          <Button type="submit" style={{ backgroundColor: NAVY, color: "#fff" }}>Filtrer</Button>
        </form>
      </Card>

      <Card style={panelStyle} className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Aucun prospect"
            description="Commencez par ajouter un prospect manuellement ou importez via un connecteur."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Industrie</TableHead>
                <TableHead>Effectif</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Contacts</TableHead>
                <TableHead>MAJ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id} className="hover:bg-gray-50">
                  <TableCell>
                    <Link href={`/crm/prospects/${c.id}`} className="font-medium hover:underline" style={{ color: NAVY }}>
                      {c.nom}
                    </Link>
                    {c.ville && <div className="text-xs text-muted-foreground">{c.ville}</div>}
                  </TableCell>
                  <TableCell className="text-sm">{c.industrie || "-"}</TableCell>
                  <TableCell className="text-sm">{c.taille_effectif || "-"}</TableCell>
                  <TableCell><StatusBadge status={c.statut} /></TableCell>
                  <TableCell className="text-sm font-semibold">{c.score ?? "-"}</TableCell>
                  <TableCell><SourceBadge source={c.source} /></TableCell>
                  <TableCell className="text-sm">{counts[c.id] || 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(c.updated_at).toLocaleDateString("fr-FR")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
