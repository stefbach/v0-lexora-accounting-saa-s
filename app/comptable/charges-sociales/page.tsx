"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Search, Shield, FileText } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

export default function ComptableChargesSocialesPage() {
  const [search, setSearch] = useState("")
  const { profile } = useProfile()

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Charges Sociales
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suivi des cotisations NPF, HRDC, NPS et PAYE
          {profile?.role === "comptable_dedie" && " — Dossiers assignés"}
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher société, période..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#1E2A4A" }}>
            Détail des charges sociales
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Société</TableHead>
                <TableHead>Période</TableHead>
                <TableHead className="text-right">NPF Patronal</TableHead>
                <TableHead className="text-right">NPF Salarié</TableHead>
                <TableHead className="text-right">HRDC</TableHead>
                <TableHead className="text-right">NPS</TableHead>
                <TableHead className="text-right">PAYE</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Échéance</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <Shield className="h-10 w-10 text-muted-foreground" />
                    <p className="text-muted-foreground">Les charges sociales apparaîtront ici une fois les documents traités.</p>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
