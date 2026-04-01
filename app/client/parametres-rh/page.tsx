"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import {
  Plus, Trash2, Pencil, Save, X, Building2, MapPin, Calendar,
  Users, Clock, ChevronLeft, ChevronRight
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Department {
  id: string; code: string; name: string; manager: string
}
interface Office {
  id: string; code: string; name: string; address: string
}
interface LeaveType {
  id: string; code: string; name: string; daysPerYear: number
  requiresCertificate: boolean; paid: boolean
}
interface PublicHoliday {
  id: string; date: string; label: string
}
interface PayGroup {
  id: string; code: string; name: string; employees: string[]
}
interface WorkCalendar {
  id: string; name: string; days: string[]; hoursPerDay: number
}

// ---------------------------------------------------------------------------
// Default data
// ---------------------------------------------------------------------------
const uid = () => Math.random().toString(36).slice(2, 10)

const DEFAULT_DEPARTMENTS: Department[] = [
  { id: uid(), code: "DIR", name: "Direction", manager: "" },
  { id: uid(), code: "FIN", name: "Finance", manager: "" },
  { id: uid(), code: "IT", name: "Informatique", manager: "" },
  { id: uid(), code: "RH", name: "Ressources Humaines", manager: "" },
  { id: uid(), code: "COM", name: "Commercial", manager: "" },
]

const DEFAULT_OFFICES: Office[] = [
  { id: uid(), code: "HQ", name: "Siege Social", address: "Port Louis, Maurice" },
  { id: uid(), code: "EB", name: "Ebene Office", address: "Ebene, Maurice" },
]

const DEFAULT_LEAVE_TYPES: LeaveType[] = [
  { id: uid(), code: "AL", name: "Annual Leave", daysPerYear: 14, requiresCertificate: false, paid: true },
  { id: uid(), code: "SL", name: "Sick Leave", daysPerYear: 15, requiresCertificate: true, paid: true },
  { id: uid(), code: "MAT", name: "Maternity Leave", daysPerYear: 98, requiresCertificate: true, paid: true },
  { id: uid(), code: "PAT", name: "Paternity Leave", daysPerYear: 5, requiresCertificate: false, paid: true },
  { id: uid(), code: "UL", name: "Unpaid Leave", daysPerYear: 0, requiresCertificate: false, paid: false },
  { id: uid(), code: "WI", name: "Work Injury Leave", daysPerYear: 0, requiresCertificate: true, paid: true },
  { id: uid(), code: "COM", name: "Compassionate Leave", daysPerYear: 3, requiresCertificate: false, paid: true },
]

const HOLIDAYS_2025: PublicHoliday[] = [
  { id: uid(), date: "2025-01-01", label: "Jour de l'An" },
  { id: uid(), date: "2025-01-02", label: "Jour de l'An (suite)" },
  { id: uid(), date: "2025-02-01", label: "Abolition de l'Esclavage" },
  { id: uid(), date: "2025-02-26", label: "Maha Shivaratree" },
  { id: uid(), date: "2025-03-12", label: "Fete Nationale" },
  { id: uid(), date: "2025-03-30", label: "Ugadi" },
  { id: uid(), date: "2025-05-01", label: "Fete du Travail" },
  { id: uid(), date: "2025-06-07", label: "Eid ul Fitr" },
  { id: uid(), date: "2025-08-15", label: "Assomption" },
  { id: uid(), date: "2025-09-05", label: "Ganesh Chaturthi" },
  { id: uid(), date: "2025-10-20", label: "Divali" },
  { id: uid(), date: "2025-11-01", label: "Toussaint" },
  { id: uid(), date: "2025-11-02", label: "Arrivee des Travailleurs Engages" },
  { id: uid(), date: "2025-12-25", label: "Noel" },
]

const HOLIDAYS_2026: PublicHoliday[] = [
  { id: uid(), date: "2026-01-01", label: "Jour de l'An" },
  { id: uid(), date: "2026-01-02", label: "Jour de l'An (suite)" },
  { id: uid(), date: "2026-02-01", label: "Abolition de l'Esclavage" },
  { id: uid(), date: "2026-02-15", label: "Maha Shivaratree" },
  { id: uid(), date: "2026-03-12", label: "Fete Nationale" },
  { id: uid(), date: "2026-03-18", label: "Ugadi" },
  { id: uid(), date: "2026-05-01", label: "Fete du Travail" },
  { id: uid(), date: "2026-05-27", label: "Eid ul Fitr" },
  { id: uid(), date: "2026-08-15", label: "Assomption" },
  { id: uid(), date: "2026-08-26", label: "Ganesh Chaturthi" },
  { id: uid(), date: "2026-11-01", label: "Toussaint" },
  { id: uid(), date: "2026-11-02", label: "Arrivee des Travailleurs Engages" },
  { id: uid(), date: "2026-11-08", label: "Divali" },
  { id: uid(), date: "2026-12-25", label: "Noel" },
]

const DEFAULT_PAY_GROUPS: PayGroup[] = [
  { id: uid(), code: "MUT", name: "Mutualise", employees: [] },
  { id: uid(), code: "AE", name: "Agence Externe", employees: [] },
  { id: uid(), code: "TL", name: "Team Lead", employees: [] },
  { id: uid(), code: "AST", name: "Astreinte", employees: [] },
]

const DEFAULT_CALENDARS: WorkCalendar[] = [
  { id: uid(), name: "Standard Lun-Ven", days: ["Lun", "Mar", "Mer", "Jeu", "Ven"], hoursPerDay: 9 },
  { id: uid(), name: "Shift 3x8", days: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"], hoursPerDay: 8 },
]

const ALL_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------
function loadLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}
function saveLS<T>(key: string, value: T) {
  if (typeof window === "undefined") return
  localStorage.setItem(key, JSON.stringify(value))
}

// ---------------------------------------------------------------------------
// Inline edit row helper
// ---------------------------------------------------------------------------
function InlineActions({ editing, onEdit, onSave, onCancel, onDelete }: {
  editing: boolean; onEdit: () => void; onSave: () => void; onCancel: () => void; onDelete: () => void
}) {
  if (editing) {
    return (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={onSave} className="text-green-600 hover:text-green-700 h-8 w-8 p-0">
          <Save className="w-4 h-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="text-gray-400 hover:text-gray-600 h-8 w-8 p-0">
          <X className="w-4 h-4" />
        </Button>
      </div>
    )
  }
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" onClick={onEdit} className="text-[#1E2A4A] hover:text-[#C9A84C] h-8 w-8 p-0">
        <Pencil className="w-4 h-4" />
      </Button>
      <Button size="sm" variant="ghost" onClick={onDelete} className="text-red-400 hover:text-red-600 h-8 w-8 p-0">
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function ParametresRHPage() {
  // Departments
  const [departments, setDepartments] = useState<Department[]>([])
  const [editDeptId, setEditDeptId] = useState<string | null>(null)
  const [draftDept, setDraftDept] = useState<Partial<Department>>({})

  // Offices
  const [offices, setOffices] = useState<Office[]>([])
  const [editOffId, setEditOffId] = useState<string | null>(null)
  const [draftOff, setDraftOff] = useState<Partial<Office>>({})

  // Leave Types
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [editLtId, setEditLtId] = useState<string | null>(null)
  const [draftLt, setDraftLt] = useState<Partial<LeaveType>>({})

  // Holidays
  const [holidayYear, setHolidayYear] = useState(2025)
  const [holidays, setHolidays] = useState<Record<number, PublicHoliday[]>>({})
  const [newHoliday, setNewHoliday] = useState({ date: "", label: "" })

  // Pay Groups
  const [payGroups, setPayGroups] = useState<PayGroup[]>([])
  const [editPgId, setEditPgId] = useState<string | null>(null)
  const [draftPg, setDraftPg] = useState<Partial<PayGroup>>({})

  // Calendars
  const [calendars, setCalendars] = useState<WorkCalendar[]>([])
  const [editCalId, setEditCalId] = useState<string | null>(null)
  const [draftCal, setDraftCal] = useState<Partial<WorkCalendar>>({})

  // Load from localStorage on mount
  useEffect(() => {
    setDepartments(loadLS("rh_departments", DEFAULT_DEPARTMENTS))
    setOffices(loadLS("rh_offices", DEFAULT_OFFICES))
    setLeaveTypes(loadLS("rh_leave_types", DEFAULT_LEAVE_TYPES))
    setHolidays(loadLS("rh_holidays", { 2025: HOLIDAYS_2025, 2026: HOLIDAYS_2026 }))
    setPayGroups(loadLS("rh_pay_groups", DEFAULT_PAY_GROUPS))
    setCalendars(loadLS("rh_calendars", DEFAULT_CALENDARS))
  }, [])

  // Save helpers
  const saveDepts = (d: Department[]) => { setDepartments(d); saveLS("rh_departments", d) }
  const saveOffs = (o: Office[]) => { setOffices(o); saveLS("rh_offices", o) }
  const saveLts = (l: LeaveType[]) => { setLeaveTypes(l); saveLS("rh_leave_types", l) }
  const saveHols = (h: Record<number, PublicHoliday[]>) => { setHolidays(h); saveLS("rh_holidays", h) }
  const savePgs = (p: PayGroup[]) => { setPayGroups(p); saveLS("rh_pay_groups", p) }
  const saveCals = (c: WorkCalendar[]) => { setCalendars(c); saveLS("rh_calendars", c) }

  // =========================================================================
  // DEPARTMENTS TAB
  // =========================================================================
  const DepartmentsTab = () => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-[#1E2A4A] text-base flex items-center gap-2">
          <Building2 className="w-5 h-5" /> Departements
        </CardTitle>
        <Button size="sm" className="bg-[#1E2A4A] text-white hover:bg-[#2a3d6b]"
          onClick={() => {
            const d: Department = { id: uid(), code: "", name: "", manager: "" }
            saveDepts([...departments, d])
            setEditDeptId(d.id)
            setDraftDept(d)
          }}>
          <Plus className="w-4 h-4 mr-1" /> Ajouter
        </Button>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#1E2A4A] text-white">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Code</th>
                <th className="px-4 py-2 text-left font-medium">Nom</th>
                <th className="px-4 py-2 text-left font-medium">Responsable</th>
                <th className="px-4 py-2 text-right font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d, i) => {
                const editing = editDeptId === d.id
                return (
                  <tr key={d.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2">
                      {editing ? <Input value={draftDept.code || ""} onChange={e => setDraftDept(p => ({ ...p, code: e.target.value }))} className="h-8 w-24" /> : d.code}
                    </td>
                    <td className="px-4 py-2">
                      {editing ? <Input value={draftDept.name || ""} onChange={e => setDraftDept(p => ({ ...p, name: e.target.value }))} className="h-8" /> : d.name}
                    </td>
                    <td className="px-4 py-2">
                      {editing ? <Input value={draftDept.manager || ""} onChange={e => setDraftDept(p => ({ ...p, manager: e.target.value }))} className="h-8" /> : (d.manager || <span className="text-gray-400">--</span>)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <InlineActions editing={editing}
                        onEdit={() => { setEditDeptId(d.id); setDraftDept({ ...d }) }}
                        onSave={() => { saveDepts(departments.map(x => x.id === d.id ? { ...d, ...draftDept } as Department : x)); setEditDeptId(null) }}
                        onCancel={() => setEditDeptId(null)}
                        onDelete={() => saveDepts(departments.filter(x => x.id !== d.id))}
                      />
                    </td>
                  </tr>
                )
              })}
              {departments.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Aucun departement</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )

  // =========================================================================
  // OFFICES TAB
  // =========================================================================
  const OfficesTab = () => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-[#1E2A4A] text-base flex items-center gap-2">
          <MapPin className="w-5 h-5" /> Bureaux / Sites
        </CardTitle>
        <Button size="sm" className="bg-[#1E2A4A] text-white hover:bg-[#2a3d6b]"
          onClick={() => {
            const o: Office = { id: uid(), code: "", name: "", address: "" }
            saveOffs([...offices, o])
            setEditOffId(o.id)
            setDraftOff(o)
          }}>
          <Plus className="w-4 h-4 mr-1" /> Ajouter
        </Button>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#1E2A4A] text-white">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Code</th>
                <th className="px-4 py-2 text-left font-medium">Nom</th>
                <th className="px-4 py-2 text-left font-medium">Adresse</th>
                <th className="px-4 py-2 text-right font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {offices.map((o, i) => {
                const editing = editOffId === o.id
                return (
                  <tr key={o.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2">
                      {editing ? <Input value={draftOff.code || ""} onChange={e => setDraftOff(p => ({ ...p, code: e.target.value }))} className="h-8 w-24" /> : o.code}
                    </td>
                    <td className="px-4 py-2">
                      {editing ? <Input value={draftOff.name || ""} onChange={e => setDraftOff(p => ({ ...p, name: e.target.value }))} className="h-8" /> : o.name}
                    </td>
                    <td className="px-4 py-2">
                      {editing ? <Input value={draftOff.address || ""} onChange={e => setDraftOff(p => ({ ...p, address: e.target.value }))} className="h-8" /> : o.address}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <InlineActions editing={editing}
                        onEdit={() => { setEditOffId(o.id); setDraftOff({ ...o }) }}
                        onSave={() => { saveOffs(offices.map(x => x.id === o.id ? { ...o, ...draftOff } as Office : x)); setEditOffId(null) }}
                        onCancel={() => setEditOffId(null)}
                        onDelete={() => saveOffs(offices.filter(x => x.id !== o.id))}
                      />
                    </td>
                  </tr>
                )
              })}
              {offices.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Aucun bureau</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )

  // =========================================================================
  // LEAVE TYPES TAB
  // =========================================================================
  const LeaveTypesTab = () => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-[#1E2A4A] text-base flex items-center gap-2">
          <Calendar className="w-5 h-5" /> Types de conges
        </CardTitle>
        <Button size="sm" className="bg-[#1E2A4A] text-white hover:bg-[#2a3d6b]"
          onClick={() => {
            const lt: LeaveType = { id: uid(), code: "", name: "", daysPerYear: 0, requiresCertificate: false, paid: true }
            saveLts([...leaveTypes, lt])
            setEditLtId(lt.id)
            setDraftLt(lt)
          }}>
          <Plus className="w-4 h-4 mr-1" /> Ajouter
        </Button>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#1E2A4A] text-white">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Code</th>
                <th className="px-4 py-2 text-left font-medium">Nom</th>
                <th className="px-4 py-2 text-center font-medium">Jours/an</th>
                <th className="px-4 py-2 text-center font-medium">Certificat</th>
                <th className="px-4 py-2 text-center font-medium">Paye</th>
                <th className="px-4 py-2 text-right font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leaveTypes.map((lt, i) => {
                const editing = editLtId === lt.id
                return (
                  <tr key={lt.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2">
                      {editing ? <Input value={draftLt.code || ""} onChange={e => setDraftLt(p => ({ ...p, code: e.target.value }))} className="h-8 w-20" /> : <span className="font-mono text-xs bg-[#1E2A4A]/10 px-2 py-0.5 rounded">{lt.code}</span>}
                    </td>
                    <td className="px-4 py-2">
                      {editing ? <Input value={draftLt.name || ""} onChange={e => setDraftLt(p => ({ ...p, name: e.target.value }))} className="h-8" /> : lt.name}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {editing ? <Input type="number" value={draftLt.daysPerYear ?? 0} onChange={e => setDraftLt(p => ({ ...p, daysPerYear: Number(e.target.value) }))} className="h-8 w-20 mx-auto" /> : (lt.daysPerYear > 0 ? lt.daysPerYear : <span className="text-gray-400">--</span>)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {editing ? (
                        <Switch checked={draftLt.requiresCertificate ?? false} onCheckedChange={v => setDraftLt(p => ({ ...p, requiresCertificate: v }))} />
                      ) : (
                        lt.requiresCertificate ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Oui</span> : <span className="text-xs text-gray-400">Non</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {editing ? (
                        <Switch checked={draftLt.paid ?? true} onCheckedChange={v => setDraftLt(p => ({ ...p, paid: v }))} />
                      ) : (
                        lt.paid ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Paye</span> : <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">Non paye</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <InlineActions editing={editing}
                        onEdit={() => { setEditLtId(lt.id); setDraftLt({ ...lt }) }}
                        onSave={() => { saveLts(leaveTypes.map(x => x.id === lt.id ? { ...lt, ...draftLt } as LeaveType : x)); setEditLtId(null) }}
                        onCancel={() => setEditLtId(null)}
                        onDelete={() => saveLts(leaveTypes.filter(x => x.id !== lt.id))}
                      />
                    </td>
                  </tr>
                )
              })}
              {leaveTypes.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Aucun type de conge</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">MAT = 14 semaines (98 jours). Les jours sont calcules selon le calendrier de travail de l'employe.</p>
      </CardContent>
    </Card>
  )

  // =========================================================================
  // HOLIDAYS TAB
  // =========================================================================
  const currentHolidays = holidays[holidayYear] || []

  const HolidaysTab = () => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-[#1E2A4A] text-base flex items-center gap-2">
          <Calendar className="w-5 h-5" /> Jours feries Maurice
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setHolidayYear(y => y - 1)} className="h-8 w-8 p-0">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="font-bold text-[#1E2A4A] text-lg min-w-[4ch] text-center">{holidayYear}</span>
          <Button size="sm" variant="outline" onClick={() => setHolidayYear(y => y + 1)} className="h-8 w-8 p-0">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {currentHolidays.sort((a, b) => a.date.localeCompare(b.date)).map(h => (
            <div key={h.id} className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-100">
              <div>
                <p className="text-sm font-medium text-[#1E2A4A]">{h.label}</p>
                <p className="text-xs text-gray-500">{new Date(h.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" })}</p>
              </div>
              <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600 h-8 w-8 p-0"
                onClick={() => {
                  const updated = { ...holidays, [holidayYear]: currentHolidays.filter(x => x.id !== h.id) }
                  saveHols(updated)
                }}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          {currentHolidays.length === 0 && (
            <p className="text-gray-400 text-sm col-span-3 text-center py-6">Aucun jour ferie pour {holidayYear}</p>
          )}
        </div>

        <div className="border-t pt-4">
          <p className="text-sm font-medium text-[#1E2A4A] mb-2">Ajouter un jour ferie</p>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={newHoliday.date} onChange={e => setNewHoliday(p => ({ ...p, date: e.target.value }))} className="h-9" />
            </div>
            <div className="flex-[2]">
              <Label className="text-xs">Libelle</Label>
              <Input value={newHoliday.label} onChange={e => setNewHoliday(p => ({ ...p, label: e.target.value }))} placeholder="Nom du jour ferie" className="h-9" />
            </div>
            <Button size="sm" className="bg-[#C9A84C] text-[#1E2A4A] hover:bg-[#b89a42] h-9"
              disabled={!newHoliday.date || !newHoliday.label}
              onClick={() => {
                const h: PublicHoliday = { id: uid(), date: newHoliday.date, label: newHoliday.label }
                const updated = { ...holidays, [holidayYear]: [...currentHolidays, h] }
                saveHols(updated)
                setNewHoliday({ date: "", label: "" })
              }}>
              <Plus className="w-4 h-4 mr-1" /> Ajouter
            </Button>
          </div>
        </div>

        <p className="text-xs text-gray-400">Les jours feries sont utilises pour le calcul des heures supplementaires (toutes heures x2) et le decompte des conges.</p>
      </CardContent>
    </Card>
  )

  // =========================================================================
  // PAY GROUPS TAB
  // =========================================================================
  const PayGroupsTab = () => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-[#1E2A4A] text-base flex items-center gap-2">
          <Users className="w-5 h-5" /> Groupes de paie
        </CardTitle>
        <Button size="sm" className="bg-[#1E2A4A] text-white hover:bg-[#2a3d6b]"
          onClick={() => {
            const pg: PayGroup = { id: uid(), code: "", name: "", employees: [] }
            savePgs([...payGroups, pg])
            setEditPgId(pg.id)
            setDraftPg(pg)
          }}>
          <Plus className="w-4 h-4 mr-1" /> Ajouter
        </Button>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#1E2A4A] text-white">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Code</th>
                <th className="px-4 py-2 text-left font-medium">Nom du groupe</th>
                <th className="px-4 py-2 text-center font-medium">Employes</th>
                <th className="px-4 py-2 text-right font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payGroups.map((pg, i) => {
                const editing = editPgId === pg.id
                return (
                  <tr key={pg.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2">
                      {editing ? <Input value={draftPg.code || ""} onChange={e => setDraftPg(p => ({ ...p, code: e.target.value }))} className="h-8 w-24" /> : <span className="font-mono text-xs bg-[#C9A84C]/20 text-[#1E2A4A] px-2 py-0.5 rounded font-semibold">{pg.code}</span>}
                    </td>
                    <td className="px-4 py-2">
                      {editing ? <Input value={draftPg.name || ""} onChange={e => setDraftPg(p => ({ ...p, name: e.target.value }))} className="h-8" /> : pg.name}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{pg.employees.length} employe(s)</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <InlineActions editing={editing}
                        onEdit={() => { setEditPgId(pg.id); setDraftPg({ ...pg }) }}
                        onSave={() => { savePgs(payGroups.map(x => x.id === pg.id ? { ...pg, ...draftPg } as PayGroup : x)); setEditPgId(null) }}
                        onCancel={() => setEditPgId(null)}
                        onDelete={() => savePgs(payGroups.filter(x => x.id !== pg.id))}
                      />
                    </td>
                  </tr>
                )
              })}
              {payGroups.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Aucun groupe de paie</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">L'affectation des employes aux groupes se fait depuis la fiche employe ou par import.</p>
      </CardContent>
    </Card>
  )

  // =========================================================================
  // CALENDARS TAB
  // =========================================================================
  const CalendarsTab = () => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-[#1E2A4A] text-base flex items-center gap-2">
          <Clock className="w-5 h-5" /> Calendriers de travail
        </CardTitle>
        <Button size="sm" className="bg-[#1E2A4A] text-white hover:bg-[#2a3d6b]"
          onClick={() => {
            const c: WorkCalendar = { id: uid(), name: "", days: ["Lun", "Mar", "Mer", "Jeu", "Ven"], hoursPerDay: 9 }
            saveCals([...calendars, c])
            setEditCalId(c.id)
            setDraftCal(c)
          }}>
          <Plus className="w-4 h-4 mr-1" /> Ajouter
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {calendars.map((cal, i) => {
          const editing = editCalId === cal.id
          return (
            <div key={cal.id} className="border rounded-lg p-4 bg-white">
              <div className="flex items-center justify-between mb-3">
                <div className="flex-1">
                  {editing ? (
                    <Input value={draftCal.name || ""} onChange={e => setDraftCal(p => ({ ...p, name: e.target.value }))} className="h-8 font-semibold" placeholder="Nom du calendrier" />
                  ) : (
                    <p className="font-semibold text-[#1E2A4A]">{cal.name}</p>
                  )}
                </div>
                <InlineActions editing={editing}
                  onEdit={() => { setEditCalId(cal.id); setDraftCal({ ...cal }) }}
                  onSave={() => { saveCals(calendars.map(x => x.id === cal.id ? { ...cal, ...draftCal } as WorkCalendar : x)); setEditCalId(null) }}
                  onCancel={() => setEditCalId(null)}
                  onDelete={() => saveCals(calendars.filter(x => x.id !== cal.id))}
                />
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-xs text-gray-500 mr-2">Jours :</span>
                {ALL_DAYS.map(day => {
                  const active = editing ? (draftCal.days || []).includes(day) : cal.days.includes(day)
                  return (
                    <button key={day}
                      disabled={!editing}
                      onClick={() => {
                        if (!editing) return
                        const current = draftCal.days || []
                        setDraftCal(p => ({
                          ...p,
                          days: current.includes(day) ? current.filter(d => d !== day) : [...current, day]
                        }))
                      }}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        active
                          ? "bg-[#1E2A4A] text-white"
                          : "bg-gray-100 text-gray-400"
                      } ${editing ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                    >
                      {day}
                    </button>
                  )
                })}
                <span className="text-xs text-gray-500 ml-4 mr-2">Heures/jour :</span>
                {editing ? (
                  <Input type="number" value={draftCal.hoursPerDay ?? 9} onChange={e => setDraftCal(p => ({ ...p, hoursPerDay: Number(e.target.value) }))} className="h-8 w-16" />
                ) : (
                  <span className="text-sm font-semibold text-[#1E2A4A]">{cal.hoursPerDay}h</span>
                )}
              </div>
            </div>
          )
        })}
        {calendars.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-8">Aucun calendrier de travail</p>
        )}
        <p className="text-xs text-gray-400">Le calendrier est affecte a chaque employe et determine le calcul des heures normales, OT, et decompte des conges.</p>
      </CardContent>
    </Card>
  )

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1E2A4A]">Parametres RH</h1>
        <p className="text-sm text-gray-500">Configuration des departements, conges, jours feries, groupes de paie et calendriers</p>
      </div>

      <Tabs defaultValue="departments">
        <TabsList className="bg-[#1E2A4A]/5 border">
          <TabsTrigger value="departments" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white">
            Departements
          </TabsTrigger>
          <TabsTrigger value="offices" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white">
            Bureaux/Sites
          </TabsTrigger>
          <TabsTrigger value="leave-types" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white">
            Types de conges
          </TabsTrigger>
          <TabsTrigger value="holidays" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white">
            Jours feries
          </TabsTrigger>
          <TabsTrigger value="pay-groups" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white">
            Groupes de paie
          </TabsTrigger>
          <TabsTrigger value="calendars" className="data-[state=active]:bg-[#1E2A4A] data-[state=active]:text-white">
            Calendriers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="departments" className="mt-4">
          <DepartmentsTab />
        </TabsContent>
        <TabsContent value="offices" className="mt-4">
          <OfficesTab />
        </TabsContent>
        <TabsContent value="leave-types" className="mt-4">
          <LeaveTypesTab />
        </TabsContent>
        <TabsContent value="holidays" className="mt-4">
          <HolidaysTab />
        </TabsContent>
        <TabsContent value="pay-groups" className="mt-4">
          <PayGroupsTab />
        </TabsContent>
        <TabsContent value="calendars" className="mt-4">
          <CalendarsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
