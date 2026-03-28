"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Loader2, Search, UserCog, Users, Shield, Edit2, CheckCircle } from "lucide-react"

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  direction: "bg-purple-100 text-purple-700",
  comptable: "bg-blue-100 text-blue-700",
  comptable_dedie: "bg-indigo-100 text-indigo-700",
  rh_manager: "bg-green-100 text-green-700",
  juridique: "bg-amber-100 text-amber-700",
  client_admin: "bg-orange-100 text-orange-700",
  client_user: "bg-gray-100 text-gray-700",
  salarie: "bg-teal-100 text-teal-700",
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [stats, setStats] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [filterRole, setFilterRole] = useState("")
  const [editUser, setEditUser] = useState<any>(null)
  const [editRole, setEditRole] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (filterRole) params.set('role', filterRole)
    const res = await fetch(`/api/admin/users?${params}`)
    const d = await res.json()
    setUsers(d.users || [])
    setRoles(d.roles || [])
    setStats(d.stats || {})
    setLoading(false)
  }, [q, filterRole])

  useEffect(() => { load() }, [load])

  const saveRole = async () => {
    if (!editUser || !editRole) return
    setSaving(true)
    await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: editUser.id, role: editRole }) })
    setSaving(false); setSaved(true)
    setTimeout(() => { setSaved(false); setEditUser(null); load() }, 1000)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-[#1E2A4A]">Gestion des utilisateurs</h1>
        <p className="text-sm text-gray-500">Niveaux d'accès et rôles</p></div>
      </div>

      {/* Stats par rôle */}
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
        {Object.entries(stats).map(([role, count]) => (
          <Card key={role} className="cursor-pointer hover:shadow" onClick={() => setFilterRole(filterRole === role ? '' : role)}>
            <CardContent className="p-3 text-center">
              <p className="text-lg font-bold text-[#1E2A4A]">{count}</p>
              <Badge className={`text-xs mt-1 ${ROLE_COLORS[role] || 'bg-gray-100 text-gray-700'}`}>{role}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
          <Input placeholder="Rechercher par nom ou email..." className="pl-9" value={q} onChange={e => setQ(e.target.value)}/>
        </div>
        <Select value={filterRole || "all"} onValueChange={v => setFilterRole(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Tous les rôles"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les rôles</SelectItem>
            {roles.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-[#1E2A4A]"/></div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Modules</TableHead>
                <TableHead>Depuis</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name || '—'}</TableCell>
                    <TableCell className="text-sm text-gray-500">{u.email}</TableCell>
                    <TableCell><Badge className={`text-xs ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-700'}`}><Shield className="w-3 h-3 mr-1"/>{u.role}</Badge></TableCell>
                    <TableCell className="text-xs text-gray-400">{(u.module_acces || []).join(', ') || '—'}</TableCell>
                    <TableCell className="text-xs text-gray-400">{new Date(u.created_at).toLocaleDateString('fr-FR')}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditUser(u); setEditRole(u.role) }}>
                        <Edit2 className="w-3 h-3 mr-1"/>Modifier
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!users.length && <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-8">Aucun utilisateur</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog modification rôle */}
      <Dialog open={!!editUser} onOpenChange={o => { if (!o) setEditUser(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserCog className="w-5 h-5"/>Modifier le rôle</DialogTitle></DialogHeader>
          {editUser && (
            <div className="space-y-4 py-2">
              <div><p className="text-sm text-gray-500">Utilisateur</p><p className="font-semibold">{editUser.full_name || editUser.email}</p></div>
              <div>
                <Label>Rôle *</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>{roles.map(r => <SelectItem key={r.value} value={r.value}><span className="text-sm">{r.label}</span></SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="bg-blue-50 rounded p-3 text-xs text-blue-700">
                {editRole === 'admin' && "⚠️ Accès total à la plateforme"}
                {editRole === 'direction' && "Vue consolidée groupe, management accounts, Cerveau TIBOK"}
                {editRole === 'comptable' && "Gestion multi-clients, dossiers, documents, grand livre"}
                {editRole === 'rh_manager' && "Module RH: employés, paie, congés, pointage, CLARA"}
                {editRole === 'juridique' && "Génération contrats, KYC, Due Diligence"}
                {editRole === 'client_admin' && "Accès complet à sa société: upload docs, factures, rapports"}
                {editRole === 'client_user' && "Upload documents, consultation rapports, tableau de bord"}
                {editRole === 'salarie' && "Portail salarié: pointage GPS, bulletins, congés uniquement"}
              </div>
              <Button onClick={saveRole} disabled={saving || saved} className="w-full bg-[#1E2A4A] text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : saved ? <CheckCircle className="w-4 h-4 mr-2 text-green-400"/> : null}
                {saved ? "Rôle mis à jour !" : "Enregistrer"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
