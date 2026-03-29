"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Plus, CheckCircle, XCircle, AlertTriangle } from "lucide-react"

const TYPE_LABELS: Record<string, string> = {
  AL: "Congé annuel", SL: "Congé maladie", UL: "Sans solde",
  MAT: "Maternité (14 sem.)", PAT: "Paternité (5j)", CAR: "Soins famille",
  WI: "Accident travail", COM: "Décès proche", PH: "Jour férié travaillé", ABS: "Absence"
}
const TYPE_COLORS: Record<string, string> = {
  AL: "bg-blue-100 text-blue-800", SL: "bg-orange-100 text-orange-800",
  MAT: "bg-pink-100 text-pink-800", PAT: "bg-indigo-100 text-indigo-800",
  UL: "bg-yellow-100 text-yellow-800", CAR: "bg-purple-100 text-purple-800", ABS: "bg-red-100 text-red-800"
}
const STATUT_COLORS: Record<string, string> = {
  en_attente: "bg-yellow-100 text-yellow-800", approuve: "bg-green-100 text-green-800",
  refuse: "bg-red-100 text-red-800", annule: "bg-gray-100 text-gray-600"
}

type View = "attente" | "planning" | "non_planifiees"

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

export default function CongesPage() {
  const [view, setView] = useState<View>("attente")
  const [conges, setConges] = useState<any[]>([])
  const [employes, setEmployes] = useState<any[]>([])
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ employe_id: "", type_conge: "AL", date_debut: "", date_fin: "", motif: "" })
  const [error, setError] = useState<string | null>(null)
  const [refusDialog, setRefusDialog] = useState<string | null>(null)
  const [refusMotif, setRefusMotif] = useState("")

  // Planning
  const now = new Date()
  const [planMois, setPlanMois] = useState(now.getMonth())
  const [planAnnee, setPlanAnnee] = useState(now.getFullYear())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (societe !== "all") params.set("societe_id", societe)
      const [congesRes, socRes] = await Promise.all([
        fetch(`/api/rh/conges?${params}`),
        fetch("/api/comptable/societes")
      ])
      setConges((await congesRes.json()).conges || [])
      setSocietes((await socRes.json()).societes || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [societe])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (societe !== "all") {
      fetch(`/api/rh/employes?societe_id=${societe}`).then(r => r.json()).then(d => setEmployes(d.employes || []))
    }
  }, [societe])

  const handleCreate = async () => {
    if (!form.employe_id || !form.date_debut || !form.date_fin) { setError("Champs requis manquants"); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch("/api/rh/conges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setDialogOpen(false); load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur") }
    finally { setSaving(false) }
  }

  const approuver = async (id: string) => {
    await fetch(`/api/rh/conges/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approuver" }) })
    load()
  }

  const refuser = async () => {
    if (!refusDialog) return
    if (!refusMotif.trim()) return
    await fetch(`/api/rh/conges/${refusDialog}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refuser", motif_refus: refusMotif })
    })
    setRefusDialog(null); setRefusMotif(""); load()
  }

  const justifierAbsence = async (empId: string) => {
    const today = new Date().toISOString().split("T")[0]
    await fetch("/api/rh/conges", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employe_id: empId, type_conge: "SL", date_debut: today, date_fin: today, motif: "Absence justifiée rétroactivement" })
    })
    load()
  }

  const congesEnAttente = conges.filter(c => c.statut === "en_attente")
  const congesApprouves = conges.filter(c => c.statut === "approuve")

  // Non planifiées : absents aujourd'hui sans demande
  const today = new Date().toISOString().split("T")[0]
  const congesAujourdhui = conges.filter(c => c.statut === "approuve" && c.date_debut <= today && c.date_fin >= today)
  const empIdsEnConge = new Set(congesAujourdhui.map(c => c.employe_id))
  const absentsNonPlanifies = employes.filter(e => !empIdsEnConge.has(e.id))

  // Planning : construire grille
  const nbJours = getDaysInMonth(planAnnee, planMois)
  const daysArr = Array.from({ length: nbJours }, (_, i) => {
    const d = new Date(planAnnee, planMois, i + 1)
    return d.toISOString().split("T")[0]
  })
  const MOIS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Absences & Congés</h1>
          <p className="text-sm text-gray-500">{congesEnAttente.length} demande(s) en attente</p>
        </div>
        <div className="flex gap-2">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Toutes sociétés" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <Button onClick={() => setDialogOpen(true)} className="bg-[#1E2A4A] text-white">
              <Plus className="w-4 h-4 mr-2" />Nouvelle demande
            </Button>
            <DialogContent>
              <DialogHeader><DialogTitle>Demande de congé / absence</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2">
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div><Label>Employé *</Label>
                  <Select value={form.employe_id} onValueChange={v => setForm(f => ({ ...f, employe_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>{employes.map(e => <SelectItem key={e.id} value={e.id}>{e.prenom} {e.nom}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label>Type *</Label>
                  <Select value={form.type_conge} onValueChange={v => setForm(f => ({ ...f, type_conge: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Début *</Label><Input type="date" value={form.date_debut} onChange={e => setForm(f => ({ ...f, date_debut: e.target.value }))} /></div>
                  <div><Label>Fin *</Label><Input type="date" value={form.date_fin} onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))} /></div>
                </div>
                <div><Label>Motif</Label><Input value={form.motif} onChange={e => setForm(f => ({ ...f, motif: e.target.value }))} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
                <Button onClick={handleCreate} disabled={saving} className="bg-[#1E2A4A] text-white">
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Soumettre
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Onglets vues */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: "attente" as View, label: `Demandes en attente (${congesEnAttente.length})` },
          { id: "planning" as View, label: "Planning congés" },
          { id: "non_planifiees" as View, label: "Absences non planifiées" },
        ] as { id: View; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setView(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${view === t.id ? "border-[#1E2A4A] text-[#1E2A4A]" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* VUE 1 — Demandes en attente */}
      {view === "attente" && (
        <Card>
          <CardHeader><CardTitle className="text-[#1E2A4A]">Demandes en attente de validation</CardTitle></CardHeader>
          <CardContent className="p-0">
            {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
              : congesEnAttente.length === 0 ? <div className="text-center py-12 text-gray-500">Aucune demande en attente ✅</div>
              : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Employé</TableHead><TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead><TableHead>Nb jours</TableHead>
                    <TableHead>Motif</TableHead><TableHead>Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {congesEnAttente.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.employe?.prenom} {c.employe?.nom}</TableCell>
                        <TableCell><span className={`px-2 py-1 rounded-full text-xs font-medium ${TYPE_COLORS[c.type_conge] || ""}`}>{TYPE_LABELS[c.type_conge] || c.type_conge}</span></TableCell>
                        <TableCell className="text-sm">{new Date(c.date_debut).toLocaleDateString("fr-FR")} → {new Date(c.date_fin).toLocaleDateString("fr-FR")}</TableCell>
                        <TableCell><span className="font-semibold">{c.nb_jours}j</span></TableCell>
                        <TableCell className="text-sm text-gray-500 max-w-40 truncate">{c.motif || "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="text-green-600 h-8" onClick={() => approuver(c.id)}>
                              <CheckCircle className="w-4 h-4 mr-1" />Approuver
                            </Button>
                            <Button size="sm" variant="ghost" className="text-red-600 h-8" onClick={() => { setRefusDialog(c.id); setRefusMotif("") }}>
                              <XCircle className="w-4 h-4 mr-1" />Refuser
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
          </CardContent>
        </Card>
      )}

      {/* VUE 2 — Planning */}
      {view === "planning" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-[#1E2A4A]">Planning congés — {MOIS_FR[planMois]} {planAnnee}</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { if (planMois === 0) { setPlanMois(11); setPlanAnnee(y => y - 1) } else setPlanMois(m => m - 1) }}>←</Button>
                <Button size="sm" variant="outline" onClick={() => { if (planMois === 11) { setPlanMois(0); setPlanAnnee(y => y + 1) } else setPlanMois(m => m + 1) }}>→</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {employes.length === 0 ? (
              <p className="text-gray-500 text-sm">Sélectionnez une société pour voir le planning</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse w-full">
                  <thead>
                    <tr>
                      <th className="text-left p-2 border-b w-32 sticky left-0 bg-white">Employé</th>
                      {daysArr.map(d => {
                        const day = new Date(d + "T12:00:00")
                        const isWE = day.getDay() === 0 || day.getDay() === 6
                        return (
                          <th key={d} className={`p-1 border text-center w-7 ${isWE ? "bg-gray-100 text-gray-400" : ""}`}>
                            <div>{day.getDate()}</div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {employes.map(emp => {
                      const empConges = congesApprouves.filter(c => c.employe_id === emp.id)
                      const absentsCount: Record<string, number> = {}
                      return (
                        <tr key={emp.id} className="border-b hover:bg-gray-50">
                          <td className="p-2 font-medium sticky left-0 bg-white border-r">{emp.prenom} {emp.nom}</td>
                          {daysArr.map(d => {
                            const day = new Date(d + "T12:00:00")
                            const isWE = day.getDay() === 0 || day.getDay() === 6
                            const conge = empConges.find(c => d >= c.date_debut && d <= c.date_fin)
                            if (conge && !isWE) {
                              absentsCount[d] = (absentsCount[d] || 0) + 1
                            }
                            return (
                              <td key={d} className={`border text-center p-0.5 ${isWE ? "bg-gray-50" : ""}`}>
                                {conge && !isWE && (
                                  <div className={`w-5 h-5 rounded text-white text-xs flex items-center justify-center mx-auto ${TYPE_COLORS[conge.type_conge]?.replace("bg-", "bg-").replace("text-", "text-") || "bg-blue-400"}`} title={`${TYPE_LABELS[conge.type_conge]} — ${emp.prenom}`}>
                                    {conge.type_conge.slice(0, 1)}
                                  </div>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="mt-3 flex gap-4 flex-wrap text-xs">
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1">
                      <div className={`w-4 h-4 rounded text-white text-xs flex items-center justify-center ${TYPE_COLORS[k]?.split(" ")[0] || "bg-gray-200"}`}>{k.slice(0, 1)}</div>
                      <span className="text-gray-600">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* VUE 3 — Absences non planifiées */}
      {view === "non_planifiees" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-[#1E2A4A] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              Absences non planifiées — aujourd'hui ({new Date().toLocaleDateString("fr-FR")})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {societe === "all" ? (
              <p className="text-gray-500 text-sm">Sélectionnez une société pour voir les absences du jour</p>
            ) : employes.length === 0 ? (
              <p className="text-gray-500 text-sm">Aucun employé dans cette société</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">{absentsNonPlanifies.length} employé(s) sans demande de congé pour aujourd'hui</p>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Employé</TableHead><TableHead>Poste</TableHead>
                    <TableHead>Statut</TableHead><TableHead>Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {absentsNonPlanifies.map(emp => (
                      <TableRow key={emp.id}>
                        <TableCell className="font-medium">{emp.prenom} {emp.nom}</TableCell>
                        <TableCell className="text-sm text-gray-500">{emp.poste || "—"}</TableCell>
                        <TableCell><span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">Absent non justifié</span></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => justifierAbsence(emp.id)}>
                              🤒 Créer SL rétroactif
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300">
                              ⚠️ Absence injustifiée
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {absentsNonPlanifies.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-gray-500">Tous les employés sont présents ou en congé approuvé ✅</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog refus avec motif */}
      <Dialog open={!!refusDialog} onOpenChange={open => !open && setRefusDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Refuser la demande</DialogTitle></DialogHeader>
          <div className="py-2">
            <Label>Motif de refus *</Label>
            <Textarea value={refusMotif} onChange={e => setRefusMotif(e.target.value)} placeholder="Ex: Pas assez d'effectif ce jour, période bloquée..." className="mt-1" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefusDialog(null)}>Annuler</Button>
            <Button onClick={refuser} disabled={!refusMotif.trim()} className="bg-red-600 text-white">
              <XCircle className="w-4 h-4 mr-2" />Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
