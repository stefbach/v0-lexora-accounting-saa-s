"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Clock,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ForecastPeriod {
  label: string
  solde_prevu: number
  statut: "critique" | "attention" | "sain" | "excellent"
  entrees: number
  sorties: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMUR(n: number) {
  return n.toLocaleString("fr-FR") + " MUR"
}

function getStatusColor(statut: string) {
  switch (statut) {
    case "critique":
      return { bg: "bg-red-50", border: "border-red-200", text: "#EF4444", badge: "bg-red-100 text-red-700" }
    case "attention":
      return { bg: "bg-orange-50", border: "border-orange-200", text: "#F97316", badge: "bg-orange-100 text-orange-700" }
    case "sain":
      return { bg: "bg-green-50", border: "border-green-200", text: "#16A34A", badge: "bg-green-100 text-green-700" }
    case "excellent":
      return { bg: "bg-blue-50", border: "border-blue-200", text: "#2563EB", badge: "bg-blue-100 text-blue-700" }
    default:
      return { bg: "bg-gray-50", border: "border-gray-200", text: "#6B7280", badge: "bg-gray-100 text-gray-700" }
  }
}

function getStatusLabel(statut: string) {
  switch (statut) {
    case "critique":
      return "Critique"
    case "attention":
      return "Attention"
    case "sain":
      return "Sain"
    case "excellent":
      return "Excellent"
    default:
      return statut
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PrevisionnelPage() {
  const { profile, loading } = useProfile()
  const [forecasts, setForecasts] = useState<ForecastPeriod[]>([])
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState(false)

  async function fetchPrevisionnel() {
    setFetching(true)
    setError(false)
    try {
      const res = await fetch("/api/client/previsionnel")
      if (res.ok) {
        const data = await res.json()
        // Support { previsions: [...] } or { forecasts: [...] } or direct array
        const items = data.previsions || data.forecasts || data.periodes || []
        if (Array.isArray(items) && items.length > 0) {
          setForecasts(
            items.map((p: any) => ({
              label: p.label || p.periode || "",
              solde_prevu: p.solde_prevu ?? p.solde ?? 0,
              statut: p.statut || "sain",
              entrees: p.entrees ?? p.encaissements ?? 0,
              sorties: p.sorties ?? p.decaissements ?? 0,
            }))
          )
        }
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setFetching(false)
    }
  }

  useEffect(() => {
    fetchPrevisionnel()
  }, [])

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
          Acces non autorise
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;acceder a cette page.
        </p>
        <Link href="/client/documents" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour aux documents
        </Link>
      </div>
    )
  }

  if (fetching) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Mon Previsionnel
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Anticipez l&apos;evolution de votre tresorerie
          </p>
        </div>
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Mon Previsionnel
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Anticipez l&apos;evolution de votre tresorerie
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchPrevisionnel}
          disabled={fetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${fetching ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {/* Forecast cards */}
      {forecasts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {forecasts.map((forecast) => {
            const colors = getStatusColor(forecast.statut)
            return (
              <Card key={forecast.label} className={`${colors.bg} ${colors.border}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {forecast.label}
                    </CardTitle>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}
                    >
                      {getStatusLabel(forecast.statut)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-2xl font-bold" style={{ color: colors.text }}>
                    {formatMUR(forecast.solde_prevu)}
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1 text-green-600">
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        Entrees
                      </span>
                      <span className="font-medium text-green-600">
                        {formatMUR(forecast.entrees)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1 text-red-500">
                        <ArrowDownRight className="h-3.5 w-3.5" />
                        Sorties
                      </span>
                      <span className="font-medium text-red-500">
                        {formatMUR(forecast.sorties)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {["Aujourd\u2019hui", "J+30", "J+60", "J+90"].map((label) => (
            <Card key={label}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {label}
                  </CardTitle>
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Pas encore de prevision
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Note */}
      <Card className="bg-slate-50">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 shrink-0" style={{ color: "#C9A84C" }} />
            <p className="text-sm text-muted-foreground">
              {forecasts.length > 0
                ? "Les previsions sont basees sur vos donnees comptables actuelles et les tendances recentes."
                : "Les previsions apparaitront ici une fois vos donnees comptables traitees par votre comptable."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Footer badge */}
      <div className="flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Genere automatiquement chaque mois
        </p>
      </div>
    </div>
  )
}
