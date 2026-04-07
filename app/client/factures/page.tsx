"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Search, Plus, Loader2, FileText, TrendingUp, Clock, AlertCircle,
  Eye, Trash2, RefreshCw, CalendarDays, Settings, Pencil, CheckCircle2,
  Shield, ShieldCheck, X
} from "lucide-react"

interface Facture {
  id: string; numero_facture: string | null; tiers: string | null; description: string | null
  date_facture: string; date_echeance: string | null; devise: string
  montant_ht: number; montant_tva: number; montant_ttc: number; montant_mur: number
  statut: string; societe_id: string; type_facture: string; notes: string | null
  mode_paiement: string | null; paye_par: string | null
  lignes: unknown[] | null; client_offshore: boolean
  recurrent: boolean; recurrent_frequence: string | null
  irn?: string | null; mra_status?: string | null; type_document?: string | null
  document_id?: string | null
}
interface Societe { id: string; nom: string }
interface RecurringTemplate {
  id: string; client_nom: string; client_id: string; services: { description: string; prix: number }[]
  frequence: string; montant: number; devise: string; prochaine_date: string; active: boolean
}
interface InvoiceClient {
  id: string; nom: string; entreprise: string; offshore: boolean; devise: string; conditions_paiement: number
}

const STATUT_COLORS: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-600",
  en_attente: "bg-yellow-100 text-yellow-800",
  paye: "bg-green-100 text-green-800",
  retard: "bg-red-100 text-red-800",
  partiel: "bg-blue-100 text-blue-800",
  annule: "bg-gray-100 text-gray-600",
}

function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function today() { return new Date().toISOString().split("T")[0] }
function addDays(d: string, days: number) {
  const dt = new Date(d)
  dt.setDate(dt.getDate() + days)
  return dt.toISOString().split("T")[0]
}

export default function ClientFacturesPage() {
  const router = useRouter()
  const [factures, setFactures] = useState<Facture[]>([])
  const [societes, setSocietes] = useState<Societe[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterStatut, setFilterStatut] = useState("all")
  const [selectedSociete, setSelectedSociete] = useState("")
  const [activeTab, setActiveTab] = useState("factures")

  // Recurring templates
  const [recurring, setRecurring] = useState<RecurringTemplate[]>([])
  const [recurringDialog, setRecurringDialog] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generatedPreview, setGeneratedPreview] = useState<RecurringTemplate[]>([])
  const [clients, setClients] = useState<InvoiceClient[]>([])

  // Recurring form
  const [rClientId, setRClientId] = useState("")
  const [rFrequence, setRFrequence] = useState("mensuel")
  const [rServices, setRServices] = useState("")
  const [rMontant, setRMontant] = useState("")
  const [rDevise, setRDevise] = useState("MUR")
  const [rProchaineDate, setRProchaineDate] = useState("")

  // Detail dialog
  const [detailFacture, setDetailFacture] = useState<Facture | null>(null)

  // MRA fiscalisation
  const [fiscalisingId, setFiscalisingId] = useState<string | null>(null)

  const handleFiscalise = async (f: Facture) => {
    if (fiscalisingId) return
    setFiscalisingId(f.id)
    try {
      const res = await fetch("/api/mra/fiscalise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ facture_id: f.id, societe_id: f.societe_id }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        // Update the facture in local state
        setFactures(prev =>
          prev.map(fac =>
            fac.id === f.id
              ? { ...fac, irn: data.irn, mra_status: "fiscalise" }
              : fac
          )
        )
      } else {
        alert(data.error || "Erreur de fiscalisation MRA")
      }
    } catch {
      alert("Erreur de connexion au serveur MRA")
    } finally {
      setFiscalisingId(null)
    }
  }

  const fetchData = useCallback(async (societeId?: string) => {
    setLoading(true)
    try {
      const finUrl = societeId && societeId !== "all"
        ? `/api/client/financial?societe_id=${societeId}`
        : "/api/client/financial"
      const [socRes, facRes] = await Promise.all([
        fetch("/api/client/societes"),
        fetch(finUrl),
      ])
      const socData = await socRes.json()
      const finData = await facRes.json()
      const socs = socData.societes || []
      setSocietes(socs)
      if (socs.length > 0 && !selectedSociete) setSelectedSociete(socs[0].id)
      const allFactures = finData.financial?.factures || []
      setFactures(allFactures.filter((f: Facture) => f.type_facture === 'client'))
    } catch { }
    finally { setLoading(false) }

    // Load recurring templates from localStorage
    try {
      const r = localStorage.getItem("lexora_recurring_invoices")
      if (r) setRecurring(JSON.parse(r))
      const c = localStorage.getItem("lexora_invoice_clients")
      if (c) setClients(JSON.parse(c))
    } catch { }
  }, [selectedSociete])

  useEffect(() => { fetchData(selectedSociete) }, [selectedSociete])

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

  const handlePreview = (f: Facture) => {
    if (f.document_id) {
      // Open the original PDF document
      window.open(`/api/documents/${f.document_id}/download`, "_blank")
    } else {
      // Show detail dialog
      setDetailFacture(f)
    }
  }

  const handleDelete = async (f: Facture) => {
    if (f.statut !== "brouillon") return
    if (!confirm("Supprimer cette facture brouillon ?")) return
    try {
      const res = await fetch(`/api/client/factures?id=${f.id}`, { method: "DELETE" })
      if (res.ok) fetchData()
    } catch { }
  }

  // ── Recurring ──
  const saveRecurring = () => {
    const client = clients.find(c => c.id === rClientId)
    const template: RecurringTemplate = {
      id: crypto.randomUUID(),
      client_nom: client?.nom || "Client",
      client_id: rClientId,
      services: rServices.split("\n").filter(Boolean).map(s => ({ description: s, prix: parseFloat(rMontant) || 0 })),
      frequence: rFrequence,
      montant: parseFloat(rMontant) || 0,
      devise: rDevise,
      prochaine_date: rProchaineDate || today(),
      active: true,
    }
    const updated = [...recurring, template]
    setRecurring(updated)
    localStorage.setItem("lexora_recurring_invoices", JSON.stringify(updated))
    setRecurringDialog(false)
    setRClientId(""); setRServices(""); setRMontant(""); setRProchaineDate("")
  }

  const deleteRecurring = (id: string) => {
    const updated = recurring.filter(r => r.id !== id)
    setRecurring(updated)
    localStorage.setItem("lexora_recurring_invoices", JSON.stringify(updated))
  }

  const toggleRecurring = (id: string) => {
    const updated = recurring.map(r => r.id === id ? { ...r, active: !r.active } : r)
    setRecurring(updated)
    localStorage.setItem("lexora_recurring_invoices", JSON.stringify(updated))
  }

  const generateMonthlyInvoices = async () => {
    const active = recurring.filter(r => r.active && r.prochaine_date <= today())
    if (active.length === 0) { setGeneratedPreview([]); return }
    setGeneratedPreview(active)
  }

  const confirmGeneration = async () => {
    if (generatedPreview.length === 0) return
    setGenerating(true)
    const settings = JSON.parse(localStorage.getItem("lexora_invoice_settings") || "{}")
    const societeId = societes[0]?.id
    if (!societeId) { setGenerating(false); return }

    let nextNum = settings.prochain_numero || 1
    for (const tmpl of generatedPreview) {
      const client = clients.find(c => c.id === tmpl.client_id)
      const offshore = client?.offshore || false
      const tva = offshore ? 0 : tmpl.montant * 0.15
      const lignes = tmpl.services.map(s => ({
        id: crypto.randomUUID(), description: s.description, quantite: 1,
        prix_unitaire: s.prix, taux_tva: offshore ? 0 : 15,
        total: s.prix * (1 + (offshore ? 0 : 0.15)),
      }))

      try {
        await fetch("/api/client/factures", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            societe_id: societeId,
            numero_facture: `${settings.prefixe_facture || "INV-"}${String(nextNum).padStart(3, "0")}`,
            tiers: tmpl.client_nom,
            date_facture: today(),
            date_echeance: addDays(today(), client?.conditions_paiement || 30),
            devise: tmpl.devise,
            montant_ht: tmpl.montant, montant_tva: tva, montant_ttc: tmpl.montant + tva,
            statut: "en_attente", lignes, client_offshore: offshore,
            recurrent: true, recurrent_frequence: tmpl.frequence,
          }),
        })
        nextNum++
      } catch { }

      // Advance next date
      const dt = new Date(tmpl.prochaine_date)
      if (tmpl.frequence === "mensuel") dt.setMonth(dt.getMonth() + 1)
      else if (tmpl.frequence === "trimestriel") dt.setMonth(dt.getMonth() + 3)
      tmpl.prochaine_date = dt.toISOString().split("T")[0]
    }

    // Update settings and recurring
    settings.prochain_numero = nextNum
    localStorage.setItem("lexora_invoice_settings", JSON.stringify(settings))
    const updatedRecurring = recurring.map(r => {
      const gen = generatedPreview.find(g => g.id === r.id)
      return gen ? { ...r, prochaine_date: gen.prochaine_date } : r
    })
    setRecurring(updatedRecurring)
    localStorage.setItem("lexora_recurring_invoices", JSON.stringify(updatedRecurring))

    setGenerating(false)
    setGeneratedPreview([])
    fetchData()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Factures Clients</h1>
          <p className="text-sm text-gray-500">Gestion des creances clients - Conforme MRA</p>
        </div>
        <div className="flex gap-2 items-center">
          {societes.length > 0 && (
            <Select value={selectedSociete} onValueChange={setSelectedSociete}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Société" /></SelectTrigger>
              <SelectContent>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                {societes.length > 1 && <SelectItem value="all">Toutes les sociétés</SelectItem>}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={() => router.push("/client/facturation-settings")}><Settings className="w-4 h-4 mr-2" />Parametres</Button>
          <Button className="bg-[#1E2A4A]" onClick={() => router.push("/client/nouvelle-facture")}><Plus className="w-4 h-4 mr-2" />Nouvelle facture</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3"><FileText className="w-8 h-8 text-blue-600" /><div><p className="text-xs text-gray-500">Total CA (MUR)</p><p className="text-xl font-bold text-[#1E2A4A]">{fmt(totalMUR)}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><TrendingUp className="w-8 h-8 text-green-600" /><div><p className="text-xs text-gray-500">Factures</p><p className="text-xl font-bold text-[#1E2A4A]">{filtered.length}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><Clock className="w-8 h-8 text-yellow-600" /><div><p className="text-xs text-gray-500">En attente</p><p className="text-xl font-bold text-[#1E2A4A]">{nbEnAttente}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><AlertCircle className="w-8 h-8 text-red-600" /><div><p className="text-xs text-gray-500">En retard</p><p className="text-xl font-bold text-[#1E2A4A]">{nbRetard}</p></div></CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="factures" className="flex items-center gap-1.5"><FileText className="w-4 h-4" />Factures</TabsTrigger>
          <TabsTrigger value="recurrent" className="flex items-center gap-1.5"><RefreshCw className="w-4 h-4" />Facturation recurrente</TabsTrigger>
        </TabsList>

        {/* ══════════ TAB: Factures ══════════ */}
        <TabsContent value="factures" className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input className="pl-9" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={filterStatut} onValueChange={setFilterStatut}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="brouillon">Brouillon</SelectItem>
                <SelectItem value="en_attente">En attente</SelectItem>
                <SelectItem value="paye">Paye</SelectItem>
                <SelectItem value="retard">En retard</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#1E2A4A]" /></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Aucune facture client. Creez votre premiere facture.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N.</TableHead><TableHead>Client</TableHead><TableHead>Date</TableHead>
                      <TableHead className="text-right">HT</TableHead><TableHead className="text-right">TVA</TableHead>
                      <TableHead className="text-right">TTC</TableHead><TableHead>Devise</TableHead>
                      <TableHead className="text-right">MUR</TableHead><TableHead>Statut</TableHead><TableHead>MRA</TableHead><TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(f => (
                      <TableRow key={f.id}>
                        <TableCell className="font-mono text-xs">{f.numero_facture || "-"}</TableCell>
                        <TableCell className="font-medium">{f.tiers || "-"}</TableCell>
                        <TableCell className="text-sm">{f.date_facture ? new Date(f.date_facture).toLocaleDateString("fr-FR") : "-"}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(f.montant_ht)}</TableCell>
                        <TableCell className="text-right text-sm">{f.montant_tva > 0 ? <span className="text-orange-600">{fmt(f.montant_tva)}</span> : <span className="text-gray-400">0</span>}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(f.montant_ttc)}</TableCell>
                        <TableCell><Badge variant="outline">{f.devise}</Badge></TableCell>
                        <TableCell className="text-right font-bold text-[#1E2A4A]">{fmt(Number(f.montant_mur) || 0)}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUT_COLORS[f.statut] || ""}`}>
                            {f.statut === "en_attente" ? "en attente" : f.statut}
                          </span>
                        </TableCell>
                        <TableCell>
                          {f.irn ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800" title={f.irn}>
                              <ShieldCheck className="w-3 h-3" />Fiscalise
                            </span>
                          ) : (f.statut === "en_attente" || f.statut === "paye") ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleFiscalise(f)}
                              disabled={fiscalisingId === f.id}
                              className="text-xs border-[#C9A84C] text-[#C9A84C] hover:bg-[#C9A84C]/10 h-7 px-2"
                            >
                              {fiscalisingId === f.id ? (
                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                              ) : (
                                <Shield className="w-3 h-3 mr-1" />
                              )}
                              {fiscalisingId === f.id ? "..." : "Fiscaliser MRA"}
                            </Button>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handlePreview(f)} title="Apercu"><Eye className="w-4 h-4" /></Button>
                            {f.statut === "brouillon" && (
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(f)} className="text-red-500 hover:text-red-700" title="Supprimer"><Trash2 className="w-4 h-4" /></Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════════ TAB: Recurring ══════════ */}
        <TabsContent value="recurrent" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Gerez vos factures recurrentes mensuelles ou trimestrielles</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={generateMonthlyInvoices}><CalendarDays className="w-4 h-4 mr-2" />Generer les factures du mois</Button>
              <Button onClick={() => setRecurringDialog(true)} className="bg-[#1E2A4A]"><Plus className="w-4 h-4 mr-2" />Nouveau modele recurrent</Button>
            </div>
          </div>

          {/* Generation preview */}
          {generatedPreview.length > 0 && (
            <Card className="border-[#C9A84C] bg-[#C9A84C]/5">
              <CardHeader>
                <CardTitle className="text-[#1E2A4A] text-base">Factures a generer</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  {generatedPreview.map(g => (
                    <div key={g.id} className="flex items-center justify-between bg-white rounded-lg p-3 border">
                      <div>
                        <p className="font-medium text-[#1E2A4A]">{g.client_nom}</p>
                        <p className="text-sm text-gray-500">{g.services.map(s => s.description).join(", ")}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold">{fmt(g.montant)} {g.devise}</p>
                        <p className="text-xs text-gray-400">{g.frequence}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setGeneratedPreview([])}>Annuler</Button>
                  <Button onClick={confirmGeneration} disabled={generating} className="bg-[#1E2A4A]">
                    <CheckCircle2 className="w-4 h-4 mr-2" />{generating ? "Generation..." : `Confirmer (${generatedPreview.length} factures)`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recurring templates list */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {recurring.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Aucun modele recurrent. Creez votre premier modele.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead><TableHead>Services</TableHead><TableHead>Frequence</TableHead>
                      <TableHead className="text-right">Montant</TableHead><TableHead>Prochaine date</TableHead>
                      <TableHead>Statut</TableHead><TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recurring.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.client_nom}</TableCell>
                        <TableCell className="text-sm text-gray-600">{r.services.map(s => s.description).join(", ")}</TableCell>
                        <TableCell><Badge variant="outline">{r.frequence === "mensuel" ? "Mensuel" : "Trimestriel"}</Badge></TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.montant)} {r.devise}</TableCell>
                        <TableCell className="text-sm">{new Date(r.prochaine_date).toLocaleDateString("fr-FR")}</TableCell>
                        <TableCell>
                          {r.active
                            ? <Badge className="bg-green-100 text-green-700">Actif</Badge>
                            : <Badge className="bg-gray-100 text-gray-500">Inactif</Badge>
                          }
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => toggleRecurring(r.id)}>
                            {r.active ? <X className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteRecurring(r.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* New recurring dialog */}
          <Dialog open={recurringDialog} onOpenChange={setRecurringDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Nouveau modele recurrent</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2">
                <div>
                  <Label>Client</Label>
                  <Select value={rClientId} onValueChange={setRClientId}>
                    <SelectTrigger><SelectValue placeholder="Selectionner un client..." /></SelectTrigger>
                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}{c.entreprise ? ` (${c.entreprise})` : ""}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Frequence</Label>
                  <Select value={rFrequence} onValueChange={setRFrequence}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mensuel">Mensuel</SelectItem>
                      <SelectItem value="trimestriel">Trimestriel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Services (un par ligne)</Label>
                  <textarea className="w-full border rounded-md p-2 text-sm min-h-[80px]" value={rServices} onChange={e => setRServices(e.target.value)} placeholder="Prestation comptable mensuelle&#10;TVA trimestrielle" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Montant total</Label><Input type="number" value={rMontant} onChange={e => setRMontant(e.target.value)} placeholder="0.00" /></div>
                  <div>
                    <Label>Devise</Label>
                    <Select value={rDevise} onValueChange={setRDevise}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["MUR", "EUR", "USD", "GBP"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Prochaine date de facturation</Label><Input type="date" value={rProchaineDate} onChange={e => setRProchaineDate(e.target.value)} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRecurringDialog(false)}>Annuler</Button>
                <Button onClick={saveRecurring} disabled={!rClientId || !rMontant} className="bg-[#1E2A4A]">Creer</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>

      {/* Facture detail dialog (when no document_id) */}
      <Dialog open={!!detailFacture} onOpenChange={open => { if (!open) setDetailFacture(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#1E2A4A]">
              Facture {detailFacture?.numero_facture || "—"}
            </DialogTitle>
          </DialogHeader>
          {detailFacture && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">Client :</span> <span className="font-medium">{detailFacture.tiers || "—"}</span></div>
                <div><span className="text-gray-500">Date :</span> <span className="font-medium">{detailFacture.date_facture ? new Date(detailFacture.date_facture).toLocaleDateString("fr-FR") : "—"}</span></div>
                <div><span className="text-gray-500">Échéance :</span> <span className="font-medium">{detailFacture.date_echeance ? new Date(detailFacture.date_echeance).toLocaleDateString("fr-FR") : "—"}</span></div>
                <div><span className="text-gray-500">Statut :</span> <Badge className={`ml-1 ${STATUT_COLORS[detailFacture.statut] || ""}`}>{detailFacture.statut}</Badge></div>
                <div><span className="text-gray-500">Devise :</span> <span className="font-medium">{detailFacture.devise}</span></div>
                <div><span className="text-gray-500">Mode paiement :</span> <span className="font-medium">{detailFacture.mode_paiement || "—"}</span></div>
              </div>
              <div className="border rounded-lg p-3 bg-gray-50 space-y-1">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Montant HT</span><span className="font-mono">{fmt(detailFacture.montant_ht)} {detailFacture.devise}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">TVA</span><span className="font-mono">{fmt(detailFacture.montant_tva)} {detailFacture.devise}</span></div>
                <div className="flex justify-between text-sm font-bold border-t pt-1"><span>Total TTC</span><span className="font-mono">{fmt(detailFacture.montant_ttc)} {detailFacture.devise}</span></div>
                {detailFacture.devise !== "MUR" && (
                  <div className="flex justify-between text-sm text-blue-600"><span>Equiv. MUR</span><span className="font-mono">{fmt(Number(detailFacture.montant_mur) || 0)} MUR</span></div>
                )}
              </div>
              {detailFacture.lignes && Array.isArray(detailFacture.lignes) && detailFacture.lignes.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-[#1E2A4A] mb-2">Lignes de facturation</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Qté</TableHead>
                        <TableHead className="text-right">PU</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailFacture.lignes.map((l: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{l.description || l.libelle || "—"}</TableCell>
                          <TableCell className="text-right text-sm">{l.quantite ?? 1}</TableCell>
                          <TableCell className="text-right text-sm font-mono">{fmt(l.prix_unitaire ?? l.pu ?? 0)}</TableCell>
                          <TableCell className="text-right text-sm font-mono">{fmt(l.total ?? l.montant ?? 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {detailFacture.notes && (
                <div className="text-sm"><span className="text-gray-500">Notes :</span> <span>{detailFacture.notes}</span></div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailFacture(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
