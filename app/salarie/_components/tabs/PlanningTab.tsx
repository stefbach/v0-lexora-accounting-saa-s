"use client"
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import { NAVY, GOLD, BLUE } from "../shared/constants"

// Sprint salarie V2.3 — ajout du sélecteur de mois (prev/next +
// dropdown "mois en cours"). Sprint V2.4 — passe ?merge_leaves=1 à
// /api/rh/planning et, tant que l'API RH ne renvoie pas de planning
// déjà fusionné, recalcule la fusion côté client. Le TODO ci-dessous
// trace la dette à nettoyer quand la fusion serveur sera livrée.

function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
}
function currentPeriode(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export function PlanningTab({ employe }: { employe: any }) {
  const [periode, setPeriode] = useState<string>(currentPeriode())
  const [rawPlanning, setRawPlanning] = useState<any[]>([])
  const [rawLeaves, setRawLeaves] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [serverMergedLeaves, setServerMergedLeaves] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchPlanning = async () => {
      setLoading(true)
      try {
        // V2.4 — demande au serveur une fusion planning/congés optimale
        const plUrl = `/api/rh/planning?periode=${periode}&societe_id=${employe.societe_id}&employe_id=${employe.id}&merge_leaves=1`
        const [plRes, cgRes] = await Promise.all([
          fetch(plUrl).then(r => r.json()).catch(() => ({ planning: [] })),
          fetch(`/api/rh/conges?employe_id=${employe.id}`).then(r => r.json()).catch(() => ({ conges: [] })),
        ])
        if (cancelled) return
        setServerMergedLeaves(Boolean(plRes.merged_leaves))
        setRawPlanning((plRes.planning || []).filter((p: any) => p.employe_id === employe.id))
        setRawLeaves((cgRes.conges || cgRes.demandes || []).filter((c: any) => c.statut === "approuve" || c.statut === "approved"))
      } catch {}
      finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchPlanning()
    return () => { cancelled = true }
  }, [employe.id, employe.societe_id, periode])

  // Fusion client-side tant que l'API ne renvoie pas merged_leaves=true.
  // TODO(RH agent) — retirer cette fusion client quand
  // /api/rh/planning?merge_leaves=1 marquera les congés côté serveur
  // et renverra { planning: [...], merged_leaves: true }.
  const planning = useMemo(() => {
    if (serverMergedLeaves) return rawPlanning
    if (rawPlanning.length === 0) return []
    const leaveDays = new Map<number, string>()
    for (const c of rawLeaves) {
      const startStr = String(c.date_debut || "").slice(0, 10)
      const endStr = String(c.date_fin || c.date_debut || "").slice(0, 10)
      const leaveType = c.type_conge || "AL"
      if (!startStr) continue
      for (let d = 1; d <= 31; d++) {
        const dayStr = `${periode}-${String(d).padStart(2, "0")}`
        if (dayStr >= startStr && dayStr <= endStr) leaveDays.set(d, leaveType)
      }
    }
    return rawPlanning.map((p: any) => {
      const lt = leaveDays.get(p.jour || p.day)
      if (lt) {
        const leaveLabels: Record<string, string> = { AL: "Local Leave", SL: "Sick Leave", MAT: "Maternité", PAT: "Paternité", SANS_SOLDE: "Sans solde" }
        return { ...p, shift: leaveLabels[lt] || "Congé", leave_type: lt, est_repos: false, heure_debut: null, heure_fin: null, heures_prevues: 0 }
      }
      return p
    })
  }, [rawPlanning, rawLeaves, periode, serverMergedLeaves])

  const sorted = [...planning].sort((a: any, b: any) => (a.jour || 0) - (b.jour || 0))
  const workDays = sorted.filter((p: any) => !p.est_repos && p.shift !== 'Repos' && p.shift !== 'R' && !p.leave_type)
  const leaveDaysCount = sorted.filter((p: any) => !!p.leave_type)
  const reposDays = sorted.filter((p: any) => (p.est_repos || p.shift === 'Repos' || p.shift === 'R') && !p.leave_type)
  const totalHours = workDays.reduce((s: number, p: any) => s + (Number(p.heures_prevues) || 0), 0)

  const shiftColors: Record<string, { bg: string; text: string; icon: string }> = {
    "Journée": { bg: "#4191FF15", text: "#4191FF", icon: "☀️" },
    "Jour": { bg: "#4191FF15", text: "#4191FF", icon: "☀️" },
    "J": { bg: "#4191FF15", text: "#4191FF", icon: "☀️" },
    "Matin": { bg: "#05966915", text: "#059669", icon: "🌅" },
    "M": { bg: "#05966915", text: "#059669", icon: "🌅" },
    "Après-midi": { bg: "#D4AF3715", text: "#D4AF37", icon: "🌤️" },
    "AM": { bg: "#D4AF3715", text: "#D4AF37", icon: "🌤️" },
    "Nuit": { bg: "#6366f115", text: "#6366f1", icon: "🌙" },
    "N": { bg: "#6366f115", text: "#6366f1", icon: "🌙" },
  }
  const leaveTypeColors: Record<string, { bg: string; text: string; icon: string }> = {
    "AL": { bg: "#3b82f615", text: "#2563eb", icon: "🏖️" },
    "SL": { bg: "#f9731615", text: "#ea580c", icon: "🏥" },
    "MAT": { bg: "#a855f715", text: "#9333ea", icon: "👶" },
    "PAT": { bg: "#6366f115", text: "#4f46e5", icon: "👨‍👶" },
    "SANS_SOLDE": { bg: "#6b728015", text: "#4b5563", icon: "📋" },
  }
  const getShiftStyle = (shift: string, leaveType?: string) => {
    if (leaveType) return leaveTypeColors[leaveType] || { bg: "#10b98115", text: "#059669", icon: "📋" }
    return shiftColors[shift] || { bg: "#4191FF15", text: "#4191FF", icon: "📋" }
  }

  const isCurrentMonth = periode === currentPeriode()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setPeriode(p => addMonths(p, -1))} className="h-9 w-9 rounded-xl">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-bold capitalize min-w-[160px] text-center" style={{ color: NAVY }}>{monthLabel(periode)}</h2>
          <Button variant="outline" size="icon" onClick={() => setPeriode(p => addMonths(p, 1))} className="h-9 w-9 rounded-xl">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrentMonth && (
            <Button variant="ghost" size="sm" onClick={() => setPeriode(currentPeriode())} className="text-xs">
              Mois en cours
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Badge className="text-xs px-2 py-1" style={{ backgroundColor: `${BLUE}15`, color: BLUE }}>{workDays.length}j travail</Badge>
          <Badge className="text-xs px-2 py-1 bg-gray-100 text-gray-500">{reposDays.length}j repos</Badge>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: `${BLUE}10` }}>
          <p className="text-xl font-bold" style={{ color: BLUE }}>{workDays.length}</p>
          <p className="text-[10px] text-gray-500">Travail</p>
        </div>
        <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: `${GOLD}10` }}>
          <p className="text-xl font-bold" style={{ color: GOLD }}>{totalHours}h</p>
          <p className="text-[10px] text-gray-500">Heures</p>
        </div>
        <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: "#3b82f610" }}>
          <p className="text-xl font-bold text-blue-600">{leaveDaysCount.length}</p>
          <p className="text-[10px] text-gray-500">Congés</p>
        </div>
        <div className="rounded-2xl p-3 text-center bg-gray-50">
          <p className="text-xl font-bold text-gray-400">{reposDays.length}</p>
          <p className="text-[10px] text-gray-500">Repos</p>
        </div>
      </div>

      {loading ? (
        <Card className="rounded-2xl">
          <CardContent className="py-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400 mx-auto" />
          </CardContent>
        </Card>
      ) : sorted.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-gray-200 mb-4" />
            <p className="text-gray-400 font-medium">Aucun planning publié</p>
            <p className="text-xs text-gray-300 mt-1">Le planning sera visible une fois publié par le RH</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((p: any, i: number) => {
            const isRepos = p.est_repos || p.shift === 'Repos' || p.shift === 'R'
            const isLeave = !!p.leave_type
            const dateStr = `${periode}-${String(p.jour).padStart(2, '0')}`
            const dateObj = new Date(dateStr + "T12:00:00")
            const dayNum = dateObj.getDate()
            const dayName = dateObj.toLocaleDateString("fr-FR", { weekday: "short" })
            const isToday = dateStr === new Date().toISOString().slice(0, 10)
            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6
            const style = isRepos && !isLeave ? null : getShiftStyle(p.shift || "Jour", p.leave_type)

            return (
              <div
                key={i}
                className={`flex items-center gap-3 p-3 rounded-2xl transition-all duration-200 ${isToday ? "ring-2 ring-offset-2" : ""}`}
                style={{
                  backgroundColor: isRepos && !isLeave ? (isWeekend ? "#f9fafb" : "#f3f4f6") : style?.bg,
                  ...(isToday ? { ringColor: GOLD } : {}),
                }}
              >
                <div
                  className="flex flex-col items-center justify-center rounded-xl w-12 h-12 flex-shrink-0"
                  style={{
                    backgroundColor: isToday ? GOLD : isRepos && !isLeave ? "#e5e7eb" : "white",
                    color: isToday ? "white" : isRepos && !isLeave ? "#9ca3af" : NAVY,
                  }}
                >
                  <span className="text-[10px] font-medium uppercase leading-none">{dayName}</span>
                  <span className="text-lg font-bold leading-none">{dayNum}</span>
                </div>

                <div className="flex-1 min-w-0">
                  {isRepos && !isLeave ? (
                    <p className="text-sm font-medium text-gray-400">Repos</p>
                  ) : isLeave ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{style?.icon}</span>
                      <p className="text-sm font-semibold" style={{ color: style?.text }}>{p.shift}</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{style?.icon}</span>
                        <p className="text-sm font-semibold" style={{ color: style?.text }}>{p.shift || "Travail"}</p>
                      </div>
                      {p.heure_debut && (
                        <p className="text-xs text-gray-500 mt-0.5 font-mono">
                          {String(p.heure_debut).slice(0, 5)} — {String(p.heure_fin).slice(0, 5)}
                        </p>
                      )}
                    </>
                  )}
                </div>

                {!isRepos && !isLeave && p.heures_prevues && (
                  <div className="rounded-xl px-2.5 py-1 text-xs font-bold flex-shrink-0" style={{ backgroundColor: "white", color: style?.text }}>
                    {p.heures_prevues}h
                  </div>
                )}

                {isToday && (
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: GOLD }} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
