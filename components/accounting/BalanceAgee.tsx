"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Download, RefreshCw, ChevronDown, ChevronRight } from "lucide-react"

type Bucket = 'current' | 'b_0_30' | 'b_31_60' | 'b_61_90' | 'b_90_plus'

interface FactureRow {
  id: string
  numero_facture: string | null
  date_facture: string | null
  date_echeance: string | null
  amount_open: number
  days_overdue: number
  bucket: Bucket
  devise: string | null
  statut: string
}

interface TiersAgg {
  tiers: string
  count: number
  total: number
  current: number
  b_0_30: number
  b_31_60: number
  b_61_90: number
  b_90_plus: number
  factures: FactureRow[]
}

interface AgedResponse {
  as_of: string
  type: 'client' | 'fournisseur'
  reference: 'facture' | 'echeance'
  totals: {
    count: number
    total: number
    current: number
    b_0_30: number
    b_31_60: number
    b_61_90: number
    b_90_plus: number
  }
  tiers: TiersAgg[]
}

function fmt(n: number): string {
  return (n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString("fr-FR") : "—"
}

const BUCKET_LABEL: Record<Bucket, string> = {
  current: "Non échu",
  b_0_30: "0–30 j",
  b_31_60: "31–60 j",
  b_61_90: "61–90 j",
  b_90_plus: "> 90 j",
}

const BUCKET_COLOR: Record<Bucket, string> = {
  current: "bg-slate-100 text-slate-800",
  b_0_30: "bg-yellow-100 text-yellow-900",
  b_31_60: "bg-orange-100 text-orange-900",
  b_61_90: "bg-red-100 text-red-900",
  b_90_plus: "bg-red-200 text-red-900",
}

export interface BalanceAgeeProps {
  societeId: string | null
  type: 'client' | 'fournisseur'
}

export function BalanceAgee({ societeId, type }: BalanceAgeeProps) {
  const today = new Date().toISOString().slice(0, 10)
  const [asOf, setAsOf] = useState(today)
  const [reference, setReference] = useState<'echeance' | 'facture'>('echeance')
  const [data, setData] = useState<AgedResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const fetchData = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ societe_id: societeId, type, as_of: asOf, reference })
      const res = await fetch(`/api/comptable/balance-aged?${params.toString()}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || `HTTP ${res.status}`)
      }
      const j: AgedResponse = await res.json()
      setData(j)
    } catch (e: any) {
      console.error('[BalanceAgee] fetch failed:', e?.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [societeId, type, asOf, reference])

  useEffect(() => { fetchData() }, [fetchData])

  const csvRows = useMemo(() => {
    if (!data) return ""
    const header = ["Tiers", "Nb", "Non échu", "0-30", "31-60", "61-90", "> 90", "Total"]
    const lines = [header.join("\t")]
    for (const t of data.tiers) {
      lines.push([t.tiers, t.count, t.current, t.b_0_30, t.b_31_60, t.b_61_90, t.b_90_plus, t.total]
        .map(v => typeof v === 'number' ? fmt(v) : v).join("\t"))
    }
    lines.push(["TOTAL", data.totals.count, data.totals.current, data.totals.b_0_30, data.totals.b_31_60, data.totals.b_61_90, data.totals.b_90_plus, data.totals.total]
      .map(v => typeof v === 'number' ? fmt(v) : v).join("\t"))
    return lines.join("\n")
  }, [data])

  function downloadCsv() {
    const blob = new Blob([csvRows], { type: "text/tab-separated-values;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `balance-agee-${type}-${asOf}.tsv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const labelTiers = type === 'client' ? 'Client' : 'Fournisseur'
  const compteRef = type === 'client' ? '411' : '401'

  if (!societeId) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Sélectionnez une société.</CardContent></Card>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Balance âgée — {type === 'client' ? 'Créances clients' : 'Dettes fournisseurs'}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Arrêtée au</Label>
            <Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label>Date de référence</Label>
            <select
              value={reference}
              onChange={e => setReference(e.target.value as 'echeance' | 'facture')}
              className="h-10 w-44 border rounded px-2 text-sm"
            >
              <option value="echeance">Date d'échéance</option>
              <option value="facture">Date de facture</option>
            </select>
          </div>
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Actualiser
          </Button>
          <Button variant="outline" onClick={downloadCsv} disabled={!data}>
            <Download className="w-4 h-4 mr-1" /> Exporter TSV
          </Button>
        </CardContent>
      </Card>

      {data && (
        <>
          <div className="grid grid-cols-6 gap-3">
            {(['current', 'b_0_30', 'b_31_60', 'b_61_90', 'b_90_plus'] as Bucket[]).map(b => (
              <Card key={b}>
                <CardContent className="p-4">
                  <div className={`text-xs px-2 py-1 rounded inline-block ${BUCKET_COLOR[b]}`}>{BUCKET_LABEL[b]}</div>
                  <div className="text-lg font-semibold mt-2">{fmt(data.totals[b])} MUR</div>
                </CardContent>
              </Card>
            ))}
            <Card>
              <CardContent className="p-4">
                <div className="text-xs px-2 py-1 rounded inline-block bg-blue-100 text-blue-900">Total compte {compteRef}</div>
                <div className="text-lg font-semibold mt-2">{fmt(data.totals.total)} MUR</div>
                <div className="text-xs text-muted-foreground mt-1">{data.totals.count} facture(s) ouverte(s)</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Détail par {labelTiers.toLowerCase()}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>{labelTiers}</TableHead>
                    <TableHead className="text-right">Nb</TableHead>
                    <TableHead className="text-right">Non échu</TableHead>
                    <TableHead className="text-right">0–30 j</TableHead>
                    <TableHead className="text-right">31–60 j</TableHead>
                    <TableHead className="text-right">61–90 j</TableHead>
                    <TableHead className="text-right">&gt; 90 j</TableHead>
                    <TableHead className="text-right font-bold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.tiers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                        Aucune facture ouverte à cette date.
                      </TableCell>
                    </TableRow>
                  )}
                  {data.tiers.map(t => (
                    <>
                      <TableRow key={t.tiers} className="cursor-pointer hover:bg-slate-50" onClick={() => setExpanded(p => ({ ...p, [t.tiers]: !p[t.tiers] }))}>
                        <TableCell>{expanded[t.tiers] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</TableCell>
                        <TableCell className="font-medium">{t.tiers}</TableCell>
                        <TableCell className="text-right">{t.count}</TableCell>
                        <TableCell className="text-right">{fmt(t.current)}</TableCell>
                        <TableCell className="text-right">{fmt(t.b_0_30)}</TableCell>
                        <TableCell className="text-right">{fmt(t.b_31_60)}</TableCell>
                        <TableCell className="text-right">{fmt(t.b_61_90)}</TableCell>
                        <TableCell className="text-right text-red-700 font-medium">{fmt(t.b_90_plus)}</TableCell>
                        <TableCell className="text-right font-bold">{fmt(t.total)}</TableCell>
                      </TableRow>
                      {expanded[t.tiers] && t.factures.map(f => (
                        <TableRow key={f.id} className="bg-slate-50/50">
                          <TableCell></TableCell>
                          <TableCell className="pl-6 text-xs">
                            <span className="text-muted-foreground">{f.numero_facture || '—'}</span>
                            <span className="ml-2 text-muted-foreground">Émise {fmtDate(f.date_facture)}</span>
                            <span className="ml-2 text-muted-foreground">Échéance {fmtDate(f.date_echeance)}</span>
                          </TableCell>
                          <TableCell colSpan={6} className="text-xs">
                            <Badge className={BUCKET_COLOR[f.bucket]}>{BUCKET_LABEL[f.bucket]}</Badge>
                            {f.days_overdue > 0 && <span className="ml-2 text-red-700">{f.days_overdue} j de retard</span>}
                            <span className="ml-2">{f.statut}</span>
                            {f.devise && f.devise !== 'MUR' && <Badge variant="outline" className="ml-2">{f.devise}</Badge>}
                          </TableCell>
                          <TableCell className="text-right">{fmt(f.amount_open)}</TableCell>
                        </TableRow>
                      ))}
                    </>
                  ))}
                  {data.tiers.length > 0 && (
                    <TableRow className="font-bold bg-slate-100">
                      <TableCell></TableCell>
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-right">{data.totals.count}</TableCell>
                      <TableCell className="text-right">{fmt(data.totals.current)}</TableCell>
                      <TableCell className="text-right">{fmt(data.totals.b_0_30)}</TableCell>
                      <TableCell className="text-right">{fmt(data.totals.b_31_60)}</TableCell>
                      <TableCell className="text-right">{fmt(data.totals.b_61_90)}</TableCell>
                      <TableCell className="text-right">{fmt(data.totals.b_90_plus)}</TableCell>
                      <TableCell className="text-right">{fmt(data.totals.total)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
