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
import {
  ArrowLeft, Save, Loader2, User, FileText, CalendarDays, Clock,
  Briefcase, CreditCard, Gift, FolderOpen, History, Shield,
  CheckCircle2, XCircle, AlertCircle, Upload, Download, Camera,
  Phone, MapPin, Building2, Hash, CircleDot
} from "lucide-react"
import { BANQUES_MAURITIUS } from "@/lib/rh/banques-mauritius"

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

export default function EmployeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [employe, setEmploye] = useState<any>(null)
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
  const photoInputRef = useRef<HTMLInputElement>(null)

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
    } catch {}
  }

  const load = useCallback(async (y?: string, pm?: string) => {
    setLoading(true)
    try {
      const qp = new URLSearchParams()
      if (y) qp.set("year", y)
      if (pm) qp.set("pointage_mois", pm)
      const res = await fetch(`/api/rh/employes/${id}?${qp}`)
      if (!res.ok) throw new Error("Employe introuvable")
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

  // On first load, set form from employe
  useEffect(() => {
    if (employe && !form) setForm({ ...employe })
  }, [employe, form])

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
          <ArrowLeft className="w-4 h-4 mr-2" />Retour
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
      {saved && <span className="text-green-600 text-sm flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />Enregistre</span>}
      {error && <span className="text-red-600 text-sm">{error}</span>}
      <Button onClick={handleSave} disabled={saving} className="bg-[#0B0F2E] hover:bg-[#0B0F2E]/90 text-white px-8">
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}Sauvegarder
      </Button>
    </div>
  )

  const Field = ({ label, field, type = "text", disabled = false, placeholder = "" }: any) => (
    <div>
      <Label className="text-xs text-gray-500 mb-1">{label}</Label>
      <Input
        key={`${field}-${employe?.id}`}
        type={type}
        defaultValue={type === "date" ? dateVal(form[field]) : (form[field] ?? "")}
        onBlur={e => u(field, e.target.value)}
        onChange={type === "date" ? (e => u(field, e.target.value)) : undefined}
        disabled={disabled}
        className={`h-11 ${disabled ? "bg-gray-50" : ""}`}
        placeholder={placeholder}
      />
    </div>
  )

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-[#0B0F2E] via-[#0B0F2E]/95 to-[#4191FF]/80 p-6 shadow-sm">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA1KSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjYwIiBmaWxsPSJ1cmwoI2cpIi8+PC9zdmc+')] opacity-40" />
        <div className="relative flex items-center gap-5">
          <Button variant="ghost" size="icon" onClick={() => router.push("/rh/employes")} className="text-white/80 hover:bg-white/10 hover:text-white shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="relative group shrink-0 cursor-pointer" onClick={() => photoInputRef.current?.click()}>
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
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Poppins', sans-serif" }}>{employe.prenom} {employe.nom}</h1>
              {(() => {
                const statut = employe.statut_enrichi || (employe.actif ? "actif" : "parti")
                const statusMap: Record<string, { cls: string; label: string; icon: typeof CheckCircle2 }> = {
                  actif: { cls: "bg-green-400/20 text-green-300 border-green-400/30", label: "Actif", icon: CheckCircle2 },
                  suspendu: { cls: "bg-orange-400/20 text-orange-300 border-orange-400/30", label: "Suspendu", icon: AlertCircle },
                  preavis: { cls: "bg-blue-400/20 text-blue-300 border-blue-400/30", label: "En préavis", icon: Clock },
                  parti: { cls: "bg-red-400/20 text-red-300 border-red-400/30", label: "Parti", icon: XCircle },
                  periode_essai: { cls: "bg-purple-400/20 text-purple-300 border-purple-400/30", label: "Période d'essai", icon: CircleDot },
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
            </div>
          </div>
        </div>
      </div>

      {/* 9 Tabs */}
      <Tabs defaultValue="personnel" className="space-y-6">
        <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
          <TabsList className="bg-gray-100/80 backdrop-blur-sm flex-nowrap h-auto gap-1.5 p-1.5 rounded-full border border-gray-200/50 w-max">
            <TabsTrigger value="personnel" className={triggerCls}><User className="w-4 h-4 mr-1.5" />Personnel</TabsTrigger>
            <TabsTrigger value="emploi" className={triggerCls}><Briefcase className="w-4 h-4 mr-1.5" />Emploi</TabsTrigger>
            <TabsTrigger value="salaire" className={triggerCls}><CreditCard className="w-4 h-4 mr-1.5" />Salaire</TabsTrigger>
            <TabsTrigger value="avantages" className={triggerCls}><Gift className="w-4 h-4 mr-1.5" />Avantages</TabsTrigger>
            <TabsTrigger value="conges" className={triggerCls}><CalendarDays className="w-4 h-4 mr-1.5" />Conges</TabsTrigger>
            <TabsTrigger value="bulletins" className={triggerCls}><FileText className="w-4 h-4 mr-1.5" />Bulletins</TabsTrigger>
            <TabsTrigger value="pointage" className={triggerCls}><Clock className="w-4 h-4 mr-1.5" />Pointage</TabsTrigger>
            <TabsTrigger value="documents" className={triggerCls}><FolderOpen className="w-4 h-4 mr-1.5" />Documents</TabsTrigger>
            <TabsTrigger value="historique" className={triggerCls}><History className="w-4 h-4 mr-1.5" />Historique</TabsTrigger>
          </TabsList>
        </div>

        {/* ===== TAB 1: Personnel ===== */}
        <TabsContent value="personnel" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="rounded-2xl shadow-sm border-l-4 border-l-[#4191FF] bg-[#f8f9fc]">
              <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><User className="w-4 h-4 text-[#4191FF]" />Identite</CardTitle></CardHeader>
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
                    <Field label="Nom" field="nom" />
                    <Field label="Prenom" field="prenom" />
                  </div>
                </div>
                <Field label="Nom usuel" field="common_name" placeholder="Nom usuel / surnom" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">NIC</Label>
                    <Input value={form.nic_number || ""} onChange={e => u("nic_number", e.target.value)} placeholder="A1234567890123" />
                  </div>
                  <div className="flex items-end gap-2">
                    <Checkbox checked={form.is_mauritian ?? true} onCheckedChange={v => u("is_mauritian", v)} id="mauritian" />
                    <Label htmlFor="mauritian" className="text-sm">Mauricien(ne)</Label>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">Genre</Label>
                    <Select value={form.gender || "M"} onValueChange={v => u("gender", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{GENDERS.map(g => <SelectItem key={g.v} value={g.v}>{g.l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Field label="Date de naissance" field="date_naissance" type="date" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">Statut familial</Label>
                    <Select value={form.statut_familial || ""} onValueChange={v => u("statut_familial", v)}>
                      <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                      <SelectContent>{MARITAL.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Niveau education</Label>
                    <Select value={form.education || ""} onValueChange={v => u("education", v)}>
                      <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                      <SelectContent>{EDUCATION.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Code employe" field="code" disabled />
                  <Field label="Badge No" field="badge_number" />
                </div>
                <Field label="Email" field="email" type="email" />
                <Field label="Email personnel" field="email_personnel" type="email" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="N° Passeport" field="passport_no" />
                  <Field label="Nationalité" field="nationalite" placeholder="MU" />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Langue préférée</Label>
                  <Select value={form.langue_preferee || "FR"} onValueChange={v => u("langue_preferee", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LANGUES.map(l => <SelectItem key={l.v} value={l.v}>{l.l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="border-t pt-3 mt-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={form.situation_handicap ?? false} onCheckedChange={v => u("situation_handicap", v)} id="handicap" />
                    <Label htmlFor="handicap" className="text-sm">Situation de handicap</Label>
                  </div>
                  <Field label="Date dernier examen médecin du travail" field="medecin_travail_date" type="date" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm border-l-4 border-l-green-500 bg-[#f8f9fc]">
              <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><MapPin className="w-4 h-4 text-green-500" />Contact</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Adresse" field="adresse" />
                <Field label="Adresse 2" field="adresse2" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Code postal" field="code_postal" />
                  <Field label="Ville" field="ville" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Mobile" field="mobile" />
                  <Field label="Telephone" field="telephone" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-2xl shadow-sm border-l-4 border-l-red-400 bg-[#f8f9fc]">
            <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><AlertCircle className="w-4 h-4 text-red-400" />Contact d&apos;urgence</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Nom contact urgence" field="contact_urgence_nom" />
                <Field label="Tél. urgence" field="contact_urgence_tel" />
                <Field label="Relation" field="contact_urgence_relation" />
              </div>
            </CardContent>
          </Card>

          <SaveBtn />
        </TabsContent>

        {/* ===== TAB 2: Emploi ===== */}
        <TabsContent value="emploi" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="rounded-2xl shadow-sm border-l-4 border-l-[#4191FF] bg-[#f8f9fc]">
              <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><Briefcase className="w-4 h-4 text-[#4191FF]" />Poste</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date d'arrivee" field="date_arrivee" type="date" />
                  <Field label="Poste actuel depuis" field="date_poste_actuel" type="date" />
                </div>
                <Field label="Poste" field="poste" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">Type de contrat</Label>
                    <Select value={form.type_contrat || "fulltime"} onValueChange={v => u("type_contrat", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CONTRACT_TYPES.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Role</Label>
                    <Select value={form.role || "salarie"} onValueChange={v => u("role", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                {form.type_contrat === "cdd" && (
                  <Field label="Date fin de contrat" field="date_fin_contrat" type="date" />
                )}
                <Field label="Date fin période d'essai" field="date_fin_periode_essai" type="date" />
                <Field label="Departement" field="departement" />
                <Field label="Bureau / Site" field="office_site" />
                <Field label="Superviseur (ID)" field="supervisor_id" placeholder="UUID du superviseur" />
                <div>
                  <Label className="text-xs text-gray-500 mb-2 block">Jours de travail</Label>
                  <div className="flex gap-3 flex-wrap">
                    {DAYS.map(d => (
                      <label key={d.k} className="flex items-center gap-1.5 text-sm">
                        <Checkbox checked={form.working_days?.[d.k] ?? false} onCheckedChange={v => uwd(d.k, !!v)} />
                        {d.l}
                      </label>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm border-l-4 border-l-orange-400 bg-[#f8f9fc]">
              <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base" style={{ fontFamily: "'Poppins', sans-serif" }}>Depart / Suspension</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Date de depart" field="date_depart" type="date" />
                <Field label="Type de depart" field="departure_type" placeholder="Demission, Licenciement..." />
                <Field label="Raison du depart" field="departure_reason" />
                <Field label="Date de suspension" field="suspension_date" type="date" />
                <Field label="Raison de suspension" field="suspension_reason" />
                <div>
                  <Label className="text-xs text-gray-500">Notes</Label>
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
              <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><CreditCard className="w-4 h-4 text-[#D4AF37]" />Remuneration</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Salaire de base (MUR)" field="salaire_base" type="number" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Transport allowance" field="transport_allowance" type="number" />
                  <Field label="Petrol allowance" field="petrol_allowance" type="number" />
                </div>
                <Field label="Phone allowance" field="phone_allowance" type="number" />
                <div className="border-t pt-3 mt-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Primes fixes mensuelles (incluses automatiquement chaque mois)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Libelle prime fixe 1" field="prime_fixe_1_libelle" placeholder="Ex: Prime de fonction" />
                    <Field label="Montant prime fixe 1 (MUR)" field="prime_fixe_1" type="number" />
                    <Field label="Libelle prime fixe 2" field="prime_fixe_2_libelle" placeholder="Ex: Prime anciennete" />
                    <Field label="Montant prime fixe 2 (MUR)" field="prime_fixe_2" type="number" />
                    <Field label="Libelle prime fixe 3" field="prime_fixe_3_libelle" placeholder="Ex: Prime logement" />
                    <Field label="Montant prime fixe 3 (MUR)" field="prime_fixe_3" type="number" />
                  </div>
                </div>
                <div className="border-t pt-3 mt-3 space-y-3">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={form.nsf_csg_enabled ?? true} onCheckedChange={v => u("nsf_csg_enabled", v)} id="nsf" />
                    <Label htmlFor="nsf" className="text-sm">NSF / CSG actif</Label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Code contribution" field="contribution_code" placeholder="S2" />
                    <div>
                      <Label className="text-xs text-gray-500">Categorie CSG</Label>
                      <Select value={form.csg_categorie || "A"} onValueChange={v => u("csg_categorie", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="A">A</SelectItem><SelectItem value="B">B</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox checked={form.paye_enabled ?? true} onCheckedChange={v => u("paye_enabled", v)} id="paye" />
                    <Label htmlFor="paye" className="text-sm">PAYE actif</Label>
                  </div>
                  <Field label="TAN" field="tan_number" placeholder="A123456789" />
                  <Field label="EDF deduction totale" field="edf_total_deduction" type="number" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm border-l-4 border-l-[#4191FF] bg-[#f8f9fc]">
              <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base" style={{ fontFamily: "'Poppins', sans-serif" }}>Coordonnees bancaires</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3 mb-2">
                  <Checkbox checked={form.paid_by_bank_transfer ?? true} onCheckedChange={v => u("paid_by_bank_transfer", v)} id="bank" />
                  <Label htmlFor="bank" className="text-sm">Paye par virement bancaire</Label>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Banque</Label>
                  <Select value={form.bank_name || ""} onValueChange={v => u("bank_name", v)}>
                    <SelectTrigger><SelectValue placeholder="Choisir une banque..." /></SelectTrigger>
                    <SelectContent>{BANQUES_MAURITIUS.map(b => <SelectItem key={b.code} value={b.code}>{b.nom}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Field label="N. compte bancaire" field="bank_account" placeholder="000012345678" />
                <Field label="IBAN" field="iban" placeholder="MU17BOMM0101101030300200000MUR" />
                <div>
                  <Label className="text-xs text-gray-500">Devise salaire</Label>
                  <Select value={form.devise_salaire || "MUR"} onValueChange={v => u("devise_salaire", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DEVISES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Régime fiscal & charges */}
          <Card className="rounded-2xl shadow-sm bg-[#f8f9fc]">
            <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><Shield className="w-4 h-4 text-[#0B0F2E]" />Régime fiscal & charges</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs text-gray-500">Régime fiscal</Label>
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
                      <SelectItem value="standard">Standard (charges MRA normales)</SelectItem>
                      <SelectItem value="expatrie">Expatrié (hors charges MRA)</SelectItem>
                      <SelectItem value="consultant">Consultant externe (hors tout)</SelectItem>
                      <SelectItem value="special">Spécial (paramétrage custom)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Pays de résidence</Label>
                  <Field label="" field="pays_residence" placeholder="MU" />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Mode de paiement</Label>
                  <Select value={form.mode_paiement || "bulk"} onValueChange={v => u("mode_paiement", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bulk">Bulk (MCB)</SelectItem>
                      <SelectItem value="individuel">Virement individuel</SelectItem>
                      <SelectItem value="especes">Espèces</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(form.regime_fiscal === "special" || form.regime_fiscal === "expatrie") && (
                <div className="p-3 border rounded-lg bg-orange-50 space-y-2">
                  <p className="text-xs font-medium text-orange-800">Paramétrage des charges</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { key: "inclus_csg", label: "CSG" },
                      { key: "inclus_nsf", label: "NSF" },
                      { key: "inclus_paye", label: "PAYE" },
                      { key: "inclus_training_levy", label: "Training Levy" },
                      { key: "inclus_prgf", label: "PRGF" },
                      { key: "inclus_yeb", label: "13ème mois (YEB)" },
                    ].map(c => (
                      <div key={c.key} className="flex items-center gap-2">
                        <Checkbox checked={form[c.key] !== false} onCheckedChange={v => u(c.key, v)} id={c.key} />
                        <Label htmlFor={c.key} className="text-xs">{c.label}</Label>
                      </div>
                    ))}
                  </div>
                  <Field label="Motif d'exemption" field="hors_charges_motif" placeholder="Ex: Travaille depuis la France, hors juridiction MRA" />
                </div>
              )}

              {form.regime_fiscal === "standard" && (
                <p className="text-xs text-gray-400">Toutes les charges MRA s'appliquent (CSG, NSF, PAYE, Training Levy, PRGF, YEB)</p>
              )}
              {form.regime_fiscal === "consultant" && (
                <p className="text-xs text-orange-600">Aucune charge MRA ne s'applique — prestataire externe</p>
              )}
            </CardContent>
          </Card>

          {/* Historique des augmentations */}
          <Card className="rounded-2xl shadow-sm bg-[#f8f9fc]">
            <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><History className="w-4 h-4" />Historique des augmentations</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-gray-400 italic">(Historique disponible prochainement)</p>
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
            <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><Gift className="w-4 h-4 text-purple-400" />Avantages en nature</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Bus fare journalier (MUR)" field="daily_bus_fare" type="number" />
                <Field label="Prime trimestrielle (MUR)" field="prime_trimestrielle" type="number" />
                <Field label="Equipement IT" field="it_equipment" placeholder="Laptop, ecran..." />
                <Field label="Appareil internet" field="internet_device" placeholder="Dongle, routeur..." />
              </div>
            </CardContent>
          </Card>
          <SaveBtn />
        </TabsContent>

        {/* ===== TAB 5: Conges ===== */}
        <TabsContent value="conges" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#0B0F2E]">Conges</h2>
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
                    <p className="text-xs text-gray-500 mb-1">{s.type_conge || "Annuel"}</p>
                    <p className="text-2xl font-bold text-[#0B0F2E]">{s.solde ?? s.jours_restants ?? "--"}</p>
                    <p className="text-xs text-gray-400">jours restants</p>
                    {(s.jours_acquis !== undefined || s.jours_utilises !== undefined) && (
                      <p className="text-xs text-gray-400 mt-1">
                        Acquis: {s.jours_acquis ?? "--"} / Pris: {s.jours_utilises ?? "--"}
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
                <div className="text-center py-12 text-gray-500">Aucune demande de conge</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead><TableHead>Du</TableHead><TableHead>Au</TableHead>
                      <TableHead className="text-right">Jours</TableHead><TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conges.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.type_conge || "Annuel"}</TableCell>
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
            <h2 className="text-lg font-semibold text-[#0B0F2E]">Bulletins de paie</h2>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Card className="rounded-2xl shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {bulletins.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Aucun bulletin de paie</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Periode</TableHead><TableHead className="text-right">Brut</TableHead>
                      <TableHead className="text-right">Net</TableHead><TableHead>Statut</TableHead><TableHead>PDF</TableHead>
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
                            {b.statut || "brouillon"}
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
            <h2 className="text-lg font-semibold text-[#0B0F2E]">Pointage</h2>
            <Input type="month" value={pointageMois} onChange={e => setPointageMois(e.target.value)} className="w-48" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Card className="rounded-2xl shadow-sm"><CardContent className="pt-6 text-center">
              <Clock className="w-6 h-6 mx-auto text-[#0B0F2E] mb-2" />
              <p className="text-2xl font-bold text-[#0B0F2E]">{joursPresent}</p>
              <p className="text-xs text-gray-500">Jours travailles</p>
            </CardContent></Card>
            <Card className="rounded-2xl shadow-sm"><CardContent className="pt-6 text-center">
              <AlertCircle className="w-6 h-6 mx-auto text-red-400 mb-2" />
              <p className="text-2xl font-bold text-red-500">{joursAbsence}</p>
              <p className="text-xs text-gray-500">Jours absence</p>
            </CardContent></Card>
            <Card className="rounded-2xl shadow-sm"><CardContent className="pt-6 text-center">
              <Clock className="w-6 h-6 mx-auto text-[#D4AF37] mb-2" />
              <p className="text-2xl font-bold text-[#D4AF37]">{totalOT.toFixed(1)}h</p>
              <p className="text-xs text-gray-500">Heures supplementaires</p>
            </CardContent></Card>
          </div>
          <Card className="rounded-2xl shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {pointages.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Aucun pointage enregistre</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead><TableHead>Arrivee</TableHead><TableHead>Depart</TableHead>
                      <TableHead className="text-right">Heures</TableHead><TableHead className="text-right">OT</TableHead><TableHead>Statut</TableHead>
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
          <Card className="rounded-2xl shadow-sm bg-[#f8f9fc]">
            <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><FolderOpen className="w-4 h-4 text-[#4191FF]" />Documents employe</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-[#4191FF]/30 rounded-2xl p-10 text-center bg-[#4191FF]/5 hover:bg-[#4191FF]/10 hover:border-[#4191FF]/50 transition-colors cursor-pointer">
                <div className="w-14 h-14 rounded-full bg-[#4191FF]/10 flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-7 h-7 text-[#4191FF]" />
                </div>
                <p className="text-sm font-medium text-gray-700">Glisser un fichier ou cliquer pour telecharger</p>
                <p className="text-xs text-gray-400 mt-1">PDF, Word, Images (max 10MB)</p>
                <Button variant="outline" className="mt-4 text-[#0B0F2E] border-[#0B0F2E] rounded-full px-6">
                  <Upload className="w-4 h-4 mr-2" />Ajouter un document
                </Button>
              </div>
              {documents.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-4">Aucun document</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead><TableHead>Date</TableHead>
                      <TableHead>Description</TableHead><TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc: any) => (
                      <TableRow key={doc.id}>
                        <TableCell>{doc.type || "--"}</TableCell>
                        <TableCell>{fmtDate(doc.created_at)}</TableCell>
                        <TableCell>{doc.description || doc.nom || "--"}</TableCell>
                        <TableCell>
                          {doc.url && (
                            <Button variant="ghost" size="sm" onClick={() => window.open(doc.url, "_blank")} className="text-[#D4AF37]">
                              <Download className="w-4 h-4 mr-1" />Telecharger
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

        {/* ===== TAB 9: Historique ===== */}
        <TabsContent value="historique" className="space-y-6">
          <Card className="rounded-2xl shadow-sm bg-[#f8f9fc]">
            <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2" style={{ fontFamily: "'Poppins', sans-serif" }}><History className="w-4 h-4 text-[#4191FF]" />Dates cles</CardTitle></CardHeader>
            <CardContent>
              <div className="relative pl-6 space-y-4">
                <div className="absolute left-2 top-2 bottom-2 w-px bg-[#4191FF]/20" />
                <div className="relative flex justify-between items-center">
                  <div className="absolute -left-[17px] w-3 h-3 rounded-full bg-[#4191FF] ring-4 ring-[#4191FF]/10" />
                  <span className="text-sm text-gray-500">Date d&apos;arrivee</span>
                  <span className="text-sm font-medium">{fmtDate(employe.date_arrivee)}</span>
                </div>
                <div className="relative flex justify-between items-center">
                  <div className="absolute -left-[17px] w-3 h-3 rounded-full bg-[#4191FF] ring-4 ring-[#4191FF]/10" />
                  <span className="text-sm text-gray-500">Poste actuel depuis</span>
                  <span className="text-sm font-medium">{fmtDate(employe.date_poste_actuel)}</span>
                </div>
                {employe.date_depart && (
                  <div className="relative flex justify-between items-center">
                    <div className="absolute -left-[17px] w-3 h-3 rounded-full bg-red-400 ring-4 ring-red-400/10" />
                    <span className="text-sm text-gray-500">Date de depart</span>
                    <span className="text-sm font-medium">{fmtDate(employe.date_depart)}</span>
                  </div>
                )}
                <div className="relative flex justify-between items-center">
                  <div className="absolute -left-[17px] w-3 h-3 rounded-full bg-[#D4AF37] ring-4 ring-[#D4AF37]/10" />
                  <span className="text-sm text-gray-500">Poste</span>
                  <span className="text-sm font-medium">{employe.poste || "--"}</span>
                </div>
                <div className="relative flex justify-between items-center">
                  <div className="absolute -left-[17px] w-3 h-3 rounded-full bg-green-400 ring-4 ring-green-400/10" />
                  <span className="text-sm text-gray-500">Departement</span>
                  <span className="text-sm font-medium">{employe.departement || "--"}</span>
                </div>
                <div className="relative flex justify-between items-center">
                  <div className="absolute -left-[17px] w-3 h-3 rounded-full bg-purple-400 ring-4 ring-purple-400/10" />
                  <span className="text-sm text-gray-500">Role</span>
                  <span className="text-sm font-medium">{employe.role || "--"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm border-l-4 border-l-[#D4AF37] bg-[#f8f9fc]">
            <CardHeader className="pb-3"><CardTitle className="text-[#0B0F2E] text-base" style={{ fontFamily: "'Poppins', sans-serif" }}>Historique salaire</CardTitle></CardHeader>
            <CardContent>
              <div className="flex justify-between items-center border-b pb-3">
                <span className="text-sm text-gray-500">Salaire actuel</span>
                <span className="text-xl font-bold text-[#0B0F2E]">{fmt(employe.salaire_base || 0)}</span>
              </div>
              <p className="text-xs text-gray-400 mt-3">L&apos;historique complet des modifications salariales sera disponible prochainement.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
