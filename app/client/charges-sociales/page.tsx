"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Search, Shield, GraduationCap, PiggyBank, Receipt } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

function formatMUR(amount: number) {
  return amount.toLocaleString("fr-FR") + " MUR"
}

const chargesData: {
  id: string
  societe: string
  periode: string
  csgPatronal: number
  csgSalarie: number
  trainingLevy: number
  nsf: number
  paye: number
  total: number
  echeance: string
  statut: "Conforme" | "Écart détecté"
}[] = []

function getStatutBadge(statut: string) {
  switch (statut) {
    case "Conforme":
      return <Badge className="bg-green-100 text-green-700 border-green-200">Conforme</Badge>
    case "Écart détecté":
      return <Badge className="bg-red-100 text-red-700 border-red-200">Écart détecté</Badge>
    default:
      return <Badge variant="secondary">{statut}</Badge>
  }
}

export default function ClientChargesSocialesPage() {
  const [search, setSearch] = useState("")
  const { profile } = useProfile()

  if (profile?.role === "client_user") {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Vous n&apos;avez pas acc&egrave;s &agrave; cette section.</p>
            <Link href="/client" className="text-sm underline mt-4 inline-block" style={{ color: "#C9A84C" }}>
              Retour au tableau de bord
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const filtered = chargesData.filter(
    (row) =>
      row.societe.toLowerCase().includes(search.toLowerCase()) ||
      row.periode.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Charges Sociales
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suivi des cotisations CSG, Training Levy, NSF et PAYE
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">CSG total</CardTitle>
            <div className="rounded-lg p-2 bg-blue-50">
              <Shield className="h-5 w-5" style={{ color: "#1E2A4A" }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
              {formatMUR(chargesData.reduce((sum, r) => sum + r.csgPatronal + r.csgSalarie, 0))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Training Levy total</CardTitle>
            <div className="rounded-lg p-2 bg-amber-50">
              <GraduationCap className="h-5 w-5" style={{ color: "#C9A84C" }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
              {formatMUR(chargesData.reduce((sum, r) => sum + r.trainingLevy, 0))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">NSF total</CardTitle>
            <div className="rounded-lg p-2 bg-blue-50">
              <PiggyBank className="h-5 w-5" style={{ color: "#1E2A4A" }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
              {formatMUR(chargesData.reduce((sum, r) => sum + r.nsf, 0))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">PAYE total</CardTitle>
            <div className="rounded-lg p-2 bg-red-50">
              <Receipt className="h-5 w-5" style={{ color: "#DC2626" }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
              {formatMUR(chargesData.reduce((sum, r) => sum + r.paye, 0))}
            </div>
          </CardContent>
        </Card>
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
            Détail des charges sociales ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Société</TableHead>
                <TableHead>Période</TableHead>
                <TableHead className="text-right">CSG Patronal</TableHead>
                <TableHead className="text-right">CSG Salarié</TableHead>
                <TableHead className="text-right">Training Levy</TableHead>
                <TableHead className="text-right">NSF</TableHead>
                <TableHead className="text-right">PAYE</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Échéance</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Badge variant="outline" style={{ borderColor: "#1E2A4A", color: "#1E2A4A" }}>
                      {row.societe}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{row.periode}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.csgPatronal)}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.csgSalarie)}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.trainingLevy)}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.nsf)}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.paye)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatMUR(row.total)}</TableCell>
                  <TableCell>{row.echeance}</TableCell>
                  <TableCell>{getStatutBadge(row.statut)}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    {search
                      ? "Aucune charge sociale trouvée pour cette recherche."
                      : "Aucune charge sociale disponible. Les données apparaîtront ici une fois les charges traitées."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
