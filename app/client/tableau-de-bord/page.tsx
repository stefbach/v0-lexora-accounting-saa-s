"use client"

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
} from "lucide-react"

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TableauDeBordPage() {
  const { profile, loading } = useProfile()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "#1E2A4A" }}>
          Acc&egrave;s non autoris&eacute;
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;acc&eacute;der &agrave; cette page.
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
          Vue d&apos;ensemble de la sant&eacute; financi&egrave;re de votre entreprise
        </p>
      </div>

      {/* 4 KPI cards - empty state */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Votre tr\u00e9sorerie", icon: Banknote },
          { title: "Vos revenus ce mois", icon: TrendingUp },
          { title: "Vos d\u00e9penses ce mois", icon: TrendingDown },
          { title: "Votre b\u00e9n\u00e9fice", icon: Wallet },
        ].map((kpi) => {
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
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Pas encore de donn&eacute;es
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Ce qu'il faut retenir - empty state */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base" style={{ color: "#1E2A4A" }}>
            <Lightbulb className="h-5 w-5" style={{ color: "#C9A84C" }} />
            Ce qu&apos;il faut retenir
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              Aucun insight disponible pour le moment.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Les analyses appara&icirc;tront ici une fois vos donn&eacute;es comptables trait&eacute;es.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Footer badge */}
      <div className="flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Mis &agrave; jour chaque lundi par Lexora
        </p>
      </div>
    </div>
  )
}
