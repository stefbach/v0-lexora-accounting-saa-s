"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import {
  Plus, Trash2, Pencil, Save, X, Building2, MapPin, Calendar,
  Users, Clock, ChevronLeft, ChevronRight, Loader2, AlertTriangle,
} from "lucide-react"
import { t, getLocale } from '@/lib/i18n'
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

// ---------------------------------------------------------------------------
// Types (UI shapes — server returns slightly richer rows; we keep what's used)
// ---------------------------------------------------------------------------
interface Department {
  id: string
  code: string
  nom: string
  description?: string | null
  manager_id?: string | null
}
interface Office {
  id: string
  code: string
  nom: string
  adresse?: string | null
}
interface LeaveType {
  id: string
  code: string
  nom: string
  daysPerYear: number
  paid: boolean
  requiresCertificate: boolean
  is_global?: boolean
  societe_id?: string | null
}
interface PublicHoliday {
  id: string
  date: string
  libelle: string
  societe_id?: string | null
}
interface PayGroup {
  id: string
  code?: string | null
  nom: string
  nb_membres?: number
}
interface WorkCalendar {
  id: string
  nom: string
  jours_semaine: string[]
  heures_par_jour: number
}

const ALL_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: 'no-store' })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data?.error || r.statusText)
  return data as T
}
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data?.error || r.statusText)
  return data as T
}

// ---------------------------------------------------------------------------
// Inline edit row helper
// ---------------------------------------------------------------------------
function InlineActions({ editing, onEdit, onSave, onCancel, onDelete, busy }: {
  editing: boolean
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
  busy?: boolean
}) {
  if (editing) {
    return (
      <div className="flex gap-1">
        <Button aria-label="Enregistrer" size="sm" variant="ghost" disabled={busy} onClick={onSave} className="text-green-600 hover:text-green-700 h-8 w-8 p-0">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
        </Button>
        <Button aria-label="Annuler" size="sm" variant="ghost" disabled={busy} onClick={onCancel} className="text-gray-400 hover:text-gray-600 h-8 w-8 p-0">
          <X className="w-4 h-4" aria-hidden="true" />
        </Button>
      </div>
    )
  }
  return (
    <div className="flex gap-1">
      <Button aria-label="Modifier" size="sm" variant="ghost" disabled={busy} onClick={onEdit} className="text-[#0B0F2E] hover:text-[#D4AF37] h-8 w-8 p-0">
        <Pencil className="w-4 h-4" aria-hidden="true" />
      </Button>
      <Button aria-label="Supprimer" size="sm" variant="ghost" disabled={busy} onClick={onDelete} className="text-red-400 hover:text-red-600 h-8 w-8 p-0">
        <Trash2 className="w-4 h-4" aria-hidden="true" />
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function ParametresRHPage() {
  const locale = getLocale()
  const { societeId, loading: societeLoading } = useSocieteActive()

  // Global page state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
  const [holidayYear, setHolidayYear] = useState(new Date().getFullYear())
  const [holidays, setHolidays] = useState<PublicHoliday[]>([])
  const [newHoliday, setNewHoliday] = useState({ date: "", label: "" })

  // Pay Groups
  const [payGroups, setPayGroups] = useState<PayGroup[]>([])
  const [editPgId, setEditPgId] = useState<string | null>(null)
  const [draftPg, setDraftPg] = useState<Partial<PayGroup>>({})

  // Calendars
  const [calendars, setCalendars] = useState<WorkCalendar[]>([])
  const [editCalId, setEditCalId] = useState<string | null>(null)
  const [draftCal, setDraftCal] = useState<Partial<WorkCalendar>>({})

  // ---------------- Data loaders ----------------
  const loadAll = useCallback(async (sid: string, year: number) => {
    setLoading(true)
    setError(null)
    try {
      const [d, o, lt, h, pg, c] = await Promise.all([
        apiGet<{ departements: Department[] }>(`/api/rh/departements?societe_id=${sid}`),
        apiGet<{ bureaux: Office[] }>(`/api/rh/bureaux?societe_id=${sid}`),
        apiGet<{ types_conges: LeaveType[] }>(`/api/rh/types-conges?societe_id=${sid}`),
        apiGet<{ jours_feries: PublicHoliday[] }>(`/api/rh/jours-feries?societe_id=${sid}&annee=${year}`),
        apiGet<{ groupes: PayGroup[] }>(`/api/rh/groupes?societe_id=${sid}`),
        apiGet<{ calendriers: WorkCalendar[] }>(`/api/rh/calendriers?societe_id=${sid}`),
      ])
      setDepartments(d.departements ?? [])
      setOffices(o.bureaux ?? [])
      setLeaveTypes(lt.types_conges ?? [])
      setHolidays(h.jours_feries ?? [])
      setPayGroups(pg.groupes ?? [])
      setCalendars(c.calendriers ?? [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur de chargement'
      setError(msg)
      console.error('[parametres-rh] load error', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!societeId) return
    void loadAll(societeId, holidayYear)
  }, [societeId, holidayYear, loadAll])

  // Refresh helpers (only the part that changed) so other tabs keep their state.
  const refreshDepartments = useCallback(async () => {
    if (!societeId) return
    const r = await apiGet<{ departements: Department[] }>(`/api/rh/departements?societe_id=${societeId}`)
    setDepartments(r.departements ?? [])
  }, [societeId])
  const refreshOffices = useCallback(async () => {
    if (!societeId) return
    const r = await apiGet<{ bureaux: Office[] }>(`/api/rh/bureaux?societe_id=${societeId}`)
    setOffices(r.bureaux ?? [])
  }, [societeId])
  const refreshLeaveTypes = useCallback(async () => {
    if (!societeId) return
    const r = await apiGet<{ types_conges: LeaveType[] }>(`/api/rh/types-conges?societe_id=${societeId}`)
    setLeaveTypes(r.types_conges ?? [])
  }, [societeId])
  const refreshHolidays = useCallback(async (year = holidayYear) => {
    if (!societeId) return
    const r = await apiGet<{ jours_feries: PublicHoliday[] }>(`/api/rh/jours-feries?societe_id=${societeId}&annee=${year}`)
    setHolidays(r.jours_feries ?? [])
  }, [societeId, holidayYear])
  const refreshPayGroups = useCallback(async () => {
    if (!societeId) return
    const r = await apiGet<{ groupes: PayGroup[] }>(`/api/rh/groupes?societe_id=${societeId}`)
    setPayGroups(r.groupes ?? [])
  }, [societeId])
  const refreshCalendars = useCallback(async () => {
    if (!societeId) return
    const r = await apiGet<{ calendriers: WorkCalendar[] }>(`/api/rh/calendriers?societe_id=${societeId}`)
    setCalendars(r.calendriers ?? [])
  }, [societeId])

  // ---------------- Mutation handlers ----------------
  const handleErr = (e: unknown) => {
    const msg = e instanceof Error ? e.message : 'Erreur inattendue'
    alert(msg)
  }

  // Departments
  const saveDept = async (id: string | null, draft: Partial<Department>) => {
    if (!societeId) return
    if (!draft.code?.trim() || !draft.nom?.trim()) {
      alert(t('hr.params.code', locale) + ' + ' + t('hr.params.name', locale) + ' requis')
      return
    }
    setBusy(true)
    try {
      if (id) {
        await apiPost('/api/rh/departements', {
          action: 'modifier',
          id,
          code: draft.code,
          nom: draft.nom,
          description: draft.description ?? null,
          manager_id: draft.manager_id ?? null,
        })
      } else {
        await apiPost('/api/rh/departements', {
          action: 'creer',
          societe_id: societeId,
          code: draft.code,
          nom: draft.nom,
          description: draft.description ?? null,
          manager_id: draft.manager_id ?? null,
        })
      }
      await refreshDepartments()
      setEditDeptId(null)
      setDraftDept({})
    } catch (e) { handleErr(e) } finally { setBusy(false) }
  }
  const deleteDept = async (id: string) => {
    if (!confirm('Supprimer ce département ?')) return
    setBusy(true)
    try {
      await apiPost('/api/rh/departements', { action: 'supprimer', id })
      await refreshDepartments()
    } catch (e) { handleErr(e) } finally { setBusy(false) }
  }

  // Offices
  const saveOff = async (id: string | null, draft: Partial<Office>) => {
    if (!societeId) return
    if (!draft.code?.trim() || !draft.nom?.trim()) {
      alert(t('hr.params.code', locale) + ' + ' + t('hr.params.name', locale) + ' requis')
      return
    }
    setBusy(true)
    try {
      if (id) {
        await apiPost('/api/rh/bureaux', {
          action: 'modifier', id,
          code: draft.code, nom: draft.nom, adresse: draft.adresse ?? null,
        })
      } else {
        await apiPost('/api/rh/bureaux', {
          action: 'creer', societe_id: societeId,
          code: draft.code, nom: draft.nom, adresse: draft.adresse ?? null,
        })
      }
      await refreshOffices()
      setEditOffId(null)
      setDraftOff({})
    } catch (e) { handleErr(e) } finally { setBusy(false) }
  }
  const deleteOff = async (id: string) => {
    if (!confirm('Supprimer ce bureau ?')) return
    setBusy(true)
    try {
      await apiPost('/api/rh/bureaux', { action: 'supprimer', id })
      await refreshOffices()
    } catch (e) { handleErr(e) } finally { setBusy(false) }
  }

  // Leave Types
  const saveLt = async (id: string | null, draft: Partial<LeaveType>) => {
    if (!societeId) return
    if (!draft.code?.trim() || !draft.nom?.trim()) {
      alert(t('hr.params.code', locale) + ' + ' + t('hr.params.name', locale) + ' requis')
      return
    }
    setBusy(true)
    try {
      if (id) {
        await apiPost('/api/rh/types-conges', {
          action: 'modifier', id,
          societe_id: societeId,
          code: draft.code, nom: draft.nom,
          daysPerYear: draft.daysPerYear ?? 0,
          paid: draft.paid ?? true,
          requiresCertificate: draft.requiresCertificate ?? false,
        })
      } else {
        await apiPost('/api/rh/types-conges', {
          action: 'creer', societe_id: societeId,
          code: draft.code, nom: draft.nom,
          daysPerYear: draft.daysPerYear ?? 0,
          paid: draft.paid ?? true,
          requiresCertificate: draft.requiresCertificate ?? false,
        })
      }
      await refreshLeaveTypes()
      setEditLtId(null)
      setDraftLt({})
    } catch (e) { handleErr(e) } finally { setBusy(false) }
  }
  const deleteLt = async (id: string, is_global?: boolean) => {
    if (is_global) {
      alert('Règle globale Maurice (WRA 2019). Modifiez-la pour créer un override société.')
      return
    }
    if (!confirm('Supprimer ce type de congé pour cette société ?')) return
    setBusy(true)
    try {
      await apiPost('/api/rh/types-conges', { action: 'supprimer', id })
      await refreshLeaveTypes()
    } catch (e) { handleErr(e) } finally { setBusy(false) }
  }

  // Holidays
  const addHoliday = async () => {
    if (!societeId || !newHoliday.date || !newHoliday.label) return
    setBusy(true)
    try {
      await apiPost('/api/rh/jours-feries', {
        action: 'creer',
        societe_id: societeId,
        date: newHoliday.date,
        libelle: newHoliday.label,
      })
      setNewHoliday({ date: "", label: "" })
      await refreshHolidays()
    } catch (e) { handleErr(e) } finally { setBusy(false) }
  }
  const deleteHoliday = async (id: string) => {
    if (!confirm('Supprimer ce jour férié ?')) return
    setBusy(true)
    try {
      await apiPost('/api/rh/jours-feries', { action: 'supprimer', id })
      await refreshHolidays()
    } catch (e) { handleErr(e) } finally { setBusy(false) }
  }

  // Pay Groups
  const savePg = async (id: string | null, draft: Partial<PayGroup>) => {
    if (!societeId) return
    if (!draft.nom?.trim()) {
      alert(t('hr.params.group_name', locale) + ' requis')
      return
    }
    setBusy(true)
    try {
      if (id) {
        await apiPost('/api/rh/groupes', {
          action: 'modifier', id,
          code: draft.code ?? null, nom: draft.nom,
        })
      } else {
        await apiPost('/api/rh/groupes', {
          action: 'creer', societe_id: societeId,
          code: draft.code ?? null, nom: draft.nom,
        })
      }
      await refreshPayGroups()
      setEditPgId(null)
      setDraftPg({})
    } catch (e) { handleErr(e) } finally { setBusy(false) }
  }
  const deletePg = async (id: string) => {
    if (!confirm('Supprimer ce groupe de paie ?')) return
    setBusy(true)
    try {
      await apiPost('/api/rh/groupes', { action: 'supprimer', id })
      await refreshPayGroups()
    } catch (e) { handleErr(e) } finally { setBusy(false) }
  }

  // Calendars
  const saveCal = async (id: string | null, draft: Partial<WorkCalendar>) => {
    if (!societeId) return
    if (!draft.nom?.trim()) {
      alert(t('hr.params.calendar_name_ph', locale) + ' requis')
      return
    }
    setBusy(true)
    try {
      if (id) {
        await apiPost('/api/rh/calendriers', {
          action: 'modifier', id,
          nom: draft.nom,
          jours_semaine: draft.jours_semaine ?? [],
          heures_par_jour: draft.heures_par_jour ?? 9,
        })
      } else {
        await apiPost('/api/rh/calendriers', {
          action: 'creer', societe_id: societeId,
          nom: draft.nom,
          jours_semaine: draft.jours_semaine ?? ["Lun", "Mar", "Mer", "Jeu", "Ven"],
          heures_par_jour: draft.heures_par_jour ?? 9,
        })
      }
      await refreshCalendars()
      setEditCalId(null)
      setDraftCal({})
    } catch (e) { handleErr(e) } finally { setBusy(false) }
  }
  const deleteCal = async (id: string) => {
    if (!confirm('Supprimer ce calendrier ?')) return
    setBusy(true)
    try {
      await apiPost('/api/rh/calendriers', { action: 'supprimer', id })
      await refreshCalendars()
    } catch (e) { handleErr(e) } finally { setBusy(false) }
  }

  // =========================================================================
  // RENDER GUARDS (loading / no société / error)
  // =========================================================================
  if (societeLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#0B0F2E]" />
      </div>
    )
  }
  if (!societeId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center">
            <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-3" />
            <p className="text-gray-600">
              Aucune société active. Sélectionnez-en une dans le menu de gauche.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // =========================================================================
  // DEPARTMENTS TAB
  // =========================================================================
  const DepartmentsTab = (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2">
          <Building2 className="w-5 h-5" /> {t('hr.params.departments', locale)}
        </CardTitle>
        <Button size="sm" className="bg-[#0B0F2E] text-white hover:bg-[#2a3d6b]"
          disabled={busy || editDeptId === '__new__'}
          onClick={() => {
            setEditDeptId('__new__')
            setDraftDept({ code: "", nom: "", description: "", manager_id: null })
          }}>
          <Plus className="w-4 h-4 mr-1" /> {t('hr.params.add', locale)}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" /></div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#0B0F2E] text-white">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t('hr.params.code', locale)}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('hr.params.name', locale)}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('hr.params.manager', locale)}</th>
                  <th className="px-4 py-2 text-right font-medium w-24">{t('hr.params.actions', locale)}</th>
                </tr>
              </thead>
              <tbody>
                {editDeptId === '__new__' && (
                  <tr className="bg-amber-50">
                    <td className="px-4 py-2">
                      <Input value={draftDept.code || ""} onChange={e => setDraftDept(p => ({ ...p, code: e.target.value }))} className="h-8 w-24" placeholder="DIR" />
                    </td>
                    <td className="px-4 py-2">
                      <Input value={draftDept.nom || ""} onChange={e => setDraftDept(p => ({ ...p, nom: e.target.value }))} className="h-8" placeholder="Direction" />
                    </td>
                    <td className="px-4 py-2">
                      <Input value={draftDept.description || ""} onChange={e => setDraftDept(p => ({ ...p, description: e.target.value }))} className="h-8" placeholder="(description)" />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <InlineActions editing busy={busy}
                        onEdit={() => {}}
                        onSave={() => saveDept(null, draftDept)}
                        onCancel={() => { setEditDeptId(null); setDraftDept({}) }}
                        onDelete={() => {}}
                      />
                    </td>
                  </tr>
                )}
                {departments.map((d, i) => {
                  const editing = editDeptId === d.id
                  return (
                    <tr key={d.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-2">
                        {editing ? <Input value={draftDept.code || ""} onChange={e => setDraftDept(p => ({ ...p, code: e.target.value }))} className="h-8 w-24" /> : d.code}
                      </td>
                      <td className="px-4 py-2">
                        {editing ? <Input value={draftDept.nom || ""} onChange={e => setDraftDept(p => ({ ...p, nom: e.target.value }))} className="h-8" /> : d.nom}
                      </td>
                      <td className="px-4 py-2">
                        {editing
                          ? <Input value={draftDept.description || ""} onChange={e => setDraftDept(p => ({ ...p, description: e.target.value }))} className="h-8" />
                          : (d.description || <span className="text-gray-400">--</span>)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <InlineActions editing={editing} busy={busy}
                          onEdit={() => { setEditDeptId(d.id); setDraftDept({ ...d }) }}
                          onSave={() => saveDept(d.id, draftDept)}
                          onCancel={() => { setEditDeptId(null); setDraftDept({}) }}
                          onDelete={() => deleteDept(d.id)}
                        />
                      </td>
                    </tr>
                  )
                })}
                {departments.length === 0 && editDeptId !== '__new__' && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">{t('hr.params.no_departments', locale)}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )

  // =========================================================================
  // OFFICES TAB
  // =========================================================================
  const OfficesTab = (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2">
          <MapPin className="w-5 h-5" /> {t('hr.params.offices', locale)}
        </CardTitle>
        <Button size="sm" className="bg-[#0B0F2E] text-white hover:bg-[#2a3d6b]"
          disabled={busy || editOffId === '__new__'}
          onClick={() => {
            setEditOffId('__new__')
            setDraftOff({ code: "", nom: "", adresse: "" })
          }}>
          <Plus className="w-4 h-4 mr-1" /> {t('hr.params.add', locale)}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" /></div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#0B0F2E] text-white">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t('hr.params.code', locale)}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('hr.params.name', locale)}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('hr.params.address', locale)}</th>
                  <th className="px-4 py-2 text-right font-medium w-24">{t('hr.params.actions', locale)}</th>
                </tr>
              </thead>
              <tbody>
                {editOffId === '__new__' && (
                  <tr className="bg-amber-50">
                    <td className="px-4 py-2"><Input value={draftOff.code || ""} onChange={e => setDraftOff(p => ({ ...p, code: e.target.value }))} className="h-8 w-24" placeholder="HQ" /></td>
                    <td className="px-4 py-2"><Input value={draftOff.nom || ""} onChange={e => setDraftOff(p => ({ ...p, nom: e.target.value }))} className="h-8" placeholder="Siège" /></td>
                    <td className="px-4 py-2"><Input value={draftOff.adresse || ""} onChange={e => setDraftOff(p => ({ ...p, adresse: e.target.value }))} className="h-8" placeholder="Port Louis" /></td>
                    <td className="px-4 py-2 text-right">
                      <InlineActions editing busy={busy}
                        onEdit={() => {}}
                        onSave={() => saveOff(null, draftOff)}
                        onCancel={() => { setEditOffId(null); setDraftOff({}) }}
                        onDelete={() => {}}
                      />
                    </td>
                  </tr>
                )}
                {offices.map((o, i) => {
                  const editing = editOffId === o.id
                  return (
                    <tr key={o.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-2">
                        {editing ? <Input value={draftOff.code || ""} onChange={e => setDraftOff(p => ({ ...p, code: e.target.value }))} className="h-8 w-24" /> : o.code}
                      </td>
                      <td className="px-4 py-2">
                        {editing ? <Input value={draftOff.nom || ""} onChange={e => setDraftOff(p => ({ ...p, nom: e.target.value }))} className="h-8" /> : o.nom}
                      </td>
                      <td className="px-4 py-2">
                        {editing ? <Input value={draftOff.adresse || ""} onChange={e => setDraftOff(p => ({ ...p, adresse: e.target.value }))} className="h-8" /> : (o.adresse || <span className="text-gray-400">--</span>)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <InlineActions editing={editing} busy={busy}
                          onEdit={() => { setEditOffId(o.id); setDraftOff({ ...o }) }}
                          onSave={() => saveOff(o.id, draftOff)}
                          onCancel={() => { setEditOffId(null); setDraftOff({}) }}
                          onDelete={() => deleteOff(o.id)}
                        />
                      </td>
                    </tr>
                  )
                })}
                {offices.length === 0 && editOffId !== '__new__' && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">{t('hr.params.no_offices', locale)}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )

  // =========================================================================
  // LEAVE TYPES TAB
  // =========================================================================
  const LeaveTypesTab = (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2">
          <Calendar className="w-5 h-5" /> {t('hr.params.leave_types', locale)}
        </CardTitle>
        <Button size="sm" className="bg-[#0B0F2E] text-white hover:bg-[#2a3d6b]"
          disabled={busy || editLtId === '__new__'}
          onClick={() => {
            setEditLtId('__new__')
            setDraftLt({ code: "", nom: "", daysPerYear: 0, requiresCertificate: false, paid: true })
          }}>
          <Plus className="w-4 h-4 mr-1" /> {t('hr.params.add', locale)}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" /></div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#0B0F2E] text-white">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t('hr.params.code', locale)}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('hr.params.name', locale)}</th>
                  <th className="px-4 py-2 text-center font-medium">{t('hr.params.days_per_year', locale)}</th>
                  <th className="px-4 py-2 text-center font-medium">{t('hr.params.certificate', locale)}</th>
                  <th className="px-4 py-2 text-center font-medium">{t('hr.params.paid', locale)}</th>
                  <th className="px-4 py-2 text-center font-medium">Scope</th>
                  <th className="px-4 py-2 text-right font-medium w-24">{t('hr.params.actions', locale)}</th>
                </tr>
              </thead>
              <tbody>
                {editLtId === '__new__' && (
                  <tr className="bg-amber-50">
                    <td className="px-4 py-2"><Input value={draftLt.code || ""} onChange={e => setDraftLt(p => ({ ...p, code: e.target.value }))} className="h-8 w-20" placeholder="AL" /></td>
                    <td className="px-4 py-2"><Input value={draftLt.nom || ""} onChange={e => setDraftLt(p => ({ ...p, nom: e.target.value }))} className="h-8" placeholder="Annual leave" /></td>
                    <td className="px-4 py-2 text-center"><Input type="number" value={draftLt.daysPerYear ?? 0} onChange={e => setDraftLt(p => ({ ...p, daysPerYear: Number(e.target.value) }))} className="h-8 w-20 mx-auto" /></td>
                    <td className="px-4 py-2 text-center"><Switch checked={draftLt.requiresCertificate ?? false} onCheckedChange={v => setDraftLt(p => ({ ...p, requiresCertificate: v }))} /></td>
                    <td className="px-4 py-2 text-center"><Switch checked={draftLt.paid ?? true} onCheckedChange={v => setDraftLt(p => ({ ...p, paid: v }))} /></td>
                    <td className="px-4 py-2 text-center"><span className="text-xs text-amber-600">société</span></td>
                    <td className="px-4 py-2 text-right">
                      <InlineActions editing busy={busy}
                        onEdit={() => {}}
                        onSave={() => saveLt(null, draftLt)}
                        onCancel={() => { setEditLtId(null); setDraftLt({}) }}
                        onDelete={() => {}}
                      />
                    </td>
                  </tr>
                )}
                {leaveTypes.map((lt, i) => {
                  const editing = editLtId === lt.id
                  return (
                    <tr key={lt.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-2">
                        {editing ? <Input value={draftLt.code || ""} onChange={e => setDraftLt(p => ({ ...p, code: e.target.value }))} className="h-8 w-20" /> : <span className="font-mono text-xs bg-[#0B0F2E]/10 px-2 py-0.5 rounded">{lt.code}</span>}
                      </td>
                      <td className="px-4 py-2">
                        {editing ? <Input value={draftLt.nom || ""} onChange={e => setDraftLt(p => ({ ...p, nom: e.target.value }))} className="h-8" /> : lt.nom}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {editing ? <Input type="number" value={draftLt.daysPerYear ?? 0} onChange={e => setDraftLt(p => ({ ...p, daysPerYear: Number(e.target.value) }))} className="h-8 w-20 mx-auto" /> : (lt.daysPerYear > 0 ? lt.daysPerYear : <span className="text-gray-400">--</span>)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {editing
                          ? <Switch checked={draftLt.requiresCertificate ?? false} onCheckedChange={v => setDraftLt(p => ({ ...p, requiresCertificate: v }))} />
                          : (lt.requiresCertificate
                            ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">{t('hr.params.yes', locale)}</span>
                            : <span className="text-xs text-gray-400">{t('hr.params.no', locale)}</span>)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {editing
                          ? <Switch checked={draftLt.paid ?? true} onCheckedChange={v => setDraftLt(p => ({ ...p, paid: v }))} />
                          : (lt.paid
                            ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">{t('hr.params.paid_yes', locale)}</span>
                            : <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">{t('hr.params.paid_no', locale)}</span>)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {lt.is_global
                          ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">global MU</span>
                          : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">société</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <InlineActions editing={editing} busy={busy}
                          onEdit={() => { setEditLtId(lt.id); setDraftLt({ ...lt }) }}
                          onSave={() => saveLt(lt.id, draftLt)}
                          onCancel={() => { setEditLtId(null); setDraftLt({}) }}
                          onDelete={() => deleteLt(lt.id, lt.is_global)}
                        />
                      </td>
                    </tr>
                  )
                })}
                {leaveTypes.length === 0 && editLtId !== '__new__' && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">{t('hr.params.no_leave_types', locale)}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-3">
          Les types « global MU » proviennent du seed WRA 2019 (Maurice). Les modifier crée automatiquement un override pour la société active.
        </p>
      </CardContent>
    </Card>
  )

  // =========================================================================
  // HOLIDAYS TAB
  // =========================================================================
  const sortedHolidays = [...holidays].sort((a, b) => a.date.localeCompare(b.date))

  const HolidaysTab = (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2">
          <Calendar className="w-5 h-5" /> {t('hr.params.holidays_title', locale)}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setHolidayYear(y => y - 1)} className="h-8 w-8 p-0">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="font-bold text-[#0B0F2E] text-lg min-w-[4ch] text-center">{holidayYear}</span>
          <Button size="sm" variant="outline" onClick={() => setHolidayYear(y => y + 1)} className="h-8 w-8 p-0">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {sortedHolidays.map(h => (
              <div key={h.id} className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-100">
                <div>
                  <p className="text-sm font-medium text-[#0B0F2E]">{h.libelle}</p>
                  <p className="text-xs text-gray-500">{new Date(h.date + "T12:00:00").toLocaleDateString(locale === 'fr' ? "fr-FR" : "en-US", { weekday: "short", day: "numeric", month: "long" })}</p>
                </div>
                <Button size="sm" variant="ghost" disabled={busy} className="text-red-400 hover:text-red-600 h-8 w-8 p-0"
                  onClick={() => deleteHoliday(h.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            {sortedHolidays.length === 0 && (
              <p className="text-gray-400 text-sm col-span-3 text-center py-6">{t('hr.params.no_holidays', locale)} {holidayYear}</p>
            )}
          </div>
        )}

        <div className="border-t pt-4">
          <p className="text-sm font-medium text-[#0B0F2E] mb-2">{t('hr.params.add_holiday', locale)}</p>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-xs">{t('hr.params.date', locale)}</Label>
              <Input type="date" value={newHoliday.date} onChange={e => setNewHoliday(p => ({ ...p, date: e.target.value }))} className="h-9" />
            </div>
            <div className="flex-[2]">
              <Label className="text-xs">{t('hr.params.label', locale)}</Label>
              <Input value={newHoliday.label} onChange={e => setNewHoliday(p => ({ ...p, label: e.target.value }))} placeholder={t('hr.params.holiday_name_ph', locale)} className="h-9" />
            </div>
            <Button size="sm" className="bg-[#D4AF37] text-[#0B0F2E] hover:bg-[#b89a42] h-9"
              disabled={busy || !newHoliday.date || !newHoliday.label}
              onClick={addHoliday}>
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              {t('hr.params.add', locale)}
            </Button>
          </div>
        </div>

        <p className="text-xs text-gray-400">{t('hr.params.holidays_note', locale)}</p>
      </CardContent>
    </Card>
  )

  // =========================================================================
  // PAY GROUPS TAB
  // =========================================================================
  const PayGroupsTab = (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2">
          <Users className="w-5 h-5" /> {t('hr.params.pay_groups', locale)}
        </CardTitle>
        <Button size="sm" className="bg-[#0B0F2E] text-white hover:bg-[#2a3d6b]"
          disabled={busy || editPgId === '__new__'}
          onClick={() => {
            setEditPgId('__new__')
            setDraftPg({ code: "", nom: "" })
          }}>
          <Plus className="w-4 h-4 mr-1" /> {t('hr.params.add', locale)}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" /></div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#0B0F2E] text-white">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t('hr.params.code', locale)}</th>
                  <th className="px-4 py-2 text-left font-medium">{t('hr.params.group_name', locale)}</th>
                  <th className="px-4 py-2 text-center font-medium">{t('hr.params.employees', locale)}</th>
                  <th className="px-4 py-2 text-right font-medium w-24">{t('hr.params.actions', locale)}</th>
                </tr>
              </thead>
              <tbody>
                {editPgId === '__new__' && (
                  <tr className="bg-amber-50">
                    <td className="px-4 py-2"><Input value={draftPg.code || ""} onChange={e => setDraftPg(p => ({ ...p, code: e.target.value }))} className="h-8 w-24" placeholder="MUT" /></td>
                    <td className="px-4 py-2"><Input value={draftPg.nom || ""} onChange={e => setDraftPg(p => ({ ...p, nom: e.target.value }))} className="h-8" placeholder="Mutualisé" /></td>
                    <td className="px-4 py-2 text-center"><span className="text-xs text-gray-400">--</span></td>
                    <td className="px-4 py-2 text-right">
                      <InlineActions editing busy={busy}
                        onEdit={() => {}}
                        onSave={() => savePg(null, draftPg)}
                        onCancel={() => { setEditPgId(null); setDraftPg({}) }}
                        onDelete={() => {}}
                      />
                    </td>
                  </tr>
                )}
                {payGroups.map((pg, i) => {
                  const editing = editPgId === pg.id
                  return (
                    <tr key={pg.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-2">
                        {editing
                          ? <Input value={draftPg.code || ""} onChange={e => setDraftPg(p => ({ ...p, code: e.target.value }))} className="h-8 w-24" />
                          : <span className="font-mono text-xs bg-[#D4AF37]/20 text-[#0B0F2E] px-2 py-0.5 rounded font-semibold">{pg.code || '--'}</span>}
                      </td>
                      <td className="px-4 py-2">
                        {editing ? <Input value={draftPg.nom || ""} onChange={e => setDraftPg(p => ({ ...p, nom: e.target.value }))} className="h-8" /> : pg.nom}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{pg.nb_membres ?? 0} {t('hr.params.employees_count', locale)}</span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <InlineActions editing={editing} busy={busy}
                          onEdit={() => { setEditPgId(pg.id); setDraftPg({ ...pg }) }}
                          onSave={() => savePg(pg.id, draftPg)}
                          onCancel={() => { setEditPgId(null); setDraftPg({}) }}
                          onDelete={() => deletePg(pg.id)}
                        />
                      </td>
                    </tr>
                  )
                })}
                {payGroups.length === 0 && editPgId !== '__new__' && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">{t('hr.params.no_pay_groups', locale)}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-3">{t('hr.params.pay_groups_note', locale)}</p>
      </CardContent>
    </Card>
  )

  // =========================================================================
  // CALENDARS TAB
  // =========================================================================
  const CalendarsTab = (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2">
          <Clock className="w-5 h-5" /> {t('hr.params.calendars', locale)}
        </CardTitle>
        <Button size="sm" className="bg-[#0B0F2E] text-white hover:bg-[#2a3d6b]"
          disabled={busy || editCalId === '__new__'}
          onClick={() => {
            setEditCalId('__new__')
            setDraftCal({ nom: "", jours_semaine: ["Lun", "Mar", "Mer", "Jeu", "Ven"], heures_par_jour: 9 })
          }}>
          <Plus className="w-4 h-4 mr-1" /> {t('hr.params.add', locale)}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" /></div>
        ) : (
          <>
            {editCalId === '__new__' && (
              <div className="border-2 border-amber-200 rounded-lg p-4 bg-amber-50">
                <div className="flex items-center justify-between mb-3">
                  <Input
                    value={draftCal.nom || ""}
                    onChange={e => setDraftCal(p => ({ ...p, nom: e.target.value }))}
                    className="h-8 font-semibold flex-1 mr-3"
                    placeholder={t('hr.params.calendar_name_ph', locale)}
                  />
                  <InlineActions editing busy={busy}
                    onEdit={() => {}}
                    onSave={() => saveCal(null, draftCal)}
                    onCancel={() => { setEditCalId(null); setDraftCal({}) }}
                    onDelete={() => {}}
                  />
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <span className="text-xs text-gray-500 mr-2">{t('hr.params.days', locale)}</span>
                  {ALL_DAYS.map(day => {
                    const active = (draftCal.jours_semaine || []).includes(day)
                    return (
                      <button key={day}
                        onClick={() => {
                          const current = draftCal.jours_semaine || []
                          setDraftCal(p => ({
                            ...p,
                            jours_semaine: current.includes(day) ? current.filter(d => d !== day) : [...current, day],
                          }))
                        }}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer hover:opacity-80 ${active ? "bg-[#0B0F2E] text-white" : "bg-gray-100 text-gray-400"}`}>
                        {day}
                      </button>
                    )
                  })}
                  <span className="text-xs text-gray-500 ml-4 mr-2">{t('hr.params.hours_per_day', locale)}</span>
                  <Input type="number" value={draftCal.heures_par_jour ?? 9}
                    onChange={e => setDraftCal(p => ({ ...p, heures_par_jour: Number(e.target.value) }))}
                    className="h-8 w-16" />
                </div>
              </div>
            )}
            {calendars.map(cal => {
              const editing = editCalId === cal.id
              return (
                <div key={cal.id} className="border rounded-lg p-4 bg-white">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex-1">
                      {editing ? (
                        <Input value={draftCal.nom || ""} onChange={e => setDraftCal(p => ({ ...p, nom: e.target.value }))} className="h-8 font-semibold" placeholder={t('hr.params.calendar_name_ph', locale)} />
                      ) : (
                        <p className="font-semibold text-[#0B0F2E]">{cal.nom}</p>
                      )}
                    </div>
                    <InlineActions editing={editing} busy={busy}
                      onEdit={() => { setEditCalId(cal.id); setDraftCal({ ...cal }) }}
                      onSave={() => saveCal(cal.id, draftCal)}
                      onCancel={() => { setEditCalId(null); setDraftCal({}) }}
                      onDelete={() => deleteCal(cal.id)}
                    />
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    <span className="text-xs text-gray-500 mr-2">{t('hr.params.days', locale)}</span>
                    {ALL_DAYS.map(day => {
                      const active = editing
                        ? (draftCal.jours_semaine || []).includes(day)
                        : (cal.jours_semaine || []).includes(day)
                      return (
                        <button key={day}
                          disabled={!editing}
                          onClick={() => {
                            if (!editing) return
                            const current = draftCal.jours_semaine || []
                            setDraftCal(p => ({
                              ...p,
                              jours_semaine: current.includes(day) ? current.filter(d => d !== day) : [...current, day],
                            }))
                          }}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${active ? "bg-[#0B0F2E] text-white" : "bg-gray-100 text-gray-400"} ${editing ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}>
                          {day}
                        </button>
                      )
                    })}
                    <span className="text-xs text-gray-500 ml-4 mr-2">{t('hr.params.hours_per_day', locale)}</span>
                    {editing ? (
                      <Input type="number" value={draftCal.heures_par_jour ?? 9}
                        onChange={e => setDraftCal(p => ({ ...p, heures_par_jour: Number(e.target.value) }))}
                        className="h-8 w-16" />
                    ) : (
                      <span className="text-sm font-semibold text-[#0B0F2E]">{cal.heures_par_jour}h</span>
                    )}
                  </div>
                </div>
              )
            })}
            {calendars.length === 0 && editCalId !== '__new__' && (
              <p className="text-gray-400 text-sm text-center py-8">{t('hr.params.no_calendars', locale)}</p>
            )}
          </>
        )}
        <p className="text-xs text-gray-400">{t('hr.params.calendars_note', locale)}</p>
      </CardContent>
    </Card>
  )

  // =========================================================================
  // RENDER
  // =========================================================================
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('hr.params.title', locale)}</h1>
        <p className="text-sm text-gray-500">{t('hr.params.subtitle', locale)}</p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Erreur de chargement</p>
            <p className="text-xs">{error}</p>
          </div>
        </div>
      )}

      <Tabs defaultValue="departments">
        <TabsList className="bg-[#0B0F2E]/5 border">
          <TabsTrigger value="departments" className="data-[state=active]:bg-[#0B0F2E] data-[state=active]:text-white">
            {t('hr.params.departments', locale)}
          </TabsTrigger>
          <TabsTrigger value="offices" className="data-[state=active]:bg-[#0B0F2E] data-[state=active]:text-white">
            {t('hr.params.offices', locale)}
          </TabsTrigger>
          <TabsTrigger value="leave-types" className="data-[state=active]:bg-[#0B0F2E] data-[state=active]:text-white">
            {t('hr.params.leave_types', locale)}
          </TabsTrigger>
          <TabsTrigger value="holidays" className="data-[state=active]:bg-[#0B0F2E] data-[state=active]:text-white">
            {t('hr.params.holidays', locale)}
          </TabsTrigger>
          <TabsTrigger value="pay-groups" className="data-[state=active]:bg-[#0B0F2E] data-[state=active]:text-white">
            {t('hr.params.pay_groups', locale)}
          </TabsTrigger>
          <TabsTrigger value="calendars" className="data-[state=active]:bg-[#0B0F2E] data-[state=active]:text-white">
            {t('hr.params.calendars', locale)}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="departments" className="mt-4">{DepartmentsTab}</TabsContent>
        <TabsContent value="offices" className="mt-4">{OfficesTab}</TabsContent>
        <TabsContent value="leave-types" className="mt-4">{LeaveTypesTab}</TabsContent>
        <TabsContent value="holidays" className="mt-4">{HolidaysTab}</TabsContent>
        <TabsContent value="pay-groups" className="mt-4">{PayGroupsTab}</TabsContent>
        <TabsContent value="calendars" className="mt-4">{CalendarsTab}</TabsContent>
      </Tabs>
    </div>
  )
}
