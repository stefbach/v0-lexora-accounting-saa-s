"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Download } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

const CONNECTORS = [
  { value: "apollo", label: "Apollo (international)" },
] as const

interface Props {
  onSuccess?: () => void
  trigger?: React.ReactNode
}

export function ConnectorSearchDialog({ onSuccess, trigger }: Props) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [connector, setConnector] = useState<string>("apollo")
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
      if (!dryRun) onSuccess?.()
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || String(err), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline">
            <Download className="h-4 w-4 mr-1" /> Importer via connecteur
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Importer via connecteur</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
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
          <div className="grid grid-cols-2 gap-3">
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
            <Input id="limit" type="number" min={1} max={50} value={limit} onChange={(e) => setLimit(Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 1)))} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="dry_run" checked={dryRun} onCheckedChange={(v) => setDryRun(Boolean(v))} />
            <Label htmlFor="dry_run" className="cursor-pointer text-sm">Dry run (ne pas inserer en base)</Label>
          </div>

          {result && (
            <div className="rounded-md border bg-gray-50 p-3 text-xs space-y-1">
              <div className="font-semibold">Resultats</div>
              <div>Total trouves : {result.total ?? result?.data?.length ?? "?"}</div>
              {result.created != null && <div>Crees : {result.created}</div>}
              {result.updated != null && <div>MAJ : {result.updated}</div>}
              {result.errors != null && <div>Erreurs : {result.errors}</div>}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Fermer</Button>
            <Button type="submit" disabled={loading} style={{ backgroundColor: "#D4AF37", color: "#0B0F2E" }}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Lancer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
