"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Banknote,
  TrendingUp,
  TrendingDown,
  Wallet,
  Lightbulb,
  Clock,
  Loader2,
  BarChart3,
  FileText,
  BookOpen,
  Activity,
  Target,
  Percent,
  Timer,
  Fuel,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  AlertTriangle,
  Building2,
} from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

function formatMUR(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MUR"
}

function formatPct(n: number) {
  return n.toFixed(1) + " %"
}

function formatDays(n: number) {
  return n.toFixed(0) + " j"
}

function formatMonths(n: number) {
  if (n === Infinity || isNaN(n)) return "N/A"
  return n.toFixed(1) + " mois"
}

// Compute a financial health score 0-100, factoring in anomalies
function computeHealthScore(params: {
  treasury: number
  monthlyExpenses: number
  margin: number
  dso: number
  revenueTrend: number
  anomalyCount: number
  resultat: number
}): { score: number; label: string; color: string } {
  let score = 50 // base

  // Treasury vs 3 months expenses
  const runwayMonths = params.monthlyExpenses > 0 ? params.treasury / params.monthlyExpenses : 10
  if (runwayMonths >= 6) score += 20
  else if (runwayMonths >= 3) score += 10
  else if (runwayMonths >= 1) score += 0
  else score -= 15

  // Margin
  if (params.margin >= 20) score += 15
  else if (params.margin >= 10) score += 10
  else if (params.margin >= 0) score += 5
  else score -= 10

  // DSO
  if (params.dso <= 30) score += 10
  else if (params.dso <= 60) score += 5
  else score -= 5

  // Revenue trend
  if (params.revenueTrend > 10) score += 5
  else if (params.revenueTrend > 0) score += 2
  else if (params.revenueTrend < -10) score -= 10
  else if (params.revenueTrend < 0) score -= 3

  // Anomaly penalty
  if (params.anomalyCount > 0) {
    score -= Math.min(20, params.anomalyCount * 3)
  }

  score = Math.max(0, Math.min(100, score))

  // Hard caps based on conditions
  if (params.anomalyCount > 0 && score > 60) score = 60
  if (params.treasury < 200000 && score > 40) score = 40
  if (params.resultat < 0 && score > 50) score = 50

  let label = "Critique"
  let color = "#EF4444"
  if (score >= 80) { label = "Excellente"; color = "#22C55E" }
  else if (score >= 60) { label = "Bonne"; color = "#3B82F6" }
  else if (score >= 40) { label = "Correcte"; color = "#F59E0B" }
  else if (score >= 20) { label = "Fragile"; color = "#F97316" }

  return { score, label, color }
}

// Expense group labels for insights
const EXPENSE_GROUP_LABELS: Record<string, string> = {
  "601": "Achats mati\u00e8res", "602": "Achats stock\u00e9s", "604": "Achats \u00e9tudes",
  "606": "Achats non stock\u00e9s", "607": "Achats marchandises",
  "611": "Sous-traitance", "613": "Locations", "615": "Entretien",
  "616": "Assurances", "618": "Divers services ext.",
  "621": "Personnel ext\u00e9rieur", "622": "Honoraires", "623": "Publicit\u00e9",
  "624": "Transport", "625": "D\u00e9placements", "626": "T\u00e9l\u00e9com",
  "627": "Banque", "628": "Divers",
  "631": "Imp\u00f4ts", "635": "Autres imp\u00f4ts",
  "641": "Salaires", "645": "Charges sociales",
  "651": "Redevances", "654": "Pertes cr\u00e9ances",
  "661": "Int\u00e9r\u00eats emprunts", "665": "Escomptes",
  "681": "Dotations amortissements",
}

export default function TableauDeBordPage() {
  const { profile, loading } = useProfile()
  const [data, setData] = useState<any>(null)
  const [fetching, setFetching] = useState(true)
  const [selectedSociete, setSelectedSociete] = useState<string>("all")
  const [societes, setSocietes] = useState<{ id: string; nom: string }[]>([])

  useEffect(() => {
    setFetching(true)
    const url = selectedSociete !== "all"
      ? `/api/client/financial?societe_id=${selectedSociete}`
      : "/api/client/financial"
    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        setData(json.financial)
        if (json.financial?.availableSocietes) setSocietes(json.financial.availableSocietes)
      })
      .catch(() => setData(null))
      .finally(() => setFetching(false))
  }, [selectedSociete])

  // Computed KPIs
  const computed = useMemo(() => {
    if (!data) return null

    const totalRevenue = data.totalRevenue ?? 0
    const totalExpenses = data.totalExpenses ?? 0
    const monthlyRevenue = data.monthlyRevenue ?? 0
    const monthlyExpenses = data.monthlyExpenses ?? 0
    const resultatMensuel = data.resultatMensuel ?? 0
    const totalBankMUR = data.totalBankMUR ?? 0
    const creances = data.creances ?? 0
    const lastMonthRevenue = data.lastMonthRevenue ?? 0
    const tvaNette = data.tvaNette ?? 0
    const expensesByAccount: Record<string, number> = data.expensesByAccount ?? {}

    // DSO = (Creances / CA) * 30
    const dso = totalRevenue > 0 ? (creances / totalRevenue) * 30 : 0

    // Marge nette %
    const resultat = totalRevenue - totalExpenses
    const margeNette = totalRevenue > 0 ? (resultat / totalRevenue) * 100 : 0

    // Burn rate = total monthly expenses
    const burnRate = monthlyExpenses

    // Runway = Treasury / Burn rate (in months)
    const runway = burnRate > 0 ? totalBankMUR / burnRate : Infinity

    // Revenue trend vs last month
    const revenueTrend = lastMonthRevenue > 0
      ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : (monthlyRevenue > 0 ? 100 : 0)

    // Count anomalies from various sources
    const extractedInvoices: any[] = data.extractedInvoices ?? []
    const bankTransactions: any[] = data.bankTransactions ?? []

    // Unreconciled bank transactions
    const unreconciledCount = bankTransactions.filter(
      (t: any) => t.statut === 'non_identifie' || t.statut === 'a_verifier'
    ).length

    // Invoices with unresolved transactions
    const invoiceAnomalies = extractedInvoices.filter(
      (inv: any) => inv.statut === 'a_verifier' || (!inv.emetteur && !inv.destinataire)
    ).length

    // TVA anomalies (negative deductible or mismatch)
    const tvaAnomalies = (data.tvaDeductible ?? 0) < 0 ? 1 : 0

    // Documents with errors
    const docErrors = 0 // Would come from documents with statut = 'erreur'

    // Negative cash flow
    const negativeCashFlow = resultatMensuel < 0 ? 1 : 0

    const anomalyCount = unreconciledCount + invoiceAnomalies + tvaAnomalies + docErrors + negativeCashFlow

    // Health score with anomaly factoring
    const health = computeHealthScore({
      treasury: totalBankMUR,
      monthlyExpenses,
      margin: margeNette,
      dso,
      revenueTrend,
      anomalyCount,
      resultat,
    })

    // Top expense category
    let topExpensePrefix = ""
    let topExpenseAmount = 0
    for (const [prefix, amount] of Object.entries(expensesByAccount)) {
      if (amount > topExpenseAmount) {
        topExpenseAmount = amount
        topExpensePrefix = prefix
      }
    }
    const topExpenseLabel = EXPENSE_GROUP_LABELS[topExpensePrefix] || `Compte ${topExpensePrefix}x`

    // Insights
    const insights: { text: string; icon: typeof TrendingUp; color: string }[] = []

    if (anomalyCount > 0) {
      insights.push({
        text: `${anomalyCount} anomalie(s) detect\u00e9e(s) : ${unreconciledCount} transaction(s) non rapproch\u00e9e(s)${tvaAnomalies > 0 ? ', anomalie TVA' : ''}${negativeCashFlow > 0 ? ', cash flow n\u00e9gatif' : ''}`,
        icon: AlertTriangle,
        color: "#EF4444",
      })
    }

    if (topExpenseAmount > 0) {
      insights.push({
        text: `Poste de charges le plus important : ${topExpenseLabel} (${formatMUR(topExpenseAmount)})`,
        icon: BarChart3,
        color: "#EF4444",
      })
    }

    if (lastMonthRevenue > 0 || monthlyRevenue > 0) {
      const trend = revenueTrend
      if (trend > 0) {
        insights.push({
          text: `Revenus en hausse de ${trend.toFixed(1)}% par rapport au mois dernier`,
          icon: ArrowUpRight,
          color: "#22C55E",
        })
      } else if (trend < 0) {
        insights.push({
          text: `Revenus en baisse de ${Math.abs(trend).toFixed(1)}% par rapport au mois dernier`,
          icon: ArrowDownRight,
          color: "#EF4444",
        })
      } else {
        insights.push({
          text: "Revenus stables par rapport au mois dernier",
          icon: Minus,
          color: GOLD,
        })
      }
    }

    if (tvaNette > 0) {
      insights.push({
        text: `TVA nette \u00e0 payer : ${formatMUR(tvaNette)}`,
        icon: AlertIcon,
        color: "#F59E0B",
      })
    } else if (tvaNette < 0) {
      insights.push({
        text: `Cr\u00e9dit TVA de ${formatMUR(Math.abs(tvaNette))}`,
        icon: ShieldCheck,
        color: "#22C55E",
      })
    }

    return {
      totalRevenue, totalExpenses, monthlyRevenue, monthlyExpenses,
      resultatMensuel, totalBankMUR, dso, margeNette, burnRate, runway,
      health, insights, revenueTrend, anomalyCount,
      totalDocuments: data.totalDocuments ?? 0,
      totalEcritures: data.totalEcritures ?? 0,
      currentMonth: data.currentMonth ?? "",
    }
  }, [data])

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: NAVY }}>
          Acc&egrave;s non autoris&eacute;
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;acc&eacute;der &agrave; cette page.
        </p>
        <Link href="/client/documents" className="text-sm underline" style={{ color: GOLD }}>
          Retour aux documents
        </Link>
      </div>
    )
  }

  if (!computed) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Impossible de charger les donn&eacute;es.</p>
      </div>
    )
  }

  const primaryKpis = [
    { title: "Tr\u00e9sorerie", value: formatMUR(computed.totalBankMUR), icon: Banknote, color: NAVY },
    { title: "Revenus ce mois", value: formatMUR(computed.monthlyRevenue), icon: TrendingUp, color: "#22C55E" },
    { title: "D\u00e9penses ce mois", value: formatMUR(computed.monthlyExpenses), icon: TrendingDown, color: "#EF4444" },
    { title: "B\u00e9n\u00e9fice mensuel", value: formatMUR(computed.resultatMensuel), icon: Wallet, color: computed.resultatMensuel >= 0 ? "#22C55E" : "#EF4444" },
  ]

  const advancedKpis = [
    { title: "DSO (D\u00e9lai de paiement)", value: formatDays(computed.dso), subtitle: "(Cr\u00e9ances / CA) \u00d7 30", icon: Timer, color: NAVY },
    { title: "Marge nette", value: formatPct(computed.margeNette), subtitle: "R\u00e9sultat / CA \u00d7 100", icon: Percent, color: computed.margeNette >= 0 ? "#22C55E" : "#EF4444" },
    { title: "Burn rate mensuel", value: formatMUR(computed.burnRate), subtitle: "Total charges / mois", icon: Fuel, color: "#F59E0B" },
    { title: "Runway", value: formatMonths(computed.runway), subtitle: "Tr\u00e9sorerie / Burn rate", icon: Target, color: computed.runway >= 6 ? "#22C55E" : computed.runway >= 3 ? "#F59E0B" : "#EF4444" },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            Mon Tableau de Bord
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vue d&apos;ensemble de la sant&eacute; financi&egrave;re de votre entreprise
            {computed.currentMonth ? ` — ${computed.currentMonth}` : ""}
          </p>
        </div>
        {societes.length > 1 && (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedSociete} onValueChange={setSelectedSociete}>
              <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les soci&eacute;t&eacute;s</SelectItem>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Health Score + Anomaly count */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-2" style={{ borderColor: computed.health.color }}>
          <CardContent className="py-5">
            <div className="flex items-center gap-6">
              <div className="relative flex items-center justify-center">
                <svg width="80" height="80" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="#E5E7EB" strokeWidth="6" />
                  <circle
                    cx="40" cy="40" r="34" fill="none"
                    stroke={computed.health.color} strokeWidth="6"
                    strokeDasharray={`${(computed.health.score / 100) * 213.6} 213.6`}
                    strokeLinecap="round"
                    transform="rotate(-90 40 40)"
                  />
                </svg>
                <span className="absolute text-lg font-bold" style={{ color: computed.health.color }}>
                  {computed.health.score}
                </span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sant&eacute; financi&egrave;re</p>
                <p className="text-2xl font-bold" style={{ color: computed.health.color }}>
                  {computed.health.label}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Bas&eacute; sur : tr&eacute;sorerie, marge, DSO, tendance revenus, anomalies
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Anomaly count card */}
        <Card className={`border-2 ${computed.anomalyCount > 0 ? "border-red-400 bg-red-50" : "border-green-300 bg-green-50"}`}>
          <CardContent className="py-5 flex flex-col items-center justify-center h-full">
            <AlertTriangle
              className="h-8 w-8 mb-2"
              style={{ color: computed.anomalyCount > 0 ? "#EF4444" : "#22C55E" }}
            />
            <p className="text-3xl font-bold" style={{ color: computed.anomalyCount > 0 ? "#EF4444" : "#22C55E" }}>
              {computed.anomalyCount}
            </p>
            <p className="text-sm font-medium" style={{ color: NAVY }}>
              {computed.anomalyCount === 0 ? "Aucune anomalie" : computed.anomalyCount === 1 ? "Anomalie d\u00e9tect\u00e9e" : "Anomalies d\u00e9tect\u00e9es"}
            </p>
            {computed.anomalyCount > 0 && (
              <p className="text-xs text-red-600 mt-1 text-center">
                Score plafonn&eacute; &agrave; 60 tant que des anomalies existent
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Health score capping warnings */}
      {(computed.totalBankMUR < 200000 || (computed.totalRevenue - computed.totalExpenses) < 0) && (
        <div className="space-y-2">
          {computed.totalBankMUR < 200000 && (
            <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600 flex-shrink-0" />
              <p className="text-sm text-orange-700">
                Tr&eacute;sorerie inf&eacute;rieure &agrave; 200 000 MUR — score plafonn&eacute; &agrave; 40
              </p>
            </div>
          )}
          {(computed.totalRevenue - computed.totalExpenses) < 0 && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700">
                R&eacute;sultat n&eacute;gatif — score plafonn&eacute; &agrave; 50
              </p>
            </div>
          )}
        </div>
      )}

      {/* 4 Primary KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {primaryKpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <Card key={kpi.title}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {kpi.title}
                  </CardTitle>
                  <Icon className="h-4 w-4" style={{ color: kpi.color }} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" style={{ color: NAVY }}>
                  {kpi.value}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 4 Advanced KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {advancedKpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <Card key={kpi.title}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {kpi.title}
                  </CardTitle>
                  <Icon className="h-4 w-4" style={{ color: kpi.color }} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold" style={{ color: kpi.color }}>
                  {kpi.value}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{kpi.subtitle}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Activity stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Documents comptables
              </CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            {computed.totalDocuments === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune donn&eacute;e</p>
            ) : (
              <p className="text-2xl font-bold" style={{ color: NAVY }}>{computed.totalDocuments}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                &Eacute;critures comptables
              </CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            {computed.totalEcritures === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune donn&eacute;e</p>
            ) : (
              <p className="text-2xl font-bold" style={{ color: NAVY }}>{computed.totalEcritures}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top 3 Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base" style={{ color: NAVY }}>
            <Lightbulb className="h-5 w-5" style={{ color: GOLD }} />
            Ce qu&apos;il faut retenir
          </CardTitle>
        </CardHeader>
        <CardContent>
          {computed.insights.length > 0 ? (
            <ul className="space-y-3">
              {computed.insights.slice(0, 4).map((insight, idx) => {
                const Icon = insight.icon
                return (
                  <li key={idx} className="flex items-start gap-3 text-sm" style={{ color: NAVY }}>
                    <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: insight.color }} />
                    <span>{insight.text}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <BarChart3 className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Aucun insight disponible pour le moment.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Les analyses appara&icirc;tront ici une fois vos donn&eacute;es comptables trait&eacute;es.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer badge */}
      <div className="flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Mis &agrave; jour en temps r&eacute;el &agrave; partir de vos &eacute;critures comptables
        </p>
      </div>
    </div>
  )
}

// Small alert icon component used in insights
function AlertIcon(props: React.SVGProps<SVGSVGElement> & { className?: string; style?: React.CSSProperties }) {
  return <Activity {...props} />
}
