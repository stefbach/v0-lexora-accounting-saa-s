"use client"
import React, { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Loader2, Clock, Calendar, CreditCard, TrendingUp, LogIn, LogOut, Coffee, Download, User, Save, CheckCircle, FileText, CalendarPlus, UserCircle, FolderOpen, Bell, Eye, Upload, X, LayoutDashboard, MoreHorizontal, Car, MapPin, Navigation, Play, Square, HeartPulse, Video, Stethoscope, Pill, ShieldCheck, Phone, MessageCircle, Activity, Scan, Printer } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
const BLUE = "#4191FF"
const GREEN = "#2ECC8A"
const MU_TZ = "Indian/Mauritius"

const MONTH_NAMES_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"]

function lastDayOfMonth(d: Date = new Date()): string {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return last.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
}

function todayFR(): string {
  return new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
}

function fmtH(h: string | null) { return h ? h.slice(0, 5) : "—" }
function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) }
function timeMauritius(): string { return new Date().toLocaleTimeString("en-GB", { timeZone: MU_TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) }
function todayISO(): string { const d = new Date(new Date().toLocaleString("en-US", { timeZone: MU_TZ })); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` }

type Tab = "dashboard" | "profil" | "bulletins" | "planning" | "primes" | "conges" | "documents" | "trajets" | "sante" | "contrats"

// ── Ma fiche — composant isolé (pas de re-render parent) ──
function MaFicheTab({ employe, onUpdated }: { employe: any; onUpdated: () => void }) {
  const [f, setF] = useState({ ...employe })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const u = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))

  const initials = [employe.prenom, employe.nom].filter(Boolean).map((n: string) => n[0]).join("").toUpperCase() || "?"

  const handleSave = async () => {
    setSaving(true); setSaved(false)
    try {
      const res = await fetch("/api/rh/employes/me", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: f.mobile, telephone: f.telephone, email: f.email,
          adresse: f.adresse, adresse2: f.adresse2, ville: f.ville, code_postal: f.code_postal,
          date_naissance: f.date_naissance, genre: f.genre, statut_marital: f.statut_marital, nationalite: f.nationalite,
          bank_name: f.bank_name, bank_account: f.bank_account, iban: f.iban,
        }),
      })
      const data = await res.json()
      if (data.error) alert("Erreur: " + data.error)
      else { setSaved(true); setTimeout(() => setSaved(false), 4000); onUpdated() }
    } catch { alert("Erreur réseau") }
    setSaving(false)
  }

  const inputCls = "h-11 rounded-xl"

  return (
    <div className="space-y-6">
      {/* Success banner */}
      {saved && (
        <div className="flex items-center gap-3 p-4 rounded-2xl text-sm font-medium text-white shadow-sm" style={{ backgroundColor: GREEN }}>
          <CheckCircle className="h-5 w-5 shrink-0" />
          Informations mises à jour avec succès
        </div>
      )}

      {/* Header card with avatar */}
      <Card className="rounded-2xl shadow-sm overflow-hidden">
        <CardContent className="flex flex-col items-center py-8 gap-3">
          <div className="rounded-full p-1" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD}88)` }}>
            <Avatar className="w-20 h-20 border-2 border-white">
              {employe.photo_url && <AvatarImage src={employe.photo_url} alt={employe.prenom} />}
              <AvatarFallback className="text-2xl font-bold text-white" style={{ backgroundColor: NAVY }}>{initials}</AvatarFallback>
            </Avatar>
          </div>
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold" style={{ color: NAVY }}>{[employe.prenom, employe.nom].filter(Boolean).join(" ") || "Mon profil"}</h2>
            <p className="text-sm text-gray-500">{employe.poste || "Employé"}</p>
            <Badge variant="outline" className="text-xs font-mono" style={{ borderColor: GOLD, color: GOLD }}>{employe.code_employe || employe.code || "—"}</Badge>
          </div>
          <p className="text-xs text-gray-400 mt-1">Modifier mes infos</p>
        </CardContent>
      </Card>

      {/* Section: Coordonnées */}
      <Card className="rounded-2xl shadow-sm">
        <div className="flex rounded-2xl overflow-hidden">
          <div className="w-1.5 shrink-0" style={{ backgroundColor: BLUE }} />
          <div className="flex-1 p-5 space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Coordonnées</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Email</Label><Input type="email" className={inputCls} value={f.email || ""} onChange={e => u("email", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Mobile</Label><Input className={inputCls} value={f.mobile || ""} onChange={e => u("mobile", e.target.value)} placeholder="+230 5XXX XXXX" /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Téléphone</Label><Input className={inputCls} value={f.telephone || ""} onChange={e => u("telephone", e.target.value)} /></div>
            </div>
          </div>
        </div>
      </Card>

      {/* Section: Adresse */}
      <Card className="rounded-2xl shadow-sm">
        <div className="flex rounded-2xl overflow-hidden">
          <div className="w-1.5 shrink-0" style={{ backgroundColor: GREEN }} />
          <div className="flex-1 p-5 space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Adresse</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Adresse</Label><Input className={inputCls} value={f.adresse || ""} onChange={e => u("adresse", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Adresse 2</Label><Input className={inputCls} value={f.adresse2 || ""} onChange={e => u("adresse2", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Ville</Label><Input className={inputCls} value={f.ville || ""} onChange={e => u("ville", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Code postal</Label><Input className={inputCls} value={f.code_postal || ""} onChange={e => u("code_postal", e.target.value)} /></div>
            </div>
          </div>
        </div>
      </Card>

      {/* Section: Banque */}
      <Card className="rounded-2xl shadow-sm">
        <div className="flex rounded-2xl overflow-hidden">
          <div className="w-1.5 shrink-0" style={{ backgroundColor: GOLD }} />
          <div className="flex-1 p-5 space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Banque</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Banque</Label><Input className={inputCls} value={f.bank_name || ""} onChange={e => u("bank_name", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">N° compte</Label><Input className={inputCls} value={f.bank_account || ""} onChange={e => u("bank_account", e.target.value)} /></div>
              <div className="md:col-span-2 space-y-1.5"><Label className="text-xs font-medium text-gray-500">IBAN</Label><Input className={inputCls} value={f.iban || ""} onChange={e => u("iban", e.target.value)} /></div>
            </div>
          </div>
        </div>
      </Card>

      {/* Section: Infos personnelles */}
      <Card className="rounded-2xl shadow-sm">
        <div className="flex rounded-2xl overflow-hidden">
          <div className="w-1.5 shrink-0" style={{ backgroundColor: "#A855F7" }} />
          <div className="flex-1 p-5 space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Infos personnelles</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Date de naissance</Label><Input type="date" className={inputCls} value={f.date_naissance?.split("T")[0] || ""} onChange={e => u("date_naissance", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Genre</Label>
                <Select value={f.genre || ""} onValueChange={v => u("genre", v)}>
                  <SelectTrigger className={inputCls}><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent><SelectItem value="M">Homme</SelectItem><SelectItem value="F">Femme</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Nationalité</Label><Input className={inputCls} value={f.nationalite || ""} onChange={e => u("nationalite", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Statut marital</Label>
                <Select value={f.statut_marital || "single"} onValueChange={v => u("statut_marital", v)}>
                  <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Célibataire</SelectItem>
                    <SelectItem value="married">Marié(e)</SelectItem>
                    <SelectItem value="divorced">Divorcé(e)</SelectItem>
                    <SelectItem value="widowed">Veuf/Veuve</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Save button */}
      <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto rounded-xl h-11 text-white font-semibold px-8" style={{ backgroundColor: GOLD }}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        Enregistrer mes modifications
      </Button>

      {/* Read-only info card */}
      <Card className="rounded-2xl shadow-sm bg-gray-50/80 border-dashed">
        <CardContent className="p-5 space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Mon emploi (lecture seule)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1"><Label className="text-xs text-gray-400">Code employé</Label><p className="text-sm font-mono bg-gray-100 text-gray-500 p-2.5 rounded-xl">{employe.code_employe || employe.code || "—"}</p></div>
            <div className="space-y-1"><Label className="text-xs text-gray-400">Date d&apos;arrivée</Label><p className="text-sm bg-gray-100 text-gray-500 p-2.5 rounded-xl">{employe.date_arrivee ? new Date(employe.date_arrivee).toLocaleDateString("fr-FR") : "—"}</p></div>
            <div className="space-y-1"><Label className="text-xs text-gray-400">Poste</Label><p className="text-sm bg-gray-100 text-gray-500 p-2.5 rounded-xl">{employe.poste || "—"}</p></div>
            <div className="space-y-1"><Label className="text-xs text-gray-400">Département</Label><p className="text-sm bg-gray-100 text-gray-500 p-2.5 rounded-xl">{employe.departement || "—"}</p></div>
            <div className="space-y-1 md:col-span-2"><Label className="text-xs text-gray-400">Adresse</Label><p className="text-sm bg-gray-100 text-gray-500 p-2.5 rounded-xl">{[employe.adresse, employe.adresse2, employe.ville, employe.code_postal].filter(Boolean).join(', ') || "—"}</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Congés tab ──
function CongesTab({ employe, onRefresh }: { employe: any; onRefresh: () => void }) {
  const [balances, setBalances] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loadingH, setLoadingH] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")
  const [typeConge, setTypeConge] = useState("AL")
  const [dateDebut, setDateDebut] = useState("")
  const [dateFin, setDateFin] = useState("")
  const [motif, setMotif] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  // Fix 4 — demi-journée state for the self-service form
  const [demiJournee, setDemiJournee] = useState(false)
  const [matinOuApresMidi, setMatinOuApresMidi] = useState<'matin' | 'apres_midi'>('matin')
  // Fix 4 — cancel-own-pending-request state
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const needsCertificat = typeConge === "SL" && dateDebut && dateFin && (() => {
    const d1 = new Date(dateDebut), d2 = new Date(dateFin)
    return (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24) > 3
  })()

  // Leave types where half-day makes sense — mirrors the RH page's allowlist.
  const DEMI_JOURNEE_ALLOWED = new Set(['AL', 'SL', 'SANS_SOLDE'])

  const refreshData = async () => {
    const [balRes, histRes] = await Promise.all([
      fetch(`/api/rh/conges?action=balances&employe_id=${employe.id}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/rh/conges?employe_id=${employe.id}`).then(r => r.json()).catch(() => ({ conges: [] })),
    ])
    setBalances(balRes.balances?.[0] || null)
    setHistory(histRes.conges || histRes.demandes || [])
  }

  useEffect(() => {
    const load = async () => {
      setLoadingH(true)
      try { await refreshData() } catch {}
      setLoadingH(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employe.id])

  const handleSubmit = async () => {
    if (!dateDebut) { setError("Veuillez renseigner la date"); return }
    const effectiveDateFin = demiJournee ? dateDebut : dateFin
    if (!effectiveDateFin) { setError("Veuillez renseigner la date de fin"); return }
    if (!demiJournee && dateFin < dateDebut) { setError("La date de fin doit être après la date de début"); return }
    if (demiJournee && !DEMI_JOURNEE_ALLOWED.has(typeConge)) {
      setError("Les demi-journées ne sont pas autorisées pour ce type de congé")
      return
    }
    setSubmitting(true); setError(""); setSuccess("")
    try {
      const res = await fetch("/api/rh/conges", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "creer",
          employe_id: employe.id,
          type_conge: typeConge,
          date_debut: dateDebut,
          date_fin: effectiveDateFin,
          motif,
          demi_journee: demiJournee,
          matin_ou_apres_midi: demiJournee ? matinOuApresMidi : null,
        }),
      })
      const data = await res.json()
      if (data.error) setError(data.error)
      else {
        setSuccess(demiJournee ? "Demi-journée soumise avec succès" : "Demande soumise avec succès")
        setDateDebut(""); setDateFin(""); setMotif(""); setFile(null)
        setDemiJournee(false); setMatinOuApresMidi('matin')
        await refreshData()
        onRefresh()
        setTimeout(() => setSuccess(""), 4000)
      }
    } catch { setError("Erreur réseau") }
    setSubmitting(false)
  }

  // Fix 4 — cancel one of her own en_attente requests.
  // The API enforces: an employee can only annuler her own leave while it's
  // still en_attente (see app/api/rh/conges/route.ts action=annuler).
  const cancelDemande = async (id: string) => {
    if (!window.confirm("Annuler cette demande de congé en attente ?")) return
    setCancellingId(id)
    setError(""); setSuccess("")
    try {
      const res = await fetch("/api/rh/conges", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "annuler", id }),
      })
      const data = await res.json()
      if (!res.ok || data.error) setError(data.error || `Erreur HTTP ${res.status}`)
      else {
        setSuccess("Demande annulée")
        await refreshData()
        onRefresh()
        setTimeout(() => setSuccess(""), 3000)
      }
    } catch { setError("Erreur réseau") }
    setCancellingId(null)
  }

  const alDroit = Number(balances?.al_droit) || 22
  const slDroit = Number(balances?.sl_droit) || 15
  const alPris = Number(balances?.al_pris) || 0
  const alImposeSociete = Number(balances?.al_impose_societe) || 0
  const alImposeEmploye = Number(balances?.al_impose_employe) || (alPris - alImposeSociete)
  const alRemaining = Number(balances?.al_solde) || (alDroit - alPris)
  const slRemaining = Number(balances?.sl_solde) || (slDroit - (Number(balances?.sl_pris) || 0))
  const alPct = alDroit > 0 ? Math.round((alRemaining / alDroit) * 100) : 0
  const slPct = slDroit > 0 ? Math.round((slRemaining / slDroit) * 100) : 0

  const statutBadge = (s: string) => {
    if (s === "approuve" || s === "approved") return <Badge style={{ backgroundColor: `${GREEN}20`, color: GREEN }}>Approuvé</Badge>
    if (s === "refuse" || s === "rejected") return <Badge style={{ backgroundColor: "#ef444420", color: "#ef4444" }}>Refusé</Badge>
    return <Badge style={{ backgroundColor: "#f9731620", color: "#f97316" }}>En attente</Badge>
  }

  const typeLabel: Record<string, string> = { AL: "Local Leave", SL: "Sick Leave", MAT: "Maternity Leave", PAT: "Paternity Leave", SANS_SOLDE: "Leave Without Pay" }
  const typeColor: Record<string, string> = { AL: GREEN, SL: "#f97316", MAT: "#8b5cf6", PAT: BLUE, SANS_SOLDE: "#6b7280" }

  return (
    <div className="space-y-6">
      {/* Balances */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${GREEN}15` }}>
                <Calendar className="h-5 w-5" style={{ color: GREEN }} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: NAVY }}>{alRemaining}<span className="text-sm font-normal text-gray-400">j</span></p>
              <p className="text-xs text-gray-500 mt-0.5">Local Leave restants / {alDroit}j</p>
            </div>
            <Progress value={alPct} className="h-2 rounded-full" style={{ backgroundColor: `${GREEN}20` }} />
            {/* Fix 4 — AL split (employé / société) when at least one day has been imposed */}
            {(alImposeSociete > 0 || alPris > 0) && (
              <div className="flex items-center justify-between text-[10px] text-gray-500 pt-1 border-t border-gray-100">
                <span>Pris: <strong className="text-gray-700">{alPris}j</strong></span>
                <span>· Moi: <strong className="text-gray-700">{alImposeEmploye}j</strong></span>
                {alImposeSociete > 0 && (
                  <span>· <span className="text-amber-700">Imposé: <strong>{alImposeSociete}j</strong></span></span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#f9731615" }}>
                <Calendar className="h-5 w-5 text-orange-500" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: NAVY }}>{slRemaining}<span className="text-sm font-normal text-gray-400">j</span></p>
              <p className="text-xs text-gray-500 mt-0.5">Sick Leave restants / {slDroit}j</p>
            </div>
            <Progress value={slPct} className="h-2 rounded-full" style={{ backgroundColor: "#f9731620" }} />
          </CardContent>
        </Card>
      </div>

      {/* Request form */}
      <Card className="rounded-xl shadow-sm">
        <CardHeader><CardTitle className="text-xl md:text-base" style={{ color: NAVY }}>Nouvelle demande</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {success && <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700"><CheckCircle className="h-4 w-4" />{success}</div>}
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

          {/* Leave type as pill selector on mobile */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Type de conge</Label>
            <div className="flex flex-wrap gap-2">
              {([
                { value: "AL", label: "Local Leave", color: GREEN },
                { value: "SL", label: "Sick Leave", color: "#f97316" },
                { value: "MAT", label: "Maternity", color: "#8b5cf6" },
                { value: "PAT", label: "Paternity", color: BLUE },
                { value: "SANS_SOLDE", label: "Sans solde", color: "#6b7280" },
              ]).map(opt => (
                <button key={opt.value} onClick={() => setTypeConge(opt.value)}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.97]"
                  style={typeConge === opt.value
                    ? { backgroundColor: opt.color, color: "white" }
                    : { backgroundColor: `${opt.color}10`, color: opt.color, border: `1px solid ${opt.color}30` }
                  }>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fix 4 — demi-journée toggle (only for types that allow it) */}
          {DEMI_JOURNEE_ALLOWED.has(typeConge) && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium" style={{ color: NAVY }}>
                <input
                  type="checkbox"
                  checked={demiJournee}
                  onChange={e => {
                    setDemiJournee(e.target.checked)
                    if (e.target.checked && dateDebut) setDateFin(dateDebut)
                  }}
                  className="h-4 w-4 rounded"
                />
                Demi-journée (0,5 jour)
              </label>
              {demiJournee && (
                <div className="pl-6 flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="demi-moment"
                      value="matin"
                      checked={matinOuApresMidi === 'matin'}
                      onChange={() => setMatinOuApresMidi('matin')}
                    />
                    Matin (AM)
                  </label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="demi-moment"
                      value="apres_midi"
                      checked={matinOuApresMidi === 'apres_midi'}
                      onChange={() => setMatinOuApresMidi('apres_midi')}
                    />
                    Après-midi (PM)
                  </label>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Date debut</Label>
              <Input
                type="date"
                value={dateDebut}
                onChange={e => {
                  setDateDebut(e.target.value)
                  // Half day: keep date_fin aligned with date_debut.
                  if (demiJournee) setDateFin(e.target.value)
                }}
                className="h-12 md:h-10 rounded-xl"
              />
            </div>
            <div>
              <Label>Date fin {demiJournee && <span className="text-[10px] text-gray-400">(même date que début)</span>}</Label>
              <Input
                type="date"
                value={demiJournee ? dateDebut : dateFin}
                disabled={demiJournee}
                onChange={e => setDateFin(e.target.value)}
                className="h-12 md:h-10 rounded-xl"
              />
            </div>
          </div>

          <div>
            <Label>Motif (optionnel)</Label>
            <Textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Raison de la demande..." rows={3} className="rounded-xl" />
          </div>

          {needsCertificat && (
            <div>
              <Label>Certificat médical (PDF/image)</Label>
              <div
                className={`mt-1 border-2 border-dashed rounded-lg p-6 text-center transition-colors ${dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300"}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(f) }}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-5 w-5 text-gray-500" />
                    <span className="text-sm">{file.name}</span>
                    <button onClick={() => setFile(null)} className="text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <div>
                    <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500">Glissez-déposez ou <label className="text-blue-600 cursor-pointer hover:underline">parcourir<input type="file" className="hidden" accept=".pdf,image/*" onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]) }} /></label></p>
                  </div>
                )}
              </div>
            </div>
          )}

          <Button onClick={handleSubmit} disabled={submitting} style={{ backgroundColor: NAVY }} className="w-full md:w-auto h-12 md:h-10 rounded-xl text-white text-base md:text-sm transition-all duration-200 active:scale-[0.98]">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CalendarPlus className="h-4 w-4 mr-2" />}
            Soumettre la demande
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <Card className="rounded-xl shadow-sm">
        <CardHeader><CardTitle className="text-xl md:text-base" style={{ color: NAVY }}>Historique</CardTitle></CardHeader>
        <CardContent>
          {loadingH ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : history.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Aucune demande de conge</p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 pr-3">Type</th>
                      <th className="pb-2 pr-3">Dates</th>
                      <th className="pb-2 pr-3">Jours</th>
                      <th className="pb-2 pr-3">Statut</th>
                      <th className="pb-2 pr-3">Motif</th>
                      <th className="pb-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((c: any, i: number) => {
                      const t = c.type_conge || "AL"
                      const d1 = c.date_debut ? new Date(c.date_debut).toLocaleDateString("fr-FR") : "—"
                      const d2 = c.date_fin ? new Date(c.date_fin).toLocaleDateString("fr-FR") : "—"
                      const days = Number(c.nb_jours) || "—"
                      const isMine = !c.employe_id || c.employe_id === employe.id
                      const canCancel = isMine && c.statut === "en_attente"
                      return (
                        <tr key={c.id || i} className="border-b last:border-0">
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-1 flex-wrap">
                              <Badge style={{ backgroundColor: `${typeColor[t] || BLUE}20`, color: typeColor[t] || BLUE }}>{typeLabel[t] || t}</Badge>
                              {c.demi_journee && (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                                  {c.matin_ou_apres_midi === 'apres_midi' ? '½ PM' : '½ AM'}
                                </span>
                              )}
                              {c.impose_par_societe && (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200" title="Imposé par la société">
                                  Imposé
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 whitespace-nowrap">
                            {c.demi_journee ? d1 : <>{d1} — {d2}</>}
                          </td>
                          <td className="py-2.5 pr-3 font-mono">{days}</td>
                          <td className="py-2.5 pr-3">{statutBadge(c.statut || c.status || "en_attente")}</td>
                          <td className="py-2.5 pr-3 text-gray-500 truncate max-w-[200px]">{c.motif || "—"}</td>
                          <td className="py-2.5 text-right">
                            {canCancel && (
                              <button
                                onClick={() => cancelDemande(c.id)}
                                disabled={cancellingId === c.id}
                                className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded disabled:opacity-50"
                              >
                                {cancellingId === c.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <X className="h-3 w-3" />}
                                Annuler
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {history.map((c: any, i: number) => {
                  const t = c.type_conge || "AL"
                  const d1 = c.date_debut ? new Date(c.date_debut).toLocaleDateString("fr-FR") : "—"
                  const d2 = c.date_fin ? new Date(c.date_fin).toLocaleDateString("fr-FR") : "—"
                  const days = c.nb_jours || (c.date_debut && c.date_fin ? Math.ceil((new Date(c.date_fin).getTime() - new Date(c.date_debut).getTime()) / (1000 * 60 * 60 * 24)) + 1 : "—")
                  const isMine = !c.employe_id || c.employe_id === employe.id
                  const canCancel = isMine && c.statut === "en_attente"
                  return (
                    <div key={c.id || i} className="p-4 border rounded-xl space-y-2 transition-all duration-200" style={{ borderLeft: `3px solid ${typeColor[t] || BLUE}` }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge className="text-xs" style={{ backgroundColor: `${typeColor[t] || BLUE}20`, color: typeColor[t] || BLUE }}>{typeLabel[t] || t}</Badge>
                          {c.demi_journee && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800">
                              {c.matin_ou_apres_midi === 'apres_midi' ? '½ PM' : '½ AM'}
                            </span>
                          )}
                          {c.impose_par_societe && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">Imposé</span>
                          )}
                        </div>
                        {statutBadge(c.statut || c.status || "en_attente")}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span style={{ color: NAVY }}>{c.demi_journee ? d1 : <>{d1} — {d2}</>}</span>
                        <span className="font-mono text-xs text-gray-400">({days}j)</span>
                      </div>
                      {c.motif && <p className="text-xs text-gray-500">{c.motif}</p>}
                      {canCancel && (
                        <button
                          onClick={() => cancelDemande(c.id)}
                          disabled={cancellingId === c.id}
                          className="mt-1 inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded disabled:opacity-50"
                        >
                          {cancellingId === c.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <X className="h-3 w-3" />}
                          Annuler
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Trajets km tab ──
function TrajetsTab({ employe }: { employe: any }) {
  const [trajets, setTrajets] = useState<any[]>([])
  const [trajetEnCours, setTrajetEnCours] = useState<any>(null)
  const [loadingT, setLoadingT] = useState(true)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [motif, setMotif] = useState("")
  const [vehicule, setVehicule] = useState("voiture")

  const loadTrajets = useCallback(() => {
    setLoadingT(true)
    fetch(`/api/rh/trajets-km?employe_id=${employe.id}`)
      .then(r => r.json())
      .then(d => {
        const all = d.trajets || []
        setTrajets(all)
        setTrajetEnCours(all.find((t: any) => t.statut === "en_cours") || null)
      })
      .catch(() => {})
      .finally(() => setLoadingT(false))
  }, [employe.id])

  useEffect(() => { loadTrajets() }, [loadTrajets])

  const getPosition = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error("Géolocalisation non supportée")); return }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => reject(err),
        { enableHighAccuracy: true, timeout: 15000 }
      )
    })
  }

  const demarrerTrajet = async () => {
    setGpsLoading(true)
    try {
      let pos: { lat: number; lng: number }
      try {
        pos = await getPosition()
      } catch (gpsErr: any) {
        alert("GPS: " + (gpsErr.message || "Géolocalisation refusée. Autorisez dans les paramètres navigateur."))
        return
      }
      const res = await fetch("/api/rh/trajets-km", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "demarrer", employe_id: employe.id, societe_id: employe.societe_id, latitude: pos.lat, longitude: pos.lng, motif: motif || "Déplacement", vehicule }),
      })
      const text = await res.text()
      let data: any
      try { data = JSON.parse(text) } catch { alert("Erreur serveur: " + text.slice(0, 200)); return }
      if (!res.ok) { alert("[" + res.status + "] " + (data.error || data.message || JSON.stringify(data).slice(0, 200))); return }
      setTrajetEnCours(data.trajet)
      loadTrajets()
    } catch (e: any) { alert("Erreur: " + (e.message || String(e))) }
    finally { setGpsLoading(false) }
  }

  const ajouterCheckpoint = async () => {
    if (!trajetEnCours) return
    setGpsLoading(true)
    try {
      const pos = await getPosition()
      const res = await fetch("/api/rh/trajets-km", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkpoint", trajet_id: trajetEnCours.id, latitude: pos.lat, longitude: pos.lng }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || "Erreur"); return }
      setTrajetEnCours((prev: any) => ({ ...prev, distance_totale_km: data.trajet?.distance_totale_km || prev?.distance_totale_km }))
    } catch (e: any) { alert("Erreur GPS: " + e.message) }
    finally { setGpsLoading(false) }
  }

  const terminerTrajet = async () => {
    if (!trajetEnCours) return
    setGpsLoading(true)
    try {
      const pos = await getPosition()
      const res = await fetch("/api/rh/trajets-km", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "terminer", trajet_id: trajetEnCours.id, latitude: pos.lat, longitude: pos.lng }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || "Erreur"); return }
      setTrajetEnCours(null)
      loadTrajets()
    } catch (e: any) { alert("Erreur GPS: " + e.message) }
    finally { setGpsLoading(false) }
  }

  const totalKm = trajets.filter((t: any) => t.statut !== "rejete").reduce((s: number, t: any) => s + (Number(t.distance_totale_km) || 0), 0)
  const totalIndemnite = trajets.filter((t: any) => t.statut === "valide").reduce((s: number, t: any) => s + (Number(t.montant_indemnite) || 0), 0)

  return (
    <div className="space-y-4">
      {trajetEnCours ? (
        <Card className="rounded-2xl shadow-sm" style={{ borderLeft: "4px solid #D4AF37" }}>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <p className="font-semibold" style={{ color: "#0B0F2E" }}>Trajet en cours</p>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-3 rounded-xl bg-gray-50 text-center">
                <p className="text-2xl font-bold" style={{ color: "#D4AF37" }}>{Number(trajetEnCours.distance_totale_km || 0).toFixed(1)}</p>
                <p className="text-xs text-gray-500">km parcourus</p>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 text-center">
                <p className="text-2xl font-bold" style={{ color: "#4191FF" }}>{trajetEnCours.vehicule || "voiture"}</p>
                <p className="text-xs text-gray-500">véhicule</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={ajouterCheckpoint} disabled={gpsLoading} className="flex-1 h-12 rounded-xl" style={{ backgroundColor: "#4191FF", color: "white" }}>
                {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Navigation className="w-4 h-4 mr-2" />}
                Checkpoint
              </Button>
              <Button onClick={terminerTrajet} disabled={gpsLoading} className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white">
                {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Square className="w-4 h-4 mr-2" />}
                Terminer
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5">
            <p className="font-semibold mb-3" style={{ color: "#0B0F2E" }}>Nouveau trajet</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-500">Véhicule</label>
                <select value={vehicule} onChange={e => setVehicule(e.target.value)} className="w-full h-11 rounded-xl border px-3 text-sm">
                  <option value="voiture">Voiture</option>
                  <option value="moto">Moto</option>
                  <option value="velo">Vélo</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Motif</label>
                <input value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ex: visite client" className="w-full h-11 rounded-xl border px-3 text-sm" />
              </div>
            </div>
            <Button onClick={demarrerTrajet} disabled={gpsLoading} className="w-full h-12 rounded-xl" style={{ backgroundColor: "#2ECC8A", color: "white" }}>
              {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              Démarrer le trajet
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl text-center" style={{ backgroundColor: "#D4AF3710" }}>
          <p className="text-2xl font-bold" style={{ color: "#D4AF37" }}>{totalKm.toFixed(1)} km</p>
          <p className="text-xs text-gray-500">Total ce mois</p>
        </div>
        <div className="p-4 rounded-2xl text-center" style={{ backgroundColor: "#2ECC8A10" }}>
          <p className="text-2xl font-bold" style={{ color: "#2ECC8A" }}>{new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(totalIndemnite)} MUR</p>
          <p className="text-xs text-gray-500">Indemnités validées</p>
        </div>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base" style={{ color: "#0B0F2E" }}>Historique des trajets</CardTitle></CardHeader>
        <CardContent>
          {loadingT ? <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin" /></div> :
          trajets.filter((t: any) => t.statut !== "en_cours").length === 0 ? <p className="text-gray-400 text-center py-6 text-sm">Aucun trajet enregistré</p> : (
            <div className="space-y-2">
              {trajets.filter((t: any) => t.statut !== "en_cours").map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-xl border" style={{ borderLeft: `3px solid ${t.statut === "valide" ? "#2ECC8A" : t.statut === "rejete" ? "#dc2626" : "#D4AF37"}` }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>{new Date(t.date_trajet).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} — {t.vehicule}</p>
                    <p className="text-xs text-gray-400">{t.motif || "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-sm">{Number(t.distance_totale_km || 0).toFixed(1)} km</p>
                    <Badge className={`text-[10px] ${t.statut === "valide" ? "bg-green-100 text-green-700" : t.statut === "rejete" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {t.statut === "valide" ? "Validé" : t.statut === "rejete" ? "Rejeté" : "En attente"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Documents tab ──
// ── Onglet Contrats ──────────────────────────────────────────────────────────
function ContratsTab({ employe }: { employe: any }) {
  const [contrats, setContrats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // Sprint 5 AMÉLIO F — dialog voir + signer
  const [viewing, setViewing] = useState<any | null>(null)
  const [signing, setSigning] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)

  const reload = useCallback(() => {
    setLoading(true)
    fetch(`/api/rh/contrats?employe_id=${employe.id}`)
      .then(r => r.json())
      .then(d => setContrats(d.contrats || []))
      .catch(() => setContrats([]))
      .finally(() => setLoading(false))
  }, [employe.id])

  useEffect(() => { reload() }, [reload])

  const STATUT_LABELS: Record<string, string> = {
    brouillon:     "À signer",
    signe_employe: "Signé — en attente employeur",
    signe:         "Signé ✓✓",
    expire:        "Expiré",
    resilie:       "Résilié",
  }
  const STATUT_COLORS: Record<string, string> = {
    brouillon:     "bg-amber-100 text-amber-700",
    signe_employe: "bg-blue-100 text-blue-700",
    signe:         "bg-green-100 text-green-700",
    expire:        "bg-orange-100 text-orange-700",
    resilie:       "bg-red-100 text-red-700",
  }

  const handleSign = async () => {
    if (!viewing) return
    setSigning(true)
    setSignError(null)
    try {
      const res = await fetch(`/api/rh/contrats/${viewing.id}/signer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signer_self" }),
      })
      const d = await res.json()
      if (!res.ok) {
        setSignError(d.error || "Erreur de signature")
        return
      }
      setViewing({ ...viewing, ...d.contrat })
      reload()
    } catch (e: any) {
      setSignError("Erreur réseau : " + (e?.message || ""))
    } finally {
      setSigning(false)
    }
  }

  return (
    <>
      <Card className="rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
            <FileText className="w-4 h-4" /> Mes contrats de travail
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" style={{ color: NAVY }} /></div>
          ) : contrats.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Aucun contrat disponible</p>
          ) : (
            <div className="space-y-3">
              {contrats.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-4 rounded-xl border bg-white hover:shadow-sm transition-shadow flex-wrap gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm" style={{ color: NAVY }}>{c.type_contrat}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_COLORS[c.statut] ?? "bg-gray-100 text-gray-600"}`}>
                        {STATUT_LABELS[c.statut] ?? c.statut}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Début : {c.date_debut ?? "—"}
                      {c.date_fin ? ` · Fin : ${c.date_fin}` : " · Durée indéterminée"}
                    </p>
                    {c.date_signature_employe && (
                      <p className="text-xs text-green-600">✓ Signé par vous le {new Date(c.date_signature_employe).toLocaleDateString("fr-FR")}</p>
                    )}
                    {c.date_signature_dirigeant && (
                      <p className="text-xs text-green-600">✓ Contresigné par l'employeur le {new Date(c.date_signature_dirigeant).toLocaleDateString("fr-FR")}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 text-xs h-8"
                      onClick={() => { setViewing(c); setSignError(null) }}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      {c.statut === "brouillon" ? "Voir & signer" : "Voir"}
                    </Button>
                    {c.id && (
                      <a href={`/api/rh/contrats/${c.id}/pdf`} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="shrink-0 text-xs h-8">
                          <Download className="w-3 h-3 mr-1" /> PDF
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sprint 5 AMÉLIO F — Dialog lecture + signature du contrat */}
      <Dialog open={!!viewing} onOpenChange={o => { if (!o) { setViewing(null); setSignError(null) } }}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Contrat {viewing?.type_contrat}{" "}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_COLORS[viewing?.statut] ?? "bg-gray-100 text-gray-600"}`}>
                {STATUT_LABELS[viewing?.statut] ?? viewing?.statut}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {(viewing?.html_content_modified || viewing?.html_content) ? (
              <>
                <div
                  className="prose prose-sm max-w-none p-4 text-sm text-gray-800"
                  dangerouslySetInnerHTML={{ __html: viewing.html_content_modified || viewing.html_content }}
                />
                {(viewing?.signature_nom_complet || viewing?.signature_image_dirigeant_url) && (
                  <div className="mx-4 mt-6 mb-4 p-4 border-t bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-2">Signature de l'employeur</p>
                    {viewing.signature_image_dirigeant_url && (
                      <img
                        src={viewing.signature_image_dirigeant_url}
                        alt="Signature dirigeant"
                        className="h-16 bg-white border p-1 rounded mb-2"
                      />
                    )}
                    {viewing.signature_nom_complet && (
                      <p className="text-sm font-medium text-gray-800">{viewing.signature_nom_complet}</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="p-6 text-center text-gray-500">Aucun contenu disponible pour ce contrat.</p>
            )}
          </div>
          {signError && (
            <div className="border-t pt-2 text-xs text-red-700 bg-red-50 rounded px-3 py-2">{signError}</div>
          )}
          <div className="border-t pt-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              En signant, vous acceptez les termes du contrat. Votre signature a valeur juridique
              (Electronic Transactions Act 2000 — Maurice).
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setViewing(null)}>Fermer</Button>
              {viewing?.statut === "brouillon" && (
                <Button
                  size="sm"
                  onClick={handleSign}
                  disabled={signing}
                  style={{ backgroundColor: GOLD, color: NAVY }}
                  className="hover:opacity-90 font-semibold"
                >
                  {signing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  Signer le contrat
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Stubbed — Fix 5: /api/rh/documents does not yet exist. Earlier code was
// fetching /api/rh/employes/<id> as a fallback (wrong endpoint) and POSTing
// multipart to a route that is not implemented. Replaced with a clean
// "coming soon" placeholder so the sidebar link doesn't look broken.
// The original implementation remains in git history and can be restored
// once the API is built.
function DocumentsTab({ employe: _employe }: { employe: any }) {
  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
          <FolderOpen className="h-4 w-4" style={{ color: GOLD }} />
          Mes documents
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-16 w-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${GOLD}15` }}>
            <FolderOpen className="h-7 w-7" style={{ color: GOLD }} />
          </div>
          <p className="text-base font-semibold mb-1" style={{ color: NAVY }}>
            Fonctionnalité à venir 🚧
          </p>
          <p className="text-sm text-gray-500 max-w-sm">
            L'espace de gestion de vos documents personnels
            (contrats, certificats, fiches d'identité…) arrive bientôt.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export default function EspaceEmployePage() {
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>("dashboard")
  const [employe, setEmploye] = useState<any>(null)
  const [pointageToday, setPointageToday] = useState<any>(null)
  const [bulletins, setBulletins] = useState<any[]>([])
  const [primes, setPrimes] = useState<any[]>([])
  const [conges, setConges] = useState<any>({ al_droit: 22, al_pris: 0, al_solde: 22, sl_droit: 15, sl_pris: 0, sl_solde: 15 })
  const [planning, setPlanning] = useState<any[]>([])
  const [annonces, setAnnonces] = useState<any[]>([])
  const [now, setNow] = useState(new Date())
  const [punching, setPunching] = useState(false)
  const [santeTab, setSanteTab] = useState("dashboard")
  const [feedback, setFeedback] = useState("")
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => { if (feedback) { const t = setTimeout(() => setFeedback(""), 4000); return () => clearTimeout(t) } }, [feedback])

  // Sync tab with URL hash (sidebar links use /salarie#conges, #bulletins, …).
  // On mount and on hashchange, if the hash is a known tab, switch to it.
  const KNOWN_TABS: Tab[] = ["dashboard", "profil", "bulletins", "planning", "primes", "conges", "documents", "trajets", "sante", "contrats"]
  useEffect(() => {
    const applyHash = () => {
      if (typeof window === "undefined") return
      const h = (window.location.hash || "").replace(/^#/, "") as Tab
      if (h && KNOWN_TABS.includes(h)) setTab(h)
    }
    applyHash()
    window.addEventListener("hashchange", applyHash)
    return () => window.removeEventListener("hashchange", applyHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // When the user clicks the in-page tab bar, keep the URL in sync so the
  // sidebar highlight follows.
  useEffect(() => {
    if (typeof window === "undefined") return
    const desired = `#${tab}`
    if (window.location.hash !== desired) {
      history.replaceState(null, "", `/salarie${desired}`)
      // Fire hashchange so the sidebar's own hashchange listener updates.
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    }
  }, [tab])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const profileRes = await fetch("/api/rh/employes/me").then(r => r.json()).catch(() => ({}))
      const emp = profileRes.employe || null
      setEmploye(emp)
      if (emp) {
        const today = todayISO()
        const periode = today.slice(0, 7)
        const [ptRes, bulRes, prRes, cgRes, plRes, histRes] = await Promise.all([
          fetch(`/api/rh/pointage?date=${today}&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ pointages: [] })),
          fetch(`/api/rh/paie?action=list&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ bulletins: [] })),
          fetch(`/api/rh/primes?type=saisie&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ primes: [] })),
          fetch(`/api/rh/conges?action=balances&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ balances: [] })),
          fetch(`/api/rh/planning?periode=${periode}&societe_id=${emp.societe_id}&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ planning: [] })),
          fetch(`/api/rh/conges?employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ conges: [] })),
        ])
        setPointageToday(ptRes.pointages?.[0] || null)
        setBulletins(bulRes.bulletins || [])
        setPrimes(prRes.primes || [])
        // Set leave balances from API
        const bal = cgRes.balances?.find((b: any) => b.employe_id === emp.id) || cgRes.balances?.[0]
        if (bal && bal.al_droit !== undefined) {
          setConges(bal)
        } else {
          // Fallback: calculate from leave history
          const histConges = (histRes.conges || histRes.demandes || []).filter((c: any) => c.statut === "approuve" || c.statut === "approved")
          const alPris = histConges.filter((c: any) => c.type_conge === "AL").reduce((s: number, c: any) => s + (Number(c.nb_jours) || 0), 0)
          const slPris = histConges.filter((c: any) => c.type_conge === "SL").reduce((s: number, c: any) => s + (Number(c.nb_jours) || 0), 0)
          setConges({
            al_droit: 22, al_pris: alPris, al_solde: 22 - alPris,
            sl_droit: 15, sl_pris: slPris, sl_solde: 15 - slPris,
          })
        }
        // Filter planning to show only this employee's entries
        // Merge planning with approved leaves — congé overrides shift
        const myPlanning = (plRes.planning || []).filter((p: any) => p.employe_id === emp.id)
        const approvedLeaves = (histRes.conges || []).filter((c: any) => c.statut === "approuve" || c.statut === "approved")
        const leaveMonthStr = today.slice(0, 7) // "2026-04"

        // Mark planning days that have approved leave (with type)
        const leaveDays = new Map<number, string>()
        for (const c of approvedLeaves) {
          const startStr = String(c.date_debut || "").slice(0, 10)
          const endStr = String(c.date_fin || c.date_debut || "").slice(0, 10)
          const leaveType = c.type_conge || "AL"
          if (!startStr) continue
          for (let d = 1; d <= 31; d++) {
            const dayStr = `${leaveMonthStr}-${String(d).padStart(2, "0")}`
            if (dayStr >= startStr && dayStr <= endStr) leaveDays.set(d, leaveType)
          }
        }

        // Override planning: mark leave days with their type
        const mergedPlanning = myPlanning.map((p: any) => {
          const lt = leaveDays.get(p.jour || p.day)
          if (lt) {
            const leaveLabels: Record<string, string> = { AL: "Local Leave", SL: "Sick Leave", MAT: "Maternité", PAT: "Paternité", SANS_SOLDE: "Sans solde" }
            return { ...p, shift: leaveLabels[lt] || "Congé", leave_type: lt, est_repos: false, heure_debut: null, heure_fin: null, heures_prevues: 0 }
          }
          return p
        })

        setPlanning(mergedPlanning)

        // Fetch announcements
        fetch("/api/rh/annonces").then(r => r.json()).then(d => setAnnonces(d.annonces || [])).catch(() => {})
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const doPunch = async (type: string) => {
    if (!employe) return
    setPunching(true)
    try {
      const res = await fetch("/api/rh/pointage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employe_id: employe.id, type_pointage: type, heure_forcee: timeMauritius(), date_pointage: todayISO() }),
      })
      const data = await res.json()
      if (data.error) setFeedback(data.message || data.error)
      else { setFeedback(data.message || `${type} enregistré`); if (data.pointage) setPointageToday(data.pointage); load() }
    } catch { setFeedback("Erreur réseau") }
    setPunching(false)
  }

  if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>
  if (!employe) return (
    <div className="flex flex-col items-center justify-center h-screen text-gray-500 p-6 text-center">
      <User className="h-16 w-16 mb-4 text-gray-300" />
      <h2 className="text-lg font-bold mb-2" style={{ color: NAVY }}>Profil employé non trouvé</h2>
      <p className="text-sm text-gray-400 mb-4 max-w-sm">
        Votre compte n&apos;est pas encore lié à une fiche employé.
        Contactez votre responsable RH pour activer votre accès.
      </p>
      <p className="text-xs text-gray-300 mb-6">Email connecté : {employe === null ? "—" : "chargement..."}</p>
      <Button onClick={async () => {
        const { createClient } = await import("@/lib/supabase/client")
        const supabase = createClient()
        await supabase.auth.signOut()
        window.location.href = "/auth/login"
      }} variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
        <LogOut className="h-4 w-4 mr-2" /> Se déconnecter
      </Button>
    </div>
  )

  const hasEntry = !!pointageToday?.heure_entree
  const hasExit = !!pointageToday?.heure_sortie
  const onPause = pointageToday?.heure_pause_debut && !pointageToday?.heure_pause_fin

  return (
    <ClientPageShell hideHero disableParticles>
    <div>
      {/* Header */}
      <div className="p-4 md:p-6" style={{ backgroundColor: NAVY }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-3">
            <Avatar className="h-16 w-16 md:h-12 md:w-12 border-2 transition-all duration-200" style={{ borderColor: GOLD }}>
              {employe.photo_url ? (
                <AvatarImage src={employe.photo_url} alt={employe.prenom} />
              ) : null}
              <AvatarFallback className="text-base md:text-sm font-bold" style={{ backgroundColor: GOLD, color: NAVY }}>
                {(employe.prenom?.[0] || "").toUpperCase()}{(employe.nom?.[0] || "").toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl md:text-xl font-bold text-white">Bonjour, {employe.prenom} {"👋"}</h1>
              <p className="text-white/60 text-xs md:text-sm">{employe.entreprise_nom || employe.poste || "—"} &middot; {todayFR()}</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <div className="text-right">
              <p className="text-3xl font-mono font-bold text-white">{now.toLocaleTimeString("fr-FR", { timeZone: MU_TZ, hour: "2-digit", minute: "2-digit" })}</p>
              <p className="text-white/40 text-xs">Maurice (UTC+4)</p>
            </div>
            <button onClick={async () => {
              const { createClient } = await import("@/lib/supabase/client")
              const supabase = createClient()
              await supabase.auth.signOut()
              window.location.href = "/auth/login"
            }} className="h-10 w-10 rounded-xl flex items-center justify-center bg-white/10 hover:bg-red-500/20 transition-colors" title="Déconnexion">
              <LogOut className="h-4 w-4 text-white/60 hover:text-red-400" />
            </button>
          </div>
          <div className="text-right md:hidden">
            <p className="text-2xl font-mono font-bold text-white">{now.toLocaleTimeString("fr-FR", { timeZone: MU_TZ, hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-6 pb-24 md:pb-6 space-y-6">
        {/* Desktop Tabs */}
        <div className="hidden md:flex gap-1 bg-white rounded-xl p-1.5 border shadow-sm">
          {([
            { id: "dashboard" as Tab, label: "Pointage", icon: LayoutDashboard },
            { id: "profil" as Tab, label: "Ma fiche", icon: User },
            { id: "bulletins" as Tab, label: "Bulletins", icon: FileText },
            { id: "planning" as Tab, label: "Planning", icon: Clock },
            { id: "primes" as Tab, label: "Primes", icon: TrendingUp },
            { id: "conges" as Tab, label: "Mes congés", icon: Calendar },
            { id: "sante" as Tab, label: "Mon Espace Sante TIBOK", icon: HeartPulse },
            { id: "trajets" as Tab, label: "Trajets km", icon: Car },
            { id: "contrats" as Tab, label: "Mes contrats", icon: FileText },
            { id: "documents" as Tab, label: "Documents", icon: FolderOpen },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm rounded-lg transition-all duration-200 ${tab === t.id ? "text-white font-medium shadow-md" : "text-gray-500 hover:bg-gray-50"}`}
              style={tab === t.id ? { backgroundColor: NAVY } : {}}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </div>

        {/* Pointage / Dashboard */}
        {tab === "dashboard" && (() => {
          const lastBulletin = bulletins.length > 0 ? bulletins[0] : null
          const estimatedNet = lastBulletin?.salaire_net || 0
          const estimatedBase = lastBulletin?.salaire_base || 0
          const estimatedBrut = lastBulletin?.salaire_brut || 0
          const alTotal = Number(conges.al_droit) || 22
          const slTotal = Number(conges.sl_droit) || 15
          const alPris = Number(conges.al_pris) || 0
          const slPris = Number(conges.sl_pris) || 0
          const alRemaining = Number(conges.al_solde) || (alTotal - alPris)
          const slRemaining = Number(conges.sl_solde) || (slTotal - slPris)
          const alPct = alTotal > 0 ? Math.round((alRemaining / alTotal) * 100) : 0
          const slPct = slTotal > 0 ? Math.round((slRemaining / slTotal) * 100) : 0

          // Recent notifications
          const notifications: { icon: typeof Bell; text: string; time: string }[] = []
          if (lastBulletin) {
            const per = lastBulletin.periode || ""
            const mIdx = parseInt(per.slice(5, 7), 10) - 1
            const yr = per.slice(0, 4)
            notifications.push({ icon: Bell, text: `Bulletin ${MONTH_NAMES_FR[mIdx] || ""} ${yr} disponible`, time: lastBulletin.created_at ? new Date(lastBulletin.created_at).toLocaleDateString("fr-FR") : "" })
          }

          return (
            <div className="space-y-4">
              {/* Next salary preview */}
              {estimatedNet > 0 && (
                <Card className="overflow-hidden rounded-xl shadow-sm" style={{ border: `2px solid ${GOLD}30` }}>
                  <CardContent className="p-4 md:p-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-gray-500">Prochain salaire estimé</p>
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${GOLD}15` }}>
                        <CreditCard className="h-4 w-4" style={{ color: GOLD }} />
                      </div>
                    </div>
                    <p className="text-3xl md:text-2xl font-bold font-mono mb-1" style={{ color: NAVY }}>~MRs {fmt(estimatedNet)}</p>
                    {estimatedBase > 0 && (
                      <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-1">
                        <span>Base: {fmt(estimatedBase)}</span>
                        {estimatedBrut > estimatedBase && <span>| Brut: {fmt(estimatedBrut)}</span>}
                      </div>
                    )}
                    <p className="text-xs" style={{ color: GOLD }}>Versement le {lastDayOfMonth()}</p>
                  </CardContent>
                </Card>
              )}

              {/* Pointage card */}
              <Card className="rounded-xl shadow-sm">
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <div className="p-3 bg-emerald-50 rounded-xl"><p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wide">Entree</p><p className="font-mono text-lg text-emerald-700 mt-1">{fmtH(pointageToday?.heure_entree)}</p></div>
                    <div className="p-3 bg-amber-50 rounded-xl"><p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wide">Pause</p><p className="font-mono text-lg text-amber-600 mt-1">{pointageToday?.heure_pause_debut ? `${fmtH(pointageToday.heure_pause_debut)}${pointageToday.heure_pause_fin ? `-${fmtH(pointageToday.heure_pause_fin)}` : "..."}` : "—"}</p></div>
                    <div className="p-3 bg-red-50 rounded-xl"><p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wide">Sortie</p><p className="font-mono text-lg text-red-600 mt-1">{fmtH(pointageToday?.heure_sortie)}</p></div>
                    <div className="p-3 bg-blue-50 rounded-xl"><p className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wide">Duree</p><p className="font-mono text-lg mt-1" style={{ color: NAVY }}>{pointageToday?.duree_minutes ? `${(pointageToday.duree_minutes / 60).toFixed(1)}h` : "—"}</p></div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Button onClick={() => doPunch("entree")} disabled={punching || hasEntry} className="h-12 md:h-14 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm md:text-base transition-all duration-200 active:scale-[0.97]"><LogIn className="h-5 w-5 mr-2" /> Entree</Button>
                    <Button onClick={() => doPunch("pause_debut")} disabled={punching || !hasEntry || hasExit || onPause} className="h-12 md:h-14 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm md:text-base transition-all duration-200 active:scale-[0.97]"><Coffee className="h-5 w-5 mr-2" /> Pause</Button>
                    <Button onClick={() => doPunch("pause_fin")} disabled={punching || !onPause} className="h-12 md:h-14 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm md:text-base transition-all duration-200 active:scale-[0.97]"><Coffee className="h-5 w-5 mr-2" /> Fin pause</Button>
                    <Button onClick={() => doPunch("sortie")} disabled={punching || !hasEntry || hasExit} className="h-12 md:h-14 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm md:text-base transition-all duration-200 active:scale-[0.97]"><LogOut className="h-5 w-5 mr-2" /> Sortie</Button>
                  </div>
                  {feedback && <p className="text-sm text-center p-2.5 rounded-xl bg-blue-50 text-blue-700">{feedback}</p>}
                </CardContent>
              </Card>

              {/* Leave balances with circular progress */}
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                <Card className="rounded-xl shadow-sm">
                  <CardContent className="p-4 flex flex-col items-center text-center">
                    <div className="relative h-20 w-20 mb-3">
                      <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="34" fill="none" stroke={`${GREEN}20`} strokeWidth="8" />
                        <circle cx="40" cy="40" r="34" fill="none" stroke={GREEN} strokeWidth="8" strokeLinecap="round"
                          strokeDasharray={`${2 * Math.PI * 34}`} strokeDashoffset={`${2 * Math.PI * 34 * (1 - alPct / 100)}`}
                          className="transition-all duration-700" />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-bold" style={{ color: NAVY }}>{alRemaining}j</span>
                      </div>
                    </div>
                    <p className="font-medium text-sm" style={{ color: NAVY }}>Conges annuels</p>
                    <p className="text-xs text-gray-400">sur {alTotal}j</p>
                  </CardContent>
                </Card>
                <Card className="rounded-xl shadow-sm">
                  <CardContent className="p-4 flex flex-col items-center text-center">
                    <div className="relative h-20 w-20 mb-3">
                      <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="34" fill="none" stroke="#f9731620" strokeWidth="8" />
                        <circle cx="40" cy="40" r="34" fill="none" stroke="#f97316" strokeWidth="8" strokeLinecap="round"
                          strokeDasharray={`${2 * Math.PI * 34}`} strokeDashoffset={`${2 * Math.PI * 34 * (1 - slPct / 100)}`}
                          className="transition-all duration-700" />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-bold" style={{ color: NAVY }}>{slRemaining}j</span>
                      </div>
                    </div>
                    <p className="font-medium text-sm" style={{ color: NAVY }}>Sick Leave</p>
                    <p className="text-xs text-gray-400">sur {slTotal}j</p>
                  </CardContent>
                </Card>
              </div>

              {/* Annonces / Communications */}
              {annonces.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">Communications</p>
                  {annonces.slice(0, 3).map((a: any) => {
                    const typeStyles: Record<string, { bg: string; border: string; icon: string; text: string }> = {
                      urgent: { bg: "#dc262608", border: "#dc2626", icon: "🚨", text: "#dc2626" },
                      rh: { bg: `${BLUE}08`, border: BLUE, icon: "📋", text: BLUE },
                      celebration: { bg: `${GOLD}08`, border: GOLD, icon: "🎉", text: GOLD },
                      rappel: { bg: "#ea580c08", border: "#ea580c", icon: "⏰", text: "#ea580c" },
                      info: { bg: "#05966908", border: "#059669", icon: "ℹ️", text: "#059669" },
                    }
                    const s = typeStyles[a.type] || typeStyles.info
                    return (
                      <div key={a.id} className="p-4 rounded-2xl transition-all duration-200" style={{ backgroundColor: s.bg, borderLeft: `4px solid ${s.border}` }}>
                        <div className="flex items-start gap-3">
                          <span className="text-lg flex-shrink-0">{s.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold" style={{ color: s.text }}>{a.titre}</p>
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{a.contenu}</p>
                            <p className="text-[10px] text-gray-400 mt-1.5">{new Date(a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</p>
                          </div>
                          {a.priorite >= 2 && <Badge className="bg-red-100 text-red-700 text-[10px] flex-shrink-0">Urgent</Badge>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Prochains jours fériés */}
              {(() => {
                const HOLIDAYS_2026 = [
                  { date: "2026-01-01", name: "New Year" },
                  { date: "2026-01-02", name: "New Year (2nd day)" },
                  { date: "2026-01-02", name: "Thaipoosam Cavadee" },
                  { date: "2026-02-01", name: "Abolition of Slavery" },
                  { date: "2026-02-15", name: "Maha Shivaratree" },
                  { date: "2026-02-17", name: "Chinese Spring Festival" },
                  { date: "2026-03-12", name: "Independence & Republic Day" },
                  { date: "2026-03-20", name: "Eid-Ul-Fitr" },
                  { date: "2026-04-03", name: "Ougadi" },
                  { date: "2026-05-01", name: "Labour Day" },
                  { date: "2026-08-15", name: "Assumption" },
                  { date: "2026-08-26", name: "Ganesh Chaturthi" },
                  { date: "2026-11-02", name: "Arrival of Indentured Labourers" },
                  { date: "2026-11-08", name: "Divali" },
                  { date: "2026-12-25", name: "Christmas" },
                ]
                const today = new Date().toISOString().split("T")[0]
                const upcoming = HOLIDAYS_2026.filter(h => h.date >= today).slice(0, 3)
                if (upcoming.length === 0) return null
                return (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">Prochains jours fériés</p>
                    {upcoming.map((h, i) => {
                      const d = new Date(h.date + "T12:00:00")
                      const daysUntil = Math.ceil((d.getTime() - new Date().getTime()) / 86400000)
                      const dayNum = d.getDate()
                      const monthShort = d.toLocaleDateString("fr-FR", { month: "short" }).toUpperCase()
                      return (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "#f8f9fc", border: "1px solid #e8eaef" }}>
                          <div className="flex flex-col items-center justify-center w-11 h-11 rounded-lg flex-shrink-0" style={{ backgroundColor: daysUntil <= 7 ? `${GOLD}12` : "#eef0f4" }}>
                            <span className="text-[10px] font-semibold leading-none" style={{ color: daysUntil <= 7 ? GOLD : "#9ca3af" }}>{monthShort}</span>
                            <span className="text-base font-bold leading-none" style={{ color: daysUntil <= 7 ? NAVY : "#6b7280" }}>{dayNum}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: NAVY }}>{h.name}</p>
                            <p className="text-xs text-gray-400">{d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0" style={{ backgroundColor: daysUntil <= 7 ? `${GOLD}15` : "#f3f4f6", color: daysUntil <= 7 ? GOLD : "#9ca3af" }}>
                            {daysUntil === 0 ? "Aujourd'hui" : daysUntil === 1 ? "Demain" : `J-${daysUntil}`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Quick actions grid */}
              <div className="grid grid-cols-2 gap-3">
                {([
                  { icon: FileText, label: "Mes bulletins", onClick: () => setTab("bulletins"), color: BLUE, bg: `linear-gradient(135deg, ${BLUE}08, ${BLUE}15)` },
                  { icon: CalendarPlus, label: "Demander un conge", onClick: () => setTab("conges"), color: GREEN, bg: `linear-gradient(135deg, ${GREEN}08, ${GREEN}15)` },
                  { icon: HeartPulse, label: "Mon Espace Sante", onClick: () => setTab("sante"), color: "#7c3aed", bg: "linear-gradient(135deg, #7c3aed08, #7c3aed15)" },
                  { icon: Calendar, label: "Mon planning", onClick: () => setTab("planning"), color: GOLD, bg: `linear-gradient(135deg, ${GOLD}08, ${GOLD}15)` },
                ] as const).map((action, i) => (
                  <Card key={i}
                    className="cursor-pointer rounded-xl shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.97] border-0"
                    onClick={action.onClick}
                    style={{ background: action.bg }}>
                    <CardContent className="p-4 md:p-5 flex flex-col items-center gap-2.5 text-center">
                      <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${action.color}15` }}>
                        <action.icon className="h-6 w-6" style={{ color: action.color }} />
                      </div>
                      <p className="text-sm font-medium" style={{ color: NAVY }}>{action.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Recent notifications (desktop only) */}
              {notifications.length > 0 && (
                <Card className="hidden md:block rounded-xl shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2" style={{ color: NAVY }}>
                      <Bell className="h-4 w-4" /> Notifications récentes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-2">
                    {notifications.map((n, i) => (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                        <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${BLUE}15` }}>
                          <n.icon className="h-4 w-4" style={{ color: BLUE }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: NAVY }}>{n.text}</p>
                          {n.time && <p className="text-xs text-gray-400">{n.time}</p>}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )
        })()}

        {/* Ma fiche */}
        {tab === "profil" && employe && (
          <MaFicheTab employe={employe} onUpdated={load} />
        )}

        {/* Bulletins */}
        {tab === "bulletins" && (
          <div>
            <h2 className="text-xl font-bold mb-4" style={{ color: NAVY }}>Mes bulletins de salaire</h2>
            {bulletins.length === 0 ? <Card className="rounded-xl shadow-sm"><CardContent><p className="text-gray-400 text-center py-8">Aucun bulletin disponible</p></CardContent></Card> : (
              <div className="space-y-3">
                {bulletins.map((b: any) => {
                  const isRead = !!b.lu_le
                  const periodeLabel = new Date((b.periode || "2025-01") + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
                  return (
                    <Card key={b.id} className="rounded-xl shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md" style={{ borderLeft: `4px solid ${isRead ? GREEN : GOLD}` }}>
                      <CardContent className="p-4">
                        {/* Header: month + badge */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <p className="text-lg md:text-base font-bold capitalize" style={{ color: NAVY }}>{periodeLabel}</p>
                            {isRead ? (
                              <Badge className="text-[10px] px-1.5 py-0" style={{ backgroundColor: `${GREEN}20`, color: GREEN }}>Lu</Badge>
                            ) : (
                              <Badge className="text-[10px] px-1.5 py-0 font-semibold" style={{ backgroundColor: `${GOLD}25`, color: GOLD }}>Nouveau</Badge>
                            )}
                          </div>
                        </div>
                        {/* Net amount prominent */}
                        <p className="text-2xl font-bold font-mono mb-2" style={{ color: NAVY }}>{fmt(b.salaire_net || 0)} <span className="text-sm font-normal text-gray-400">MUR net à payer</span></p>
                        {/* Payroll breakdown */}
                        <div className="flex flex-wrap gap-2 text-xs mb-4">
                          <span className="px-2 py-1 rounded-lg bg-gray-50 text-gray-600">Base: {fmt(b.salaire_base || 0)}</span>
                          {Number(b.heures_sup_montant) > 0 && <span className="px-2 py-1 rounded-lg" style={{ backgroundColor: "#ea580c10", color: "#ea580c" }}>OT: {fmt(b.heures_sup_montant)}</span>}
                          {Number(b.special_allowance_1) > 0 && <span className="px-2 py-1 rounded-lg" style={{ backgroundColor: "#7c3aed10", color: "#7c3aed" }}>Primes: {fmt(b.special_allowance_1)}</span>}
                          <span className="px-2 py-1 rounded-lg" style={{ backgroundColor: `${BLUE}10`, color: BLUE }}>Brut total: {fmt(b.salaire_brut || 0)}</span>
                          {Number(b.total_deductions) > 0 && <span className="px-2 py-1 rounded-lg" style={{ backgroundColor: "#dc262610", color: "#dc2626" }}>Déductions: -{fmt(b.total_deductions)}</span>}
                        </div>
                        {/* Action buttons - stacked on mobile */}
                        <div className="flex flex-col md:flex-row gap-2">
                          <Button variant="outline" className="h-11 md:h-9 rounded-xl w-full md:w-auto transition-all duration-200" onClick={() => {
                            window.open(`/api/rh/paie/pdf?employe_id=${employe.id}&periode=${b.periode}&bulletin_id=${b.id}&view=1`, '_blank')
                            if (!b.lu_le) { fetch(`/api/rh/paie?action=mark_read&bulletin_id=${b.id}`, { method: "POST" }).catch(() => {}); load() }
                          }}>
                            <Eye className="h-4 w-4 mr-2" />Voir le bulletin
                          </Button>
                          <Button variant="outline" className="h-11 md:h-9 rounded-xl w-full md:w-auto transition-all duration-200" onClick={() => window.open(`/api/rh/paie/pdf?employe_id=${employe.id}&periode=${b.periode}&bulletin_id=${b.id}`, '_blank')}>
                            <Download className="h-4 w-4 mr-2" />Telecharger PDF
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Planning */}
        {tab === "planning" && (() => {
          const periodeMonth = new Date().toISOString().slice(0, 7)
          const monthLabel = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
          const sorted = [...planning].sort((a: any, b: any) => (a.jour || 0) - (b.jour || 0))
          const workDays = sorted.filter((p: any) => !p.est_repos && p.shift !== 'Repos' && p.shift !== 'R' && !p.leave_type)
          const leaveDaysCount = sorted.filter((p: any) => !!p.leave_type)
          const reposDays = sorted.filter((p: any) => (p.est_repos || p.shift === 'Repos' || p.shift === 'R') && !p.leave_type)
          const totalHours = workDays.reduce((s: number, p: any) => s + (Number(p.heures_prevues) || 0), 0)

          const shiftColors: Record<string, { bg: string; text: string; icon: string }> = {
            "Journée": { bg: "#4191FF15", text: "#4191FF", icon: "☀️" },
            "Jour": { bg: "#4191FF15", text: "#4191FF", icon: "☀️" },
            "J": { bg: "#4191FF15", text: "#4191FF", icon: "☀️" },
            "Matin": { bg: "#05966915", text: "#059669", icon: "🌅" },
            "M": { bg: "#05966915", text: "#059669", icon: "🌅" },
            "Après-midi": { bg: "#D4AF3715", text: "#D4AF37", icon: "🌤️" },
            "AM": { bg: "#D4AF3715", text: "#D4AF37", icon: "🌤️" },
            "Nuit": { bg: "#6366f115", text: "#6366f1", icon: "🌙" },
            "N": { bg: "#6366f115", text: "#6366f1", icon: "🌙" },
          }
          const leaveTypeColors: Record<string, { bg: string; text: string; icon: string }> = {
            "AL": { bg: "#3b82f615", text: "#2563eb", icon: "🏖️" },
            "SL": { bg: "#f9731615", text: "#ea580c", icon: "🏥" },
            "MAT": { bg: "#a855f715", text: "#9333ea", icon: "👶" },
            "PAT": { bg: "#6366f115", text: "#4f46e5", icon: "👨‍👶" },
            "SANS_SOLDE": { bg: "#6b728015", text: "#4b5563", icon: "📋" },
          }
          const getShiftStyle = (shift: string, leaveType?: string) => {
            if (leaveType) return leaveTypeColors[leaveType] || { bg: "#10b98115", text: "#059669", icon: "📋" }
            return shiftColors[shift] || { bg: "#4191FF15", text: "#4191FF", icon: "📋" }
          }

          return (
            <div className="space-y-4">
              {/* Header avec stats */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold capitalize" style={{ color: NAVY }}>{monthLabel}</h2>
                <div className="flex gap-2">
                  <Badge className="text-xs px-2 py-1" style={{ backgroundColor: `${BLUE}15`, color: BLUE }}>{workDays.length}j travail</Badge>
                  <Badge className="text-xs px-2 py-1 bg-gray-100 text-gray-500">{reposDays.length}j repos</Badge>
                </div>
              </div>

              {/* Stats cards */}
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: `${BLUE}10` }}>
                  <p className="text-xl font-bold" style={{ color: BLUE }}>{workDays.length}</p>
                  <p className="text-[10px] text-gray-500">Travail</p>
                </div>
                <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: `${GOLD}10` }}>
                  <p className="text-xl font-bold" style={{ color: GOLD }}>{totalHours}h</p>
                  <p className="text-[10px] text-gray-500">Heures</p>
                </div>
                <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: "#3b82f610" }}>
                  <p className="text-xl font-bold text-blue-600">{leaveDaysCount.length}</p>
                  <p className="text-[10px] text-gray-500">Congés</p>
                </div>
                <div className="rounded-2xl p-3 text-center bg-gray-50">
                  <p className="text-xl font-bold text-gray-400">{reposDays.length}</p>
                  <p className="text-[10px] text-gray-500">Repos</p>
                </div>
              </div>

              {planning.length === 0 ? (
                <Card className="rounded-2xl">
                  <CardContent className="py-12 text-center">
                    <Calendar className="h-12 w-12 mx-auto text-gray-200 mb-4" />
                    <p className="text-gray-400 font-medium">Aucun planning publié</p>
                    <p className="text-xs text-gray-300 mt-1">Le planning sera visible une fois publié par le RH</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {sorted.map((p: any, i: number) => {
                    const isRepos = p.est_repos || p.shift === 'Repos' || p.shift === 'R'
                    const isLeave = !!p.leave_type
                    const dateStr = `${periodeMonth}-${String(p.jour).padStart(2, '0')}`
                    const dateObj = new Date(dateStr + "T12:00:00")
                    const dayNum = dateObj.getDate()
                    const dayName = dateObj.toLocaleDateString("fr-FR", { weekday: "short" })
                    const isToday = dateStr === new Date().toISOString().slice(0, 10)
                    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6
                    const style = isRepos && !isLeave ? null : getShiftStyle(p.shift || "Jour", p.leave_type)

                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-3 p-3 rounded-2xl transition-all duration-200 ${isToday ? "ring-2 ring-offset-2" : ""}`}
                        style={{
                          backgroundColor: isRepos && !isLeave ? (isWeekend ? "#f9fafb" : "#f3f4f6") : style?.bg,
                          ...(isToday ? { ringColor: GOLD } : {}),
                        }}
                      >
                        {/* Date circle */}
                        <div
                          className="flex flex-col items-center justify-center rounded-xl w-12 h-12 flex-shrink-0"
                          style={{
                            backgroundColor: isToday ? GOLD : isRepos && !isLeave ? "#e5e7eb" : "white",
                            color: isToday ? "white" : isRepos && !isLeave ? "#9ca3af" : NAVY,
                          }}
                        >
                          <span className="text-[10px] font-medium uppercase leading-none">{dayName}</span>
                          <span className="text-lg font-bold leading-none">{dayNum}</span>
                        </div>

                        {/* Shift info */}
                        <div className="flex-1 min-w-0">
                          {isRepos && !isLeave ? (
                            <p className="text-sm font-medium text-gray-400">Repos</p>
                          ) : isLeave ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{style?.icon}</span>
                              <p className="text-sm font-semibold" style={{ color: style?.text }}>{p.shift}</p>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{style?.icon}</span>
                                <p className="text-sm font-semibold" style={{ color: style?.text }}>{p.shift || "Travail"}</p>
                              </div>
                              {p.heure_debut && (
                                <p className="text-xs text-gray-500 mt-0.5 font-mono">
                                  {String(p.heure_debut).slice(0,5)} — {String(p.heure_fin).slice(0,5)}
                                </p>
                              )}
                            </>
                          )}
                        </div>

                        {/* Hours badge */}
                        {!isRepos && !isLeave && p.heures_prevues && (
                          <div className="rounded-xl px-2.5 py-1 text-xs font-bold flex-shrink-0" style={{ backgroundColor: "white", color: style?.text }}>
                            {p.heures_prevues}h
                          </div>
                        )}

                        {/* Today indicator */}
                        {isToday && (
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: GOLD }} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

        {/* Primes & OT History */}
        {tab === "primes" && (
          <div className="space-y-4">
            {/* OT from bulletins */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base" style={{ color: NAVY }}>Historique heures supplémentaires</CardTitle></CardHeader>
              <CardContent>
                {bulletins.filter((b: any) => Number(b.heures_sup_montant) > 0).length === 0 ? (
                  <p className="text-gray-400 text-center py-4 text-sm">Aucune heure supplémentaire enregistrée</p>
                ) : (
                  <div className="space-y-2">
                    {bulletins.filter((b: any) => Number(b.heures_sup_montant) > 0).map((b: any) => (
                      <div key={b.id} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: `${GOLD}08`, border: `1px solid ${GOLD}20` }}>
                        <div>
                          <p className="font-medium text-sm capitalize" style={{ color: NAVY }}>
                            {new Date((b.periode || "2025-01") + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                          </p>
                        </div>
                        <p className="font-mono font-bold" style={{ color: GOLD }}>{fmt(b.heures_sup_montant)} MUR</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Primes par bulletin (depuis special_allowance_1) */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base" style={{ color: NAVY }}>Primes & allocations par mois</CardTitle></CardHeader>
              <CardContent>
                {bulletins.filter((b: any) => Number(b.special_allowance_1) > 0).length === 0 && primes.length === 0 ? <p className="text-gray-400 text-center py-4 text-sm">Aucune prime enregistrée</p> : (
                  <div className="space-y-2">
                    {bulletins.filter((b: any) => Number(b.special_allowance_1) > 0).map((b: any) => (
                      <div key={b.id + "-primes"} className="p-3 border rounded-lg" style={{ borderLeft: `3px solid #7c3aed` }}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-sm capitalize">{new Date((b.periode || "2025-01") + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</p>
                          <p className="font-mono font-bold" style={{ color: "#7c3aed" }}>{fmt(b.special_allowance_1)} MUR</p>
                        </div>
                        {b.notes && <p className="text-xs text-gray-500">{b.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Primes détaillées (saisies individuellement) */}
            {primes.length > 0 && <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base" style={{ color: NAVY }}>Primes individuelles saisies</CardTitle></CardHeader>
              <CardContent>
                {primes.length === 0 ? <p className="text-gray-400 text-center py-4 text-sm">Aucune prime saisie</p> : (
                  <div className="space-y-2">
                    {primes.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{p.prime?.libelle || p.libelle || "Prime"}</p>
                          <p className="text-xs text-gray-500">
                            {p.periode ? new Date(p.periode + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "—"}
                            {p.quantite ? ` • Qté: ${p.quantite}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold" style={{ color: "#7c3aed" }}>{fmt(p.montant || 0)} MUR</p>
                          <Badge className={`text-[10px] ${p.approuve ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{p.approuve ? "Validée" : "En attente"}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>}

            {/* Total from bulletins */}
            {bulletins.length > 0 && (
              <Card style={{ borderLeft: `3px solid ${GOLD}` }}>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500 mb-1">Total primes & OT perçus (année en cours)</p>
                  <p className="text-xl font-bold" style={{ color: GOLD }}>
                    {fmt(bulletins.reduce((s: number, b: any) => s + (Number(b.special_allowance_1) || 0) + (Number(b.heures_sup_montant) || 0), 0))} MUR
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Congés */}
        {tab === "conges" && employe && (
          <CongesTab employe={employe} onRefresh={load} />
        )}

        {/* Trajets kilométriques */}
        {tab === "trajets" && employe && (
          <TrajetsTab employe={employe} />
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SANTE TIBOK — Telemedecine integree (style tibok.mu) */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {tab === "sante" && (() => {
          const TEAL = "#2a9d8f"
          const santeNav = [
            { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
            { id: "salle_attente", label: "Salle d'attente", icon: Video },
            { id: "rdv", label: "RDV a venir", icon: Calendar },
            { id: "consultations", label: "Vos Consultations", icon: FileText },
            { id: "pharmacie", label: "Pharmacie (Ordonnances)", icon: Pill },
            { id: "analyses", label: "Analyses & Examens", icon: Activity },
            { id: "abonnement", label: "Abonnement", icon: CreditCard },
            { id: "famille", label: "Famille", icon: User },
            { id: "second_avis", label: "Second Avis Medical", icon: Stethoscope },
            { id: "assurance", label: "Validation Assurance", icon: ShieldCheck },
            { id: "suivi", label: "Suivi Chronique", icon: HeartPulse },
            { id: "silentcheck", label: "SilentCheck", icon: Scan },
          ]

          const ProcessFlow = ({ title, icon: FlowIcon, steps }: { title: string; icon: any; steps: { icon: any; label: string; desc: string; color: string }[] }) => (
            <Card className="rounded-2xl border shadow-sm mb-4">
              <div className="p-5">
                <div className="flex items-center gap-2 mb-5">
                  <FlowIcon className="h-5 w-5" style={{ color: TEAL }} />
                  <h3 className="text-base font-semibold" style={{ color: NAVY }}>{title}</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  {steps.map((step, i) => (
                    <div key={i} className="flex flex-col items-center text-center">
                      <div className="h-14 w-14 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: `${step.color}12` }}>
                        <step.icon className="h-6 w-6" style={{ color: step.color }} />
                      </div>
                      <p className="text-xs font-semibold" style={{ color: NAVY }}>{step.label}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{step.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )

          return (
            <div className="flex gap-0 -mx-4 md:-mx-6 min-h-[70vh]">
              {/* Sidebar TIBOK — desktop only */}
              <div className="hidden md:flex flex-col w-56 shrink-0 bg-white border-r pt-4">
                <div className="px-4 mb-5">
                  <span className="text-2xl font-black tracking-tight" style={{ color: TEAL }}>TIB</span>
                  <span className="text-2xl font-black tracking-tight bg-clip-text" style={{ color: "#2563eb" }}>O</span>
                  <span className="text-2xl font-black tracking-tight" style={{ color: TEAL }}>K</span>
                </div>
                <nav className="flex-1 px-2 space-y-0.5">
                  {santeNav.map(item => (
                    <button key={item.id} onClick={() => setSanteTab(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm transition-all ${
                        santeTab === item.id ? "text-white font-medium" : "text-gray-600 hover:bg-gray-50"
                      }`}
                      style={santeTab === item.id ? { backgroundColor: TEAL } : {}}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  ))}
                </nav>
              </div>

              {/* Mobile TIBOK tab bar */}
              <div className="md:hidden flex overflow-x-auto gap-1 bg-white border-b px-2 py-2 -mt-2 mb-3 sticky top-0 z-10">
                {santeNav.slice(0, 6).map(item => (
                  <button key={item.id} onClick={() => setSanteTab(item.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all ${
                      santeTab === item.id ? "text-white" : "text-gray-500 bg-gray-100"
                    }`}
                    style={santeTab === item.id ? { backgroundColor: TEAL } : {}}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Main content */}
              <div className="flex-1 p-4 md:p-6 overflow-y-auto">
                {/* Dashboard */}
                {santeTab === "dashboard" && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold" style={{ color: NAVY }}>Bonjour {employe?.prenom}</h2>
                      <p className="text-gray-400 text-sm">Votre sante au bout des doigts</p>
                    </div>

                    {/* CTA Consultation */}
                    <Card className="rounded-2xl border-0 shadow-md overflow-hidden">
                      <div className="h-1.5 w-full" style={{ backgroundColor: TEAL }} />
                      <div className="p-8 text-center">
                        <div className="h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${TEAL}10` }}>
                          <Video className="h-7 w-7" style={{ color: TEAL }} />
                        </div>
                        <p className="text-lg font-semibold" style={{ color: TEAL }}>Consultation immediate ou sur Rendez-vous</p>
                        <div className="flex items-center justify-center gap-3 mt-3">
                          <span className="px-3 py-1 rounded-full text-xs border" style={{ borderColor: TEAL, color: TEAL }}>Securise</span>
                          <span className="px-3 py-1 rounded-full text-xs border" style={{ borderColor: TEAL, color: TEAL }}>Certifie</span>
                        </div>
                        <button className="mt-5 w-full md:w-auto px-8 py-3.5 rounded-full text-white font-semibold text-sm flex items-center justify-center gap-2 mx-auto transition-all hover:opacity-90 active:scale-[0.98]"
                          style={{ backgroundColor: TEAL }}
                          onClick={() => window.open("https://tibok.mu", "_blank")}
                        >
                          Commencer <Play className="h-4 w-4" style={{ marginLeft: 2 }} />
                        </button>
                      </div>
                    </Card>

                    {/* Quick links */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { icon: FileText, label: "Vos Consultations", desc: "Rapports et ordonnances", tab: "consultations" },
                        { icon: Pill, label: "Pharmacie (Ordonnances)", desc: "Gerer vos commandes", tab: "pharmacie" },
                      ].map((item, i) => (
                        <button key={i} onClick={() => setSanteTab(item.tab)}
                          className="w-full text-left rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-all active:scale-[0.99]">
                          <div className="h-1" style={{ backgroundColor: TEAL }} />
                          <div className="p-4 flex items-center gap-3">
                            <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${TEAL}10` }}>
                              <item.icon className="h-5 w-5" style={{ color: TEAL }} />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-semibold" style={{ color: NAVY }}>{item.label}</p>
                              <p className="text-xs text-gray-400">{item.desc}</p>
                            </div>
                            <Play className="h-4 w-4 text-gray-300 shrink-0" />
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Suivi chronique */}
                    <button onClick={() => setSanteTab("suivi")}
                      className="w-full text-left rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-all active:scale-[0.99]">
                      <div className="h-1" style={{ backgroundColor: TEAL }} />
                      <div className="p-4 flex items-center gap-3">
                        <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${TEAL}10` }}>
                          <HeartPulse className="h-5 w-5" style={{ color: TEAL }} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold" style={{ color: NAVY }}>Suivi Maladies Chroniques</p>
                          <p className="text-xs text-gray-400">Tension, glycemie, poids</p>
                        </div>
                        <Play className="h-4 w-4 text-gray-300 shrink-0" />
                      </div>
                    </button>

                    {/* Process: Pharmacie */}
                    <ProcessFlow title="Comment ca marche - Pharmacie" icon={Pill} steps={[
                      { icon: CreditCard, label: "Paiement", desc: "Paiement securise de Rs 800", color: TEAL },
                      { icon: Clock, label: "File d'attente", desc: "Rejoignez la file virtuelle", color: "#f59e0b" },
                      { icon: Video, label: "Consultation video", desc: "Consultez un medecin qualifie", color: TEAL },
                      { icon: Stethoscope, label: "Diagnostic", desc: "Recevez votre diagnostic", color: "#059669" },
                      { icon: FileText, label: "Ordonnance numerique", desc: "Generee automatiquement", color: "#2563eb" },
                    ]} />

                    {/* Process: Laboratoire */}
                    <ProcessFlow title="Comment ca marche - Laboratoire" icon={Activity} steps={[
                      { icon: CreditCard, label: "Paiement", desc: "Paiement securise de Rs 800", color: TEAL },
                      { icon: Clock, label: "File d'attente", desc: "Rejoignez la file virtuelle", color: "#f59e0b" },
                      { icon: Video, label: "Consultation video", desc: "Consultez un medecin qualifie", color: TEAL },
                      { icon: Stethoscope, label: "Diagnostic", desc: "Recevez votre diagnostic", color: "#059669" },
                      { icon: FileText, label: "Ordonnance numerique", desc: "Generee automatiquement", color: "#2563eb" },
                    ]} />
                    <div className="ml-0">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 px-5 pb-5">
                        {[
                          { icon: CheckCircle, label: "Validation analyses", desc: "Validez vos analyses prescrites", color: TEAL },
                          { icon: Calendar, label: "Choix du laboratoire", desc: "Selectionnez le labo et le mode", color: "#f59e0b" },
                          { icon: CreditCard, label: "Paiement analyses", desc: "Paiement securise", color: TEAL },
                          { icon: Stethoscope, label: "Prelevement", desc: "A domicile ou au laboratoire", color: "#7c3aed" },
                          { icon: FileText, label: "Resultats", desc: "Sur votre espace patient", color: "#2563eb" },
                        ].map((step, i) => (
                          <div key={i} className="flex flex-col items-center text-center">
                            <div className="h-14 w-14 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: `${step.color}12` }}>
                              <step.icon className="h-6 w-6" style={{ color: step.color }} />
                            </div>
                            <p className="text-xs font-semibold" style={{ color: NAVY }}>{step.label}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{step.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Process: Radiologie */}
                    <ProcessFlow title="Comment ca marche - Radiologie" icon={Scan} steps={[
                      { icon: CreditCard, label: "Paiement", desc: "Paiement securise de Rs 800", color: TEAL },
                      { icon: Clock, label: "File d'attente", desc: "Rejoignez la file virtuelle", color: "#f59e0b" },
                      { icon: Video, label: "Consultation video", desc: "Consultez un medecin qualifie", color: TEAL },
                      { icon: Stethoscope, label: "Diagnostic", desc: "Recevez votre diagnostic", color: "#059669" },
                      { icon: FileText, label: "Ordonnance numerique", desc: "Generee automatiquement", color: "#2563eb" },
                    ]} />
                    <div className="ml-0">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 px-5 pb-5">
                        {[
                          { icon: CheckCircle, label: "Validation examens", desc: "Validez vos examens prescrits", color: TEAL },
                          { icon: Calendar, label: "Choix du centre", desc: "Selectionnez le centre de radiologie", color: "#f59e0b" },
                          { icon: CreditCard, label: "Paiement examens", desc: "Paiement securise", color: TEAL },
                          { icon: MapPin, label: "Rendez-vous", desc: "Presentez-vous au centre", color: "#7c3aed" },
                          { icon: FileText, label: "Resultats", desc: "Resultats et images sur votre espace", color: "#2563eb" },
                        ].map((step, i) => (
                          <div key={i} className="flex flex-col items-center text-center">
                            <div className="h-14 w-14 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: `${step.color}12` }}>
                              <step.icon className="h-6 w-6" style={{ color: step.color }} />
                            </div>
                            <p className="text-xs font-semibold" style={{ color: NAVY }}>{step.label}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{step.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Other tabs — placeholder */}
                {santeTab !== "dashboard" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setSanteTab("dashboard")} className="h-8 w-8 rounded-lg flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors">
                        <X className="h-4 w-4 text-gray-500" />
                      </button>
                      <h2 className="text-lg font-bold" style={{ color: NAVY }}>
                        {santeNav.find(n => n.id === santeTab)?.label}
                      </h2>
                    </div>
                    <Card className="rounded-2xl">
                      <div className="p-12 text-center">
                        <div className="h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${TEAL}10` }}>
                          {(() => { const NavIcon = santeNav.find(n => n.id === santeTab)?.icon || HeartPulse; return <NavIcon className="h-7 w-7" style={{ color: TEAL }} /> })()}
                        </div>
                        <p className="text-sm font-semibold" style={{ color: NAVY }}>
                          {santeNav.find(n => n.id === santeTab)?.label}
                        </p>
                        <p className="text-xs text-gray-400 mt-2 max-w-sm mx-auto">
                          Cette section sera connectee a votre espace TIBOK. Cliquez ci-dessous pour acceder a la plateforme complete.
                        </p>
                        <button className="mt-5 px-6 py-3 rounded-full text-white font-medium text-sm inline-flex items-center gap-2 transition-all hover:opacity-90 active:scale-[0.98]"
                          style={{ backgroundColor: TEAL }}
                          onClick={() => window.open("https://tibok.mu", "_blank")}
                        >
                          Ouvrir sur TIBOK <Play className="h-4 w-4" />
                        </button>
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* Documents */}
        {tab === "contrats" && employe && (
          <ContratsTab employe={employe} />
        )}
        {tab === "documents" && employe && (
          <DocumentsTab employe={employe} />
        )}
      </div>

      {/* Mobile "More" menu overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40" onClick={() => setMobileMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute bottom-[72px] left-0 right-0 bg-white rounded-t-2xl shadow-xl p-4 space-y-1 animate-in slide-in-from-bottom" onClick={e => e.stopPropagation()}>
            <p className="text-xs text-gray-400 uppercase tracking-wider px-3 pb-2">Plus</p>
            {([
              { id: "profil" as Tab, label: "Ma fiche", icon: User },
              { id: "planning" as Tab, label: "Planning", icon: Clock },
              { id: "primes" as Tab, label: "Primes & OT", icon: TrendingUp },
              { id: "trajets" as Tab, label: "Trajets km", icon: Car },
              { id: "documents" as Tab, label: "Documents", icon: FolderOpen },
            ]).map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setMobileMenuOpen(false) }}
                className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left transition-all duration-200 active:scale-[0.98]"
                style={tab === t.id ? { backgroundColor: `${NAVY}08`, color: NAVY } : { color: "#6b7280" }}>
                <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: tab === t.id ? `${GOLD}15` : "#f3f4f6" }}>
                  <t.icon className="h-5 w-5" style={{ color: tab === t.id ? GOLD : "#9ca3af" }} />
                </div>
                <span className="font-medium text-sm">{t.label}</span>
              </button>
            ))}
            <div className="border-t border-gray-200 mt-2 pt-2">
              <button onClick={async () => {
                const { createClient } = await import("@/lib/supabase/client")
                const supabase = createClient()
                await supabase.auth.signOut()
                window.location.href = "/auth/login"
              }}
                className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left text-red-600 transition-all duration-200 active:scale-[0.98]">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-red-50">
                  <LogOut className="h-5 w-5 text-red-500" />
                </div>
                <span className="font-medium text-sm">Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t" style={{ borderColor: "#E2E5F0", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex items-center justify-around px-2 h-[68px]">
          {([
            { id: "dashboard" as Tab, label: "Home", icon: LayoutDashboard },
            { id: "bulletins" as Tab, label: "Bulletins", icon: FileText },
            { id: "sante" as Tab, label: "Ma Sante", icon: HeartPulse },
            { id: "conges" as Tab, label: "Conges", icon: Calendar },
            { id: "more" as const, label: "Plus", icon: MoreHorizontal },
          ]).map(t => {
            const isMore = t.id === "more"
            const isActive = isMore ? (mobileMenuOpen || ["profil", "primes", "documents"].includes(tab)) : tab === t.id
            return (
              <button key={t.id}
                onClick={() => {
                  if (isMore) { setMobileMenuOpen(v => !v) }
                  else { setTab(t.id as Tab); setMobileMenuOpen(false) }
                }}
                className="flex flex-col items-center justify-center gap-1 min-w-[56px] py-1.5 transition-all duration-200 active:scale-95"
              >
                <div className="relative">
                  {isActive && <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full" style={{ backgroundColor: GOLD }} />}
                  <t.icon className="h-6 w-6 transition-colors duration-200" style={{ color: isActive ? GOLD : "#9ca3af" }} />
                </div>
                <span className="text-[10px] font-medium transition-colors duration-200" style={{ color: isActive ? GOLD : "#9ca3af" }}>{t.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
    </ClientPageShell>
  )
}

