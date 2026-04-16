"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Plus, Trash2, Users, UserPlus, X, Check, ChevronRight, Pencil, Crown } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

export default function GroupesPage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [groupes, setGroupes] = useState<any[]>([])
  const [allEmployes, setAllEmployes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // New group inline
  const [newGroupName, setNewGroupName] = useState("")
  const [addingGroup, setAddingGroup] = useState(false)

  // Assign mode
  const [assignGroupId, setAssignGroupId] = useState<string | null>(null)

  // Rename mode
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState("")
  const [renamingSaving, setRenamingSaving] = useState(false)

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
    setError("")
    try {
      const [gRes, eRes] = await Promise.all([
        fetch(`/api/rh/groupes?societe_id=${societe}`).then(r => r.json()),
        fetch(`/api/rh/employes?societe_id=${societe}`).then(r => r.json()).catch(() => ({ employes: [] })),
      ])
      if (gRes.error) {
        setError(gRes.error)
        setGroupes([])
      } else {
        setGroupes(gRes.groupes || [])
      }
      setAllEmployes((eRes.employes || []).sort((a: any, b: any) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`)))
    } catch (e: any) {
      setError(e.message || "Erreur chargement")
    }
    setLoading(false)
  }, [societe])

  useEffect(() => { load() }, [load])

  // Employés assignés à un groupe
  const assignedEmpIds = new Set(groupes.flatMap((g: any) => (g.membres || []).map((m: any) => m.employe_id)))
  const sansGroupe = allEmployes.filter(e => !assignedEmpIds.has(e.id))

  // Créer un groupe
  const createGroup = async () => {
    if (!newGroupName.trim() || !societe) return
    setAddingGroup(true)
    const res = await fetch("/api/rh/groupes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "creer", societe_id: societe, nom: newGroupName.trim() }),
    })
    const data = await res.json()
    if (data.error) setError(data.error)
    else { setNewGroupName(""); load() }
    setAddingGroup(false)
  }

  // Renommer un groupe
  const renameGroup = async (id: string) => {
    if (!editingGroupName.trim()) return
    setRenamingSaving(true)
    const res = await fetch("/api/rh/groupes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "modifier", id, nom: editingGroupName.trim() }),
    })
    const data = await res.json()
    if (data.error) setError(data.error)
    else { setEditingGroupId(null); setEditingGroupName(""); load() }
    setRenamingSaving(false)
  }

  // Supprimer un groupe
  const deleteGroup = async (id: string) => {
    if (!confirm("Supprimer ce groupe et retirer tous ses membres ?")) return
    await fetch("/api/rh/groupes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "supprimer", id }),
    })
    load()
  }

  // Assigner un manager à un groupe
  const assignManager = async (groupeId: string, managerId: string) => {
    setSaving(true)
    const res = await fetch("/api/rh/groupes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "modifier", id: groupeId, manager_id: managerId || null }),
    })
    const data = await res.json()
    if (data.error) setError(data.error)
    else await load()
    setSaving(false)
  }

  // Affecter/retirer un employé
  const toggleEmployee = async (groupeId: string, employeId: string, currentlyIn: boolean) => {
    setSaving(true)
    if (currentlyIn) {
      await fetch("/api/rh/groupes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retirer", groupe_id: groupeId, employe_id: employeId }),
      })
    } else {
      // Ajouter — on récupère les membres actuels + le nouveau
      const groupe = groupes.find(g => g.id === groupeId)
      const currentIds = (groupe?.membres || []).map((m: any) => m.employe_id)
      await fetch("/api/rh/groupes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "affecter", groupe_id: groupeId, employe_ids: [...currentIds, employeId] }),
      })
    }
    await load()
    setSaving(false)
  }

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Groupes</h1>
          <p className="text-gray-500 text-sm">Créez des groupes et affectez les employés</p>
        </div>
        <Select value={societe} onValueChange={setSociete}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Société" /></SelectTrigger>
          <SelectContent>
            {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
          <p className="text-xs mt-1 text-red-500">
            Si l'erreur mentionne "relation does not exist", exécutez la migration SQL pour créer la table groupes_employes.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-4">
          {/* Créer un groupe — inline simple */}
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Nom du nouveau groupe (ex: Agents, Cadres, Direction...)"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && createGroup()}
                  className="flex-1"
                />
                <Button onClick={createGroup} disabled={!newGroupName.trim() || addingGroup}
                  style={{ backgroundColor: NAVY }} className="text-white">
                  {addingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                  Créer
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Liste des groupes */}
          {groupes.map(g => {
            const isAssigning = assignGroupId === g.id
            const membres = g.membres || []
            const membreIds = new Set(membres.map((m: any) => m.employe_id))

            return (
              <Card key={g.id} className="border-l-4" style={{ borderLeftColor: g.couleur || NAVY }}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
                      <Users className="h-4 w-4" />
                      {editingGroupId === g.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editingGroupName}
                            onChange={e => setEditingGroupName(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") renameGroup(g.id); if (e.key === "Escape") { setEditingGroupId(null); setEditingGroupName("") } }}
                            className="h-7 text-sm w-48"
                            autoFocus
                            disabled={renamingSaving}
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-800" onClick={() => renameGroup(g.id)} disabled={renamingSaving || !editingGroupName.trim()}>
                            {renamingSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-600" onClick={() => { setEditingGroupId(null); setEditingGroupName("") }}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          {g.nom}
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-gray-600" onClick={() => { setEditingGroupId(g.id); setEditingGroupName(g.nom) }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      <Badge variant="outline" className="text-xs">{membres.length} membre{membres.length !== 1 ? "s" : ""}</Badge>
                      {g.manager_nom && (
                        <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                          <Crown className="h-3 w-3 mr-1" />
                          {g.manager_nom}
                        </Badge>
                      )}
                    </CardTitle>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => setAssignGroupId(isAssigning ? null : g.id)}>
                        <UserPlus className="h-4 w-4 mr-1" />
                        {isAssigning ? "Fermer" : "Gérer"}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => deleteGroup(g.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Manager du groupe */}
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-gray-500 whitespace-nowrap flex items-center gap-1">
                      <Crown className="h-3 w-3" /> Manager :
                    </Label>
                    <Select
                      value={g.manager_id || "none"}
                      onValueChange={(val) => assignManager(g.id, val === "none" ? "" : val)}
                    >
                      <SelectTrigger className="h-8 text-xs w-[220px]">
                        <SelectValue placeholder="Aucun manager" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Aucun manager</SelectItem>
                        {allEmployes.map(emp => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.prenom} {emp.nom}{emp.poste ? ` (${emp.poste})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Membres actuels */}
                  {membres.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {membres.map((m: any) => (
                        <div key={m.employe_id} className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-sm">
                          <span>{m.prenom} {m.nom}</span>
                          {isAssigning && (
                            <button onClick={() => toggleEmployee(g.id, m.employe_id, true)}
                              className="text-red-400 hover:text-red-600 ml-1" disabled={saving}>
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">Aucun membre — cliquez "Gérer" pour ajouter</p>
                  )}

                  {/* Mode affectation — liste des employés non assignés à ce groupe */}
                  {isAssigning && (
                    <div className="border-t pt-3 mt-3">
                      <p className="text-xs font-medium text-gray-500 mb-2">Cliquez pour ajouter au groupe :</p>
                      <div className="flex flex-wrap gap-1">
                        {allEmployes.filter(e => !membreIds.has(e.id)).map(emp => (
                          <button key={emp.id}
                            onClick={() => toggleEmployee(g.id, emp.id, false)}
                            disabled={saving}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded-full border border-dashed border-gray-300 hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
                            <Plus className="h-3 w-3 text-emerald-500" />
                            {emp.prenom} {emp.nom}
                            {emp.poste && <span className="text-gray-400">({emp.poste})</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}

          {/* Employés sans groupe */}
          {sansGroupe.length > 0 && groupes.length > 0 && (
            <Card className="border-dashed border-orange-300">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-orange-600">
                  Sans groupe ({sansGroupe.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {sansGroupe.map(e => (
                    <span key={e.id} className="px-2 py-1 text-xs rounded-full bg-orange-50 border border-orange-200 text-orange-700">
                      {e.prenom} {e.nom}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {groupes.length === 0 && !loading && (
            <div className="text-center py-12 text-gray-400">
              <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Aucun groupe créé</p>
              <p className="text-sm mt-1">Tapez un nom ci-dessus et cliquez "Créer"</p>
            </div>
          )}
        </div>
      )}
    </div>
    </ClientPageShell>
  )
}
