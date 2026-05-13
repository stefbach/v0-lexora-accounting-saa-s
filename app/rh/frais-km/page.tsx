"use client"
import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Car, Plus, CheckCircle, Edit2, Save, DollarSign } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale, type Locale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 2 }).format(n)
}

const STATUT_COLORS: Record<string, string> = {
  en_attente: "bg-yellow-100 text-yellow-800",
  approuve: "bg-green-100 text-green-800",
  refuse: "bg-red-100 text-red-800",
}
const STATUT_LABELS: Record<string, string> = {
  en_attente: "En attente",
  approuve: "Approuvé",
  refuse: "Refusé",
}

interface FraisKm {
  id: string
  employe_id: string
  employe_nom: string
  employe_prenom: string
  periode: string
  km: number
  tarif: number
  montant: number
  statut: string
}

export default function FraisKmPage() {
  const locale: Locale = getLocale()
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [employes, setEmployes] = useState<any[]>([])
  const [frais, setFrais] = useState<FraisKm[]>([])
  const [loading, setLoading] = useState(true)
  const [tarif, setTarif] = useState(16)
  const [editingTarif, setEditingTarif] = useState(false)
  const [newTarif, setNewTarif] = useState("16")
  const [savingTarif, setSavingTarif] = useState(false)
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7))

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingFrais, setEditingFrais] = useState<FraisKm | null>(null)
  const [formEmploye, setFormEmploye] = useState("")
  const [formKm, setFormKm] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ periode })
      if (societe !== "all") params.set("societe_id", societe)
      const [fraisRes, empRes] = await Promise.all([
        fetch(`/api/rh/frais-km?${params}`).then(r => r.json()).catch(() => ({ frais: [], tarif_km: 16 })),
        fetch(`/api/rh/employes?${societe !== "all" ? `societe_id=${societe}` : ""}`).then(r => r.json()).catch(() => ({ employes: [] })),
      ])
      setFrais(fraisRes.frais || [])
      setTarif(fraisRes.tarif_km ?? 16)
      setNewTarif(String(fraisRes.tarif_km ?? 16))
      setEmployes(empRes.employes || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [societe, periode])

  useEffect(() => { load() }, [load])

  const saveTarifKm = async () => {
    setSavingTarif(true)
    try {
      await fetch("/api/rh/frais-km", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_tarif", societe_id: societe, tarif_km: parseFloat(newTarif) }),
      })
      setTarif(parseFloat(newTarif))
      setEditingTarif(false)
      load()
    } catch (e) {
      console.error(e)
    } finally {
      setSavingTarif(false)
    }
  }

  const openAddDialog = () => {
    setEditingFrais(null)
    setFormEmploye("")
    setFormKm("")
    setDialogOpen(true)
  }

  const openEditDialog = (f: FraisKm) => {
    setEditingFrais(f)
    setFormEmploye(f.employe_id)
    setFormKm(String(f.km))
    setDialogOpen(true)
  }

  const saveFrais = async () => {
    if (!formEmploye || !formKm) return
    setSaving(true)
    try {
      const res = await fetch("/api/rh/frais-km", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saisir",
          employe_id: formEmploye,
          periode,
          km_parcourus: parseFloat(formKm),
          societe_id: societe !== "all" ? societe : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error("Erreur ajout frais km : " + (data.error || `HTTP ${res.status}`))
        return
      }
      // Fermer le dialog AVANT le rechargement pour que l'UX paraisse
      // instantanée. await load() pour garantir que la liste est rafraîchie
      // avant le toast — sinon l'utilisateur voit le toast mais une liste
      // encore vide pendant 100-300 ms.
      setDialogOpen(false)
      await load()
      toast.success(editingFrais ? "✅ Frais kilométriques mis à jour" : "✅ Frais kilométriques ajouté")
    } catch (e: any) {
      toast.error("Erreur réseau : " + (e?.message || ""))
    } finally {
      setSaving(false)
    }
  }

  const approveFrais = async (id: string) => {
    try {
      const res = await fetch("/api/rh/frais-km", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approuver", id }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error("Erreur approbation : " + (d.error || `HTTP ${res.status}`))
        return
      }
      await load()
      toast.success("✅ Frais kilométriques approuvés")
    } catch (e: any) {
      toast.error("Erreur réseau : " + (e?.message || ""))
    }
  }

  const totalKm = frais.reduce((s, f) => s + f.km, 0)
  const totalMontant = frais.reduce((s, f) => s + f.montant, 0)
  const nbApprouves = frais.filter(f => f.statut === "approuve").length

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>{t('rha.b.fraiskm.title', locale)}</h1>
          <p className="text-gray-500 text-sm">{t('rha.b.fraiskm.subtitle', locale)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="month"
            value={periode}
            onChange={e => setPeriode(e.target.value)}
            className="w-[160px]"
          />
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Toutes les societes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les societes</SelectItem>
              {societes.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tarif card + summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-2" style={{ borderColor: GOLD }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Car className="h-4 w-4" /> Tarif / km
            </CardTitle>
          </CardHeader>
          <CardContent>
            {editingTarif ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.1"
                  value={newTarif}
                  onChange={e => setNewTarif(e.target.value)}
                  className="w-24"
                />
                <span className="text-sm text-gray-500">Rs/km</span>
                <Button size="sm" onClick={saveTarifKm} disabled={savingTarif} style={{ backgroundColor: NAVY }} className="text-white">
                  {savingTarif ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold" style={{ color: NAVY }}>{tarif} Rs</span>
                <span className="text-sm text-gray-500">/km</span>
                <Button variant="ghost" size="sm" onClick={() => { setNewTarif(String(tarif)); setEditingTarif(true) }}>
                  <Edit2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Total km</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" style={{ color: NAVY }}>{totalKm.toLocaleString("fr-FR")} km</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Montant total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" style={{ color: GOLD }}>{fmt(totalMontant)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Approuves</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{nbApprouves} / {frais.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle style={{ color: NAVY }}>
              <DollarSign className="inline h-5 w-5 mr-2" />
              Frais kilometriques - {periode}
            </CardTitle>
            <Button onClick={openAddDialog} style={{ backgroundColor: GOLD }} className="text-white hover:opacity-90">
              <Plus className="h-4 w-4 mr-1" /> Ajouter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : frais.length === 0 ? (
            <p className="text-center text-gray-400 py-12">Aucun frais kilometrique pour cette periode.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employe</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead className="text-right">Km parcourus</TableHead>
                    <TableHead className="text-right">Tarif</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {frais.map(f => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">
                        {f.employe_prenom} {f.employe_nom}
                      </TableCell>
                      <TableCell>{f.periode}</TableCell>
                      <TableCell className="text-right">{f.km.toLocaleString("fr-FR")} km</TableCell>
                      <TableCell className="text-right">{f.tarif} Rs/km</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(f.montant)}</TableCell>
                      <TableCell>
                        <Badge className={STATUT_COLORS[f.statut] || "bg-gray-100 text-gray-700"}>
                          {STATUT_LABELS[f.statut] || f.statut}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(f)} disabled={f.statut === "approuve"}>
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          {f.statut === "en_attente" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-700 border-green-300 hover:bg-green-50"
                              onClick={() => approveFrais(f.id)}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" /> Approuver
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ color: NAVY }}>
              {editingFrais ? "Modifier les km" : "Ajouter des frais km"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employe</Label>
              <Select value={formEmploye} onValueChange={setFormEmploye} disabled={!!editingFrais}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selectionner un employe" />
                </SelectTrigger>
                <SelectContent>
                  {employes.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.prenom} {emp.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kilometres parcourus</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={formKm}
                onChange={e => setFormKm(e.target.value)}
                placeholder="Ex: 150"
                className="mt-1"
              />
            </div>
            <div className="bg-gray-50 rounded p-3">
              <p className="text-sm text-gray-600">
                Montant estime: <strong style={{ color: GOLD }}>
                  {fmt((parseFloat(formKm) || 0) * tarif)}
                </strong>
              </p>
              <p className="text-xs text-gray-400 mt-1">Tarif applique: {tarif} Rs/km</p>
            </div>
            <Button
              className="w-full text-white"
              style={{ backgroundColor: NAVY }}
              onClick={saveFrais}
              disabled={saving || !formEmploye || !formKm}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingFrais ? "Mettre a jour" : "Enregistrer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </ClientPageShell>
  )
}
