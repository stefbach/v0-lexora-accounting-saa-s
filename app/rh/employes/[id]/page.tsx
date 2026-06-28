"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { use } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { notifySuccess, notifyError, notifyWarning } from "@/lib/utils/toast"
import {
  ArrowLeft, Save, Loader2, User, FileText, CalendarDays, Clock,
  Briefcase, CreditCard, Gift, FolderOpen, History, Shield,
  CheckCircle2, XCircle, AlertCircle, Upload, Download, Camera,
  Phone, MapPin, Building2, Hash, CircleDot, KeyRound, Mail
} from "lucide-react"
import { BANQUES_MAURITIUS } from "@/lib/rh/banques-mauritius"
import { createClient } from "@/lib/supabase/client"
import { ProtectionLegalePanel } from "./_components/ProtectionLegalePanel"
import { DocumentsTabRH } from "./_components/DocumentsTabRH"
import { t, getLocale } from "@/lib/i18n"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n)
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "--"
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
}
function initials(nom: string, prenom: string) {
  return `${(prenom?.[0] || "").toUpperCase()}${(nom?.[0] || "").toUpperCase()}`
}
function dateVal(d: string | null | undefined) { return d?.split("T")[0] || "" }
function anciennete(dateArrivee: string | null | undefined) {
  if (!dateArrivee) return null
  const d = new Date(dateArrivee)
  const now = new Date()
  const years = now.getFullYear() - d.getFullYear()
  const months = now.getMonth() - d.getMonth()
  const totalMonths = years * 12 + months
  if (totalMonths < 12) return `${totalMonths} mois`
  const y = Math.floor(totalMonths / 12)
  const m = totalMonths % 12
  return m > 0 ? `${y} an${y > 1 ? "s" : ""} ${m} mois` : `${y} an${y > 1 ? "s" : ""}`
}

const ROLES = ["salarie", "manager", "rh", "admin", "direction"]
const DEVISES = ["MUR", "EUR", "USD", "GBP"]
const GENDERS = [{ v: "M", l: "Masculin" }, { v: "F", l: "Feminin" }]
const CONTRACT_TYPES = [
  { v: "cdi", l: "CDI" }, { v: "cdd", l: "CDD" },
  { v: "interim", l: "Intérim" }, { v: "consultant", l: "Consultant" },
]
const LANGUES = [{ v: "FR", l: "Français" }, { v: "EN", l: "English" }]
const MARITAL = ["Celibataire", "Marie(e)", "Divorce(e)", "Veuf/Veuve"]
const EDUCATION = ["Primaire", "Secondaire", "HSC", "Diplome", "Licence", "Master", "Doctorat", "Autre"]
const DAYS = [
  { k: "mon", l: "Lun" }, { k: "tue", l: "Mar" }, { k: "wed", l: "Mer" },
  { k: "thu", l: "Jeu" }, { k: "fri", l: "Ven" }, { k: "sat", l: "Sam" }, { k: "sun", l: "Dim" },
]

// Lookups : valeur FR (= value stockée) → libellé traduit.
const MARITAL_KEYS: Record<string, string> = {
  "Celibataire": "sarh.empd.marital_celibataire",
  "Marie(e)": "sarh.empd.marital_marie",
  "Divorce(e)": "sarh.empd.marital_divorce",
  "Veuf/Veuve": "sarh.empd.marital_veuf",
}
function maritalLabel(m: string, locale: any) {
  const k = MARITAL_KEYS[m]
  return k ? t(k, locale) : m
}
const EDUCATION_KEYS: Record<string, string> = {
  "Primaire": "sarh.empd.edu_primaire",
  "Secondaire": "sarh.empd.edu_secondaire",
  "HSC": "sarh.empd.edu_hsc",
  "Diplome": "sarh.empd.edu_diplome",
  "Licence": "sarh.empd.edu_licence",
  "Master": "sarh.empd.edu_master",
  "Doctorat": "sarh.empd.edu_doctorat",
  "Autre": "sarh.empd.edu_autre",
}
function educationLabel(e: string, locale: any) {
  const k = EDUCATION_KEYS[e]
  return k ? t(k, locale) : e
}

export default function EmployeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const locale = getLocale()
  const { id } = use(params)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [employe, setEmploye] = useState<any>(null)
  // G7 — role de l'utilisateur connecte (pour afficher le panneau ProtectionLegale)
  const [userRole, setUserRole] = useState<string>("")
  const [form, setForm] = useState<any>(null)
  const [bulletins, setBulletins] = useState<any[]>([])
  const [conges, setConges] = useState<any[]>([])
  const [soldes, setSoldes] = useState<any[]>([])
  const [pointages, setPointages] = useState<any[]>([])
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()))
  const [pointageMois, setPointageMois] = useState(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  )
  const [documents, setDocuments] = useState<any[]>([])
  // Shifts disponibles pour cette société (source : societes.shifts_planning JSONB)
  // Permet de choisir un shift par défaut pour cet employé (ETAPE 2).
  const [societeShifts, setSocieteShifts] = useState<Array<{ id: string; label: string; code?: string; debut?: string | null; fin?: string | null }>>([])
  const photoInputRef = useRef<HTMLInputElement>(null)

  // ─── Compte utilisateur (Auth + envoi credentials) ─────────────────
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [accountPwd, setAccountPwd] = useState("")
  const [accountPwd2, setAccountPwd2] = useState("")
  const [accountSubmitting, setAccountSubmitting] = useState(false)
  const accountRoleAllowed = ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin']
    .includes(String(userRole || '').toLowerCase())

  const handleSubmitAccount = async () => {
    if (!employe?.id) return
    if (accountPwd.length < 8) {
      notifyError(t('sarh.empd.password', locale), t('sarh.empd.password_min8', locale))
      return
    }
    if (accountPwd !== accountPwd2) {
      notifyError(t('sarh.empd.password', locale), t('sarh.empd.password_confirm_mismatch', locale))
      return
    }
    setAccountSubmitting(true)
    try {
      const isReset = !!employe.auth_user_id
      const url = isReset
        ? `/api/rh/employes/${employe.id}/reset-credentials`
        : `/api/rh/employes/${employe.id}/create-account`
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: accountPwd }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        notifyError(t('sarh.empd.save', locale), data.error || t('sarh.empd.unknown_error', locale))
        return
      }
      if (data.email_sent === false) {
        const smtpErr = data.email_error || t('sarh.empd.smtp_error', locale)
        notifyWarning(
          (isReset
            ? t('sarh.empd.account_reset_email_failed', locale)
            : t('sarh.empd.account_created_email_failed', locale)
          ).replace('{error}', smtpErr),
        )
      } else {
        notifySuccess(
          (isReset
            ? t('sarh.empd.account_reset_email_sent', locale)
            : t('sarh.empd.account_created_email_sent', locale)
          ).replace('{email}', String(employe.email)),
        )
      }
      setAccountDialogOpen(false)
      setAccountPwd("")
      setAccountPwd2("")
      // Refresh employe pour récupérer auth_user_id si création.
      if (!isReset && data.auth_user_id) {
        setEmploye((prev: any) => prev ? { ...prev, auth_user_id: data.auth_user_id } : prev)
      }
    } catch (e) {
      notifyError(t('sarh.empd.network_error', locale), e)
    } finally {
      setAccountSubmitting(false)
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append("photo", file)
    try {
      const res = await fetch(`/api/rh/employes/${id}/photo`, { method: "POST", body: fd })
      if (res.ok) {
        const data = await res.json()
        setEmploye((prev: any) => ({ ...prev, photo_url: data.photo_url }))
        setForm((prev: any) => ({ ...prev, photo_url: data.photo_url }))
      }
    } catch { /* noop */ }
  }

  const load = useCallback(async (y?: string, pm?: string) => {
    setLoading(true)
    try {
      const qp = new URLSearchParams()
      if (y) qp.set("year", y)
      if (pm) qp.set("pointage_mois", pm)
      const res = await fetch(`/api/rh/employes/${id}?${qp}`)
      if (!res.ok) throw new Error(t('sarh.empd.not_found', locale))
      const data = await res.json()
      setEmploye(data.employe)
      setForm((prev: any) => prev ? { ...prev } : { ...data.employe })
      setBulletins(data.bulletins || [])
      setConges(data.conges || [])
      setSoldes(data.soldes || [])
      setPointages(data.pointages || [])
      setDocuments(data.documents || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load(yearFilter, pointageMois) }, [load, yearFilter, pointageMois])

  // G7 — charger le role de l'utilisateur connecte pour ProtectionLegalePanel
  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      sb.from('profiles').select('role').eq('id', user.id).maybeSingle()
        .then(({ data }) => { if (data?.role) setUserRole(String(data.role)) })
    })
  }, [])

  // On first load, set form from employe
  useEffect(() => {
    if (employe && !form) setForm({ ...employe })
  }, [employe, form])

  // Charger les shifts de la société (pour le selecteur "Shift par défaut").
  // Source : societes.shifts_planning (JSONB), exposée via
  // GET /api/rh/planning/regles?societe_id=…
  useEffect(() => {
    const sid = employe?.societe_id
    if (!sid) { setSocieteShifts([]); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/rh/planning/regles?societe_id=${sid}`)
        if (!res.ok) return
        const data = await res.json()
        const shifts = Array.isArray(data?.shifts_planning) ? data.shifts_planning : []
        if (cancelled) return
        setSocieteShifts(shifts.map((s: any) => ({
          id: String(s.id),
          label: s.label || s.nom || s.code || 'Shift',
          code: s.code,
          debut: s.debut ?? s.heure_debut ?? null,
          fin: s.fin ?? s.heure_fin ?? null,
        })))
      } catch {
        if (!cancelled) setSocieteShifts([])
      }
    })()
    return () => { cancelled = true }
  }, [employe?.societe_id])

  const handleSave = async () => {
    if (!form) return
    setSaving(true); setSaved(false); setError(null)
    try {
      const body = { ...form }
      delete body.id; delete body.created_at; delete body.actif; delete body.code
      // Parse numerics
      for (const k of ["salaire_base", "transport_allowance", "petrol_allowance", "phone_allowance",
        "edf_total_deduction", "daily_bus_fare", "prime_trimestrielle",
        "prime_fixe_1", "prime_fixe_2", "prime_fixe_3"]) {
        if (body[k] !== undefined) body[k] = parseFloat(body[k]) || 0
      }
      const res = await fetch(`/api/rh/employes/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      const data = await res.json()
      setEmploye(data.employe)
      setForm({ ...data.employe })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  const u = (field: string, value: any) => setForm((f: any) => ({ ...f, [field]: value }))
  const uwd = (day: string, val: boolean) => {
    setForm((f: any) => ({ ...f, working_days: { ...(f.working_days || {}), [day]: val } }))
  }

  if (loading && !employe) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-[#0B0F2E]" /></div>
  }
  if (error && !employe) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" onClick={() => router.push("/rh/employes")} className="text-[#0B0F2E]">
          <ArrowLeft className="w-4 h-4 mr-2" />{t('rha.a.empd.back', locale)}
        </Button>
        <Card><CardContent className="py-12 text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-red-400 mb-3" />
          <p className="text-red-600">{error}</p>
        </CardContent></Card>
      </div>
    )
  }
  if (!form) return null

  const triggerCls = "data-[state=active]:bg-[#0B0F2E] data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:bg-white data-[state=inactive]:text-gray-500 data-[state=inactive]:hover:bg-[#4191FF]/10 data-[state=inactive]:hover:text-[#4191FF] rounded-full px-4 py-2 text-xs font-medium transition-all duration-200"
  const totalHeures = pointages.reduce((s: number, p: any) => s + (p.heures_travaillees || 0), 0)
  const totalOT = pointages.reduce((s: number, p: any) => s + (p.heures_supplementaires || 0), 0)
  const joursAbsence = pointages.filter((p: any) => p.statut === "absent").length
  const joursPresent = pointages.filter((p: any) => p.statut === "present").length
  const congeStatus = (s: string) => {
    const m: Record<string, string> = { approuve: "bg-green-100 text-green-800", en_attente: "bg-amber-100 text-amber-800", refuse: "bg-red-100 text-red-800" }
    return <Badge className={`${m[s] || "bg-gray-100 text-gray-700"} border-0`}>{s}</Badge>
  }
  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i))

  const SaveBtn = () => (
    <div className="flex items-center gap-3 justify-end pt-2">
      {saved && <span className="text-green-600 text-sm flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />{t('sarh.empd.saved', locale)}</span>}
      {error && <span className="text-red-600 text-sm">{error}</span>}
      <Button onClick={handleSave} disabled={saving} className="bg-[#0B0F2E] hover:bg-[#0B0F2E]/90 text-white px-8">
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}{t('sarh.empd.save_btn', locale)}
      </Button>
    </div>
  )

  const Field = ({ label, field, type = "text", disabled = false, placeholder = "" }: any) => {
    const fieldId = `emp-${field}`
    return (
      <div>
        <Label className="text-xs text-gray-500 mb-1" htmlFor={fieldId}>{label}</Label>
        <Input
          id={fieldId}
          key={`${field}-${employe?.id}`}
          type={type}
          defaultValue={type === "date" ? dateVal(form[field]) : (form[field] ?? "")}
          onBlur={e => u(field, e.target.value)}
          onChange={type === "date" ? (e => u(field, e.target.value)) : undefined}
          disabled={disabled}
          className={`h-11 ${disabled ? "bg-gray-50" : ""}`}
          placeholder={placeholder}
          aria-label={label}
        />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-[#0B0F2E] via-[#0B0F2E]/95 to-[#4191FF]/80 p-6 shadow-sm">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA1KSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIiBmaWxsPSJ1cmwoI2cpIi8+PC9zdmc+')] opacity-40" />
        <div className="relative flex items-center gap-5">
          <Button aria-label={t('sarh.empd.aria_back_to_employees', locale)} variant="ghost" size="icon" onClick={() => router.push("/rh/employes")} className="text-white/80 hover:bg-white/10 hover:text-white shrink-0">
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </Button>
          <div
            className="relative group shrink-0 cursor-pointer"
            onClick={() => photoInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label={t('sarh.empd.aria_edit_photo', locale)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); photoInputRef.current?.click() } }}
          >
            {employe.photo_url ? (
              <img src={employe.photo_url} alt={`${employe.prenom} ${employe.nom}`} className="rounded-full object-cover w-20 h-20 ring-4 ring-white/20 shadow-lg" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#4191FF] flex items-center justify-center text-white text-2xl font-bold ring-4 ring-white/20 shadow-lg">
                {initials(employe.nom, employe.prenom)}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="w-6 h-6 text-white" />
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} aria-label={t('sarh.empd.aria_photo_input', locale)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Poppins', sans-serif" }}>{employe.prenom} {employe.nom}</h1>
              {(() => {
                const statut = employe.statut_enrichi || (employe.actif ? "actif" : "parti")
                const statusMap: Record<string, { cls: string; label: string; icon: typeof CheckCircle2 }> = {
                  actif: { cls: "bg-green-400/20 text-green-300 border-green-400/30", label: t('sarh.empd.status_actif', locale), icon: CheckCircle2 },
                  suspendu: { cls: "bg-orange-400/20 text-orange-300 border-orange-400/30", label: t('sarh.empd.status_suspendu', locale), icon: AlertCircle },
                  preavis: { cls: "bg-blue-400/20 text-blue-300 border-blue-400/30", label: t('sarh.empd.status_preavis', locale), icon: Clock },
                  parti: { cls: "bg-red-400/20 text-red-300 border-red-400/30", label: t('sarh.empd.status_parti', locale), icon: XCircle },
                  periode_essai: { cls: "bg-purple-400/20 text-purple-300 border-purple-400/30", label: t('sarh.empd.status_periode_essai', locale), icon: CircleDot },
                }
                const s = statusMap[statut] || statusMap.actif
                const Icon = s.icon
                return (
                  <Badge className={`${s.cls} border px-3 py-1 text-sm font-medium`}>
                    <Icon className="w-3.5 h-3.5 mr-1.5" />
                    {s.label}
                    {statut === "periode_essai" && employe.date_fin_periode_essai && (
                      <span className="ml-1 text-[10px] opacity-75">→ {fmtDate(employe.date_fin_periode_essai)}</span>
                    )}
                  </Badge>
                )
              })()}
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {employe.code && (
                <span className="inline-flex items-center gap-1.5 font-mono bg-white/10 text-white/80 px-3 py-1 rounded-full text-xs border border-white/10">
                  <Hash className="w-3 h-3" />{employe.code}
                </span>
              )}
              {employe.poste && (
                <span className="inline-flex items-center gap-1.5 bg-white/10 text-white/80 px-3 py-1 rounded-full text-xs border border-white/10">
                  <Briefcase className="w-3 h-3" />{employe.poste}
                </span>
              )}
              {employe.departement && (
                <span className="inline-flex items-center gap-1.5 bg-white/10 text-white/80 px-3 py-1 rounded-full text-xs border border-white/10">
                  <Building2 className="w-3 h-3" />{employe.departement}
                </span>
              )}
              {employe.date_arrivee && (
                <span className="inline-flex items-center gap-1.5 bg-[#D4AF37]/20 text-[#D4AF37] px-3 py-1 rounded-full text-xs border border-[#D4AF37]/20">
                  <CalendarDays className="w-3 h-3" />{anciennete(employe.date_arrivee)}
                </span>
              )}
              {/* G3 — Statut WRA 2019 S.2 (computed depuis salaire_base) */}
              {employe.statut_wra === 'worker' ? (
                <span
                  className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-100 px-3 py-1 rounded-full text-xs border border-emerald-300/30"
                  title={t('sarh.empd.wra_worker_title', locale)}
                >
                  {t('sarh.empd.wra_worker', locale)}
                </span>
              ) : employe.statut_wra === 'hors_wra' ? (
                <span
                  className="inline-flex items-center gap-1.5 bg-purple-500/20 text-purple-100 px-3 py-1 rounded-full text-xs border border-purple-300/30"
                  title={t('sarh.empd.wra_hors_title', locale)}
                >
                  {t('sarh.empd.wra_hors', locale)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* G7 — Protection légale WRA S.52/S.53/S.64 (visible RH + admins) */}
      <ProtectionLegalePanel
        employe={{
          id: employe.id,
          prenom: employe.prenom,
          nom: employe.nom,
          genre: employe.genre,
          gender: employe.gender,
          date_arrivee: employe.date_arrivee,
        }}
        canManage={['admin', 'super_admin', 'rh', 'rh_manager'].includes(String(userRole || '').toLowerCase())}
      />

      {/* 9 Tabs */}
      <Tabs defaultValue="personnel" className="space-y-6">
        <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
          <TabsList className="bg-gray-100/80 backdrop-blur-sm flex-nowrap h-auto gap-1.5 p-1.5 rounded-full border border-gray-200/50 w-max">
            <TabsTrigger value="personnel" className={triggerCls}><User className="w-4 h-4 mr-1.5" />{t('sarh.empd.tab_personnel', locale)}</TabsTrigger>
            <TabsTrigger value="emploi" className={triggerCls}><Briefcase className="w-4 h-4 mr-1.5" />{t('sarh.empd.tab_emploi', locale)}</TabsTrigger>
            <TabsTrigger value="salaire" className={triggerCls}><CreditCard className="w-4 h-4 mr-1.5" />{t('sarh.empd.tab_salaire', locale)}</TabsTrigger>
            <TabsTrigger value="avantages" className={triggerCls}><Gift className="w-4 h-4 mr-1.5" />{t('sarh.empd.tab_avantages', locale)}</TabsTrigger>
            <TabsTrigger value="conges" className={triggerCls}><CalendarDays className="w-4 h-4 mr-1.5" />{t('sarh.empd.tab_conges', locale)}</TabsTrigger>
            <TabsTrigger value="bulletins" className={triggerCls}><FileText className="w-4 h-4 mr-1.5" />{t('sarh.empd.tab_bulletins', locale)}</TabsTrigger>
            <TabsTrigger value="pointage" className={triggerCls}><Clock className="w-4 h-4 mr-1.5" />{t('sarh.empd.tab_pointage', locale)}</TabsTrigger>
            <TabsTrigger value="documents" className={triggerCls}><FolderOpen className="w-4 h-4 mr-1.5" />{t('sarh.empd.tab_documents', locale)}</TabsTrigger>
            <TabsTrigger value="historique" className={triggerCls}><History className="w-4 h-4 mr-1.5" />{t('sarh.empd.tab_historique', locale)}</TabsTrigger>
          </TabsList>
        </div>

        {/* ===== TAB 1: Personnel ===== */}
        <TabsContent value="personnel" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="rounded-2xl shadow-sm border-l-4 border-l-[#4191FF] bg-[#f8f9fc]">
              <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><User className="w-4 h-4 text-[#4191FF]" />{t('sarh.empd.card_identite', locale)}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-4 mb-2">
                  <div className="relative group shrink-0 cursor-pointer" onClick={() => photoInputRef.current?.click()}>
                    {form.photo_url ? (
                      <img src={form.photo_url} alt={`${form.prenom} ${form.nom}`} className="rounded-full object-cover w-20 h-20 ring-3 ring-[#4191FF]/20" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#4191FF] to-[#0B0F2E] flex items-center justify-center text-white text-2xl font-bold ring-3 ring-[#4191FF]/20">
                        {initials(form.nom, form.prenom)}
                      </div>
                    )}
                    <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <Field label={t('sarh.empd.f_nom', locale)} field="nom" />
                    <Field label={t('sarh.empd.f_prenom', locale)} field="prenom" />
                  </div>
                </div>
                <Field label={t('sarh.empd.f_common_name', locale)} field="common_name" placeholder={t('sarh.empd.ph_common_name', locale)} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="emp-nic" className="text-xs text-gray-500">NIC</Label>
                    <Input id="emp-nic" value={form.nic_number || ""} onChange={e => u("nic_number", e.target.value)} placeholder="A1234567890123" />
                  </div>
                  <div className="flex items-end gap-2">
                    <Checkbox checked={form.is_mauritian ?? true} onCheckedChange={v => u("is_mauritian", v)} id="mauritian" />
                    <Label htmlFor="mauritian" className="text-sm">{t('sarh.empd.mauritian', locale)}</Label>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500" id="emp-genre-label">{t('sarh.empd.f_genre', locale)}</Label>
                    <Select value={form.genre || form.gender || "M"} onValueChange={v => u("genre", v)}>
                      <SelectTrigger aria-labelledby="emp-genre-label" aria-label={t('sarh.empd.f_genre', locale)}><SelectValue /></SelectTrigger>
                      <SelectContent>{GENDERS.map(g => <SelectItem key={g.v} value={g.v}>{t(`sarh.empd.gender_${g.v.toLowerCase()}`, locale)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Field label={t('sarh.empd.f_date_naissance', locale)} field="date_naissance" type="date" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500" id="emp-statut-familial-label">{t('sarh.empd.f_statut_familial', locale)}</Label>
                    <Select value={form.statut_familial || ""} onValueChange={v => u("statut_familial", v)}>
                      <SelectTrigger aria-labelledby="emp-statut-familial-label" aria-label={t('sarh.empd.f_statut_familial', locale)}><SelectValue placeholder={t('sarh.empd.ph_choose', locale)} /></SelectTrigger>
                      <SelectContent>{MARITAL.map(m => <SelectItem key={m} value={m}>{maritalLabel(m, locale)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500" id="emp-education-label">{t('sarh.empd.f_education', locale)}</Label>
                    <Select value={form.education || ""} onValueChange={v => u("education", v)}>
                      <SelectTrigger aria-labelledby="emp-education-label" aria-label={t('sarh.empd.f_education', locale)}><SelectValue placeholder={t('sarh.empd.ph_choose', locale)} /></SelectTrigger>
                      <SelectContent>{EDUCATION.map(e => <SelectItem key={e} value={e}>{educationLabel(e, locale)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('sarh.empd.f_code_employe', locale)} field="code" disabled />
                  <Field label={t('sarh.empd.f_badge_no', locale)} field="badge_number" />
                </div>
                <Field label={t('sarh.empd.f_email', locale)} field="email" type="email" />
                <Field label={t('sarh.empd.f_email_personnel', locale)} field="email_personnel" type="email" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('sarh.empd.f_passport', locale)} field="passport_no" />
                  <Field label={t('sarh.empd.f_nationalite', locale)} field="nationalite" placeholder="MU" />
                </div>
                <div>
                  <Label className="text-xs text-gray-500" id="emp-langue-label">{t('sarh.empd.f_langue', locale)}</Label>
                  <Select value={form.langue_preferee || "FR"} onValueChange={v => u("langue_preferee", v)}>
                    <SelectTrigger aria-labelledby="emp-langue-label" aria-label={t('sarh.empd.f_langue', locale)}><SelectValue /></SelectTrigger>
                    <SelectContent>{LANGUES.map(l => <SelectItem key={l.v} value={l.v}>{t(`sarh.empd.langue_${l.v.toLowerCase()}`, locale)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="border-t pt-3 mt-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={form.situation_handicap ?? false} onCheckedChange={v => u("situation_handicap", v)} id="handicap" />
                    <Label htmlFor="handicap" className="text-sm">{t('sarh.empd.f_handicap', locale)}</Label>
                  </div>
                  <Field label={t('sarh.empd.f_medecin_travail', locale)} field="medecin_travail_date" type="date" />
                </div>
              </CardContent>
            </Card>

            {accountRoleAllowed && (
              <Card className="rounded-2xl shadow-sm border-l-4 border-l-indigo-500 bg-[#f8f9fc]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    <KeyRound className="w-4 h-4 text-indigo-500" />{t('sarh.empd.card_compte', locale)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {employe?.auth_user_id ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span>{t('sarh.empd.account_active', locale)}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {t('sarh.empd.account_active_desc_1', locale)} <span className="font-mono">{employe.email}</span>.
                        {' '}{t('sarh.empd.account_active_desc_2', locale)}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => { setAccountPwd(""); setAccountPwd2(""); setAccountDialogOpen(true) }}
                      >
                        <Mail className="w-4 h-4 mr-2" />
                        {t('sarh.empd.resend_credentials', locale)}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <XCircle className="w-4 h-4 text-gray-400" />
                        <span>{t('srh.emp.no_account', locale)}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {t('sarh.empd.no_account_desc', locale)}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => { setAccountPwd(""); setAccountPwd2(""); setAccountDialogOpen(true) }}
                        disabled={!employe?.email}
                        title={!employe?.email ? t('sarh.empd.fill_email_first', locale) : undefined}
                      >
                        <KeyRound className="w-4 h-4 mr-2" />
                        {t('sarh.empd.create_account', locale)}
                      </Button>
                      {!employe?.email && (
                        <p className="text-xs text-amber-600">
                          {t('sarh.empd.email_missing', locale)}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="rounded-2xl shadow-sm border-l-4 border-l-green-500 bg-[#f8f9fc]">
              <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><MapPin className="w-4 h-4 text-green-500" />{t('sarh.empd.card_contact', locale)}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label={t('sarh.empd.f_adresse', locale)} field="adresse" />
                <Field label={t('sarh.empd.f_adresse2', locale)} field="adresse2" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('sarh.empd.f_code_postal', locale)} field="code_postal" />
                  <Field label={t('sarh.empd.f_ville', locale)} field="ville" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('sarh.empd.f_mobile', locale)} field="mobile" />
                  <Field label={t('sarh.empd.f_telephone', locale)} field="telephone" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl shadow-sm border-l-4 border-l-red-400 bg-[#f8f9fc]">
            <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><AlertCircle className="w-4 h-4 text-red-400" />{t('sarh.empd.card_contact_urgence', locale)}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label={t('sarh.empd.f_contact_urgence_nom', locale)} field="contact_urgence_nom" />
                <Field label={t('sarh.empd.f_contact_urgence_tel', locale)} field="contact_urgence_tel" />
                <Field label={t('sarh.empd.f_relation', locale)} field="contact_urgence_relation" />
              </div>
            </CardContent>
          </Card>

          <SaveBtn />
        </TabsContent>

        {/* ===== TAB 2: Emploi ===== */}
        <TabsContent value="emploi" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="rounded-2xl shadow-sm border-l-4 border-l-[#4191FF] bg-[#f8f9fc]">
              <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><Briefcase className="w-4 h-4 text-[#4191FF]" />{t('sarh.empd.card_poste', locale)}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('sarh.empd.f_date_arrivee', locale)} field="date_arrivee" type="date" />
                  <Field label={t('sarh.empd.f_poste_depuis', locale)} field="date_poste_actuel" type="date" />
                </div>
                <Field label={t('sarh.empd.f_poste', locale)} field="poste" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">{t('sarh.empd.f_type_contrat', locale)}</Label>
                    <Select value={form.type_contrat || "fulltime"} onValueChange={v => u("type_contrat", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CONTRACT_TYPES.map(ct => <SelectItem key={ct.v} value={ct.v}>{t(`sarh.empd.contract_${ct.v}`, locale)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">{t('sarh.empd.f_role', locale)}</Label>
                    <Select value={form.role || "salarie"} onValueChange={v => u("role", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                {form.type_contrat === "cdd" && (
                  <Field label={t('sarh.empd.f_date_fin_contrat', locale)} field="date_fin_contrat" type="date" />
                )}
                <Field label={t('sarh.empd.f_date_fin_essai', locale)} field="date_fin_periode_essai" type="date" />
                <Field label={t('sarh.empd.f_departement', locale)} field="departement" />
                <Field label={t('sarh.empd.f_office_site', locale)} field="office_site" />
                <Field label={t('sarh.empd.f_supervisor', locale)} field="supervisor_id" placeholder={t('sarh.empd.ph_supervisor', locale)} />
                {/* Shift par défaut — option B du sprint bugs paie/conges.
                    Si renseigné, le générateur de planning utilisera ce shift
                    pour l'employé au lieu du shift standard société. */}
                <div>
                  <Label className="text-xs text-gray-500">{t('sarh.empd.f_shift', locale)}</Label>
                  <Select
                    value={form.shift_template_id ?? "__none__"}
                    onValueChange={v => u("shift_template_id", v === "__none__" ? null : v)}
                  >
                    <SelectTrigger><SelectValue placeholder={t('sarh.empd.ph_shift', locale)} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t('sarh.empd.shift_none', locale)}</SelectItem>
                      {societeShifts.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.code ? `${s.code} · ` : ""}{s.label}
                          {s.debut && s.fin ? ` (${s.debut}–${s.fin})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {t('sarh.empd.shift_hint', locale)}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-2 block">{t('sarh.empd.f_jours_travail', locale)}</Label>
                  <div className="flex gap-3 flex-wrap">
                    {DAYS.map(d => (
                      <label key={d.k} className="flex items-center gap-1.5 text-sm">
                        <Checkbox checked={form.working_days?.[d.k] ?? false} onCheckedChange={v => uwd(d.k, !!v)} />
                        {t(`sarh.empd.day_${d.k}`, locale)}
                      </label>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm border-l-4 border-l-orange-400 bg-[#f8f9fc]">
              <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base" style={{ fontFamily: "'Poppins', sans-serif" }}>{t('sarh.empd.card_depart', locale)}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label={t('sarh.empd.f_date_depart', locale)} field="date_depart" type="date" />
                <Field label={t('sarh.empd.f_type_depart', locale)} field="departure_type" placeholder={t('sarh.empd.ph_type_depart', locale)} />
                <Field label={t('sarh.empd.f_raison_depart', locale)} field="departure_reason" />
                <Field label={t('sarh.empd.f_date_suspension', locale)} field="suspension_date" type="date" />
                <Field label={t('sarh.empd.f_raison_suspension', locale)} field="suspension_reason" />
                <div>
                  <Label className="text-xs text-gray-500">{t('sarh.empd.f_notes', locale)}</Label>
                  <Textarea value={form.notes || ""} onChange={e => u("notes", e.target.value)} rows={4} />
                </div>
              </CardContent>
            </Card>
          </div>
          <SaveBtn />
        </TabsContent>

        {/* ===== TAB 3: Salaire ===== */}
        <TabsContent value="salaire" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="rounded-2xl shadow-sm border-l-4 border-l-[#D4AF37] bg-[#f8f9fc]">
              <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><CreditCard className="w-4 h-4 text-[#D4AF37]" />{t('sarh.empd.card_remuneration', locale)}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label={t('sarh.empd.f_salaire_base', locale)} field="salaire_base" type="number" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Transport allowance" field="transport_allowance" type="number" />
                  <Field label="Petrol allowance" field="petrol_allowance" type="number" />
                </div>
                <Field label="Phone allowance" field="phone_allowance" type="number" />
                <div className="border-t pt-3 mt-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">{t('sarh.empd.primes_fixes_title', locale)}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t('sarh.empd.f_prime_fixe_1_lib', locale)} field="prime_fixe_1_libelle" placeholder={t('sarh.empd.ph_prime_1', locale)} />
                    <Field label={t('sarh.empd.f_prime_fixe_1', locale)} field="prime_fixe_1" type="number" />
                    <Field label={t('sarh.empd.f_prime_fixe_2_lib', locale)} field="prime_fixe_2_libelle" placeholder={t('sarh.empd.ph_prime_2', locale)} />
                    <Field label={t('sarh.empd.f_prime_fixe_2', locale)} field="prime_fixe_2" type="number" />
                    <Field label={t('sarh.empd.f_prime_fixe_3_lib', locale)} field="prime_fixe_3_libelle" placeholder={t('sarh.empd.ph_prime_3', locale)} />
                    <Field label={t('sarh.empd.f_prime_fixe_3', locale)} field="prime_fixe_3" type="number" />
                  </div>
                </div>
                <div className="border-t pt-3 mt-3 space-y-3">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={form.nsf_csg_enabled ?? true} onCheckedChange={v => u("nsf_csg_enabled", v)} id="nsf" />
                    <Label htmlFor="nsf" className="text-sm">{t('sarh.empd.f_nsf_csg', locale)}</Label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t('sarh.empd.f_contribution_code', locale)} field="contribution_code" placeholder="S2" />
                    <div>
                      <Label className="text-xs text-gray-500" id="emp-csg-cat-label">{t('sarh.empd.f_csg_cat', locale)}</Label>
                      <Select value={form.csg_categorie || "A"} onValueChange={v => u("csg_categorie", v)}>
                        <SelectTrigger aria-labelledby="emp-csg-cat-label" aria-label={t('sarh.empd.f_csg_cat', locale)}><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="A">A</SelectItem><SelectItem value="B">B</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox checked={form.paye_enabled ?? true} onCheckedChange={v => u("paye_enabled", v)} id="paye" />
                    <Label htmlFor="paye" className="text-sm">{t('sarh.empd.f_paye', locale)}</Label>
                  </div>
                  <Field label="TAN" field="tan_number" placeholder="A123456789" />
                  <Field label={t('sarh.empd.f_edf', locale)} field="edf_total_deduction" type="number" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm border-l-4 border-l-[#4191FF] bg-[#f8f9fc]">
              <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base" style={{ fontFamily: "'Poppins', sans-serif" }}>{t('sarh.empd.card_bancaire', locale)}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3 mb-2">
                  <Checkbox checked={form.paid_by_bank_transfer ?? true} onCheckedChange={v => u("paid_by_bank_transfer", v)} id="bank" />
                  <Label htmlFor="bank" className="text-sm">{t('sarh.empd.f_virement', locale)}</Label>
                </div>
                <div>
                  <Label className="text-xs text-gray-500" id="emp-banque-label">{t('sarh.empd.f_banque', locale)}</Label>
                  <Select value={form.bank_name || ""} onValueChange={v => u("bank_name", v)}>
                    <SelectTrigger aria-labelledby="emp-banque-label" aria-label={t('sarh.empd.f_banque', locale)}><SelectValue placeholder={t('sarh.empd.ph_banque', locale)} /></SelectTrigger>
                    <SelectContent>{BANQUES_MAURITIUS.map(b => <SelectItem key={b.code} value={b.code}>{b.nom}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Field label={t('sarh.empd.f_compte_bancaire', locale)} field="bank_account" placeholder="000012345678" />
                <Field label="IBAN" field="iban" placeholder="MU17BOMM0101101030300200000MUR" />
                <div>
                  <Label className="text-xs text-gray-500" id="emp-devise-label">{t('sarh.empd.f_devise', locale)}</Label>
                  <Select value={form.devise_salaire || "MUR"} onValueChange={v => u("devise_salaire", v)}>
                    <SelectTrigger aria-labelledby="emp-devise-label" aria-label={t('sarh.empd.f_devise', locale)}><SelectValue /></SelectTrigger>
                    <SelectContent>{DEVISES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Régime fiscal & charges */}
          <Card className="rounded-2xl shadow-sm bg-[#f8f9fc]">
            <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><Shield className="w-4 h-4 text-[#0B0F2E]" />{t('sarh.empd.card_regime', locale)}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs text-gray-500">{t('sarh.empd.f_regime_fiscal', locale)}</Label>
                  <Select value={form.regime_fiscal || "standard"} onValueChange={v => {
                    u("regime_fiscal", v)
                    if (v === "expatrie" || v === "consultant") {
                      u("inclus_mra", false); u("inclus_csg", false); u("inclus_nsf", false)
                      u("inclus_paye", false); u("inclus_training_levy", false); u("inclus_prgf", false)
                    } else if (v === "standard") {
                      u("inclus_mra", true); u("inclus_csg", true); u("inclus_nsf", true)
                      u("inclus_paye", true); u("inclus_training_levy", true); u("inclus_prgf", true)
                    }
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">{t('sarh.empd.regime_standard', locale)}</SelectItem>
                      <SelectItem value="expatrie">{t('sarh.empd.regime_expatrie', locale)}</SelectItem>
                      <SelectItem value="consultant">{t('sarh.empd.regime_consultant', locale)}</SelectItem>
                      <SelectItem value="special">{t('sarh.empd.regime_special', locale)}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">{t('sarh.empd.f_pays_residence', locale)}</Label>
                  <Field label="" field="pays_residence" placeholder="MU" />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">{t('sarh.empd.f_mode_paiement', locale)}</Label>
                  <Select value={form.mode_paiement || "bulk"} onValueChange={v => u("mode_paiement", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bulk">{t('sarh.empd.mode_bulk', locale)}</SelectItem>
                      <SelectItem value="individuel">{t('sarh.empd.mode_individuel', locale)}</SelectItem>
                      <SelectItem value="especes">{t('sarh.empd.mode_especes', locale)}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(form.regime_fiscal === "special" || form.regime_fiscal === "expatrie") && (
                <div className="p-3 border rounded-lg bg-orange-50 space-y-2">
                  <p className="text-xs font-medium text-orange-800">{t('sarh.empd.charges_config', locale)}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { key: "inclus_csg", label: "CSG" },
                      { key: "inclus_nsf", label: "NSF" },
                      { key: "inclus_paye", label: "PAYE" },
                      { key: "inclus_training_levy", label: "Training Levy" },
                      { key: "inclus_prgf", label: "PRGF" },
                      { key: "inclus_yeb", label: t('sarh.empd.charge_yeb', locale) },
                    ].map(c => (
                      <div key={c.key} className="flex items-center gap-2">
                        <Checkbox checked={form[c.key] !== false} onCheckedChange={v => u(c.key, v)} id={c.key} />
                        <Label htmlFor={c.key} className="text-xs">{c.label}</Label>
                      </div>
                    ))}
                  </div>
                  <Field label={t('sarh.empd.f_motif_exemption', locale)} field="hors_charges_motif" placeholder={t('sarh.empd.ph_motif_exemption', locale)} />
                </div>
              )}

              {form.regime_fiscal === "standard" && (
                <p className="text-xs text-gray-400">{t('sarh.empd.hint_standard', locale)}</p>
              )}
              {form.regime_fiscal === "consultant" && (
                <p className="text-xs text-orange-600">{t('sarh.empd.hint_consultant', locale)}</p>
              )}

              {/* Mig 440 — pointage_exempt : à cocher pour les cadres/dirigeants
                  qui ne pointent pas. Sans ça, sur une société à pointage_actif=true
                  le code paie compte tous les jours ouvrés sans pointage comme
                  absence injustifiée. */}
              <div className="pt-3 border-t mt-3">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="pointage_exempt"
                    checked={form.pointage_exempt === true}
                    onCheckedChange={v => u("pointage_exempt", v)}
                  />
                  <div className="flex flex-col">
                    <Label htmlFor="pointage_exempt" className="text-sm font-medium cursor-pointer">
                      {t('sarh.empd.f_pointage_exempt', locale)}
                    </Label>
                    <span className="text-xs text-gray-500">
                      {t('sarh.empd.pointage_exempt_hint', locale)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* G13 — Éligibilité PRGF (Portable Retirement Gratuity Fund) */}
          <Card className="rounded-2xl shadow-sm border-l-4 border-l-amber-400 bg-[#f8f9fc]">
            <CardHeader className="pb-3">
              <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}>
                <Shield className="w-4 h-4 text-amber-500" />
                PRGF — Portable Retirement Gratuity Fund
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="prgf_eligible_toggle"
                  checked={form.inclus_prgf !== false}
                  onCheckedChange={v => {
                    u("inclus_prgf", v)
                    if (v) u("prgf_motif_exemption", null)
                  }}
                />
                <Label htmlFor="prgf_eligible_toggle" className="text-sm">{t('sarh.empd.prgf_eligible', locale)}</Label>
              </div>

              {form.inclus_prgf === false && (
                <div className="space-y-2 p-3 border rounded bg-amber-50">
                  <Label className="text-xs">{t('sarh.empd.f_prgf_motif', locale)}</Label>
                  <Select
                    value={form.prgf_motif_exemption || ""}
                    onValueChange={v => u("prgf_motif_exemption", v)}
                  >
                    <SelectTrigger><SelectValue placeholder={t('sarh.empd.ph_prgf_motif', locale)} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="salaire_au_dessus_200k">{t('sarh.empd.prgf_motif_200k', locale)}</SelectItem>
                      <SelectItem value="migrant_non_citoyen">{t('sarh.empd.prgf_motif_migrant', locale)}</SelectItem>
                      <SelectItem value="sbpf">SBPF</SelectItem>
                      <SelectItem value="sipf">SIPF</SelectItem>
                      <SelectItem value="private_pension_fsc">Private Pension Scheme FSC</SelectItem>
                      <SelectItem value="job_contractor">Job Contractor</SelectItem>
                      <SelectItem value="apprenti">{t('sarh.empd.prgf_motif_apprenti', locale)}</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.prgf_motif_exemption === "private_pension_fsc" && (
                    <div>
                      <Label className="text-xs">{t('sarh.empd.f_prgf_fsc_url', locale)}</Label>
                      <Input
                        value={form.prgf_pension_scheme_certificate_url || ""}
                        onChange={e => u("prgf_pension_scheme_certificate_url", e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{t('sarh.empd.f_prgf_date_debut', locale)}</Label>
                  <Input
                    type="date"
                    value={form.prgf_date_debut || ""}
                    onChange={e => u("prgf_date_debut", e.target.value || null)}
                  />
                </div>
                <div>
                  <Label className="text-xs">{t('sarh.empd.f_prgf_past_due', locale)}</Label>
                  <Input
                    type="number"
                    value={form.prgf_past_services_montant ?? 0}
                    onChange={e => u("prgf_past_services_montant", Number(e.target.value) || 0)}
                  />
                </div>
              </div>

              {Number(form.prgf_past_services_montant) > 0 && (
                <div className="grid md:grid-cols-2 gap-3 p-3 border rounded bg-slate-50">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="prgf_past_paid"
                      checked={form.prgf_past_services_paid === true}
                      onCheckedChange={v => u("prgf_past_services_paid", v)}
                    />
                    <Label htmlFor="prgf_past_paid" className="text-xs">{t('sarh.empd.f_prgf_past_paid', locale)}</Label>
                  </div>
                  {form.prgf_past_services_paid === true && (
                    <div>
                      <Label className="text-xs">{t('sarh.empd.f_prgf_date_paiement', locale)}</Label>
                      <Input
                        type="date"
                        value={form.prgf_past_services_date_paiement || ""}
                        onChange={e => u("prgf_past_services_date_paiement", e.target.value || null)}
                      />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Historique des augmentations */}
          <Card className="rounded-2xl shadow-sm bg-[#f8f9fc]">
            <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><History className="w-4 h-4" />{t('sarh.empd.card_augmentations', locale)}</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-gray-400 italic">{t('sarh.empd.history_soon', locale)}</p>
            </CardContent>
          </Card>

          {/* Sprint 11 BUG 9A — Simulateur Net supprimé (décision patron :
              inutile et confus sur la fiche employé ; une éventuelle
              simulation paie sera ailleurs). */}

          <SaveBtn />
        </TabsContent>

        {/* ===== TAB 4: Avantages ===== */}
        <TabsContent value="avantages" className="space-y-6">
          <Card className="rounded-2xl shadow-sm border-l-4 border-l-purple-400 bg-[#f8f9fc]">
            <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><Gift className="w-4 h-4 text-purple-400" />{t('sarh.empd.card_avantages', locale)}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label={t('sarh.empd.f_bus_fare', locale)} field="daily_bus_fare" type="number" />
                <Field label={t('sarh.empd.f_prime_trim', locale)} field="prime_trimestrielle" type="number" />
                <Field label={t('sarh.empd.f_it_equipment', locale)} field="it_equipment" placeholder={t('sarh.empd.ph_it_equipment', locale)} />
                <Field label={t('sarh.empd.f_internet_device', locale)} field="internet_device" placeholder={t('sarh.empd.ph_internet_device', locale)} />
              </div>
            </CardContent>
          </Card>
          <SaveBtn />
        </TabsContent>

        {/* ===== TAB 5: Conges ===== */}
        <TabsContent value="conges" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#0B0F2E]">{t('sarh.empd.h_conges', locale)}</h2>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {soldes.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {soldes.map((s: any) => (
                <Card key={s.id} className="rounded-2xl shadow-sm">
                  <CardContent className="pt-4 text-center">
                    <p className="text-xs text-gray-500 mb-1">{s.type_conge || t('sarh.empd.leave_annual', locale)}</p>
                    <p className="text-2xl font-bold text-[#0B0F2E]">{s.solde ?? s.jours_restants ?? "--"}</p>
                    <p className="text-xs text-gray-400">{t('sarh.empd.days_remaining', locale)}</p>
                    {(s.jours_acquis !== undefined || s.jours_utilises !== undefined) && (
                      <p className="text-xs text-gray-400 mt-1">
                        {t('sarh.empd.acquired', locale)}: {s.jours_acquis ?? "--"} / {t('sarh.empd.taken', locale)}: {s.jours_utilises ?? "--"}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <Card className="rounded-2xl shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {conges.length === 0 ? (
                <div className="text-center py-12 text-gray-500">{t('srh.emp.no_leave_request', locale)}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('sarh.empd.th_type', locale)}</TableHead><TableHead>{t('sarh.empd.th_du', locale)}</TableHead><TableHead>{t('sarh.empd.th_au', locale)}</TableHead>
                      <TableHead className="text-right">{t('sarh.empd.th_jours', locale)}</TableHead><TableHead>{t('sarh.empd.th_statut', locale)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conges.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.type_conge || t('sarh.empd.leave_annual', locale)}</TableCell>
                        <TableCell>{fmtDate(c.date_debut)}</TableCell>
                        <TableCell>{fmtDate(c.date_fin)}</TableCell>
                        <TableCell className="text-right">{c.nb_jours ?? "--"}</TableCell>
                        <TableCell>{congeStatus(c.statut)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB 6: Bulletins ===== */}
        <TabsContent value="bulletins" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#0B0F2E]">{t('sarh.empd.h_bulletins', locale)}</h2>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Card className="rounded-2xl shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {bulletins.length === 0 ? (
                <div className="text-center py-12 text-gray-500">{t('srh.emp.no_payslip', locale)}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('sarh.empd.th_periode', locale)}</TableHead><TableHead className="text-right">{t('sarh.empd.th_brut', locale)}</TableHead>
                      <TableHead className="text-right">{t('sarh.empd.th_net', locale)}</TableHead><TableHead>{t('sarh.empd.th_statut', locale)}</TableHead><TableHead>PDF</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulletins.map((b: any) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.periode}</TableCell>
                        <TableCell className="text-right">{fmt(b.salaire_brut || 0)}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(b.salaire_net || 0)}</TableCell>
                        <TableCell>
                          <Badge className={`border-0 ${b.statut === "valide" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
                            {b.statut || t('sarh.empd.draft', locale)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {b.pdf_url && (
                            <Button variant="ghost" size="sm" onClick={() => window.open(b.pdf_url, "_blank")} className="text-[#D4AF37]">
                              <FileText className="w-4 h-4 mr-1" />PDF
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB 7: Pointage ===== */}
        <TabsContent value="pointage" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#0B0F2E]" id="pointage-heading">{t('sarh.empd.h_pointage', locale)}</h2>
            <Input aria-label={t('sarh.empd.aria_pointage_month', locale)} type="month" value={pointageMois} onChange={e => setPointageMois(e.target.value)} className="w-48" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Card className="rounded-2xl shadow-sm"><CardContent className="pt-6 text-center">
              <Clock className="w-6 h-6 mx-auto text-[#0B0F2E] mb-2" />
              <p className="text-2xl font-bold text-[#0B0F2E]">{joursPresent}</p>
              <p className="text-xs text-gray-500">{t('sarh.empd.jours_travailles', locale)}</p>
            </CardContent></Card>
            <Card className="rounded-2xl shadow-sm"><CardContent className="pt-6 text-center">
              <AlertCircle className="w-6 h-6 mx-auto text-red-400 mb-2" />
              <p className="text-2xl font-bold text-red-500">{joursAbsence}</p>
              <p className="text-xs text-gray-500">{t('sarh.empd.jours_absence', locale)}</p>
            </CardContent></Card>
            <Card className="rounded-2xl shadow-sm"><CardContent className="pt-6 text-center">
              <Clock className="w-6 h-6 mx-auto text-[#D4AF37] mb-2" />
              <p className="text-2xl font-bold text-[#D4AF37]">{totalOT.toFixed(1)}h</p>
              <p className="text-xs text-gray-500">{t('sarh.empd.heures_sup', locale)}</p>
            </CardContent></Card>
          </div>
          <Card className="rounded-2xl shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {pointages.length === 0 ? (
                <div className="text-center py-12 text-gray-500">{t('srh.emp.no_time_entry', locale)}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('sarh.empd.th_date', locale)}</TableHead><TableHead>{t('sarh.empd.th_arrivee', locale)}</TableHead><TableHead>{t('sarh.empd.th_depart', locale)}</TableHead>
                      <TableHead className="text-right">{t('sarh.empd.th_heures', locale)}</TableHead><TableHead className="text-right">OT</TableHead><TableHead>{t('sarh.empd.th_statut', locale)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pointages.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{fmtDate(p.date_pointage)}</TableCell>
                        <TableCell>{p.heure_arrivee || "--"}</TableCell>
                        <TableCell>{p.heure_depart || "--"}</TableCell>
                        <TableCell className="text-right">{p.heures_travaillees?.toFixed(1) || "--"}</TableCell>
                        <TableCell className="text-right">{p.heures_supplementaires?.toFixed(1) || "--"}</TableCell>
                        <TableCell>
                          <Badge className={`border-0 ${p.statut === "present" ? "bg-green-100 text-green-800" : p.statut === "absent" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                            {p.statut || "--"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB 8: Documents ===== */}
        <TabsContent value="documents" className="space-y-6">
          {/* DOC1 — module documents_rh bidirectionnel avec filtres + upload +
              archivage + confidentiel + suppression. Remplace l'ancien
              placeholder + table legacy 'documents'. */}
          <DocumentsTabRH
            employeId={id}
            employeNom={employe ? `${employe.prenom || ''} ${employe.nom || ''}`.trim() : undefined}
          />
        </TabsContent>

        {/* ===== TAB 9: Historique ===== */}
        <TabsContent value="historique" className="space-y-6">
          <Card className="rounded-2xl shadow-sm bg-[#f8f9fc]">
            <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><History className="w-4 h-4 text-[#4191FF]" />{t('sarh.empd.card_dates_cles', locale)}</CardTitle></CardHeader>
            <CardContent>
              <div className="relative pl-6 space-y-4">
                <div className="absolute left-2 top-2 bottom-2 w-px bg-[#4191FF]/20" />
                <div className="relative flex justify-between items-center">
                  <div className="absolute -left-[17px] w-3 h-3 rounded-full bg-[#4191FF] ring-4 ring-[#4191FF]/10" />
                  <span className="text-sm text-gray-500">{t('sarh.empd.f_date_arrivee', locale)}</span>
                  <span className="text-sm font-medium">{fmtDate(employe.date_arrivee)}</span>
                </div>
                <div className="relative flex justify-between items-center">
                  <div className="absolute -left-[17px] w-3 h-3 rounded-full bg-[#4191FF] ring-4 ring-[#4191FF]/10" />
                  <span className="text-sm text-gray-500">{t('sarh.empd.f_poste_depuis', locale)}</span>
                  <span className="text-sm font-medium">{fmtDate(employe.date_poste_actuel)}</span>
                </div>
                {employe.date_depart && (
                  <div className="relative flex justify-between items-center">
                    <div className="absolute -left-[17px] w-3 h-3 rounded-full bg-red-400 ring-4 ring-red-400/10" />
                    <span className="text-sm text-gray-500">{t('sarh.empd.f_date_depart', locale)}</span>
                    <span className="text-sm font-medium">{fmtDate(employe.date_depart)}</span>
                  </div>
                )}
                <div className="relative flex justify-between items-center">
                  <div className="absolute -left-[17px] w-3 h-3 rounded-full bg-[#D4AF37] ring-4 ring-[#D4AF37]/10" />
                  <span className="text-sm text-gray-500">{t('sarh.empd.f_poste', locale)}</span>
                  <span className="text-sm font-medium">{employe.poste || "--"}</span>
                </div>
                <div className="relative flex justify-between items-center">
                  <div className="absolute -left-[17px] w-3 h-3 rounded-full bg-green-400 ring-4 ring-green-400/10" />
                  <span className="text-sm text-gray-500">{t('sarh.empd.f_departement', locale)}</span>
                  <span className="text-sm font-medium">{employe.departement || "--"}</span>
                </div>
                <div className="relative flex justify-between items-center">
                  <div className="absolute -left-[17px] w-3 h-3 rounded-full bg-purple-400 ring-4 ring-purple-400/10" />
                  <span className="text-sm text-gray-500">{t('sarh.empd.f_role', locale)}</span>
                  <span className="text-sm font-medium">{employe.role || "--"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm border-l-4 border-l-[#D4AF37] bg-[#f8f9fc]">
            <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base" style={{ fontFamily: "'Poppins', sans-serif" }}>{t('sarh.empd.card_hist_salaire', locale)}</CardTitle></CardHeader>
            <CardContent>
              <div className="flex justify-between items-center border-b pb-3">
                <span className="text-sm text-gray-500">{t('sarh.empd.salaire_actuel', locale)}</span>
                <span className="text-xl font-bold text-[#0B0F2E]">{fmt(employe.salaire_base || 0)}</span>
              </div>
              <p className="text-xs text-gray-400 mt-3">{t('sarh.empd.hist_salaire_soon', locale)}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog création / reset compte utilisateur */}
      <Dialog open={accountDialogOpen} onOpenChange={(v) => { if (!accountSubmitting) setAccountDialogOpen(v) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {employe?.auth_user_id ? t('sarh.empd.dlg_resend_title', locale) : t('sarh.empd.dlg_create_title', locale)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-600">
              {employe?.auth_user_id
                ? <>{t('sarh.empd.dlg_reset_desc_1', locale)} <span className="font-mono">{employe.email}</span>. {t('sarh.empd.dlg_reset_desc_2', locale)}</>
                : <>{t('sarh.empd.dlg_create_desc_1', locale)} <span className="font-mono">{employe.email}</span>. {t('sarh.empd.dlg_create_desc_2', locale)}</>}
            </p>
            <div>
              <Label htmlFor="emp-account-pwd" className="text-xs text-gray-500">{t('sarh.empd.f_password_min8', locale)}</Label>
              <Input
                id="emp-account-pwd"
                type="password"
                value={accountPwd}
                onChange={(e) => setAccountPwd(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                placeholder="••••••••"
                aria-required="true"
              />
            </div>
            <div>
              <Label htmlFor="emp-account-pwd2" className="text-xs text-gray-500">{t('srh.emp.confirm_password', locale)}</Label>
              <Input
                id="emp-account-pwd2"
                type="password"
                value={accountPwd2}
                onChange={(e) => setAccountPwd2(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                placeholder="••••••••"
                aria-required="true"
                aria-invalid={accountPwd2.length > 0 && accountPwd !== accountPwd2}
              />
              {accountPwd2.length > 0 && accountPwd !== accountPwd2 && (
                <p className="text-xs text-red-600 mt-1">{t('sarh.empd.passwords_mismatch', locale)}</p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setAccountDialogOpen(false)} disabled={accountSubmitting}>
              {t('sarh.empd.cancel', locale)}
            </Button>
            <Button
              type="button"
              onClick={handleSubmitAccount}
              disabled={accountSubmitting || accountPwd.length < 8 || accountPwd !== accountPwd2}
            >
              {accountSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
              {employe?.auth_user_id ? t('sarh.empd.update_and_send', locale) : t('sarh.empd.create_and_send', locale)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
