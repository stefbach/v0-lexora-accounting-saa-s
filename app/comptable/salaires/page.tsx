"use client"

import { useState } from "react"
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

const mockData = [
  {
    id: "1",
    employe: "Raj Doobur",
    societe: "TIBOK",
    periode: "Mars 2026",
    brut: 85000,
    npfSalarie: 2550,
    paye: 8500,
    netAPayer: 73950,
    coutEmployeur: 92650,
    statut: "Payé" as const,
  },
  {
    id: "2",
    employe: "Nisha Doobur",
    societe: "TIBOK",
    periode: "Mars 2026",
    brut: 72000,
    npfSalarie: 2160,
    paye: 6200,
    netAPayer: 63640,
    coutEmployeur: 78480,
    statut: "Payé" as const,
  },
  {
    id: "3",
    employe: "Anand Doorgakant",
    societe: "BPO Services",
    periode: "Mars 2026",
    brut: 55000,
    npfSalarie: 1650,
    paye: 3750,
    netAPayer: 49600,
    coutEmployeur: 60050,
    statut: "À payer" as const,
  },
  {
    id: "4",
    employe: "Marie Cupidon",
    societe: "BPO Services",
    periode: "Mars 2026",
    brut: 48000,
    npfSalarie: 1440,
    paye: 2800,
    netAPayer: 43760,
    coutEmployeur: 52560,
    statut: "À payer" as const,
  },
  {
    id: "5",
    employe: "Dev Doobur",
    societe: "TIBOK",
    periode: "Février 2026",
    brut: 85000,
    npfSalarie: 2550,
    paye: 8500,
    netAPayer: 73950,
    coutEmployeur: 92650,
    statut: "Payé" as const,
  },
  {
    id: "6",
    employe: "Sophie Ramdin",
    societe: "BPO Services",
    periode: "Février 2026",
    brut: 62000,
    npfSalarie: 1860,
    paye: 4900,
    netAPayer: 55240,
    coutEmployeur: 67780,
    statut: "Payé" as const,
  },
  {
    id: "7",
    employe: "Vikash Doobur",
    societe: "TIBOK",
    periode: "Février 2026",
    brut: 95000,
    npfSalarie: 2850,
    paye: 10500,
    netAPayer: 81650,
    coutEmployeur: 103550,
    statut: "Payé" as const,
  },
  {
    id: "8",
    employe: "Priya Doobur",
    societe: "BPO Services",
    periode: "Mars 2026",
    brut: 42000,
    npfSalarie: 1260,
    paye: 2100,
    netAPayer: 38640,
    coutEmployeur: 46140,
    statut: "À payer" as const,
  },
]

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

export default function ComptableSalairesPage() {
  const [search, setSearch] = useState("")
  const { profile } = useProfile()

  const filtered = mockData.filter(
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
                    Aucune fiche de paie trouvée.
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
