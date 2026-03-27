"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Search, FileText } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

export default function ComptableSalairesPage() {
  const [search, setSearch] = useState("")
  const { profile } = useProfile()

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Salaires
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestion des fiches de paie et charges salariales
          {profile?.role === "comptable_dedie" && " — Dossiers assignés"}
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher employé, société, période..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#1E2A4A" }}>
            Fiches de paie (0)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-sm font-medium text-muted-foreground">Aucune donnée disponible</p>
            <p className="text-xs text-muted-foreground mt-2 max-w-md">
              Les fiches de paie apparaitront ici une fois les documents traités.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
