"use client"

/**
 * /admin/users — Vue hiérarchique Client → Société → Utilisateurs.
 *
 * Trois sections :
 *   1) Plateforme (admins / super_admins) — toujours expansible
 *   2) Clients     — accordéon : chaque client expand sur ses sociétés,
 *                    chaque société expand sur ses users.
 *   3) Orphelins   — utilisateurs ni admin ni rattachés à un client/société.
 *
 * Barre de recherche globale : filtre par nom, email, nom société, BRN.
 *   Quand on tape, tous les nœuds matchant sont mis en surbrillance et
 *   leurs parents sont auto-expansés (deep-match).
 *
 * Scalabilité :
 *   - 1 seul appel API (/api/admin/users/tree) qui group côté serveur
 *   - Rendu lazy : seuls les nœuds dépliés rendent leurs enfants
 *   - Recherche purement front-end (string match) — passable jusqu'à
 *     ~10 000 users
 */

import { useEffect, useState, useCallback, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  ChevronDown, ChevronRight, Users as UsersIcon, UserCheck, Briefcase, Search,
  Loader2, Plus, Building2, ShieldAlert, Trash2, Power,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"

interface ModulesUtilisateur {
  documents?: boolean; comptabilite?: boolean; facturation?: boolean; rh?: boolean
  fiscal?: boolean; etats_financiers?: boolean; employe_portal?: boolean; telegram?: boolean
}

interface UserCard {
  id: string; full_name: string | null; email: string; role: string
  actif: boolean; phone: string | null
  modules_utilisateur: ModulesUtilisateur | null
  societe_id: string | null
}
interface SocieteNode { id: string; nom: string; brn: string | null; users: UserCard[] }
interface ClientNode {
  id: string; full_name: string | null; email: string; actif: boolean
  societes_count: number; users_count: number; societes: SocieteNode[]
}
interface TreeResponse {
  clients: ClientNode[]; plateforme: UserCard[]; orphelins: UserCard[]
  totals: { users: number; societes: number; clients: number; plateforme: number; orphelins: number }
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-800',
  super_admin: 'bg-red-200 text-red-900',
  comptable: 'bg-blue-100 text-blue-800',
  comptable_dedie: 'bg-blue-100 text-blue-800',
  client_admin: 'bg-green-100 text-green-800',
  client_user: 'bg-green-50 text-green-700',
  client_assistant: 'bg-cyan-100 text-cyan-800',
  rh: 'bg-orange-100 text-orange-800',
  juridique: 'bg-purple-100 text-purple-800',
  manager: 'bg-teal-100 text-teal-800',
  team_leader: 'bg-teal-50 text-teal-700',
  direction: 'bg-indigo-100 text-indigo-800',
  employe: 'bg-gray-100 text-gray-700',
  salarie: 'bg-gray-100 text-gray-700',
}
const ROLE_KEYS = [
  'admin', 'super_admin', 'comptable', 'comptable_dedie',
  'client_admin', 'client_user', 'client_assistant',
  'rh', 'juridique', 'manager', 'team_leader', 'direction', 'employe', 'salarie',
] as const
function roleLabel(role: string, locale: any): string {
  const key = `adm2.users.role_${role}`
  const label = t(key, locale)
  return label === key ? role : label
}
function rolesOptions(locale: any) {
  return ROLE_KEYS.map(value => ({ value, label: roleLabel(value, locale) }))
}

function RoleBadge({ role, locale }: { role: string; locale: any }) {
  return <Badge className={`text-[10px] ${ROLE_COLORS[role] || 'bg-gray-100 text-gray-700'}`}>{roleLabel(role, locale)}</Badge>
}

function matchUser(u: UserCard, q: string, locale: any): boolean {
  if (!q) return true
  const s = q.toLowerCase()
  return (u.full_name || '').toLowerCase().includes(s)
      || u.email.toLowerCase().includes(s)
      || roleLabel(u.role, locale).toLowerCase().includes(s)
}
function matchSociete(s: SocieteNode, q: string, locale: any): boolean {
  if (!q) return true
  const ql = q.toLowerCase()
  return s.nom.toLowerCase().includes(ql)
      || (s.brn || '').toLowerCase().includes(ql)
      || s.users.some(u => matchUser(u, q, locale))
}
function matchClient(c: ClientNode, q: string, locale: any): boolean {
  if (!q) return true
  const ql = q.toLowerCase()
  return (c.full_name || '').toLowerCase().includes(ql)
      || c.email.toLowerCase().includes(ql)
      || c.societes.some(s => matchSociete(s, q, locale))
}

function genPassword() {
  return Math.random().toString(36).slice(2, 8).toUpperCase() + Math.random().toString(36).slice(2, 8)
}

export default function UsersPage() {
  const locale = getLocale()
  const [tree, setTree] = useState<TreeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())
  const [expandedSocietes, setExpandedSocietes] = useState<Set<string>>(new Set())
  const [expandedPlateforme, setExpandedPlateforme] = useState(true)
  const [expandedOrphelins, setExpandedOrphelins] = useState(false)
  const [societes, setSocietes] = useState<Array<{ id: string; nom: string; brn: string }>>([])

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [createSaving, setCreateSaving] = useState(false)
  const [lastPassword, setLastPassword] = useState('')
  const [form, setForm] = useState({
    prenom: '', nom: '', email: '', password: genPassword(),
    role: 'client_admin', societe_id: '',
  })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [tRes, sRes] = await Promise.all([
        fetch('/api/admin/users/tree', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/admin/societes', { cache: 'no-store' }).then(r => r.json()),
      ])
      if (tRes.error) throw new Error(tRes.error)
      setTree(tRes); setSocietes(sRes.societes || [])
    } catch (e: any) {
      setError(e?.message || t('adm2.users.err_generic', locale))
    } finally {
      setLoading(false)
    }
  }, [locale])
  useEffect(() => { load() }, [load])

  // Auto-expand quand la query change : tout client/société qui matche
  // s'auto-ouvre pour montrer le ou les hits.
  useEffect(() => {
    if (!query || !tree) return
    const ec = new Set(expandedClients)
    const es = new Set(expandedSocietes)
    for (const c of tree.clients) {
      if (matchClient(c, query, locale)) {
        ec.add(c.id)
        for (const s of c.societes) {
          if (matchSociete(s, query, locale)) es.add(s.id)
        }
      }
    }
    setExpandedClients(ec); setExpandedSocietes(es)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, tree])

  const expandAll = () => {
    if (!tree) return
    setExpandedClients(new Set(tree.clients.map(c => c.id)))
    setExpandedSocietes(new Set(tree.clients.flatMap(c => c.societes.map(s => s.id))))
    setExpandedPlateforme(true); setExpandedOrphelins(true)
  }
  const collapseAll = () => {
    setExpandedClients(new Set()); setExpandedSocietes(new Set())
    setExpandedPlateforme(false); setExpandedOrphelins(false)
  }

  const toggleClient = (id: string) => {
    const next = new Set(expandedClients)
    if (next.has(id)) next.delete(id); else next.add(id)
    setExpandedClients(next)
  }
  const toggleSociete = (id: string) => {
    const next = new Set(expandedSocietes)
    if (next.has(id)) next.delete(id); else next.add(id)
    setExpandedSocietes(next)
  }

  const filteredClients   = useMemo(() => !tree ? [] : tree.clients.filter(c => matchClient(c, query, locale)), [tree, query, locale])
  const filteredPlateforme = useMemo(() => !tree ? [] : tree.plateforme.filter(u => matchUser(u, query, locale)), [tree, query, locale])
  const filteredOrphelins = useMemo(() => !tree ? [] : tree.orphelins.filter(u => matchUser(u, query, locale)), [tree, query, locale])

  const createUser = async () => {
    if (!form.prenom || !form.nom || !form.email || !form.role) return
    setCreateSaving(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email, password: form.password,
          full_name: `${form.prenom} ${form.nom}`,
          role: form.role, societe_id: form.societe_id || undefined,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || t('adm2.users.err_generic', locale))
      setLastPassword(form.password)
      setCreateOpen(false)
      setForm({ prenom: '', nom: '', email: '', password: genPassword(), role: 'client_admin', societe_id: '' })
      load()
    } catch (e: any) {
      alert(e?.message || t('adm2.users.err_generic', locale))
    } finally {
      setCreateSaving(false)
    }
  }

  const setUserActive = async (u: UserCard, actif: boolean) => {
    await fetch('/api/admin/users', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: u.id, actif }),
    })
    load()
  }
  const deleteUser = async (u: UserCard, hard: boolean) => {
    const verb = hard ? t('adm2.users.confirm_hard', locale) : t('adm2.users.confirm_soft', locale)
    if (!confirm(t('adm2.users.confirm_action', locale).replace('{verb}', verb).replace('{name}', u.full_name || u.email))) return
    const url = hard ? `/api/admin/users?user_id=${u.id}&hard=1` : `/api/admin/users?user_id=${u.id}`
    const res = await fetch(url, { method: 'DELETE' })
    if (res.ok) load(); else alert((await res.json()).error)
  }
  const changeRole = async (u: UserCard, role: string) => {
    await fetch('/api/admin/users', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: u.id, role }),
    })
    load()
  }

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('adm.users.title', locale)}</h1>
          {tree && (
            <p className="text-sm text-gray-500">
              {t('adm2.users.totals', locale).replace('{users}', String(tree.totals.users)).replace('{clients}', String(tree.totals.clients)).replace('{societes}', String(tree.totals.societes))}
            </p>
          )}
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#0B0F2E]"><Plus className="w-4 h-4 mr-1.5" /> {t('adm2.users.new_user', locale)}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{t('adm2.users.create_account', locale)}</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{t('adm2.users.firstname', locale)}</Label><Input value={form.prenom} onChange={e => setForm(f => ({...f, prenom: e.target.value}))} /></div>
                <div><Label>{t('adm2.users.lastname', locale)}</Label><Input value={form.nom} onChange={e => setForm(f => ({...f, nom: e.target.value}))} /></div>
              </div>
              <div><Label>{t('adm2.users.email', locale)}</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} /></div>
              <div>
                <Label>{t('adm2.users.role', locale)}</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({...f, role: v, societe_id: ''}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{rolesOptions(locale).map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {form.role !== 'admin' && form.role !== 'super_admin' && (
                <div>
                  <Label>{t('adm2.users.company_optional', locale)}</Label>
                  <Select value={form.societe_id} onValueChange={v => setForm(f => ({...f, societe_id: v}))}>
                    <SelectTrigger><SelectValue placeholder={t('adm2.users.none', locale)} /></SelectTrigger>
                    <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>{t('adm2.users.password', locale)}</Label>
                <div className="flex gap-2">
                  <Input value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} className="font-mono" />
                  <Button variant="outline" size="sm" onClick={() => setForm(f => ({...f, password: genPassword()}))}>↺</Button>
                </div>
              </div>
              <Button onClick={createUser} disabled={createSaving} className="w-full bg-[#0B0F2E]">
                {createSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {t('adm2.users.create', locale)}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {lastPassword && (
        <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-lg flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-yellow-800">{t('adm2.users.password_to_share', locale)}</p>
            <p className="font-mono text-lg text-yellow-900">{lastPassword}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setLastPassword('')}>✕</Button>
        </div>
      )}

      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder={t('adm2.users.search_placeholder', locale)}
            className="pl-9 h-10"
          />
        </div>
        <Button variant="outline" size="sm" onClick={expandAll}>{t('adm2.users.expand_all', locale)}</Button>
        <Button variant="outline" size="sm" onClick={collapseAll}>{t('adm2.users.collapse_all', locale)}</Button>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-800 text-sm rounded-lg">{error}</div>}

      {loading ? (
        <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" /></div>
      ) : !tree ? (
        <div className="text-center text-gray-500 py-12">{t('adm2.users.no_data', locale)}</div>
      ) : (
        <div className="space-y-4">

          {filteredPlateforme.length > 0 && (
            <Section
              icon={ShieldAlert} title={t('adm2.users.platform_title', locale)} subtitle={t('adm2.users.platform_subtitle', locale)}
              count={filteredPlateforme.length} open={expandedPlateforme} onToggle={() => setExpandedPlateforme(!expandedPlateforme)}
            >
              <div className="space-y-1.5">
                {filteredPlateforme.map(u => (
                  <UserRow key={u.id} u={u} locale={locale} onActive={setUserActive} onDelete={deleteUser} onRoleChange={changeRole} />
                ))}
              </div>
            </Section>
          )}

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Briefcase className="w-5 h-5 text-[#0B0F2E]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#0B0F2E]">
                {t('adm2.users.clients_count', locale).replace('{count}', String(filteredClients.length)).replace('{extra}', query ? t('adm2.users.clients_of', locale).replace('{total}', String(tree.clients.length)) : '')}
              </h2>
            </div>
            {filteredClients.length === 0 ? (
              <Empty text={query ? t('adm2.users.no_client_match', locale).replace('{query}', query) : t('adm2.users.no_client', locale)} />
            ) : (
              <div className="space-y-2">
                {filteredClients.map(c => (
                  <ClientCard
                    key={c.id} client={c} query={query} locale={locale}
                    expanded={expandedClients.has(c.id)} onToggle={() => toggleClient(c.id)}
                    expandedSocietes={expandedSocietes} onToggleSociete={toggleSociete}
                    onUserActive={setUserActive} onUserDelete={deleteUser} onRoleChange={changeRole}
                  />
                ))}
              </div>
            )}
          </div>

          {filteredOrphelins.length > 0 && (
            <Section
              icon={UserCheck} title={t('adm2.users.orphans_title', locale)} subtitle={t('adm2.users.orphans_subtitle', locale)}
              count={filteredOrphelins.length} open={expandedOrphelins} onToggle={() => setExpandedOrphelins(!expandedOrphelins)}
            >
              <div className="space-y-1.5">
                {filteredOrphelins.map(u => (
                  <UserRow key={u.id} u={u} locale={locale} onActive={setUserActive} onDelete={deleteUser} onRoleChange={changeRole} />
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
    </ClientPageShell>
  )
}

function Section({ icon: Icon, title, subtitle, count, open, onToggle, children }: {
  icon: any; title: string; subtitle: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <Card>
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 rounded-t-lg">
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-[#0B0F2E]" />
          <div className="text-left">
            <p className="font-semibold text-[#0B0F2E]">{title} <span className="text-xs font-normal text-gray-400">({count})</span></p>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <CardContent className="px-4 pb-4 pt-0">{children}</CardContent>}
    </Card>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="text-center text-gray-400 text-sm py-8 bg-white rounded-lg border border-dashed">{text}</div>
}

function ClientCard({ client, query, locale, expanded, onToggle, expandedSocietes, onToggleSociete, onUserActive, onUserDelete, onRoleChange }: {
  client: ClientNode; query: string; locale: any; expanded: boolean; onToggle: () => void
  expandedSocietes: Set<string>; onToggleSociete: (id: string) => void
  onUserActive: (u: UserCard, a: boolean) => void
  onUserDelete: (u: UserCard, h: boolean) => void
  onRoleChange: (u: UserCard, r: string) => void
}) {
  const visibleSocietes = client.societes.filter(s => matchSociete(s, query, locale))
  return (
    <Card className={!client.actif ? 'opacity-60' : ''}>
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 rounded-t-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#D4AF37] flex items-center justify-center text-[#0B0F2E] font-bold text-sm">
            {(client.full_name || client.email).slice(0, 2).toUpperCase()}
          </div>
          <div className="text-left">
            <p className="font-semibold text-[#0B0F2E]">{client.full_name || '—'}</p>
            <p className="text-xs text-gray-500">{client.email}</p>
          </div>
          <Badge className="bg-amber-50 text-amber-800 border border-amber-200">{t('adm2.users.badge_client', locale)}</Badge>
          {!client.actif && <Badge className="bg-gray-100 text-gray-600">{t('adm2.users.badge_inactive', locale)}</Badge>}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1 text-gray-500">
            <Building2 className="w-3.5 h-3.5" />
            {client.societes_count} {client.societes_count > 1 ? t('adm2.users.societe_many', locale) : t('adm2.users.societe_one', locale)}
          </span>
          <span className="inline-flex items-center gap-1 text-gray-500">
            <UsersIcon className="w-3.5 h-3.5" />
            {client.users_count} {client.users_count > 1 ? t('adm2.users.user_many', locale) : t('adm2.users.user_one', locale)}
          </span>
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {expanded && (
        <CardContent className="px-4 pb-4 pt-0 space-y-2">
          {visibleSocietes.length === 0 ? (
            <Empty text={t('adm2.users.no_company_linked', locale)} />
          ) : visibleSocietes.map(s => (
            <SocieteCard
              key={s.id} societe={s} query={query} locale={locale}
              expanded={expandedSocietes.has(s.id)} onToggle={() => onToggleSociete(s.id)}
              onUserActive={onUserActive} onUserDelete={onUserDelete} onRoleChange={onRoleChange}
            />
          ))}
        </CardContent>
      )}
    </Card>
  )
}

function SocieteCard({ societe, query, locale, expanded, onToggle, onUserActive, onUserDelete, onRoleChange }: {
  societe: SocieteNode; query: string; locale: any; expanded: boolean; onToggle: () => void
  onUserActive: (u: UserCard, a: boolean) => void
  onUserDelete: (u: UserCard, h: boolean) => void
  onRoleChange: (u: UserCard, r: string) => void
}) {
  const visibleUsers = societe.users.filter(u => matchUser(u, query, locale))
  return (
    <div className="border rounded-lg bg-gray-50/40">
      <button onClick={onToggle} className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-100 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-700" />
          <div className="text-left">
            <p className="font-medium text-sm text-[#0B0F2E]">{societe.nom}</p>
            {societe.brn && <p className="text-[10px] text-gray-500 font-mono">BRN {societe.brn}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <UsersIcon className="w-3 h-3" />
          {societe.users.length}
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-1">
          {visibleUsers.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">{t('adm2.users.no_user_match', locale)}</p>
          ) : visibleUsers.map(u => (
            <UserRow key={u.id} u={u} locale={locale} onActive={onUserActive} onDelete={onUserDelete} onRoleChange={onRoleChange} />
          ))}
        </div>
      )}
    </div>
  )
}

function UserRow({ u, locale, onActive, onDelete, onRoleChange }: {
  u: UserCard
  locale: any
  onActive: (u: UserCard, a: boolean) => void
  onDelete: (u: UserCard, h: boolean) => void
  onRoleChange: (u: UserCard, r: string) => void
}) {
  return (
    <div className={`flex items-center justify-between gap-2 p-2 bg-white border rounded ${!u.actif ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="w-8 h-8 rounded-full bg-[#0B0F2E] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {(u.full_name || u.email).slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{u.full_name || '—'}</p>
          <p className="text-[10px] text-gray-500 truncate">{u.email}</p>
        </div>
        <RoleBadge role={u.role} locale={locale} />
        {!u.actif && <Badge className="bg-gray-100 text-gray-600 text-[10px]">{t('adm2.users.badge_inactive', locale)}</Badge>}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Select value={u.role} onValueChange={v => onRoleChange(u, v)}>
          <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{rolesOptions(locale).map(r => <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>)}</SelectContent>
        </Select>
        {u.actif ? (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-amber-600" onClick={() => onActive(u, false)} title={t('adm2.users.deactivate', locale)}>
            <Power className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-emerald-600" onClick={() => onActive(u, true)} title={t('adm2.users.reactivate', locale)}>
            <Power className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-7 px-2 text-red-600" onClick={() => onDelete(u, true)} title={t('adm2.users.delete_perm', locale)}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}
