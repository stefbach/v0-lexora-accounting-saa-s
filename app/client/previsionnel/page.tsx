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
  CalendarDays,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Banknote,
  ArrowDown,
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

const upcomingExpenses = [
  { label: "Salaires", montant: 420_000 },
  { label: "TVA", montant: 130_000 },
  { label: "Cotisations", montant: 81_000 },
]

interface Forecast {
  label: string
  montant: number
  badge: { label: string; color: "green" | "orange" }
  expenses?: { label: string; montant: number }[]
}

const forecasts: Forecast[] = [
  {
    label: "Aujourd\u2019hui",
    montant: 773_000,
    badge: { label: "Sain", color: "green" },
  },
  {
    label: "Dans 30 jours",
    montant: 726_000,
    badge: { label: "Attention", color: "orange" },
    expenses: upcomingExpenses,
  },
  {
    label: "Dans 60 jours",
    montant: 870_000,
    badge: { label: "Sain", color: "green" },
  },
  {
    label: "Dans 90 jours",
    montant: 1_050_000,
    badge: { label: "Sain", color: "green" },
  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PrevisionnelPage() {
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
          Mon Prévisionnel
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Anticipez l&apos;évolution de votre trésorerie
        </p>
      </div>

      {/* Forecast cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {forecasts.map((fc) => {
          const isOrange = fc.badge.color === "orange"
          const BadgeIcon = isOrange ? AlertTriangle : CheckCircle2
          return (
            <Card
              key={fc.label}
              className={isOrange ? "border-orange-200" : ""}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {fc.label}
                  </CardTitle>
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold" style={{ color: "#1E2A4A" }}>
                    {fmtMUR(fc.montant)}
                  </span>
                </div>
                <Badge
                  className={
                    isOrange
                      ? "bg-orange-100 text-orange-700 border-orange-200"
                      : "bg-green-100 text-green-700 border-green-200"
                  }
                >
                  <BadgeIcon className="h-3 w-3 mr-1" />
                  {fc.badge.label}
                </Badge>
                {fc.expenses && (
                  <div className="space-y-1 pt-2 border-t">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Dépenses à venir
                    </p>
                    {fc.expenses.map((exp) => (
                      <div key={exp.label} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <ArrowDown className="h-3 w-3 text-orange-500" />
                          <span>{exp.label}</span>
                        </div>
                        <span className="font-medium" style={{ color: "#1E2A4A" }}>
                          {fmtMUR(exp.montant)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Note */}
      <Card className="bg-slate-50">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 shrink-0" style={{ color: "#C9A84C" }} />
            <p className="text-sm text-muted-foreground">
              Prévisions basées sur vos habitudes des 3 derniers mois
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Footer badge */}
      <div className="flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Généré automatiquement chaque mois
        </p>
      </div>
    </div>
  )
}
