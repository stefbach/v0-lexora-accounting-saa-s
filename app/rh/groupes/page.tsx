"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Users, Plus, Pencil, Trash2, UserPlus, Loader2, CalendarDays, Clock, Search } from "lucide-react"

const COULEURS = ["#1E2A4A", "#C9A84C", "#059669", "#DC2626", "#7C3AED", "#EA580C", "#0891B2", "#DB2777"]

export default function GroupesPage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [groupes, setGroupes] = useState<any[]>([])
  const [allEmployes, setAllEmployes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [createOpen, setCreateOpen] = useState(false)
  const [editGroup, setEditGroup] = useState<any>(null)
  const [assignOpen, setAssignOpen] = useState<any>(null)
  const [search, setSearch] = useState("")

  const [form, setForm] = useState({ nom: "", code: "", description: "", couleur: "#1E2A4A", inclus_planning: true, inclus_pointage: true })

  useEffect(() => {
    Promise.all([
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
      setSocietes(unique)
      if (unique.length >= 1) setSociete(unique[0].id)
    })
  }, [])

  const load = useCallback(async () => {
    if (!societe) return
    setLoading(true)
    try {
      const [gRes, eRes] = await Promise.all([
        fetch(`/api/rh/groupes?societe_id=${societe}`).then(r => r.json()).catch(() => ({ groupes: [] })),
        fetch(`/api/rh/employes?societe_id=${societe}`).then(r => r.json()).catch(() => ({ employes: [] })),
      ])
      setGroupes(gRes.groupes || [])
      setAllEmployes((eRes.employes || []).sort((a: any, b: any) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`)))
    } catch {}
    setLoading(false)
  }, [societe])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    const res = await fetch("/api/rh/groupes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "creer", societe_id: societe, ...form }),
    })
    const data = await res.json()
    if (data.error) { alert(data.error); return }
    setCreateOpen(false)
    setForm({ nom: "", code: "", description: "", couleur: "#1E2A4A", inclus_planning: true, inclus_pointage: true })
    load()
  }

  const handleEdit = async () => {
    if (!editGroup) return
    const res = await fetch("/api/rh/groupes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "modifier", id: editGroup.id, ...form }),
    })
    const data = await res.json()
    if (data.error) { alert(data.error); return }
    setEditGroup(null)
    load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce groupe ?")) return
    await fetch("/api/rh/groupes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "supprimer", id }),
    })
    load()
  }

  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set())

  const openAssign = (groupe: any) => {
    setAssignOpen(groupe)
    setSelectedEmpIds(new Set((groupe.membres || []).map((m: any) => m.employe_id)))
    setSearch("")
  }

  const handleAssign = async () => {
    if (!assignOpen) return
    await fetch("/api/rh/groupes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "affecter", groupe_id: assignOpen.id, employe_ids: [...selectedEmpIds] }),
    })
    setAssignOpen(null)
    load()
  }

  // Employés sans groupe
  const assignedEmpIds = new Set(groupes.flatMap(g => (g.membres || []).map((m: any) => m.employe_id)))
  const sansGroupe = allEmployes.filter(e => !assignedEmpIds.has(e.id))

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Groupes d'employés</h1>
          <p className="text-gray-500 text-sm">Organisez vos équipes pour le planning, pointage et la paie</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Société" /></SelectTrigger>
            <SelectContent>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => { setForm({ nom: "", code: "", description: "", couleur: "#1E2A4A", inclus_planning: true, inclus_pointage: true }); setCreateOpen(true) }}
            style={{ backgroundColor: "#1E2A4A" }} className="text-white">
            <Plus className="h-4 w-4 mr-1" /> Nouveau groupe
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : (
        <>
          {/* Groupes */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groupes.map(g => (
              <Card key={g.id} className="border-l-4" style={{ borderLeftColor: g.couleur || "#1E2A4A" }}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4" style={{ color: g.couleur }} />
                      {g.nom}
                      {g.code && <Badge variant="outline" className="text-[10px]">{g.code}</Badge>}
                    </CardTitle>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditGroup(g); setForm({ nom: g.nom, code: g.code || "", description: g.description || "", couleur: g.couleur || "#1E2A4A", inclus_planning: g.inclus_planning !== false, inclus_pointage: g.inclus_pointage !== false }) }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDelete(g.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {g.description && <p className="text-xs text-gray-500">{g.description}</p>}
                  <div className="flex gap-2">
                    {g.inclus_planning && <Badge className="text-[10px] bg-blue-100 text-blue-700"><CalendarDays className="h-3 w-3 mr-0.5" /> Planning</Badge>}
                    {g.inclus_pointage && <Badge className="text-[10px] bg-green-100 text-green-700"><Clock className="h-3 w-3 mr-0.5" /> Pointage</Badge>}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-500">{g.nb_membres} membre{g.nb_membres !== 1 ? 's' : ''}</p>
                    <div className="flex flex-wrap gap-1">
                      {(g.membres || []).slice(0, 8).map((m: any) => (
                        <span key={m.employe_id} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100">{m.prenom} {m.nom}</span>
                      ))}
                      {g.nb_membres > 8 && <span className="text-[10px] text-gray-400">+{g.nb_membres - 8}</span>}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => openAssign(g)}>
                    <UserPlus className="h-4 w-4 mr-1" /> Gérer les membres
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Employés sans groupe */}
          {sansGroupe.length > 0 && (
            <Card className="border-dashed border-orange-300 bg-orange-50/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-orange-700">Sans groupe ({sansGroupe.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {sansGroupe.map(e => (
                    <span key={e.id} className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-800">{e.prenom} {e.nom} {e.poste ? `(${e.poste})` : ""}</span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Dialog création/édition */}
      <Dialog open={createOpen || !!editGroup} onOpenChange={v => { if (!v) { setCreateOpen(false); setEditGroup(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle style={{ color: "#1E2A4A" }}>{editGroup ? "Modifier le groupe" : "Nouveau groupe"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nom *</Label><Input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Ex: Agents" /></div>
              <div><Label>Code</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="Ex: AGT" maxLength={5} /></div>
            </div>
            <div><Label>Description</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex: Équipe des agents de terrain" /></div>
            <div>
              <Label>Couleur</Label>
              <div className="flex gap-2 mt-1">
                {COULEURS.map(c => (
                  <button key={c} className={`w-8 h-8 rounded-lg ${form.couleur === c ? "ring-2 ring-offset-2 ring-gray-600" : ""}`}
                    style={{ backgroundColor: c }} onClick={() => setForm(f => ({ ...f, couleur: c }))} />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-blue-600" /><Label className="text-sm">Inclure dans le planning</Label></div>
              <Switch checked={form.inclus_planning} onCheckedChange={v => setForm(f => ({ ...f, inclus_planning: v }))} />
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-green-600" /><Label className="text-sm">Inclure dans le pointage</Label></div>
              <Switch checked={form.inclus_pointage} onCheckedChange={v => setForm(f => ({ ...f, inclus_pointage: v }))} />
            </div>
            <Button className="w-full text-white" style={{ backgroundColor: "#1E2A4A" }} onClick={editGroup ? handleEdit : handleCreate} disabled={!form.nom}>
              {editGroup ? "Enregistrer" : "Créer le groupe"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog affectation membres */}
      <Dialog open={!!assignOpen} onOpenChange={v => { if (!v) setAssignOpen(null) }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: "#1E2A4A" }}>
              Membres — {assignOpen?.nom}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedEmpIds(new Set(allEmployes.map(e => e.id)))}>Tous</Button>
              <Button variant="outline" size="sm" onClick={() => setSelectedEmpIds(new Set())}>Aucun</Button>
            </div>
            <div className="border rounded-lg divide-y max-h-[50vh] overflow-y-auto">
              {allEmployes
                .filter(e => !search.trim() || `${e.nom} ${e.prenom} ${e.poste || ""}`.toLowerCase().includes(search.toLowerCase()))
                .map(emp => (
                  <label key={emp.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={selectedEmpIds.has(emp.id)}
                      onChange={() => setSelectedEmpIds(prev => {
                        const next = new Set(prev)
                        next.has(emp.id) ? next.delete(emp.id) : next.add(emp.id)
                        return next
                      })}
                      className="rounded border-gray-300" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{emp.prenom} {emp.nom}</p>
                      {emp.poste && <p className="text-[10px] text-gray-400">{emp.poste}</p>}
                    </div>
                  </label>
                ))}
            </div>
            <p className="text-xs text-gray-500">{selectedEmpIds.size} sélectionné(s)</p>
            <Button className="w-full text-white" style={{ backgroundColor: "#1E2A4A" }} onClick={handleAssign}>
              Appliquer ({selectedEmpIds.size} membres)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
