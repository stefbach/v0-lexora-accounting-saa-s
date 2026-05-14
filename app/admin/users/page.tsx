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
import { t, getLocale, type Locale } from "@/lib/i18n"

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

const moduleDefs = (locale: Locale) => [
  { key: "documents", label: t('adm.users.mod_documents', locale), icon: FileText },
  { key: "comptabilite", label: t('adm.users.mod_accounting', locale), icon: Calculator },
  { key: "facturation", label: t('adm.users.mod_invoicing', locale), icon: Receipt },
  { key: "rh", label: t('adm.users.mod_hr', locale), icon: UsersIcon },
  { key: "fiscal", label: t('adm.users.mod_tax', locale), icon: Scale },
  { key: "etats_financiers", label: t('adm.users.mod_financial', locale), icon: BarChart3 },
  { key: "employe_portal", label: t('adm.users.mod_employee_portal', locale), icon: UserCheck },
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

function PermissionsEditor({ modules, onChange, role, locale }: { modules: ModulesUtilisateur; onChange: (m: ModulesUtilisateur) => void; role: string; locale: Locale }) {
  const [open, setOpen] = useState(false)
  const defaults = getDefaultModules(role)
  const isCustom = Object.keys(modules).some(k => (modules as Record<string, boolean>)[k] !== (defaults as Record<string, boolean>)[k])
  const MODULE_DEFS = moduleDefs(locale)
  return (
    <div className="border rounded-lg">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-[#0B0F2E] hover:bg-gray-50 rounded-lg">
        <span className="flex items-center gap-2">
          {t('adm.users.adv_permissions', locale)}
          {isCustom && <Badge className="text-[10px] bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/30">{t('adm.users.custom', locale)}</Badge>}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t pt-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">{t('adm.users.modules_for_user', locale)}</p>
            <button type="button" onClick={() => onChange(getDefaultModules(role))} className="text-xs text-[#D4AF37] hover:underline">{t('adm.users.reset_perms', locale)}</button>
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
  { value: 'team_leader', label: 'Team Leader', color: 'bg-teal-50 text-teal-700' },
  { value: 'client_assistant', label: 'Assistant (Direction)', color: 'bg-cyan-100 text-cyan-800' },
  { value: 'direction', label: 'Direction', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'employe', label: 'Employé', color: 'bg-gray-100 text-gray-700' },
]

const NEEDS_SOCIETE = ['rh', 'juridique', 'employe', 'manager', 'team_leader', 'direction', 'client_admin', 'client_user', 'client_assistant', 'comptable', 'comptable_dedie']

function genPassword() {
  return Math.random().toString(36).slice(2, 8).toUpperCase() + Math.random().toString(36).slice(2, 8)
}

function RoleBadge({ role }: { role: string; locale?: Locale }) {
  const r = ROLES.find(r => r.value === role)
  return <Badge className={`text-xs ${r?.color || 'bg-gray-100 text-gray-700'}`}>{r?.label || role}</Badge>
}

export default function UsersPage() {
  const locale = getLocale()
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
    const SOCIETE_OBLIGATOIRE = ['rh', 'juridique', 'employe', 'manager', 'team_leader', 'direction']
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
          <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('adm.users.title', locale)}</h1>
          <p className="text-sm text-gray-500">{users.length} {t('adm.users.account_count_suffix', locale)}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#0B0F2E]">{t('adm.users.create_btn', locale)}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{t('adm.users.create_title', locale)}</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t('adm.users.first_name', locale)}</Label><Input value={form.prenom} onChange={e => setForm(f => ({...f, prenom: e.target.value}))} placeholder="Jean" /></div>
                <div><Label>{t('adm.users.last_name', locale)}</Label><Input value={form.nom} onChange={e => setForm(f => ({...f, nom: e.target.value}))} placeholder="Dupont" /></div>
              </div>
              <div><Label>{t('adm.users.email', locale)}</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="jean.dupont@email.com" /></div>
              <div>
                <Label>{t('adm.users.role', locale)}</Label>
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
                    {['client_assistant'].includes(form.role) ? t('adm.users.companies_multi', locale) : t('adm.users.company_single', locale)}
                    {['rh','juridique','employe','manager','team_leader','direction'].includes(form.role) && <span className="text-red-500"> *</span>}
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
                      <SelectTrigger><SelectValue placeholder={t('adm.users.select_company', locale)} /></SelectTrigger>
                      <SelectContent>
                        {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom} {s.brn ? `— ${s.brn}` : ''}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    {['client_assistant'].includes(form.role) && t('adm.users.hint_assistant', locale)}
                    {['client_admin','client_user'].includes(form.role) && t('adm.users.hint_client', locale)}
                    {['comptable','comptable_dedie'].includes(form.role) && t('adm.users.hint_accountant', locale)}
                    {['rh','juridique','employe','manager','team_leader','direction'].includes(form.role) && t('adm.users.hint_collab', locale)}
                  </p>
                </div>
              )}
              <PermissionsEditor
                modules={form.modules_utilisateur}
                onChange={m => setForm(f => ({...f, modules_utilisateur: m}))}
                role={form.role}
                locale={locale}
              />
              <div>
                <Label>{t('adm.users.generated_password', locale)}</Label>
                <div className="flex gap-2">
                  <Input value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} className="font-mono" />
                  <Button variant="outline" size="sm" onClick={() => setForm(f => ({...f, password: genPassword()}))}>↺</Button>
                </div>
                <p className="text-xs text-orange-600 mt-1">{t('adm.users.password_warn', locale)}</p>
              </div>
              <Button onClick={creer} disabled={saving || !form.prenom || !form.nom || !form.email || (['rh','juridique','employe','manager','team_leader','direction'].includes(form.role) && !form.societe_id)} className="w-full bg-[#0B0F2E]">
                {saving ? t('adm.users.creating', locale) : t('adm.users.create_account', locale)}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Dernier mot de passe */}
      {lastPassword && (
        <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-lg flex items-center justify-between">
          <div>
            <p className="font-semibold text-yellow-800">{t('adm.users.password_to_share', locale)}</p>
            <p className="font-mono text-lg text-yellow-900 mt-1">{lastPassword}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLastPassword('')}>✕</Button>
        </div>
      )}

      {/* Stats par rôle */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilterRole('all')} className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${filterRole === 'all' ? 'bg-[#0B0F2E] text-white border-[#0B0F2E]' : 'border-gray-200 hover:border-gray-300'}`}>
          {t('adm.users.filter_all', locale)} ({users.length})
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
        <div className="text-center text-gray-400 py-12">{t('adm.users.loading', locale)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-gray-400">
          <p className="text-4xl mb-3">👤</p>
          <p className="font-medium">{t('adm.users.none', locale)}</p>
          <p className="text-sm mt-1">{t('adm.users.none_hint', locale)}</p>
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
                    <RoleBadge role={u.role} locale={locale} />
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
                  locale={locale}
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
