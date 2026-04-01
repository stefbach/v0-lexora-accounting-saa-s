"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Users, Building2, Shield, Check, X, Pencil } from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

const ROLES = [
  { value: "client_admin", label: "Administrateur", desc: "Accès complet à toutes les sociétés et modules", color: "bg-green-100 text-green-800" },
  { value: "client_user", label: "Utilisateur", desc: "Accès aux modules autorisés", color: "bg-blue-100 text-blue-800" },
  { value: "client_assistant", label: "Assistant Direction", desc: "Numérisation de documents uniquement", color: "bg-cyan-100 text-cyan-800" },
  { value: "rh", label: "RH", desc: "Module RH complet (paie, congés, pointage)", color: "bg-orange-100 text-orange-800" },
  { value: "rh_manager", label: "RH Manager", desc: "RH + supervision", color: "bg-orange-100 text-orange-800" },
  { value: "manager", label: "Manager", desc: "Planning, pointage, congés de son équipe", color: "bg-teal-100 text-teal-800" },
  { value: "comptable", label: "Comptable", desc: "Comptabilité, bilan, grand livre", color: "bg-blue-100 text-blue-800" },
  { value: "employe", label: "Employé", desc: "Portail salarié (bulletins, congés)", color: "bg-gray-100 text-gray-700" },
]

export default function GestionAccesPage() {
  const [users, setUsers] = useState<any[]>([])
  const [societes, setSocietes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editUser, setEditUser] = useState<any>(null)
  const [editRole, setEditRole] = useState("")
  const [editSocietes, setEditSocietes] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [uRes, sRes] = await Promise.all([
        fetch("/api/admin/users").then(r => r.json()),
        fetch("/api/comptable/societes").then(r => r.json()),
      ])
      setUsers(uRes.users || [])
      setSocietes(sRes.societes || [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openEdit = async (user: any) => {
    setEditUser(user)
    setEditRole(user.role)
    // Load user's sociétés
    try {
      const res = await fetch(`/api/admin/users?user_id=${user.id}&action=societes`)
      const data = await res.json()
      setEditSocietes(new Set(data.societe_ids || []))
    } catch {
      setEditSocietes(new Set(user.societe_id ? [user.societe_id] : []))
    }
  }

  const handleSave = async () => {
    if (!editUser) return
    setSaving(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: editUser.id,
          role: editRole,
          societe_id: [...editSocietes][0] || null,
          societe_ids: [...editSocietes],
        }),
      })
      const data = await res.json()
      if (data.error) alert("Erreur: " + data.error)
      else { setEditUser(null); load() }
    } catch { alert("Erreur réseau") }
    setSaving(false)
  }

  const getRoleMeta = (role: string) => ROLES.find(r => r.value === role) || { value: role, label: role, desc: "", color: "bg-gray-100 text-gray-600" }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Gestion des accès</h1>
        <p className="text-gray-500 text-sm">Définissez les rôles et les sociétés accessibles pour chaque utilisateur</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {users.map(user => {
            const role = getRoleMeta(user.role)
            return (
              <Card key={user.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm" style={{ backgroundColor: NAVY }}>
                        {(user.full_name || user.email || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{user.full_name || user.email}</p>
                        <p className="text-xs text-gray-400">{user.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Rôle */}
                      <Badge className={`${role.color} text-xs`}>
                        <Shield className="h-3 w-3 mr-1" />{role.label}
                      </Badge>

                      {/* Sociétés */}
                      <div className="flex gap-1">
                        {user.societe_nom ? (
                          <Badge variant="outline" className="text-xs">
                            <Building2 className="h-3 w-3 mr-1" />{user.societe_nom}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-gray-400">Aucune société</Badge>
                        )}
                      </div>

                      {/* Modifier */}
                      <Button variant="outline" size="sm" onClick={() => openEdit(user)}>
                        <Pencil className="h-3 w-3 mr-1" /> Modifier
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Dialog modification rôle + sociétés */}
      <Dialog open={!!editUser} onOpenChange={v => { if (!v) setEditUser(null) }}>
        <DialogContent className="max-w-md" onOpenAutoFocus={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle style={{ color: NAVY }}>Modifier l'accès — {editUser?.full_name}</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium">{editUser.full_name}</p>
                <p className="text-xs text-gray-500">{editUser.email}</p>
              </div>

              {/* Rôle */}
              <div>
                <p className="text-sm font-medium mb-2">Rôle</p>
                <div className="space-y-1">
                  {ROLES.map(r => (
                    <button key={r.value} onClick={() => setEditRole(r.value)}
                      className={`w-full text-left p-2 rounded-lg border transition-colors ${editRole === r.value ? "border-[#C9A84C] bg-[#C9A84C]/10" : "border-gray-200 hover:bg-gray-50"}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{r.label}</p>
                          <p className="text-xs text-gray-500">{r.desc}</p>
                        </div>
                        {editRole === r.value && <Check className="h-4 w-4" style={{ color: GOLD }} />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sociétés */}
              <div>
                <p className="text-sm font-medium mb-2">Sociétés accessibles</p>
                <div className="space-y-1">
                  {societes.map(s => {
                    const checked = editSocietes.has(s.id)
                    return (
                      <label key={s.id} className="flex items-center gap-3 p-2 rounded-lg border hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={checked}
                          onChange={() => {
                            const next = new Set(editSocietes)
                            checked ? next.delete(s.id) : next.add(s.id)
                            setEditSocietes(next)
                          }}
                          className="rounded border-gray-300" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{s.nom}</p>
                          {s.brn && <p className="text-xs text-gray-400">BRN: {s.brn}</p>}
                        </div>
                        {checked && <Check className="h-4 w-4 text-emerald-500" />}
                      </label>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-1">{editSocietes.size} société(s) sélectionnée(s)</p>
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full text-white" style={{ backgroundColor: NAVY }}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                Enregistrer
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
