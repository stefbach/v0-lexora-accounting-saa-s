"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Plus, Package, TrendingDown, AlertCircle, Download } from "lucide-react"

const CATEGORIES = [
  { value: "materiel_informatique", label: "Matériel informatique (50%)" },
  { value: "logiciel", label: "Logiciel (50%)" },
  { value: "vehicule", label: "Véhicule (25%)" },
  { value: "mobilier", label: "Mobilier / Fixtures (20%)" },
  { value: "equipement", label: "Équipement (20%)" },
  { value: "immobilier", label: "Immobilier (5%)" },
  { value: "autre", label: "Autre (20%)" },
]

const TAUX_DEFAUT: Record<string, number> = {
  materiel_informatique: 50, logiciel: 50, vehicule: 25,
  mobilier: 20, equipement: 20, immobilier: 5, autre: 20,
}

interface Immo {
  id: string; designation: string; categorie: string; fournisseur: string | null
  date_acquisition: string; cout_acquisition: number; cout_mur: number
  taux_amortissement: number; devise: string
  valeur_nette_actuelle: number; cumul_amortissements: number
  amortissements: Array<{ exercice: string; dotation: number; cumul_apres: number; valeur_nette: number }>
}

interface Societe { id: string; nom: string }

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n)
}

export default function ImmobilisationsPage() {
  const [immobilisations, setImmobilisations] = useState<Immo[]>([])
  const [societes, setSocietes] = useState<Societe[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSociete, setSelectedSociete] = useState("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [totaux, setTotaux] = useState({ cout_total: 0, cumul_total: 0, vnc_total: 0 })
  const [form, setForm] = useState({
    societe_id: "", designation: "", categorie: "materiel_informatique",
    fournisseur: "", date_acquisition: "", cout_acquisition: "",
    devise: "MUR", taux_change: "1", taux_amortissement: "50", methode: "lineaire",
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedSociete !== "all") params.set("societe_id", selectedSociete)
      const [immoRes, socRes] = await Promise.all([
        fetch(`/api/comptable/immobilisations?${params}`),
        fetch("/api/comptable/societes"),
      ])
      const immoData = await immoRes.json()
      const socData = await socRes.json()
      setImmobilisations(immoData.immobilisations || [])
      setTotaux(immoData.totaux || {})
      setSocietes(socData.societes || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [selectedSociete])

  useEffect(() => { fetchData() }, [fetchData])

  const handleCreate = async () => {
    if (!form.societe_id || !form.designation || !form.date_acquisition || !form.cout_acquisition) {
      setError("Champs requis manquants"); return
    }
    setSaving(true); setError(null)
    try {
      const res = await fetch("/api/comptable/immobilisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          cout_acquisition: parseFloat(form.cout_acquisition),
          taux_change: parseFloat(form.taux_change) || 1,
          taux_amortissement: parseFloat(form.taux_amortissement),
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setDialogOpen(false)
      setForm({ societe_id: "", designation: "", categorie: "materiel_informatique", fournisseur: "", date_acquisition: "", cout_acquisition: "", devise: "MUR", taux_change: "1", taux_amortissement: "50", methode: "lineaire" })
      fetchData()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur") }
    finally { setSaving(false) }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Immobilisations (FAR)</h1>
          <p className="text-sm text-gray-500 mt-1">Fixed Asset Register — amortissements calculés automatiquement</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2"><Download className="w-4 h-4" /> Exporter FAR</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#1E2A4A] text-white hover:bg-[#2a3a5a]"><Plus className="w-4 h-4 mr-2" /> Nouvelle immobilisation</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Ajouter une immobilisation</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2">
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Société *</Label>
                    <Select value={form.societe_id} onValueChange={v => setForm(f => ({ ...f, societe_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                      <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Catégorie *</Label>
                    <Select value={form.categorie} onValueChange={v => setForm(f => ({ ...f, categorie: v, taux_amortissement: String(TAUX_DEFAUT[v] || 20) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Désignation *</Label>
                  <Input value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} placeholder="Ex: Dell Laptop XPS 15" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Fournisseur</Label>
                    <Input value={form.fournisseur} onChange={e => setForm(f => ({ ...f, fournisseur: e.target.value }))} placeholder="Nom du fournisseur" />
                  </div>
                  <div>
                    <Label>Date acquisition *</Label>
                    <Input type="date" value={form.date_acquisition} onChange={e => setForm(f => ({ ...f, date_acquisition: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Devise</Label>
                    <Select value={form.devise} onValueChange={v => setForm(f => ({ ...f, devise: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["MUR","EUR","USD","GBP"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Coût acquisition *</Label>
                    <Input type="number" value={form.cout_acquisition} onChange={e => setForm(f => ({ ...f, cout_acquisition: e.target.value }))} placeholder="0" />
                  </div>
                  <div>
                    <Label>Taux amort. %</Label>
                    <Input type="number" value={form.taux_amortissement} onChange={e => setForm(f => ({ ...f, taux_amortissement: e.target.value }))} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
                <Button onClick={handleCreate} disabled={saving} className="bg-[#1E2A4A] text-white">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Créer + Calculer amortissements
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Coût total", value: fmt(totaux.cout_total), icon: Package, color: "text-blue-600" },
          { label: "Amortissements cumulés", value: fmt(totaux.cumul_total), icon: TrendingDown, color: "text-orange-600" },
          { label: "Valeur nette comptable", value: fmt(totaux.vnc_total), icon: AlertCircle, color: "text-green-600" },
        ].map(k => (
          <Card key={k.label}><CardContent className="p-4 flex items-center gap-3">
            <k.icon className={`w-8 h-8 ${k.color}`} />
            <div><p className="text-xs text-gray-500">{k.label}</p><p className="text-xl font-bold text-[#1E2A4A]">{k.value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Card><CardContent className="p-4">
        <Select value={selectedSociete} onValueChange={setSelectedSociete}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Toutes les sociétés" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les sociétés</SelectItem>
            {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardContent></Card>

      <Card>
        <CardHeader><CardTitle className="text-[#1E2A4A]">Registre des immobilisations ({immobilisations.length})</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#1E2A4A]" /></div>
          ) : immobilisations.length === 0 ? (
            <div className="text-center py-12 text-gray-500">Aucune immobilisation enregistrée</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Désignation</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Date acq.</TableHead>
                  <TableHead className="text-right">Coût MUR</TableHead>
                  <TableHead className="text-right">Amort. cumulé</TableHead>
                  <TableHead className="text-right">VNC</TableHead>
                  <TableHead>Taux</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {immobilisations.map(immo => (
                  <>
                    <TableRow key={immo.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedId(expandedId === immo.id ? null : immo.id)}>
                      <TableCell className="font-medium">{immo.designation}</TableCell>
                      <TableCell className="text-sm text-gray-600">{CATEGORIES.find(c => c.value === immo.categorie)?.label.split(" (")[0] || immo.categorie}</TableCell>
                      <TableCell className="text-sm">{new Date(immo.date_acquisition).toLocaleDateString("fr-FR")}</TableCell>
                      <TableCell className="text-right">{fmt(immo.cout_mur || immo.cout_acquisition)}</TableCell>
                      <TableCell className="text-right text-orange-600">{fmt(immo.cumul_amortissements)}</TableCell>
                      <TableCell className="text-right font-semibold text-green-700">{fmt(immo.valeur_nette_actuelle)}</TableCell>
                      <TableCell><span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">{immo.taux_amortissement}%</span></TableCell>
                      <TableCell className="text-xs text-gray-400">{expandedId === immo.id ? "▲" : "▼"}</TableCell>
                    </TableRow>
                    {expandedId === immo.id && (
                      <TableRow key={`${immo.id}-detail`}>
                        <TableCell colSpan={8} className="bg-gray-50 p-4">
                          <p className="text-xs font-semibold text-gray-600 mb-2">Plan d&apos;amortissement</p>
                          <table className="w-full text-xs">
                            <thead><tr className="text-gray-500"><th className="text-left">Exercice</th><th className="text-right">Dotation</th><th className="text-right">Cumul</th><th className="text-right">VNC</th></tr></thead>
                            <tbody>
                              {(immo.amortissements || []).map(a => (
                                <tr key={a.exercice} className="border-t border-gray-200">
                                  <td className="py-1">{a.exercice}</td>
                                  <td className="text-right">{fmt(a.dotation)}</td>
                                  <td className="text-right">{fmt(a.cumul_apres)}</td>
                                  <td className="text-right font-medium">{fmt(a.valeur_nette)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
