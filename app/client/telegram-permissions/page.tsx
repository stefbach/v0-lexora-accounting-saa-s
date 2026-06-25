"use client"
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Shield, MessageCircle, AlertCircle, CheckCircle2, XCircle, Activity, Users, Copy, Link2, Trash2, Settings2, RotateCcw } from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale, type Locale } from "@/lib/i18n"
import { PageHelp } from "@/components/help/PageHelp"

const roleLabel = (role: string, locale: Locale) => t(`tg.role.${role}`, locale)
const capLabel = (cap: string, locale: Locale) => t(`tg.cap.${cap}`, locale)

const ROLE_COLORS: Record<string, string> = {
  employe: "bg-slate-100 text-slate-700 border-slate-300",
  manager: "bg-blue-100 text-blue-700 border-blue-300",
  rh: "bg-amber-100 text-amber-700 border-amber-300",
  comptable: "bg-cyan-100 text-cyan-700 border-cyan-300",
  comptable_dedie: "bg-cyan-100 text-cyan-700 border-cyan-300",
  direction: "bg-emerald-100 text-emerald-700 border-emerald-300",
  client_admin: "bg-emerald-100 text-emerald-700 border-emerald-300",
  admin: "bg-red-100 text-red-700 border-red-300",
  super_admin: "bg-purple-100 text-purple-700 border-purple-300",
}

const ALL_ROLES = ['employe', 'manager', 'rh', 'comptable', 'comptable_dedie', 'direction', 'client_admin', 'admin']

// Capabilities par défaut par rôle (synchro avec lib/telegram/internal-auth.ts).
// Utilisé côté UI uniquement pour pré-cocher le modal Permissions en mode pending
// (avant que l'employé ait un user_societes record).
const DEFAULT_CAPS_BY_ROLE: Record<string, string[]> = {
  employe: ['view_help', 'switch_societe', 'logout', 'view_my_payslip', 'view_my_leave_balance', 'request_leave'],
  manager: ['view_help', 'switch_societe', 'logout', 'view_my_payslip', 'view_my_leave_balance', 'request_leave',
            'view_team_kpis', 'approve_team_leave', 'view_team_pending'],
  rh: ['view_help', 'switch_societe', 'logout', 'view_my_payslip', 'view_team_kpis', 'add_ot', 'add_bonus',
       'compute_payroll', 'export_mra', 'view_employees', 'manage_leave_settings'],
  comptable: ['view_help', 'switch_societe', 'logout', 'view_kpis', 'view_bank', 'create_invoice',
              'view_tax_calendar', 'export_mra', 'reconcile_bank', 'view_audit_log'],
  comptable_dedie: ['view_help', 'switch_societe', 'logout', 'view_kpis', 'view_bank', 'create_invoice',
                    'view_tax_calendar', 'export_mra', 'reconcile_bank', 'view_audit_log'],
  direction: ['view_help', 'switch_societe', 'logout', 'view_kpis', 'view_bank', 'view_tax_calendar',
              'create_invoice', 'compute_payroll', 'approve_payroll', 'export_mra', 'approve_team_leave',
              'view_audit_log', 'manage_alerts_config'],
  client_admin: ['view_help', 'switch_societe', 'logout', 'view_kpis', 'view_bank', 'view_tax_calendar',
                 'create_invoice', 'compute_payroll', 'approve_payroll', 'export_mra', 'approve_team_leave',
                 'view_audit_log', 'manage_alerts_config'],
  admin: ['ALL'],
}

type PermissionsModalState = {
  mode: 'live' | 'pending'
  user_id: string | null     // null en mode pending
  employe_id?: string         // présent en mode pending
  nom: string
  role: string
  selected: Set<string>
  defaults: string[]
}

export default function TelegramPermissionsPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [members, setMembers] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [allCapabilities, setAllCapabilities] = useState<string[]>([])
  const [capsOverrideSupported, setCapsOverrideSupported] = useState<boolean>(true)
  const [botUsername, setBotUsername] = useState<string>('LexoraBot')
  const [roleMatrix, setRoleMatrix] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [generatingFor, setGeneratingFor] = useState<string | null>(null)
  const [codeModal, setCodeModal] = useState<null | { employe_id: string; nom: string; code: string; deep_link: string; share_message: string }>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [permsModal, setPermsModal] = useState<PermissionsModalState | null>(null)
  const [savingPerms, setSavingPerms] = useState(false)
  // Rôle souhaité au moment de générer le code (par employé sans compte)
  const [pendingRoleByEmpId, setPendingRoleByEmpId] = useState<Record<string, string>>({})
  // Capabilities pré-configurées avant rattachement (par employé sans compte)
  const [pendingCapsByEmpId, setPendingCapsByEmpId] = useState<Record<string, string[]>>({})

  const load = async () => {
    if (!societeId) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/client/telegram-permissions?societe_id=${societeId}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || t('tg.common.error', locale))
      setMembers(j.members || [])
      setEmployees(j.employees || [])
      setAllCapabilities(j.all_capabilities || [])
      setCapsOverrideSupported(j.capabilities_override_supported !== false)
      setRoleMatrix(j.role_matrix || {})
      setBotUsername(j.bot_username || 'LexoraBot')
    } catch (e: any) { setError(e?.message || t('tg.common.error', locale)) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId])

  // Dédup : un employé déjà membre (auth_user_id présent dans user_societes) est
  // déjà affiché dans la section Membres → on ne le ré-affiche pas en Employés.
  const employeesNotYetMembers = useMemo(
    () => employees.filter(e => !e.is_member),
    [employees],
  )

  // Map employé pour enrichir l'affichage Membres (poste, code RH, lien)
  const employeByUserId = useMemo(() => {
    const m = new Map<string, any>()
    for (const e of employees) {
      if (e.auth_user_id) m.set(e.auth_user_id, e)
    }
    return m
  }, [employees])

  const openPermsModal = (user_id: string, nom: string, role: string, current: string[], defaults: string[]) => {
    setPermsModal({
      mode: 'live',
      user_id,
      nom,
      role,
      defaults,
      selected: new Set(current),
    })
  }

  // Modal en mode "pending" : pour un employé pas encore rattaché.
  // L'enregistrement met à jour pendingCapsByEmpId — les caps seront appliquées
  // au moment du Générer code (POST employee-code body.capabilities).
  const openPendingPermsModal = (employe_id: string, nom: string) => {
    const role = pendingRoleByEmpId[employe_id] || 'employe'
    const defaults = DEFAULT_CAPS_BY_ROLE[role] || []
    const current = pendingCapsByEmpId[employe_id] ?? defaults
    setPermsModal({
      mode: 'pending',
      user_id: null,
      employe_id,
      nom,
      role,
      defaults,
      selected: new Set(current),
    })
  }

  const togglePermCap = (cap: string) => {
    if (!permsModal) return
    const next = new Set(permsModal.selected)
    if (next.has(cap)) next.delete(cap)
    else next.add(cap)
    setPermsModal({ ...permsModal, selected: next })
  }

  const resetPermsToRole = () => {
    if (!permsModal) return
    setPermsModal({ ...permsModal, selected: new Set(permsModal.defaults) })
  }

  const savePerms = async (reset = false) => {
    if (!permsModal) return

    // Mode pending : on stocke localement, l'application se fait au Générer code.
    if (permsModal.mode === 'pending' && permsModal.employe_id) {
      setPendingCapsByEmpId(prev => {
        const next = { ...prev }
        if (reset) {
          delete next[permsModal.employe_id!]
        } else {
          next[permsModal.employe_id!] = Array.from(permsModal.selected)
        }
        return next
      })
      setPermsModal(null)
      return
    }

    // Mode live : PATCH user_societes
    if (!permsModal.user_id) return
    setSavingPerms(true); setError(null)
    try {
      const r = await fetch(`/api/client/telegram-permissions?societe_id=${societeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: permsModal.user_id,
          capabilities: reset ? null : Array.from(permsModal.selected),
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || t('tg.common.error', locale))
      setPermsModal(null)
      await load()
    } catch (e: any) { setError(e?.message || t('tg.common.error', locale)) } finally { setSavingPerms(false) }
  }

  const generateCode = async (employe_id: string, nom: string, role: string = 'employe') => {
    setGeneratingFor(employe_id); setError(null)
    const customCaps = pendingCapsByEmpId[employe_id]
    try {
      const r = await fetch('/api/client/telegram-permissions/employee-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societe_id: societeId,
          employe_id,
          role,
          // Transmis SEULEMENT si l'admin a configuré des caps custom dans le modal pending
          ...(customCaps ? { capabilities: customCaps } : {}),
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || t('tg.common.error', locale))
      setCodeModal({ employe_id, nom, code: j.code, deep_link: j.deep_link, share_message: j.share_message })
      // Nettoie l'état pending pour cet employé (les caps sont maintenant en DB)
      setPendingCapsByEmpId(prev => {
        const next = { ...prev }
        delete next[employe_id]
        return next
      })
      await load()
    } catch (e: any) { setError(e?.message || t('tg.common.error', locale)) } finally { setGeneratingFor(null) }
  }

  const updateEmployeeRole = async (auth_user_id: string, newRole: string) => {
    setSavingUserId(auth_user_id); setError(null)
    try {
      const r = await fetch(`/api/client/telegram-permissions?societe_id=${societeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: auth_user_id, role: newRole }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || t('tg.common.error', locale))
      await load()
    } catch (e: any) { setError(e?.message || t('tg.common.error', locale)) } finally { setSavingUserId(null) }
  }

  const unlinkEmployee = async (employe_id: string, nom: string) => {
    if (!confirm(`${t('tg.perms.unlinkConfirm1', locale)} ${nom} ${t('tg.perms.unlinkConfirm2', locale)}`)) return
    setError(null)
    try {
      const r = await fetch(`/api/client/telegram-permissions/employee-code?societe_id=${societeId}&employe_id=${employe_id}`, { method: 'DELETE' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || t('tg.common.error', locale))
      await load()
    } catch (e: any) { setError(e?.message || t('tg.common.error', locale)) }
  }

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch { /* ignore */ }
  }

  const updateRole = async (user_id: string, newRole: string) => {
    setSavingUserId(user_id); setError(null)
    try {
      const r = await fetch(`/api/client/telegram-permissions?societe_id=${societeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id, role: newRole }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || t('tg.common.error', locale))
      await load()
    } catch (e: any) { setError(e?.message || t('tg.common.error', locale)) } finally { setSavingUserId(null) }
  }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('tg.perms.noSociete', locale)}</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin h-5 w-5" /> {t('tg.perms.loading', locale)}</div>

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6 text-emerald-600" /> {t('tg.perms.title', locale)}</h1>
          <p className="text-sm text-slate-500">{t('tg.perms.subtitle', locale)}</p>
        </div>
        <PageHelp />
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2"><AlertCircle className="h-4 w-4 mt-0.5" />{error}</div>}

      {/* ── Qui peut paramétrer le bot ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4 text-emerald-600" /> {t('tg.perms.accessTitle', locale)}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <p className="text-slate-600">{t('tg.perms.accessIntro', locale)}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border rounded p-3 bg-emerald-50/50">
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300" variant="outline">{roleLabel('client_admin', locale)}</Badge>
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300" variant="outline">{roleLabel('direction', locale)}</Badge>
              </div>
              <p className="text-slate-700">
                <strong>{t('tg.perms.ownerTitle', locale)}</strong> {t('tg.perms.ownerDesc', locale)}
              </p>
            </div>
            <div className="border rounded p-3 bg-amber-50/50">
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-amber-100 text-amber-700 border-amber-300" variant="outline">{roleLabel('rh', locale)}</Badge>
              </div>
              <p className="text-slate-700">
                <strong>{t('tg.perms.rhTitle', locale)}</strong> {t('tg.perms.rhDesc', locale)}
              </p>
            </div>
            <div className="border rounded p-3 bg-red-50/50">
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-red-100 text-red-700 border-red-300" variant="outline">{roleLabel('admin', locale)}</Badge>
                <Badge className="bg-purple-100 text-purple-700 border-purple-300" variant="outline">{roleLabel('super_admin', locale)}</Badge>
              </div>
              <p className="text-slate-700">
                <strong>{t('tg.perms.lexoraTitle', locale)}</strong> {t('tg.perms.lexoraDesc', locale)}
              </p>
            </div>
            <div className="border rounded p-3 bg-slate-50">
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-slate-100 text-slate-600 border-slate-300" variant="outline">{roleLabel('comptable', locale)}</Badge>
                <Badge className="bg-blue-100 text-blue-700 border-blue-300" variant="outline">{roleLabel('manager', locale)}</Badge>
                <Badge className="bg-slate-100 text-slate-600 border-slate-300" variant="outline">{roleLabel('employe', locale)}</Badge>
              </div>
              <p className="text-slate-700">
                <strong>{t('tg.perms.noAccessTitle', locale)}</strong> {t('tg.perms.noAccessDesc', locale)}
              </p>
            </div>
          </div>
          <div className="text-xs text-slate-500 italic mt-2">
            {t('tg.perms.matrixHint', locale)}
          </div>
        </CardContent>
      </Card>

      {!capsOverrideSupported && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <div>
            <strong>{t('tg.perms.migrationMissing', locale)}</strong> {t('tg.perms.migrationMissingDesc1', locale)} <code className="bg-amber-100 px-1 rounded">supabase/migrations/266_user_telegram_capabilities.sql</code> {t('tg.perms.migrationMissingDesc2', locale)}
          </div>
        </div>
      )}

      {/* ── Matrice rôles → capabilities ── */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('tg.perms.matrixTitle', locale)}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {ALL_ROLES.map(r => roleMatrix[r] && (
              <div key={r} className="flex items-start gap-3 border-b pb-3 last:border-0">
                <Badge className={`${ROLE_COLORS[r]} text-xs whitespace-nowrap`} variant="outline">
                  {roleLabel(r, locale)} <span className="opacity-50 ml-1">L{roleMatrix[r]?.level}</span>
                </Badge>
                <div className="flex-1">
                  <div className="text-sm text-slate-700">{roleMatrix[r]?.description}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Membres de la société + leurs rôles ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>{t('tg.perms.membersTitle', locale)} ({members.length})</span>
            <Button onClick={load} variant="outline" size="sm">{t('tg.perms.refresh', locale)}</Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">{t('tg.perms.noMembers', locale)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 px-2">{t('tg.perms.colName', locale)}</th>
                    <th className="py-2 px-2">{t('tg.perms.colEmail', locale)}</th>
                    <th className="py-2 px-2">{t('tg.perms.colTelegram', locale)}</th>
                    <th className="py-2 px-2">{t('tg.perms.colRole', locale)}</th>
                    <th className="py-2 px-2">{t('tg.perms.colCaps', locale)}</th>
                    <th className="py-2 px-2 text-right">{t('tg.perms.colAudit', locale)}</th>
                    <th className="py-2 px-2 text-right">{t('tg.perms.colActions', locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m: any) => {
                    const emp = employeByUserId.get(m.user_id)
                    return (
                    <tr key={m.user_id} className="border-b">
                      <td className="py-2 px-2 font-medium">
                        {m.full_name}
                        {emp && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {t('tg.perms.rhEmployee', locale)} {emp.code ? `· ${emp.code}` : ''} {emp.poste ? `· ${emp.poste}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2 text-xs text-slate-600">{m.email}</td>
                      <td className="py-2 px-2">
                        {m.telegram?.linked ? (
                          <div className="flex items-center gap-1">
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-xs">
                              <MessageCircle className="h-3 w-3 mr-1" />@{m.telegram.telegram_username || m.telegram.firstname || t('tg.perms.linked', locale)}
                            </Badge>
                            {!m.telegram.active_for_this_societe && (
                              <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">{t('tg.perms.otherSocieteActive', locale)}</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">{t('tg.perms.notLinked', locale)}</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <Select value={m.role} onValueChange={(v) => updateRole(m.user_id, v)} disabled={savingUserId === m.user_id}>
                          <SelectTrigger className="w-44 h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ALL_ROLES.map(r => (
                              <SelectItem key={r} value={r}>
                                {roleLabel(r, locale)} <span className="opacity-50 ml-1 text-xs">L{roleMatrix[r]?.level}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {savingUserId === m.user_id && <Loader2 className="inline animate-spin h-3 w-3 ml-2 text-slate-400" />}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex flex-wrap items-center gap-1 max-w-md">
                          {m.is_custom && <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-[10px]">{t('tg.perms.custom', locale)}</Badge>}
                          {(m.effective_capabilities || []).slice(0, 6).map((c: string) => (
                            <span key={c} className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">{capLabel(c, locale)}</span>
                          ))}
                          {(m.effective_capabilities || []).length > 6 && <span className="text-[10px] text-slate-400">+{m.effective_capabilities.length - 6}</span>}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right">
                        {m.audit_stats.total > 0 ? (
                          <div className="flex items-center justify-end gap-2 text-xs">
                            <span className="text-emerald-700 inline-flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" />{m.audit_stats.success}</span>
                            {m.audit_stats.denied > 0 && <span className="text-amber-700 inline-flex items-center gap-0.5"><XCircle className="h-3 w-3" />{m.audit_stats.denied}</span>}
                            {m.audit_stats.error > 0 && <span className="text-red-700 inline-flex items-center gap-0.5"><AlertCircle className="h-3 w-3" />{m.audit_stats.error}</span>}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">{t('tg.perms.noAction', locale)}</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <Button
                          onClick={() => openPermsModal(m.user_id, m.full_name, m.role, m.effective_capabilities || [], m.default_capabilities || [])}
                          variant="outline" size="sm">
                          <Settings2 className="h-3 w-3 mr-1" /> {t('tg.perms.permissions', locale)}
                        </Button>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Employés RH non encore membres ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2"><Users className="h-4 w-4 text-blue-600" /> {t('tg.perms.unlinkedEmployeesTitle', locale)} ({employeesNotYetMembers.length})</span>
            <Button onClick={load} variant="outline" size="sm">{t('tg.perms.refresh', locale)}</Button>
          </CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            {t('tg.perms.unlinkedEmployeesDesc', locale)}
          </p>
        </CardHeader>
        <CardContent>
          {employeesNotYetMembers.length === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">{t('tg.perms.allLinked', locale)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 px-2">{t('tg.perms.colCode', locale)}</th>
                    <th className="py-2 px-2">{t('tg.perms.colFullName', locale)}</th>
                    <th className="py-2 px-2">{t('tg.perms.colPoste', locale)}</th>
                    <th className="py-2 px-2">{t('tg.perms.colEmail', locale)}</th>
                    <th className="py-2 px-2">{t('tg.perms.colTelegramRole', locale)}</th>
                    <th className="py-2 px-2">{t('tg.perms.colCapsShort', locale)}</th>
                    <th className="py-2 px-2">{t('tg.perms.colTelegram', locale)}</th>
                    <th className="py-2 px-2 text-right">{t('tg.perms.colActions', locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {employeesNotYetMembers.map((e: any) => {
                    const desiredRole = pendingRoleByEmpId[e.employe_id] || 'employe'
                    return (
                    <tr key={e.employe_id} className="border-b">
                      <td className="py-2 px-2 font-mono text-xs">{e.code || '—'}</td>
                      <td className="py-2 px-2 font-medium">{e.nom_complet}</td>
                      <td className="py-2 px-2 text-xs text-slate-600">{e.poste || '—'}</td>
                      <td className="py-2 px-2 text-xs text-slate-600">{e.email || <span className="text-amber-700">{t('tg.perms.emailMissing', locale)}</span>}</td>
                      <td className="py-2 px-2">
                        {e.has_auth_user && e.role ? (
                          // Employé déjà rattaché → éditable directement
                          <div className="flex items-center gap-2">
                            <Select
                              value={e.role}
                              onValueChange={(v) => updateEmployeeRole(e.auth_user_id, v)}
                              disabled={savingUserId === e.auth_user_id}>
                              <SelectTrigger className="w-40 h-8 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ALL_ROLES.map(r => (
                                  <SelectItem key={r} value={r}>
                                    {roleLabel(r, locale)} <span className="opacity-50 ml-1 text-xs">L{roleMatrix[r]?.level}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {savingUserId === e.auth_user_id && <Loader2 className="animate-spin h-3 w-3 text-slate-400" />}
                          </div>
                        ) : (
                          // Pas encore de compte → sélection du rôle à attribuer au moment du code
                          <Select
                            value={desiredRole}
                            onValueChange={(v) => setPendingRoleByEmpId(prev => ({ ...prev, [e.employe_id]: v }))}>
                            <SelectTrigger className="w-40 h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ALL_ROLES.map(r => (
                                <SelectItem key={r} value={r}>
                                  {roleLabel(r, locale)} <span className="opacity-50 ml-1 text-xs">L{roleMatrix[r]?.level}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex flex-wrap items-center gap-1 max-w-xs">
                          {(() => {
                            const pendingCaps = pendingCapsByEmpId[e.employe_id]
                            const effective = pendingCaps ?? (e.effective_capabilities || (DEFAULT_CAPS_BY_ROLE[desiredRole] || []))
                            const isCustom = !!pendingCaps || e.is_custom
                            return (
                              <>
                                {pendingCaps && <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-[10px]">{t('tg.perms.preconfigured', locale)}</Badge>}
                                {!pendingCaps && e.is_custom && <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-[10px]">{t('tg.perms.custom', locale)}</Badge>}
                                {effective.slice(0, 4).map((c: string) => (
                                  <span key={c} className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">{capLabel(c, locale)}</span>
                                ))}
                                {effective.length > 4 && <span className="text-[10px] text-slate-400">+{effective.length - 4}</span>}
                                {effective.length === 0 && <span className="text-[10px] text-slate-400">{t('tg.perms.none', locale)}</span>}
                              </>
                            )
                          })()}
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        {e.telegram_status === 'linked' ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-xs">
                            <MessageCircle className="h-3 w-3 mr-1" />@{e.telegram_username || t('tg.perms.linked', locale)}
                          </Badge>
                        ) : e.telegram_status === 'pending_code' ? (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">{t('tg.perms.codePending', locale)}</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">{t('tg.perms.notLinked', locale)}</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <div className="flex gap-2 justify-end">
                          {/* Bouton Permissions : live si user_societes existe, pending sinon */}
                          {e.has_auth_user && e.role ? (
                            <Button
                              onClick={() => openPermsModal(e.auth_user_id, e.nom_complet, e.role, e.effective_capabilities || [], e.default_capabilities || [])}
                              variant="outline" size="sm">
                              <Settings2 className="h-3 w-3 mr-1" /> {t('tg.perms.permissions', locale)}
                            </Button>
                          ) : (
                            <Button
                              onClick={() => openPendingPermsModal(e.employe_id, e.nom_complet)}
                              variant="outline" size="sm">
                              <Settings2 className="h-3 w-3 mr-1" />
                              {t('tg.perms.permissions', locale)} {pendingCapsByEmpId[e.employe_id] && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                            </Button>
                          )}
                          {e.telegram_status === 'linked' ? (
                            <Button
                              onClick={() => unlinkEmployee(e.employe_id, e.nom_complet)}
                              variant="outline" size="sm"
                              className="text-red-700 border-red-200 hover:bg-red-50">
                              <Trash2 className="h-3 w-3 mr-1" /> {t('tg.perms.unlink', locale)}
                            </Button>
                          ) : (
                            <Button
                              onClick={() => generateCode(e.employe_id, e.nom_complet, desiredRole)}
                              disabled={generatingFor === e.employe_id || !e.email}
                              size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                              {generatingFor === e.employe_id
                                ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                : <Link2 className="h-3 w-3 mr-1" />}
                              {t('tg.perms.generateCode', locale)}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-slate-500 flex items-start gap-2 p-3 rounded bg-slate-50 border border-slate-200">
        <Activity className="h-4 w-4 mt-0.5" />
        <div>
          {t('tg.perms.auditNote', locale)} <code>telegram_actions</code> {t('tg.perms.auditNote2', locale)}
        </div>
      </div>

      {/* ── Modal Permissions personnalisées ── */}
      {permsModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPermsModal(null)}>
          <div className="bg-white rounded-lg max-w-3xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-emerald-600" />
                  {t('tg.perms.modalPermsOf', locale)} {permsModal.nom}
                </h3>
                <div className="text-xs text-slate-500 mt-1">
                  {t('tg.perms.currentRole', locale)} : <Badge className={`${ROLE_COLORS[permsModal.role]} text-xs ml-1`} variant="outline">{roleLabel(permsModal.role, locale)}</Badge>
                  <span className="ml-2">{permsModal.selected.size} {t('tg.perms.capsChecked', locale)}</span>
                </div>
              </div>
              <button onClick={() => setPermsModal(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              {permsModal.mode === 'pending' ? (
                <>
                  <strong>{t('tg.perms.pendingInfoTitle', locale)}</strong> {t('tg.perms.pendingInfo1', locale)} <strong>{roleLabel(permsModal.role, locale)}</strong> {t('tg.perms.pendingInfo2', locale)}
                </>
              ) : (
                <>
                  <strong>{t('tg.perms.customInfoTitle', locale)}</strong> {t('tg.perms.customInfo', locale)}
                </>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-2 border rounded p-2">
              {allCapabilities.map(cap => {
                const checked = permsModal.selected.has(cap)
                const isDefault = permsModal.defaults.includes(cap)
                return (
                  <label
                    key={cap}
                    className={`flex items-start gap-2 p-2 rounded border text-xs cursor-pointer ${
                      checked
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePermCap(cap)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="font-medium flex items-center gap-2">
                        {capLabel(cap, locale)}
                        {isDefault && <Badge className="bg-slate-100 text-slate-600 border-slate-300 text-[9px]">{t('tg.perms.defaultRole', locale)}</Badge>}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">{cap}</div>
                    </div>
                  </label>
                )
              })}
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <Button
                onClick={resetPermsToRole}
                variant="outline" size="sm">
                <RotateCcw className="h-3 w-3 mr-1" /> {t('tg.perms.resetToRole', locale)}
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={() => savePerms(true)}
                  disabled={savingPerms}
                  variant="outline" size="sm" className="text-amber-700 border-amber-200">
                  {permsModal.mode === 'pending' ? t('tg.perms.reset', locale) : t('tg.perms.removeOverride', locale)}
                </Button>
                <Button
                  onClick={() => setPermsModal(null)}
                  variant="outline" size="sm">
                  {t('tg.perms.cancel', locale)}
                </Button>
                <Button
                  onClick={() => savePerms(false)}
                  disabled={savingPerms}
                  size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {savingPerms && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                  {permsModal.mode === 'pending' ? t('tg.perms.saveForLink', locale) : t('tg.perms.save', locale)}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal code généré ── */}
      {codeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setCodeModal(null)}>
          <div className="bg-white rounded-lg max-w-lg w-full p-6 space-y-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-emerald-600" />
                {t('tg.perms.codeModalTitle', locale)} {codeModal.nom}
              </h3>
              <button onClick={() => setCodeModal(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="rounded border border-emerald-200 bg-emerald-50 p-4 space-y-2">
              <div className="text-xs uppercase text-emerald-700 font-medium">{t('tg.perms.verifCode', locale)}</div>
              <div className="flex items-center gap-2">
                <code className="text-3xl font-mono font-bold tracking-wider text-emerald-900">{codeModal.code}</code>
                <Button
                  onClick={() => copyToClipboard(codeModal.code, 'code')}
                  variant="outline" size="sm">
                  <Copy className="h-3 w-3 mr-1" />
                  {copied === 'code' ? t('tg.perms.copied', locale) : t('tg.perms.copy', locale)}
                </Button>
              </div>
              <div className="text-xs text-emerald-700">{t('tg.perms.expires15', locale)}</div>
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase text-slate-500 font-medium">{t('tg.perms.deepLink', locale)}</div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={codeModal.deep_link}
                  className="flex-1 text-xs font-mono bg-slate-50 border border-slate-200 rounded px-2 py-1.5"
                />
                <Button
                  onClick={() => copyToClipboard(codeModal.deep_link, 'link')}
                  variant="outline" size="sm">
                  <Copy className="h-3 w-3 mr-1" />
                  {copied === 'link' ? t('tg.perms.copied', locale) : t('tg.perms.copy', locale)}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase text-slate-500 font-medium">{t('tg.perms.shareMessage', locale)}</div>
              <textarea
                readOnly
                value={codeModal.share_message}
                rows={7}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded p-2 font-mono"
              />
              <Button
                onClick={() => copyToClipboard(codeModal.share_message, 'msg')}
                variant="outline" size="sm" className="w-full">
                <Copy className="h-3 w-3 mr-1" />
                {copied === 'msg' ? t('tg.perms.copiedClipboard', locale) : t('tg.perms.copyFullMessage', locale)}
              </Button>
            </div>

            <div className="text-xs text-slate-500 border-t pt-3">
              {t('tg.perms.accountCreatedNote', locale)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
