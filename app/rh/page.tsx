"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Users, CreditCard, Clock, Calendar, TrendingUp, AlertTriangle, Target, Settings,
  Calculator, FileText, Banknote, CheckCircle, ArrowRight, BarChart3, Building2,
  ClipboardList, MessageSquare, Upload, CalendarDays, UserPlus, Briefcase, Bell
} from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n) }

type Tab = "dashboard" | "pointages" | "absences" | "primes" | "paie" | "parametres"

const TAB_ICONS: Record<Tab, React.ComponentType<{ className?: string }>> = {
  dashboard: BarChart3,
  pointages: Clock,
  absences: Calendar,
  primes: Target,
  paie: Banknote,
  parametres: Settings,
}

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Tableau de bord" },
  { id: "pointages", label: "Pointages" },
  { id: "absences", label: "Absences & Conges" },
  { id: "primes", label: "Primes" },
  { id: "paie", label: "Paie" },
  { id: "parametres", label: "Parametres" },
]

export default function RHDashboard() {
  const [tab, setTab] = useState<Tab>("dashboard")
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [stats, setStats] = useState({ nb_employes: 0, masse_salariale: 0, charges_patronales: 0, conges_attente: 0, absences_today: 0, primes_mois: 0 })
  const [loading, setLoading] = useState(true)
  const periode = new Date().toISOString().slice(0, 7)

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const params = societe !== "all" ? `?societe_id=${societe}` : ""
        const [empRes, paieRes, congesRes] = await Promise.all([
          fetch(`/api/rh/employes${params}`),
          fetch(`/api/rh/paie?periode=${periode}${societe !== "all" ? `&societe_id=${societe}` : ""}`),
          fetch(`/api/rh/conges?statut=en_attente${societe !== "all" ? `&societe_id=${societe}` : ""}`),
        ])
        const [emp, paie, conges] = await Promise.all([empRes.json(), paieRes.json(), congesRes.json()])
        const coutTotal = paie.totaux?.cout_total_employeur || 0
        const masseSalariale = paie.totaux?.salaire_net_total || coutTotal * 0.75
        setStats({
          nb_employes: emp.total || 0,
          masse_salariale: masseSalariale,
          charges_patronales: coutTotal - masseSalariale,
          conges_attente: conges.conges?.length || 0,
          absences_today: 0,
          primes_mois: 0,
        })
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [societe, periode])

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Gestion des Ressources Humaines</h1>
          <p className="text-sm text-gray-500 mt-0.5">{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <Select value={societe} onValueChange={setSociete}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Toutes societes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les societes</SelectItem>
            {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => {
          const Icon = TAB_ICONS[t.id]
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-[#1E2A4A] text-[#1E2A4A]"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Icon className="w-4 h-4" />{t.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      {tab === "dashboard" && <DashboardTab stats={stats} loading={loading} />}
      {tab === "pointages" && <PointagesTab />}
      {tab === "absences" && <AbsencesTab />}
      {tab === "primes" && <PrimesTab />}
      {tab === "paie" && <PaieTab />}
      {tab === "parametres" && <ParametresTab />}
    </div>
  )
}

function ActualitesRHPanel({ stats }: { stats: any }) {
  const today = new Date()
  const dateStr = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
  const moisNom = today.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
  const moisNomCap = moisNom.charAt(0).toUpperCase() + moisNom.slice(1)
  const jour15 = new Date(today.getFullYear(), today.getMonth() + 1, 15)
  const isDeadlineClose = (jour15.getTime() - today.getTime()) / (1000 * 60 * 60 * 24) < 10

  const newsItems: { date: string; title: string; desc: string; dot: "green" | "orange" | "red" }[] = []

  if (stats.nb_employes > 0) {
    newsItems.push({
      date: dateStr(today),
      title: `Paie ${moisNomCap} calculee`,
      desc: `${stats.nb_employes}/${stats.nb_employes} bulletins generes`,
      dot: "green",
    })
  }

  newsItems.push({
    date: "01 Jan 2026",
    title: "Compensation salariale 2026",
    desc: "Rs 635 pour les salaires inferieur ou egal a 50,000",
    dot: "green",
  })

  newsItems.push({
    date: dateStr(jour15),
    title: "Echeance CSG/NSF",
    desc: "A soumettre avant le 15 du mois suivant",
    dot: isDeadlineClose ? "red" : "orange",
  })

  newsItems.push({
    date: dateStr(today),
    title: "Import Excel pointages",
    desc: "Nouveau: import Excel des pointages disponible",
    dot: "green",
  })

  newsItems.push({
    date: "20 " + today.toLocaleDateString("fr-FR", { month: "short" }),
    title: "Echeance PAYE mensuel",
    desc: "A soumettre avant le 20 du mois suivant",
    dot: "orange",
  })

  const dotColors = { green: "bg-green-500", orange: "bg-amber-500", red: "bg-red-500" }

  return (
    <Card className="border border-gray-200 h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2" style={{ color: NAVY }}>
          <Bell className="w-4 h-4" style={{ color: GOLD }} /> Actualites RH
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 overflow-y-auto max-h-[400px]">
        {newsItems.slice(0, 5).map((item, i) => (
          <div key={i} className="flex gap-3 py-3 border-b border-gray-100 last:border-0">
            <div className="mt-1.5 flex-shrink-0">
              <div className={`w-2.5 h-2.5 rounded-full ${dotColors[item.dot]}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-400">{item.date}</p>
              <p className="text-sm font-medium mt-0.5" style={{ color: NAVY }}>{item.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function DashboardTab({ stats, loading }: { stats: any; loading: boolean }) {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Employes actifs", value: String(stats.nb_employes), icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Masse salariale", value: fmt(stats.masse_salariale), icon: Banknote, color: "text-green-600", bg: "bg-green-50" },
          { label: "Charges patronales", value: fmt(stats.charges_patronales), icon: CreditCard, color: "text-orange-600", bg: "bg-orange-50" },
          { label: "Absences ce mois", value: String(stats.conges_attente), icon: Calendar, color: "text-red-500", bg: "bg-red-50" },
        ].map(k => (
          <Card key={k.label} className="border border-gray-200">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg ${k.bg} flex items-center justify-center`}>
                  <k.icon className={`w-5 h-5 ${k.color}`} />
                </div>
              </div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{k.label}</p>
              <p className="text-xl font-bold mt-1" style={{ color: NAVY }}>
                {loading ? "..." : k.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Actions rapides</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { href: "/rh/paie", label: "Calculer paie", icon: Calculator, color: "text-green-600", bg: "bg-green-50" },
            { href: "/rh/pointage", label: "Pointage du jour", icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
            { href: "/rh/conges", label: "Nouvelle absence", icon: CalendarDays, color: "text-orange-600", bg: "bg-orange-50" },
            { href: "/rh/paie/exports-mra", label: "Export virement", icon: Upload, color: "text-purple-600", bg: "bg-purple-50" },
          ].map(a => (
            <a key={a.href} href={a.href}>
              <Card className="hover:shadow-md transition-all cursor-pointer group border border-gray-200 hover:border-[#C9A84C]">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${a.bg} flex items-center justify-center flex-shrink-0`}>
                    <a.icon className={`w-5 h-5 ${a.color}`} />
                  </div>
                  <span className="text-sm font-medium" style={{ color: NAVY }}>{a.label}</span>
                  <ArrowRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-[#C9A84C] transition-colors" />
                </CardContent>
              </Card>
            </a>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Acces rapides */}
        <Card className="border border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2" style={{ color: NAVY }}>
              <Briefcase className="w-4 h-4" /> Modules RH
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {[
              { href: "/rh/pointage", label: "Pointage temps reel", icon: Clock, desc: "Presences du jour" },
              { href: "/rh/pointage/mensuel", label: "Pointage mensuel", icon: CalendarDays, desc: "OT + corrections" },
              { href: "/rh/paie", label: "Calculer la paie", icon: Calculator, desc: "Bulletins du mois" },
              { href: "/rh/paie/primes", label: "Saisir primes", icon: Target, desc: "Primes variables" },
              { href: "/rh/conges", label: "Absences & Conges", icon: Calendar, desc: "Demandes en cours" },
              { href: "/rh/paie/exports-mra", label: "Exports MRA", icon: Building2, desc: "CSG/NSF/PAYE" },
              { href: "/rh/employes", label: "Gestion employes", icon: Users, desc: "Dossiers RH" },
              { href: "/rh/chat", label: "Chat CLARA", icon: MessageSquare, desc: "Assistant RH IA" },
            ].map(a => (
              <a key={a.href} href={a.href} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group">
                <div className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-[#1E2A4A]/10">
                  <a.icon className="w-4 h-4 text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: NAVY }}>{a.label}</p>
                  <p className="text-xs text-gray-400">{a.desc}</p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#C9A84C] transition-colors" />
              </a>
            ))}
          </CardContent>
        </Card>

        {/* Obligations legales */}
        <Card className="border border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2" style={{ color: NAVY }}>
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Obligations legales Maurice
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {[
              { label: "CSG mensuelle", date: "15 du mois suivant", type: "monthly" },
              { label: "PAYE mensuel", date: "20 du mois suivant", type: "monthly" },
              { label: "NSF mensuel", date: "Fin du mois", type: "monthly" },
              { label: "Training Levy", date: "Fin du mois", type: "monthly" },
              { label: "PRGF", date: "Fin du mois", type: "monthly" },
              { label: "13eme mois (75%)", date: "25 decembre", type: "annual" },
              { label: "13eme mois (25%)", date: "31 decembre", type: "annual" },
              { label: "Declaration EDF annuelle", date: "30 septembre", type: "annual" },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-2.5">
                  {r.type === "monthly"
                    ? <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    : <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  }
                  <span className="text-sm text-gray-700">{r.label}</span>
                </div>
                <Badge variant="outline" className={`text-xs font-normal ${
                  r.type === "annual"
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-blue-200 bg-blue-50 text-blue-700"
                }`}>
                  {r.date}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Actualites RH Panel */}
        <ActualitesRHPanel stats={stats} />
      </div>
    </div>
  )
}

function PointagesTab() {
  return (
    <div className="space-y-4">
      <p className="text-gray-500 text-sm">Raccourcis vers la gestion des pointages :</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <a href="/rh/pointage">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-[#1E2A4A]">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-lg" style={{ color: NAVY }}>Pointage temps reel</p>
                <p className="text-sm text-gray-500">Presences du jour, pointage manuel, corrections immediates</p>
              </div>
            </CardContent>
          </Card>
        </a>
        <a href="/rh/pointage/mensuel">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-[#1E2A4A]">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                <CalendarDays className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="font-bold text-lg" style={{ color: NAVY }}>Pointage mensuel</p>
                <p className="text-sm text-gray-500">Calendrier mensuel, validation OT, absences injustifiees</p>
              </div>
            </CardContent>
          </Card>
        </a>
      </div>
    </div>
  )
}

function AbsencesTab() {
  return (
    <div className="space-y-4">
      <p className="text-gray-500 text-sm">Gestion complete des absences et conges :</p>
      <a href="/rh/conges">
        <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-[#1E2A4A]">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
              <Calendar className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="font-bold text-lg" style={{ color: NAVY }}>Absences & Conges</p>
              <p className="text-sm text-gray-500">Demandes en attente, planning, absences non planifiees -- validation + impact paie</p>
            </div>
          </CardContent>
        </Card>
      </a>
    </div>
  )
}

function PrimesTab() {
  return (
    <div className="space-y-4">
      <p className="text-gray-500 text-sm">Catalogue et saisie mensuelle des primes :</p>
      <a href="/rh/paie/primes">
        <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-[#1E2A4A]">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
              <Target className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="font-bold text-lg" style={{ color: NAVY }}>Primes parametrables</p>
              <p className="text-sm text-gray-500">Catalogue primes, saisie mensuelle variable, approbation, integration automatique dans la paie</p>
            </div>
          </CardContent>
        </Card>
      </a>
    </div>
  )
}

function PaieTab() {
  return (
    <div className="space-y-4">
      <p className="text-gray-500 text-sm">Module paie complet :</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { href: "/rh/paie", icon: Calculator, label: "Bulletins de paie", desc: "Calcul batch, validation, PDF individuel", color: "text-green-600", bg: "bg-green-50" },
          { href: "/rh/paie/exports-mra", icon: Building2, label: "Exports MRA", desc: "CSG/NSF, PAYE, PRGF, virements bancaires", color: "text-blue-600", bg: "bg-blue-50" },
          { href: "/rh/paie/primes", icon: Target, label: "Primes du mois", desc: "Saisie et approbation des primes variables", color: "text-amber-600", bg: "bg-amber-50" },
          { href: "/rh/paie/parametres", icon: Settings, label: "Parametres paie", desc: "Taux MRA, OT, jours feries", color: "text-gray-600", bg: "bg-gray-100" },
        ].map(a => (
          <a key={a.href} href={a.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-[#1E2A4A]">
              <CardContent className="p-5 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-lg ${a.bg} flex items-center justify-center flex-shrink-0`}>
                  <a.icon className={`w-6 h-6 ${a.color}`} />
                </div>
                <div>
                  <p className="font-bold" style={{ color: NAVY }}>{a.label}</p>
                  <p className="text-xs text-gray-500">{a.desc}</p>
                </div>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>
    </div>
  )
}

function ParametresTab() {
  return (
    <div className="space-y-4">
      <p className="text-gray-500 text-sm">Configuration de l'environnement RH :</p>
      <a href="/rh/paie/parametres">
        <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-[#1E2A4A]">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
              <Settings className="w-6 h-6 text-gray-600" />
            </div>
            <div>
              <p className="font-bold text-lg" style={{ color: NAVY }}>Parametres paie & RH</p>
              <p className="text-sm text-gray-500">Taux MRA 2024/25, calcul OT (1.5x / 2x), jours feries Maurice, taux change EUR/MUR</p>
            </div>
          </CardContent>
        </Card>
      </a>
    </div>
  )
}
