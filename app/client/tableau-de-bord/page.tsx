"use client"
import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useProfile } from "@/hooks/use-profile"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Building2, TrendingUp, Plus, Loader2, Banknote, Receipt,
  ChevronLeft, ChevronRight, Calendar, Bell, Users, Pencil, Settings,
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

interface Societe { id: string; nom: string; brn: string; statut: string }

function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " MUR" }

function getCurrentExercice(): string {
  const now = new Date()
  const y = now.getFullYear()
  return now.getMonth() + 1 >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

function getExerciceChoices(): string[] {
  const now = new Date()
  const y = now.getFullYear()
  return [`${y - 2}-${y - 1}`, `${y - 1}-${y}`, `${y}-${y + 1}`]
}

function formatMoisLabel(mois: string): string {
  const [y, m] = mois.split("-").map(Number)
  return new Date(y, m - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
}

function formatMoisShort(mois: string): string {
  const [y, m] = mois.split("-").map(Number)
  return new Date(y, m - 1).toLocaleDateString("fr-FR", { month: "short" })
}

function shiftMonth(mois: string, delta: number): string {
  const [y, m] = mois.split("-").map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function getMonthRange(mois: string): { debut: string; fin: string } {
  const [y, m] = mois.split("-").map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return { debut: `${y}-${String(m).padStart(2, "0")}-01`, fin: `${y}-${String(m).padStart(2, "0")}-${lastDay}` }
}

export default function TableauDeBord() {
  const { profile, loading: profileLoading } = useProfile()
  const router = useRouter()
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selected, setSelected] = useState<string>("")
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const currentMoisDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const [mois, setMois] = useState(currentMoisDefault)
  const [exercice, setExercice] = useState(getCurrentExercice())
  const isCurrentMonth = mois === currentMoisDefault

  // KPI data
  const [monthly, setMonthly] = useState<any>(null)
  const [exerciseData, setExerciseData] = useState<any>(null)
  const [tresorerie, setTresorerie] = useState({ totalBankMUR: 0, nbComptes: 0 })
  const [chartData, setChartData] = useState<any[]>([])

  useEffect(() => {
    fetch("/api/client/societes").then(r => r.json()).then(d => {
      setSocietes(d.societes || [])
      if (d.societes?.length > 0) setSelected(d.societes[0].id)
    })
  }, [])

  // Fetch KPIs + chart data
  useEffect(() => {
    if (!selected) return
    setLoading(true)
    const base = selected !== "all" ? `societe_id=${selected}&` : ""

    const exMatch = exercice.match(/^(\d{4})-(\d{4})$/)
    const exDebut = exMatch ? `${exMatch[1]}-07-01` : ""
    const exFin = exMatch ? `${exMatch[2]}-06-30` : ""
    const { debut: moisDebut, fin: moisFin } = getMonthRange(mois)

    // Build chart months (last 6 completed months)
    const chartMonths: string[] = []
    for (let i = 6; i >= 1; i--) chartMonths.push(shiftMonth(currentMoisDefault, -i))

    const chartFetches = chartMonths.map(m => {
      const { debut, fin } = getMonthRange(m)
      return fetch(`/api/client/financial?${base}date_debut=${debut}&date_fin=${fin}`).then(r => r.json()).catch(() => null)
    })

    Promise.all([
      fetch(`/api/client/financial?${base}date_debut=${moisDebut}&date_fin=${moisFin}`).then(r => r.json()).catch(() => null),
      fetch(`/api/client/financial?${base}date_debut=${exDebut}&date_fin=${exFin}`).then(r => r.json()).catch(() => null),
      ...chartFetches,
    ]).then(([mData, eData, ...cData]) => {
      if (mData?.financial) {
        const f = mData.financial
        setMonthly({
          totalRevenue: f.totalRevenue || 0, totalExpenses: f.totalExpenses || 0, resultat: f.resultat || 0,
          tvaNette: f.tvaNette || 0, salaires: f.salaires || 0,
          echeances: f.factures?.filter((fc: any) => {
            if (!fc.date_echeance || fc.statut === 'paye' || fc.statut === 'annule') return false
            const ech = new Date(fc.date_echeance)
            const in30 = new Date(); in30.setDate(in30.getDate() + 30)
            return ech >= new Date() && ech <= in30
          }).length || 0,
        })
        setTresorerie({ totalBankMUR: f.totalBankMUR || 0, nbComptes: f.bankAccounts?.length || 0 })
      } else {
        setMonthly(null)
      }
      if (eData?.financial) {
        const f = eData.financial
        setExerciseData({ totalRevenue: f.totalRevenue || 0, totalExpenses: f.totalExpenses || 0, resultat: f.resultat || 0 })
      } else {
        setExerciseData(null)
      }
      // Build chart
      const cd = chartMonths.map((m, i) => {
        const f = cData[i]?.financial
        return {
          mois: formatMoisShort(m),
          CA: Math.round(f?.totalRevenue || 0),
          Dépenses: Math.round(f?.totalExpenses || 0),
          Résultat: Math.round((f?.totalRevenue || 0) - (f?.totalExpenses || 0)),
        }
      })
      setChartData(cd)
      setLoading(false)
    })
  }, [selected, mois, exercice])

  // Redirect assistant
  useEffect(() => {
    if (!profileLoading && profile?.role === "client_assistant") {
      router.replace("/client/assistant")
    }
  }, [profileLoading, profile?.role, router])

  if (profileLoading || profile?.role === "client_assistant") return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-[#1E2A4A]" />
    </div>
  )

  function KpiCard({ label, value, valueStr, icon: Icon, color, bg }: { label: string; value?: number; valueStr?: string; icon: any; color: string; bg: string }) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
            <Icon className={`w-4 h-4 ${color}`} />
          </div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className={`text-lg font-bold ${color} mt-0.5`}>
            {valueStr ? valueStr : value != null && value !== 0 ? fmt(value) : <span className="text-sm text-gray-400 font-normal">Pas de données</span>}
          </p>
        </CardContent>
      </Card>
    )
  }

  const skeleton = (count: number) => (
    <div className={`grid grid-cols-2 md:grid-cols-${count} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}><CardContent className="p-4">
          <div className="h-4 bg-gray-100 rounded animate-pulse mb-2 w-2/3" />
          <div className="h-7 bg-gray-100 rounded animate-pulse w-full" />
        </CardContent></Card>
      ))}
    </div>
  )

  return (
    <div className="p-3 pt-12 sm:p-4 md:pt-6 md:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Bonjour {profile?.full_name?.split(" ")[0] || ""}</h1>
          <p className="text-gray-500 text-sm mt-0.5 capitalize">{formatMoisLabel(mois)}</p>
        </div>
        {societes.length > 0 && (
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Société" /></SelectTrigger>
            <SelectContent>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              {societes.length > 1 && <SelectItem value="all">Toutes mes sociétés</SelectItem>}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Onboarding */}
      {societes.length === 0 && (
        <Card className="border-2 border-dashed border-[#C9A84C]/40 bg-[#C9A84C]/5">
          <CardContent className="p-8 text-center space-y-4">
            <Building2 className="w-12 h-12 mx-auto text-[#C9A84C]" />
            <div>
              <p className="text-lg font-bold text-[#1E2A4A]">Bienvenue sur LEXORA</p>
              <p className="text-sm text-gray-500 mt-1">Commencez par créer votre société pour accéder à tous les modules.</p>
            </div>
            <Link href="/client/societes"><Button className="bg-[#1E2A4A]"><Plus className="w-4 h-4 mr-2" /> Créer ma société</Button></Link>
          </CardContent>
        </Card>
      )}

      {societes.length > 0 && (
        <>
          {/* ROW 1: Ce mois — 7 KPIs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#1E2A4A]">Ce mois</h2>
                <Badge variant="outline" className="text-xs capitalize">{formatMoisLabel(mois)}</Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMois(shiftMonth(mois, -1))}><ChevronLeft className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setMois(currentMoisDefault)}>Aujourd&apos;hui</Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMois(shiftMonth(mois, 1))}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
            {loading ? skeleton(7) : monthly ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                <KpiCard label="CA du mois" value={monthly.totalRevenue} icon={TrendingUp} color="text-green-600" bg="bg-green-50" />
                <KpiCard label="Dépenses du mois" value={monthly.totalExpenses} icon={Receipt} color="text-red-500" bg="bg-red-50" />
                <KpiCard label="Bénéfice du mois" value={monthly.resultat} icon={TrendingUp} color={monthly.resultat >= 0 ? "text-green-600" : "text-red-500"} bg={monthly.resultat >= 0 ? "bg-green-50" : "bg-red-50"} />
                <KpiCard label="Trésorerie" value={tresorerie.totalBankMUR} icon={Banknote} color="text-blue-600" bg="bg-blue-50" />
                <KpiCard label="TVA nette" value={monthly.tvaNette} icon={Receipt} color="text-purple-600" bg="bg-purple-50" />
                <KpiCard label="Masse salariale" valueStr={isCurrentMonth ? "Mois en cours" : undefined} value={isCurrentMonth ? undefined : monthly.salaires} icon={Users} color="text-orange-600" bg="bg-orange-50" />
                <Card>
                  <CardContent className="p-4">
                    <div className={`w-8 h-8 rounded-lg ${monthly.echeances > 0 ? "bg-red-50" : "bg-green-50"} flex items-center justify-center mb-2`}>
                      <Bell className={`w-4 h-4 ${monthly.echeances > 0 ? "text-red-600" : "text-green-600"}`} />
                    </div>
                    <p className="text-xs text-gray-500">Échéances</p>
                    <p className={`text-lg font-bold mt-0.5 ${monthly.echeances > 0 ? "text-red-600" : "text-green-600"}`}>
                      {monthly.echeances > 0 ? `${monthly.echeances} à venir` : "Aucune"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card><CardContent className="p-4 text-center text-sm text-gray-400">Aucune donnée pour ce mois</CardContent></Card>
            )}
          </div>

          {/* ROW 2: Exercice fiscal */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#1E2A4A]">Exercice fiscal</h2>
                <Badge variant="outline" className="text-xs">Juil. {exercice.split("-")[0]} → Juin {exercice.split("-")[1]}</Badge>
              </div>
              <Select value={exercice} onValueChange={setExercice}>
                <SelectTrigger className="w-[220px] h-8 text-xs"><Calendar className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  {getExerciceChoices().map(ex => <SelectItem key={ex} value={ex}>Exercice {ex}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {loading ? skeleton(4) : exerciseData ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="CA exercice" value={exerciseData.totalRevenue} icon={TrendingUp} color="text-green-600" bg="bg-green-50" />
                <KpiCard label="Dépenses exercice" value={exerciseData.totalExpenses} icon={Receipt} color="text-red-500" bg="bg-red-50" />
                <KpiCard label="Résultat net" value={exerciseData.resultat} icon={TrendingUp} color={exerciseData.resultat >= 0 ? "text-green-600" : "text-red-500"} bg={exerciseData.resultat >= 0 ? "bg-green-50" : "bg-red-50"} />
                <KpiCard label="Trésorerie" value={tresorerie.totalBankMUR} icon={Banknote} color="text-blue-600" bg="bg-blue-50" />
              </div>
            ) : (
              <Card><CardContent className="p-4 text-center text-sm text-gray-400">Aucune donnée pour cet exercice</CardContent></Card>
            )}
          </div>

          {/* Bar chart: last 6 months */}
          {chartData.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h2 className="text-sm font-semibold text-[#1E2A4A] mb-4">Évolution mensuelle</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="CA" fill="#16a34a" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Dépenses" fill="#ef4444" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Résultat" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Mes sociétés */}
          {societes.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-[#1E2A4A]">Mes Sociétés</h2>
                <Link href="/client/societes">
                  <Button variant="ghost" size="sm" className="text-xs">Gérer <ChevronRight className="w-3 h-3 ml-1" /></Button>
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {societes.map(s => (
                  <Card key={s.id} className="border-l-4 border-l-[#1E2A4A]">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{s.nom}</p>
                        {s.brn && <p className="text-xs text-gray-400">BRN : {s.brn}</p>}
                        <Badge variant="outline" className="text-xs mt-1">{s.statut || 'active'}</Badge>
                      </div>
                      <Link href={`/client/societe?id=${s.id}`}>
                        <Button variant="ghost" size="icon" title="Fiche société"><Pencil className="w-4 h-4 text-gray-400" /></Button>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
                <Link href="/client/societes">
                  <Card className="border-dashed border-2 border-gray-200 hover:border-[#C9A84C] transition-colors cursor-pointer">
                    <CardContent className="p-4 flex items-center gap-2 text-gray-400 hover:text-[#C9A84C]">
                      <Plus className="w-4 h-4" />
                      <span className="text-sm">Ajouter une société</span>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
