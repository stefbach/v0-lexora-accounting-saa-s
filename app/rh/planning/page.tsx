"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Loader2, Calendar, ChevronLeft, ChevronRight, Send, Wand2, RotateCcw, Users, Check } from "lucide-react"

const SHIFTS = ["Jour", "Matin", "Après-midi", "Nuit", "Repos"] as const
type Shift = typeof SHIFTS[number]

const SHIFT_COLORS: Record<Shift, string> = {
  Jour: "bg-blue-500 text-white",
  Matin: "bg-orange-500 text-white",
  "Après-midi": "bg-purple-500 text-white",
  Nuit: "bg-indigo-700 text-white",
  Repos: "bg-gray-300 text-gray-700",
}

const SHIFT_SHORT: Record<Shift, string> = {
  Jour: "J",
  Matin: "M",
  "Après-midi": "AM",
  Nuit: "N",
  Repos: "R",
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function isWeekend(year: number, month: number, day: number) {
  const d = new Date(year, month, day)
  return d.getDay() === 0 || d.getDay() === 6
}

const MONTH_NAMES = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
const DAY_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]

export default function PlanningPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [employes, setEmployes] = useState<any[]>([])
  const [planning, setPlanning] = useState<Record<string, Record<number, Shift>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [published, setPublished] = useState(false)

  // Cell edit
  const [editCell, setEditCell] = useState<{ empId: string; day: number } | null>(null)

  // Bulk assign
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkEmployees, setBulkEmployees] = useState<string[]>([])
  const [bulkDateFrom, setBulkDateFrom] = useState(1)
  const [bulkDateTo, setBulkDateTo] = useState(1)
  const [bulkShift, setBulkShift] = useState<Shift>("Jour")

  const daysInMonth = getDaysInMonth(year, month)
  const periode = `${year}-${String(month + 1).padStart(2, "0")}`

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ periode })
      if (societe !== "all") params.set("societe_id", societe)
      const [planRes, empRes] = await Promise.all([
        fetch(`/api/rh/planning?${params}`).then(r => r.json()).catch(() => ({ planning: [] })),
        fetch(`/api/rh/employes?${societe !== "all" ? `societe_id=${societe}` : ""}`).then(r => r.json()).catch(() => ({ employes: [] })),
      ])
      const emps = empRes.employes || []
      setEmployes(emps)
      setPublished(planRes.published || false)

      const grid: Record<string, Record<number, Shift>> = {}
      for (const emp of emps) {
        grid[emp.id] = {}
        for (let d = 1; d <= daysInMonth; d++) {
          grid[emp.id][d] = "Repos"
        }
      }
      for (const entry of planRes.planning || []) {
        if (grid[entry.employe_id]) {
          const day = parseInt(entry.jour || entry.day, 10)
          if (day >= 1 && day <= daysInMonth) {
            grid[entry.employe_id][day] = entry.shift || entry.type_shift || "Repos"
          }
        }
      }
      setPlanning(grid)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [societe, periode, daysInMonth])

  useEffect(() => { load() }, [load])

  const setShift = (empId: string, day: number, shift: Shift) => {
    setPlanning(prev => ({
      ...prev,
      [empId]: { ...prev[empId], [day]: shift },
    }))
    setEditCell(null)
  }

  const generateStandard = () => {
    setPlanning(prev => {
      const next = { ...prev }
      for (const empId of Object.keys(next)) {
        const row = { ...next[empId] }
        for (let d = 1; d <= daysInMonth; d++) {
          row[d] = isWeekend(year, month, d) ? "Repos" : "Jour"
        }
        next[empId] = row
      }
      return next
    })
  }

  const generate3x8 = () => {
    const shifts: Shift[] = ["Matin", "Après-midi", "Nuit"]
    setPlanning(prev => {
      const next = { ...prev }
      const empIds = Object.keys(next)
      empIds.forEach((empId, idx) => {
        const row = { ...next[empId] }
        for (let d = 1; d <= daysInMonth; d++) {
          if (isWeekend(year, month, d)) {
            row[d] = "Repos"
          } else {
            const weekNum = Math.floor((d - 1) / 7)
            row[d] = shifts[(idx + weekNum) % 3]
          }
        }
        next[empId] = row
      })
      return next
    })
  }

  const applyBulk = () => {
    setPlanning(prev => {
      const next = { ...prev }
      for (const empId of bulkEmployees) {
        if (next[empId]) {
          const row = { ...next[empId] }
          for (let d = bulkDateFrom; d <= Math.min(bulkDateTo, daysInMonth); d++) {
            row[d] = bulkShift
          }
          next[empId] = row
        }
      }
      return next
    })
    setBulkOpen(false)
  }

  const savePlanning = async (publish: boolean = false) => {
    setSaving(true)
    try {
      const entries: any[] = []
      for (const empId of Object.keys(planning)) {
        for (let d = 1; d <= daysInMonth; d++) {
          entries.push({ employe_id: empId, jour: d, shift: planning[empId][d] })
        }
      }
      await fetch("/api/rh/planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periode, societe_id: societe, planning: entries, publish }),
      })
      if (publish) setPublished(true)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Planning</h1>
          <p className="text-gray-500 text-sm">Gestion des plannings de travail</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Toutes les sociétés" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les sociétés</SelectItem>
              {societes.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Month navigation */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-lg" style={{ color: "#1E2A4A" }}>
                <Calendar className="inline h-5 w-5 mr-2" />
                {MONTH_NAMES[month]} {year}
              </CardTitle>
              <Button variant="outline" size="icon" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {published && (
                <Badge className="bg-green-100 text-green-700">Publié</Badge>
              )}
              <Button variant="outline" size="sm" onClick={generateStandard}>
                <Wand2 className="h-4 w-4 mr-1" /> Standard
              </Button>
              <Button variant="outline" size="sm" onClick={generate3x8}>
                <RotateCcw className="h-4 w-4 mr-1" /> 3×8
              </Button>
              <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
                <Users className="h-4 w-4 mr-1" /> Bulk
              </Button>
              <Button variant="outline" size="sm" onClick={() => savePlanning(false)} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                Enregistrer
              </Button>
              <Button size="sm" onClick={() => savePlanning(true)} disabled={saving} style={{ backgroundColor: "#C9A84C" }} className="text-white hover:opacity-90">
                <Send className="h-4 w-4 mr-1" /> Publier
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Legend */}
          <div className="flex gap-3 mb-4 flex-wrap">
            {SHIFTS.map(s => (
              <div key={s} className="flex items-center gap-1">
                <span className={`inline-block w-6 h-6 rounded text-xs flex items-center justify-center font-bold ${SHIFT_COLORS[s]}`}>
                  {SHIFT_SHORT[s]}
                </span>
                <span className="text-xs text-gray-600">{s}</span>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : employes.length === 0 ? (
            <p className="text-center text-gray-400 py-12">Aucun employé trouvé. Sélectionnez une société.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white z-10 border px-2 py-1 text-left min-w-[140px]" style={{ color: "#1E2A4A" }}>
                      Employé
                    </th>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                      const dow = new Date(year, month, d).getDay()
                      const we = dow === 0 || dow === 6
                      return (
                        <th
                          key={d}
                          className={`border px-1 py-1 text-center min-w-[32px] ${we ? "bg-gray-100" : ""}`}
                        >
                          <div className="text-[10px] text-gray-400">{DAY_NAMES[dow]}</div>
                          <div>{d}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {employes.map(emp => (
                    <tr key={emp.id}>
                      <td className="sticky left-0 bg-white z-10 border px-2 py-1 font-medium truncate max-w-[140px]">
                        {emp.prenom} {emp.nom}
                      </td>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                        const shift = planning[emp.id]?.[d] || "Repos"
                        const isEditing = editCell?.empId === emp.id && editCell?.day === d
                        return (
                          <td
                            key={d}
                            className="border p-0 text-center cursor-pointer relative"
                            onClick={() => setEditCell({ empId: emp.id, day: d })}
                          >
                            <div className={`w-full h-full py-1 px-0.5 text-[10px] font-bold ${SHIFT_COLORS[shift as Shift] || "bg-gray-100"}`}>
                              {SHIFT_SHORT[shift as Shift] || "?"}
                            </div>
                            {isEditing && (
                              <div className="absolute top-full left-0 z-20 bg-white border rounded shadow-lg p-1 flex flex-col gap-0.5 min-w-[90px]">
                                {SHIFTS.map(s => (
                                  <button
                                    key={s}
                                    className={`text-left px-2 py-1 rounded text-xs hover:opacity-80 ${SHIFT_COLORS[s]}`}
                                    onClick={(e) => { e.stopPropagation(); setShift(emp.id, d, s) }}
                                  >
                                    {s}
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

      {/* Bulk assign dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ color: "#1E2A4A" }}>Affectation en masse</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employés</Label>
              <div className="border rounded p-2 max-h-40 overflow-y-auto space-y-1 mt-1">
                {employes.map(emp => (
                  <label key={emp.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkEmployees.includes(emp.id)}
                      onChange={e => {
                        if (e.target.checked) setBulkEmployees(prev => [...prev, emp.id])
                        else setBulkEmployees(prev => prev.filter(id => id !== emp.id))
                      }}
                    />
                    {emp.prenom} {emp.nom}
                  </label>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => setBulkEmployees(employes.map(e => e.id))}>
                Tout sélectionner
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Du jour</Label>
                <Input type="number" min={1} max={daysInMonth} value={bulkDateFrom} onChange={e => setBulkDateFrom(+e.target.value)} />
              </div>
              <div>
                <Label>Au jour</Label>
                <Input type="number" min={1} max={daysInMonth} value={bulkDateTo} onChange={e => setBulkDateTo(+e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Type de shift</Label>
              <Select value={bulkShift} onValueChange={v => setBulkShift(v as Shift)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIFTS.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full text-white" style={{ backgroundColor: "#1E2A4A" }} onClick={applyBulk}>
              Appliquer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
