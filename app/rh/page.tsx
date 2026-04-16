"use client"
import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Users, CreditCard, Clock, Calendar, TrendingUp, AlertTriangle, Target, Settings,
  Calculator, Banknote, CheckCircle, ArrowRight, BarChart3, Building2,
  MessageSquare, Upload, CalendarDays, Briefcase, Bell,
  AlertCircle, FileWarning, UserX, ChevronRight
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import MonEspacePersonnel from "@/components/rh/MonEspacePersonnel"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from "recharts"
import Link from "next/link"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
const BLUE = "#4191FF"
const SECONDARY = "#4A5490"
const CARD_BORDER = "#E2E5F0"
const PAGE_BG = "#F8F9FC"

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


const ABSENCES_TYPE_DATA = [
  { type: "AL", count: 18, label: "Conge annuel" },
  { type: "SL", count: 7, label: "Conge maladie" },
  { type: "MAT", count: 2, label: "Maternite" },
  { type: "PAT", count: 1, label: "Paternite" },
]

// Count-up animation hook
function useCountUp(target: number, duration: number = 1200, enabled: boolean = true): number {
  const [value, setValue] = useState(0)
  const startTime = useRef<number | null>(null)
  const rafId = useRef<number>(0)

  useEffect(() => {
    if (!enabled || target === 0) {
      setValue(target)
      return
    }
    setValue(0)
    startTime.current = null

    const animate = (timestamp: number) => {
      if (startTime.current === null) startTime.current = timestamp
      const elapsed = timestamp - startTime.current
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) {
        rafId.current = requestAnimationFrame(animate)
      }
    }
    rafId.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId.current)
  }, [target, duration, enabled])

  return value
}

function AnimatedKPIValue({ value, isCurrency, loading }: { value: number; isCurrency?: boolean; loading: boolean }) {
  const animated = useCountUp(value, 1200, !loading && value > 0)
  if (loading) return <span>...</span>
  if (isCurrency) return <span>{fmt(animated)}</span>
  return <span>{animated}</span>
}


export default function RHDashboard() {
  const [tab, setTab] = useState<Tab>("dashboard")
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [stats, setStats] = useState({ nb_employes: 0, masse_salariale: 0, charges_patronales: 0, conges_attente: 0, absences_today: 0, primes_mois: 0 })
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState("")
  const [chartData, setChartData] = useState<any[]>([])
  const [deptData, setDeptData] = useState<any[]>([])
  const periode = new Date().toISOString().slice(0, 7)

  // Check if manager -> redirect to manager dashboard
  useEffect(() => {
    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return
        supabase.from("profiles").select("role").eq("id", user.id).single().then(({ data }) => {
          if (data?.role === "manager") {
            window.location.href = "/rh/manager"
          }
          setUserRole(data?.role || "")
        })
      })
    })
  }, [])

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const now = new Date()
        const params = societe !== "all" ? `?societe_id=${societe}&statut=presents` : "?statut=presents"
        const [empRes, congesRes] = await Promise.all([
          fetch(`/api/rh/employes${params}`),
          fetch(`/api/rh/conges?statut=en_attente${societe !== "all" ? `&societe_id=${societe}` : ""}`),
        ])
        const [emp, conges] = await Promise.all([empRes.json(), congesRes.json()])
        const employes = emp.employes || []

        // Try current month first, then fallback to previous month
        let paieData = await fetch(`/api/rh/paie?periode=${periode}${societe !== "all" ? `&societe_id=${societe}` : ""}`).then(r => r.json())
        if ((paieData.nb || 0) === 0) {
          const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7)
          const prevParams = new URLSearchParams({ periode: prevMonth })
          if (societe !== "all") prevParams.set("societe_id", societe)
          paieData = await fetch(`/api/rh/paie?${prevParams}`).then(r => r.json())
        }

        const nbBulletins = paieData.nb || 0

        // If bulletins exist for this period, use them
        let masseSalariale = 0
        let chargesPatronales = 0

        if (nbBulletins > 0) {
          masseSalariale = paieData.totaux?.masse_salariale_brute || 0
          chargesPatronales = paieData.totaux?.total_charges_patronales || 0
        } else {
          // Fallback: estimate from employee base salaries
          const totalBase = employes.reduce((s: number, e: any) => s + (Number(e.salaire_base) || 0), 0)
          masseSalariale = totalBase
          // Estimate charges: CSG 6% + NSF 2.5% + Training 1% + PRGF ~1.5% = 11%
          chargesPatronales = Math.round(totalBase * 0.11)
        }

        setStats({
          nb_employes: emp.total || employes.length || 0,
          masse_salariale: masseSalariale,
          charges_patronales: chargesPatronales,
          conges_attente: conges.conges?.length || 0,
          absences_today: 0,
          primes_mois: 0,
        })

        // Build department donut from real employee data
        const posteGroups: Record<string, number> = {}
        employes.forEach((e: any) => {
          const dept = e.departement || e.poste || "Autre"
          posteGroups[dept] = (posteGroups[dept] || 0) + 1
        })
        const COLORS = ["#4191FF", "#D4AF37", "#2ECC8A", "#E8A84C", "#8B5CF6", "#EC4899"]
        const deptChartData = Object.entries(posteGroups).slice(0, 6).map(([name, value], i) => ({
          name, value, color: COLORS[i % COLORS.length]
        }))
        setDeptData(deptChartData)

        // Fetch last 12 months of payroll for chart
        const months12: string[] = []
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
          months12.push(d.toISOString().slice(0, 7))
        }

        const paieHistory = await Promise.all(
          months12.map(m => {
            const p = new URLSearchParams({ periode: m })
            if (societe !== "all") p.set("societe_id", societe)
            return fetch(`/api/rh/paie?${p}`).then(r => r.json()).catch(() => ({ totaux: {} }))
          })
        )

        const MOIS = ["Jan","Fev","Mar","Avr","Mai","Jun","Jul","Aou","Sep","Oct","Nov","Dec"]
        const realChartData = months12.map((m, i) => {
          const monthIdx = parseInt(m.split("-")[1]) - 1
          const t = paieHistory[i]?.totaux || {}
          return {
            mois: MOIS[monthIdx],
            brut: Math.round(t.masse_salariale_brute || 0),
            net: Math.round(t.masse_salariale_nette || (t.masse_salariale_brute || 0) * 0.85),
          }
        })
        setChartData(realChartData)

      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [societe, periode])

  return (
    <ClientPageShell
      breadcrumbs={[{ label: "RH · Paie", href: "/rh" }, { label: "Tableau de bord" }]}
      kicker={`RH & Paie · ${new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
      title="Tableau de bord RH"
      subtitle="Vue consolidée de votre équipe, des absences, des bulletins et des échéances MRA. Conforme WRA 2019."
      actions={
        <Select value={societe} onValueChange={setSociete}>
          <SelectTrigger className="w-56" style={{ borderColor: "#D8DFED", borderRadius: 10 }}>
            <SelectValue placeholder="Toutes sociétés" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les sociétés</SelectItem>
            {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
          </SelectContent>
        </Select>
      }
    >
      <div className="space-y-6 max-w-[1400px] mx-auto">
        {/* TÂCHE 7 — Mon espace personnel (rendu uniquement si l'user RH
            a une fiche employé liée ; sinon le composant retourne null). */}
        <MonEspacePersonnel />

        {/* Tabs — modern pill design */}
        <div
          className="flex gap-1 overflow-x-auto p-1.5 rounded-xl"
          style={{
            background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
            border: "1px solid #D8DFED",
            boxShadow:
              "0 1px 2px rgba(15,23,42,0.04), 0 8px 20px -12px rgba(15,23,42,0.10)",
          }}
        >
          {TABS.map(t => {
            const Icon = TAB_ICONS[t.id]
            const isActive = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all duration-200"
                style={
                  isActive
                    ? {
                        background: "linear-gradient(135deg, #D4AF37 0%, #E4C547 100%)",
                        color: "#0B0F2E",
                        boxShadow:
                          "0 6px 16px -6px rgba(212,175,55,0.55), inset 0 1px 0 rgba(255,255,255,0.4)",
                      }
                    : {
                        color: "#475569",
                        background: "transparent",
                      }
                }
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        {tab === "dashboard" && <DashboardTab stats={stats} loading={loading} chartData={chartData} deptData={deptData} />}
        {tab === "pointages" && <PointagesTab />}
        {tab === "absences" && <AbsencesTab />}
        {tab === "primes" && <PrimesTab />}
        {tab === "paie" && <PaieTab />}
        {tab === "parametres" && <ParametresTab />}
      </div>
    </ClientPageShell>
  )
}


// Smart Alerts Widget
function SmartAlertsPanel({ stats }: { stats: any }) {
  const today = new Date()
  const jour15 = new Date(today.getFullYear(), today.getMonth() + 1, 15)
  const joursAvant15 = Math.ceil((jour15.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  const alerts: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string; severity: "red" | "orange" | "blue" | "green"; href?: string; action?: string }[] = []

  // MRA deadline J-7
  if (joursAvant15 <= 7) {
    alerts.push({
      icon: FileWarning,
      title: `Echeance MRA dans ${joursAvant15}J`,
      desc: "CSG/NSF a soumettre avant le 15",
      severity: "red",
      href: "/rh/paie/exports-mra",
      action: "Exporter",
    })
  } else {
    alerts.push({
      icon: FileWarning,
      title: `Echeance MRA dans ${joursAvant15}J`,
      desc: "CSG/NSF a soumettre avant le 15",
      severity: "orange",
      href: "/rh/paie/exports-mra",
      action: "Exporter",
    })
  }

  // CDD expiring in 30 days (mock)
  alerts.push({
    icon: AlertCircle,
    title: "2 CDD expirent sous 30J",
    desc: "Dupont M., Martin L. - renouvellement requis",
    severity: "orange",
    href: "/rh/employes",
    action: "Voir",
  })

  // Pending leave requests
  if (stats.conges_attente > 0) {
    alerts.push({
      icon: Calendar,
      title: `${stats.conges_attente} conge(s) en attente`,
      desc: "Demandes a valider par le responsable",
      severity: "blue",
      href: "/rh/conges",
      action: "Traiter",
    })
  }

  // Pointage anomalies (mock)
  alerts.push({
    icon: UserX,
    title: "3 anomalies pointage",
    desc: "Employes sans pointage aujourd'hui",
    severity: "red",
    href: "/rh/pointage",
    action: "Verifier",
  })

  const severityStyles = {
    red: { bg: "bg-red-50", border: "border-red-200", icon: "text-red-500", dot: "bg-red-500" },
    orange: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-500", dot: "bg-amber-500" },
    blue: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-500", dot: "bg-blue-500" },
    green: { bg: "bg-green-50", border: "border-green-200", icon: "text-green-500", dot: "bg-green-500" },
  }

  return (
    <Card style={{ border: `1px solid ${CARD_BORDER}`, borderRadius: 12, background: "#FFFFFF" }}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2" style={{ color: NAVY, fontFamily: "Poppins, sans-serif" }}>
          <AlertTriangle className="w-4 h-4" style={{ color: GOLD }} /> Alertes intelligentes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((alert, i) => {
          const s = severityStyles[alert.severity]
          return (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${s.bg} border ${s.border}`}>
              <div className="flex-shrink-0 mt-0.5">
                <alert.icon className={`w-4 h-4 ${s.icon}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: NAVY }}>{alert.title}</p>
                <p className="text-xs mt-0.5" style={{ color: SECONDARY }}>{alert.desc}</p>
              </div>
              {alert.href && alert.action && (
                <Link href={alert.href}>
                  <Button size="sm" variant="ghost" className="text-xs h-7 px-2 flex-shrink-0" style={{ color: BLUE }}>
                    {alert.action} <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                </Link>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
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
    <Card style={{ border: `1px solid ${CARD_BORDER}`, borderRadius: 12, background: "#FFFFFF" }} className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2" style={{ color: NAVY, fontFamily: "Poppins, sans-serif" }}>
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
              <p className="text-xs" style={{ color: SECONDARY }}>{item.date}</p>
              <p className="text-sm font-medium mt-0.5" style={{ color: NAVY }}>{item.title}</p>
              <p className="text-xs mt-0.5" style={{ color: SECONDARY }}>{item.desc}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}


// Custom tooltip for charts
function ChartTooltip({ active, payload, label, isCurrency }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white p-3 rounded-lg shadow-lg" style={{ border: `1px solid ${CARD_BORDER}` }}>
      <p className="text-xs font-medium" style={{ color: SECONDARY }}>{label}</p>
      <p className="text-sm font-bold" style={{ color: NAVY }}>
        {isCurrency ? fmt(payload[0].value) : payload[0].value}
      </p>
    </div>
  )
}

function DashboardTab({ stats, loading, chartData, deptData }: { stats: any; loading: boolean; chartData: any[]; deptData: any[] }) {
  // Premium panel style aligned with the homepage + /client — layered
  // shadows + subtle gradient instead of flat white.
  const cardStyle = {
    border: "1px solid #D8DFED",
    borderRadius: 18,
    background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
    boxShadow:
      "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.9)",
  }

  const kpis = [
    { label: "Employés actifs",      value: stats.nb_employes,        icon: Users,      strong: "#4191FF", dark: "#1D5FC4", href: "/rh/employes", isCurrency: false },
    { label: "Masse salariale brute", value: stats.masse_salariale,   icon: Banknote,   strong: "#2ECC8A", dark: "#1F9B68", href: "/rh/paie",     isCurrency: true  },
    { label: "Charges patronales",   value: stats.charges_patronales, icon: CreditCard, strong: "#D4AF37", dark: "#A88925", href: "/rh/paie",     isCurrency: true  },
    { label: "Absences ce mois",     value: stats.conges_attente,     icon: Calendar,   strong: "#E25555", dark: "#B93B3B", href: "/rh/conges",   isCurrency: false },
  ]

  return (
    <div className="space-y-6">
      {/* KPI Cards + Alerts row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* KPI Cards */}
        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map(k => (
            <Link key={k.label} href={k.href} className="group">
              <article
                className="relative overflow-hidden h-full cursor-pointer transition-all duration-200 group-hover:-translate-y-1"
                style={{
                  background:
                    "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
                  border: "1px solid #D8DFED",
                  borderRadius: "16px",
                  boxShadow:
                    "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.9)",
                }}
              >
                {/* Top accent stripe */}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-[3px]"
                  style={{ background: `linear-gradient(90deg, ${k.strong} 0%, ${k.strong}33 100%)` }}
                />
                {/* Corner glow */}
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: "-60px",
                    right: "-60px",
                    width: "160px",
                    height: "160px",
                    borderRadius: "50%",
                    background: `radial-gradient(circle, ${k.strong}22 0%, transparent 70%)`,
                    pointerEvents: "none",
                  }}
                />
                <div className="relative p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div
                      aria-hidden="true"
                      className="flex h-11 w-11 items-center justify-center rounded-xl"
                      style={{
                        background: `linear-gradient(135deg, ${k.strong}22 0%, ${k.strong}08 100%)`,
                        border: `1px solid ${k.strong}44`,
                        boxShadow: `0 10px 24px -10px ${k.strong}55, inset 0 1px 0 rgba(255,255,255,0.4)`,
                        color: k.dark,
                      }}
                    >
                      <k.icon className="w-5 h-5" strokeWidth={1.8} />
                    </div>
                    <ArrowRight
                      className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-1"
                      style={{ color: k.dark }}
                    />
                  </div>
                  <p
                    className="text-[11px] font-bold uppercase"
                    style={{ color: "#475569", letterSpacing: "0.08em" }}
                  >
                    {k.label}
                  </p>
                  <p
                    className="text-2xl font-bold mt-1"
                    style={{
                      color: "#0B0F2E",
                      fontFamily: "Poppins, sans-serif",
                      letterSpacing: "-0.02em",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <AnimatedKPIValue value={k.value} isCurrency={k.isCurrency} loading={loading} />
                  </p>
                </div>
              </article>
            </Link>
          ))}
        </div>

        {/* Alerts sidebar */}
        <div className="lg:col-span-1">
          <SmartAlertsPanel stats={stats} />
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Line chart - Masse salariale evolution */}
        <Card className="lg:col-span-2" style={cardStyle}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2" style={{ color: NAVY, fontFamily: "Poppins, sans-serif" }}>
              <TrendingUp className="w-4 h-4" style={{ color: BLUE }} /> Evolution masse salariale (12 mois)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <XAxis dataKey="mois" tick={{ fontSize: 11, fill: SECONDARY }} axisLine={{ stroke: CARD_BORDER }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: SECONDARY }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip isCurrency />} />
                  <Line type="monotone" dataKey="brut" name="Brut" stroke={BLUE} strokeWidth={2.5} dot={{ r: 4, fill: BLUE, strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6, fill: GOLD, stroke: "#fff", strokeWidth: 2 }} />
                  <Line type="monotone" dataKey="net" name="Net" stroke={GOLD} strokeWidth={2} dot={{ r: 3, fill: GOLD, strokeWidth: 2, stroke: "#fff" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pie chart - Repartition par departement */}
        <Card style={cardStyle}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2" style={{ color: NAVY, fontFamily: "Poppins, sans-serif" }}>
              <Users className="w-4 h-4" style={{ color: GOLD }} /> Repartition par departement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={deptData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" nameKey="name" stroke="none">
                    {deptData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number, name: string) => [`${value} employes`, name]} contentStyle={{ borderRadius: 8, border: `1px solid ${CARD_BORDER}`, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
              {deptData.map(d => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-xs" style={{ color: SECONDARY }}>{d.name} ({d.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bar chart + Quick Actions row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar chart - Absences par type */}
        <Card style={cardStyle}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2" style={{ color: NAVY, fontFamily: "Poppins, sans-serif" }}>
              <Calendar className="w-4 h-4" style={{ color: "#EF4444" }} /> Absences par type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ABSENCES_TYPE_DATA} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                  <XAxis dataKey="type" tick={{ fontSize: 12, fill: SECONDARY }} axisLine={{ stroke: CARD_BORDER }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: SECONDARY }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip formatter={(value: number, name: string, props: any) => [`${value} jours`, props.payload.label]} contentStyle={{ borderRadius: 8, border: `1px solid ${CARD_BORDER}`, fontSize: 12 }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} fill={BLUE} barSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: SECONDARY }}>Actions rapides</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { href: "/rh/paie", label: "Calculer paie", icon: Calculator, color: "#10B981", bg: "#ECFDF5" },
              { href: "/rh/pointage", label: "Pointage du jour", icon: Clock, color: "#4191FF", bg: "#EBF3FF" },
              { href: "/rh/conges", label: "Nouvelle absence", icon: CalendarDays, color: "#F59E0B", bg: "#FFF7ED" },
              { href: "/rh/paie/exports-mra", label: "Export virement", icon: Upload, color: "#8B5CF6", bg: "#F3F0FF" },
            ].map(a => (
              <Link key={a.href} href={a.href}>
                <Card className="hover:shadow-md transition-all cursor-pointer group" style={{ ...cardStyle, borderColor: CARD_BORDER }}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: a.bg }}>
                      <a.icon className="w-5 h-5" style={{ color: a.color }} />
                    </div>
                    <span className="text-sm font-medium" style={{ color: NAVY }}>{a.label}</span>
                    <ArrowRight className="w-4 h-4 ml-auto opacity-30 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }} />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row: Modules + Obligations + Actualites */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Acces rapides */}
        <Card style={cardStyle}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2" style={{ color: NAVY, fontFamily: "Poppins, sans-serif" }}>
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
              <Link key={a.href} href={a.href} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group">
                <div className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-[#0B0F2E]/10">
                  <a.icon className="w-4 h-4 text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: NAVY }}>{a.label}</p>
                  <p className="text-xs" style={{ color: SECONDARY }}>{a.desc}</p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#D4AF37] transition-colors" />
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Obligations legales */}
        <Card style={cardStyle}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2" style={{ color: NAVY, fontFamily: "Poppins, sans-serif" }}>
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
      <p className="text-sm" style={{ color: SECONDARY }}>Raccourcis vers la gestion des pointages :</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/rh/pointage">
          <Card className="hover:shadow-md transition-shadow cursor-pointer" style={{ border: `2px solid ${CARD_BORDER}`, borderRadius: 12, background: "#FFFFFF" }}>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-lg" style={{ color: NAVY }}>Pointage temps reel</p>
                <p className="text-sm" style={{ color: SECONDARY }}>Presences du jour, pointage manuel, corrections immediates</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/rh/pointage/mensuel">
          <Card className="hover:shadow-md transition-shadow cursor-pointer" style={{ border: `2px solid ${CARD_BORDER}`, borderRadius: 12, background: "#FFFFFF" }}>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                <CalendarDays className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="font-bold text-lg" style={{ color: NAVY }}>Pointage mensuel</p>
                <p className="text-sm" style={{ color: SECONDARY }}>Calendrier mensuel, validation OT, absences injustifiees</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}

function AbsencesTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: SECONDARY }}>Gestion complete des absences et conges :</p>
      <Link href="/rh/conges">
        <Card className="hover:shadow-md transition-shadow cursor-pointer" style={{ border: `2px solid ${CARD_BORDER}`, borderRadius: 12, background: "#FFFFFF" }}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
              <Calendar className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="font-bold text-lg" style={{ color: NAVY }}>Absences & Conges</p>
              <p className="text-sm" style={{ color: SECONDARY }}>Demandes en attente, planning, absences non planifiees -- validation + impact paie</p>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}

function PrimesTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: SECONDARY }}>Catalogue et saisie mensuelle des primes :</p>
      <Link href="/rh/paie/primes">
        <Card className="hover:shadow-md transition-shadow cursor-pointer" style={{ border: `2px solid ${CARD_BORDER}`, borderRadius: 12, background: "#FFFFFF" }}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
              <Target className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="font-bold text-lg" style={{ color: NAVY }}>Primes parametrables</p>
              <p className="text-sm" style={{ color: SECONDARY }}>Catalogue primes, saisie mensuelle variable, approbation, integration automatique dans la paie</p>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}

function PaieTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: SECONDARY }}>Module paie complet :</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { href: "/rh/paie", icon: Calculator, label: "Bulletins de paie", desc: "Calcul batch, validation, PDF individuel", color: "text-green-600", bg: "bg-green-50" },
          { href: "/rh/paie/exports-mra", icon: Building2, label: "Exports MRA", desc: "CSG/NSF, PAYE, PRGF, virements bancaires", color: "text-blue-600", bg: "bg-blue-50" },
          { href: "/rh/paie/primes", icon: Target, label: "Primes du mois", desc: "Saisie et approbation des primes variables", color: "text-amber-600", bg: "bg-amber-50" },
          { href: "/rh/paie/parametres", icon: Settings, label: "Parametres paie", desc: "Taux MRA, OT, jours feries", color: "text-gray-600", bg: "bg-gray-100" },
        ].map(a => (
          <Link key={a.href} href={a.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer" style={{ border: `2px solid ${CARD_BORDER}`, borderRadius: 12, background: "#FFFFFF" }}>
              <CardContent className="p-5 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-lg ${a.bg} flex items-center justify-center flex-shrink-0`}>
                  <a.icon className={`w-6 h-6 ${a.color}`} />
                </div>
                <div>
                  <p className="font-bold" style={{ color: NAVY }}>{a.label}</p>
                  <p className="text-xs" style={{ color: SECONDARY }}>{a.desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

function ParametresTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: SECONDARY }}>Configuration de l&apos;environnement RH :</p>
      <Link href="/rh/paie/parametres">
        <Card className="hover:shadow-md transition-shadow cursor-pointer" style={{ border: `2px solid ${CARD_BORDER}`, borderRadius: 12, background: "#FFFFFF" }}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
              <Settings className="w-6 h-6 text-gray-600" />
            </div>
            <div>
              <p className="font-bold text-lg" style={{ color: NAVY }}>Parametres paie & RH</p>
              <p className="text-sm" style={{ color: SECONDARY }}>Taux MRA 2024/25, calcul OT (1.5x / 2x), jours feries Maurice, taux change EUR/MUR</p>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}
