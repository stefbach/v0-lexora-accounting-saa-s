"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Users, FileText, Calculator, AlertTriangle, Clock, Eye,
  CheckCircle, XCircle, Loader2, Calendar,
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
}

const niveauConfig: Record<string, { label: string; className: string; dot: string }> = {
  critique: { label: "Critique", className: "bg-red-100 text-red-800 border-red-200", dot: "bg-red-500" },
  important: { label: "Important", className: "bg-orange-100 text-orange-800 border-orange-200", dot: "bg-orange-500" },
  informatif: { label: "Info", className: "bg-blue-100 text-blue-800 border-blue-200", dot: "bg-blue-500" },
}

export default function ComptableDashboardPage() {
  const { profile } = useProfile()
  const [clientCount, setClientCount] = useState(0)
  const [dossierCount, setDossierCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const firstName = profile?.full_name?.split(" ")[0] || ""
  const isDedie = profile?.role === "comptable_dedie"

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/comptable/clients")
      const data = await res.json()
      if (data.clients) setClientCount(data.clients.length)
      if (data.dossiers) setDossierCount(data.dossiers.length)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Bienvenue{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isDedie ? "Vue d'ensemble de vos clients assignés" : "Vue d'ensemble de votre portefeuille"}
        </p>
      </div>

      {/* Section A — KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Clients actifs</p>
                <p className="text-3xl font-bold mt-1" style={{ color: "#1E2A4A" }}>
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : clientCount}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg" style={{ backgroundColor: "#C9A84C20" }}>
                <Users className="h-6 w-6" style={{ color: "#C9A84C" }} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Dossiers actifs</p>
                <p className="text-3xl font-bold mt-1" style={{ color: "#1E2A4A" }}>
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : dossierCount}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg" style={{ backgroundColor: "#C9A84C20" }}>
                <FileText className="h-6 w-6" style={{ color: "#C9A84C" }} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Obligations fiscales ce mois</p>
                <p className="text-3xl font-bold mt-1" style={{ color: "#1E2A4A" }}>0</p>
                <p className="text-xs text-muted-foreground mt-1">Aucune obligation enregistrée</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg" style={{ backgroundColor: "#C9A84C20" }}>
                <Calculator className="h-6 w-6" style={{ color: "#C9A84C" }} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Alertes critiques</p>
                <p className="text-3xl font-bold mt-1" style={{ color: "#1E2A4A" }}>0</p>
                <p className="text-xs text-muted-foreground mt-1">Aucune alerte</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-50">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section B — Alertes Fiscales & Comptables */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
            <AlertTriangle className="h-5 w-5" />
            Alertes fiscales et comptables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Aucune alerte pour le moment.</p>
            <p className="text-xs text-muted-foreground mt-1">Les alertes fiscales et comptables apparaitront ici automatiquement.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section D — Obligations du mois */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
              <Calendar className="h-5 w-5" />
              Obligations du mois
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">Aucune obligation enregistrée ce mois-ci.</p>
              <p className="text-xs text-muted-foreground mt-1">Les obligations fiscales apparaitront ici une fois configurées.</p>
            </div>
          </CardContent>
        </Card>

        {/* Section E — Activité récente */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
              <Clock className="h-5 w-5" />
              Activité récente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">Aucune activité récente.</p>
              <p className="text-xs text-muted-foreground mt-1">{"L'historique des actions apparaitra ici."}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
