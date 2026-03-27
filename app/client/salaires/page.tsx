"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Search } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

function formatMUR(amount: number) {
  return amount.toLocaleString("fr-FR") + " MUR"
}

const payrollData: {
  id: string
  employe: string
  societe: string
  periode: string
  brut: number
  npfSalarie: number
  paye: number
  netAPayer: number
  coutEmployeur: number
  statut: "Payé" | "À payer"
}[] = []

function getStatutBadge(statut: string) {
  switch (statut) {
    case "Payé":
      return <Badge className="bg-green-100 text-green-700 border-green-200">Payé</Badge>
    case "À payer":
      return <Badge className="bg-orange-100 text-orange-700 border-orange-200">À payer</Badge>
    default:
      return <Badge variant="secondary">{statut}</Badge>
  }
}

export default function ClientSalairesPage() {
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

  const filtered = payrollData.filter(
    (row) =>
      row.employe.toLowerCase().includes(search.toLowerCase()) ||
      row.societe.toLowerCase().includes(search.toLowerCase()) ||
      row.periode.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Salaires
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestion des fiches de paie et charges salariales
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
            Fiches de paie ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employé</TableHead>
                <TableHead>Société</TableHead>
                <TableHead>Période</TableHead>
                <TableHead className="text-right">Brut</TableHead>
                <TableHead className="text-right">NPF Salarié</TableHead>
                <TableHead className="text-right">PAYE</TableHead>
                <TableHead className="text-right">Net à payer</TableHead>
                <TableHead className="text-right">Coût employeur</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.employe}</TableCell>
                  <TableCell>
                    <Badge variant="outline" style={{ borderColor: "#1E2A4A", color: "#1E2A4A" }}>
                      {row.societe}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.periode}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.brut)}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.npfSalarie)}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.paye)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatMUR(row.netAPayer)}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.coutEmployeur)}</TableCell>
                  <TableCell>{getStatutBadge(row.statut)}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    {search
                      ? "Aucune fiche de paie trouvée pour cette recherche."
                      : "Aucune fiche de paie disponible. Les données apparaîtront ici une fois les salaires traités."}
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
