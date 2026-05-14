"use client"
import { useEffect, useState, useCallback, useMemo, Fragment } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import {
  Users, UserPlus, Shield, Building2, Mail, Phone, Pencil,
  ToggleLeft, ToggleRight, Copy, RefreshCw, Search, ChevronDown,
  ChevronUp, ChevronRight, Calendar, ArrowUpDown, X, Check,
  FileText, Calculator, Receipt, Scale, BarChart3, UserCheck,
  Key, Eye, EyeOff, AlertTriangle, Loader2
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale, type Locale } from "@/lib/i18n"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ModulesUtilisateur {
  documents?: boolean
  comptabilite?: boolean
  facturation?: boolean
  rh?: boolean
  fiscal?: boolean
  etats_financiers?: boolean
  employe_portal?: boolean
}

interface User {
  id: string
  email: string
  full_name: string
  role: string
  phone?: string
  societe_id?: string
  actif?: boolean
  created_at: string
  last_sign_in_at?: string
  created_by?: string
  societes?: { nom: string } | null
  modules_utilisateur?: ModulesUtilisateur | null
}

interface Societe {
  id: string
  nom: string
  brn?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
function getRoles(locale: Locale) {
  return [
    { value: "admin", label: t('core.users.rl.admin', locale), color: "bg-red-100 text-red-800 border-red-200" },
    { value: "super_admin", label: t('core.users.rl.super_admin', locale), color: "bg-red-200 text-red-900 border-red-300" },
    { value: "comptable", label: t('core.users.rl.comptable', locale), color: "bg-blue-100 text-blue-800 border-blue-200" },
    { value: "comptable_dedie", label: t('core.users.rl.comptable_dedie', locale), color: "bg-blue-100 text-blue-800 border-blue-200" },
    { value: "client_admin", label: t('core.users.rl.client_admin', locale), color: "bg-green-100 text-green-800 border-green-200" },
    { value: "client_user", label: t('core.users.rl.client_user', locale), color: "bg-green-50 text-green-700 border-green-200" },
    { value: "client_assistant", label: t('core.users.rl.client_assistant', locale), color: "bg-cyan-100 text-cyan-800 border-cyan-200" },
    { value: "rh", label: t('core.users.rl.rh', locale), color: "bg-orange-100 text-orange-800 border-orange-200" },
    { value: "juridique", label: t('core.users.rl.juridique', locale), color: "bg-purple-100 text-purple-800 border-purple-200" },
    { value: "manager", label: t('core.users.rl.manager', locale), color: "bg-teal-100 text-teal-800 border-teal-200" },
    { value: "direction", label: t('core.users.rl.direction', locale), color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
    { value: "employe", label: t('core.users.rl.employe', locale), color: "bg-gray-100 text-gray-700 border-gray-200" },
  ]
}

function getHrRoleGuide(locale: Locale) {
  return [
    { value: 'rh', label: t('core.users.rl.rh', locale), desc: t('core.users.hrg.rh_desc', locale), color: 'bg-orange-100 text-orange-800 border-orange-200' },
    { value: 'manager', label: t('core.users.rl.manager', locale), desc: t('core.users.hrg.manager_desc', locale), color: 'bg-teal-100 text-teal-800 border-teal-200' },
    { value: 'juridique', label: t('core.users.rl.juridique', locale), desc: t('core.users.hrg.juridique_desc', locale), color: 'bg-purple-100 text-purple-800 border-purple-200' },
    { value: 'employe', label: t('core.users.rl.employe', locale), desc: t('core.users.hrg.employe_desc', locale), color: 'bg-gray-100 text-gray-700 border-gray-200' },
  ]
}

const NEEDS_SOCIETE = ["rh", "juridique", "employe", "manager", "direction", "client_assistant", "client_admin", "client_user", "comptable", "comptable_dedie"]
const MULTI_SOCIETE_ROLES = ["client_assistant", "client_admin", "client_user", "rh", "comptable", "comptable_dedie"]

function getModuleDefs(locale: Locale) {
  return [
    { key: "documents", label: t('core.users.md.documents', locale), icon: FileText },
    { key: "comptabilite", label: t('core.users.md.comptabilite', locale), icon: Calculator },
    { key: "facturation", label: t('core.users.md.facturation', locale), icon: Receipt },
    { key: "rh", label: t('core.users.md.rh', locale), icon: Users },
    { key: "fiscal", label: t('core.users.md.fiscal', locale), icon: Scale },
    { key: "etats_financiers", label: t('core.users.md.etats_financiers', locale), icon: BarChart3 },
    { key: "employe_portal", label: t('core.users.md.employe_portal', locale), icon: UserCheck },
  ] as const
}

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
  const MODULE_DEFS = getModuleDefs(locale)
  return (
    <div className="border rounded-lg">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-[#0B0F2E] hover:bg-gray-50 rounded-lg">
        <span className="flex items-center gap-2">
          {t('core.users.advanced_perms', locale)}
          {isCustom && <Badge className="text-[10px] bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/30">{t('core.users.custom', locale)}</Badge>}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t pt-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">{t('core.users.modules_for_user', locale)}</p>
            <button type="button" onClick={() => onChange(getDefaultModules(role))} className="text-xs text-[#D4AF37] hover:underline">{t('core.users.reset', locale)}</button>
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

function genPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  let pw = ""
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)]
  return pw
}

function getRoleMeta(role: string, roles: ReturnType<typeof getRoles>) {
  return roles.find((r) => r.value === role) || { value: role, label: role, color: "bg-gray-100 text-gray-700 border-gray-200" }
}

function formatDate(d: string | undefined, locale: Locale) {
  if (!d) return "--"
  return new Date(d).toLocaleDateString(locale === 'en' ? 'en-US' : "fr-FR", { day: "2-digit", month: "short", year: "numeric" })
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function getSocieteBadgeStyle(name?: string): React.CSSProperties {
  if (!name) return { backgroundColor: '#f3f4f6', color: '#374151', borderColor: '#e5e7eb' }
  const n = name.toLowerCase()
  if (n.includes('obesity') || n.includes('occ'))
    return { backgroundColor: '#ccfbf1', color: '#0f766e', borderColor: '#99f6e4' }
  if (n.includes('digital') || n.includes('dds'))
    return { backgroundColor: '#dbeafe', color: '#1d4ed8', borderColor: '#bfdbfe' }
  if (n.includes('tibok'))
    return { backgroundColor: '#fef9c3', color: '#a16207', borderColor: '#fef08a' }
  return { backgroundColor: '#f3f4f6', color: '#374151', borderColor: '#e5e7eb' }
}

function SocieteBadge({ name }: { name?: string }) {
  if (!name) return <span className="text-gray-400 text-sm">--</span>
  return (
    <Badge variant="outline" className="text-xs" style={getSocieteBadgeStyle(name)}>
      <Building2 className="w-3 h-3 mr-1" />{name}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function RoleBadge({ role, roles }: { role: string; roles: ReturnType<typeof getRoles> }) {
  const r = getRoleMeta(role, roles)
  return <Badge className={`text-xs border ${r.color}`}>{r.label}</Badge>
}

function StatusBadge({ actif, locale }: { actif?: boolean; locale: Locale }) {
  const isActive = actif !== false
  return (
    <Badge className={`text-xs border ${isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
      {isActive ? t('core.users.active', locale) : t('core.users.inactive', locale)}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function UtilisateursPage() {
  const locale = getLocale()
  const ROLES = getRoles(locale)
  const HR_ROLE_GUIDE = getHrRoleGuide(locale)
  const { societeId, societes: providerSocietes } = useSocieteActive()
  const societes = providerSocietes as any as Societe[]
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState("")
  const [filterRole, setFilterRole] = useState("all")

  // Sort
  const [sortField, setSortField] = useState<"full_name" | "role" | "created_at">("created_at")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [detailUser, setDetailUser] = useState<User | null>(null)
  const [editUser, setEditUser] = useState<User | null>(null)

  // Sprint 12 FEATURE 2 — dialog changement mot de passe
  const [pwdOpen, setPwdOpen] = useState(false)
  const [pwdUser, setPwdUser] = useState<User | null>(null)
  const [pwdValue, setPwdValue] = useState("")
  const [pwdVisible, setPwdVisible] = useState(true)
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdSuccess, setPwdSuccess] = useState(false)

  // Create form
  const [saving, setSaving] = useState(false)
  const [lastPassword, setLastPassword] = useState("")
  const [createForm, setCreateForm] = useState({
    prenom: "", nom: "", email: "", password: genPassword(), role: "client_admin", societe_id: "",
    societe_ids: [] as string[],
    modules_utilisateur: getDefaultModules("client_admin") as ModulesUtilisateur,
  })

  // Edit form
  const [editForm, setEditForm] = useState({
    full_name: "", email: "", phone: "", role: "", societe_id: "", actif: true,
    societe_ids: [] as string[],
    modules_utilisateur: getDefaultModules("client_admin") as ModulesUtilisateur,
  })
  const [editSaving, setEditSaving] = useState(false)

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------
  const load = useCallback(async () => {
    if (!societeId) { setLoading(false); setUsers([]); return }
    setLoading(true)
    try {
      const u = await fetch(`/api/client/users?societe_id=${societeId}`).then((r) => r.json())
      setUsers(u.users || [])
    } catch {
      // silent
    }
    setLoading(false)
  }, [societeId])

  useEffect(() => { load() }, [load])

  // ---------------------------------------------------------------------------
  // Filtered + sorted users
  // ---------------------------------------------------------------------------
  const filtered = useMemo(() => {
    let list = [...users]
    if (filterRole !== "all") list = list.filter((u) => u.role === filterRole)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (u) =>
          (u.full_name || "").toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      let cmp = 0
      if (sortField === "full_name") cmp = (a.full_name || "").localeCompare(b.full_name || "")
      else if (sortField === "role") cmp = a.role.localeCompare(b.role)
      else cmp = (a.created_at || "").localeCompare(b.created_at || "")
      return sortDir === "asc" ? cmp : -cmp
    })
    return list
  }, [users, filterRole, search, sortField, sortDir])

  // ---------------------------------------------------------------------------
  // KPI data
  // ---------------------------------------------------------------------------
  const kpis = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const activeThisMonth = users.filter((u) => u.actif !== false && new Date(u.created_at) >= monthStart).length
    const roleCounts = ROLES.map((r) => ({ ...r, count: users.filter((u) => u.role === r.value).length }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
    const latest = users.length > 0
      ? [...users].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0]
      : null
    return { total: users.length, activeThisMonth, topRoles: roleCounts, latest }
  }, [users])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const handleCreate = async () => {
    if (!createForm.prenom || !createForm.nom || !createForm.email || !createForm.role) return
    const isMulti = MULTI_SOCIETE_ROLES.includes(createForm.role)
    if (NEEDS_SOCIETE.includes(createForm.role) && !isMulti && !createForm.societe_id) return
    if (isMulti && createForm.societe_ids.length === 0) return
    setSaving(true)
    try {
      const societePayload = isMulti && createForm.societe_ids.length > 0
        ? { societe_ids: createForm.societe_ids, societe_id: createForm.societe_ids[0] }
        : { societe_id: createForm.societe_id || undefined }
      const res = await fetch("/api/client/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: createForm.email,
          password: createForm.password,
          full_name: `${createForm.prenom} ${createForm.nom}`,
          role: createForm.role,
          ...societePayload,
          modules_utilisateur: createForm.modules_utilisateur,
        }),
      })
      const data = await res.json()
      if (data.error) { alert(data.error); setSaving(false); return }
      setLastPassword(createForm.password)
      setCreateOpen(false)
      setCreateForm({ prenom: "", nom: "", email: "", password: genPassword(), role: "client_admin", societe_id: "", societe_ids: [], modules_utilisateur: getDefaultModules("client_admin") })
      load()
    } catch {
      alert(t('core.users.network_error', locale))
    }
    setSaving(false)
  }

  const openEdit = async (user: User) => {
    setEditUser(user)
    let userSocieteIds: string[] = user.societe_id ? [user.societe_id] : []
    try {
      const res = await fetch(`/api/client/users?user_id=${user.id}&action=societes`)
      const data = await res.json()
      if (data.societe_ids && data.societe_ids.length > 0) userSocieteIds = data.societe_ids
    } catch {}
    setEditForm({
      full_name: user.full_name || "",
      email: user.email,
      phone: user.phone || "",
      role: user.role,
      societe_id: user.societe_id || "",
      societe_ids: userSocieteIds,
      actif: user.actif !== false,
      modules_utilisateur: user.modules_utilisateur || getDefaultModules(user.role),
    })
    setEditOpen(true)
  }

  const handleEdit = async () => {
    if (!editUser) return
    setEditSaving(true)
    try {
      const isMultiEdit = MULTI_SOCIETE_ROLES.includes(editForm.role)
      const payload: Record<string, unknown> = {
        user_id: editUser.id,
        full_name: editForm.full_name,
        email: editForm.email,
        phone: editForm.phone,
        role: editForm.role,
        societe_id: isMultiEdit ? (editForm.societe_ids[0] || null) : (editForm.societe_id || null),
        actif: editForm.actif,
        modules_utilisateur: editForm.modules_utilisateur,
      }
      if (isMultiEdit && editForm.societe_ids.length > 0) {
        payload.societe_ids = editForm.societe_ids
      }
      const res = await fetch("/api/client/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.error) { alert(t('core.users.error_prefix', locale) + data.error); setEditSaving(false); return }
      setEditOpen(false)
      setEditUser(null)
      load()
    } catch {
      alert(t('core.users.network_error', locale))
    }
    setEditSaving(false)
  }

  const toggleActif = async (user: User) => {
    const newActif = user.actif === false ? true : false
    await fetch("/api/client/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id, actif: newActif }),
    })
    load()
  }

  // Sprint 12 FEATURE 2 — changement mot de passe
  const openPasswordDialog = (user: User) => {
    setPwdUser(user)
    setPwdValue(genPassword())
    setPwdVisible(true)
    setPwdSuccess(false)
    setPwdOpen(true)
  }

  const handleChangePassword = async () => {
    if (!pwdUser) return
    if (!pwdValue || pwdValue.length < 6) { alert(t('core.users.alert_pwd_required', locale)); return }
    if (!confirm(`${t('core.users.confirm_change_pwd_prefix', locale)}${pwdUser.full_name || pwdUser.email}${t('core.users.confirm_change_pwd_suffix', locale)}`)) {
      return
    }
    setPwdSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${pwdUser.id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwdValue }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(t('core.users.error_prefix', locale) + (data.error || `HTTP ${res.status}`)); return }
      // Afficher écran de confirmation avec le mot de passe à communiquer.
      setPwdSuccess(true)
    } catch { alert(t('core.users.network_error', locale)) }
    finally { setPwdSaving(false) }
  }

  const handleSort = (field: "full_name" | "role" | "created_at") => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortField(field); setSortDir("asc") }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* ---- HEADER ---- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0B0F2E] flex items-center justify-center">
            <Users className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('core.users.title', locale)}</h1>
            <p className="text-sm text-gray-500">{users.length} {users.length !== 1 ? t('core.users.account_many', locale) : t('core.users.account_one', locale)}</p>
          </div>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#0B0F2E] hover:bg-[#2a3d66] gap-2">
              <UserPlus className="w-4 h-4" /> {t('core.users.create_account', locale)}
            </Button>
          </DialogTrigger>
          {/* Create dialog content rendered below */}
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-[#0B0F2E]">
                <UserPlus className="w-5 h-5" /> {t('core.users.create_user_account', locale)}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('core.users.first_name', locale)}</Label>
                  <Input value={createForm.prenom} onChange={(e) => setCreateForm((f) => ({ ...f, prenom: e.target.value }))} placeholder={t('core.users.ph.firstname', locale)} />
                </div>
                <div>
                  <Label>{t('core.users.last_name', locale)}</Label>
                  <Input value={createForm.nom} onChange={(e) => setCreateForm((f) => ({ ...f, nom: e.target.value }))} placeholder={t('core.users.ph.lastname', locale)} />
                </div>
              </div>
              <div>
                <Label className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {t('core.users.email', locale)}</Label>
                <Input type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} placeholder={t('core.users.ph.email', locale)} />
              </div>
              <div>
                <Label className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> {t('core.users.role', locale)}</Label>
                <Select value={createForm.role} onValueChange={(v) => setCreateForm((f) => ({ ...f, role: v, societe_id: "", modules_utilisateur: getDefaultModules(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {createForm.role === "client_assistant" && (
                  <p className="text-xs text-gray-500 mt-1">{t('core.users.assistant_access_note', locale)}</p>
                )}
                {HR_ROLE_GUIDE.some(r => r.value === createForm.role) && (
                  <div className="mt-2 border rounded-lg p-3 bg-gray-50">
                    <p className="text-xs font-medium text-gray-500 mb-2">{t('core.users.hr_role_guide', locale)}</p>
                    <div className="space-y-1.5">
                      {HR_ROLE_GUIDE.map(r => (
                        <div key={r.value} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${r.value === createForm.role ? 'ring-1 ring-[#D4AF37]' : ''}`}>
                          <Badge className={`text-xs border ${r.color} shrink-0`}>{r.label}</Badge>
                          <span className="text-gray-600">{r.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {NEEDS_SOCIETE.includes(createForm.role) && !MULTI_SOCIETE_ROLES.includes(createForm.role) && (
                <div>
                  <Label className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {t('core.users.company', locale)} <span className="text-red-500">*</span></Label>
                  <Select value={createForm.societe_id} onValueChange={(v) => setCreateForm((f) => ({ ...f, societe_id: v }))}>
                    <SelectTrigger><SelectValue placeholder={t('core.users.select_company', locale)} /></SelectTrigger>
                    <SelectContent>
                      {societes.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.nom}{s.brn ? ` -- ${s.brn}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {MULTI_SOCIETE_ROLES.includes(createForm.role) && (
                <div>
                  <Label className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {t('core.users.companies', locale)} <span className="text-red-500">*</span></Label>
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto border rounded-lg p-2">
                    {societes.map(s => (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1.5 rounded">
                        <input type="checkbox" checked={createForm.societe_ids.includes(s.id)}
                          onChange={() => setCreateForm(f => ({ ...f, societe_ids: f.societe_ids.includes(s.id) ? f.societe_ids.filter(id => id !== s.id) : [...f.societe_ids, s.id] }))}
                          className="rounded border-gray-300" />
                        <span className="text-sm">{s.nom}{s.brn ? ` — ${s.brn}` : ""}</span>
                      </label>
                    ))}
                  </div>
                  {createForm.societe_ids.length > 0 && <p className="text-xs text-gray-500 mt-1">{createForm.societe_ids.length} {t('core.users.companies_count_suffix', locale)}</p>}
                </div>
              )}
              <PermissionsEditor
                modules={createForm.modules_utilisateur}
                onChange={(m) => setCreateForm((f) => ({ ...f, modules_utilisateur: m }))}
                role={createForm.role}
                locale={locale}
              />
              <div>
                <Label>{t('core.users.generated_password', locale)}</Label>
                <div className="flex gap-2">
                  <Input value={createForm.password} readOnly className="font-mono bg-gray-50" />
                  <Button variant="outline" size="icon" className="shrink-0" onClick={() => copyToClipboard(createForm.password)} title={t('core.users.copy', locale)}>
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="shrink-0" onClick={() => setCreateForm((f) => ({ ...f, password: genPassword() }))} title={t('core.users.regenerate', locale)}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-start gap-2 mt-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                  <Shield className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700">{t('core.users.password_note', locale)}</p>
                </div>
              </div>
              <Button
                onClick={handleCreate}
                disabled={saving || !createForm.prenom || !createForm.nom || !createForm.email || (NEEDS_SOCIETE.includes(createForm.role) && !MULTI_SOCIETE_ROLES.includes(createForm.role) && !createForm.societe_id) || (MULTI_SOCIETE_ROLES.includes(createForm.role) && createForm.societe_ids.length === 0)}
                className="w-full bg-[#0B0F2E] hover:bg-[#2a3d66]"
              >
                {saving ? t('core.users.creating', locale) : t('core.users.create_btn', locale)}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* ---- LAST PASSWORD BANNER ---- */}
      {lastPassword && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Check className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-semibold text-amber-800">{t('core.users.account_created_banner', locale)}</p>
              <p className="font-mono text-lg text-amber-900 mt-1 select-all">{lastPassword}</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => copyToClipboard(lastPassword)} className="gap-1">
              <Copy className="w-3.5 h-3.5" /> {t('core.users.copy', locale)}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLastPassword("")}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ---- KPIs ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-[#0B0F2E]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{t('core.users.total_users', locale)}</p>
              <Users className="w-5 h-5 text-[#0B0F2E]" />
            </div>
            <p className="text-3xl font-bold text-[#0B0F2E] mt-1">{kpis.total}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{t('core.users.active_this_month', locale)}</p>
              <UserPlus className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-3xl font-bold text-emerald-700 mt-1">{kpis.activeThisMonth}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[#D4AF37]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{t('core.users.top_roles', locale)}</p>
              <Shield className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <div className="mt-2 space-y-1">
              {kpis.topRoles.map((r) => (
                <div key={r.value} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 truncate">{r.label}</span>
                  <span className="font-semibold text-[#0B0F2E]">{r.count}</span>
                </div>
              ))}
              {kpis.topRoles.length === 0 && <p className="text-xs text-gray-400">--</p>}
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{t('core.users.latest_creation', locale)}</p>
              <Calendar className="w-5 h-5 text-purple-500" />
            </div>
            {kpis.latest ? (
              <div className="mt-1">
                <p className="font-semibold text-[#0B0F2E] text-sm truncate">{kpis.latest.full_name || kpis.latest.email}</p>
                <p className="text-xs text-gray-400">{formatDate(kpis.latest.created_at, locale)}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 mt-1">--</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- FILTERS ---- */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder={t('core.users.search_ph', locale)}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-52">
            <Shield className="w-4 h-4 mr-2 text-gray-400" />
            <SelectValue placeholder={t('core.users.filter_role_ph', locale)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('core.users.all_roles', locale)}</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ---- TABLE ---- */}
      {loading ? (
        <div className="text-center text-gray-400 py-16">{t('core.users.loading_users', locale)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-medium text-gray-500">{t('core.users.none_found', locale)}</p>
            <p className="text-sm text-gray-400 mt-1">{t('core.users.adjust_or_create', locale)}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left">
                  <th className="px-4 py-3 font-semibold text-gray-600">
                    <button className="flex items-center gap-1 hover:text-[#0B0F2E]" onClick={() => handleSort("full_name")}>
                      {t('core.users.col_name', locale)} {sortField === "full_name" ? (sortDir === "asc" ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />) : <ArrowUpDown className="w-3.5 h-3.5 text-gray-300" />}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600">{t('core.users.col_email', locale)}</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">
                    <button className="flex items-center gap-1 hover:text-[#0B0F2E]" onClick={() => handleSort("role")}>
                      {t('core.users.col_role', locale)} {sortField === "role" ? (sortDir === "asc" ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />) : <ArrowUpDown className="w-3.5 h-3.5 text-gray-300" />}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600">{t('core.users.col_company', locale)}</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">{t('core.users.col_status', locale)}</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">
                    <button className="flex items-center gap-1 hover:text-[#0B0F2E]" onClick={() => handleSort("created_at")}>
                      {t('core.users.col_created_at', locale)} {sortField === "created_at" ? (sortDir === "asc" ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />) : <ArrowUpDown className="w-3.5 h-3.5 text-gray-300" />}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-right">{t('core.users.col_actions', locale)}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => {
                  const isExpanded = detailUser?.id === user.id
                  return (
                    <Fragment key={user.id}>
                      <tr
                        className={`border-b hover:bg-gray-50/80 cursor-pointer transition-colors ${isExpanded ? "bg-blue-50/40" : ""}`}
                        onClick={() => setDetailUser(isExpanded ? null : user)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#0B0F2E] flex items-center justify-center text-white font-bold text-xs shrink-0">
                              {getInitials(user.full_name || user.email)}
                            </div>
                            <span className="font-medium text-[#0B0F2E]">{user.full_name || "--"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{user.email}</td>
                        <td className="px-4 py-3"><RoleBadge role={user.role} roles={ROLES} /></td>
                        <td className="px-4 py-3">
                          <SocieteBadge name={user.societes?.nom || societes.find((s) => s.id === user.societe_id)?.nom} />
                        </td>
                        <td className="px-4 py-3"><StatusBadge actif={user.actif} locale={locale} /></td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(user.created_at, locale)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(user)} title={t('core.users.modify', locale)}>
                              <Pencil className="w-4 h-4 text-gray-500" />
                            </Button>
                            {/* Sprint 12 FEATURE 2 — changer mot de passe */}
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPasswordDialog(user)} title={t('core.users.change_password', locale)}>
                              <Key className="w-4 h-4 text-purple-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => toggleActif(user)}
                              title={user.actif !== false ? t('core.users.deactivate', locale) : t('core.users.activate', locale)}
                            >
                              {user.actif !== false
                                ? <ToggleRight className="w-4 h-4 text-emerald-600" />
                                : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                            </Button>
                            <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                          </div>
                        </td>
                      </tr>
                      {/* ---- DETAIL ROW ---- */}
                      {isExpanded && (
                        <tr className="bg-blue-50/30 border-b">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{t('core.users.info', locale)}</p>
                                <div className="space-y-1">
                                  <p className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-gray-400" /> {user.email}</p>
                                  <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-gray-400" /> {user.phone || "--"}</p>
                                  <p className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-gray-400" /> <RoleBadge role={user.role} roles={ROLES} /></p>
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{t('core.users.company', locale)}</p>
                                <SocieteBadge name={user.societes?.nom || societes.find((s) => s.id === user.societe_id)?.nom} />
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{t('core.users.last_login', locale)}</p>
                                <p className="text-gray-600">{user.last_sign_in_at ? formatDate(user.last_sign_in_at, locale) : t('core.users.never', locale)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{t('core.users.creation', locale)}</p>
                                <p className="text-gray-600">{formatDate(user.created_at, locale)}</p>
                                {user.created_by && <p className="text-xs text-gray-400 mt-0.5">{t('core.users.by', locale)}{user.created_by}</p>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ---- EDIT DIALOG ---- */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) setEditUser(null) }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#0B0F2E]">
              <Pencil className="w-5 h-5" /> {t('core.users.modify_user', locale)}
            </DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4 pt-2">
              <div>
                <Label>{t('core.users.full_name', locale)}</Label>
                <Input value={editForm.full_name} onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div>
                <Label className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> {t('core.users.email', locale)}</Label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <Label className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {t('core.users.phone', locale)}</Label>
                <Input value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+230 5XXX XXXX" />
              </div>
              <div>
                <Label className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> {t('core.users.role', locale)}</Label>
                <Select value={editForm.role} onValueChange={(v) => setEditForm((f) => ({ ...f, role: v, modules_utilisateur: getDefaultModules(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {MULTI_SOCIETE_ROLES.includes(editForm.role) ? (
                <div>
                  <Label className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> Societes</Label>
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto border rounded-lg p-2">
                    {societes.map(s => (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1.5 rounded">
                        <input type="checkbox" checked={editForm.societe_ids.includes(s.id)}
                          onChange={() => setEditForm(f => ({ ...f, societe_ids: f.societe_ids.includes(s.id) ? f.societe_ids.filter(id => id !== s.id) : [...f.societe_ids, s.id] }))}
                          className="rounded border-gray-300" />
                        <Badge variant="outline" className="text-xs" style={getSocieteBadgeStyle(s.nom)}>{s.nom}</Badge>
                      </label>
                    ))}
                  </div>
                  {editForm.societe_ids.length > 0 && <p className="text-xs text-gray-500 mt-1">{editForm.societe_ids.length} societe(s)</p>}
                </div>
              ) : (
                <div>
                  <Label className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> Societe</Label>
                  <Select value={editForm.societe_id || "none"} onValueChange={(v) => setEditForm((f) => ({ ...f, societe_id: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Aucune" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucune</SelectItem>
                      {societes.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.nom}{s.brn ? ` -- ${s.brn}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <PermissionsEditor
                modules={editForm.modules_utilisateur}
                onChange={(m) => setEditForm((f) => ({ ...f, modules_utilisateur: m }))}
                role={editForm.role}
              />
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                <div>
                  <p className="font-medium text-sm text-[#0B0F2E]">Statut du compte</p>
                  <p className="text-xs text-gray-500">{editForm.actif ? "Le compte est actif" : "Le compte est desactive"}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className={`gap-1.5 ${editForm.actif ? "text-emerald-700 border-emerald-300" : "text-gray-500 border-gray-300"}`}
                  onClick={() => setEditForm((f) => ({ ...f, actif: !f.actif }))}
                >
                  {editForm.actif ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {editForm.actif ? "Actif" : "Inactif"}
                </Button>
              </div>
              <Button onClick={handleEdit} disabled={editSaving || !editForm.full_name || !editForm.email} className="w-full bg-[#0B0F2E] hover:bg-[#2a3d66]">
                {editSaving ? "Enregistrement..." : "Enregistrer les modifications"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sprint 12 FEATURE 2 — Dialog changement mot de passe */}
      <Dialog open={pwdOpen} onOpenChange={(o) => { setPwdOpen(o); if (!o) { setPwdUser(null); setPwdValue(""); setPwdSuccess(false) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#0B0F2E]">
              <Key className="w-5 h-5 text-purple-600" />
              Changer le mot de passe
            </DialogTitle>
          </DialogHeader>
          {pwdUser && !pwdSuccess && (
            <div className="space-y-4 pt-2">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium">{pwdUser.full_name || "—"}</p>
                <p className="text-sm text-gray-500">{pwdUser.email}</p>
              </div>
              <div>
                <Label>Nouveau mot de passe</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={pwdVisible ? "text" : "password"}
                      value={pwdValue}
                      onChange={(e) => setPwdValue(e.target.value)}
                      className="font-mono pr-10"
                      placeholder="Mot de passe..."
                    />
                    <button
                      type="button"
                      onClick={() => setPwdVisible((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      title={pwdVisible ? "Masquer" : "Afficher"}
                    >
                      {pwdVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setPwdValue(genPassword())} title="Générer automatiquement">
                    Générer
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Minimum 6 caractères.</p>
              </div>
              <div className="p-3 rounded bg-amber-50 border border-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">Important :</span> le nouveau mot de passe remplace
                  l'ancien immédiatement. Communiquez-le par un canal sécurisé — il ne sera plus visible
                  après la confirmation.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setPwdOpen(false)}>Annuler</Button>
                <Button
                  onClick={handleChangePassword}
                  disabled={pwdSaving || !pwdValue || pwdValue.length < 6}
                  className="flex-1 bg-[#0B0F2E] text-white hover:bg-[#2a3d66]"
                >
                  {pwdSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Key className="w-4 h-4 mr-2" />}
                  Enregistrer
                </Button>
              </div>
            </div>
          )}
          {pwdUser && pwdSuccess && (
            <div className="space-y-4 pt-2">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="font-semibold text-green-800 mb-2 flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  Mot de passe modifié
                </p>
                <div className="space-y-1">
                  <p className="text-sm">Utilisateur : <span className="font-semibold">{pwdUser.full_name || pwdUser.email}</span></p>
                  <p className="text-sm">Email : <span className="font-mono font-bold">{pwdUser.email}</span></p>
                  <p className="text-sm">Nouveau mot de passe : <span className="font-mono font-bold text-lg">{pwdValue}</span></p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => copyToClipboard(pwdValue)}>
                  <Copy className="w-4 h-4 mr-2" /> Copier
                </Button>
                <Button className="flex-1 bg-[#0B0F2E] text-white" onClick={() => setPwdOpen(false)}>
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </ClientPageShell>
  )
}

