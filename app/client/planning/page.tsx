"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  Loader2, Building2, ChevronLeft, ChevronRight, CalendarDays,
  Save, Upload, Wand2, Users, Search, Clock
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

interface Societe { id: string; nom: string }
interface Employe { id: string; nom: string; prenom: string }
type Shift = "9h-17h" | "14h-22h" | "Repos" | "Conge" | string
interface PlanningRow { employe: Employe; shifts: Shift[] }
interface Template { id: string; nom: string; shifts: Shift[] }

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
const SHIFT_OPTIONS: Shift[] = ["9h-17h", "14h-22h", "Repos", "Conge"]

function getShiftColor(shift: Shift): string {
  if (shift === "9h-17h") return "bg-blue-100 text-blue-800 border-blue-200"
  if (shift === "14h-22h") return "bg-amber-50 text-amber-800 border-amber-200"
  if (shift === "Repos") return "bg-gray-100 text-gray-500 border-gray-200"
  if (shift === "Conge") return "bg-purple-50 text-purple-700 border-purple-200"
  return "bg-white text-gray-700 border-gray-200"
}

function getWeekDates(offset: number): { start: Date; end: Date; label: string } {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay() + 1 + offset * 7)
  const start = new Date(d)
  const end = new Date(d)
  end.setDate(end.getDate() + 6)
  const fmt = (dt: Date) => dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })
  return { start, end, label: `${fmt(start)} - ${fmt(end)} ${end.getFullYear()}` }
}

const DEFAULT_TEMPLATES: Template[] = [
  { id: "t1", nom: "Standard 9-17", shifts: ["9h-17h", "9h-17h", "9h-17h", "9h-17h", "9h-17h", "Repos", "Repos"] },
  { id: "t2", nom: "2x8", shifts: ["9h-17h", "14h-22h", "9h-17h", "14h-22h", "9h-17h", "Repos", "Repos"] },
]

export default function PlanningPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState("")
  const [employes, setEmployes] = useState<Employe[]>([])
  const [planning, setPlanning] = useState<PlanningRow[]>([])
  const [weekOffset, setWeekOffset] = useState(0)
  const [filter, setFilter] = useState("")
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TEMPLATES)
  const [saveTemplateName, setSaveTemplateName] = useState("")
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [editCell, setEditCell] = useState<{ row: number; col: number } | null>(null)
  const [fetching, setFetching] = useState(true)

  const week = getWeekDates(weekOffset)

  const fetchSocietes = useCallback(async () => {
    if (!profile?.id) return
    try {
      const r = await fetch(`/api/societes?user_id=${profile.id}`)
      if (r.ok) { const d = await r.json(); setSocietes(d.societes || []) }
    } catch { /* silent */ }
  }, [profile?.id])

  const fetchEmployes = useCallback(async () => {
    if (!selectedSociete) return
    setFetching(true)
    try {
      const r = await fetch(`/api/rh/employes?societe_id=${selectedSociete}`)
      if (r.ok) {
        const d = await r.json()
        const emps: Employe[] = d.employes || []
        setEmployes(emps)
        setPlanning(emps.map(e => ({
          employe: e,
          shifts: Array(7).fill("9h-17h") as Shift[],
        })))
      }
    } catch { /* silent */ }
    setFetching(false)
  }, [selectedSociete])

  useEffect(() => { fetchSocietes() }, [fetchSocietes])
  useEffect(() => {
    if (societes.length && !selectedSociete) setSelectedSociete(societes[0].id)
  }, [societes, selectedSociete])
  useEffect(() => { fetchEmployes() }, [fetchEmployes])

  const updateShift = (rowIdx: number, colIdx: number, value: Shift) => {
    setPlanning(prev => prev.map((row, i) =>
      i === rowIdx ? { ...row, shifts: row.shifts.map((s, j) => j === colIdx ? value : s) } : row
    ))
    setEditCell(null)
  }

  const applyTemplate = (template: Template, scope: "all" | "filtered") => {
    const filtered = filteredPlanning()
    setPlanning(prev => prev.map(row => {
      if (scope === "filtered" && !filtered.some(f => f.employe.id === row.employe.id)) return row
      return { ...row, shifts: [...template.shifts] }
    }))
  }

  const handleSaveTemplate = () => {
    if (!saveTemplateName || planning.length === 0) return
    const newT: Template = {
      id: `t_${Date.now()}`, nom: saveTemplateName,
      shifts: [...planning[0].shifts],
    }
    setTemplates(prev => [...prev, newT])
    setSaveTemplateName("")
    setSaveDialogOpen(false)
  }

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return
    setAiLoading(true)
    try {
      const r = await fetch("/api/rh/planning/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: selectedSociete, prompt: aiPrompt,
          employes: employes.map(e => ({ id: e.id, nom: `${e.prenom} ${e.nom}` })),
        }),
      })
      if (r.ok) {
        const d = await r.json()
        if (d.planning && Array.isArray(d.planning)) {
          setPlanning(prev => prev.map((row, i) => ({
            ...row,
            shifts: d.planning[i]?.shifts || row.shifts,
          })))
        }
      }
    } catch { /* silent */ }
    setAiLoading(false)
  }

  const filteredPlanning = useCallback(() => {
    if (!filter) return planning
    const q = filter.toLowerCase()
    return planning.filter(r =>
      `${r.employe.prenom} ${r.employe.nom}`.toLowerCase().includes(q)
    )
  }, [planning, filter])

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#C9A84C]" />
      </div>
    )
  }

  const rows = filteredPlanning()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Planning</h1>
          <p className="text-sm text-gray-500">Planification des horaires hebdomadaires</p>
        </div>
        <Select value={selectedSociete} onValueChange={setSelectedSociete}>
          <SelectTrigger className="w-64">
            <Building2 className="w-4 h-4 mr-2 text-[#1E2A4A]" />
            <SelectValue placeholder="Societe" />
          </SelectTrigger>
          <SelectContent>
            {societes.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Week navigator + filter */}
      <Card>
        <CardContent className="py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setWeekOffset(o => o - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[#1E2A4A]/5 min-w-[240px] justify-center">
              <CalendarDays className="w-4 h-4 text-[#1E2A4A]" />
              <span className="font-medium text-[#1E2A4A] text-sm">{week.label}</span>
            </div>
            <Button variant="outline" size="icon" onClick={() => setWeekOffset(o => o + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)} className="text-xs text-[#C9A84C]">
              Aujourd&apos;hui
            </Button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input placeholder="Filtrer employes..." value={filter} onChange={e => setFilter(e.target.value)} className="pl-9 w-56" />
          </div>
        </CardContent>
      </Card>

      {/* Planning grid */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {fetching ? (
            <div className="py-16 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#C9A84C]" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>Aucun employe trouve</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1E2A4A] text-white">
                  <th className="text-left px-4 py-3 font-medium w-48">Employe</th>
                  {JOURS.map((j, idx) => {
                    const d = new Date(week.start)
                    d.setDate(d.getDate() + idx)
                    return (
                      <th key={j} className="text-center px-2 py-3 font-medium">
                        <div>{j}</div>
                        <div className="text-xs font-normal opacity-70">{d.getDate()}/{d.getMonth() + 1}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => {
                  const realIdx = planning.findIndex(p => p.employe.id === row.employe.id)
                  return (
                    <tr key={row.employe.id} className="border-b hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-medium text-[#1E2A4A] whitespace-nowrap">
                        {row.employe.prenom} {row.employe.nom}
                      </td>
                      {row.shifts.map((shift, colIdx) => {
                        const isEditing = editCell?.row === realIdx && editCell?.col === colIdx
                        return (
                          <td key={colIdx} className="px-1 py-1.5 text-center">
                            {isEditing ? (
                              <select
                                autoFocus
                                className="w-full text-xs px-1 py-1 border rounded bg-white"
                                value={shift}
                                onChange={e => updateShift(realIdx, colIdx, e.target.value as Shift)}
                                onBlur={() => setEditCell(null)}
                              >
                                {SHIFT_OPTIONS.map(o => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                            ) : (
                              <button
                                onClick={() => setEditCell({ row: realIdx, col: colIdx })}
                                className={`w-full text-xs px-2 py-1.5 rounded border cursor-pointer transition-colors ${getShiftColor(shift)}`}
                              >
                                {shift}
                              </button>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Templates + AI */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Templates */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-[#1E2A4A] text-base flex items-center gap-2">
              <Clock className="w-4 h-4" /> Modeles de planning
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {templates.map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border bg-gray-50/50">
                <div>
                  <p className="font-medium text-sm text-[#1E2A4A]">{t.nom}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t.shifts.join(" / ")}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => applyTemplate(t, "all")} className="text-xs h-7">
                    Appliquer a tous
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => applyTemplate(t, "filtered")} className="text-xs h-7">
                    Au filtre
                  </Button>
                </div>
              </div>
            ))}

            <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full border-dashed border-[#C9A84C] text-[#C9A84C]">
                  <Save className="w-3.5 h-3.5 mr-1.5" /> Sauvegarder le planning actuel comme modele
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-[#1E2A4A]">Sauvegarder comme modele</DialogTitle>
                </DialogHeader>
                <div className="grid gap-2 py-2">
                  <Label>Nom du modele</Label>
                  <Input value={saveTemplateName} onChange={e => setSaveTemplateName(e.target.value)} placeholder="Mon modele personnalise" />
                  <p className="text-xs text-gray-500">Le planning du premier employe sera utilise comme modele de reference.</p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Annuler</Button>
                  <Button className="bg-[#1E2A4A] hover:bg-[#16203a] text-white" onClick={handleSaveTemplate}>Sauvegarder</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* AI generation */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-[#1E2A4A] text-base flex items-center gap-2">
              <Wand2 className="w-4 h-4" /> Generation IA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-gray-500">
              Decrivez le planning souhaite en langage naturel et laissez l&apos;IA remplir la grille.
            </p>
            <textarea
              className="w-full border rounded-lg p-3 text-sm min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/50"
              placeholder="Ex: Equipe A en matin du lundi au vendredi, equipe B en apres-midi. Week-end repos pour tous sauf Jean qui travaille le samedi matin."
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
            />
            <Button
              onClick={handleAiGenerate}
              disabled={aiLoading || !aiPrompt.trim()}
              className="w-full bg-[#C9A84C] hover:bg-[#b8963f] text-[#1E2A4A]"
            >
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Wand2 className="w-4 h-4 mr-1.5" />}
              Generer
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
