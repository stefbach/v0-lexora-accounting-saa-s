"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Search, Landmark, AlertCircle, Clock } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

function formatMUR(amount: number) {
  return amount.toLocaleString("fr-FR") + " MUR"
}

export default function ComptableBanquePage() {
  const [search, setSearch] = useState("")
  const { profile } = useProfile()

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Rapprochement Bancaire
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suivi et rapprochement des opérations bancaires
          {profile?.role === "comptable_dedie" && " — Dossiers assignés"}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Solde total
            </CardTitle>
            <div className="rounded-lg p-2 bg-blue-50">
              <Landmark className="h-5 w-5" style={{ color: "#1E2A4A" }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
              {formatMUR(0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Opérations non rapprochées
            </CardTitle>
            <div className="rounded-lg p-2 bg-red-50">
              <AlertCircle className="h-5 w-5" style={{ color: "#DC2626" }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
              0
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Dernière MAJ
            </CardTitle>
            <div className="rounded-lg p-2 bg-amber-50">
              <Clock className="h-5 w-5" style={{ color: "#C9A84C" }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
              —
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher par libellé, société, tiers..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#1E2A4A" }}>
            Opérations bancaires (0)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Landmark className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-sm font-medium text-muted-foreground">Aucune donnée disponible</p>
            <p className="text-xs text-muted-foreground mt-2 max-w-md">
              Les opérations bancaires apparaitront ici une fois les relevés importés et rapprochés.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
