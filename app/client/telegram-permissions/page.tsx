"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Shield, MessageCircle, AlertCircle, CheckCircle2, XCircle, Activity } from "lucide-react"
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
  const [roleMatrix, setRoleMatrix] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)

  const load = async () => {
    if (!societeId) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/client/telegram-permissions?societe_id=${societeId}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erreur')
      setMembers(j.members || [])
      setRoleMatrix(j.role_matrix || {})
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId])

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

      <div className="text-xs text-slate-500 flex items-start gap-2 p-3 rounded bg-slate-50 border border-slate-200">
        <Activity className="h-4 w-4 mt-0.5" />
        <div>
          Chaque action effectuée par le bot Telegram (tool call) est tracée dans l'audit log <code>telegram_actions</code> avec :
          chat_id, user_id, société, intent, résultat, statut (succès/refusé/erreur), durée. Permet la conformité AML/CFT et le débogage.
        </div>
      </div>
    </div>
  )
}
