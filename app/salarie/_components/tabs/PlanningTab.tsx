"use client"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "lucide-react"
import { NAVY, GOLD, BLUE } from "../shared/constants"

// Extrait du monolithe page.tsx pendant le sprint-salarie V0.1.
// Iso-fonctionnel.
export function PlanningTab({ planning }: { planning: any[] }) {
  const periodeMonth = new Date().toISOString().slice(0, 7)
  const monthLabel = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold capitalize" style={{ color: NAVY }}>{monthLabel}</h2>
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

      {planning.length === 0 ? (
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
            const dateStr = `${periodeMonth}-${String(p.jour).padStart(2, '0')}`
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
