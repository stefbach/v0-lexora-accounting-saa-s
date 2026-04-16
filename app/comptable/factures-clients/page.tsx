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
import { ClientPageShell } from "@/components/layout/ClientPageShell"

interface Facture {
  id: string
  numero_facture: string | null
  tiers: string | null
  description: string | null
  date_facture: string
  date_echeance: string | null
  devise: string
  montant_ht: number
  montant_tva: number
  montant_ttc: number
  montant_mur: number
  statut: string
  societe_id: string
}

interface Societe { id: string; nom: string }

const STATUT_COLORS: Record<string, string> = {
  en_attente: "bg-yellow-100 text-yellow-800",
  paye: "bg-green-100 text-green-800",
  retard: "bg-red-100 text-red-800",
  partiel: "bg-blue-100 text-blue-800",
  annule: "bg-gray-100 text-gray-600",
}

function fmt(n: number, devise = "MUR") {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: devise, maximumFractionDigits: 0 }).format(n)
}

export default function FacturesClientsPage() {
  const [factures, setFactures] = useState<Facture[]>([])
  const [societes, setSocietes] = useState<Societe[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterSociete, setFilterSociete] = useState("all")
  const [filterStatut, setFilterStatut] = useState("all")
  const [totaux, setTotaux] = useState({ total_mur: 0, nb_factures: 0, nb_en_attente: 0, nb_retard: 0 })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form
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
      const params = new URLSearchParams({ type: "client", limit: "200" })
      if (filterSociete !== "all") params.set("societe_id", filterSociete)
      if (filterStatut !== "all") params.set("statut", filterStatut)
      const [facRes, socRes] = await Promise.all([
        fetch(`/api/comptable/factures?${params}`),
        fetch("/api/comptable/societes"),
      ])
      const facData = await facRes.json()
      const socData = await socRes.json()
      setFactures(facData.factures || [])
      setTotaux(facData.totaux || {})
      setSocietes(socData.societes || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filterSociete, filterStatut])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = factures.filter(f =>
    (f.tiers || "").toLowerCase().includes(search.toLowerCase()) ||
    (f.numero_facture || "").toLowerCase().includes(search.toLowerCase()) ||
    (f.description || "").toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = async () => {
    if (!formSociete || !formDate || !formTiers) { setError("Société, tiers et date requis"); return }
    setSaving(true); setError(null)
    try {
      const ht = parseFloat(formHT) || 0
      const tva = parseFloat(formTVA) || 0
      const res = await fetch("/api/comptable/factures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: formSociete, type_facture: "client",
          numero_facture: formNumero, tiers: formTiers,
          description: formDesc, date_facture: formDate,
          date_echeance: formEcheance || null,
          devise: formDevise, montant_ht: ht, montant_tva: tva,
          montant_ttc: ht + tva,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setDialogOpen(false)
      setFormTiers(""); setFormNumero(""); setFormDate(""); setFormEcheance("")
      setFormHT(""); setFormTVA(""); setFormDesc("")
      fetchData()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur")
    } finally { setSaving(false) }
  }

  const updateStatut = async (id: string, statut: string) => {
    await fetch(`/api/comptable/factures/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statut }),
    })
    fetchData()
  }

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]">Factures Clients</h1>
          <p className="text-sm text-gray-500 mt-1">Gestion des créances clients (AR)</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#0B0F2E] text-white hover:bg-[#2a3a5a]">
              <Plus className="w-4 h-4 mr-2" /> Nouvelle facture
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nouvelle facture client</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Société *</Label>
                  <Select value={formSociete} onValueChange={setFormSociete}>
                    <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>N° Facture</Label>
                  <Input value={formNumero} onChange={e => setFormNumero(e.target.value)} placeholder="INV-001" />
                </div>
              </div>
              <div>
                <Label>Tiers / Client *</Label>
                <Input value={formTiers} onChange={e => setFormTiers(e.target.value)} placeholder="Nom du client" />
              </div>
              <div>
                <Label>Description</Label>
                <Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Objet de la facture" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date facture *</Label>
                  <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
                </div>
                <div>
                  <Label>Échéance</Label>
                  <Input type="date" value={formEcheance} onChange={e => setFormEcheance(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Devise</Label>
                  <Select value={formDevise} onValueChange={setFormDevise}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["MUR","EUR","USD","GBP","AUD"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Montant HT</Label>
                  <Input type="number" value={formHT} onChange={e => setFormHT(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label>TVA</Label>
                  <Input type="number" value={formTVA} onChange={e => setFormTVA(e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button onClick={handleCreate} disabled={saving} className="bg-[#0B0F2E] text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Créer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total AR", value: fmt(totaux.total_mur), icon: FileText, color: "text-blue-600" },
          { label: "Factures", value: totaux.nb_factures, icon: TrendingUp, color: "text-green-600" },
          { label: "En attente", value: totaux.nb_en_attente, icon: Clock, color: "text-yellow-600" },
          { label: "En retard", value: totaux.nb_retard, icon: AlertCircle, color: "text-red-600" },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <k.icon className={`w-8 h-8 ${k.color}`} />
              <div>
                <p className="text-xs text-gray-500">{k.label}</p>
                <p className="text-xl font-bold text-[#0B0F2E]">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input className="pl-9" placeholder="Rechercher tiers, numéro..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={filterSociete} onValueChange={setFilterSociete}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Toutes les sociétés" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les sociétés</SelectItem>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatut} onValueChange={setFilterStatut}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Tous statuts" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="en_attente">En attente</SelectItem>
                <SelectItem value="paye">Payé</SelectItem>
                <SelectItem value="retard">En retard</SelectItem>
                <SelectItem value="partiel">Partiel</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tableau */}
      <Card>
        <CardHeader><CardTitle className="text-[#0B0F2E]">Factures ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#0B0F2E]" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500">Aucune facture trouvée</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Tiers</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">HT</TableHead>
                  <TableHead className="text-right">TVA</TableHead>
                  <TableHead className="text-right">TTC</TableHead>
                  <TableHead>Devise</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(f => (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono text-xs">{f.numero_facture || "—"}</TableCell>
                    <TableCell className="font-medium">{f.tiers || "—"}</TableCell>
                    <TableCell className="text-sm text-gray-600 max-w-48 truncate">{f.description || "—"}</TableCell>
                    <TableCell className="text-sm">{f.date_facture ? new Date(f.date_facture).toLocaleDateString("fr-FR") : "—"}</TableCell>
                    <TableCell className="text-right text-sm">{fmt(f.montant_ht, f.devise)}</TableCell>
                    <TableCell className="text-right text-sm">{f.montant_tva > 0 ? <span className="text-orange-600">{fmt(f.montant_tva, f.devise)}</span> : <span className="text-gray-400">0</span>}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(f.montant_ttc, f.devise)}</TableCell>
                    <TableCell><Badge variant="outline">{f.devise}</Badge></TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUT_COLORS[f.statut] || ""}`}>
                        {f.statut.replace("_", " ")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Select value={f.statut} onValueChange={v => updateStatut(f.id, v)}>
                        <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en_attente">En attente</SelectItem>
                          <SelectItem value="paye">Payé</SelectItem>
                          <SelectItem value="partiel">Partiel</SelectItem>
                          <SelectItem value="retard">Retard</SelectItem>
                          <SelectItem value="annule">Annulé</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
    </ClientPageShell>
  )
}
