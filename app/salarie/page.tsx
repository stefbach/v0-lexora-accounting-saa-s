"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Loader2, Clock, Calendar, CreditCard, TrendingUp, LogIn, LogOut, Coffee, Download, User, Save, CheckCircle, FileText, CalendarPlus, UserCircle, FolderOpen, Bell, Eye, Upload, X, LayoutDashboard, MoreHorizontal, Car, MapPin, Navigation, Play, Square } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"

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

type Tab = "dashboard" | "profil" | "bulletins" | "planning" | "primes" | "conges" | "documents" | "trajets"

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

  const needsCertificat = typeConge === "SL" && dateDebut && dateFin && (() => {
    const d1 = new Date(dateDebut), d2 = new Date(dateFin)
    return (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24) > 3
  })()

  useEffect(() => {
    const load = async () => {
      setLoadingH(true)
      try {
        const [balRes, histRes] = await Promise.all([
          fetch(`/api/rh/conges?action=balances&employe_id=${employe.id}`).then(r => r.json()).catch(() => ({})),
          fetch(`/api/rh/conges?employe_id=${employe.id}`).then(r => r.json()).catch(() => ({ conges: [] })),
        ])
        setBalances(balRes.balances?.[0] || null)
        setHistory(histRes.conges || histRes.demandes || [])
      } catch {}
      setLoadingH(false)
    }
    load()
  }, [employe.id])

  const handleSubmit = async () => {
    if (!dateDebut || !dateFin) { setError("Veuillez renseigner les dates"); return }
    if (dateFin < dateDebut) { setError("La date de fin doit être après la date de début"); return }
    setSubmitting(true); setError(""); setSuccess("")
    try {
      const res = await fetch("/api/rh/conges", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "creer", employe_id: employe.id, type_conge: typeConge, date_debut: dateDebut, date_fin: dateFin, motif }),
      })
      const data = await res.json()
      if (data.error) setError(data.error)
      else {
        setSuccess("Demande soumise avec succès")
        setDateDebut(""); setDateFin(""); setMotif(""); setFile(null)
        // Refresh history
        const histRes = await fetch(`/api/rh/conges?employe_id=${employe.id}`).then(r => r.json()).catch(() => ({ conges: [] }))
        setHistory(histRes.conges || histRes.demandes || [])
        const balRes = await fetch(`/api/rh/conges?action=balances&employe_id=${employe.id}`).then(r => r.json()).catch(() => ({}))
        setBalances(balRes.balances?.[0] || null)
        onRefresh()
        setTimeout(() => setSuccess(""), 4000)
      }
    } catch { setError("Erreur réseau") }
    setSubmitting(false)
  }

  const alRemaining = balances?.al_solde ?? 20
  const slRemaining = balances?.sl_solde ?? 15
  const alPct = Math.round((alRemaining / 22) * 100)
  const slPct = Math.round((slRemaining / 15) * 100)

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
              <p className="text-xs text-gray-500 mt-0.5">Local Leave restants / 22j</p>
            </div>
            <Progress value={alPct} className="h-2 rounded-full" style={{ backgroundColor: `${GREEN}20` }} />
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
              <p className="text-xs text-gray-500 mt-0.5">Sick Leave restants / 15j</p>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Date debut</Label>
              <Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} className="h-12 md:h-10 rounded-xl" />
            </div>
            <div>
              <Label>Date fin</Label>
              <Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className="h-12 md:h-10 rounded-xl" />
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
                      <th className="pb-2">Motif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((c: any, i: number) => {
                      const t = c.type_conge || "AL"
                      const d1 = c.date_debut ? new Date(c.date_debut).toLocaleDateString("fr-FR") : "—"
                      const d2 = c.date_fin ? new Date(c.date_fin).toLocaleDateString("fr-FR") : "—"
                      const days = Number(c.nb_jours) || "—"
                      return (
                        <tr key={c.id || i} className="border-b last:border-0">
                          <td className="py-2.5 pr-3"><Badge style={{ backgroundColor: `${typeColor[t] || BLUE}20`, color: typeColor[t] || BLUE }}>{typeLabel[t] || t}</Badge></td>
                          <td className="py-2.5 pr-3 whitespace-nowrap">{d1} — {d2}</td>
                          <td className="py-2.5 pr-3 font-mono">{days}</td>
                          <td className="py-2.5 pr-3">{statutBadge(c.statut || c.status || "en_attente")}</td>
                          <td className="py-2.5 text-gray-500 truncate max-w-[200px]">{c.motif || "—"}</td>
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
                  return (
                    <div key={c.id || i} className="p-4 border rounded-xl space-y-2 transition-all duration-200" style={{ borderLeft: `3px solid ${typeColor[t] || BLUE}` }}>
                      <div className="flex items-center justify-between">
                        <Badge className="text-xs" style={{ backgroundColor: `${typeColor[t] || BLUE}20`, color: typeColor[t] || BLUE }}>{typeLabel[t] || t}</Badge>
                        {statutBadge(c.statut || c.status || "en_attente")}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span style={{ color: NAVY }}>{d1} — {d2}</span>
                        <span className="font-mono text-xs text-gray-400">({days}j)</span>
                      </div>
                      {c.motif && <p className="text-xs text-gray-500">{c.motif}</p>}
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
      const pos = await getPosition()
      const res = await fetch("/api/rh/trajets-km", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "demarrer", employe_id: employe.id, societe_id: employe.societe_id, latitude: pos.lat, longitude: pos.lng, motif, vehicule }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || "Erreur"); return }
      setTrajetEnCours(data.trajet)
      loadTrajets()
    } catch (e: any) { alert("Erreur GPS: " + (e.message || "Activez la géolocalisation")) }
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
function DocumentsTab({ employe }: { employe: any }) {
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/rh/employes/${employe.id}`).then(r => r.json()).catch(() => ({}))
        setDocuments(res.documents || res.employe?.documents || [])
      } catch {}
      setLoading(false)
    }
    load()
  }, [employe.id])

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("employe_id", employe.id)
      const res = await fetch("/api/rh/documents", { method: "POST", body: formData })
      const data = await res.json()
      if (!data.error) {
        setDocuments(prev => [data.document || { nom: file.name, created_at: new Date().toISOString() }, ...prev])
      }
    } catch {}
    setUploading(false)
  }

  const catColor: Record<string, string> = { identite: BLUE, contrat: NAVY, medical: "#f97316", formation: "#8b5cf6", autre: "#6b7280" }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base" style={{ color: NAVY }}>Mes documents</CardTitle>
        <label>
          <Button variant="outline" size="sm" disabled={uploading} asChild>
            <span className="cursor-pointer">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Ajouter un document
            </span>
          </Button>
          <input type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]) }} />
        </label>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : documents.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Aucun document</p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc: any, i: number) => {
              const cat = doc.categorie || doc.category || "autre"
              return (
                <div key={doc.id || i} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${NAVY}10` }}>
                      <FileText className="h-5 w-5" style={{ color: NAVY }} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate" style={{ color: NAVY }}>{doc.nom || doc.name || "Document"}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge className="text-[10px] px-1.5 py-0" style={{ backgroundColor: `${catColor[cat] || "#6b7280"}20`, color: catColor[cat] || "#6b7280" }}>{cat}</Badge>
                        {doc.created_at && <span className="text-xs text-gray-400">{new Date(doc.created_at).toLocaleDateString("fr-FR")}</span>}
                      </div>
                    </div>
                  </div>
                  {(doc.url || doc.file_url) && (
                    <Button variant="outline" size="sm" className="h-8 px-2 shrink-0" onClick={() => window.open(doc.url || doc.file_url, "_blank")}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
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
  const [conges, setConges] = useState<any>({ al_solde: 20, sl_solde: 15 })
  const [planning, setPlanning] = useState<any[]>([])
  const [annonces, setAnnonces] = useState<any[]>([])
  const [now, setNow] = useState(new Date())
  const [punching, setPunching] = useState(false)
  const [feedback, setFeedback] = useState("")
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => { if (feedback) { const t = setTimeout(() => setFeedback(""), 4000); return () => clearTimeout(t) } }, [feedback])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const profileRes = await fetch("/api/rh/employes/me").then(r => r.json()).catch(() => ({}))
      const emp = profileRes.employe || null
      setEmploye(emp)
      if (emp) {
        const today = todayISO()
        const periode = today.slice(0, 7)
        const [ptRes, bulRes, prRes, cgRes, plRes] = await Promise.all([
          fetch(`/api/rh/pointage?date=${today}&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ pointages: [] })),
          fetch(`/api/rh/paie?action=list&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ bulletins: [] })),
          fetch(`/api/rh/primes?type=saisie&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ primes: [] })),
          fetch(`/api/rh/conges?action=balances&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ balances: [] })),
          fetch(`/api/rh/planning?periode=${periode}&societe_id=${emp.societe_id}&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ planning: [] })),
        ])
        setPointageToday(ptRes.pointages?.[0] || null)
        setBulletins(bulRes.bulletins || [])
        setPrimes(prRes.primes || [])
        if (cgRes.balances?.[0]) setConges(cgRes.balances[0])
        // Filter planning to show only this employee's entries
        setPlanning((plRes.planning || []).filter((p: any) => p.employe_id === emp.id))

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
    <div className="min-h-screen bg-gray-50">
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
            { id: "trajets" as Tab, label: "Trajets km", icon: Car },
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
          const alTotal = 22
          const slTotal = 15
          const alRemaining = conges.al_solde ?? 20
          const slRemaining = conges.sl_solde ?? 15
          const alPct = Math.round((alRemaining / alTotal) * 100)
          const slPct = Math.round((slRemaining / slTotal) * 100)

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
                  { icon: Calendar, label: "Mon planning", onClick: () => setTab("planning"), color: GOLD, bg: `linear-gradient(135deg, ${GOLD}08, ${GOLD}15)` },
                  { icon: FolderOpen, label: "Mes documents", onClick: () => setTab("documents"), color: NAVY, bg: `linear-gradient(135deg, ${NAVY}08, ${NAVY}15)` },
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
          const workDays = sorted.filter((p: any) => !p.est_repos && p.shift !== 'Repos' && p.shift !== 'R')
          const reposDays = sorted.filter((p: any) => p.est_repos || p.shift === 'Repos' || p.shift === 'R')
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
          const getShiftStyle = (shift: string) => shiftColors[shift] || { bg: "#4191FF15", text: "#4191FF", icon: "📋" }

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
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl p-4 text-center" style={{ backgroundColor: `${BLUE}10` }}>
                  <p className="text-2xl font-bold" style={{ color: BLUE }}>{workDays.length}</p>
                  <p className="text-[11px] text-gray-500">Jours travaillés</p>
                </div>
                <div className="rounded-2xl p-4 text-center" style={{ backgroundColor: `${GOLD}10` }}>
                  <p className="text-2xl font-bold" style={{ color: GOLD }}>{totalHours}h</p>
                  <p className="text-[11px] text-gray-500">Heures prévues</p>
                </div>
                <div className="rounded-2xl p-4 text-center bg-gray-50">
                  <p className="text-2xl font-bold text-gray-400">{reposDays.length}</p>
                  <p className="text-[11px] text-gray-500">Repos</p>
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
                    const dateStr = `${periodeMonth}-${String(p.jour).padStart(2, '0')}`
                    const dateObj = new Date(dateStr + "T12:00:00")
                    const dayNum = dateObj.getDate()
                    const dayName = dateObj.toLocaleDateString("fr-FR", { weekday: "short" })
                    const isToday = dateStr === new Date().toISOString().slice(0, 10)
                    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6
                    const style = isRepos ? null : getShiftStyle(p.shift || "Jour")

                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-3 p-3 rounded-2xl transition-all duration-200 ${isToday ? "ring-2 ring-offset-2" : ""}`}
                        style={{
                          backgroundColor: isRepos ? (isWeekend ? "#f9fafb" : "#f3f4f6") : style?.bg,
                          ...(isToday ? { ringColor: GOLD } : {}),
                        }}
                      >
                        {/* Date circle */}
                        <div
                          className="flex flex-col items-center justify-center rounded-xl w-12 h-12 flex-shrink-0"
                          style={{
                            backgroundColor: isToday ? GOLD : isRepos ? "#e5e7eb" : "white",
                            color: isToday ? "white" : isRepos ? "#9ca3af" : NAVY,
                          }}
                        >
                          <span className="text-[10px] font-medium uppercase leading-none">{dayName}</span>
                          <span className="text-lg font-bold leading-none">{dayNum}</span>
                        </div>

                        {/* Shift info */}
                        <div className="flex-1 min-w-0">
                          {isRepos ? (
                            <p className="text-sm font-medium text-gray-400">Repos</p>
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
                        {!isRepos && p.heures_prevues && (
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


        {/* Documents */}
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
            { id: "conges" as Tab, label: "Conges", icon: Calendar },
            { id: "planning" as Tab, label: "Planning", icon: Clock },
            { id: "more" as const, label: "Menu", icon: MoreHorizontal },
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
  )
}
