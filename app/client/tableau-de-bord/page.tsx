"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useProfile } from "@/hooks/use-profile"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Building2, FileText, Users, TrendingUp, AlertCircle, Plus, ArrowRight,
  Loader2, Banknote, Receipt, UserCog, ChevronLeft, ChevronRight, Calendar,
} from "lucide-react"

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

function shiftMonth(mois: string, delta: number): string {
  const [y, m] = mois.split("-").map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export default function TableauDeBord() {
  const { profile, loading: profileLoading } = useProfile()
  const router = useRouter()
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selected, setSelected] = useState<string>("all")
  const [loading, setLoading] = useState(true)

  // Period state
  const now = new Date()
  const currentMoisDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const [mois, setMois] = useState(currentMoisDefault)
  const [exercice, setExercice] = useState(getCurrentExercice())

  // KPI data
  const [monthly, setMonthly] = useState<{ totalRevenue: number; totalExpenses: number; resultat: number } | null>(null)
  const [exerciseData, setExerciseData] = useState<{ totalRevenue: number; totalExpenses: number; resultat: number } | null>(null)
  const [tresorerie, setTresorerie] = useState<{ totalBankMUR: number; nbComptes: number }>({ totalBankMUR: 0, nbComptes: 0 })
  const [nbDocuments, setNbDocuments] = useState(0)

  // Charger les sociétés
  useEffect(() => {
    fetch("/api/client/societes")
      .then(r => r.json())
      .then(d => {
        setSocietes(d.societes || [])
        if (d.societes?.length === 1) setSelected(d.societes[0].id)
      })
  }, [])

  // Charger les stats — monthly + exercise in parallel
  useEffect(() => {
    setLoading(true)
    const base = selected && selected !== "all" ? `societe_id=${selected}&` : ""

    // Parse exercise dates
    const exMatch = exercice.match(/^(\d{4})-(\d{4})$/)
    const exDebut = exMatch ? `${exMatch[1]}-07-01` : ""
    const exFin = exMatch ? `${exMatch[2]}-06-30` : ""

    // Monthly: filter by month
    const [moisY, moisM] = mois.split("-").map(Number)
    const moisDebut = `${moisY}-${String(moisM).padStart(2, "0")}-01`
    const lastDay = new Date(moisY, moisM, 0).getDate()
    const moisFin = `${moisY}-${String(moisM).padStart(2, "0")}-${lastDay}`

    Promise.all([
      fetch(`/api/client/financial?${base}date_debut=${moisDebut}&date_fin=${moisFin}`).then(r => r.json()).catch(() => null),
      fetch(`/api/client/financial?${base}date_debut=${exDebut}&date_fin=${exFin}`).then(r => r.json()).catch(() => null),
    ]).then(([mData, eData]) => {
      if (mData?.financial) {
        const f = mData.financial
        setMonthly({ totalRevenue: f.totalRevenue || 0, totalExpenses: f.totalExpenses || 0, resultat: f.resultat || 0 })
        setTresorerie({ totalBankMUR: f.totalBankMUR || 0, nbComptes: f.bankAccounts?.length || 0 })
        setNbDocuments(f.totalDocuments || 0)
      } else {
        setMonthly(null)
      }
      if (eData?.financial) {
        const f = eData.financial
        setExerciseData({ totalRevenue: f.totalRevenue || 0, totalExpenses: f.totalExpenses || 0, resultat: f.resultat || 0 })
      } else {
        setExerciseData(null)
      }
      setLoading(false)
    })
  }, [selected, mois, exercice])

  const societeActive = societes.find(s => s.id === selected)

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

  function KpiCard({ label, value, icon: Icon, color, bg }: { label: string; value: number; icon: any; color: string; bg: string }) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
            <Icon className={`w-4 h-4 ${color}`} />
          </div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className={`text-lg font-bold ${color} mt-0.5`}>
            {value !== 0 ? fmt(value) : <span className="text-sm text-gray-400 font-normal">Pas de données</span>}
          </p>
        </CardContent>
      </Card>
    )
  }

  const loadingSkeleton = (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[1,2,3,4].map(i => (
        <Card key={i}><CardContent className="p-4">
          <div className="h-4 bg-gray-100 rounded animate-pulse mb-2 w-2/3" />
          <div className="h-7 bg-gray-100 rounded animate-pulse w-full" />
        </CardContent></Card>
      ))}
    </div>
  )

  return (
    <div className="p-3 pt-12 sm:p-4 md:pt-6 md:p-6 space-y-4 sm:space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">
            Bonjour {profile?.full_name?.split(" ")[0] || ""}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5 capitalize">{formatMoisLabel(mois)}</p>
        </div>
        {societes.length > 1 && (
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Toutes les sociétés" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes mes sociétés</SelectItem>
              {societes.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {societes.length === 1 && (
          <div className="text-right">
            <p className="font-semibold text-[#1E2A4A]">{societes[0].nom}</p>
            {societes[0].brn && <p className="text-xs text-gray-400">BRN : {societes[0].brn}</p>}
          </div>
        )}
      </div>

      {/* Pas de société → onboarding */}
      {societes.length === 0 && (
        <Card className="border-2 border-dashed border-[#C9A84C]/40 bg-[#C9A84C]/5">
          <CardContent className="p-8 text-center space-y-4">
            <Building2 className="w-12 h-12 mx-auto text-[#C9A84C]" />
            <div>
              <p className="text-lg font-bold text-[#1E2A4A]">Bienvenue sur LEXORA</p>
              <p className="text-sm text-gray-500 mt-1">Commencez par créer votre société pour accéder à tous les modules.</p>
            </div>
            <Link href="/client/societes">
              <Button className="bg-[#1E2A4A]">
                <Plus className="w-4 h-4 mr-2" /> Créer ma société
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* KPIs — dual period */}
      {societes.length > 0 && (
        <>
          {/* ROW 1: Ce mois */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#1E2A4A]">Ce mois</h2>
                <Badge variant="outline" className="text-xs capitalize">{formatMoisLabel(mois)}</Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMois(shiftMonth(mois, -1))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setMois(currentMoisDefault)}>
                  Aujourd&apos;hui
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMois(shiftMonth(mois, 1))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {loading ? loadingSkeleton : monthly ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="CA du mois" value={monthly.totalRevenue} icon={TrendingUp} color="text-green-600" bg="bg-green-50" />
                <KpiCard label="Dépenses du mois" value={monthly.totalExpenses} icon={Receipt} color="text-red-500" bg="bg-red-50" />
                <KpiCard label="Bénéfice du mois" value={monthly.resultat} icon={TrendingUp} color={monthly.resultat >= 0 ? "text-green-600" : "text-red-500"} bg={monthly.resultat >= 0 ? "bg-green-50" : "bg-red-50"} />
                <KpiCard label="Trésorerie" value={tresorerie.totalBankMUR} icon={Banknote} color="text-blue-600" bg="bg-blue-50" />
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
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <Calendar className="w-3 h-3 mr-1" /><SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getExerciceChoices().map(ex => (
                    <SelectItem key={ex} value={ex}>Exercice {ex}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {loading ? loadingSkeleton : exerciseData ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="CA exercice" value={exerciseData.totalRevenue} icon={TrendingUp} color="text-green-600" bg="bg-green-50" />
                <KpiCard label="Dépenses exercice" value={exerciseData.totalExpenses} icon={Receipt} color="text-red-500" bg="bg-red-50" />
                <KpiCard label="Résultat net" value={exerciseData.resultat} icon={TrendingUp} color={exerciseData.resultat >= 0 ? "text-green-600" : "text-red-500"} bg={exerciseData.resultat >= 0 ? "bg-green-50" : "bg-red-50"} />
                <Card>
                  <CardContent className="p-4">
                    <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center mb-2">
                      <FileText className="w-4 h-4 text-purple-600" />
                    </div>
                    <p className="text-xs text-gray-500">Documents</p>
                    <p className="text-lg font-bold text-purple-600 mt-0.5">{nbDocuments}</p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card><CardContent className="p-4 text-center text-sm text-gray-400">Aucune donnée pour cet exercice</CardContent></Card>
            )}
          </div>

          {/* Actions rapides */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <p className="font-semibold text-sm">Documents</p>
                </div>
                <p className="text-xs text-gray-500 mb-3">Uploadez factures, relevés, justificatifs</p>
                <Link href="/client/documents">
                  <Button variant="outline" size="sm" className="w-full">
                    Accéder <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-purple-600" />
                  </div>
                  <p className="font-semibold text-sm">Mon Équipe</p>
                </div>
                <p className="text-xs text-gray-500 mb-3">Gérer les accès RH, Juridique, Employés</p>
                <Link href="/client/utilisateurs">
                  <Button variant="outline" size="sm" className="w-full">
                    Accéder <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <p className="font-semibold text-sm">États Financiers</p>
                </div>
                <p className="text-xs text-gray-500 mb-3">Grand Livre, Bilan, P&L, TVA</p>
                <Link href="/client/bilan">
                  <Button variant="outline" size="sm" className="w-full">
                    Accéder <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* Mes sociétés */}
          {societes.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-[#1E2A4A]">Mes Sociétés</h2>
                <Link href="/client/societes">
                  <Button variant="ghost" size="sm" className="text-xs">Gérer <ArrowRight className="w-3 h-3 ml-1" /></Button>
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
                      <div className="flex gap-2">
                        <Link href={`/client/documents?societe_id=${s.id}`}>
                          <Button variant="ghost" size="sm" title="Documents"><FileText className="w-4 h-4" /></Button>
                        </Link>
                        <Link href={`/client/utilisateurs?societe_id=${s.id}`}>
                          <Button variant="ghost" size="sm" title="Équipe"><UserCog className="w-4 h-4" /></Button>
                        </Link>
                      </div>
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
