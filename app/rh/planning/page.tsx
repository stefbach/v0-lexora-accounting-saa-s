"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Loader2, Calendar, ChevronLeft, ChevronRight, Send, Wand2, RotateCcw, Users, Check, Settings, Clock } from "lucide-react"

interface ShiftDef {
  code: string
  label: string
  short: string
  heure_debut: string
  heure_fin: string
  heures_prevues: number
  color: string
  isRepos: boolean
}

const DEFAULT_SHIFTS: ShiftDef[] = [
  { code: "Jour", label: "Jour (Standard)", short: "J", heure_debut: "08:00", heure_fin: "17:00", heures_prevues: 9, color: "bg-blue-500 text-white", isRepos: false },
  { code: "Matin", label: "Matin (3×8)", short: "M", heure_debut: "06:00", heure_fin: "14:00", heures_prevues: 8, color: "bg-orange-500 text-white", isRepos: false },
  { code: "Après-midi", label: "Après-midi (3×8)", short: "AM", heure_debut: "14:00", heure_fin: "22:00", heures_prevues: 8, color: "bg-purple-500 text-white", isRepos: false },
  { code: "Nuit", label: "Nuit (3×8)", short: "N", heure_debut: "22:00", heure_fin: "06:00", heures_prevues: 8, color: "bg-indigo-700 text-white", isRepos: false },
  { code: "Repos", label: "Repos", short: "R", heure_debut: "", heure_fin: "", heures_prevues: 0, color: "bg-gray-300 text-gray-700", isRepos: true },
]

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function isWeekend(year: number, month: number, day: number) {
  const d = new Date(year, month, day)
  return d.getDay() === 0 || d.getDay() === 6
}

const MONTH_NAMES = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
const DAY_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]

interface CellData {
  shift: string
  heure_debut?: string
  heure_fin?: string
  heures_prevues?: number
}

export default function PlanningPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [employes, setEmployes] = useState<any[]>([])
  const [planning, setPlanning] = useState<Record<string, Record<number, CellData>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [published, setPublished] = useState(false)

  // Shift configuration
  const [shifts, setShifts] = useState<ShiftDef[]>(DEFAULT_SHIFTS)
  const [shiftConfigOpen, setShiftConfigOpen] = useState(false)
  const [editingShift, setEditingShift] = useState<ShiftDef | null>(null)

  // Cell edit
  const [editCell, setEditCell] = useState<{ empId: string; day: number } | null>(null)
  const [customHoursOpen, setCustomHoursOpen] = useState(false)
  const [customHours, setCustomHours] = useState({ heure_debut: "08:00", heure_fin: "17:00" })

  // Bulk assign
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkEmployees, setBulkEmployees] = useState<string[]>([])
  const [bulkDateFrom, setBulkDateFrom] = useState(1)
  const [bulkDateTo, setBulkDateTo] = useState(1)
  const [bulkShift, setBulkShift] = useState("Jour")

  const daysInMonth = getDaysInMonth(year, month)
  const periode = `${year}-${String(month + 1).padStart(2, "0")}`

  const getShiftDef = (code: string): ShiftDef => shifts.find(s => s.code === code) || shifts[shifts.length - 1]

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
      const [planRes, empRes] = await Promise.all([
        fetch(`/api/rh/planning?${params}`).then(r => r.json()).catch(() => ({ planning: [] })),
        fetch(`/api/rh/employes?${societe !== "all" ? `societe_id=${societe}` : ""}`).then(r => r.json()).catch(() => ({ employes: [] })),
      ])
      const emps = empRes.employes || []
      setEmployes(emps)
      setPublished(planRes.published || false)

      const grid: Record<string, Record<number, CellData>> = {}
      for (const emp of emps) {
        grid[emp.id] = {}
        for (let d = 1; d <= daysInMonth; d++) {
          grid[emp.id][d] = { shift: "Repos" }
        }
      }
      for (const entry of planRes.planning || []) {
        if (grid[entry.employe_id]) {
          const day = parseInt(entry.jour || entry.day, 10)
          if (day >= 1 && day <= daysInMonth) {
            grid[entry.employe_id][day] = {
              shift: entry.shift || entry.type_shift || "Repos",
              heure_debut: entry.heure_debut || undefined,
              heure_fin: entry.heure_fin || undefined,
              heures_prevues: entry.heures_prevues || undefined,
            }
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

  const setShiftForCell = (empId: string, day: number, shiftCode: string) => {
    const def = getShiftDef(shiftCode)
    setPlanning(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        [day]: {
          shift: shiftCode,
          heure_debut: def.heure_debut || undefined,
          heure_fin: def.heure_fin || undefined,
          heures_prevues: def.heures_prevues || undefined,
        }
      },
    }))
    setEditCell(null)
  }

  const setCustomShiftForCell = (empId: string, day: number) => {
    setPlanning(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        [day]: {
          shift: "Jour",
          heure_debut: customHours.heure_debut,
          heure_fin: customHours.heure_fin,
          heures_prevues: computeHours(customHours.heure_debut, customHours.heure_fin),
        }
      },
    }))
    setCustomHoursOpen(false)
    setEditCell(null)
  }

  function computeHours(start: string, end: string): number {
    const [sh, sm] = start.split(":").map(Number)
    const [eh, em] = end.split(":").map(Number)
    let diff = (eh * 60 + em) - (sh * 60 + sm)
    if (diff < 0) diff += 24 * 60 // overnight
    return Math.round(diff / 60 * 10) / 10
  }

  const generateStandard = () => {
    const def = getShiftDef("Jour")
    setPlanning(prev => {
      const next = { ...prev }
      for (const empId of Object.keys(next)) {
        const row = { ...next[empId] }
        for (let d = 1; d <= daysInMonth; d++) {
          row[d] = isWeekend(year, month, d)
            ? { shift: "Repos" }
            : { shift: "Jour", heure_debut: def.heure_debut, heure_fin: def.heure_fin, heures_prevues: def.heures_prevues }
        }
        next[empId] = row
      }
      return next
    })
  }

  const generate3x8 = () => {
    const shiftCodes = ["Matin", "Après-midi", "Nuit"]
    setPlanning(prev => {
      const next = { ...prev }
      const empIds = Object.keys(next)
      empIds.forEach((empId, idx) => {
        const row = { ...next[empId] }
        for (let d = 1; d <= daysInMonth; d++) {
          const weekNum = Math.floor((d - 1) / 7)
          const code = shiftCodes[(idx + weekNum) % 3]
          const def = getShiftDef(code)
          row[d] = { shift: code, heure_debut: def.heure_debut, heure_fin: def.heure_fin, heures_prevues: def.heures_prevues }
        }
        next[empId] = row
      })
      return next
    })
  }

  const applyBulk = () => {
    const def = getShiftDef(bulkShift)
    setPlanning(prev => {
      const next = { ...prev }
      for (const empId of bulkEmployees) {
        if (next[empId]) {
          const row = { ...next[empId] }
          for (let d = bulkDateFrom; d <= Math.min(bulkDateTo, daysInMonth); d++) {
            row[d] = { shift: bulkShift, heure_debut: def.heure_debut, heure_fin: def.heure_fin, heures_prevues: def.heures_prevues }
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
          const cell = planning[empId][d]
          entries.push({
            employe_id: empId,
            jour: d,
            shift: cell.shift,
            heure_debut: cell.heure_debut || null,
            heure_fin: cell.heure_fin || null,
            heures_prevues: cell.heures_prevues || null,
          })
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
          <p className="text-gray-500 text-sm">Gestion des plannings — heures paramétrables par shift</p>
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
          <Button variant="outline" size="sm" onClick={() => setShiftConfigOpen(true)}>
            <Settings className="h-4 w-4 mr-1" /> Horaires
          </Button>
        </div>
      </div>

      {/* Shift hours configuration */}
      <Card className="border-dashed">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3">
            {shifts.filter(s => !s.isRepos).map(s => (
              <div key={s.code} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${s.color}`}>
                <Clock className="w-3 h-3" />
                <span>{s.label}</span>
                <span className="opacity-75">{s.heure_debut}—{s.heure_fin}</span>
                <span className="opacity-75">({s.heures_prevues}h)</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Month navigation + actions */}
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
              {published && <Badge className="bg-green-100 text-green-700">Publié</Badge>}
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
            {shifts.map(s => (
              <div key={s.code} className="flex items-center gap-1">
                <span className={`inline-block w-6 h-6 rounded text-xs flex items-center justify-center font-bold ${s.color}`}>
                  {s.short}
                </span>
                <span className="text-xs text-gray-600">{s.code}</span>
                {!s.isRepos && <span className="text-[10px] text-gray-400">{s.heure_debut}-{s.heure_fin}</span>}
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
                        <th key={d} className={`border px-1 py-1 text-center min-w-[36px] ${we ? "bg-gray-100" : ""}`}>
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
                        const cell = planning[emp.id]?.[d] || { shift: "Repos" }
                        const def = getShiftDef(cell.shift)
                        const isEditing = editCell?.empId === emp.id && editCell?.day === d
                        const displayHeure = cell.heure_debut && cell.heure_fin && !def.isRepos
                          ? `${cell.heure_debut.slice(0,5)}`
                          : ""
                        return (
                          <td
                            key={d}
                            className="border p-0 text-center cursor-pointer relative group"
                            onClick={() => setEditCell(isEditing ? null : { empId: emp.id, day: d })}
                            title={cell.heure_debut && cell.heure_fin ? `${cell.heure_debut} - ${cell.heure_fin} (${cell.heures_prevues || def.heures_prevues}h)` : def.label}
                          >
                            <div className={`w-full h-full py-0.5 px-0 text-[10px] font-bold leading-tight ${def.color}`}>
                              <div>{def.short}</div>
                              {displayHeure && <div className="text-[8px] opacity-75 font-normal">{displayHeure}</div>}
                            </div>
                            {isEditing && (
                              <div className="absolute top-full left-0 z-20 bg-white border rounded shadow-lg p-1 flex flex-col gap-0.5 min-w-[130px]" onClick={e => e.stopPropagation()}>
                                {shifts.map(s => (
                                  <button
                                    key={s.code}
                                    className={`text-left px-2 py-1.5 rounded text-xs hover:opacity-80 flex items-center justify-between ${s.color}`}
                                    onClick={() => setShiftForCell(emp.id, d, s.code)}
                                  >
                                    <span>{s.code}</span>
                                    {!s.isRepos && <span className="text-[10px] opacity-75">{s.heure_debut}-{s.heure_fin}</span>}
                                  </button>
                                ))}
                                <button
                                  className="text-left px-2 py-1.5 rounded text-xs bg-yellow-100 text-yellow-800 hover:bg-yellow-200 flex items-center gap-1"
                                  onClick={() => {
                                    setCustomHours({ heure_debut: cell.heure_debut || "08:00", heure_fin: cell.heure_fin || "17:00" })
                                    setCustomHoursOpen(true)
                                  }}
                                >
                                  <Clock className="w-3 h-3" /> Horaires personnalisés
                                </button>
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

      {/* Custom hours dialog */}
      <Dialog open={customHoursOpen} onOpenChange={setCustomHoursOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ color: "#1E2A4A" }}>Horaires personnalisés</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Heure début</Label>
                <Input type="time" value={customHours.heure_debut} onChange={e => setCustomHours(h => ({ ...h, heure_debut: e.target.value }))} />
              </div>
              <div>
                <Label>Heure fin</Label>
                <Input type="time" value={customHours.heure_fin} onChange={e => setCustomHours(h => ({ ...h, heure_fin: e.target.value }))} />
              </div>
            </div>
            <p className="text-sm text-gray-500">
              Durée : {computeHours(customHours.heure_debut, customHours.heure_fin)}h
            </p>
            <Button className="w-full text-white" style={{ backgroundColor: "#1E2A4A" }}
              onClick={() => editCell && setCustomShiftForCell(editCell.empId, editCell.day)}>
              Appliquer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shift configuration dialog */}
      <Dialog open={shiftConfigOpen} onOpenChange={setShiftConfigOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ color: "#1E2A4A" }}>Configuration des horaires</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {shifts.filter(s => !s.isRepos).map((s, idx) => (
              <div key={s.code} className="flex items-center gap-3 p-3 border rounded-lg">
                <span className={`inline-block w-8 h-8 rounded text-sm flex items-center justify-center font-bold ${s.color}`}>
                  {s.short}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-sm">{s.label}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input type="time" value={s.heure_debut} className="w-28 text-sm"
                    onChange={e => {
                      const updated = [...shifts]
                      updated[idx] = { ...s, heure_debut: e.target.value, heures_prevues: computeHours(e.target.value, s.heure_fin) }
                      setShifts(updated)
                    }} />
                  <span className="text-gray-400">—</span>
                  <Input type="time" value={s.heure_fin} className="w-28 text-sm"
                    onChange={e => {
                      const updated = [...shifts]
                      updated[idx] = { ...s, heure_fin: e.target.value, heures_prevues: computeHours(s.heure_debut, e.target.value) }
                      setShifts(updated)
                    }} />
                  <Badge variant="outline" className="text-xs min-w-[40px] justify-center">
                    {s.heures_prevues}h
                  </Badge>
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-400">Les modifications s'appliquent aux nouvelles affectations. Les cellules déjà remplies gardent leurs horaires.</p>
          </div>
        </DialogContent>
      </Dialog>

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
                    <input type="checkbox" checked={bulkEmployees.includes(emp.id)}
                      onChange={e => {
                        if (e.target.checked) setBulkEmployees(prev => [...prev, emp.id])
                        else setBulkEmployees(prev => prev.filter(id => id !== emp.id))
                      }} />
                    {emp.prenom} {emp.nom}
                  </label>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => setBulkEmployees(employes.map(e => e.id))}>
                Tout sélectionner
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Du jour</Label><Input type="number" min={1} max={daysInMonth} value={bulkDateFrom} onChange={e => setBulkDateFrom(+e.target.value)} /></div>
              <div><Label>Au jour</Label><Input type="number" min={1} max={daysInMonth} value={bulkDateTo} onChange={e => setBulkDateTo(+e.target.value)} /></div>
            </div>
            <div>
              <Label>Type de shift</Label>
              <Select value={bulkShift} onValueChange={setBulkShift}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {shifts.map(s => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.code} {!s.isRepos ? `(${s.heure_debut}-${s.heure_fin})` : ""}
                    </SelectItem>
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
