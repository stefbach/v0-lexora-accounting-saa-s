"use client"

import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Banknote,
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  Clock,
  Lightbulb,
  ShieldCheck,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMUR(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} MUR`
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const bankBreakdown = [
  { label: "MCB", montant: 150_000 },
  { label: "SBM", montant: 65_000 },
  { label: "CIC (EUR)", montant: 558_000 },
]

const kpiCards = [
  {
    title: "Votre trésorerie",
    value: 773_000,
    badge: { label: "Sain", color: "green" },
    icon: Banknote,
    banks: bankBreakdown,
  },
  {
    title: "Vos revenus ce mois",
    value: 995_000,
    badge: { label: "+12%", color: "green" },
    icon: TrendingUp,
  },
  {
    title: "Vos dépenses ce mois",
    value: 208_000,
    badge: null,
    icon: TrendingDown,
  },
  {
    title: "Votre bénéfice",
    value: 787_000,
    badge: { label: "Positif", color: "green" },
    icon: Wallet,
  },
]

const insights = [
  "Vos clients vous paient en moyenne en 42 jours",
  "À ce rythme, votre trésorerie couvre 5.7 mois de charges",
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TableauDeBordPage() {
  const { profile } = useProfile()

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "#1E2A4A" }}>
          Accès non autorisé
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;accéder à cette page.
        </p>
        <Link href="/client/documents" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour aux documents
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Mon Tableau de Bord
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vue d&apos;ensemble de la santé financière de votre entreprise
        </p>
      </div>

      {/* Score card */}
      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="py-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: "#1E2A4A" }}
              >
                A
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: "#1E2A4A" }}>
                  Score global : A
                </p>
                <p className="text-sm text-muted-foreground">
                  Votre entreprise est en bonne santé financière
                </p>
              </div>
            </div>
            <Badge className="bg-green-100 text-green-700 border-green-200 sm:ml-auto">
              <ShieldCheck className="h-3 w-3 mr-1" />
              Bonne santé
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* 4 KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon
          return (
            <Card key={kpi.title}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {kpi.title}
                  </CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold" style={{ color: "#1E2A4A" }}>
                    {fmtMUR(kpi.value)}
                  </span>
                  {kpi.badge && (
                    <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                      {kpi.badge.label}
                    </Badge>
                  )}
                </div>
                {kpi.banks && (
                  <div className="space-y-0.5 pt-1">
                    {kpi.banks.map((b) => (
                      <div key={b.label} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{b.label}</span>
                        <span>{fmtMUR(b.montant)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Ce qu'il faut retenir */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base" style={{ color: "#1E2A4A" }}>
            <Lightbulb className="h-5 w-5" style={{ color: "#C9A84C" }} />
            Ce qu&apos;il faut retenir
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {insights.map((insight, idx) => (
            <div key={idx} className="flex items-start gap-3">
              <ArrowUpRight className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "#C9A84C" }} />
              <p className="text-sm">{insight}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Footer badge */}
      <div className="flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Mis à jour chaque lundi par Lexora
        </p>
      </div>
    </div>
  )
}
