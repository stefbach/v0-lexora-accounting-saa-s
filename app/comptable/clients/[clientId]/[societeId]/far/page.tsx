"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Loader2, ArrowLeft, Download, Plus, RefreshCw, TrendingDown } from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number | null | undefined) {
  if (n == null) return "—"
  return new Intl.NumberFormat("fr-MU", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

const TAUX_MRA: Record<string, number> = {
  commercial_premises: 5,
  motor_vehicles: 25,
  furniture_fittings: 20,
  computer_equipment: 50,
  other: 20,
}

const CATEGORIE_LABELS: Record<string, string> = {
  commercial_premises: "Locaux commerciaux",
  motor_vehicles: "Véhicules à moteur",
  furniture_fittings: "Mobilier & agencements",
  computer_equipment: "Équipements informatiques",
  other: "Autres immobilisations",
}

interface Actif {
  id: string
  actif_description: string
  categorie: string
  fournisseur?: string
  date_acquisition?: string
  taux_mra: number
  cout_01_07: number
  twdv_01_07: number
  additions: number
  disposals_cost: number
  disposals_twdv: number
  cout_30_06: number
  twdv_adjusted: number
  annual_allowance: number
  twdv_30_06: number
  fully_expensed: boolean
  notes?: string
}

interface FARResp {
  actifs: Actif[]
  par_categorie: Record<string, Actif[]>
  totaux: {
    nb_actifs: number
    total_cout: number
    total_twdv: number
    total_annual_allowance: number
    taux_mra_reference: Record<string, number>
  }
}

interface NewActif {
  actif_description: string
  categorie: string
  fournisseur: string
  date_acquisition: string
  cout_01_07: string
  twdv_01_07: string
  additions: string
  notes: string
}

export default function FARPage() {
  const params    = useParams()
  const societeId = params.societeId as string
  const clientId  = params.clientId  as string

  const [data, setData]           = useState<FARResp | null>(null)
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [calculating, setCalc]    = useState(false)
  const [exercice, setExercice]   = useState("FY2024-2025")
  const [showForm, setShowForm]   = useState(false)
  const [newActif, setNewActif]   = useState<NewActif>({
    actif_description: "", categorie: "computer_equipment",
    fournisseur: "", date_acquisition: "",
    cout_01_07: "", twdv_01_07: "", additions: "", notes: "",
  })

  const fetchData = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/comptable/annual-allowance?societe_id=${societeId}&exercice=${exercice}`)
      const json = await res.json()
      setData(json)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [societeId, exercice])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAdd = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/comptable/annual-allowance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          exercice,
          actif_description: newActif.actif_description,
          categorie: newActif.categorie,
          fournisseur: newActif.fournisseur,
          date_acquisition: newActif.date_acquisition || null,
          cout_01_07: parseFloat(newActif.cout_01_07) || 0,
          twdv_01_07: parseFloat(newActif.twdv_01_07) || 0,
          additions:  parseFloat(newActif.additions)  || 0,
          notes: newActif.notes,
        }),
      })
      if (res.ok) {
        setShowForm(false)
        setNewActif({ actif_description: "", categorie: "computer_equipment", fournisseur: "", date_acquisition: "", cout_01_07: "", twdv_01_07: "", additions: "", notes: "" })
        fetchData()
      }
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const handleCalcAll = async () => {
    if (!data?.actifs) return
    setCalc(true)
    try {
      await Promise.all(data.actifs.map(a =>
        fetch("/api/comptable/annual-allowance", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: a.id }),
        })
      ))
      fetchData()
    } catch (e) { console.error(e) }
    finally { setCalc(false) }
  }

  const exportCSV = () => {
    if (!data?.actifs) return
    const rows = [
      ["Description", "Catégorie", "Fournisseur", "Date acq.", "Coût 01/07", "Additions", "Disposals (coût)", "Coût 30/06", "TWDV 01/07", "TWDV Ajustée", "Dotation annuelle", "TWDV 30/06", "Taux MRA", "100% Expensé"],
      ...data.actifs.map(a => [
        a.actif_description, CATEGORIE_LABELS[a.categorie] || a.categorie,
        a.fournisseur || "", a.date_acquisition || "",
        a.cout_01_07, a.additions, a.disposals_cost, a.cout_30_06,
        a.twdv_01_07, a.twdv_adjusted, a.annual_allowance, a.twdv_30_06,
        `${a.taux_mra}%`, a.fully_expensed ? "Oui" : "Non",
      ]),
    ]
    const csv  = rows.map(r => r.map(v => `"${v}"`).join(";")).join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `FAR_${societeId.slice(0, 8)}_${exercice}.csv`
    a.click()
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/comptable/clients/${clientId}/${societeId}`}>
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Retour</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
              <TrendingDown className="inline w-6 h-6 mr-2" style={{ color: GOLD }} />
              FAR — Fixed Asset Register
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Tableau d'amortissements selon barème MRA</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Select value={exercice} onValueChange={setExercice}>
            <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="FY2024-2025">FY2024-2025</SelectItem>
              <SelectItem value="FY2025-2026">FY2025-2026</SelectItem>
              <SelectItem value="FY2023-2024">FY2023-2024</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleCalcAll} variant="outline" size="sm" disabled={calculating} className="gap-1">
            {calculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Calculer
          </Button>
          <Button onClick={exportCSV} variant="outline" size="sm" className="gap-1">
            <Download className="w-4 h-4" /> CSV MRA
          </Button>
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1" style={{ backgroundColor: NAVY }}>
                <Plus className="w-4 h-4" /> Ajouter actif
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Nouvel actif immobilisé</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="col-span-2">
                  <Label className="text-xs">Description *</Label>
                  <Input value={newActif.actif_description} onChange={e => setNewActif(p => ({ ...p, actif_description: e.target.value }))} placeholder="Ex: Ordinateur Dell..." className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Catégorie *</Label>
                  <Select value={newActif.categorie} onValueChange={v => setNewActif(p => ({ ...p, categorie: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORIE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v} ({TAUX_MRA[k]}%)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Taux MRA auto</Label>
                  <Input value={`${TAUX_MRA[newActif.categorie]}%`} disabled className="h-8 text-sm bg-gray-50" />
                </div>
                <div>
                  <Label className="text-xs">Fournisseur</Label>
                  <Input value={newActif.fournisseur} onChange={e => setNewActif(p => ({ ...p, fournisseur: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Date acquisition</Label>
                  <Input type="date" value={newActif.date_acquisition} onChange={e => setNewActif(p => ({ ...p, date_acquisition: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Coût 01/07 (MUR)</Label>
                  <Input type="number" value={newActif.cout_01_07} onChange={e => setNewActif(p => ({ ...p, cout_01_07: e.target.value }))} placeholder="0" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">TWDV 01/07 (MUR)</Label>
                  <Input type="number" value={newActif.twdv_01_07} onChange={e => setNewActif(p => ({ ...p, twdv_01_07: e.target.value }))} placeholder="0" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Additions de l'année</Label>
                  <Input type="number" value={newActif.additions} onChange={e => setNewActif(p => ({ ...p, additions: e.target.value }))} placeholder="0" className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Input value={newActif.notes} onChange={e => setNewActif(p => ({ ...p, notes: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div className="col-span-2 flex gap-2 justify-end mt-2">
                  <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Annuler</Button>
                  <Button size="sm" onClick={handleAdd} disabled={saving || !newActif.actif_description} style={{ backgroundColor: NAVY }}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    Ajouter
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPIs */}
      {data && (
        <div className="grid grid-cols-4 gap-4">
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500">Actifs</p>
            <p className="text-2xl font-bold" style={{ color: NAVY }}>{data.totaux.nb_actifs}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500">Coût total</p>
            <p className="text-xl font-bold text-blue-700">{fmt(data.totaux.total_cout)} MUR</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500">Annual Allowance totale</p>
            <p className="text-xl font-bold text-orange-600">{fmt(data.totaux.total_annual_allowance)} MUR</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500">TWDV résiduelle</p>
            <p className="text-xl font-bold text-green-700">{fmt(data.totaux.total_twdv)} MUR</p>
          </CardContent></Card>
        </div>
      )}

      {/* Tableaux par catégorie */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: NAVY }} /></div>
      ) : !data?.actifs?.length ? (
        <Card><CardContent className="py-12 text-center text-gray-500">
          <TrendingDown className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Aucun actif enregistré</p>
          <p className="text-sm mt-1">Ajoutez vos immobilisations pour calculer l'annual allowance MRA</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(data.par_categorie).sort().map(([cat, actifs]) => {
            const totalCout = actifs.reduce((s, a) => s + (a.cout_30_06 || 0), 0)
            const totalAA   = actifs.reduce((s, a) => s + (a.annual_allowance || 0), 0)
            const totalTWDV = actifs.reduce((s, a) => s + (a.twdv_30_06 || 0), 0)
            return (
              <Card key={cat}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2" style={{ color: NAVY }}>
                    {CATEGORIE_LABELS[cat] || cat}
                    <Badge variant="outline" className="text-[10px]">{TAUX_MRA[cat] || 20}% MRA</Badge>
                    <span className="text-xs font-normal text-gray-500">({actifs.length} actifs)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 text-xs">
                          <TableHead>Description</TableHead>
                          <TableHead>Fournisseur</TableHead>
                          <TableHead>Date acq.</TableHead>
                          <TableHead className="text-right">Coût 01/07</TableHead>
                          <TableHead className="text-right">Additions</TableHead>
                          <TableHead className="text-right">Disposals</TableHead>
                          <TableHead className="text-right">Coût 30/06</TableHead>
                          <TableHead className="text-right">TWDV 01/07</TableHead>
                          <TableHead className="text-right">Dotation</TableHead>
                          <TableHead className="text-right">TWDV 30/06</TableHead>
                          <TableHead className="text-right">NBV</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {actifs.map(a => (
                          <TableRow key={a.id}>
                            <TableCell className="text-xs font-medium">
                              {a.actif_description}
                              {a.fully_expensed && (
                                <Badge className="ml-1 text-[9px] bg-green-100 text-green-800 px-1 py-0">100%</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-gray-500">{a.fournisseur || "—"}</TableCell>
                            <TableCell className="text-xs text-gray-500">
                              {a.date_acquisition ? new Date(a.date_acquisition).toLocaleDateString("fr-FR") : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono">{fmt(a.cout_01_07)}</TableCell>
                            <TableCell className="text-xs text-right font-mono text-blue-600">
                              {a.additions > 0 ? fmt(a.additions) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono text-red-500">
                              {a.disposals_cost > 0 ? `(${fmt(a.disposals_cost)})` : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono font-semibold">{fmt(a.cout_30_06)}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{fmt(a.twdv_01_07)}</TableCell>
                            <TableCell className="text-xs text-right font-mono text-orange-600">
                              ({fmt(a.annual_allowance)})
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono font-semibold text-green-700">{fmt(a.twdv_30_06)}</TableCell>
                            <TableCell className="text-xs text-right font-mono">{fmt(a.cout_30_06 - (a.twdv_adjusted || 0) + a.twdv_30_06)}</TableCell>
                          </TableRow>
                        ))}
                        {/* Sous-total */}
                        <TableRow className="bg-gray-100 border-t-2 font-semibold text-xs">
                          <TableCell colSpan={6} className="font-bold">Sous-total {CATEGORIE_LABELS[cat] || cat}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(totalCout)}</TableCell>
                          <TableCell></TableCell>
                          <TableCell className="text-right font-mono text-orange-600">({fmt(totalAA)})</TableCell>
                          <TableCell className="text-right font-mono text-green-700">{fmt(totalTWDV)}</TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {/* Total général */}
          <Card className="border-2" style={{ borderColor: NAVY }}>
            <CardContent className="p-4">
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Coût total 30/06</p>
                  <p className="text-lg font-bold" style={{ color: NAVY }}>{fmt(data.totaux.total_cout)} MUR</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Annual Allowance</p>
                  <p className="text-lg font-bold text-orange-600">({fmt(data.totaux.total_annual_allowance)}) MUR</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">TWDV résiduelle</p>
                  <p className="text-lg font-bold text-green-700">{fmt(data.totaux.total_twdv)} MUR</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Exercice</p>
                  <p className="text-lg font-bold" style={{ color: GOLD }}>{exercice}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
