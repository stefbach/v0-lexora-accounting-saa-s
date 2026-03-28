"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, RefreshCw, UserCheck, UserX, Clock, AlertTriangle, LogIn, LogOut } from "lucide-react"

interface Pointage {
  id: string
  employe_id: string
  heure_entree: string | null
  heure_sortie: string | null
  duree_minutes: number | null
  absent_justifie?: boolean
  motif_absence?: string
  employe?: { nom: string; prenom: string; poste?: string; photo_url?: string }
}

interface Employe { id: string; nom: string; prenom: string; poste?: string; societe_id: string }

function fmt_heure(h: string | null) { return h ? h.slice(0, 5) : "—" }
function duree_fmt(min: number | null) { if (!min) return "—"; return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` }

function getStatut(p: Pointage) {
  if (!p.heure_entree && !p.heure_sortie) return { label: "Absent", color: "bg-red-100 text-red-700" }
  if (p.absent_justifie) return { label: "Absent justifié", color: "bg-blue-100 text-blue-700" }
  if (p.heure_sortie) return { label: "Parti", color: "bg-gray-100 text-gray-600" }
  if (p.heure_entree) {
    const arrivee = parseInt(p.heure_entree.replace(":", ""), 10)
    if (arrivee > 900) return { label: "Retard", color: "bg-orange-100 text-orange-700" }
    return { label: "En poste", color: "bg-green-100 text-green-700" }
  }
  return { label: "—", color: "bg-gray-100 text-gray-500" }
}

function isAnormal(p: Pointage) {
  if (!p.duree_minutes) return false
  return p.duree_minutes > 660 || (p.duree_minutes < 120 && p.duree_minutes > 0)
}

export default function PointagePage() {
  const [pointages, setPointages] = useState<Pointage[]>([])
  const [employes, setEmployes] = useState<Employe[]>([])
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [loading, setLoading] = useState(true)

  // Pointage manuel
  const [selectedEmp, setSelectedEmp] = useState("")
  const [heureManuelle, setHeureManuelle] = useState("")
  const [doingPointage, setDoingPointage] = useState(false)

  // Dialog correction
  const [corrDialog, setCorrDialog] = useState<Pointage | null>(null)
  const [corrEntree, setCorrEntree] = useState("")
  const [corrSortie, setCorrSortie] = useState("")
  const [corrMotif, setCorrMotif] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ date })
      if (societe !== "all") params.set("societe_id", societe)
      const [ptRes, socRes] = await Promise.all([
        fetch(`/api/rh/pointage?${params}`),
        fetch("/api/comptable/societes")
      ])
      setPointages((await ptRes.json()).pointages || [])
      setSocietes((await socRes.json()).societes || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [societe, date])

  useEffect(() => { load() }, [load])
  // Auto-refresh toutes les 60s
  useEffect(() => {
    const iv = setInterval(load, 60000)
    return () => clearInterval(iv)
  }, [load])

  useEffect(() => {
    if (societe !== "all") {
      fetch(`/api/rh/employes?societe_id=${societe}`).then(r => r.json()).then(d => setEmployes(d.employes || []))
    }
  }, [societe])

  const presents = pointages.filter(p => p.heure_entree && !p.heure_sortie).length
  const partis = pointages.filter(p => p.heure_sortie).length
  const absents = pointages.filter(p => !p.heure_entree).length
  const retards = pointages.filter(p => p.heure_entree && parseInt(p.heure_entree.replace(":", ""), 10) > 900).length
  const anormaux = pointages.filter(isAnormal).length

  const doPointage = async (type: "entree" | "sortie") => {
    if (!selectedEmp) return alert("Sélectionnez un employé")
    setDoingPointage(true)
    try {
      const body: any = { employe_id: selectedEmp, type_pointage: type, methode: "manuel" }
      if (heureManuelle) body.heure_forcee = heureManuelle
      await fetch("/api/rh/pointage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      load()
      setSelectedEmp("")
      setHeureManuelle("")
    } catch (e) { console.error(e) } finally { setDoingPointage(false) }
  }

  const marquerAbsence = async (id: string, justifie: boolean) => {
    await fetch(`/api/rh/pointage/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ absent_justifie: justifie, motif_absence: justifie ? "Justifié par manager" : undefined })
    })
    load()
  }

  const openCorr = (p: Pointage) => {
    setCorrDialog(p)
    setCorrEntree(p.heure_entree?.slice(0, 5) || "")
    setCorrSortie(p.heure_sortie?.slice(0, 5) || "")
    setCorrMotif("")
  }

  const saveCorr = async () => {
    if (!corrDialog) return
    setSaving(true)
    try {
      await fetch(`/api/rh/pointage/${corrDialog.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heure_entree: corrEntree || null, heure_sortie: corrSortie || null, motif_correction: corrMotif })
      })
      setCorrDialog(null)
      load()
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Pointage — Aujourd'hui</h1>
          <p className="text-sm text-gray-500">Présences en temps réel (actualisation auto 60s)</p>
        </div>
        <div className="flex gap-2">
          <a href="/rh/pointage/mensuel"><Button variant="outline" size="sm">📅 Vue mensuelle</Button></a>
          <Button onClick={load} variant="outline" size="sm"><RefreshCw className="w-4 h-4 mr-2" />Actualiser</Button>
        </div>
      </div>

      {/* Résumé cartes */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Présents", value: presents, icon: UserCheck, color: "text-green-600 bg-green-50" },
          { label: "Partis", value: partis, icon: LogOut, color: "text-gray-500 bg-gray-50" },
          { label: "Absents", value: absents, icon: UserX, color: "text-red-600 bg-red-50" },
          { label: "Retardataires", value: retards, icon: Clock, color: "text-orange-600 bg-orange-50" },
          { label: "Pointages anormaux", value: anormaux, icon: AlertTriangle, color: "text-yellow-600 bg-yellow-50" },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className={`p-4 flex items-center gap-3 rounded-lg ${k.color.split(" ")[1]}`}>
              <k.icon className={`w-7 h-7 ${k.color.split(" ")[0]}`} />
              <div>
                <p className="text-xs text-gray-500">{k.label}</p>
                <p className={`text-2xl font-bold ${k.color.split(" ")[0]}`}>{loading ? "…" : k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="p-4 flex gap-3">
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-40" />
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Toutes sociétés" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Tableau présences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#1E2A4A] flex items-center gap-2">
            Présences du {new Date(date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : pointages.length === 0 ? (
            <div className="text-center py-12 text-gray-500">Aucun pointage pour cette date</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employé</TableHead>
                  <TableHead>Poste</TableHead>
                  <TableHead>Arrivée</TableHead>
                  <TableHead>Départ</TableHead>
                  <TableHead>Durée</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pointages.map(p => {
                  const statut = getStatut(p)
                  const anormal = isAnormal(p)
                  return (
                    <TableRow key={p.id} className={anormal ? "bg-orange-50" : ""}>
                      <TableCell className="font-medium">
                        {p.employe?.prenom} {p.employe?.nom}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">{p.employe?.poste || "—"}</TableCell>
                      <TableCell className="font-mono text-sm text-green-700">
                        {fmt_heure(p.heure_entree)}
                        {p.heure_entree && parseInt(p.heure_entree.replace(":", ""), 10) > 900 && (
                          <span className="ml-1 text-xs text-orange-600">⚠ Retard</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-red-600">{fmt_heure(p.heure_sortie)}</TableCell>
                      <TableCell className="text-sm">
                        {anormal ? (
                          <span className="text-orange-600 font-medium">{duree_fmt(p.duree_minutes)} ⚠</span>
                        ) : duree_fmt(p.duree_minutes)}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statut.color}`}>
                          {statut.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {!p.heure_entree && (
                            <>
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => marquerAbsence(p.id, true)}>✅ Justifié</Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => marquerAbsence(p.id, false)}>🤒 SL</Button>
                            </>
                          )}
                          {p.heure_entree && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openCorr(p)}>✏️ Corriger</Button>
                          )}
                          {anormal && (
                            <Button size="sm" variant="outline" className="h-7 text-xs border-orange-300 text-orange-700" onClick={() => openCorr(p)}>Valider</Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pointage manuel rapide */}
      {societe !== "all" && (
        <Card>
          <CardHeader><CardTitle className="text-[#1E2A4A] text-base">⚡ Pointage manuel rapide</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Label className="text-xs text-gray-500 mb-1 block">Employé</Label>
                <Select value={selectedEmp} onValueChange={setSelectedEmp}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner un employé..." /></SelectTrigger>
                  <SelectContent>
                    {employes.map(e => <SelectItem key={e.id} value={e.id}>{e.prenom} {e.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Heure (optionnel)</Label>
                <Input type="time" value={heureManuelle} onChange={e => setHeureManuelle(e.target.value)} className="w-32" />
              </div>
              <Button onClick={() => doPointage("entree")} disabled={doingPointage || !selectedEmp} className="bg-green-600 hover:bg-green-700 text-white">
                <LogIn className="w-4 h-4 mr-2" />Entrée
              </Button>
              <Button onClick={() => doPointage("sortie")} disabled={doingPointage || !selectedEmp} className="bg-red-600 hover:bg-red-700 text-white">
                <LogOut className="w-4 h-4 mr-2" />Sortie
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog correction */}
      <Dialog open={!!corrDialog} onOpenChange={open => !open && setCorrDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Corriger le pointage — {corrDialog?.employe?.prenom} {corrDialog?.employe?.nom}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Heure d'entrée</Label>
                <Input type="time" value={corrEntree} onChange={e => setCorrEntree(e.target.value)} />
              </div>
              <div>
                <Label>Heure de sortie</Label>
                <Input type="time" value={corrSortie} onChange={e => setCorrSortie(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Motif de correction *</Label>
              <Input value={corrMotif} onChange={e => setCorrMotif(e.target.value)} placeholder="Ex: Erreur saisie, retour tardif..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrDialog(null)}>Annuler</Button>
            <Button onClick={saveCorr} disabled={saving || !corrMotif} className="bg-[#1E2A4A] text-white">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Sauvegarder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
