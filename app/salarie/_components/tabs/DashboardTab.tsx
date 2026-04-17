"use client"
import type { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bell, CreditCard, Calendar, CalendarPlus, Coffee, FileText, HeartPulse, LogIn, LogOut } from "lucide-react"
import { NAVY, GOLD, BLUE, GREEN, MONTH_NAMES_FR } from "../shared/constants"
import { fmt, fmtH, lastDayOfMonth } from "../shared/helpers"

type Router = ReturnType<typeof useRouter>

// Extrait du monolithe page.tsx pendant le sprint-salarie V0.1.
// Iso-fonctionnel : seul changement, on passe en props ce qui était
// state du parent.
export function DashboardTab({
  bulletins, conges, pointageToday, annonces, feedback, punching,
  doPunch, router,
}: {
  bulletins: any[]
  conges: any
  pointageToday: any
  annonces: any[]
  feedback: string
  punching: boolean
  doPunch: (type: string) => void
  router: Router
}) {
  const lastBulletin = bulletins.length > 0 ? bulletins[0] : null
  const estimatedNet = lastBulletin?.salaire_net || 0
  const estimatedBase = lastBulletin?.salaire_base || 0
  const estimatedBrut = lastBulletin?.salaire_brut || 0
  const alTotal = Number(conges.al_droit) || 22
  const slTotal = Number(conges.sl_droit) || 15
  const alPris = Number(conges.al_pris) || 0
  const slPris = Number(conges.sl_pris) || 0
  const alRemaining = Number(conges.al_solde) || (alTotal - alPris)
  const slRemaining = Number(conges.sl_solde) || (slTotal - slPris)
  const alPct = alTotal > 0 ? Math.round((alRemaining / alTotal) * 100) : 0
  const slPct = slTotal > 0 ? Math.round((slRemaining / slTotal) * 100) : 0

  const hasEntry = !!pointageToday?.heure_entree
  const hasExit = !!pointageToday?.heure_sortie
  const onPause = pointageToday?.heure_pause_debut && !pointageToday?.heure_pause_fin

  const notifications: { icon: typeof Bell; text: string; time: string }[] = []
  if (lastBulletin) {
    const per = lastBulletin.periode || ""
    const mIdx = parseInt(per.slice(5, 7), 10) - 1
    const yr = per.slice(0, 4)
    notifications.push({ icon: Bell, text: `Bulletin ${MONTH_NAMES_FR[mIdx] || ""} ${yr} disponible`, time: lastBulletin.created_at ? new Date(lastBulletin.created_at).toLocaleDateString("fr-FR") : "" })
  }

  return (
    <div className="space-y-4">
      {estimatedNet > 0 && (
        <Card className="overflow-hidden rounded-xl shadow-sm" style={{ border: `2px solid ${GOLD}30` }}>
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-500">Prochain salaire estimé</p>
              <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${GOLD}15` }}>
                <CreditCard className="h-4 w-4" style={{ color: GOLD }} />
              </div>
            </div>
            <p className="text-3xl md:text-2xl font-bold font-mono mb-1" style={{ color: NAVY }}>~MRs {fmt(estimatedNet)}</p>
            {estimatedBase > 0 && (
              <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-1">
                <span>Base: {fmt(estimatedBase)}</span>
                {estimatedBrut > estimatedBase && <span>| Brut: {fmt(estimatedBrut)}</span>}
              </div>
            )}
            <p className="text-xs" style={{ color: GOLD }}>Versement le {lastDayOfMonth()}</p>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-xl shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div className="p-3 bg-emerald-50 rounded-xl"><p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wide">Entree</p><p className="font-mono text-lg text-emerald-700 mt-1">{fmtH(pointageToday?.heure_entree)}</p></div>
            <div className="p-3 bg-amber-50 rounded-xl"><p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wide">Pause</p><p className="font-mono text-lg text-amber-600 mt-1">{pointageToday?.heure_pause_debut ? `${fmtH(pointageToday.heure_pause_debut)}${pointageToday.heure_pause_fin ? `-${fmtH(pointageToday.heure_pause_fin)}` : "..."}` : "—"}</p></div>
            <div className="p-3 bg-red-50 rounded-xl"><p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wide">Sortie</p><p className="font-mono text-lg text-red-600 mt-1">{fmtH(pointageToday?.heure_sortie)}</p></div>
            <div className="p-3 bg-blue-50 rounded-xl"><p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wide">Duree</p><p className="font-mono text-lg mt-1" style={{ color: NAVY }}>{pointageToday?.duree_minutes ? `${(pointageToday.duree_minutes / 60).toFixed(1)}h` : "—"}</p></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Button onClick={() => doPunch("entree")} disabled={punching || hasEntry} className="h-12 md:h-14 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm md:text-base transition-all duration-200 active:scale-[0.97]"><LogIn className="h-5 w-5 mr-2" /> Entree</Button>
            <Button onClick={() => doPunch("pause_debut")} disabled={punching || !hasEntry || hasExit || onPause} className="h-12 md:h-14 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm md:text-base transition-all duration-200 active:scale-[0.97]"><Coffee className="h-5 w-5 mr-2" /> Pause</Button>
            <Button onClick={() => doPunch("pause_fin")} disabled={punching || !onPause} className="h-12 md:h-14 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm md:text-base transition-all duration-200 active:scale-[0.97]"><Coffee className="h-5 w-5 mr-2" /> Fin pause</Button>
            <Button onClick={() => doPunch("sortie")} disabled={punching || !hasEntry || hasExit} className="h-12 md:h-14 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm md:text-base transition-all duration-200 active:scale-[0.97]"><LogOut className="h-5 w-5 mr-2" /> Sortie</Button>
          </div>
          {feedback && <p className="text-sm text-center p-2.5 rounded-xl bg-blue-50 text-blue-700">{feedback}</p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-4 flex flex-col items-center text-center">
            <div className="relative h-20 w-20 mb-3">
              <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke={`${GREEN}20`} strokeWidth="8" />
                <circle cx="40" cy="40" r="34" fill="none" stroke={GREEN} strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 34}`} strokeDashoffset={`${2 * Math.PI * 34 * (1 - alPct / 100)}`}
                  className="transition-all duration-700" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold" style={{ color: NAVY }}>{alRemaining}j</span>
              </div>
            </div>
            <p className="font-medium text-sm" style={{ color: NAVY }}>Conges annuels</p>
            <p className="text-xs text-gray-400">sur {alTotal}j</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-4 flex flex-col items-center text-center">
            <div className="relative h-20 w-20 mb-3">
              <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#f9731620" strokeWidth="8" />
                <circle cx="40" cy="40" r="34" fill="none" stroke="#f97316" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 34}`} strokeDashoffset={`${2 * Math.PI * 34 * (1 - slPct / 100)}`}
                  className="transition-all duration-700" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold" style={{ color: NAVY }}>{slRemaining}j</span>
              </div>
            </div>
            <p className="font-medium text-sm" style={{ color: NAVY }}>Sick Leave</p>
            <p className="text-xs text-gray-400">sur {slTotal}j</p>
          </CardContent>
        </Card>
      </div>

      {annonces.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">Communications</p>
          {annonces.slice(0, 3).map((a: any) => {
            const typeStyles: Record<string, { bg: string; border: string; icon: string; text: string }> = {
              urgent: { bg: "#dc262608", border: "#dc2626", icon: "🚨", text: "#dc2626" },
              rh: { bg: `${BLUE}08`, border: BLUE, icon: "📋", text: BLUE },
              celebration: { bg: `${GOLD}08`, border: GOLD, icon: "🎉", text: GOLD },
              rappel: { bg: "#ea580c08", border: "#ea580c", icon: "⏰", text: "#ea580c" },
              info: { bg: "#05966908", border: "#059669", icon: "ℹ️", text: "#059669" },
            }
            const s = typeStyles[a.type] || typeStyles.info
            return (
              <div key={a.id} className="p-4 rounded-2xl transition-all duration-200" style={{ backgroundColor: s.bg, borderLeft: `4px solid ${s.border}` }}>
                <div className="flex items-start gap-3">
                  <span className="text-lg flex-shrink-0">{s.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: s.text }}>{a.titre}</p>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{a.contenu}</p>
                    <p className="text-[10px] text-gray-400 mt-1.5">{new Date(a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                  {a.priorite >= 2 && <Badge className="bg-red-100 text-red-700 text-[10px] flex-shrink-0">Urgent</Badge>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(() => {
        const HOLIDAYS_2026 = [
          { date: "2026-01-01", name: "New Year" },
          { date: "2026-01-02", name: "New Year (2nd day)" },
          { date: "2026-01-02", name: "Thaipoosam Cavadee" },
          { date: "2026-02-01", name: "Abolition of Slavery" },
          { date: "2026-02-15", name: "Maha Shivaratree" },
          { date: "2026-02-17", name: "Chinese Spring Festival" },
          { date: "2026-03-12", name: "Independence & Republic Day" },
          { date: "2026-03-20", name: "Eid-Ul-Fitr" },
          { date: "2026-04-03", name: "Ougadi" },
          { date: "2026-05-01", name: "Labour Day" },
          { date: "2026-08-15", name: "Assumption" },
          { date: "2026-08-26", name: "Ganesh Chaturthi" },
          { date: "2026-11-02", name: "Arrival of Indentured Labourers" },
          { date: "2026-11-08", name: "Divali" },
          { date: "2026-12-25", name: "Christmas" },
        ]
        const today = new Date().toISOString().split("T")[0]
        const upcoming = HOLIDAYS_2026.filter(h => h.date >= today).slice(0, 3)
        if (upcoming.length === 0) return null
        return (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">Prochains jours fériés</p>
            {upcoming.map((h, i) => {
              const d = new Date(h.date + "T12:00:00")
              const daysUntil = Math.ceil((d.getTime() - new Date().getTime()) / 86400000)
              const dayNum = d.getDate()
              const monthShort = d.toLocaleDateString("fr-FR", { month: "short" }).toUpperCase()
              return (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "#f8f9fc", border: "1px solid #e8eaef" }}>
                  <div className="flex flex-col items-center justify-center w-11 h-11 rounded-lg flex-shrink-0" style={{ backgroundColor: daysUntil <= 7 ? `${GOLD}12` : "#eef0f4" }}>
                    <span className="text-[10px] font-semibold leading-none" style={{ color: daysUntil <= 7 ? GOLD : "#9ca3af" }}>{monthShort}</span>
                    <span className="text-base font-bold leading-none" style={{ color: daysUntil <= 7 ? NAVY : "#6b7280" }}>{dayNum}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: NAVY }}>{h.name}</p>
                    <p className="text-xs text-gray-400">{d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0" style={{ backgroundColor: daysUntil <= 7 ? `${GOLD}15` : "#f3f4f6", color: daysUntil <= 7 ? GOLD : "#9ca3af" }}>
                    {daysUntil === 0 ? "Aujourd'hui" : daysUntil === 1 ? "Demain" : `J-${daysUntil}`}
                  </span>
                </div>
              )
            })}
          </div>
        )
      })()}

      <div className="grid grid-cols-2 gap-3">
        {([
          { icon: FileText, label: "Mes bulletins", onClick: () => router.push("/salarie#bulletins"), color: BLUE, bg: `linear-gradient(135deg, ${BLUE}08, ${BLUE}15)` },
          { icon: CalendarPlus, label: "Demander un conge", onClick: () => router.push("/salarie#conges"), color: GREEN, bg: `linear-gradient(135deg, ${GREEN}08, ${GREEN}15)` },
          { icon: HeartPulse, label: "Mon Espace Sante", onClick: () => router.push("/salarie#sante"), color: "#7c3aed", bg: "linear-gradient(135deg, #7c3aed08, #7c3aed15)" },
          { icon: Calendar, label: "Mon planning", onClick: () => router.push("/salarie#planning"), color: GOLD, bg: `linear-gradient(135deg, ${GOLD}08, ${GOLD}15)` },
        ] as const).map((action, i) => (
          <Card key={i}
            className="cursor-pointer rounded-xl shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.97] border-0"
            onClick={action.onClick}
            style={{ background: action.bg }}>
            <CardContent className="p-4 md:p-5 flex flex-col items-center gap-2.5 text-center">
              <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${action.color}15` }}>
                <action.icon className="h-6 w-6" style={{ color: action.color }} />
              </div>
              <p className="text-sm font-medium" style={{ color: NAVY }}>{action.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {notifications.length > 0 && (
        <Card className="hidden md:block rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2" style={{ color: NAVY }}>
              <Bell className="h-4 w-4" /> Notifications récentes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-2">
            {notifications.map((n, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${BLUE}15` }}>
                  <n.icon className="h-4 w-4" style={{ color: BLUE }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: NAVY }}>{n.text}</p>
                  {n.time && <p className="text-xs text-gray-400">{n.time}</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
