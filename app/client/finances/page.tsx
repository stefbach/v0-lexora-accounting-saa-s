"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  TrendingUp, TrendingDown, DollarSign, Loader2,
  BookOpen, BarChart3, Calendar, Target, Wallet,
  ArrowRight, Landmark, Percent, Building2,
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return Math.round(n).toLocaleString("fr-FR") + " MUR"
}

// Account label map for P&L
const REVENUE_LABELS: Record<string, string> = {
  "700": "Ventes marchandises", "701": "Ventes produits finis", "706": "Prestations de services",
  "707": "Ventes de marchandises", "708": "Produits annexes", "709": "Rabais/Remises",
  "71": "Production stockee", "72": "Production immobilisee", "74": "Subventions", "75": "Autres produits",
  "76": "Produits financiers", "77": "Produits exceptionnels", "78": "Reprises amortissements",
}
const EXPENSE_LABELS: Record<string, string> = {
  "60": "Achats", "61": "Services exterieurs", "612": "Loyer", "613": "Locations",
  "616": "Assurances", "622": "Honoraires", "624": "Transport", "625": "Deplacements",
  "626": "Telecom", "627": "Frais bancaires", "628": "Charges diverses",
  "63": "Impots & taxes", "64": "Charges personnel", "65": "Autres charges gestion",
  "651": "SaaS / Logiciels", "66": "Charges financieres", "67": "Charges exceptionnelles",
  "68": "Dotations amortissements",
}

function getLabel(prefix: string, map: Record<string, string>): string {
  if (map[prefix]) return map[prefix]
  // Try shorter prefixes
  for (let len = prefix.length; len >= 2; len--) {
    const short = prefix.substring(0, len)
    if (map[short]) return map[short]
  }
  return `Compte ${prefix}`
}

const QUICK_LINKS = [
  { href: "/client/grand-livre", label: "Grand Livre", icon: BookOpen },
  { href: "/client/bilan", label: "Bilan & P&L", icon: BarChart3 },
  { href: "/client/previsionnel", label: "Previsionnel", icon: Target },
  { href: "/client/exercices", label: "Exercices", icon: Calendar },
]

export default function FinancesPage() {
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

  const ca = data?.totalRevenue || 0
  const depenses = data?.totalExpenses || 0
  const resultat = data?.resultat ?? (ca - depenses)
  const tresorerie = data?.totalBankMUR || 0
  const creances = data?.creances || 0
  const dettes = data?.dettesFournisseurs || 0
  const bfr = creances - dettes
  const dso = ca > 0 ? (creances / ca) * 365 : 0
  const dpo = depenses > 0 ? (dettes / depenses) * 365 : 0
  const margeNette = ca > 0 ? (resultat / ca) * 100 : 0

  // Revenue / expense breakdown sorted by value
  const revenueBreakdown = useMemo(() => {
    if (!data?.revenueByAccount) return []
    return Object.entries(data.revenueByAccount as Record<string, number>)
      .map(([k, v]) => ({ prefix: k, label: getLabel(k, REVENUE_LABELS), amount: v }))
      .filter(r => r.amount !== 0)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  }, [data])

  const expenseBreakdown = useMemo(() => {
    if (!data?.expensesByAccount) return []
    return Object.entries(data.expensesByAccount as Record<string, number>)
      .map(([k, v]) => ({ prefix: k, label: getLabel(k, EXPENSE_LABELS), amount: v }))
      .filter(r => r.amount !== 0)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
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
        <h1 className="text-xl font-bold" style={{ color: NAVY }}>Acces non autorise</h1>
        <p className="text-sm text-muted-foreground">Vous n&apos;avez pas la permission d&apos;acceder a cette page.</p>
        <Link href="/client/upload" className="text-sm underline" style={{ color: GOLD }}>Retour</Link>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Mes Chiffres</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vue d&apos;ensemble de votre situation financiere
          </p>
        </div>
        {societes.length > 1 && (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedSociete} onValueChange={setSelectedSociete}>
              <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les societes</SelectItem>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Chiffre d&apos;affaires</CardTitle>
            <TrendingUp className="h-5 w-5" style={{ color: "#22C55E" }} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" style={{ color: NAVY }}>{fmt(ca)}</p>
            {data?.monthlyRevenue ? (
              <p className="text-xs text-muted-foreground mt-1">Mois en cours: {fmt(data.monthlyRevenue)}</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Depenses</CardTitle>
            <TrendingDown className="h-5 w-5" style={{ color: "#EF4444" }} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" style={{ color: "#EF4444" }}>{fmt(depenses)}</p>
            {data?.monthlyExpenses ? (
              <p className="text-xs text-muted-foreground mt-1">Mois en cours: {fmt(data.monthlyExpenses)}</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Benefice</CardTitle>
            <DollarSign className="h-5 w-5" style={{ color: GOLD }} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" style={{ color: resultat >= 0 ? "#22C55E" : "#EF4444" }}>
              {fmt(resultat)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">CA - Depenses</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tresorerie</CardTitle>
            <Landmark className="h-5 w-5" style={{ color: NAVY }} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" style={{ color: NAVY }}>{fmt(tresorerie)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {(data?.bankAccounts || []).length} compte(s) bancaire(s)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* BFR + Marge row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={bfr >= 0 ? "border-green-200" : "border-red-200"}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">BFR</CardTitle>
            <Wallet className="h-5 w-5" style={{ color: bfr >= 0 ? "#16A34A" : "#EF4444" }} />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${bfr >= 0 ? "text-green-600" : "text-red-600"}`}>
              {fmt(bfr)}
            </p>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span>DSO: {dso.toFixed(0)}j</span>
              <span>DPO: {dpo.toFixed(0)}j</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Marge nette</CardTitle>
            <Percent className="h-5 w-5" style={{ color: GOLD }} />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${margeNette >= 0 ? "text-green-600" : "text-red-600"}`}>
              {margeNette.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">(Benefice / CA) x 100</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Exercice</CardTitle>
            <Calendar className="h-5 w-5" style={{ color: NAVY }} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" style={{ color: NAVY }}>{data?.exercice_actuel || "-"}</p>
            <p className="text-xs text-muted-foreground mt-1">Exercice fiscal en cours</p>
          </CardContent>
        </Card>
      </div>

      {/* P&L Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Revenue breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" style={{ color: "#22C55E" }} />
              <CardTitle style={{ color: NAVY }}>Revenus</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {revenueBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucune donnee de revenus</p>
            ) : (
              <div className="space-y-3">
                {revenueBreakdown.map(r => {
                  const pct = ca > 0 ? (Math.abs(r.amount) / ca) * 100 : 0
                  return (
                    <div key={r.prefix}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">{r.label} ({r.prefix})</span>
                        <span className="font-medium" style={{ color: NAVY }}>{fmt(Math.abs(r.amount))}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full bg-green-500" style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  )
                })}
                <div className="flex items-center justify-between pt-2 border-t font-bold text-sm">
                  <span>Total revenus</span>
                  <span style={{ color: NAVY }}>{fmt(ca)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expense breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5" style={{ color: "#EF4444" }} />
              <CardTitle style={{ color: NAVY }}>Depenses</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {expenseBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucune donnee de depenses</p>
            ) : (
              <div className="space-y-3">
                {expenseBreakdown.map(r => {
                  const pct = depenses > 0 ? (Math.abs(r.amount) / depenses) * 100 : 0
                  return (
                    <div key={r.prefix}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">{r.label} ({r.prefix})</span>
                        <span className="font-medium text-red-600">{fmt(Math.abs(r.amount))}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full bg-red-400" style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  )
                })}
                <div className="flex items-center justify-between pt-2 border-t font-bold text-sm">
                  <span>Total depenses</span>
                  <span className="text-red-600">{fmt(depenses)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm" style={{ color: NAVY }}>Acces rapide</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {QUICK_LINKS.map(link => {
              const Icon = link.icon
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
                >
                  <Icon className="h-4 w-4 text-muted-foreground group-hover:text-[#D4AF37]" />
                  <span className="text-sm font-medium" style={{ color: NAVY }}>{link.label}</span>
                  <ArrowRight className="h-3 w-3 ml-auto text-muted-foreground" />
                </Link>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
