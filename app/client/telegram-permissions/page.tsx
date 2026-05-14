"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Shield, MessageCircle, AlertCircle, CheckCircle2, XCircle, Activity, Users, Copy, Link2, Trash2 } from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale } from "@/lib/i18n"

const ROLE_LABELS: Record<string, string> = {
  employe: "Employé",
  manager: "Manager",
  rh: "RH",
  comptable: "Comptable",
  comptable_dedie: "Comptable dédié",
  direction: "Direction",
  client_admin: "Dirigeant client",
  admin: "Administrateur",
  super_admin: "Super Admin",
}

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

const CAPABILITY_LABELS: Record<string, string> = {
  view_help: "Voir l'aide",
  switch_societe: "Changer de société",
  logout: "Déconnecter Telegram",
  view_my_payslip: "Voir mon bulletin",
  view_my_leave_balance: "Voir mes congés",
  request_leave: "Demander congé",
  view_team_kpis: "Voir KPIs équipe",
  approve_team_leave: "Valider congés équipe",
  view_team_pending: "Voir demandes en attente",
  view_kpis: "Voir KPIs société",
  view_bank: "Voir solde banque",
  view_tax_calendar: "Échéances MRA",
  create_invoice: "Créer facture",
  reconcile_bank: "Rapprochement",
  add_ot: "Ajouter OT",
  add_bonus: "Ajouter prime",
  compute_payroll: "Calculer paie",
  approve_payroll: "🚨 Valider paie",
  export_mra: "Exports MRA",
  view_employees: "Voir employés",
  manage_leave_settings: "Paramètres congés",
  view_audit_log: "Audit log",
  manage_alerts_config: "Config alertes",
  ALL: "🔓 Tous les droits",
}

export default function TelegramPermissionsPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [members, setMembers] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [botUsername, setBotUsername] = useState<string>('LexoraBot')
  const [roleMatrix, setRoleMatrix] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [generatingFor, setGeneratingFor] = useState<string | null>(null)
  const [codeModal, setCodeModal] = useState<null | { employe_id: string; nom: string; code: string; deep_link: string; share_message: string }>(null)
  const [copied, setCopied] = useState<string | null>(null)
  // Rôle souhaité au moment de générer le code (par employé sans compte)
  const [pendingRoleByEmpId, setPendingRoleByEmpId] = useState<Record<string, string>>({})

  const load = async () => {
    if (!societeId) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/client/telegram-permissions?societe_id=${societeId}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erreur')
      setMembers(j.members || [])
      setEmployees(j.employees || [])
      setRoleMatrix(j.role_matrix || {})
      setBotUsername(j.bot_username || 'LexoraBot')
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId])

  const generateCode = async (employe_id: string, nom: string, role: string = 'employe') => {
    setGeneratingFor(employe_id); setError(null)
    try {
      const r = await fetch('/api/client/telegram-permissions/employee-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: societeId, employe_id, role }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erreur')
      setCodeModal({ employe_id, nom, code: j.code, deep_link: j.deep_link, share_message: j.share_message })
      await load()
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setGeneratingFor(null) }
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
      if (!r.ok) throw new Error(j.error || 'Erreur')
      await load()
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setSavingUserId(null) }
  }

  const unlinkEmployee = async (employe_id: string, nom: string) => {
    if (!confirm(`Délier ${nom} de Telegram ? Il devra refaire /start CODE pour se reconnecter.`)) return
    setError(null)
    try {
      const r = await fetch(`/api/client/telegram-permissions/employee-code?societe_id=${societeId}&employe_id=${employe_id}`, { method: 'DELETE' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erreur')
      await load()
    } catch (e: any) { setError(e?.message || 'Erreur') }
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
      if (!r.ok) throw new Error(j.error || 'Erreur')
      await load()
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setSavingUserId(null) }
  }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 className="animate-spin h-5 w-5" /> Chargement…</div>

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6 text-emerald-600" /> Permissions Telegram Bot</h1>
        <p className="text-sm text-slate-500">Configure qui peut faire quoi via le bot Telegram Lexora. Les changements prennent effet immédiatement.</p>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2"><AlertCircle className="h-4 w-4 mt-0.5" />{error}</div>}

      {/* ── Matrice rôles → capabilities ── */}
      <Card>
        <CardHeader><CardTitle className="text-base">Matrice des permissions par rôle</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {ALL_ROLES.map(r => roleMatrix[r] && (
              <div key={r} className="flex items-start gap-3 border-b pb-3 last:border-0">
                <Badge className={`${ROLE_COLORS[r]} text-xs whitespace-nowrap`} variant="outline">
                  {ROLE_LABELS[r]} <span className="opacity-50 ml-1">L{roleMatrix[r]?.level}</span>
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
            <span>Membres de la société ({members.length})</span>
            <Button onClick={load} variant="outline" size="sm">Rafraîchir</Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">Aucun membre.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 px-2">Nom</th>
                    <th className="py-2 px-2">Email</th>
                    <th className="py-2 px-2">Telegram</th>
                    <th className="py-2 px-2">Rôle</th>
                    <th className="py-2 px-2">Capabilities</th>
                    <th className="py-2 px-2 text-right">Audit (30j)</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m: any) => (
                    <tr key={m.user_id} className="border-b">
                      <td className="py-2 px-2 font-medium">{m.full_name}</td>
                      <td className="py-2 px-2 text-xs text-slate-600">{m.email}</td>
                      <td className="py-2 px-2">
                        {m.telegram?.linked ? (
                          <div className="flex items-center gap-1">
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-xs">
                              <MessageCircle className="h-3 w-3 mr-1" />@{m.telegram.telegram_username || m.telegram.firstname || 'lié'}
                            </Badge>
                            {!m.telegram.active_for_this_societe && (
                              <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">autre société active</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">non lié</span>
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
                                {ROLE_LABELS[r]} <span className="opacity-50 ml-1 text-xs">L{roleMatrix[r]?.level}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {savingUserId === m.user_id && <Loader2 className="inline animate-spin h-3 w-3 ml-2 text-slate-400" />}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {(m.capabilities || []).slice(0, 6).map((c: string) => (
                            <span key={c} className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">{CAPABILITY_LABELS[c] || c}</span>
                          ))}
                          {(m.capabilities || []).length > 6 && <span className="text-[10px] text-slate-400">+{m.capabilities.length - 6}</span>}
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
                          <span className="text-[10px] text-slate-400">aucune action</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Employés RH de la société ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2"><Users className="h-4 w-4 text-blue-600" /> Employés RH ({employees.length})</span>
            <Button onClick={load} variant="outline" size="sm">Rafraîchir</Button>
          </CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            Tous les employés actifs de la fiche RH. Génère un code Telegram pour leur permettre de se connecter au bot.
            Si l'employé n'a pas encore de compte Lexora, il sera créé automatiquement (email requis dans la fiche).
          </p>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">Aucun employé actif dans la fiche RH.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 px-2">Code</th>
                    <th className="py-2 px-2">Nom complet</th>
                    <th className="py-2 px-2">Poste</th>
                    <th className="py-2 px-2">Email</th>
                    <th className="py-2 px-2">Rôle Telegram</th>
                    <th className="py-2 px-2">Capabilities</th>
                    <th className="py-2 px-2">Telegram</th>
                    <th className="py-2 px-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e: any) => {
                    const desiredRole = pendingRoleByEmpId[e.employe_id] || 'employe'
                    return (
                    <tr key={e.employe_id} className="border-b">
                      <td className="py-2 px-2 font-mono text-xs">{e.code || '—'}</td>
                      <td className="py-2 px-2 font-medium">{e.nom_complet}</td>
                      <td className="py-2 px-2 text-xs text-slate-600">{e.poste || '—'}</td>
                      <td className="py-2 px-2 text-xs text-slate-600">{e.email || <span className="text-amber-700">manquant</span>}</td>
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
                                    {ROLE_LABELS[r]} <span className="opacity-50 ml-1 text-xs">L{roleMatrix[r]?.level}</span>
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
                                  {ROLE_LABELS[r]} <span className="opacity-50 ml-1 text-xs">L{roleMatrix[r]?.level}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {(e.capabilities || []).slice(0, 4).map((c: string) => (
                            <span key={c} className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">{CAPABILITY_LABELS[c] || c}</span>
                          ))}
                          {(e.capabilities || []).length > 4 && <span className="text-[10px] text-slate-400">+{e.capabilities.length - 4}</span>}
                          {(!e.capabilities || e.capabilities.length === 0) && <span className="text-[10px] text-slate-400">à définir</span>}
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        {e.telegram_status === 'linked' ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-xs">
                            <MessageCircle className="h-3 w-3 mr-1" />@{e.telegram_username || 'lié'}
                          </Badge>
                        ) : e.telegram_status === 'pending_code' ? (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">code en attente</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">non lié</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {e.telegram_status === 'linked' ? (
                          <Button
                            onClick={() => unlinkEmployee(e.employe_id, e.nom_complet)}
                            variant="outline" size="sm"
                            className="text-red-700 border-red-200 hover:bg-red-50">
                            <Trash2 className="h-3 w-3 mr-1" /> Délier
                          </Button>
                        ) : (
                          <Button
                            onClick={() => generateCode(e.employe_id, e.nom_complet, desiredRole)}
                            disabled={generatingFor === e.employe_id || !e.email}
                            size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                            {generatingFor === e.employe_id
                              ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              : <Link2 className="h-3 w-3 mr-1" />}
                            Générer code
                          </Button>
                        )}
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
          Chaque action effectuée par le bot Telegram (tool call) est tracée dans l'audit log <code>telegram_actions</code> avec :
          chat_id, user_id, société, intent, résultat, statut (succès/refusé/erreur), durée. Permet la conformité AML/CFT et le débogage.
        </div>
      </div>

      {/* ── Modal code généré ── */}
      {codeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setCodeModal(null)}>
          <div className="bg-white rounded-lg max-w-lg w-full p-6 space-y-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-emerald-600" />
                Code Telegram pour {codeModal.nom}
              </h3>
              <button onClick={() => setCodeModal(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="rounded border border-emerald-200 bg-emerald-50 p-4 space-y-2">
              <div className="text-xs uppercase text-emerald-700 font-medium">Code de vérification</div>
              <div className="flex items-center gap-2">
                <code className="text-3xl font-mono font-bold tracking-wider text-emerald-900">{codeModal.code}</code>
                <Button
                  onClick={() => copyToClipboard(codeModal.code, 'code')}
                  variant="outline" size="sm">
                  <Copy className="h-3 w-3 mr-1" />
                  {copied === 'code' ? 'Copié !' : 'Copier'}
                </Button>
              </div>
              <div className="text-xs text-emerald-700">Expire dans 15 minutes</div>
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase text-slate-500 font-medium">Lien direct Telegram</div>
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
                  {copied === 'link' ? 'Copié !' : 'Copier'}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase text-slate-500 font-medium">Message prêt à envoyer à l'employé</div>
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
                {copied === 'msg' ? 'Copié dans le presse-papier !' : 'Copier le message complet'}
              </Button>
            </div>

            <div className="text-xs text-slate-500 border-t pt-3">
              Si l'employé n'avait pas de compte Lexora, un compte vient d'être créé avec son email.
              Il recevra aussi un email d'invitation pour définir son mot de passe.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
