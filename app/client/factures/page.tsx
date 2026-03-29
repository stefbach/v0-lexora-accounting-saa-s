"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Plus, Loader2, FileText, TrendingUp, Clock, AlertCircle } from "lucide-react"

interface Facture {
  id: string; numero_facture: string | null; tiers: string | null; description: string | null
  date_facture: string; date_echeance: string | null; devise: string
  montant_ht: number; montant_tva: number; montant_ttc: number; montant_mur: number
  statut: string; societe_id: string; type_facture: string; notes: string | null
}
interface Societe { id: string; nom: string }

const STATUT_COLORS: Record<string, string> = {
  en_attente: "bg-yellow-100 text-yellow-800", paye: "bg-green-100 text-green-800",
  retard: "bg-red-100 text-red-800", partiel: "bg-blue-100 text-blue-800",
  annule: "bg-gray-100 text-gray-600",
}

function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export default function ClientFacturesPage() {
  const [factures, setFactures] = useState<Facture[]>([])
  const [societes, setSocietes] = useState<Societe[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterStatut, setFilterStatut] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formSociete, setFormSociete] = useState("")
  const [formTiers, setFormTiers] = useState("")
  const [formNumero, setFormNumero] = useState("")
  const [formDate, setFormDate] = useState("")
  const [formEcheance, setFormEcheance] = useState("")
  const [formDevise, setFormDevise] = useState("EUR")
  const [formHT, setFormHT] = useState("")
  const [formTVA, setFormTVA] = useState("")
  const [formDesc, setFormDesc] = useState("")

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [socRes, facRes] = await Promise.all([
        fetch("/api/client/societes"),
        fetch("/api/client/financial"),
      ])
      const socData = await socRes.json()
      const finData = await facRes.json()
      setSocietes(socData.societes || [])
      if (socData.societes?.length === 1) setFormSociete(socData.societes[0].id)
      const allFactures = finData.financial?.factures || []
      setFactures(allFactures.filter((f: Facture) => f.type_facture === 'client'))
    } catch { }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = factures.filter(f => {
    const matchSearch = !search ||
      (f.tiers || "").toLowerCase().includes(search.toLowerCase()) ||
      (f.numero_facture || "").toLowerCase().includes(search.toLowerCase())
    const matchStatut = filterStatut === "all" || f.statut === filterStatut
    return matchSearch && matchStatut
  })

  const totalMUR = filtered.reduce((s, f) => s + (Number(f.montant_mur) || 0), 0)
  const nbEnAttente = filtered.filter(f => f.statut === 'en_attente').length
  const nbRetard = filtered.filter(f => f.statut === 'retard').length

  const handleCreate = async () => {
    if (!formSociete || !formDate || !formTiers) { setError("Societe, tiers et date requis"); return }
    setSaving(true); setError(null)
    try {
      const ht = parseFloat(formHT) || 0
      const tva = parseFloat(formTVA) || 0
      const res = await fetch("/api/comptable/factures", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: formSociete, type_facture: "client",
          numero_facture: formNumero, tiers: formTiers, description: formDesc,
          date_facture: formDate, date_echeance: formEcheance || null,
          devise: formDevise, montant_ht: ht, montant_tva: tva, montant_ttc: ht + tva,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setDialogOpen(false); fetchData()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur") }
    finally { setSaving(false) }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Factures Clients</h1>
          <p className="text-sm text-gray-500">Gestion des creances clients</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#1E2A4A]"><Plus className="w-4 h-4 mr-2" />Nouvelle facture</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nouvelle facture client</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Societe *</Label><Select value={formSociete} onValueChange={setFormSociete}><SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger><SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>N° Facture</Label><Input value={formNumero} onChange={e => setFormNumero(e.target.value)} placeholder="INV-001" /></div>
              </div>
              <div><Label>Client *</Label><Input value={formTiers} onChange={e => setFormTiers(e.target.value)} placeholder="Nom du client" /></div>
              <div><Label>Description</Label><Input value={formDesc} onChange={e => setFormDesc(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Date *</Label><Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} /></div>
                <div><Label>Echeance</Label><Input type="date" value={formEcheance} onChange={e => setFormEcheance(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Devise</Label><Select value={formDevise} onValueChange={setFormDevise}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["MUR","EUR","USD","GBP"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Montant HT</Label><Input type="number" value={formHT} onChange={e => setFormHT(e.target.value)} /></div>
                <div><Label>TVA</Label><Input type="number" value={formTVA} onChange={e => setFormTVA(e.target.value)} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button onClick={handleCreate} disabled={saving} className="bg-[#1E2A4A]">{saving ? "Creation..." : "Creer"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3"><FileText className="w-8 h-8 text-blue-600" /><div><p className="text-xs text-gray-500">Total CA (MUR)</p><p className="text-xl font-bold text-[#1E2A4A]">{fmt(totalMUR)}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><TrendingUp className="w-8 h-8 text-green-600" /><div><p className="text-xs text-gray-500">Factures</p><p className="text-xl font-bold text-[#1E2A4A]">{filtered.length}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><Clock className="w-8 h-8 text-yellow-600" /><div><p className="text-xs text-gray-500">En attente</p><p className="text-xl font-bold text-[#1E2A4A]">{nbEnAttente}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><AlertCircle className="w-8 h-8 text-red-600" /><div><p className="text-xs text-gray-500">En retard</p><p className="text-xl font-bold text-[#1E2A4A]">{nbRetard}</p></div></CardContent></Card>
      </div>

      {/* Filtres */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input className="pl-9" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatut} onValueChange={setFilterStatut}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="en_attente">En attente</SelectItem>
            <SelectItem value="paye">Paye</SelectItem>
            <SelectItem value="retard">En retard</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tableau */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#1E2A4A]" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500">Aucune facture client. Uploadez vos factures dans Documents.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead><TableHead>Client</TableHead><TableHead>Date</TableHead>
                  <TableHead className="text-right">HT</TableHead><TableHead className="text-right">TVA</TableHead>
                  <TableHead className="text-right">TTC</TableHead><TableHead>Devise</TableHead>
                  <TableHead className="text-right">MUR</TableHead><TableHead>Statut</TableHead><TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(f => (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono text-xs">{f.numero_facture || "—"}</TableCell>
                    <TableCell className="font-medium">{f.tiers || "—"}</TableCell>
                    <TableCell className="text-sm">{f.date_facture ? new Date(f.date_facture).toLocaleDateString("fr-FR") : "—"}</TableCell>
                    <TableCell className="text-right text-sm">{fmt(f.montant_ht)}</TableCell>
                    <TableCell className="text-right text-sm">{f.montant_tva > 0 ? <span className="text-orange-600">{fmt(f.montant_tva)}</span> : <span className="text-gray-400">0</span>}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(f.montant_ttc)}</TableCell>
                    <TableCell><Badge variant="outline">{f.devise}</Badge></TableCell>
                    <TableCell className="text-right font-bold text-[#1E2A4A]">{fmt(Number(f.montant_mur) || 0)}</TableCell>
                    <TableCell><span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUT_COLORS[f.statut] || ""}`}>{f.statut.replace("_", " ")}</span></TableCell>
                    <TableCell className="text-xs text-gray-500 max-w-[120px] truncate">{f.notes || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
