"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Clock, LogIn, LogOut, Users, Calendar, ChevronLeft, ChevronRight, X, AlertTriangle, CheckCircle, Coffee } from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Pointage {
  id: string
  employe_id: string
  date_pointage?: string
  heure_entree: string | null
  heure_sortie: string | null
  heure_pause_debut: string | null
  heure_pause_fin: string | null
  duree_minutes: number | null
  heures_travaillees?: number | null
  heures_sup?: number | null
  absent_justifie?: boolean
  en_conge?: boolean
  type_conge?: string
  employe?: { nom: string; prenom: string; poste?: string }
}

interface CongeToday {
  employe_id: string
  type_conge: string
}

interface Employe {
  id: string
  nom: string
  prenom: string
  poste?: string
  societe_id: string
}

interface Societe {
  id: string
  nom: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtHeure(h: string | null): string {
  return h ? h.slice(0, 5) : "--:--"
}

function dureeFmt(min: number | null): string {
  if (!min && min !== 0) return "--"
  const hrs = Math.floor(min / 60)
  const mins = min % 60
  return `${hrs}h${String(mins).padStart(2, "0")}`
}

function statutLabel(p: Pointage): { text: string; variant: "present" | "sorti" | "absent" | "none" | "conge" } {
  if (p.en_conge) return { text: `En congé${p.type_conge ? ` (${p.type_conge})` : ""}`, variant: "conge" }
  if (p.heure_entree && p.heure_sortie) return { text: "Termine", variant: "sorti" }
  if (p.heure_entree && !p.heure_sortie) return { text: "Present", variant: "present" }
  if (p.absent_justifie) return { text: "Absent", variant: "absent" }
  if (!p.heure_entree) return { text: "Non pointe", variant: "none" }
  return { text: "--", variant: "none" }
}

const BADGE_CLASSES: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-800 border-emerald-200",
  sorti: "bg-blue-100 text-blue-800 border-blue-200",
  absent: "bg-red-100 text-red-800 border-red-200",
  conge: "bg-green-100 text-green-800 border-green-200",
  none: "bg-gray-100 text-gray-600 border-gray-200",
}

// Mauritius timezone (UTC+4)
const MU_TZ = "Indian/Mauritius"

function nowMauritius(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: MU_TZ }))
}

function todayISO(): string {
  const d = nowMauritius()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function timeMauritius(): string {
  return new Date().toLocaleTimeString("en-GB", { timeZone: MU_TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
}

function frenchDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PointagePage() {
  // Clock
  const [now, setNow] = useState(new Date())

  // Data
  const [societes, setSocietes] = useState<Societe[]>([])
  const [employes, setEmployes] = useState<Employe[]>([])
  const [pointages, setPointages] = useState<Pointage[]>([])
  const [congesToday, setCongesToday] = useState<CongeToday[]>([])
  const [loading, setLoading] = useState(true)
  const [doingPointage, setDoingPointage] = useState(false)

  // Feedback
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)
  const [feedbackType, setFeedbackType] = useState<"success" | "error" | "warning">("success")

  // Selectors
  const [societeId, setSocieteId] = useState<string>("")
  const [employeId, setEmployeId] = useState<string>("")

  // Calendar
  const [showCalendar, setShowCalendar] = useState(false)
  const [calMonth, setCalMonth] = useState<string>(() => todayISO().slice(0, 7))
  const [calPointages, setCalPointages] = useState<Pointage[]>([])
  const [calLoading, setCalLoading] = useState(false)
  const [selectedCalDay, setSelectedCalDay] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Live clock — Mauritius time (UTC+4)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const timer = setInterval(() => setNow(nowMauritius()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Clear feedback after 5 seconds
  useEffect(() => {
    if (!feedbackMsg) return
    const t = setTimeout(() => setFeedbackMsg(null), 5000)
    return () => clearTimeout(t)
  }, [feedbackMsg])

  // ---------------------------------------------------------------------------
  // Load societes on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    Promise.all([
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: Societe) => [s.id, s])).values())
      setSocietes(unique)
      if (unique.length >= 1) setSocieteId(unique[0].id)
    })
  }, [])

  // ---------------------------------------------------------------------------
  // Load employes when societe changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!societeId) {
      setEmployes([])
      return
    }
    fetch(`/api/rh/employes?societe_id=${societeId}`)
      .then((r) => r.json())
      .then((d) => {
        const list: Employe[] = d.employes || []
        setEmployes(list.sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`)))
      })
      .catch(console.error)
  }, [societeId])

  // ---------------------------------------------------------------------------
  // Load today's pointages
  // ---------------------------------------------------------------------------
  const loadPointages = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ date: todayISO() })
      if (societeId) params.set("societe_id", societeId)

      // Fetch pointages and today's approved congés in parallel
      const congesParams = new URLSearchParams({ statut: "approuve" })
      if (societeId) congesParams.set("societe_id", societeId)

      const [pointageRes, congesRes] = await Promise.all([
        fetch(`/api/rh/pointage?${params}`).then(r => r.json()).catch(() => ({ pointages: [] })),
        fetch(`/api/rh/conges?${congesParams}`).then(r => r.json()).catch(() => ({ conges: [] })),
      ])

      setPointages(pointageRes.pointages || [])

      // Filter congés that cover today
      const today = todayISO()
      const todayConges: CongeToday[] = ((congesRes.conges || []) as any[])
        .filter((c: any) => c.date_debut <= today && c.date_fin >= today)
        .map((c: any) => ({ employe_id: c.employe_id, type_conge: c.type_conge }))
      setCongesToday(todayConges)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [societeId])

  useEffect(() => {
    loadPointages()
  }, [loadPointages])

  // Auto-refresh every 30s
  useEffect(() => {
    const iv = setInterval(loadPointages, 30000)
    return () => clearInterval(iv)
  }, [loadPointages])

  // ---------------------------------------------------------------------------
  // Load monthly data for calendar
  // ---------------------------------------------------------------------------
  const loadCalendar = useCallback(async () => {
    if (!showCalendar || !employeId) return
    setCalLoading(true)
    try {
      const params = new URLSearchParams({ mensuel: "1", periode: calMonth, employe_id: employeId })
      const res = await fetch(`/api/rh/pointage?${params}`)
      const data = await res.json()
      setCalPointages(data.pointages || [])
    } catch (e) {
      console.error(e)
    } finally {
      setCalLoading(false)
    }
  }, [showCalendar, employeId, calMonth])

  useEffect(() => {
    loadCalendar()
  }, [loadCalendar])

  // ---------------------------------------------------------------------------
  // Pointage action
  // ---------------------------------------------------------------------------
  const doPointage = async (type: "entree" | "sortie", overrideEmployeId?: string) => {
    const eid = overrideEmployeId || employeId
    if (!eid || !societeId) return
    setDoingPointage(true)
    setFeedbackMsg(null)

    try {
      const body = {
        employe_id: eid,
        type_pointage: type,
        societe_id: societeId,
        heure_forcee: timeMauritius(),
        date_pointage: todayISO(),
      }
      const res = await fetch("/api/rh/pointage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      console.log('[pointage response]', res.status, JSON.stringify(data).substring(0, 300))

      if (res.status === 409) {
        // Already clocked in/out
        setFeedbackType("warning")
        setFeedbackMsg(data.message || "Deja pointe aujourd'hui")
      } else if (!res.ok) {
        setFeedbackType("error")
        setFeedbackMsg(data.message || data.error || "Erreur lors du pointage")
      } else {
        const emp = employes.find((e) => e.id === eid)
        const name = emp ? `${emp.prenom} ${emp.nom}` : ""
        const timeStr = timeMauritius().slice(0, 5)

        if (type === "entree") {
          setFeedbackType("success")
          setFeedbackMsg(`Entree enregistree pour ${name} a ${timeStr}`)
        } else {
          const duree = data.pointage?.duree_minutes
          const dureeStr = duree ? ` — Duree: ${dureeFmt(duree)}` : ""
          const otStr = data.pointage?.heures_sup && data.pointage.heures_sup > 0
            ? ` (dont ${data.pointage.heures_sup.toFixed(1)}h sup.)`
            : ""
          setFeedbackType("success")
          setFeedbackMsg(`Sortie enregistree pour ${name} a ${timeStr}${dureeStr}${otStr}`)
        }

        // Update local state immediately with the returned pointage
        const returnedPointage = data.pointage
        if (returnedPointage) {
          const empId = returnedPointage.employe_id || eid
          const emp = employes.find(e => e.id === empId)
          const enriched: Pointage = {
            id: returnedPointage.id || `local-${Date.now()}`,
            employe_id: empId,
            date_pointage: returnedPointage.date_pointage || todayISO(),
            heure_entree: returnedPointage.heure_entree || (type === "entree" ? body.heure_forcee : null),
            heure_sortie: returnedPointage.heure_sortie || (type === "sortie" ? body.heure_forcee : null),
            duree_minutes: returnedPointage.duree_minutes || null,
            heures_travaillees: returnedPointage.heures_travaillees || null,
            heures_sup: returnedPointage.heures_sup || null,
            employe: returnedPointage.employe || (emp ? { nom: emp.nom, prenom: emp.prenom, poste: emp.poste } : undefined),
          }
          console.log('[local update]', enriched.employe_id, 'entree:', enriched.heure_entree, 'sortie:', enriched.heure_sortie)
          setPointages(prev => {
            const idx = prev.findIndex(x => x.employe_id === empId)
            if (idx >= 0) {
              const updated = [...prev]
              // Merge: keep existing fields, override with new ones
              updated[idx] = { ...prev[idx], ...enriched, employe: enriched.employe || prev[idx].employe }
              return updated
            }
            return [...prev, enriched]
          })
        } else {
          // No pointage returned but no error — create a local entry
          const emp = employes.find(e => e.id === eid)
          const localEntry: Pointage = {
            id: `local-${Date.now()}`,
            employe_id: eid,
            heure_entree: type === "entree" ? body.heure_forcee : null,
            heure_sortie: type === "sortie" ? body.heure_forcee : null,
            duree_minutes: null,
            employe: emp ? { nom: emp.nom, prenom: emp.prenom, poste: emp.poste } : undefined,
          }
          setPointages(prev => {
            const idx = prev.findIndex(x => x.employe_id === eid)
            if (idx >= 0) {
              const updated = [...prev]
              updated[idx] = { ...prev[idx], ...localEntry, employe: localEntry.employe || prev[idx].employe }
              return updated
            }
            return [...prev, localEntry]
          })
        }

        // Also refresh from server
        loadPointages()
        if (showCalendar) loadCalendar()
      }
    } catch (e) {
      console.error(e)
      setFeedbackType("error")
      setFeedbackMsg("Erreur de connexion au serveur")
    } finally {
      setDoingPointage(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Today's status for selected employee
  // ---------------------------------------------------------------------------
  const selectedEmployeePointage = useMemo(() => {
    if (!employeId) return null
    // Check sortedPointages which has congé info merged in
    return sortedPointages.find((p) => p.employe_id === employeId) || null
  }, [employeId, sortedPointages])

  // Determine button states for selected employee
  const canClockIn = useMemo(() => {
    if (!selectedEmployeePointage) return true
    if (selectedEmployeePointage.en_conge) return false
    return !selectedEmployeePointage.heure_entree
  }, [selectedEmployeePointage])

  const canClockOut = useMemo(() => {
    if (!selectedEmployeePointage) return false
    if (selectedEmployeePointage.en_conge) return false
    return !!selectedEmployeePointage.heure_entree && !selectedEmployeePointage.heure_sortie
  }, [selectedEmployeePointage])

  // ---------------------------------------------------------------------------
  // Merged view: all employees with their pointage (or placeholder if none)
  // ---------------------------------------------------------------------------
  const sortedPointages = useMemo(() => {
    // Build a map of congés by employe_id for quick lookup
    const congeMap = new Map<string, CongeToday>()
    for (const c of congesToday) {
      congeMap.set(c.employe_id, c)
    }

    // Build a map of existing pointages by employe_id
    const pointageMap = new Map<string, Pointage>()
    for (const p of pointages) {
      pointageMap.set(p.employe_id, p)
    }

    // For each employee, either use existing pointage or create a placeholder
    const merged: Pointage[] = employes.map((emp) => {
      const existing = pointageMap.get(emp.id)
      const conge = congeMap.get(emp.id)

      if (existing) {
        // Enrich with congé info if applicable
        if (conge) return { ...existing, en_conge: true, type_conge: conge.type_conge }
        return existing
      }

      // Employee on approved congé today — mark as "En congé"
      if (conge) {
        return {
          id: `conge-${emp.id}`,
          employe_id: emp.id,
          heure_entree: null,
          heure_sortie: null,
          heure_pause_debut: null,
          heure_pause_fin: null,
          duree_minutes: null,
          heures_travaillees: null,
          heures_sup: null,
          en_conge: true,
          type_conge: conge.type_conge,
          employe: { nom: emp.nom, prenom: emp.prenom, poste: emp.poste },
        }
      }

      // Placeholder for employees with no pointage today
      return {
        id: `placeholder-${emp.id}`,
        employe_id: emp.id,
        heure_entree: null,
        heure_sortie: null,
        heure_pause_debut: null,
        heure_pause_fin: null,
        duree_minutes: null,
        heures_travaillees: null,
        heures_sup: null,
        employe: { nom: emp.nom, prenom: emp.prenom, poste: emp.poste },
      }
    })

    // Also include pointages for employees not in the current employes list
    for (const p of pointages) {
      if (!employes.find((e) => e.id === p.employe_id)) {
        const conge = congeMap.get(p.employe_id)
        if (conge) merged.push({ ...p, en_conge: true, type_conge: conge.type_conge })
        else merged.push(p)
      }
    }

    return merged.sort((a, b) => {
      const nameA = `${a.employe?.nom || ""} ${a.employe?.prenom || ""}`
      const nameB = `${b.employe?.nom || ""} ${b.employe?.prenom || ""}`
      return nameA.localeCompare(nameB)
    })
  }, [pointages, employes, congesToday])

  // ---------------------------------------------------------------------------
  // Calendar helpers
  // ---------------------------------------------------------------------------
  const calendarData = useMemo(() => {
    const [year, month] = calMonth.split("-").map(Number)
    const firstDay = new Date(year, month - 1, 1)
    const daysInMonth = new Date(year, month, 0).getDate()
    let startDow = firstDay.getDay() - 1
    if (startDow < 0) startDow = 6

    const pointageMap = new Map<string, Pointage>()
    for (const p of calPointages) {
      const day = p.date_pointage || ""
      pointageMap.set(day, p)
    }

    const weeks: { day: number; date: string; isWeekend: boolean; pointage: Pointage | null }[][] = []
    let currentWeek: typeof weeks[0] = []

    for (let i = 0; i < startDow; i++) {
      currentWeek.push({ day: 0, date: "", isWeekend: false, pointage: null })
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month - 1, d)
      const dow = dateObj.getDay()
      const isWeekend = dow === 0 || dow === 6
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      currentWeek.push({ day: d, date: dateStr, isWeekend, pointage: pointageMap.get(dateStr) || null })

      if (dow === 0 || d === daysInMonth) {
        while (currentWeek.length < 7) {
          currentWeek.push({ day: 0, date: "", isWeekend: false, pointage: null })
        }
        weeks.push(currentWeek)
        currentWeek = []
      }
    }

    return { weeks, monthLabel: firstDay.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) }
  }, [calMonth, calPointages])

  const navigateMonth = (delta: number) => {
    const [y, m] = calMonth.split("-").map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
    setSelectedCalDay(null)
  }

  const selectedDayPointage = useMemo(() => {
    if (!selectedCalDay) return null
    return calPointages.find((p) => p.date_pointage === selectedCalDay) || null
  }, [selectedCalDay, calPointages])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      {/* TOP SECTION: Clock + Punch buttons */}
      <Card className="border-0 shadow-lg overflow-hidden">
        <div className="bg-[#0B0F2E] text-white p-6 md:p-10 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Clock className="w-8 h-8 text-[#D4AF37]" />
            <span className="text-5xl md:text-7xl font-mono font-bold tracking-wider">
              {now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
          <p className="text-lg text-gray-300 capitalize">{frenchDate(now)}</p>
          <p className="text-sm text-[#D4AF37] mt-1">Heure Maurice (UTC+4)</p>
        </div>

        <CardContent className="p-6 space-y-5">
          {/* Selectors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 block">
                Societe
              </label>
              <Select value={societeId} onValueChange={(v) => { setSocieteId(v); setEmployeId("") }}>
                <SelectTrigger className="h-12 text-base">
                  <SelectValue placeholder="Choisir une societe..." />
                </SelectTrigger>
                <SelectContent>
                  {societes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 block">
                Employe
              </label>
              <Select value={employeId} onValueChange={setEmployeId} disabled={!societeId}>
                <SelectTrigger className="h-12 text-base">
                  <SelectValue placeholder={societeId ? "Choisir un employe..." : "Selectionnez d'abord une societe"} />
                </SelectTrigger>
                <SelectContent>
                  {employes.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.prenom} {e.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Punch buttons */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button
              onClick={() => doPointage("entree")}
              disabled={!employeId || doingPointage || !canClockIn}
              className="h-16 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-xl shadow-md transition-all active:scale-95"
            >
              <LogIn className="w-5 h-5 mr-2" /> Entree
            </Button>
            <Button
              onClick={() => doPointage("pause_debut")}
              disabled={!employeId || doingPointage || !canClockOut}
              className="h-16 text-base font-semibold bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-xl shadow-md transition-all active:scale-95"
            >
              <Coffee className="w-5 h-5 mr-2" /> Debut Pause
            </Button>
            <Button
              onClick={() => doPointage("pause_fin")}
              disabled={!employeId || doingPointage}
              className="h-16 text-base font-semibold bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white rounded-xl shadow-md transition-all active:scale-95"
            >
              <Coffee className="w-5 h-5 mr-2" /> Fin Pause
            </Button>
            <Button
              onClick={() => doPointage("sortie")}
              disabled={!employeId || doingPointage || !canClockOut}
              className="h-16 text-base font-semibold bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-xl shadow-md transition-all active:scale-95"
            >
              <LogOut className="w-5 h-5 mr-2" /> Sortie
            </Button>
          </div>

          {/* Feedback message */}
          {feedbackMsg && (
            <div
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium ${
                feedbackType === "success"
                  ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                  : feedbackType === "warning"
                  ? "bg-amber-50 border border-amber-200 text-amber-800"
                  : "bg-red-50 border border-red-200 text-red-800"
              }`}
            >
              {feedbackType === "success" ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              )}
              <span>{feedbackMsg}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* TODAY'S STATUS for selected employee */}
      {employeId && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#D4AF37]" />
              Statut du jour
              {(() => {
                const emp = employes.find((e) => e.id === employeId)
                return emp ? ` -- ${emp.prenom} ${emp.nom}` : ""
              })()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedEmployeePointage ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Entree</p>
                    <p className="text-2xl font-mono font-semibold text-emerald-700">
                      {fmtHeure(selectedEmployeePointage.heure_entree)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Sortie</p>
                    <p className="text-2xl font-mono font-semibold text-red-600">
                      {fmtHeure(selectedEmployeePointage.heure_sortie)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Duree</p>
                    <p className="text-2xl font-mono font-semibold text-[#0B0F2E]">
                      {dureeFmt(selectedEmployeePointage.duree_minutes)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">H. Sup</p>
                    <p className="text-2xl font-mono font-semibold text-[#D4AF37]">
                      {selectedEmployeePointage.heures_sup
                        ? `${selectedEmployeePointage.heures_sup.toFixed(1)}h`
                        : "--"}
                    </p>
                  </div>
                </div>
                <div>
                  {(() => {
                    const s = statutLabel(selectedEmployeePointage)
                    return (
                      <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold border ${BADGE_CLASSES[s.variant]}`}>
                        {s.text}
                      </span>
                    )
                  })()}
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold border ${BADGE_CLASSES.none}`}>
                  Non pointe
                </span>
                <p className="text-sm text-gray-400 mt-2">Aucun pointage enregistre aujourd'hui</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* DAILY VIEW: All employees today */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2">
              <Users className="w-5 h-5 text-[#D4AF37]" />
              Tous les employes -- Aujourd'hui
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCalendar(!showCalendar)}
              className="text-[#0B0F2E] border-[#0B0F2E]/20"
            >
              <Calendar className="w-4 h-4 mr-2" />
              {showCalendar ? "Masquer calendrier" : "Vue mensuelle"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[#0B0F2E]" />
            </div>
          ) : sortedPointages.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              {societeId ? "Aucun employe dans cette societe" : "Selectionnez une societe"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold text-[#0B0F2E]">Employe</TableHead>
                    <TableHead className="font-semibold text-[#0B0F2E] text-center">Entree</TableHead>
                    <TableHead className="font-semibold text-[#0B0F2E] text-center">Pause</TableHead>
                    <TableHead className="font-semibold text-[#0B0F2E] text-center">Sortie</TableHead>
                    <TableHead className="font-semibold text-[#0B0F2E] text-center">Heures</TableHead>
                    <TableHead className="font-semibold text-[#0B0F2E] text-center">H. Sup</TableHead>
                    <TableHead className="font-semibold text-[#0B0F2E] text-center">Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedPointages.map((p) => {
                    const s = statutLabel(p)
                    const isOnLeave = !!p.en_conge
                    const canIn = !isOnLeave && !p.heure_entree
                    const canOut = !isOnLeave && !!p.heure_entree && !p.heure_sortie
                    return (
                      <TableRow
                        key={p.id}
                        className={`${
                          s.variant === "conge"
                            ? "bg-green-50/40"
                            : s.variant === "present"
                            ? "bg-emerald-50/30"
                            : s.variant === "sorti"
                            ? "bg-blue-50/30"
                            : s.variant === "absent"
                            ? "bg-red-50/30"
                            : ""
                        }`}
                      >
                        <TableCell className="font-medium">
                          {p.employe?.prenom} {p.employe?.nom}
                        </TableCell>
                        <TableCell className="text-center">
                          {isOnLeave ? (
                            <span className="text-green-600 text-xs font-medium">--</span>
                          ) : p.heure_entree ? (
                            <span className="font-mono text-emerald-700">{fmtHeure(p.heure_entree)}</span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={doingPointage}
                              onClick={() => doPointage("entree", p.employe_id)}
                              className="text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                            >
                              <LogIn className="w-3 h-3 mr-1" /> Pointer
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {p.heure_pause_debut ? (
                            <span className="font-mono text-amber-600 text-xs">
                              {fmtHeure(p.heure_pause_debut)}{p.heure_pause_fin ? `—${fmtHeure(p.heure_pause_fin)}` : " ..."}
                            </span>
                          ) : canOut ? (
                            <Button size="sm" variant="outline" disabled={doingPointage}
                              onClick={() => doPointage("pause_debut", p.employe_id)}
                              className="text-[10px] h-6 border-amber-300 text-amber-600 hover:bg-amber-50">
                              <Coffee className="w-3 h-3 mr-0.5" /> Pause
                            </Button>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {p.heure_sortie ? (
                            <span className="font-mono text-red-600">{fmtHeure(p.heure_sortie)}</span>
                          ) : canOut ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={doingPointage}
                              onClick={() => doPointage("sortie", p.employe_id)}
                              className="text-xs border-red-300 text-red-600 hover:bg-red-50"
                            >
                              <LogOut className="w-3 h-3 mr-1" /> Pointer
                            </Button>
                          ) : (
                            <span className="font-mono text-red-300">--:--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {dureeFmt(p.duree_minutes)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-[#D4AF37]">
                          {p.heures_sup && p.heures_sup > 0
                            ? `${p.heures_sup.toFixed(1)}h`
                            : "--"}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${BADGE_CLASSES[s.variant]}`}>
                            {s.text}
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MONTHLY CALENDAR */}
      {showCalendar && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#D4AF37]" />
              Calendrier mensuel
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!employeId ? (
              <div className="text-center py-8 text-gray-400">
                Selectionnez un employe pour afficher son calendrier mensuel
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" onClick={() => navigateMonth(-1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-lg font-semibold text-[#0B0F2E] capitalize">
                    {calendarData.monthLabel}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => navigateMonth(1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                {calLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-[#0B0F2E]" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-7 gap-1">
                      {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
                        <div key={d} className="text-center text-xs font-semibold text-gray-500 py-2">
                          {d}
                        </div>
                      ))}
                      {calendarData.weeks.flat().map((cell, i) => {
                        if (cell.day === 0) {
                          return <div key={`empty-${i}`} className="aspect-square" />
                        }

                        const isToday = cell.date === todayISO()
                        const hasEntry = cell.pointage?.heure_entree
                        const isAbsent = cell.pointage && !cell.pointage.heure_entree
                        const isFuture = cell.date > todayISO()

                        let bg = "bg-white hover:bg-gray-50"
                        if (cell.isWeekend) bg = "bg-gray-100"
                        else if (isFuture) bg = "bg-white"
                        else if (hasEntry) bg = "bg-emerald-100 hover:bg-emerald-200"
                        else if (isAbsent) bg = "bg-red-100 hover:bg-red-200"

                        return (
                          <button
                            key={cell.date}
                            onClick={() => setSelectedCalDay(cell.date === selectedCalDay ? null : cell.date)}
                            className={`aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${bg} ${
                              isToday ? "ring-2 ring-[#D4AF37] ring-offset-1" : ""
                            } ${selectedCalDay === cell.date ? "ring-2 ring-[#0B0F2E]" : ""}`}
                          >
                            {cell.day}
                          </button>
                        )
                      })}
                    </div>

                    <div className="flex items-center justify-center gap-6 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" /> Present
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded bg-red-100 border border-red-200" /> Absent
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded bg-gray-100 border border-gray-200" /> Weekend
                      </span>
                    </div>

                    {selectedCalDay && (
                      <div className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex items-center justify-between mb-3">
                          <p className="font-semibold text-[#0B0F2E] capitalize">
                            {new Date(selectedCalDay + "T12:00:00").toLocaleDateString("fr-FR", {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                            })}
                          </p>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedCalDay(null)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                        {selectedDayPointage ? (
                          <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Entree</p>
                              <p className="text-lg font-mono font-semibold text-emerald-700">
                                {fmtHeure(selectedDayPointage.heure_entree)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Sortie</p>
                              <p className="text-lg font-mono font-semibold text-red-600">
                                {fmtHeure(selectedDayPointage.heure_sortie)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Duree</p>
                              <p className="text-lg font-mono font-semibold text-[#0B0F2E]">
                                {dureeFmt(selectedDayPointage.duree_minutes)}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-center text-gray-400 text-sm">Aucun pointage ce jour</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-gray-400">
        Actualisation automatique toutes les 30 secondes
      </p>
    </div>
  )
}
