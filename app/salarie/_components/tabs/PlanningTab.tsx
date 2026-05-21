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
  const [rawFeries, setRawFeries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [serverMergedLeaves, setServerMergedLeaves] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchPlanning = async () => {
      setLoading(true)
      try {
        // V2.4 — demande au serveur une fusion planning/congés optimale
        const plUrl = `/api/rh/planning?periode=${periode}&societe_id=${employe.societe_id}&employe_id=${employe.id}&merge_leaves=1`
        const annee = periode.slice(0, 4)
        const [plRes, cgRes, jfRes] = await Promise.all([
          fetch(plUrl).then(r => r.json()).catch(() => ({ planning: [] })),
          fetch(`/api/rh/conges?employe_id=${employe.id}`).then(r => r.json()).catch(() => ({ conges: [] })),
          fetch(`/api/rh/jours-feries?annee=${annee}`).then(r => r.json()).catch(() => ({ jours_feries: [] })),
        ])
        if (cancelled) return
        setServerMergedLeaves(Boolean(plRes.merged_leaves))
        setRawPlanning((plRes.planning || []).filter((p: any) => p.employe_id === employe.id))
        setRawLeaves((cgRes.conges || cgRes.demandes || []).filter((c: any) => c.statut === "approuve" || c.statut === "approved"))
        setRawFeries(jfRes.jours_feries || [])
      } catch {}
      finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchPlanning()
    return () => { cancelled = true }
  }, [employe.id, employe.societe_id, periode])

  // Fusion client-side : on construit la liste des jours à partir de
  // l'union (lignes planning ∪ congés approuvés ∪ jours fériés).
  //
  // BUGFIX — l'ancienne version faisait `rawPlanning.map(...)` : un jour
  // de congé (ex: Sick Leave) SANS ligne planning (les jours de congé ne
  // sont pas sauvegardés dans planning côté RH) n'apparaissait PAS du
  // tout. On indexe par jour et on injecte les jours de congé manquants.
  //
  // Jours fériés : annotés (ferie + libellé) SANS effacer le shift —
  // l'employé reste marqué travaillant le jour férié. Si le jour est en
  // repos, on affiche "Férié" au lieu d'un simple "Repos".
  const planning = useMemo(() => {
    const leaveLabels: Record<string, string> = { AL: "Local Leave", SL: "Sick Leave", MAT: "Maternité", PAT: "Paternité", SANS_SOLDE: "Sans solde" }

    // 1. Congés approuvés → map jour → type
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

    // 2. Jours fériés du mois (nationaux + société de l'employé)
    const ferieDays = new Map<number, string>()
    for (const jf of rawFeries) {
      const dStr = String(jf.date || "").slice(0, 10)
      if (!dStr.startsWith(periode)) continue
      if (employe.societe_id && jf.societe_id && jf.societe_id !== employe.societe_id) continue
      const day = parseInt(dStr.slice(8, 10), 10)
      if (day >= 1 && day <= 31) ferieDays.set(day, jf.libelle || "Jour férié")
    }

    // 3. Index des lignes planning par jour
    const byDay = new Map<number, any>()
    for (const p of rawPlanning) {
      const d = p.jour || p.day
      if (d) byDay.set(d, { ...p })
    }

    // 4. Injecter / surcharger les jours de congé (même si serverMerged :
    //    idempotent, et garantit la présence des jours sans ligne planning)
    for (const [d, lt] of leaveDays) {
      const base = byDay.get(d) || { employe_id: employe.id, jour: d }
      byDay.set(d, { ...base, shift: leaveLabels[lt] || "Congé", leave_type: lt, est_repos: false, heure_debut: null, heure_fin: null, heures_prevues: 0 })
    }

    // 5. Annoter les jours fériés (ne JAMAIS effacer le shift)
    for (const [d, lbl] of ferieDays) {
      const base = byDay.get(d)
      if (base) byDay.set(d, { ...base, ferie: true, ferie_label: lbl })
      else byDay.set(d, { employe_id: employe.id, jour: d, shift: "Repos", est_repos: true, ferie: true, ferie_label: lbl })
    }

    return Array.from(byDay.values())
  }, [rawPlanning, rawLeaves, rawFeries, periode, employe.id, employe.societe_id])

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
            const isFerie = !!p.ferie
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
                className={`flex items-center gap-3 p-3 rounded-2xl transition-all duration-200 ${isToday ? "ring-2 ring-offset-2" : ""} ${isFerie ? "ring-1 ring-amber-300" : ""}`}
                style={{
                  backgroundColor: isFerie && isRepos && !isLeave
                    ? "#fffbeb"
                    : isRepos && !isLeave ? (isWeekend ? "#f9fafb" : "#f3f4f6") : style?.bg,
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
                    isFerie ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm">🎌</span>
                        <p className="text-sm font-semibold text-amber-700">Férié — {p.ferie_label}</p>
                      </div>
                    ) : (
                      <p className="text-sm font-medium text-gray-400">Repos</p>
                    )
                  ) : isLeave ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm">{style?.icon}</span>
                      <p className="text-sm font-semibold" style={{ color: style?.text }}>{p.shift}</p>
                      {isFerie && (
                        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Férié</span>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm">{style?.icon}</span>
                        <p className="text-sm font-semibold" style={{ color: style?.text }}>{p.shift || "Travail"}</p>
                        {isFerie && (
                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200" title={p.ferie_label}>Férié</span>
                        )}
                      </div>
                      {p.heure_debut && (
                        <p className="text-xs text-gray-500 mt-0.5 font-mono">
                          {String(p.heure_debut).slice(0, 5)} — {String(p.heure_fin).slice(0, 5)}
                        </p>
                      )}
                      {isFerie && (
                        <p className="text-[11px] text-amber-700 mt-0.5">{p.ferie_label} — jour travaillé</p>
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
