"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Download } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

const NAVY = "#0B0F2E"

const panelStyle: React.CSSProperties = {
  border: "1px solid #D8DFED",
  borderRadius: 18,
  background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16)",
}

const CONNECTORS = [
  { value: "apollo", label: "Apollo.io — Base B2B internationale" },
]

export default function ImportPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [connector, setConnector] = useState("apollo")
  const [query, setQuery] = useState("")
  const [industrie, setIndustrie] = useState("")
  const [region, setRegion] = useState("")
  const [limit, setLimit] = useState(20)
  const [dryRun, setDryRun] = useState(true)
  const [result, setResult] = useState<any>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    try {
      const payload: Record<string, unknown> = { connector, limit, dry_run: dryRun }
      if (query.trim()) payload.query = query
      if (industrie.trim()) payload.industrie = industrie
      if (region.trim()) payload.region = region
      const res = await fetch("/api/crm/internal/connectors-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Erreur recherche")
      setResult(json)
      toast({ title: dryRun ? "Recherche terminee (dry run)" : "Ingestion terminee" })
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2" style={{ color: NAVY }}>
          <Download className="h-7 w-7" /> Importer prospects
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Recherche via un connecteur externe (CBRD, YellowPages, Apollo)</p>
      </div>

      <Card style={panelStyle}>
        <CardHeader><CardTitle className="text-base">Parametres de recherche</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="connector">Connecteur</Label>
              <Select value={connector} onValueChange={setConnector}>
                <SelectTrigger id="connector" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONNECTORS.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="query">Mots-cles</Label>
              <Input id="query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ex: hotel, restaurant, IT services" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="industrie">Industrie</Label>
                <Input id="industrie" value={industrie} onChange={(e) => setIndustrie(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="region">Region</Label>
                <Input id="region" value={region} onChange={(e) => setRegion(e.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="limit">Limite (max 50)</Label>
              <Input
                id="limit"
                type="number"
                min={1}
                max={50}
                value={limit}
                onChange={(e) => setLimit(Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 1)))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="dry_run" checked={dryRun} onCheckedChange={(v) => setDryRun(Boolean(v))} />
              <Label htmlFor="dry_run" className="cursor-pointer text-sm">Dry run (ne pas inserer en base)</Label>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={loading} style={{ backgroundColor: "#D4AF37", color: "#0B0F2E" }}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Lancer la recherche
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card style={panelStyle}>
          <CardHeader><CardTitle className="text-base">Resultats</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Total trouves" value={result.total ?? result?.data?.length ?? 0} />
              <Stat label="Crees" value={result.created ?? 0} />
              <Stat label="MAJ" value={result.updated ?? 0} />
              <Stat label="Erreurs" value={result.errors ?? 0} />
            </div>
            {result?.errors_detail && Array.isArray(result.errors_detail) && result.errors_detail.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold text-red-700 mb-1">Details erreurs</div>
                <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
                  {result.errors_detail.slice(0, 10).map((e: any, i: number) => (<li key={i}>{typeof e === "string" ? e : JSON.stringify(e)}</li>))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ color: NAVY }}>{value}</div>
    </div>
  )
}
