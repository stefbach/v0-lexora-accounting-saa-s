"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Calendar, Star, Plus, Trash2, Info, RefreshCw } from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface JourFerie {
  id: string
  date: string
  libelle: string
  type_jour: string
  societe_id: string | null
  annee: number | null
}

const VARIABLE_SUGGESTIONS = [
  "Thaipoosam Cavadee",
  "Maha Shivaratree",
  "Fête du printemps chinois",
  "Ougadi",
  "Eid ul-Fitr",
  "Ganesh Chaturthi",
  "Divali",
]

export default function JoursFeriesPage() {
  const currentYear = new Date().getFullYear()
  const [annee, setAnnee] = useState(currentYear.toString())
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [joursFeries, setJoursFeries] = useState<JourFerie[]>([])
  const [loading, setLoading] = useState(true)
  const [initializing, setInitializing] = useState(false)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newDate, setNewDate] = useState("")
  const [newLibelle, setNewLibelle] = useState("")
  const [newType, setNewType] = useState("variable")
  const [saving, setSaving] = useState(false)

  // Load societes
  useEffect(() => {
    fetch("/api/comptable/societes")
      .then(r => r.json())
      .then(d => setSocietes(d.societes || []))
      .catch(() => {})
  }, [])

  // Load holidays
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ annee })
      if (societe !== "all") params.set("societe_id", societe)
      const res = await fetch(`/api/rh/jours-feries?${params}`)
      const data = await res.json()
      setJoursFeries(data.jours_feries || [])
    } catch {
      setJoursFeries([])
    } finally {
      setLoading(false)
    }
  }, [annee, societe])

  useEffect(() => { load() }, [load])

  // Init year with fixed holidays
  const initAnnee = async () => {
    setInitializing(true)
    try {
      await fetch("/api/rh/jours-feries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "init_annee",
          annee: parseInt(annee),
          societe_id: societe !== "all" ? societe : null,
        }),
      })
      await load()
    } finally {
      setInitializing(false)
    }
  }

  // Add holiday
  const handleAdd = async () => {
    if (!newDate || !newLibelle) return
    setSaving(true)
    try {
      const res = await fetch("/api/rh/jours-feries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "creer",
          date: newDate,
          libelle: newLibelle,
          type_jour: newType,
          societe_id: societe !== "all" ? societe : null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setDialogOpen(false)
        setNewDate("")
        setNewLibelle("")
        setNewType("variable")
        await load()
      }
    } finally {
      setSaving(false)
    }
  }

  // Delete holiday
  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce jour férié ?")) return
    await fetch("/api/rh/jours-feries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "supprimer", id }),
    })
    await load()
  }

  const formatDate = (d: string) => {
    const date = new Date(d + "T00:00:00")
    return date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" })
  }

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 1 + i)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            <Calendar className="inline w-6 h-6 mr-2" style={{ color: GOLD }} />
            Jours fériés
          </h1>
          <p className="text-sm text-gray-500 mt-1">Gestion des jours fériés — Maurice</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={annee} onValueChange={setAnnee}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Toutes les sociétés" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les sociétés</SelectItem>
              {societes.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Info banner */}
      <Alert className="border-amber-300 bg-amber-50">
        <Info className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 text-sm">
          Les jours fériés variables (Eid, Divali, Thaipoosam Cavadee, etc.) doivent être ajoutés manuellement chaque année car leurs dates changent.
        </AlertDescription>
      </Alert>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          onClick={() => setDialogOpen(true)}
          style={{ backgroundColor: GOLD, color: NAVY }}
          className="hover:opacity-90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Ajouter un jour férié
        </Button>
        <Button
          variant="outline"
          onClick={initAnnee}
          disabled={initializing}
          className="border-[#0B0F2E]/30 text-[#0B0F2E] hover:bg-[#0B0F2E]/5"
        >
          {initializing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Pré-remplir jours fixes {annee}
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg" style={{ color: NAVY }}>
            Jours fériés {annee}
            <Badge className="ml-2 text-xs" variant="secondary">
              {joursFeries.length} jour{joursFeries.length > 1 ? "s" : ""}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: GOLD }} />
            </div>
          ) : joursFeries.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Aucun jour férié pour {annee}</p>
              <p className="text-sm mt-1">Cliquez sur &laquo; Pré-remplir jours fixes &raquo; pour commencer</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[250px]">Date</TableHead>
                    <TableHead>Libellé</TableHead>
                    <TableHead className="w-[120px]">Type</TableHead>
                    <TableHead className="w-[80px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {joursFeries.map(jf => (
                    <TableRow key={jf.id}>
                      <TableCell className="font-medium text-sm">
                        {formatDate(jf.date)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {jf.type_jour === "fixe" ? (
                            <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: NAVY }} />
                          ) : (
                            <Star className="w-4 h-4 flex-shrink-0" style={{ color: GOLD }} />
                          )}
                          <span className="text-sm">{jf.libelle}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            jf.type_jour === "fixe"
                              ? "border-blue-300 bg-blue-50 text-blue-700"
                              : "border-amber-300 bg-amber-50 text-amber-700"
                          }
                        >
                          {jf.type_jour === "fixe" ? "Fixe" : "Variable"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(jf.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ color: NAVY }}>Ajouter un jour férié</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Libellé</Label>
              <Input
                placeholder="Ex: Divali, Eid ul-Fitr..."
                value={newLibelle}
                onChange={e => setNewLibelle(e.target.value)}
              />
              {/* Quick suggestions for variable holidays */}
              <div className="flex flex-wrap gap-1">
                {VARIABLE_SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setNewLibelle(s)
                      setNewType("variable")
                    }}
                    className="text-xs px-2 py-0.5 rounded-full border border-gray-200 hover:border-amber-400 hover:bg-amber-50 text-gray-600 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixe">
                    <span className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5" /> Fixe
                    </span>
                  </SelectItem>
                  <SelectItem value="variable">
                    <span className="flex items-center gap-2">
                      <Star className="w-3.5 h-3.5" /> Variable
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={handleAdd}
                disabled={saving || !newDate || !newLibelle}
                style={{ backgroundColor: NAVY }}
                className="text-white hover:opacity-90"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Ajouter
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
