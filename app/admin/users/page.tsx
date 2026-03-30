"use client"
import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

interface User { id: string; email: string; full_name: string; role: string; societe_id?: string; created_at: string }
interface Societe { id: string; nom: string; brn: string }

const ROLES = [
  { value: 'admin', label: 'Admin Plateforme', color: 'bg-red-100 text-red-800' },
  { value: 'super_admin', label: 'Super Admin', color: 'bg-red-200 text-red-900' },
  { value: 'comptable', label: 'Comptable', color: 'bg-blue-100 text-blue-800' },
  { value: 'comptable_dedie', label: 'Comptable Dédié', color: 'bg-blue-100 text-blue-800' },
  { value: 'client_admin', label: 'Client (Dirigeant)', color: 'bg-green-100 text-green-800' },
  { value: 'client_user', label: 'Client (Utilisateur)', color: 'bg-green-50 text-green-700' },
  { value: 'rh', label: 'RH', color: 'bg-orange-100 text-orange-800' },
  { value: 'juridique', label: 'Juridique', color: 'bg-purple-100 text-purple-800' },
  { value: 'manager', label: 'Manager', color: 'bg-teal-100 text-teal-800' },
  { value: 'direction', label: 'Direction', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'employe', label: 'Employé', color: 'bg-gray-100 text-gray-700' },
]

const NEEDS_SOCIETE = ['rh', 'juridique', 'employe', 'manager', 'direction', 'client_admin', 'client_user', 'client_assistant', 'comptable', 'comptable_dedie']

function genPassword() {
  return Math.random().toString(36).slice(2, 8).toUpperCase() + Math.random().toString(36).slice(2, 8)
}

function RoleBadge({ role }: { role: string }) {
  const r = ROLES.find(r => r.value === role)
  return <Badge className={`text-xs ${r?.color || 'bg-gray-100 text-gray-700'}`}>{r?.label || role}</Badge>
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [societes, setSocietes] = useState<Societe[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastPassword, setLastPassword] = useState("")
  const [filterRole, setFilterRole] = useState("all")
  const [form, setForm] = useState({
    prenom: '', nom: '', email: '', password: genPassword(),
    role: 'client_admin', societe_id: '', comptable_id: ''
  })

  const load = useCallback(async () => {
    setLoading(true)
    const [u, s] = await Promise.all([
      fetch('/api/admin/users').then(r => r.json()),
      fetch('/api/admin/societes').then(r => r.json()),
    ])
    setUsers(u.users || [])
    setSocietes(s.societes || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const creer = async () => {
    if (!form.prenom || !form.nom || !form.email || !form.role) return
    const SOCIETE_OBLIGATOIRE = ['rh', 'juridique', 'employe', 'manager', 'direction']
    if (SOCIETE_OBLIGATOIRE.includes(form.role) && !form.societe_id) return
    setSaving(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email,
        password: form.password,
        full_name: `${form.prenom} ${form.nom}`,
        role: form.role,
        societe_id: form.societe_id || undefined,
        comptable_id: form.comptable_id || undefined,
      })
    })
    const data = await res.json()
    setSaving(false)
    if (data.error) { alert(data.error); return }
    setLastPassword(form.password)
    setOpen(false)
    setForm({ prenom: '', nom: '', email: '', password: genPassword(), role: 'client_admin', societe_id: '', comptable_id: '' })
    load()
  }

  const changeRole = async (user_id: string, role: string) => {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, role })
    })
    load()
  }

  const filtered = filterRole === 'all' ? users : users.filter(u => u.role === filterRole)
  const stats = ROLES.map(r => ({ ...r, count: users.filter(u => u.role === r.value).length }))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Utilisateurs</h1>
          <p className="text-sm text-gray-500">{users.length} compte{users.length !== 1 ? 's' : ''} au total</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#1E2A4A]">+ Créer un compte</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Créer un compte utilisateur</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Prénom</Label><Input value={form.prenom} onChange={e => setForm(f => ({...f, prenom: e.target.value}))} placeholder="Jean" /></div>
                <div><Label>Nom</Label><Input value={form.nom} onChange={e => setForm(f => ({...f, nom: e.target.value}))} placeholder="Dupont" /></div>
              </div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="jean.dupont@email.com" /></div>
              <div>
                <Label>Rôle</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({...f, role: v, societe_id: ''}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {NEEDS_SOCIETE.includes(form.role) && (
                <div>
                  <Label>
                    Société à associer
                    {['rh','juridique','employe','manager','direction'].includes(form.role) && <span className="text-red-500"> *</span>}
                  </Label>
                  <Select value={form.societe_id} onValueChange={v => setForm(f => ({...f, societe_id: v}))}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner une société" /></SelectTrigger>
                    <SelectContent>
                      {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom} {s.brn ? `— ${s.brn}` : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">
                    {['client_admin','client_user','client_assistant'].includes(form.role) && "Le client sera lié à cette société via un dossier"}
                    {['comptable','comptable_dedie'].includes(form.role) && "Le comptable sera assigné à cette société"}
                    {['rh','juridique','employe','manager','direction'].includes(form.role) && "La société principale de ce collaborateur"}
                  </p>
                </div>
              )}
              <div>
                <Label>Mot de passe généré</Label>
                <div className="flex gap-2">
                  <Input value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} className="font-mono" />
                  <Button variant="outline" size="sm" onClick={() => setForm(f => ({...f, password: genPassword()}))}>↺</Button>
                </div>
                <p className="text-xs text-orange-600 mt-1">⚠️ Notez ce mot de passe — il ne sera plus affiché après création</p>
              </div>
              <Button onClick={creer} disabled={saving || !form.prenom || !form.nom || !form.email || (['rh','juridique','employe','manager','direction'].includes(form.role) && !form.societe_id)} className="w-full bg-[#1E2A4A]">
                {saving ? 'Création...' : 'Créer le compte'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Dernier mot de passe */}
      {lastPassword && (
        <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-lg flex items-center justify-between">
          <div>
            <p className="font-semibold text-yellow-800">✅ Compte créé — mot de passe à communiquer :</p>
            <p className="font-mono text-lg text-yellow-900 mt-1">{lastPassword}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLastPassword('')}>✕</Button>
        </div>
      )}

      {/* Stats par rôle */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilterRole('all')} className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${filterRole === 'all' ? 'bg-[#1E2A4A] text-white border-[#1E2A4A]' : 'border-gray-200 hover:border-gray-300'}`}>
          Tous ({users.length})
        </button>
        {stats.filter(s => s.count > 0).map(s => (
          <button key={s.value} onClick={() => setFilterRole(s.value)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${filterRole === s.value ? 'bg-[#1E2A4A] text-white border-[#1E2A4A]' : 'border-gray-200 hover:border-gray-300'}`}>
            {s.label} ({s.count})
          </button>
        ))}
      </div>

      {/* Liste utilisateurs */}
      {loading ? (
        <div className="text-center text-gray-400 py-12">Chargement...</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-gray-400">
          <p className="text-4xl mb-3">👤</p>
          <p className="font-medium">Aucun utilisateur</p>
          <p className="text-sm mt-1">Créez votre premier compte avec le bouton ci-dessus.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(u => (
            <Card key={u.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#1E2A4A] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {(u.full_name || u.email).slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{u.full_name || '—'}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </div>
                  <RoleBadge role={u.role} />
                </div>
                <div className="flex items-center gap-2">
                  <Select value={u.role} onValueChange={v => changeRole(u.id, v)}>
                    <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
