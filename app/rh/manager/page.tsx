"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Users, Clock, Calendar, AlertTriangle, CheckCircle, UserX, Coffee, TrendingUp, Loader2 } from "lucide-react"
import MonEspacePersonnel from "@/components/rh/MonEspacePersonnel"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmtH(h: string | null) { return h ? h.slice(0, 5) : "—" }

export default function ManagerDashboard() {
  const locale = getLocale()
  const [loading, setLoading] = useState(true)
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [groupes, setGroupes] = useState<any[]>([])
  const [selectedGroupe, setSelectedGroupe] = useState("all")
  const [employes, setEmployes] = useState<any[]>([])
  const [pointages, setPointages] = useState<any[]>([])
  const [conges, setConges] = useState<any[]>([])
  const [balances, setBalances] = useState<any[]>([])

  const today = new Date().toISOString().split("T")[0]

  // Load sociétés + auto-detect manager's assigned group
  useEffect(() => {
    Promise.all([
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
      setSocietes(unique)
      if (unique.length >= 1) setSociete(unique[0].id)
    })

    // Auto-select the manager's assigned group
    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return
        supabase.from("profiles").select("groupe_gere_id, societe_id").eq("id", user.id).single().then(({ data }) => {
          if (data?.groupe_gere_id) setSelectedGroupe(data.groupe_gere_id)
          if (data?.societe_id && !societe) setSociete(data.societe_id)
        })
      })
    })
  }, [])

  const load = useCallback(async () => {
    if (!societe) return
    setLoading(true)
    try {
      const [empRes, grpRes, ptRes, cgRes] = await Promise.all([
        fetch(`/api/rh/employes?societe_id=${societe}`).then(r => r.json()).catch(() => ({ employes: [] })),
        fetch(`/api/rh/groupes?societe_id=${societe}`).then(r => r.json()).catch(() => ({ groupes: [] })),
        fetch(`/api/rh/pointage?date=${today}&societe_id=${societe}`).then(r => r.json()).catch(() => ({ pointages: [] })),
        fetch(`/api/rh/conges?action=balances&societe_id=${societe}`).then(r => r.json()).catch(() => ({ balances: [] })),
      ])
      setEmployes((empRes.employes || []).sort((a: any, b: any) => `${a.nom}`.localeCompare(b.nom)))
      setGroupes(grpRes.groupes || [])
      setPointages(ptRes.pointages || [])
      setBalances(cgRes.balances || [])
    } catch {}
    setLoading(false)
  }, [societe, today])

  useEffect(() => { load() }, [load])

  // Filter by group
  const groupeMembreIds = selectedGroupe === "all"
    ? new Set(employes.map((e: any) => e.id))
    : new Set((groupes.find((g: any) => g.id === selectedGroupe)?.membres || []).map((m: any) => m.employe_id))

  const filteredEmployes = employes.filter((e: any) => groupeMembreIds.has(e.id))
  const filteredPointages = pointages.filter((p: any) => groupeMembreIds.has(p.employe_id))
  const filteredBalances = balances.filter((b: any) => groupeMembreIds.has(b.employe_id))

  // KPIs
  const nbEmployes = filteredEmployes.length
  const nbPresents = filteredPointages.filter((p: any) => p.heure_entree).length
  const nbEnPause = filteredPointages.filter((p: any) => p.heure_pause_debut && !p.heure_pause_fin).length
  const nbSortis = filteredPointages.filter((p: any) => p.heure_sortie).length
  const nbAbsents = nbEmployes - nbPresents
  const nbCongesAttente = filteredBalances.reduce((s: number, b: any) => s + (b.demandes_en_attente || 0), 0)
  const nbAlerteSL = filteredBalances.filter((b: any) => b.alerte_certificat).length
  const nbSLFaible = filteredBalances.filter((b: any) => (b.sl_solde || 0) <= 3).length

  // Pointage map
  const pointageMap = new Map<string, any>()
  for (const p of filteredPointages) pointageMap.set(p.employe_id, p)

  // Balance map
  const balanceMap = new Map<string, any>()
  for (const b of filteredBalances) balanceMap.set(b.employe_id, b)

  return (
    <ClientPageShell
      breadcrumbs={[{ label: t('rha.a.dash.bc_rh', locale), href: "/rh" }, { label: t('rha.a.mgr.bc_manager', locale) }]}
      kicker={`${t('rha.a.mgr.kicker_mon_equipe', locale)} · ${employes.length} ${employes.length > 1 ? t('rha.a.mgr.collaborateurs', locale) : t('rha.a.mgr.collaborateur', locale)}`}
      title={t('rha.a.mgr.title', locale)}
      subtitle={t('rha.a.mgr.subtitle', locale)}
      actions={
        <>
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder={t('rha.a.common.societe', locale)} /></SelectTrigger>
            <SelectContent>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          {groupes.length > 0 && (
            <Select value={selectedGroupe} onValueChange={setSelectedGroupe}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder={t('rha.a.mgr.groupe', locale)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('rha.a.common.tous', locale)} ({employes.length})</SelectItem>
                {groupes.map(g => <SelectItem key={g.id} value={g.id}>{g.nom} ({g.nb_membres})</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </>
      }
    >
    <div className="space-y-6">

      {/* TÂCHE 7 — Mon espace personnel (rendu uniquement si le manager
          a une fiche employé liée — il l'a presque toujours). */}
      <MonEspacePersonnel />

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <Card><CardContent className="p-4 text-center">
              <Users className="h-5 w-5 mx-auto mb-1" style={{ color: NAVY }} />
              <p className="text-2xl font-bold" style={{ color: NAVY }}>{nbEmployes}</p>
              <p className="text-xs text-gray-500">{t('rha.a.mgr.kpi_equipe', locale)}</p>
            </CardContent></Card>
            <Card className="border-emerald-200"><CardContent className="p-4 text-center">
              <CheckCircle className="h-5 w-5 mx-auto mb-1 text-emerald-600" />
              <p className="text-2xl font-bold text-emerald-600">{nbPresents}</p>
              <p className="text-xs text-gray-500">{t('rha.a.mgr.kpi_presents', locale)}</p>
            </CardContent></Card>
            <Card className="border-amber-200"><CardContent className="p-4 text-center">
              <Coffee className="h-5 w-5 mx-auto mb-1 text-amber-600" />
              <p className="text-2xl font-bold text-amber-600">{nbEnPause}</p>
              <p className="text-xs text-gray-500">{t('rha.a.mgr.kpi_pause', locale)}</p>
            </CardContent></Card>
            <Card className="border-red-200"><CardContent className="p-4 text-center">
              <UserX className="h-5 w-5 mx-auto mb-1 text-red-600" />
              <p className="text-2xl font-bold text-red-600">{nbAbsents}</p>
              <p className="text-xs text-gray-500">{t('rha.a.mgr.kpi_absents', locale)}</p>
            </CardContent></Card>
            <Card className="border-orange-200"><CardContent className="p-4 text-center">
              <Calendar className="h-5 w-5 mx-auto mb-1 text-orange-600" />
              <p className="text-2xl font-bold text-orange-600">{nbCongesAttente}</p>
              <p className="text-xs text-gray-500">{t('rha.a.mgr.kpi_conges_attente', locale)}</p>
            </CardContent></Card>
            <Card className="border-purple-200"><CardContent className="p-4 text-center">
              <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-purple-600" />
              <p className="text-2xl font-bold text-purple-600">{nbAlerteSL + nbSLFaible}</p>
              <p className="text-xs text-gray-500">{t('rha.a.mgr.kpi_alertes', locale)}</p>
            </CardContent></Card>
          </div>

          {/* Tableau employés du groupe */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base" style={{ color: NAVY }}>
                <Clock className="inline h-5 w-5 mr-2" style={{ color: GOLD }} />
                {t('rha.a.mgr.mon_equipe_aujourdhui', locale)}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium" style={{ color: NAVY }}>{t('rha.a.common.employe', locale)}</th>
                      <th className="px-3 py-2 text-center font-medium" style={{ color: NAVY }}>{t('rha.a.mgr.col_entree', locale)}</th>
                      <th className="px-3 py-2 text-center font-medium" style={{ color: NAVY }}>{t('rha.a.mgr.col_pause', locale)}</th>
                      <th className="px-3 py-2 text-center font-medium" style={{ color: NAVY }}>{t('rha.a.mgr.col_sortie', locale)}</th>
                      <th className="px-3 py-2 text-center font-medium" style={{ color: NAVY }}>{t('rha.a.common.statut', locale)}</th>
                      <th className="px-3 py-2 text-center font-medium" style={{ color: NAVY }}>{t('rha.a.mgr.col_al_restant', locale)}</th>
                      <th className="px-3 py-2 text-center font-medium" style={{ color: NAVY }}>{t('rha.a.mgr.col_sl_restant', locale)}</th>
                      <th className="px-3 py-2 text-center font-medium" style={{ color: NAVY }}>{t('rha.a.mgr.col_alertes', locale)}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredEmployes.map(emp => {
                      const p = pointageMap.get(emp.id)
                      const b = balanceMap.get(emp.id)
                      const alSolde = b ? (b.al_solde ?? (b.al_droit - b.al_pris)) : 20
                      const slSolde = b ? (b.sl_solde ?? (b.sl_droit - b.sl_pris)) : 15
                      const hasEntry = p?.heure_entree
                      const hasExit = p?.heure_sortie
                      const onPause = p?.heure_pause_debut && !p?.heure_pause_fin

                      let statut = t('rha.a.mgr.st_absent', locale)
                      let statutColor = "bg-red-100 text-red-700"
                      if (hasExit) { statut = t('rha.a.mgr.st_termine', locale); statutColor = "bg-blue-100 text-blue-700" }
                      else if (onPause) { statut = t('rha.a.mgr.st_pause', locale); statutColor = "bg-amber-100 text-amber-700" }
                      else if (hasEntry) { statut = t('rha.a.mgr.st_present', locale); statutColor = "bg-emerald-100 text-emerald-700" }

                      const alertes: string[] = []
                      if (b?.alerte_certificat) alertes.push(t('rha.a.mgr.al_certif', locale))
                      if (slSolde <= 3 && slSolde > 0) alertes.push(t('rha.a.mgr.al_sl_faible', locale))
                      if (slSolde <= 0) alertes.push(t('rha.a.mgr.al_sl_epuise', locale))
                      if (alSolde <= 3 && alSolde > 0) alertes.push(t('rha.a.mgr.al_al_faible', locale))

                      return (
                        <tr key={emp.id} className={!hasEntry && !hasExit ? "bg-red-50/30" : ""}>
                          <td className="px-4 py-2">
                            <p className="font-medium">{emp.prenom} {emp.nom}</p>
                            <p className="text-xs text-gray-400">{emp.poste || "—"}</p>
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-emerald-700">{fmtH(p?.heure_entree)}</td>
                          <td className="px-3 py-2 text-center font-mono text-amber-600 text-xs">
                            {p?.heure_pause_debut ? `${fmtH(p.heure_pause_debut)}${p.heure_pause_fin ? `—${fmtH(p.heure_pause_fin)}` : " ..."}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-red-600">{fmtH(p?.heure_sortie)}</td>
                          <td className="px-3 py-2 text-center">
                            <Badge className={`text-[10px] ${statutColor}`}>{statut}</Badge>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`font-mono text-sm ${alSolde <= 3 ? "text-orange-600 font-bold" : alSolde <= 0 ? "text-red-600 font-bold" : "text-gray-700"}`}>
                              {alSolde}j
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`font-mono text-sm ${slSolde <= 3 ? "text-orange-600 font-bold" : slSolde <= 0 ? "text-red-600 font-bold" : "text-gray-700"}`}>
                              {slSolde}j
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {alertes.length > 0 ? (
                              <div className="flex flex-wrap gap-1 justify-center">
                                {alertes.map(a => (
                                  <Badge key={a} className="text-[9px] bg-red-100 text-red-700">{a}</Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Résumé rapide */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: NAVY }}>{t('rha.a.mgr.heures_du_jour', locale)}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {filteredPointages.filter(p => p.heure_entree).slice(0, 10).map((p: any) => {
                    const emp = filteredEmployes.find(e => e.id === p.employe_id)
                    return (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <span>{emp?.prenom} {emp?.nom}</span>
                        <span className="font-mono text-xs text-gray-500">
                          {fmtH(p.heure_entree)} → {fmtH(p.heure_sortie)}
                          {p.duree_minutes ? ` (${Math.round(p.duree_minutes / 60 * 10) / 10}h)` : ""}
                        </span>
                      </div>
                    )
                  })}
                  {filteredPointages.filter(p => p.heure_entree).length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">{t('rha.a.mgr.aucun_pointage_jour', locale)}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: NAVY }}>{t('rha.a.mgr.conges_valider', locale)}</CardTitle>
              </CardHeader>
              <CardContent>
                {nbCongesAttente > 0 ? (
                  <div className="space-y-2">
                    {filteredBalances.filter(b => b.demandes_en_attente > 0).map(b => {
                      const emp = filteredEmployes.find(e => e.id === b.employe_id)
                      return (
                        <div key={b.employe_id} className="flex items-center justify-between text-sm">
                          <span>{emp?.prenom} {emp?.nom}</span>
                          <Badge className="bg-orange-100 text-orange-700 text-xs">{b.demandes_en_attente} {t('rha.a.mgr.en_attente', locale)}</Badge>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">{t('rha.a.mgr.aucun_conge_attente', locale)}</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
    </ClientPageShell>
  )
}
