"use client"
import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useProfile } from "@/hooks/use-profile"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Building2, TrendingUp, Plus, Loader2, Banknote, Receipt,
  ChevronLeft, ChevronRight, Calendar, Bell, Users, Pencil, Settings,
  AlertTriangle, Info, ExternalLink,
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Societe { id: string; nom: string; brn: string; statut: string }
interface Alerte { id: string; niveau: 'danger' | 'warning' | 'info'; titre: string; description: string; montant?: number; echeance?: string; lien?: string }

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
  const { societeId, societe, societes } = useSocieteActive()
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const currentMoisDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const [mois, setMois] = useState(currentMoisDefault)
  const [exercice, setExercice] = useState(getCurrentExercice())
  const isCurrentMonth = mois === currentMoisDefault

  // KPI data
  const [monthly, setMonthly] = useState<any>(null)
  const [exerciseData, setExerciseData] = useState<any>(null)
  const [tresorerie, setTresorerie] = useState<{ totalBankMUR: number; nbComptes: number; comptes: { banque: string; devise: string; solde: number }[] }>({ totalBankMUR: 0, nbComptes: 0, comptes: [] })
  const [chartData, setChartData] = useState<any[]>([])
  const [alertes, setAlertes] = useState<Alerte[]>([])

  // Fetch KPIs + chart data
  useEffect(() => {
    if (!societeId) { setLoading(false); return }
    setLoading(true)
    const base = `societe_id=${societeId}&`

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
        setTresorerie({
          totalBankMUR: f.totalBankMUR || 0,
          nbComptes: f.bankAccounts?.length || 0,
          comptes: (f.bankAccounts || []).map((a: any) => ({ banque: a.banque || '—', devise: a.devise || 'MUR', solde: Number(a.solde_actuel) || 0 })),
        })

        // Generate alertes from data
        const generatedAlertes: Alerte[] = []
        const todayStr = new Date().toISOString().slice(0, 10)
        const in7days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

        // TYPE 1 — Factures en retard
        const facturesRetard = (f.factures || []).filter((fc: any) =>
          fc.date_echeance && fc.date_echeance < todayStr && fc.statut !== 'paye' && fc.statut !== 'annule'
        )
        facturesRetard.slice(0, 3).forEach((fc: any) => {
          generatedAlertes.push({
            id: `retard-${fc.id}`, niveau: 'danger',
            titre: `Facture en retard — ${fc.tiers || 'Inconnu'}`,
            description: `Échéance dépassée depuis le ${new Date(fc.date_echeance).toLocaleDateString('fr-FR')}`,
            montant: Number(fc.montant_mur) || Number(fc.montant_ttc) || 0,
            echeance: fc.date_echeance, lien: '/client/echeances',
          })
        })

        // TYPE 2 — Factures échéant dans 7 jours
        const facturesProches = (f.factures || []).filter((fc: any) =>
          fc.date_echeance && fc.date_echeance >= todayStr && fc.date_echeance <= in7days && fc.statut !== 'paye' && fc.statut !== 'annule'
        )
        facturesProches.slice(0, 3).forEach((fc: any) => {
          const days = Math.ceil((new Date(fc.date_echeance).getTime() - Date.now()) / 86400000)
          generatedAlertes.push({
            id: `proche-${fc.id}`, niveau: 'warning',
            titre: `Échéance proche — ${fc.tiers || 'Inconnu'}`,
            description: `Dans ${days} jour${days > 1 ? 's' : ''}`,
            montant: Number(fc.montant_mur) || Number(fc.montant_ttc) || 0,
            echeance: fc.date_echeance, lien: '/client/echeances',
          })
        })

        // TYPE 3 — Déclaration TVA
        if (new Date().getDate() >= 15 && new Date().getDate() <= 20) {
          generatedAlertes.push({
            id: 'tva-declaration', niveau: 'info',
            titre: 'Déclaration TVA',
            description: `TVA du mois à soumettre avant le 20`,
            lien: '/client/tva',
          })
        }

        // TYPE 5 — Solde bancaire faible (MUR accounts only, or EUR < 500)
        ;(f.bankAccounts || []).forEach((acc: any) => {
          const devise = (acc.devise || 'MUR').toUpperCase()
          const solde = Number(acc.solde_actuel) || 0
          const threshold = devise === 'MUR' ? 50000 : devise === 'EUR' ? 500 : null
          if (threshold !== null && solde < threshold) {
            const lastDigits = acc.numero_compte ? `•${acc.numero_compte.slice(-4)}` : ''
            const societeNom = acc.societe_nom || ''
            generatedAlertes.push({
              id: `solde-${acc.id}`, niveau: 'danger',
              titre: `Solde faible — ${societeNom ? societeNom + ' — ' : ''}${acc.banque || 'Compte'} ${devise} ${lastDigits}`,
              description: `Solde actuel: ${solde.toLocaleString('fr-FR')} ${devise} (seuil: ${threshold.toLocaleString('fr-FR')} ${devise})`,
              montant: solde,
              lien: '/client/banque',
            })
          }
        })

        setAlertes(generatedAlertes)
      } else {
        setMonthly(null)
        setAlertes([])
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
  }, [societeId, mois, exercice])

  // Redirect assistant
  useEffect(() => {
    if (!profileLoading && profile?.role === "client_assistant") {
      router.replace("/client/assistant")
    }
  }, [profileLoading, profile?.role, router])

  if (profileLoading || profile?.role === "client_assistant") return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-[#0B0F2E]" />
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
          <h1 className="text-2xl font-bold text-[#0B0F2E]">Bonjour {profile?.full_name?.split(" ")[0] || ""}</h1>
          <p className="text-gray-500 text-sm mt-0.5 capitalize">{formatMoisLabel(mois)}</p>
        </div>
        {societe && (
          <div className="text-right">
            <p className="font-semibold text-[#0B0F2E]">{societe.nom}</p>
            {societe.brn && <p className="text-xs text-gray-400">BRN : {societe.brn}</p>}
          </div>
        )}
      </div>

      {societeId && (
        <>
          {/* ROW 1: Ce mois — 7 KPIs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#0B0F2E]">Ce mois</h2>
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
                <KpiCard label="CA du mois" value={monthly.totalRevenue} icon={TrendingUp} color="text-[#A88925]" bg="bg-[#D4AF37]/10" />
                <KpiCard label="Dépenses du mois" value={monthly.totalExpenses} icon={Receipt} color="text-[#9F1239]" bg="bg-[#9F1239]/10" />
                <KpiCard label="Bénéfice du mois" value={monthly.resultat} icon={TrendingUp} color={monthly.resultat >= 0 ? "text-[#0F766E]" : "text-[#9F1239]"} bg={monthly.resultat >= 0 ? "bg-[#0F766E]/10" : "bg-[#9F1239]/10"} />
                <Card>
                  <CardContent className="p-4">
                    <div className="w-8 h-8 rounded-lg bg-[#0B0F2E]/8 flex items-center justify-center mb-2">
                      <Banknote className="w-4 h-4 text-[#0B0F2E]" />
                    </div>
                    <p className="text-xs text-gray-500">Trésorerie</p>
                    <p className="text-lg font-bold text-[#0B0F2E] mt-0.5">{tresorerie.totalBankMUR !== 0 ? fmt(tresorerie.totalBankMUR) : <span className="text-sm text-gray-400 font-normal">Pas de données</span>}</p>
                    {tresorerie.comptes.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {tresorerie.comptes.slice(0, 3).map((c, i) => (
                          <p key={i} className="text-[10px] text-gray-400">{c.banque} {c.devise}: {c.solde.toLocaleString('fr-FR')} {c.devise}</p>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                <KpiCard label="TVA nette" value={monthly.tvaNette} icon={Receipt} color="text-[#A88925]" bg="bg-[#D4AF37]/10" />
                <KpiCard label="Masse salariale" valueStr={isCurrentMonth ? "Mois en cours" : undefined} value={isCurrentMonth ? undefined : monthly.salaires} icon={Users} color="text-slate-600" bg="bg-slate-100" />
                <Card className="cursor-pointer" onClick={() => document.getElementById('alertes-section')?.scrollIntoView({ behavior: 'smooth' })}>
                  <CardContent className="p-4">
                    {(() => {
                      const nbDanger = alertes.filter(a => a.niveau === 'danger').length
                      const nbWarning = alertes.filter(a => a.niveau === 'warning').length
                      const total = nbDanger + nbWarning
                      const bg = nbDanger > 0 ? "bg-[#9F1239]/10" : nbWarning > 0 ? "bg-[#D4AF37]/10" : "bg-[#0F766E]/10"
                      const iconColor = nbDanger > 0 ? "text-[#9F1239]" : nbWarning > 0 ? "text-[#A88925]" : "text-[#0F766E]"
                      const textColor = nbDanger > 0 ? "text-[#9F1239]" : nbWarning > 0 ? "text-[#A88925]" : "text-[#0F766E]"
                      return <>
                        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
                          <Bell className={`w-4 h-4 ${iconColor}`} />
                        </div>
                        <p className="text-xs text-gray-500">Alertes</p>
                        <p className={`text-lg font-bold mt-0.5 ${textColor}`}>
                          {total > 0 ? `${total} alerte${total > 1 ? 's' : ''}` : "Aucune"}
                        </p>
                      </>
                    })()}
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
                <h2 className="text-sm font-semibold text-[#0B0F2E]">Exercice fiscal</h2>
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
                <KpiCard label="CA exercice" value={exerciseData.totalRevenue} icon={TrendingUp} color="text-[#A88925]" bg="bg-[#D4AF37]/10" />
                <KpiCard label="Dépenses exercice" value={exerciseData.totalExpenses} icon={Receipt} color="text-[#9F1239]" bg="bg-[#9F1239]/10" />
                <KpiCard label="Résultat net" value={exerciseData.resultat} icon={TrendingUp} color={exerciseData.resultat >= 0 ? "text-[#0F766E]" : "text-[#9F1239]"} bg={exerciseData.resultat >= 0 ? "bg-[#0F766E]/10" : "bg-[#9F1239]/10"} />
                <Card>
                  <CardContent className="p-4">
                    <div className="w-8 h-8 rounded-lg bg-[#0B0F2E]/8 flex items-center justify-center mb-2">
                      <Banknote className="w-4 h-4 text-[#0B0F2E]" />
                    </div>
                    <p className="text-xs text-gray-500">Trésorerie</p>
                    <p className="text-lg font-bold text-[#0B0F2E] mt-0.5">{tresorerie.totalBankMUR !== 0 ? fmt(tresorerie.totalBankMUR) : <span className="text-sm text-gray-400 font-normal">Pas de données</span>}</p>
                    {tresorerie.comptes.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {tresorerie.comptes.slice(0, 3).map((c, i) => (
                          <p key={i} className="text-[10px] text-gray-400">{c.banque} {c.devise}: {c.solde.toLocaleString('fr-FR')} {c.devise}</p>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card><CardContent className="p-4 text-center text-sm text-gray-400">Aucune donnée pour cet exercice</CardContent></Card>
            )}
          </div>

          {/* Bar chart: last 6 months */}
          {chartData.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h2 className="text-sm font-semibold text-[#0B0F2E] mb-4">Évolution mensuelle</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="CA" fill="#D4AF37" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Dépenses" fill="#9F1239" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Résultat" fill="#0B0F2E" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Alertes & Rappels */}
          <div id="alertes-section">
            <h2 className="font-bold text-[#0B0F2E] mb-3 flex items-center gap-2">
              <Bell className="w-4 h-4" /> Alertes & Rappels
            </h2>
            {alertes.length === 0 ? (
              <Card className="border-[#0F766E]/30 bg-[#0F766E]/5">
                <CardContent className="p-4 text-center text-sm text-[#0F766E]">
                  Aucune alerte — tout est en ordre
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {alertes
                  .sort((a, b) => {
                    const order = { danger: 0, warning: 1, info: 2 }
                    return (order[a.niveau] ?? 3) - (order[b.niveau] ?? 3)
                  })
                  .slice(0, 5)
                  .map(a => {
                    const borderColor = a.niveau === 'danger' ? 'border-l-[#9F1239]' : a.niveau === 'warning' ? 'border-l-[#D4AF37]' : 'border-l-[#0B0F2E]'
                    const bgColor = a.niveau === 'danger' ? 'bg-[#9F1239]/5' : a.niveau === 'warning' ? 'bg-[#D4AF37]/5' : 'bg-[#0B0F2E]/5'
                    const Icon = a.niveau === 'danger' ? AlertTriangle : a.niveau === 'warning' ? Bell : Info
                    const iconColor = a.niveau === 'danger' ? 'text-[#9F1239]' : a.niveau === 'warning' ? 'text-[#A88925]' : 'text-[#0B0F2E]'
                    return (
                      <Card key={a.id} className={`border-l-4 ${borderColor} ${bgColor}`}>
                        <CardContent className="p-3 flex items-center justify-between">
                          <div className="flex items-start gap-3">
                            <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconColor}`} />
                            <div>
                              <p className="text-sm font-semibold text-[#0B0F2E]">{a.titre}</p>
                              <p className="text-xs text-gray-500">{a.description}</p>
                              {a.montant ? <p className="text-xs font-mono text-gray-600 mt-0.5">{fmt(a.montant)}</p> : null}
                            </div>
                          </div>
                          {a.lien && (
                            <Link href={a.lien}>
                              <Button variant="ghost" size="sm" className="text-xs gap-1">
                                <ExternalLink className="w-3 h-3" /> Voir
                              </Button>
                            </Link>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                {alertes.length > 5 && (
                  <Link href="/client/alertes">
                    <Button variant="outline" size="sm" className="w-full text-xs">
                      Voir toutes les alertes ({alertes.length})
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Mes sociétés */}
          {societes.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-[#0B0F2E]">Mes Sociétés</h2>
                <Link href="/client/societes">
                  <Button variant="ghost" size="sm" className="text-xs">Gérer <ChevronRight className="w-3 h-3 ml-1" /></Button>
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {societes.map((s: any) => (
                  <Card key={s.id} className="border-l-4 border-l-[#0B0F2E]">
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
                  <Card className="border-dashed border-2 border-gray-200 hover:border-[#D4AF37] transition-colors cursor-pointer">
                    <CardContent className="p-4 flex items-center gap-2 text-gray-400 hover:text-[#D4AF37]">
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
