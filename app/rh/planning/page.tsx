"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Loader2, Calendar, ChevronLeft, ChevronRight, Send, Wand2, Users, Check, Plus, Trash2, Clock, Coffee } from "lucide-react"

// ─── Types ──────────────────────────────────────────────────────────

interface Creneau {
  id: string
  nom: string
  code: string
  heure_debut: string
  heure_fin: string
  pause_debut: string
  pause_fin: string
  pause_minutes: number
  heures_effectives: number
  couleur: string
}

interface CellData {
  creneau_id: string
  heure_debut: string
  heure_fin: string
  pause_debut: string
  pause_fin: string
  heures_prevues: number
}

// ─── Helpers ────────────────────────────────────────────────────────

function computeMinutes(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  let diff = (eh * 60 + em) - (sh * 60 + sm)
  if (diff < 0) diff += 24 * 60
  return diff
}

function computeEffective(hd: string, hf: string, pd: string, pf: string): number {
  const total = computeMinutes(hd, hf)
  const pause = pd && pf ? computeMinutes(pd, pf) : 0
  return Math.round((total - pause) / 60 * 10) / 10
}

function fmtH(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`
}

const COLORS = [
  "bg-blue-500 text-white", "bg-emerald-500 text-white", "bg-orange-500 text-white",
  "bg-purple-500 text-white", "bg-indigo-600 text-white", "bg-pink-500 text-white",
  "bg-teal-500 text-white", "bg-red-500 text-white", "bg-cyan-600 text-white",
]

function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate() }
function isWeekend(year: number, month: number, day: number) { const d = new Date(year, month, day); return d.getDay() === 0 || d.getDay() === 6 }

const MONTH_NAMES = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
const DAY_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]

const REPOS_CRENEAU: Creneau = {
  id: "repos", nom: "Repos", code: "R",
  heure_debut: "", heure_fin: "", pause_debut: "", pause_fin: "",
  pause_minutes: 0, heures_effectives: 0, couleur: "bg-gray-200 text-gray-600",
}

const DEFAULT_CRENEAUX: Creneau[] = [
  { id: "c1", nom: "Journée", code: "J", heure_debut: "08:00", heure_fin: "17:00", pause_debut: "12:00", pause_fin: "13:00", pause_minutes: 60, heures_effectives: 8, couleur: COLORS[0] },
  { id: "c2", nom: "Matin", code: "M", heure_debut: "06:00", heure_fin: "14:00", pause_debut: "10:00", pause_fin: "10:30", pause_minutes: 30, heures_effectives: 7.5, couleur: COLORS[2] },
  { id: "c3", nom: "Après-midi", code: "AM", heure_debut: "14:00", heure_fin: "22:00", pause_debut: "18:00", pause_fin: "18:30", pause_minutes: 30, heures_effectives: 7.5, couleur: COLORS[3] },
  { id: "c4", nom: "Nuit", code: "N", heure_debut: "22:00", heure_fin: "06:00", pause_debut: "02:00", pause_fin: "02:30", pause_minutes: 30, heures_effectives: 7.5, couleur: COLORS[4] },
]

// ─── Component ──────────────────────────────────────────────────────

export default function PlanningPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [employes, setEmployes] = useState<any[]>([])
  const [planning, setPlanning] = useState<Record<string, Record<number, CellData | null>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [published, setPublished] = useState(false)

  // Créneaux configuration
  const [creneaux, setCreneaux] = useState<Creneau[]>(DEFAULT_CRENEAUX)
  const [creneauConfigOpen, setCreneauConfigOpen] = useState(false)
  const [editingCreneau, setEditingCreneau] = useState<Creneau | null>(null)

  // Employee filter — who appears in the planning
  const [allEmployes, setAllEmployes] = useState<any[]>([])
  const [includedEmpIds, setIncludedEmpIds] = useState<Set<string>>(new Set())
  const [groupes, setGroupes] = useState<any[]>([])
  const [selectedGroupe, setSelectedGroupe] = useState("all")
  const [empFilterOpen, setEmpFilterOpen] = useState(false)
  const [empSearch, setEmpSearch] = useState("")

  // Cell edit
  const [editCell, setEditCell] = useState<{ empId: string; day: number } | null>(null)

  // Bulk assign
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkEmployees, setBulkEmployees] = useState<string[]>([])
  const [bulkDateFrom, setBulkDateFrom] = useState(1)
  const [bulkDateTo, setBulkDateTo] = useState(1)
  const [bulkCreneauId, setBulkCreneauId] = useState("c1")
  const [bulkWeekendOff, setBulkWeekendOff] = useState(true)

  const daysInMonth = getDaysInMonth(year, month)
  const periode = `${year}-${String(month + 1).padStart(2, "0")}`

  const getCreneauById = (id: string): Creneau => creneaux.find(c => c.id === id) || REPOS_CRENEAU
  const allCreneaux = [...creneaux, REPOS_CRENEAU]

  // ─── Load data ──────────────────────────────────────────────────

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
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ periode })
      if (societe !== "all") params.set("societe_id", societe)
      const [planRes, empRes, grpRes] = await Promise.all([
        fetch(`/api/rh/planning?${params}`).then(r => r.json()).catch(() => ({ planning: [] })),
        fetch(`/api/rh/employes?${societe !== "all" ? `societe_id=${societe}` : ""}`).then(r => r.json()).catch(() => ({ employes: [] })),
        fetch(`/api/rh/groupes?${societe !== "all" ? `societe_id=${societe}` : ""}`).then(r => r.json()).catch(() => ({ groupes: [] })),
      ])
      setGroupes(grpRes.groupes || [])
      const emps = (empRes.employes || []).sort((a: any, b: any) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`))
      setAllEmployes(emps)
      setPublished(planRes.published || false)

      // If first load or société changed, include all employees by default
      // But if we have planning data, only include those who have entries + current selection
      const planEmpIds = new Set((planRes.planning || []).map((e: any) => e.employe_id))
      if (includedEmpIds.size === 0) {
        // First load: include all if no planning, or only planned ones + all
        setIncludedEmpIds(new Set(emps.map((e: any) => e.id)))
      }

      // Filter displayed employees
      const displayedEmps = emps.filter((e: any) => includedEmpIds.size === 0 || includedEmpIds.has(e.id))
      setEmployes(displayedEmps)

      const grid: Record<string, Record<number, CellData | null>> = {}
      for (const emp of displayedEmps) {
        grid[emp.id] = {}
        for (let d = 1; d <= daysInMonth; d++) grid[emp.id][d] = null
      }
      for (const entry of planRes.planning || []) {
        if (grid[entry.employe_id]) {
          const day = parseInt(entry.jour || entry.day, 10)
          if (day >= 1 && day <= daysInMonth) {
            grid[entry.employe_id][day] = {
              creneau_id: entry.creneau_id || entry.shift || "repos",
              heure_debut: entry.heure_debut || "",
              heure_fin: entry.heure_fin || "",
              pause_debut: entry.pause_debut || "",
              pause_fin: entry.pause_fin || "",
              heures_prevues: entry.heures_prevues || 0,
            }
          }
        }
      }
      setPlanning(grid)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [societe, periode, daysInMonth])

  useEffect(() => { load() }, [load])

  // ─── Actions ────────────────────────────────────────────────────

  const assignCreneau = (empId: string, day: number, creneauId: string) => {
    if (creneauId === "repos") {
      setPlanning(prev => ({ ...prev, [empId]: { ...prev[empId], [day]: null } }))
    } else {
      const c = getCreneauById(creneauId)
      setPlanning(prev => ({
        ...prev,
        [empId]: {
          ...prev[empId],
          [day]: {
            creneau_id: c.id,
            heure_debut: c.heure_debut,
            heure_fin: c.heure_fin,
            pause_debut: c.pause_debut,
            pause_fin: c.pause_fin,
            heures_prevues: c.heures_effectives,
          }
        },
      }))
    }
    setEditCell(null)
  }

  const generateStandard = () => {
    const c = creneaux[0] // Premier créneau = journée standard
    setPlanning(prev => {
      const next = { ...prev }
      for (const empId of Object.keys(next)) {
        const row = { ...next[empId] }
        for (let d = 1; d <= daysInMonth; d++) {
          row[d] = isWeekend(year, month, d) ? null : {
            creneau_id: c.id, heure_debut: c.heure_debut, heure_fin: c.heure_fin,
            pause_debut: c.pause_debut, pause_fin: c.pause_fin, heures_prevues: c.heures_effectives,
          }
        }
        next[empId] = row
      }
      return next
    })
  }

  const generate3x8 = () => {
    const rotatingCreneaux = creneaux.filter(c => c.id !== creneaux[0]?.id).slice(0, 3)
    if (rotatingCreneaux.length < 2) return
    setPlanning(prev => {
      const next = { ...prev }
      const empIds = Object.keys(next)
      empIds.forEach((empId, idx) => {
        const row = { ...next[empId] }
        for (let d = 1; d <= daysInMonth; d++) {
          const weekNum = Math.floor((d - 1) / 7)
          const c = rotatingCreneaux[(idx + weekNum) % rotatingCreneaux.length]
          row[d] = { creneau_id: c.id, heure_debut: c.heure_debut, heure_fin: c.heure_fin, pause_debut: c.pause_debut, pause_fin: c.pause_fin, heures_prevues: c.heures_effectives }
        }
        next[empId] = row
      })
      return next
    })
  }

  const applyBulk = () => {
    const c = bulkCreneauId === "repos" ? REPOS_CRENEAU : getCreneauById(bulkCreneauId)
    setPlanning(prev => {
      const next = { ...prev }
      for (const empId of bulkEmployees) {
        if (!next[empId]) continue
        const row = { ...next[empId] }
        for (let d = bulkDateFrom; d <= Math.min(bulkDateTo, daysInMonth); d++) {
          if (bulkWeekendOff && isWeekend(year, month, d) && bulkCreneauId !== "repos") continue
          row[d] = c.id === "repos" ? null : {
            creneau_id: c.id, heure_debut: c.heure_debut, heure_fin: c.heure_fin,
            pause_debut: c.pause_debut, pause_fin: c.pause_fin, heures_prevues: c.heures_effectives,
          }
        }
        next[empId] = row
      }
      return next
    })
    setBulkOpen(false)
  }

  const savePlanning = async (publish = false) => {
    setSaving(true)
    try {
      const entries: any[] = []
      for (const empId of Object.keys(planning)) {
        for (let d = 1; d <= daysInMonth; d++) {
          const cell = planning[empId][d]
          entries.push({
            employe_id: empId, jour: d,
            shift: cell ? (getCreneauById(cell.creneau_id)?.nom || cell.creneau_id) : "Repos",
            creneau_id: cell?.creneau_id || "repos",
            heure_debut: cell?.heure_debut || null,
            heure_fin: cell?.heure_fin || null,
            pause_debut: cell?.pause_debut || null,
            pause_fin: cell?.pause_fin || null,
            heures_prevues: cell?.heures_prevues || 0,
          })
        }
      }
      await fetch("/api/rh/planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periode, societe_id: societe, planning: entries, publish }),
      })
      if (publish) setPublished(true)
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  // ─── Créneau CRUD ────────────────────────────────────────────────

  const addCreneau = () => {
    const id = `c${Date.now()}`
    const newC: Creneau = {
      id, nom: "Nouveau créneau", code: "X",
      heure_debut: "08:00", heure_fin: "16:00",
      pause_debut: "12:00", pause_fin: "12:30", pause_minutes: 30,
      heures_effectives: 7.5, couleur: COLORS[creneaux.length % COLORS.length],
    }
    setCreneaux(prev => [...prev, newC])
    setEditingCreneau(newC)
  }

  const updateCreneau = (updated: Creneau) => {
    updated.pause_minutes = computeMinutes(updated.pause_debut, updated.pause_fin)
    updated.heures_effectives = computeEffective(updated.heure_debut, updated.heure_fin, updated.pause_debut, updated.pause_fin)
    setCreneaux(prev => prev.map(c => c.id === updated.id ? updated : c))
    setEditingCreneau(null)
  }

  const deleteCreneau = (id: string) => {
    setCreneaux(prev => prev.filter(c => c.id !== id))
    setEditingCreneau(null)
  }

  // ─── Navigation ─────────────────────────────────────────────────

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Planning</h1>
          <p className="text-gray-500 text-sm">Créneaux personnalisables avec pauses</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Société" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          {groupes.length > 0 && (
            <Select value={selectedGroupe} onValueChange={v => {
              setSelectedGroupe(v)
              if (v === "all") {
                setIncludedEmpIds(new Set(allEmployes.map(e => e.id)))
              } else if (v === "sans_groupe") {
                const assignedIds = new Set(groupes.flatMap((g: any) => (g.membres || []).map((m: any) => m.employe_id)))
                setIncludedEmpIds(new Set(allEmployes.filter(e => !assignedIds.has(e.id)).map(e => e.id)))
              } else {
                const g = groupes.find((g: any) => g.id === v)
                setIncludedEmpIds(new Set((g?.membres || []).map((m: any) => m.employe_id)))
              }
              // Trigger re-render of displayed employees
              setEmployes(allEmployes.filter(e => {
                if (v === "all") return true
                if (v === "sans_groupe") {
                  const assignedIds = new Set(groupes.flatMap((g: any) => (g.membres || []).map((m: any) => m.employe_id)))
                  return !assignedIds.has(e.id)
                }
                const g = groupes.find((g: any) => g.id === v)
                return (g?.membres || []).some((m: any) => m.employe_id === e.id)
              }))
            }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Groupe" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les groupes</SelectItem>
                {groupes.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.nom} ({g.nb_membres})</SelectItem>)}
                <SelectItem value="sans_groupe">Sans groupe</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => setEmpFilterOpen(true)}>
            <Users className="h-4 w-4 mr-1" /> Collaborateurs ({employes.length}/{allEmployes.length})
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setEditingCreneau(null); setCreneauConfigOpen(true) }}>
            <Clock className="h-4 w-4 mr-1" /> Créneaux
          </Button>
        </div>
      </div>

      {/* Créneaux summary */}
      <Card className="border-dashed">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-2">
            {creneaux.map(c => (
              <div key={c.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${c.couleur}`}>
                <span className="font-bold">{c.code}</span>
                <span>{c.nom}</span>
                <span className="opacity-75">{c.heure_debut}—{c.heure_fin}</span>
                {c.pause_minutes > 0 && <span className="opacity-75 flex items-center gap-0.5"><Coffee className="w-3 h-3" />{c.pause_minutes}min</span>}
                <span className="opacity-75">({c.heures_effectives}h eff.)</span>
              </div>
            ))}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-200 text-gray-600">
              <span className="font-bold">R</span> Repos
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <CardTitle className="text-lg" style={{ color: "#1E2A4A" }}>
                <Calendar className="inline h-5 w-5 mr-2" />{MONTH_NAMES[month]} {year}
              </CardTitle>
              <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {published && <Badge className="bg-green-100 text-green-700">Publié</Badge>}
              <Button variant="outline" size="sm" onClick={generateStandard}><Wand2 className="h-4 w-4 mr-1" /> Standard</Button>
              <Button variant="outline" size="sm" onClick={generate3x8}>3×8</Button>
              <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}><Users className="h-4 w-4 mr-1" /> Masse</Button>
              <Button variant="outline" size="sm" onClick={() => savePlanning(false)} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />} Sauver
              </Button>
              <Button size="sm" onClick={() => savePlanning(true)} disabled={saving} style={{ backgroundColor: "#C9A84C" }} className="text-white hover:opacity-90">
                <Send className="h-4 w-4 mr-1" /> Publier
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
          ) : employes.length === 0 ? (
            <p className="text-center text-gray-400 py-12">Aucun employé. Sélectionnez une société.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white z-10 border px-2 py-1 text-left min-w-[140px]" style={{ color: "#1E2A4A" }}>Employé</th>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                      const dow = new Date(year, month, d).getDay()
                      return (
                        <th key={d} className={`border px-0 py-1 text-center min-w-[38px] ${dow === 0 || dow === 6 ? "bg-gray-100" : ""}`}>
                          <div className="text-[9px] text-gray-400">{DAY_NAMES[dow]}</div>
                          <div className="text-[11px]">{d}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {employes.map(emp => (
                    <tr key={emp.id}>
                      <td className="sticky left-0 bg-white z-10 border px-2 py-1 font-medium truncate max-w-[140px]">{emp.prenom} {emp.nom}</td>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                        const cell = planning[emp.id]?.[d]
                        const creneau = cell ? getCreneauById(cell.creneau_id) : REPOS_CRENEAU
                        const isEditing = editCell?.empId === emp.id && editCell?.day === d
                        return (
                          <td key={d} className="border p-0 text-center cursor-pointer relative"
                            onClick={() => setEditCell(isEditing ? null : { empId: emp.id, day: d })}
                            title={cell ? `${creneau.nom}\n${cell.heure_debut}—${cell.heure_fin}\nPause: ${cell.pause_debut || "—"}—${cell.pause_fin || "—"}\n${cell.heures_prevues}h eff.` : "Repos"}
                          >
                            <div className={`w-full py-0.5 leading-tight ${creneau.couleur}`}>
                              <div className="text-[10px] font-bold">{creneau.code}</div>
                              {cell && <div className="text-[7px] opacity-80">{cell.heure_debut?.slice(0,5)}</div>}
                            </div>
                            {isEditing && (
                              <div className="absolute top-full left-0 z-30 bg-white border rounded-lg shadow-xl p-1 flex flex-col gap-0.5 min-w-[160px]" onClick={e => e.stopPropagation()}>
                                {allCreneaux.map(c => (
                                  <button key={c.id}
                                    className={`text-left px-2 py-1.5 rounded text-xs hover:opacity-80 flex items-center justify-between gap-2 ${c.couleur}`}
                                    onClick={() => assignCreneau(emp.id, d, c.id)}>
                                    <span className="font-bold">{c.code} {c.nom}</span>
                                    {c.heure_debut && <span className="text-[10px] opacity-75">{c.heure_debut}—{c.heure_fin}</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Employee filter dialog ── */}
      <Dialog open={empFilterOpen} onOpenChange={setEmpFilterOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: "#1E2A4A" }}>Collaborateurs dans le planning</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Rechercher un collaborateur..." value={empSearch} onChange={e => setEmpSearch(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIncludedEmpIds(new Set(allEmployes.map(e => e.id)))}>
                Tout sélectionner
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIncludedEmpIds(new Set())}>
                Tout désélectionner
              </Button>
            </div>
            <div className="border rounded-lg divide-y max-h-[50vh] overflow-y-auto">
              {allEmployes
                .filter(e => {
                  if (!empSearch.trim()) return true
                  const q = empSearch.toLowerCase()
                  return `${e.nom} ${e.prenom}`.toLowerCase().includes(q) || (e.poste || "").toLowerCase().includes(q)
                })
                .map(emp => (
                  <label key={emp.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includedEmpIds.has(emp.id)}
                      onChange={() => {
                        setIncludedEmpIds(prev => {
                          const next = new Set(prev)
                          if (next.has(emp.id)) next.delete(emp.id)
                          else next.add(emp.id)
                          return next
                        })
                      }}
                      className="rounded border-gray-300"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{emp.prenom} {emp.nom}</p>
                      {emp.poste && <p className="text-xs text-gray-400">{emp.poste}</p>}
                    </div>
                    {includedEmpIds.has(emp.id) && (
                      <Badge className="bg-green-100 text-green-700 text-[10px]">Inclus</Badge>
                    )}
                  </label>
                ))}
            </div>
            <p className="text-xs text-gray-500">{includedEmpIds.size} collaborateur(s) sélectionné(s) sur {allEmployes.length}</p>
            <Button className="w-full text-white" style={{ backgroundColor: "#1E2A4A" }} onClick={() => {
              setEmployes(allEmployes.filter(e => includedEmpIds.has(e.id)))
              // Rebuild planning grid for newly included employees
              setPlanning(prev => {
                const next = { ...prev }
                for (const emp of allEmployes) {
                  if (includedEmpIds.has(emp.id) && !next[emp.id]) {
                    next[emp.id] = {}
                    for (let d = 1; d <= daysInMonth; d++) next[emp.id][d] = null
                  }
                }
                // Remove excluded
                for (const empId of Object.keys(next)) {
                  if (!includedEmpIds.has(empId)) delete next[empId]
                }
                return next
              })
              setEmpFilterOpen(false)
            }}>
              Appliquer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Créneau config dialog ── */}
      <Dialog open={creneauConfigOpen} onOpenChange={setCreneauConfigOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: "#1E2A4A" }}>Créneaux horaires</DialogTitle>
          </DialogHeader>
          {!editingCreneau ? (
            <div className="space-y-3">
              {creneaux.map(c => (
                <div key={c.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50">
                  <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-sm font-bold ${c.couleur}`}>{c.code}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{c.nom}</p>
                    <p className="text-xs text-gray-500">{c.heure_debut} — {c.heure_fin} | Pause: {c.pause_debut || "—"} — {c.pause_fin || "—"} ({c.pause_minutes}min) | {c.heures_effectives}h eff.</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setEditingCreneau(c)}>Modifier</Button>
                </div>
              ))}
              <Button variant="outline" className="w-full" onClick={addCreneau}><Plus className="h-4 w-4 mr-1" /> Ajouter un créneau</Button>
            </div>
          ) : (
            <CreneauEditor creneau={editingCreneau} onSave={updateCreneau} onDelete={deleteCreneau} onCancel={() => setEditingCreneau(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Bulk dialog ── */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle style={{ color: "#1E2A4A" }}>Affectation en masse</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employés</Label>
              <div className="border rounded p-2 max-h-40 overflow-y-auto space-y-1 mt-1">
                {employes.map(emp => (
                  <label key={emp.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={bulkEmployees.includes(emp.id)}
                      onChange={e => setBulkEmployees(prev => e.target.checked ? [...prev, emp.id] : prev.filter(id => id !== emp.id))} />
                    {emp.prenom} {emp.nom}
                  </label>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => setBulkEmployees(employes.map(e => e.id))}>Tout sélectionner</Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Du jour</Label><Input type="number" min={1} max={daysInMonth} value={bulkDateFrom} onChange={e => setBulkDateFrom(+e.target.value)} /></div>
              <div><Label>Au jour</Label><Input type="number" min={1} max={daysInMonth} value={bulkDateTo} onChange={e => setBulkDateTo(+e.target.value)} /></div>
            </div>
            <div>
              <Label>Créneau</Label>
              <Select value={bulkCreneauId} onValueChange={setBulkCreneauId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allCreneaux.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.code} — {c.nom} {c.heure_debut ? `(${c.heure_debut}-${c.heure_fin})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={bulkWeekendOff} onCheckedChange={setBulkWeekendOff} />
              <Label className="text-sm">Week-end = Repos automatique</Label>
            </div>
            <Button className="w-full text-white" style={{ backgroundColor: "#1E2A4A" }} onClick={applyBulk}>Appliquer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Créneau Editor sub-component ─────────────────────────────────

function CreneauEditor({ creneau, onSave, onDelete, onCancel }: {
  creneau: Creneau
  onSave: (c: Creneau) => void
  onDelete: (id: string) => void
  onCancel: () => void
}) {
  const [c, setC] = useState<Creneau>({ ...creneau })

  const eff = computeEffective(c.heure_debut, c.heure_fin, c.pause_debut, c.pause_fin)
  const pauseMin = computeMinutes(c.pause_debut, c.pause_fin)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Nom</Label><Input value={c.nom} onChange={e => setC(p => ({ ...p, nom: e.target.value }))} /></div>
        <div><Label>Code (1-3 car.)</Label><Input value={c.code} maxLength={3} onChange={e => setC(p => ({ ...p, code: e.target.value.toUpperCase() }))} /></div>
      </div>

      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-1"><Clock className="w-4 h-4" /> Horaires de travail</p>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Début</Label><Input type="time" value={c.heure_debut} onChange={e => setC(p => ({ ...p, heure_debut: e.target.value }))} /></div>
          <div><Label className="text-xs">Fin</Label><Input type="time" value={c.heure_fin} onChange={e => setC(p => ({ ...p, heure_fin: e.target.value }))} /></div>
        </div>
      </div>

      <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
        <p className="text-sm font-medium text-orange-800 mb-2 flex items-center gap-1"><Coffee className="w-4 h-4" /> Pause</p>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Début pause</Label><Input type="time" value={c.pause_debut} onChange={e => setC(p => ({ ...p, pause_debut: e.target.value }))} /></div>
          <div><Label className="text-xs">Fin pause</Label><Input type="time" value={c.pause_fin} onChange={e => setC(p => ({ ...p, pause_fin: e.target.value }))} /></div>
        </div>
        <p className="text-xs text-orange-600 mt-2">Durée pause : {pauseMin} minutes</p>
      </div>

      <div className="p-3 bg-green-50 rounded-lg border border-green-200">
        <p className="text-sm font-medium text-green-800">Heures effectives : <span className="text-lg">{eff}h</span></p>
        <p className="text-xs text-green-600">= Horaires travail ({computeMinutes(c.heure_debut, c.heure_fin)} min) - Pause ({pauseMin} min)</p>
      </div>

      <div>
        <Label>Couleur</Label>
        <div className="flex gap-2 mt-1 flex-wrap">
          {COLORS.map(color => (
            <button key={color}
              className={`w-8 h-8 rounded-lg ${color} ${c.couleur === color ? "ring-2 ring-offset-2 ring-[#1E2A4A]" : ""}`}
              onClick={() => setC(p => ({ ...p, couleur: color }))} />
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button className="flex-1 text-white" style={{ backgroundColor: "#1E2A4A" }} onClick={() => onSave({ ...c, pause_minutes: pauseMin, heures_effectives: eff })}>
          Enregistrer
        </Button>
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => onDelete(c.id)}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
