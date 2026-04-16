"use client"
import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { ChevronDown, ChevronRight, FileText, Calculator, Receipt, Users as UsersIcon, Scale, BarChart3, UserCheck } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

interface ModulesUtilisateur {
  documents?: boolean
  comptabilite?: boolean
  facturation?: boolean
  rh?: boolean
  fiscal?: boolean
  etats_financiers?: boolean
  employe_portal?: boolean
}

interface User { id: string; email: string; full_name: string; role: string; societe_id?: string; created_at: string; modules_utilisateur?: ModulesUtilisateur | null }

const MODULE_DEFS = [
  { key: "documents", label: "Documents & OCR", icon: FileText },
  { key: "comptabilite", label: "Comptabilite (Grand Livre, Bilan, Banque, Rapprochement)", icon: Calculator },
  { key: "facturation", label: "Facturation (Factures, Nouvelle facture)", icon: Receipt },
  { key: "rh", label: "RH & Paie (Employes, Pointage, Conges, Paie, Primes)", icon: UsersIcon },
  { key: "fiscal", label: "Fiscal MRA (TVA, IT Form 3, Annual Return)", icon: Scale },
  { key: "etats_financiers", label: "Etats Financiers (Bilan, Previsionnel, Exercices)", icon: BarChart3 },
  { key: "employe_portal", label: "Portail Employe (bulletins et conges)", icon: UserCheck },
] as const

function getDefaultModules(role: string): ModulesUtilisateur {
  switch (role) {
    case "client_admin":
    case "super_admin":
    case "admin":
      return { documents: true, comptabilite: true, facturation: true, rh: true, fiscal: true, etats_financiers: true, employe_portal: true }
    case "client_user":
      return { documents: true, comptabilite: true, facturation: true, rh: true, fiscal: true, etats_financiers: true, employe_portal: false }
    case "client_assistant":
      return { documents: true, comptabilite: false, facturation: false, rh: false, fiscal: false, etats_financiers: false, employe_portal: false }
    case "rh":
      return { documents: true, comptabilite: false, facturation: false, rh: true, fiscal: false, etats_financiers: false, employe_portal: false }
    case "comptable":
    case "comptable_dedie":
      return { documents: true, comptabilite: true, facturation: true, rh: false, fiscal: true, etats_financiers: true, employe_portal: false }
    case "employe":
      return { documents: false, comptabilite: false, facturation: false, rh: false, fiscal: false, etats_financiers: false, employe_portal: true }
    default:
      return { documents: true, comptabilite: false, facturation: false, rh: false, fiscal: false, etats_financiers: false, employe_portal: false }
  }
}

function PermissionsEditor({ modules, onChange, role }: { modules: ModulesUtilisateur; onChange: (m: ModulesUtilisateur) => void; role: string }) {
  const [open, setOpen] = useState(false)
  const defaults = getDefaultModules(role)
  const isCustom = Object.keys(modules).some(k => (modules as Record<string, boolean>)[k] !== (defaults as Record<string, boolean>)[k])
  return (
    <div className="border rounded-lg">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-[#0B0F2E] hover:bg-gray-50 rounded-lg">
        <span className="flex items-center gap-2">
          Permissions avancees
          {isCustom && <Badge className="text-[10px] bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/30">Personnalise</Badge>}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t pt-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">Modules accessibles pour cet utilisateur</p>
            <button type="button" onClick={() => onChange(getDefaultModules(role))} className="text-xs text-[#D4AF37] hover:underline">Reinitialiser</button>
          </div>
          {MODULE_DEFS.map(({ key, label, icon: Icon }) => (
            <div key={key} className="flex items-center justify-between py-1.5">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <Icon className="w-4 h-4 text-[#0B0F2E]/60" />
                {label}
              </label>
              <Switch
                checked={(modules as Record<string, boolean>)[key] ?? false}
                onCheckedChange={(v) => onChange({ ...modules, [key]: v })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
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
  { value: 'client_assistant', label: 'Assistant (Direction)', color: 'bg-cyan-100 text-cyan-800' },
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
    role: 'client_admin', societe_id: '', comptable_id: '',
    modules_utilisateur: getDefaultModules('client_admin') as ModulesUtilisateur,
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
        societe_ids: (form as any).societe_ids || undefined,
        comptable_id: form.comptable_id || undefined,
        modules_utilisateur: form.modules_utilisateur,
      })
    })
    const data = await res.json()
    setSaving(false)
    if (data.error) { alert(data.error); return }
    setLastPassword(form.password)
    setOpen(false)
    setForm({ prenom: '', nom: '', email: '', password: genPassword(), role: 'client_admin', societe_id: '', comptable_id: '', modules_utilisateur: getDefaultModules('client_admin') })
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

  const savePermissions = async (user_id: string, modules: ModulesUtilisateur) => {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, modules_utilisateur: modules })
    })
    load()
  }

  const filtered = filterRole === 'all' ? users : users.filter(u => u.role === filterRole)
  const stats = ROLES.map(r => ({ ...r, count: users.filter(u => u.role === r.value).length }))

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]">Utilisateurs</h1>
          <p className="text-sm text-gray-500">{users.length} compte{users.length !== 1 ? 's' : ''} au total</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#0B0F2E]">+ Créer un compte</Button>
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
                <Select value={form.role} onValueChange={v => setForm(f => ({...f, role: v, societe_id: '', modules_utilisateur: getDefaultModules(v)}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {NEEDS_SOCIETE.includes(form.role) && (
                <div>
                  <Label>
                    {['client_assistant'].includes(form.role) ? 'Sociétés à gérer (multi-sélection)' : 'Société à associer'}
                    {['rh','juridique','employe','manager','direction'].includes(form.role) && <span className="text-red-500"> *</span>}
                  </Label>
                  {['client_assistant', 'client_admin'].includes(form.role) && societes.length > 1 ? (
                    <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1 mt-1">
                      {societes.map(s => (
                        <label key={s.id} className="flex items-center gap-2 cursor-pointer text-sm hover:bg-gray-50 p-1 rounded">
                          <input type="checkbox" className="rounded border-gray-300"
                            checked={(form as any).societe_ids?.includes(s.id) || form.societe_id === s.id}
                            onChange={e => {
                              const ids: string[] = (form as any).societe_ids || (form.societe_id ? [form.societe_id] : [])
                              const updated = e.target.checked ? [...ids, s.id] : ids.filter((id: string) => id !== s.id)
                              setForm(f => ({...f, societe_ids: updated, societe_id: updated[0] || ''} as any))
                            }}
                          />
                          <span>{s.nom} {s.brn ? `(${s.brn})` : ''}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <Select value={form.societe_id} onValueChange={v => setForm(f => ({...f, societe_id: v}))}>
                      <SelectTrigger><SelectValue placeholder="Sélectionner une société" /></SelectTrigger>
                      <SelectContent>
                        {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom} {s.brn ? `— ${s.brn}` : ''}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    {['client_assistant'].includes(form.role) && "L'assistant pourra numériser des documents pour toutes les sociétés cochées"}
                    {['client_admin','client_user'].includes(form.role) && "Le client sera lié à cette société via un dossier"}
                    {['comptable','comptable_dedie'].includes(form.role) && "Le comptable sera assigné à cette société"}
                    {['rh','juridique','employe','manager','direction'].includes(form.role) && "La société principale de ce collaborateur"}
                  </p>
                </div>
              )}
              <PermissionsEditor
                modules={form.modules_utilisateur}
                onChange={m => setForm(f => ({...f, modules_utilisateur: m}))}
                role={form.role}
              />
              <div>
                <Label>Mot de passe généré</Label>
                <div className="flex gap-2">
                  <Input value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} className="font-mono" />
                  <Button variant="outline" size="sm" onClick={() => setForm(f => ({...f, password: genPassword()}))}>↺</Button>
                </div>
                <p className="text-xs text-orange-600 mt-1">⚠️ Notez ce mot de passe — il ne sera plus affiché après création</p>
              </div>
              <Button onClick={creer} disabled={saving || !form.prenom || !form.nom || !form.email || (['rh','juridique','employe','manager','direction'].includes(form.role) && !form.societe_id)} className="w-full bg-[#0B0F2E]">
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
        <button onClick={() => setFilterRole('all')} className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${filterRole === 'all' ? 'bg-[#0B0F2E] text-white border-[#0B0F2E]' : 'border-gray-200 hover:border-gray-300'}`}>
          Tous ({users.length})
        </button>
        {stats.filter(s => s.count > 0).map(s => (
          <button key={s.value} onClick={() => setFilterRole(s.value)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${filterRole === s.value ? 'bg-[#0B0F2E] text-white border-[#0B0F2E]' : 'border-gray-200 hover:border-gray-300'}`}>
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
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#0B0F2E] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {(u.full_name || u.email).slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{u.full_name || '--'}</p>
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
                </div>
                <PermissionsEditor
                  modules={u.modules_utilisateur || getDefaultModules(u.role)}
                  onChange={m => savePermissions(u.id, m)}
                  role={u.role}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
    </ClientPageShell>
  )
}
