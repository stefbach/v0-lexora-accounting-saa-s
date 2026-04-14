"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  Loader2, Plus, CheckCircle, XCircle, AlertTriangle,
  Calendar, Thermometer, Clock, ShieldAlert, Users, FileWarning,
  Upload, ChevronLeft, ChevronRight, Eye, Pencil, Save, X
} from "lucide-react"

// ─── Constants ───────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  AL: "Local Leave",
  SL: "Sick Leave",
  UL: "Leave Without Pay",
  MAT: "Maternity Leave (14 wks)",
  PAT: "Paternity Leave (5d)",
  CAR: "Family Care Leave",
  WI: "Work Injury Leave",
  COM: "Bereavement Leave",
  PH: "Jour férié travaillé",
  ABS: "Absence",
}

const TYPE_COLORS: Record<string, string> = {
  AL: "bg-blue-100 text-blue-800",
  SL: "bg-orange-100 text-orange-800",
  MAT: "bg-pink-100 text-pink-800",
  PAT: "bg-indigo-100 text-indigo-800",
  UL: "bg-yellow-100 text-yellow-800",
  CAR: "bg-purple-100 text-purple-800",
  ABS: "bg-red-100 text-red-800",
  WI: "bg-gray-100 text-gray-800",
  COM: "bg-gray-100 text-gray-600",
  PH: "bg-emerald-100 text-emerald-800",
}

const STATUT_LABELS: Record<string, string> = {
  en_attente: "En attente",
  approuve: "Approuve",
  refuse: "Refuse",
  annule: "Annule",
}

const STATUT_COLORS: Record<string, string> = {
  en_attente: "bg-yellow-100 text-yellow-800",
  approuve: "bg-green-100 text-green-800",
  refuse: "bg-red-100 text-red-800",
  annule: "bg-gray-100 text-gray-600",
}

const CALENDAR_BAR_COLORS: Record<string, string> = {
  AL: "bg-[#4191FF]",
  SL: "bg-orange-400",
  MAT: "bg-purple-500",
  PAT: "bg-green-500",
  UL: "bg-yellow-400",
  CAR: "bg-purple-400",
  ABS: "bg-red-400",
  WI: "bg-gray-500",
  COM: "bg-gray-400",
  PH: "bg-emerald-500",
}

const APPROVAL_LEVELS = [
  { label: "Soumis", shortLabel: "Soumis" },
  { label: "Niveau 1: Manager", shortLabel: "Manager" },
  { label: "Niveau 2: DRH", shortLabel: "DRH" },
  { label: "Valide", shortLabel: "Valide" },
]

const JOURS_FERIES_MU = [
  "01-01", "01-02", "02-01", "03-12", "05-01", "08-15", "09-09", "11-01", "11-02", "12-25",
]

// ─── Types ───────────────────────────────────────────────────────
interface BalanceRow {
  employe_id: string
  nom: string
  prenom: string
  poste: string
  societe_id: string
  sexe: string
  date_arrivee: string | null
  al_droit: number
  al_pris: number
  al_solde: number
  sl_droit: number
  sl_pris: number
  sl_solde: number
  status_color: string
  sick_cert_alert: boolean
}

interface KPIs {
  total_al_taken: number
  total_sl_taken: number
  pending_requests: number
  alerts: number
}

interface ApprovalEntry {
  niveau: number
  par: string
  date: string
  role: string
}

interface CongeRecord {
  id: string
  employe_id: string
  type_conge: string
  date_debut: string
  date_fin: string
  nb_jours: number
  demi_journee?: boolean
  matin_ou_apres_midi?: 'matin' | 'apres_midi' | null
  impose_par_societe?: boolean
  statut: string
  motif: string | null
  document_url: string | null
  commentaire_manager: string | null
  date_approbation: string | null
  created_at: string
  niveau_approbation?: number
  approuve_par?: ApprovalEntry[]
  certificat_url?: string | null
  employe?: {
    nom: string
    prenom: string
    poste: string
    societe_id: string
  } | null
}

/**
 * Leave types that CAN be requested as a half day. Most company policies
 * only allow AL / SL / CAR / UL half-days — statutory leaves (MAT/PAT)
 * and accident leave (WI/PH) are always full days. The API additionally
 * checks conges_employes.demi_journee_autorisee before accepting the
 * request.
 */
const DEMI_JOURNEE_ALLOWED_TYPES = new Set(['AL', 'SL', 'CAR', 'UL'])

// ─── Helper ──────────────────────────────────────────────────────
function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function statusDot(color: string) {
  const cls =
    color === "green" ? "bg-green-500" :
    color === "orange" ? "bg-orange-400" :
    "bg-red-500"
  return <span className={`inline-block w-3 h-3 rounded-full ${cls}`} />
}

// ─── Approval Steps Component ───────────────────────────────────
function ApprovalSteps({ niveau, approvals }: { niveau: number; approvals?: ApprovalEntry[] }) {
  const steps = [1, 2, 3]
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-0">
        {steps.map((step, i) => (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all ${
                  niveau >= step
                    ? "bg-[#D4AF37] border-[#D4AF37] text-white"
                    : "bg-white border-gray-300 text-gray-400"
                }`}
              >
                {niveau >= step ? "\u2713" : step}
              </div>
              <span className={`text-[9px] mt-0.5 whitespace-nowrap ${niveau >= step ? "text-[#0B0F2E] font-medium" : "text-gray-400"}`}>
                {APPROVAL_LEVELS[step]?.shortLabel}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-6 h-0.5 mb-3 mx-0.5 ${niveau > step ? "bg-[#D4AF37]" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>
      {approvals && approvals.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {approvals.map((a, i) => (
            <p key={i} className="text-[10px] text-gray-500">
              {APPROVAL_LEVELS[a.niveau]?.shortLabel}: <span className="font-medium text-[#0B0F2E]">{a.par}</span>{" "}
              <span className="text-gray-400">({formatDate(a.date)})</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Medical Certificate Upload Zone ────────────────────────────
function CertificatUploadZone({ congeId, existingUrl, onUploaded }: {
  congeId: string
  existingUrl?: string | null
  onUploaded?: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const handleFile = async (file: File) => {
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("conge_id", congeId)
      await fetch("/api/rh/conges/upload-certificat", {
        method: "POST",
        body: formData,
      })
      onUploaded?.()
    } catch (e) {
      console.error(e)
    } finally {
      setUploading(false)
    }
  }

  if (existingUrl) {
    return (
      <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-md">
        <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
        <span className="text-xs text-green-700">Certificat televerse</span>
        <a href={existingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#4191FF] underline ml-auto flex items-center gap-1">
          <Eye className="w-3 h-3" />Voir
        </a>
      </div>
    )
  }

  return (
    <div
      className={`relative border-2 border-dashed rounded-lg p-3 text-center transition-colors cursor-pointer ${
        dragOver ? "border-[#4191FF] bg-blue-50" : "border-gray-300 hover:border-[#D4AF37]"
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
    >
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="absolute inset-0 opacity-0 cursor-pointer"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      {uploading ? (
        <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37] mx-auto" />
      ) : (
        <>
          <Upload className="w-5 h-5 text-gray-400 mx-auto mb-1" />
          <p className="text-xs text-gray-500">Certificat medical requis (SL &gt; 3j)</p>
          <p className="text-[10px] text-gray-400">PDF, JPG ou PNG</p>
        </>
      )}
    </div>
  )
}

// ─── Team Calendar View Component ───────────────────────────────
function TeamCalendarView({ conges, employes, societeFilter }: {
  conges: CongeRecord[]
  employes: { id: string; nom: string; prenom: string; societe_id?: string }[]
  societeFilter: string
}) {
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  const daysInMonth = new Date(calMonth.year, calMonth.month + 1, 0).getDate()
  const monthName = new Date(calMonth.year, calMonth.month).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const filteredEmployes = useMemo(() => {
    if (societeFilter === "all") return employes
    return employes.filter(e => e.societe_id === societeFilter)
  }, [employes, societeFilter])

  const approvedConges = useMemo(() => {
    return conges.filter(c => c.statut === "approuve")
  }, [conges])

  const isJourFerie = (day: number) => {
    const mm = String(calMonth.month + 1).padStart(2, "0")
    const dd = String(day).padStart(2, "0")
    return JOURS_FERIES_MU.includes(`${mm}-${dd}`)
  }

  const isWeekend = (day: number) => {
    const d = new Date(calMonth.year, calMonth.month, day)
    return d.getDay() === 0 || d.getDay() === 6
  }

  const getCongeForDay = (empId: string, day: number) => {
    const dateStr = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    return approvedConges.find(c => c.employe_id === empId && c.date_debut <= dateStr && c.date_fin >= dateStr)
  }

  const prevMonth = () => {
    setCalMonth(p => p.month === 0 ? { year: p.year - 1, month: 11 } : { ...p, month: p.month - 1 })
  }
  const nextMonth = () => {
    setCalMonth(p => p.month === 11 ? { year: p.year + 1, month: 0 } : { ...p, month: p.month + 1 })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-[#0B0F2E] flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#4191FF]" />
            Vue calendrier equipe
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={prevMonth}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium text-[#0B0F2E] capitalize min-w-[140px] text-center">{monthName}</span>
            <Button variant="outline" size="sm" onClick={nextMonth}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex gap-3 mt-2 flex-wrap">
          {[
            { code: "AL", label: "Conge annuel", color: "bg-[#4191FF]" },
            { code: "SL", label: "Maladie", color: "bg-orange-400" },
            { code: "MAT", label: "Maternite", color: "bg-purple-500" },
            { code: "PAT", label: "Paternite", color: "bg-green-500" },
            { code: "FERIE", label: "Jour ferie", color: "bg-gray-400" },
          ].map(item => (
            <div key={item.code} className="flex items-center gap-1">
              <div className={`w-3 h-3 rounded-sm ${item.color}`} />
              <span className="text-[10px] text-gray-500">{item.label}</span>
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b">
                <th className="sticky left-0 bg-white z-10 px-3 py-2 text-left font-medium text-[#0B0F2E] min-w-[140px] border-r">
                  Employe
                </th>
                {days.map(day => {
                  const ferie = isJourFerie(day)
                  const weekend = isWeekend(day)
                  const dayName = new Date(calMonth.year, calMonth.month, day).toLocaleDateString("fr-FR", { weekday: "narrow" })
                  return (
                    <th
                      key={day}
                      className={`px-0 py-1 text-center font-normal min-w-[28px] ${ferie ? "bg-gray-200" : weekend ? "bg-gray-50" : ""}`}
                    >
                      <div className="text-[9px] text-gray-400 uppercase">{dayName}</div>
                      <div className={`text-[10px] ${ferie ? "text-gray-600 font-bold" : "text-gray-500"}`}>{day}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {filteredEmployes.length === 0 ? (
                <tr>
                  <td colSpan={daysInMonth + 1} className="text-center py-8 text-gray-500">
                    Aucun employe a afficher
                  </td>
                </tr>
              ) : (
                filteredEmployes.map(emp => (
                  <tr key={emp.id} className="border-b hover:bg-gray-50/50">
                    <td className="sticky left-0 bg-white z-10 px-3 py-1.5 font-medium text-[#0B0F2E] border-r whitespace-nowrap">
                      {emp.prenom} {emp.nom}
                    </td>
                    {days.map(day => {
                      const ferie = isJourFerie(day)
                      const weekend = isWeekend(day)
                      const conge = getCongeForDay(emp.id, day)
                      return (
                        <td
                          key={day}
                          className={`px-0 py-1.5 text-center ${ferie ? "bg-gray-200" : weekend ? "bg-gray-50" : ""}`}
                          title={conge ? `${TYPE_LABELS[conge.type_conge] || conge.type_conge}: ${formatDate(conge.date_debut)} - ${formatDate(conge.date_fin)}` : ferie ? "Jour ferie" : ""}
                        >
                          {conge ? (
                            <div className={`mx-auto w-5 h-3 rounded-sm ${CALENDAR_BAR_COLORS[conge.type_conge] || "bg-gray-400"}`} />
                          ) : ferie ? (
                            <div className="mx-auto w-5 h-3 rounded-sm bg-gray-400 opacity-40" />
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Page component ──────────────────────────────────────────────
export default function CongesPage() {
  // State
  const [tab, setTab] = useState("dashboard")
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [employes, setEmployes] = useState<any[]>([])

  // Balances tab
  const [balances, setBalances] = useState<BalanceRow[]>([])
  const [kpis, setKpis] = useState<KPIs>({ total_al_taken: 0, total_sl_taken: 0, pending_requests: 0, alerts: 0 })
  const [loadingBalances, setLoadingBalances] = useState(true)
  const [editingBalId, setEditingBalId] = useState<string | null>(null)
  const [editBalFields, setEditBalFields] = useState<{ al_droit: number; al_pris: number; sl_droit: number; sl_pris: number; date_arrivee: string }>({ al_droit: 22, al_pris: 0, sl_droit: 15, sl_pris: 0, date_arrivee: "" })
  const [savingBal, setSavingBal] = useState(false)

  // Demandes tab
  const [conges, setConges] = useState<CongeRecord[]>([])
  const [loadingConges, setLoadingConges] = useState(true)

  // Absents today tab
  const [absentsAvecConge, setAbsentsAvecConge] = useState<any[]>([])
  const [employesSansConge, setEmployesSansConge] = useState<any[]>([])
  const [loadingAbsents, setLoadingAbsents] = useState(true)

  // Historique tab
  const [allConges, setAllConges] = useState<CongeRecord[]>([])
  const [loadingHisto, setLoadingHisto] = useState(true)
  const [histoFilter, setHistoFilter] = useState("all")

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<{
    employe_id: string
    type_conge: string
    date_debut: string
    date_fin: string
    motif: string
    demi_journee: boolean
    matin_ou_apres_midi: 'matin' | 'apres_midi'
  }>({
    employe_id: "", type_conge: "AL", date_debut: "", date_fin: "", motif: "",
    demi_journee: false, matin_ou_apres_midi: 'matin',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [refusDialog, setRefusDialog] = useState<string | null>(null)
  const [refusMotif, setRefusMotif] = useState("")
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Calendar tab
  const [calendarConges, setCalendarConges] = useState<CongeRecord[]>([])
  const [loadingCalendar, setLoadingCalendar] = useState(true)

  // Certificate upload dialog
  const [certDialog, setCertDialog] = useState<CongeRecord | null>(null)

  // Search
  const [searchBal, setSearchBal] = useState("")
  const [searchHisto, setSearchHisto] = useState("")

  // ─── Data fetching ─────────────────────────────────────────────
  const socParam = societe !== "all" ? `societe_id=${societe}` : ""

  const loadSocietes = useCallback(async () => {
    try {
      const res = await fetch("/api/comptable/societes")
      const data = await res.json()
      setSocietes(data.societes || [])
    } catch (e) { console.error(e) }
  }, [])

  const loadEmployes = useCallback(async () => {
    try {
      const res = await fetch(`/api/rh/employes${societe !== "all" ? `?societe_id=${societe}` : ""}`)
      const data = await res.json()
      setEmployes(data.employes || [])
    } catch (e) { console.error(e) }
  }, [societe])

  const loadBalances = useCallback(async () => {
    setLoadingBalances(true)
    try {
      const params = new URLSearchParams({ action: "balances" })
      if (societe !== "all") params.set("societe_id", societe)
      const res = await fetch(`/api/rh/conges?${params}`)
      const data = await res.json()
      setBalances(data.balances || [])
      setKpis(data.kpis || { total_al_taken: 0, total_sl_taken: 0, pending_requests: 0, alerts: 0 })
    } catch (e) { console.error(e) }
    finally { setLoadingBalances(false) }
  }, [societe])

  const startEditBal = (b: BalanceRow) => {
    setEditingBalId(b.employe_id)
    setEditBalFields({
      al_droit: b.al_droit || 22,
      al_pris: b.al_pris || 0,
      sl_droit: b.sl_droit || 15,
      sl_pris: b.sl_pris || 0,
      date_arrivee: b.date_arrivee || "",
    })
  }

  const saveEditBal = async () => {
    if (!editingBalId) return
    setSavingBal(true)
    try {
      const res = await fetch("/api/rh/conges", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "modifier_solde",
          employe_id: editingBalId,
          annee: new Date().getFullYear(),
          al_droit: editBalFields.al_droit,
          al_pris: editBalFields.al_pris,
          sl_droit: editBalFields.sl_droit,
          sl_pris: editBalFields.sl_pris,
          date_arrivee: editBalFields.date_arrivee || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || "Erreur"); return }
      setEditingBalId(null)
      loadBalances()
    } catch (e: any) { alert("Erreur: " + (e.message || "")) }
    finally { setSavingBal(false) }
  }

  const loadDemandes = useCallback(async () => {
    setLoadingConges(true)
    try {
      const params = new URLSearchParams({ statut: "en_attente" })
      if (societe !== "all") params.set("societe_id", societe)
      const res = await fetch(`/api/rh/conges?${params}`)
      const data = await res.json()
      setConges(data.conges || [])
    } catch (e) { console.error(e) }
    finally { setLoadingConges(false) }
  }, [societe])

  const loadAbsentsToday = useCallback(async () => {
    setLoadingAbsents(true)
    try {
      const params = new URLSearchParams({ action: "absents_today" })
      if (societe !== "all") params.set("societe_id", societe)
      const res = await fetch(`/api/rh/conges?${params}`)
      const data = await res.json()
      setAbsentsAvecConge(data.absents_avec_conge || [])
      setEmployesSansConge(data.employes_sans_conge || [])
    } catch (e) { console.error(e) }
    finally { setLoadingAbsents(false) }
  }, [societe])

  const loadHistorique = useCallback(async () => {
    setLoadingHisto(true)
    try {
      const params = new URLSearchParams()
      if (societe !== "all") params.set("societe_id", societe)
      const res = await fetch(`/api/rh/conges?${params}`)
      const data = await res.json()
      setAllConges(data.conges || [])
    } catch (e) { console.error(e) }
    finally { setLoadingHisto(false) }
  }, [societe])

  const loadCalendarConges = useCallback(async () => {
    setLoadingCalendar(true)
    try {
      const params = new URLSearchParams({ statut: "approuve" })
      if (societe !== "all") params.set("societe_id", societe)
      const res = await fetch(`/api/rh/conges?${params}`)
      const data = await res.json()
      setCalendarConges(data.conges || [])
    } catch (e) { console.error(e) }
    finally { setLoadingCalendar(false) }
  }, [societe])

  // Initial load
  useEffect(() => { loadSocietes() }, [loadSocietes])
  useEffect(() => { loadEmployes() }, [loadEmployes])

  // Always load balances for KPI display (needed across all tabs)
  useEffect(() => {
    loadBalances()
  }, [loadBalances])

  // Load data per tab
  useEffect(() => {
    if (tab === "demandes") loadDemandes()
    else if (tab === "absents") loadAbsentsToday()
    else if (tab === "historique") loadHistorique()
    else if (tab === "calendrier") loadCalendarConges()
  }, [tab, societe, loadDemandes, loadAbsentsToday, loadHistorique, loadCalendarConges])

  // ─── Societe map ──────────────────────────────────────────────
  const societeMap = new Map(societes.map((s: any) => [s.id, s.nom]))

  // ─── Actions ──────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.employe_id || !form.date_debut || !form.date_fin) {
      setFormError("Champs requis manquants")
      return
    }
    if (!form.demi_journee && form.date_fin < form.date_debut) {
      setFormError("La date de fin doit être après la date de début")
      return
    }
    if (form.demi_journee && !DEMI_JOURNEE_ALLOWED_TYPES.has(form.type_conge)) {
      setFormError(`Ce type de congé (${TYPE_LABELS[form.type_conge] || form.type_conge}) ne permet pas les demi-journées.`)
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      // On a half day we send the same date for debut/fin; the API
      // re-validates and sets nb_jours=0.5.
      const payload = form.demi_journee
        ? { ...form, date_fin: form.date_debut }
        : form
      const res = await fetch("/api/rh/conges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "creer", ...payload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      setDialogOpen(false)
      setForm({
        employe_id: "", type_conge: "AL", date_debut: "", date_fin: "", motif: "",
        demi_journee: false, matin_ou_apres_midi: 'matin',
      })
      // Reload current tab data
      if (tab === "dashboard") loadBalances()
      if (tab === "demandes") loadDemandes()
      if (tab === "historique") loadHistorique()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Erreur")
    } finally {
      setSaving(false)
    }
  }

  const approuver = async (id: string) => {
    setActionLoading(id)
    try {
      await fetch("/api/rh/conges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approuver", id }),
      })
      loadDemandes()
      loadBalances()
    } catch (e) { console.error(e) }
    finally { setActionLoading(null) }
  }

  const refuser = async () => {
    if (!refusDialog || !refusMotif.trim()) return
    setActionLoading(refusDialog)
    try {
      await fetch("/api/rh/conges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refuser", id: refusDialog, motif_refus: refusMotif }),
      })
      setRefusDialog(null)
      setRefusMotif("")
      loadDemandes()
      loadBalances()
    } catch (e) { console.error(e) }
    finally { setActionLoading(null) }
  }

  const sickRetroactif = async (empId: string) => {
    setActionLoading(empId)
    const today = new Date().toISOString().split("T")[0]
    try {
      await fetch("/api/rh/conges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sick_retroactif",
          employe_id: empId,
          date_debut: today,
          date_fin: today,
          motif: "Absence justifiee retroactivement (SL)",
        }),
      })
      loadAbsentsToday()
      loadBalances()
    } catch (e) { console.error(e) }
    finally { setActionLoading(null) }
  }

  const absenceInjustifiee = async (empId: string) => {
    setActionLoading(empId)
    const today = new Date().toISOString().split("T")[0]
    try {
      await fetch("/api/rh/conges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "absence_injustifiee",
          employe_id: empId,
          date_debut: today,
          date_fin: today,
          motif: "Absence injustifiee - deduction salaire",
        }),
      })
      loadAbsentsToday()
      loadBalances()
    } catch (e) { console.error(e) }
    finally { setActionLoading(null) }
  }

  // ─── Filtered data ────────────────────────────────────────────
  const filteredBalances = balances.filter(b => {
    if (!searchBal) return true
    const q = searchBal.toLowerCase()
    return `${b.prenom} ${b.nom}`.toLowerCase().includes(q) || (b.poste || "").toLowerCase().includes(q)
  })

  const filteredHisto = allConges.filter(c => {
    const matchType = histoFilter === "all" || c.type_conge === histoFilter
    const matchSearch = !searchHisto || (
      `${c.employe?.prenom || ""} ${c.employe?.nom || ""}`.toLowerCase().includes(searchHisto.toLowerCase())
    )
    return matchType && matchSearch
  })

  // ─── Leave balance summary computations ────────────────────────
  const totalAlRemaining = useMemo(() => balances.reduce((sum, b) => sum + b.al_solde, 0), [balances])
  const upcomingLeavesThisWeek = useMemo(() => {
    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay() + 1)
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)
    const startStr = startOfWeek.toISOString().split("T")[0]
    const endStr = endOfWeek.toISOString().split("T")[0]
    return allConges.filter(c =>
      c.statut === "approuve" && c.date_debut <= endStr && c.date_fin >= startStr
    )
  }, [allConges])

  // ─── Spinner component ────────────────────────────────────────
  const Spinner = () => (
    <div className="flex justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  )

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]">Absences & Conges</h1>
          <p className="text-sm text-gray-500">
            Gestion des conges - Workers&apos; Rights Act 2019 (Maurice)
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Toutes societes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les societes</SelectItem>
              {societes.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => { setDialogOpen(true); setFormError(null) }} className="bg-[#0B0F2E] text-white">
            <Plus className="w-4 h-4 mr-2" />Nouvelle demande
          </Button>
        </div>
      </div>

      {/* Leave Balance Summary */}
      <Card className="border-l-4 border-l-[#D4AF37] bg-gradient-to-r from-[#0B0F2E]/[0.02] to-transparent">
        <CardContent className="pt-5 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-full">
                <Calendar className="w-5 h-5 text-[#4191FF]" />
              </div>
              <div>
                <p className="text-xs text-gray-500">AL pris (total)</p>
                <p className="text-xl font-bold text-[#4191FF]">{kpis.total_al_taken}<span className="text-sm font-normal text-gray-400"> jours</span></p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-100 rounded-full">
                <Thermometer className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500">SL pris (total)</p>
                <p className="text-xl font-bold text-orange-600">{kpis.total_sl_taken}<span className="text-sm font-normal text-gray-400"> jours</span></p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 rounded-full">
                <Users className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">AL restants (global)</p>
                <p className="text-xl font-bold text-emerald-600">{totalAlRemaining}<span className="text-sm font-normal text-gray-400"> jours</span></p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative p-3 bg-yellow-100 rounded-full">
                <Clock className="w-5 h-5 text-yellow-600" />
                {kpis.pending_requests > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {kpis.pending_requests}
                  </span>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500">En attente</p>
                <p className="text-xl font-bold text-yellow-600">{kpis.pending_requests}<span className="text-sm font-normal text-gray-400"> demandes</span></p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 rounded-full">
                <ShieldAlert className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Alertes certificat</p>
                <p className="text-xl font-bold text-red-600">{kpis.alerts}</p>
              </div>
            </div>
          </div>
          {upcomingLeavesThisWeek.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs font-medium text-[#0B0F2E] mb-1.5">Conges cette semaine ({upcomingLeavesThisWeek.length})</p>
              <div className="flex flex-wrap gap-2">
                {upcomingLeavesThisWeek.slice(0, 8).map(c => (
                  <div key={c.id} className="flex items-center gap-1.5 bg-white border rounded-md px-2 py-1">
                    <span className={`w-2 h-2 rounded-full ${CALENDAR_BAR_COLORS[c.type_conge] || "bg-gray-400"}`} />
                    <span className="text-[11px] font-medium text-[#0B0F2E]">{c.employe?.prenom} {c.employe?.nom}</span>
                    <span className="text-[10px] text-gray-400">{formatDate(c.date_debut)} - {formatDate(c.date_fin)}</span>
                  </div>
                ))}
                {upcomingLeavesThisWeek.length > 8 && (
                  <span className="text-[10px] text-gray-400 self-center">+{upcomingLeavesThisWeek.length - 8} autres</span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="dashboard">Tableau de bord</TabsTrigger>
          <TabsTrigger value="demandes" className="relative">
            Demandes
            {kpis.pending_requests > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">
                {kpis.pending_requests}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="calendrier">
            <Calendar className="w-3.5 h-3.5 mr-1" />Vue calendrier
          </TabsTrigger>
          <TabsTrigger value="absents">Absences aujourd&apos;hui</TabsTrigger>
          <TabsTrigger value="historique">Historique</TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1: TABLEAU DE BORD ═══ */}
        <TabsContent value="dashboard">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#0B0F2E]">
                  Soldes de conges par employe - {new Date().getFullYear()}
                </CardTitle>
                <Input
                  placeholder="Rechercher un employe..."
                  value={searchBal}
                  onChange={e => setSearchBal(e.target.value)}
                  className="w-64"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                AL = Conge annuel (20j/an) | SL = Conge maladie (15j/an) | Prorata applique pour les nouveaux employes
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {loadingBalances ? <Spinner /> : filteredBalances.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  Aucun employe trouve
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">Statut</TableHead>
                        <TableHead>Employe</TableHead>
                        <TableHead>Poste</TableHead>
                        <TableHead className="text-xs">Arrivee</TableHead>
                        <TableHead className="text-center">AL Droit</TableHead>
                        <TableHead className="text-center">AL Pris</TableHead>
                        <TableHead className="text-center">AL Solde</TableHead>
                        <TableHead className="text-center">SL Droit</TableHead>
                        <TableHead className="text-center">SL Pris</TableHead>
                        <TableHead className="text-center">SL Solde</TableHead>
                        <TableHead>Alertes</TableHead>
                        <TableHead className="w-24 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBalances.map(b => {
                        const isEditing = editingBalId === b.employe_id
                        return (
                        <TableRow key={b.employe_id}>
                          <TableCell>{statusDot(b.status_color)}</TableCell>
                          <TableCell className="font-medium">{b.prenom} {b.nom}</TableCell>
                          <TableCell className="text-sm text-gray-500">{b.poste || "---"}</TableCell>
                          <TableCell className="text-xs">
                            {isEditing ? (
                              <Input type="date" className="h-7 text-xs w-32" value={editBalFields.date_arrivee}
                                onChange={e => setEditBalFields(f => ({ ...f, date_arrivee: e.target.value }))} />
                            ) : (
                              b.date_arrivee ? new Date(b.date_arrivee).toLocaleDateString("fr-FR") : "—"
                            )}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {isEditing ? (
                              <Input type="number" className="h-7 text-xs w-14 text-center" value={editBalFields.al_droit}
                                onChange={e => setEditBalFields(f => ({ ...f, al_droit: parseFloat(e.target.value) || 0 }))} />
                            ) : b.al_droit}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {isEditing ? (
                              <Input type="number" className="h-7 text-xs w-14 text-center" value={editBalFields.al_pris}
                                onChange={e => setEditBalFields(f => ({ ...f, al_pris: parseFloat(e.target.value) || 0 }))} />
                            ) : b.al_pris}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`font-semibold ${b.al_solde <= 0 ? "text-red-600" : b.al_solde <= 5 ? "text-orange-500" : "text-green-600"}`}>
                              {isEditing ? (editBalFields.al_droit - editBalFields.al_pris) : b.al_solde}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {isEditing ? (
                              <Input type="number" className="h-7 text-xs w-14 text-center" value={editBalFields.sl_droit}
                                onChange={e => setEditBalFields(f => ({ ...f, sl_droit: parseFloat(e.target.value) || 0 }))} />
                            ) : b.sl_droit}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {isEditing ? (
                              <Input type="number" className="h-7 text-xs w-14 text-center" value={editBalFields.sl_pris}
                                onChange={e => setEditBalFields(f => ({ ...f, sl_pris: parseFloat(e.target.value) || 0 }))} />
                            ) : b.sl_pris}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`font-semibold ${b.sl_solde <= 0 ? "text-red-600" : b.sl_solde <= 3 ? "text-orange-500" : "text-green-600"}`}>
                              {isEditing ? (editBalFields.sl_droit - editBalFields.sl_pris) : b.sl_solde}
                            </span>
                          </TableCell>
                          <TableCell>
                            {b.sick_cert_alert && (
                              <Badge variant="destructive" className="text-xs whitespace-nowrap">
                                <FileWarning className="w-3 h-3 mr-1" />
                                Cert. medical requis
                              </Badge>
                            )}
                            {b.al_solde <= 0 && (
                              <Badge variant="outline" className="text-xs text-red-600 border-red-300 ml-1 whitespace-nowrap">
                                AL epuise
                              </Badge>
                            )}
                            {b.sl_solde <= 0 && (
                              <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 ml-1 whitespace-nowrap">
                                SL epuise
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isEditing ? (
                              <div className="flex gap-1 justify-end">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600" onClick={saveEditBal} disabled={savingBal}>
                                  {savingBal ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-500" onClick={() => setEditingBalId(null)}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ) : (
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEditBal(b)}>
                                <Pencil className="w-3 h-3" />
                              </Button>
                            )}
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
        </TabsContent>

        {/* ═══ TAB 2: DEMANDES EN ATTENTE ═══ */}
        <TabsContent value="demandes">
          <Card>
            <CardHeader>
              <CardTitle className="text-[#0B0F2E]">
                Demandes en attente de validation
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingConges ? <Spinner /> : conges.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  Aucune demande en attente
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employe</TableHead>
                      <TableHead>Societe</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Nb jours</TableHead>
                      <TableHead>Approbation</TableHead>
                      <TableHead>Motif</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conges.map(c => {
                      const niveau = c.niveau_approbation ?? 0
                      const needsCert = c.type_conge === "SL" && c.nb_jours > 3
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            {c.employe?.prenom} {c.employe?.nom}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {c.employe?.societe_id ? societeMap.get(c.employe.societe_id) || "---" : "---"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${TYPE_COLORS[c.type_conge] || "bg-gray-100 text-gray-800"}`}>
                                {TYPE_LABELS[c.type_conge] || c.type_conge}
                              </span>
                              {c.demi_journee && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                                  {c.matin_ou_apres_midi === 'apres_midi' ? '½ PM' : '½ AM'}
                                </span>
                              )}
                              {c.impose_par_societe && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200" title="Imposé par la société">
                                  Imposé
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {c.demi_journee
                              ? formatDate(c.date_debut)
                              : <>{formatDate(c.date_debut)} &rarr; {formatDate(c.date_fin)}</>}
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold">{c.nb_jours}j</span>
                          </TableCell>
                          <TableCell>
                            <ApprovalSteps niveau={niveau} approvals={c.approuve_par} />
                          </TableCell>
                          <TableCell className="text-sm text-gray-500 max-w-40">
                            <div className="truncate">{c.motif || "---"}</div>
                            {needsCert && (
                              <div className="mt-1.5">
                                {c.certificat_url ? (
                                  <div className="flex items-center gap-1 text-green-600">
                                    <CheckCircle className="w-3 h-3" />
                                    <a href={c.certificat_url} target="_blank" rel="noopener noreferrer" className="text-[10px] underline">Certificat joint</a>
                                  </div>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 text-[10px] text-orange-600 border-orange-300"
                                    onClick={() => setCertDialog(c)}
                                  >
                                    <Upload className="w-3 h-3 mr-1" />Certificat requis
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-green-600 h-8"
                                disabled={actionLoading === c.id}
                                onClick={() => approuver(c.id)}
                              >
                                {actionLoading === c.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                ) : (
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                )}
                                Approuver
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 h-8"
                                onClick={() => { setRefusDialog(c.id); setRefusMotif("") }}
                              >
                                <XCircle className="w-4 h-4 mr-1" />Refuser
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: CALENDRIER EQUIPE ═══ */}
        <TabsContent value="calendrier">
          {loadingCalendar ? <Spinner /> : (
            <TeamCalendarView
              conges={calendarConges}
              employes={employes.map((e: any) => ({ id: e.id, nom: e.nom, prenom: e.prenom, societe_id: e.societe_id }))}
              societeFilter={societe}
            />
          )}
        </TabsContent>

        {/* ═══ TAB 3: ABSENCES AUJOURD'HUI ═══ */}
        <TabsContent value="absents">
          <div className="space-y-4">
            {/* Employees on approved leave today */}
            <Card>
              <CardHeader>
                <CardTitle className="text-[#0B0F2E] flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-500" />
                  En conge aujourd&apos;hui ({new Date().toLocaleDateString("fr-FR")})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loadingAbsents ? <Spinner /> : absentsAvecConge.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    Aucun employe en conge aujourd&apos;hui
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employe</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Periode</TableHead>
                        <TableHead>Motif</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {absentsAvecConge.map((c: any) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            {c.employe?.prenom} {c.employe?.nom}
                          </TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${TYPE_COLORS[c.type_conge] || ""}`}>
                              {TYPE_LABELS[c.type_conge] || c.type_conge}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(c.date_debut)} &rarr; {formatDate(c.date_fin)}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">{c.motif || "---"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Employees with no leave (potential unplanned absences) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-[#0B0F2E] flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  Employes sans conge approuve ({employesSansConge.length})
                </CardTitle>
                <p className="text-xs text-gray-400">
                  Utilisez les actions pour justifier ou marquer les absences non planifiees
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {loadingAbsents ? <Spinner /> : employesSansConge.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    Tous les employes sont en conge approuve
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employe</TableHead>
                        <TableHead>Poste</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employesSansConge.map((emp: any) => (
                        <TableRow key={emp.id}>
                          <TableCell className="font-medium">{emp.prenom} {emp.nom}</TableCell>
                          <TableCell className="text-sm text-gray-500">{emp.poste || "---"}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={actionLoading === emp.id}
                                onClick={() => sickRetroactif(emp.id)}
                              >
                                {actionLoading === emp.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                ) : (
                                  <Thermometer className="w-3 h-3 mr-1" />
                                )}
                                Creer SL retroactif
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-red-600 border-red-300"
                                disabled={actionLoading === emp.id}
                                onClick={() => absenceInjustifiee(emp.id)}
                              >
                                {actionLoading === emp.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                ) : (
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                )}
                                Absence injustifiee
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ TAB 4: HISTORIQUE ═══ */}
        <TabsContent value="historique">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-[#0B0F2E]">Historique des conges</CardTitle>
                <div className="flex gap-2">
                  <Input
                    placeholder="Rechercher..."
                    value={searchHisto}
                    onChange={e => setSearchHisto(e.target.value)}
                    className="w-48"
                  />
                  <Select value={histoFilter} onValueChange={setHistoFilter}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Filtrer par type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les types</SelectItem>
                      {Object.entries(TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingHisto ? <Spinner /> : filteredHisto.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  Aucun enregistrement
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employe</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Nb jours</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Approbation</TableHead>
                        <TableHead>Motif</TableHead>
                        <TableHead>Commentaire</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHisto.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            {c.employe?.prenom} {c.employe?.nom}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${TYPE_COLORS[c.type_conge] || "bg-gray-100 text-gray-800"}`}>
                                {TYPE_LABELS[c.type_conge] || c.type_conge}
                              </span>
                              {c.demi_journee && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                                  {c.matin_ou_apres_midi === 'apres_midi' ? '½ PM' : '½ AM'}
                                </span>
                              )}
                              {c.impose_par_societe && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200" title="Imposé par la société">
                                  Imposé
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {c.demi_journee
                              ? formatDate(c.date_debut)
                              : <>{formatDate(c.date_debut)} &rarr; {formatDate(c.date_fin)}</>}
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold">{c.nb_jours}j</span>
                          </TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUT_COLORS[c.statut] || ""}`}>
                              {STATUT_LABELS[c.statut] || c.statut}
                            </span>
                          </TableCell>
                          <TableCell>
                            <ApprovalSteps niveau={c.niveau_approbation ?? (c.statut === "approuve" ? 3 : c.statut === "refuse" ? 0 : 0)} approvals={c.approuve_par} />
                          </TableCell>
                          <TableCell className="text-sm text-gray-500 max-w-32 truncate">
                            {c.motif || "---"}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500 max-w-32 truncate">
                            {c.commentaire_manager || "---"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══ DIALOG: Nouvelle demande ═══ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouvelle demande de conge</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-600">{formError}</p>
              </div>
            )}
            <div>
              <Label>Employe *</Label>
              <Select value={form.employe_id} onValueChange={v => setForm(f => ({ ...f, employe_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Choisir un employe..." /></SelectTrigger>
                <SelectContent>
                  {employes.map((e: any) => {
                    const socName = societeMap.get(e.societe_id)
                    return (
                      <SelectItem key={e.id} value={e.id}>
                        {e.prenom} {e.nom}{socName ? ` (${socName})` : ""}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type de conge *</Label>
              <Select value={form.type_conge} onValueChange={v => setForm(f => ({ ...f, type_conge: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400 mt-1">
                {form.type_conge === "AL" && "Conge annuel: 20 jours ouvrables/an (prorata si embauche en cours d'annee)"}
                {form.type_conge === "SL" && "Conge maladie: 15 jours ouvrables/an. Certificat medical requis si > 3 jours consecutifs"}
                {form.type_conge === "MAT" && "Maternite: 14 semaines (98 jours calendaires). Reserves aux femmes."}
                {form.type_conge === "PAT" && "Paternite: 5 jours ouvrables. Reserves aux hommes."}
              </p>
            </div>

            {/* Demi-journée — only offered for leave types where it makes sense */}
            {DEMI_JOURNEE_ALLOWED_TYPES.has(form.type_conge) && (
              <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="demi-journee-toggle"
                    checked={form.demi_journee}
                    onCheckedChange={(checked) => setForm(f => ({
                      ...f,
                      demi_journee: checked === true,
                      // When toggling ON: collapse the range to a single day.
                      // When toggling OFF: keep whatever the user had.
                      date_fin: checked === true ? (f.date_debut || f.date_fin) : f.date_fin,
                    }))}
                  />
                  <Label htmlFor="demi-journee-toggle" className="cursor-pointer text-sm font-medium">
                    Demi-journée (0,5 jour)
                  </Label>
                </div>
                {form.demi_journee && (
                  <div className="pl-6">
                    <Label className="text-xs text-gray-600">Moment de la journée</Label>
                    <RadioGroup
                      value={form.matin_ou_apres_midi}
                      onValueChange={(v: string) => setForm(f => ({
                        ...f,
                        matin_ou_apres_midi: (v === 'apres_midi' ? 'apres_midi' : 'matin') as 'matin' | 'apres_midi',
                      }))}
                      className="flex gap-6 mt-1"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="matin" id="demi-matin" />
                        <Label htmlFor="demi-matin" className="cursor-pointer text-sm">Matin (AM)</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="apres_midi" id="demi-apresmidi" />
                        <Label htmlFor="demi-apresmidi" className="cursor-pointer text-sm">Après-midi (PM)</Label>
                      </div>
                    </RadioGroup>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date debut *</Label>
                <Input
                  type="date"
                  value={form.date_debut}
                  onChange={e => setForm(f => ({
                    ...f,
                    date_debut: e.target.value,
                    // Half day: keep date_fin aligned with date_debut.
                    date_fin: f.demi_journee ? e.target.value : f.date_fin,
                  }))}
                />
              </div>
              <div>
                <Label>Date fin *</Label>
                <Input
                  type="date"
                  value={form.demi_journee ? form.date_debut : form.date_fin}
                  disabled={form.demi_journee}
                  onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))}
                />
                {form.demi_journee && (
                  <p className="text-[10px] text-gray-500 mt-1">Désactivé pour une demi-journée (même date que le début).</p>
                )}
              </div>
            </div>
            <div>
              <Label>Motif</Label>
              <Input
                value={form.motif}
                onChange={e => setForm(f => ({ ...f, motif: e.target.value }))}
                placeholder="Raison du conge (optionnel)"
              />
            </div>
            {form.type_conge === "SL" && form.date_debut && form.date_fin && (() => {
              const start = new Date(form.date_debut)
              const end = new Date(form.date_fin)
              const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
              if (diffDays > 3) {
                return (
                  <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <FileWarning className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-medium text-orange-800">Certificat medical requis</span>
                    </div>
                    <p className="text-xs text-orange-600">
                      Un conge maladie de plus de 3 jours ({diffDays}j) necessite un certificat medical.
                      Vous pourrez le telecharger apres la creation de la demande.
                    </p>
                  </div>
                )
              }
              return null
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-[#0B0F2E] text-white">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Soumettre la demande
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ DIALOG: Certificat medical upload ═══ */}
      <Dialog open={!!certDialog} onOpenChange={open => { if (!open) setCertDialog(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileWarning className="w-5 h-5 text-orange-500" />
              Certificat medical - SL &gt; 3 jours
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {certDialog && (
              <div className="space-y-3">
                <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                  <p className="text-sm text-orange-800">
                    <strong>{certDialog.employe?.prenom} {certDialog.employe?.nom}</strong> - {certDialog.nb_jours} jours de conge maladie
                  </p>
                  <p className="text-xs text-orange-600 mt-1">
                    {formatDate(certDialog.date_debut)} &rarr; {formatDate(certDialog.date_fin)}
                  </p>
                </div>
                <CertificatUploadZone
                  congeId={certDialog.id}
                  existingUrl={certDialog.certificat_url}
                  onUploaded={() => { setCertDialog(null); loadDemandes() }}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCertDialog(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ DIALOG: Refus avec motif ═══ */}
      <Dialog open={!!refusDialog} onOpenChange={open => { if (!open) setRefusDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser la demande</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label>Motif de refus *</Label>
            <Textarea
              value={refusMotif}
              onChange={e => setRefusMotif(e.target.value)}
              placeholder="Ex: Pas assez d'effectif ce jour, periode bloquee..."
              className="mt-1"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefusDialog(null)}>Annuler</Button>
            <Button
              onClick={refuser}
              disabled={!refusMotif.trim() || !!actionLoading}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <XCircle className="w-4 h-4 mr-2" />Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
