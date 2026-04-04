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
import { Loader2, Clock, Calendar, CreditCard, TrendingUp, LogIn, LogOut, Coffee, Download, User, Save, CheckCircle, FileText, CalendarPlus, UserCircle, FolderOpen, Bell, Eye } from "lucide-react"

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

type Tab = "dashboard" | "profil" | "bulletins" | "planning" | "primes"

// ── Ma fiche — composant isolé (pas de re-render parent) ──
function MaFicheTab({ employe, onUpdated }: { employe: any; onUpdated: () => void }) {
  const [f, setF] = useState({ ...employe })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const u = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))

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
      else { setSaved(true); setTimeout(() => setSaved(false), 3000); onUpdated() }
    } catch { alert("Erreur réseau") }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      {saved && <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700"><CheckCircle className="h-4 w-4" /> Informations mises à jour</div>}

      {/* Infos modifiables */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base" style={{ color: NAVY }}>Mes coordonnées</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Email</Label><Input type="email" value={f.email || ""} onChange={e => u("email", e.target.value)} /></div>
          <div><Label>Mobile</Label><Input value={f.mobile || ""} onChange={e => u("mobile", e.target.value)} placeholder="+230 5XXX XXXX" /></div>
          <div><Label>Téléphone</Label><Input value={f.telephone || ""} onChange={e => u("telephone", e.target.value)} /></div>
          <div><Label>Adresse</Label><Input value={f.adresse || ""} onChange={e => u("adresse", e.target.value)} /></div>
          <div><Label>Adresse 2</Label><Input value={f.adresse2 || ""} onChange={e => u("adresse2", e.target.value)} /></div>
          <div><Label>Ville</Label><Input value={f.ville || ""} onChange={e => u("ville", e.target.value)} /></div>
          <div><Label>Code postal</Label><Input value={f.code_postal || ""} onChange={e => u("code_postal", e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base" style={{ color: NAVY }}>Informations personnelles</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Date de naissance</Label><Input type="date" value={f.date_naissance?.split("T")[0] || ""} onChange={e => u("date_naissance", e.target.value)} /></div>
          <div><Label>Genre</Label>
            <Select value={f.genre || ""} onValueChange={v => u("genre", v)}>
              <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
              <SelectContent><SelectItem value="M">Homme</SelectItem><SelectItem value="F">Femme</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label>Statut marital</Label>
            <Select value={f.statut_marital || "single"} onValueChange={v => u("statut_marital", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Célibataire</SelectItem>
                <SelectItem value="married">Marié(e)</SelectItem>
                <SelectItem value="divorced">Divorcé(e)</SelectItem>
                <SelectItem value="widowed">Veuf/Veuve</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Nationalité</Label><Input value={f.nationalite || ""} onChange={e => u("nationalite", e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base" style={{ color: NAVY }}>Coordonnées bancaires</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Banque</Label><Input value={f.bank_name || ""} onChange={e => u("bank_name", e.target.value)} /></div>
          <div><Label>N° compte</Label><Input value={f.bank_account || ""} onChange={e => u("bank_account", e.target.value)} /></div>
          <div className="md:col-span-2"><Label>IBAN</Label><Input value={f.iban || ""} onChange={e => u("iban", e.target.value)} /></div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} style={{ backgroundColor: NAVY }} className="text-white">
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        Enregistrer mes modifications
      </Button>

      {/* Infos lecture seule */}
      <Card className="opacity-75">
        <CardHeader className="pb-2"><CardTitle className="text-base text-gray-500">Mon emploi (lecture seule)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label className="text-gray-400">Code employé</Label><p className="text-sm font-mono bg-gray-50 p-2 rounded">{employe.code_employe || employe.code || "—"}</p></div>
          <div><Label className="text-gray-400">Poste</Label><p className="text-sm bg-gray-50 p-2 rounded">{employe.poste || "—"}</p></div>
          <div><Label className="text-gray-400">Département</Label><p className="text-sm bg-gray-50 p-2 rounded">{employe.departement || "—"}</p></div>
          <div><Label className="text-gray-400">Type contrat</Label><p className="text-sm bg-gray-50 p-2 rounded">{employe.contrat_type || "Fulltime"}</p></div>
          <div><Label className="text-gray-400">Date d'arrivée</Label><p className="text-sm bg-gray-50 p-2 rounded">{employe.date_arrivee ? new Date(employe.date_arrivee).toLocaleDateString("fr-FR") : "—"}</p></div>
          <div><Label className="text-gray-400">NIC</Label><p className="text-sm font-mono bg-gray-50 p-2 rounded">{employe.nic_number || "—"}</p></div>
          <div><Label className="text-gray-400">Salaire de base</Label><p className="text-sm font-mono bg-gray-50 p-2 rounded">{employe.salaire_base ? `${Number(employe.salaire_base).toLocaleString("fr-FR")} MUR` : "—"}</p></div>
          <div><Label className="text-gray-400">Devise</Label><p className="text-sm bg-gray-50 p-2 rounded">{employe.devise_salaire || "MUR"}</p></div>
        </CardContent>
      </Card>
    </div>
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
  const [now, setNow] = useState(new Date())
  const [punching, setPunching] = useState(false)
  const [feedback, setFeedback] = useState("")

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => { if (feedback) { const t = setTimeout(() => setFeedback(""), 4000); return () => clearTimeout(t) } }, [feedback])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const profileRes = await fetch("/api/rh/employes?me=1").then(r => r.json()).catch(() => ({}))
      const emp = profileRes.employe || profileRes.employes?.[0] || null
      setEmploye(emp)
      if (emp) {
        const today = todayISO()
        const periode = today.slice(0, 7)
        const [ptRes, bulRes, prRes, cgRes, plRes] = await Promise.all([
          fetch(`/api/rh/pointage?date=${today}&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ pointages: [] })),
          fetch(`/api/rh/paie?action=list&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ bulletins: [] })),
          fetch(`/api/rh/primes?type=saisie&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ primes: [] })),
          fetch(`/api/rh/conges?action=balances&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ balances: [] })),
          fetch(`/api/rh/planning?periode=${periode}&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ planning: [] })),
        ])
        setPointageToday(ptRes.pointages?.[0] || null)
        setBulletins(bulRes.bulletins || [])
        setPrimes(prRes.primes || [])
        if (cgRes.balances?.[0]) setConges(cgRes.balances[0])
        setPlanning(plRes.planning || [])
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
  if (!employe) return <div className="flex flex-col items-center justify-center h-screen text-gray-500"><User className="h-12 w-12 mb-3 text-gray-300" /><p>Aucun profil employé associé à ce compte</p></div>

  const hasEntry = !!pointageToday?.heure_entree
  const hasExit = !!pointageToday?.heure_sortie
  const onPause = pointageToday?.heure_pause_debut && !pointageToday?.heure_pause_fin

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="p-4 md:p-6" style={{ backgroundColor: NAVY }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 border-2" style={{ borderColor: GOLD }}>
              {employe.photo_url ? (
                <AvatarImage src={employe.photo_url} alt={employe.prenom} />
              ) : null}
              <AvatarFallback className="text-sm font-bold" style={{ backgroundColor: GOLD, color: NAVY }}>
                {(employe.prenom?.[0] || "").toUpperCase()}{(employe.nom?.[0] || "").toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-bold text-white">Bonjour, {employe.prenom} {"👋"}</h1>
              <p className="text-white/60 text-sm">{employe.entreprise_nom || employe.poste || "—"} &middot; {todayFR()}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-mono font-bold text-white">{now.toLocaleTimeString("fr-FR", { timeZone: MU_TZ, hour: "2-digit", minute: "2-digit" })}</p>
            <p className="text-white/40 text-xs">Maurice (UTC+4)</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-lg p-1 border">
          {([
            { id: "dashboard" as Tab, label: "Pointage", icon: Clock },
            { id: "profil" as Tab, label: "Ma fiche", icon: User },
            { id: "bulletins" as Tab, label: "Bulletins", icon: CreditCard },
            { id: "planning" as Tab, label: "Planning", icon: Calendar },
            { id: "primes" as Tab, label: "Primes", icon: TrendingUp },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm rounded-md transition-colors ${tab === t.id ? "text-white font-medium shadow" : "text-gray-500 hover:bg-gray-50"}`}
              style={tab === t.id ? { backgroundColor: NAVY } : {}}>
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </div>

        {/* Pointage / Dashboard */}
        {tab === "dashboard" && (() => {
          const lastBulletin = bulletins.length > 0 ? bulletins[0] : null
          const estimatedNet = lastBulletin?.salaire_net || lastBulletin?.salaire_base || 0
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
                <Card className="overflow-hidden" style={{ borderLeft: `4px solid ${GOLD}` }}>
                  <CardContent className="p-5 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Prochain salaire estimé</p>
                      <p className="text-2xl font-bold font-mono" style={{ color: NAVY }}>~MRs {fmt(estimatedNet)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Versement prévu le</p>
                      <p className="text-sm font-medium" style={{ color: GOLD }}>{lastDayOfMonth()}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Pointage card */}
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-4 gap-3 text-center">
                    <div className="p-3 bg-emerald-50 rounded-lg"><p className="text-xs text-gray-500">Entrée</p><p className="font-mono text-lg text-emerald-700">{fmtH(pointageToday?.heure_entree)}</p></div>
                    <div className="p-3 bg-amber-50 rounded-lg"><p className="text-xs text-gray-500">Pause</p><p className="font-mono text-lg text-amber-600">{pointageToday?.heure_pause_debut ? `${fmtH(pointageToday.heure_pause_debut)}${pointageToday.heure_pause_fin ? `—${fmtH(pointageToday.heure_pause_fin)}` : "..."}` : "—"}</p></div>
                    <div className="p-3 bg-red-50 rounded-lg"><p className="text-xs text-gray-500">Sortie</p><p className="font-mono text-lg text-red-600">{fmtH(pointageToday?.heure_sortie)}</p></div>
                    <div className="p-3 bg-blue-50 rounded-lg"><p className="text-xs text-gray-500">Durée</p><p className="font-mono text-lg" style={{ color: NAVY }}>{pointageToday?.duree_minutes ? `${(pointageToday.duree_minutes / 60).toFixed(1)}h` : "—"}</p></div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Button onClick={() => doPunch("entree")} disabled={punching || hasEntry} className="h-14 bg-emerald-600 hover:bg-emerald-700 text-white text-base"><LogIn className="h-5 w-5 mr-2" /> Entrée</Button>
                    <Button onClick={() => doPunch("pause_debut")} disabled={punching || !hasEntry || hasExit || onPause} className="h-14 bg-amber-500 hover:bg-amber-600 text-white text-base"><Coffee className="h-5 w-5 mr-2" /> Pause</Button>
                    <Button onClick={() => doPunch("pause_fin")} disabled={punching || !onPause} className="h-14 bg-amber-600 hover:bg-amber-700 text-white text-base"><Coffee className="h-5 w-5 mr-2" /> Fin pause</Button>
                    <Button onClick={() => doPunch("sortie")} disabled={punching || !hasEntry || hasExit} className="h-14 bg-red-600 hover:bg-red-700 text-white text-base"><LogOut className="h-5 w-5 mr-2" /> Sortie</Button>
                  </div>
                  {feedback && <p className="text-sm text-center p-2 rounded bg-blue-50 text-blue-700">{feedback}</p>}
                </CardContent>
              </Card>

              {/* Leave balances with progress bars */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" style={{ color: GREEN }} />
                        <p className="font-medium text-sm" style={{ color: NAVY }}>Congés annuels</p>
                      </div>
                      <Badge className="text-xs" style={{ backgroundColor: `${GREEN}20`, color: GREEN }}>{alPct}%</Badge>
                    </div>
                    <Progress value={alPct} className="h-3" style={{ backgroundColor: `${GREEN}20` }} />
                    <p className="text-sm text-gray-600">{alRemaining}j / {alTotal}j restants</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-orange-500" />
                        <p className="font-medium text-sm" style={{ color: NAVY }}>Sick Leave</p>
                      </div>
                      <Badge className="text-xs" style={{ backgroundColor: "#f97316" + "20", color: "#f97316" }}>{slPct}%</Badge>
                    </div>
                    <Progress value={slPct} className="h-3" style={{ backgroundColor: "#f9731620" }} />
                    <p className="text-sm text-gray-600">{slRemaining}j / {slTotal}j restants</p>
                  </CardContent>
                </Card>
              </div>

              {/* Quick actions grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {([
                  { icon: FileText, label: "Mes bulletins", onClick: () => setTab("bulletins"), color: BLUE },
                  { icon: CalendarPlus, label: "Demander un congé", onClick: () => window.open("/conges/demande", "_self"), color: GREEN },
                  { icon: UserCircle, label: "Mon profil", onClick: () => setTab("profil"), color: GOLD },
                  { icon: FolderOpen, label: "Mes documents", onClick: () => setTab("bulletins"), color: NAVY },
                ] as const).map((action, i) => (
                  <Card key={i}
                    className="cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                    onClick={action.onClick}
                    style={{ borderTop: `3px solid ${action.color}` }}>
                    <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
                      <action.icon className="h-6 w-6" style={{ color: action.color }} />
                      <p className="text-sm font-medium" style={{ color: NAVY }}>{action.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Recent notifications */}
              {notifications.length > 0 && (
                <Card>
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
          <Card>
            <CardHeader><CardTitle className="text-base" style={{ color: NAVY }}>Mes bulletins de salaire</CardTitle></CardHeader>
            <CardContent>
              {bulletins.length === 0 ? <p className="text-gray-400 text-center py-8">Aucun bulletin disponible</p> : (
                <div className="space-y-3">
                  {bulletins.map((b: any) => {
                    const isRead = !!b.lu_le
                    const periodeLabel = new Date((b.periode || "2025-01") + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
                    return (
                      <div key={b.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors" style={{ borderLeft: `3px solid ${isRead ? GREEN : GOLD}` }}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${NAVY}10` }}>
                            <FileText className="h-5 w-5" style={{ color: NAVY }} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium capitalize" style={{ color: NAVY }}>{periodeLabel}</p>
                              {isRead ? (
                                <Badge className="text-[10px] px-1.5 py-0" style={{ backgroundColor: `${GREEN}20`, color: GREEN }}>Lu</Badge>
                              ) : (
                                <Badge className="text-[10px] px-1.5 py-0 font-semibold" style={{ backgroundColor: `${GOLD}25`, color: GOLD }}>Nouveau</Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-500">Brut: {fmt(b.salaire_brut || b.salaire_base || 0)} MUR</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <p className="text-lg font-mono font-bold" style={{ color: NAVY }}>{fmt(b.salaire_net || 0)} <span className="text-xs font-normal text-gray-400">MUR</span></p>
                          <div className="flex gap-1.5">
                            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => {
                              window.open(`/api/rh/paie/pdf?bulletin_id=${b.id}&view=1`, '_blank')
                              if (!b.lu_le) { fetch(`/api/rh/paie?action=mark_read&bulletin_id=${b.id}`, { method: "POST" }).catch(() => {}) }
                            }}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => window.open(`/api/rh/paie/pdf?bulletin_id=${b.id}`, '_blank')}>
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Planning */}
        {tab === "planning" && (
          <Card>
            <CardHeader><CardTitle className="text-base" style={{ color: NAVY }}>Mon planning</CardTitle></CardHeader>
            <CardContent>
              {planning.length === 0 ? <p className="text-gray-400 text-center py-8">Aucun planning publié</p> : (
                <div className="space-y-1">
                  {planning.filter((p: any) => p.shift && p.shift !== 'Repos').map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 border rounded">
                      <span className="text-sm font-medium">Jour {p.jour}</span>
                      <div className="text-right">
                        <Badge className="bg-blue-100 text-blue-800 text-xs">{p.shift || "Travail"}</Badge>
                        {p.heure_debut && <span className="text-xs text-gray-500 ml-2">{p.heure_debut}—{p.heure_fin}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Primes */}
        {tab === "primes" && (
          <Card>
            <CardHeader><CardTitle className="text-base" style={{ color: NAVY }}>Mes primes & OT</CardTitle></CardHeader>
            <CardContent>
              {primes.length === 0 ? <p className="text-gray-400 text-center py-8">Aucune prime</p> : (
                <div className="space-y-2">
                  {primes.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{p.prime?.libelle || p.libelle || "Prime"}</p>
                        <p className="text-xs text-gray-500">{p.periode ? new Date(p.periode + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "—"}{p.quantite ? ` • Qté: ${p.quantite}` : ""}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-medium">{fmt(p.montant || 0)} MUR</p>
                        <Badge className={p.approuve ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}>{p.approuve ? "Validée" : "En attente"}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
