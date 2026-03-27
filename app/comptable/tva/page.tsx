"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Search, TrendingUp, TrendingDown, Calculator, AlertTriangle } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

function formatMUR(amount: number) {
  return amount.toLocaleString("fr-FR") + " MUR"
}

const summaryCards = [
  {
    title: "TVA Collectée totale",
    value: 845000,
    icon: TrendingUp,
    color: "#1E2A4A",
    bg: "bg-blue-50",
  },
  {
    title: "TVA Déductible totale",
    value: 612000,
    icon: TrendingDown,
    color: "#C9A84C",
    bg: "bg-amber-50",
  },
  {
    title: "TVA Nette",
    value: 233000,
    icon: Calculator,
    color: "#1E2A4A",
    bg: "bg-blue-50",
  },
  {
    title: "Déclarations en retard",
    value: 1,
    isCount: true,
    icon: AlertTriangle,
    color: "#DC2626",
    bg: "bg-red-50",
  },
]

const mockData = [
  {
    id: "1",
    societe: "TIBOK",
    mois: "Mars 2026",
    collectee: 120000,
    deductible: 75000,
    nette: 45000,
    deadline: "20/04/2026",
    statut: "À déclarer" as const,
    refMRA: "",
  },
  {
    id: "2",
    societe: "BPO Services",
    mois: "Mars 2026",
    collectee: 85000,
    deductible: 92000,
    nette: -7000,
    deadline: "20/04/2026",
    statut: "À déclarer" as const,
    refMRA: "",
  },
  {
    id: "3",
    societe: "TIBOK",
    mois: "Février 2026",
    collectee: 135000,
    deductible: 98000,
    nette: 37000,
    deadline: "20/03/2026",
    statut: "Déclaré" as const,
    refMRA: "MRA-2026-02-4521",
  },
  {
    id: "4",
    societe: "BPO Services",
    mois: "Février 2026",
    collectee: 78000,
    deductible: 65000,
    nette: 13000,
    deadline: "20/03/2026",
    statut: "Déclaré" as const,
    refMRA: "MRA-2026-02-4522",
  },
  {
    id: "5",
    societe: "TIBOK",
    mois: "Janvier 2026",
    collectee: 142000,
    deductible: 110000,
    nette: 32000,
    deadline: "20/02/2026",
    statut: "Déclaré" as const,
    refMRA: "MRA-2026-01-3998",
  },
  {
    id: "6",
    societe: "BPO Services",
    mois: "Janvier 2026",
    collectee: 68000,
    deductible: 68000,
    nette: 0,
    deadline: "20/02/2026",
    statut: "Déclaré" as const,
    refMRA: "MRA-2026-01-3999",
  },
  {
    id: "7",
    societe: "TIBOK",
    mois: "Décembre 2025",
    collectee: 155000,
    deductible: 120000,
    nette: 35000,
    deadline: "20/01/2026",
    statut: "Déclaré" as const,
    refMRA: "MRA-2025-12-3780",
  },
  {
    id: "8",
    societe: "BPO Services",
    mois: "Décembre 2025",
    collectee: 62000,
    deductible: 54000,
    nette: 8000,
    deadline: "20/01/2026",
    statut: "En retard" as const,
    refMRA: "",
  },
]

function getStatutBadge(statut: string) {
  switch (statut) {
    case "Déclaré":
      return <Badge className="bg-green-100 text-green-700 border-green-200">Déclaré</Badge>
    case "À déclarer":
      return <Badge className="bg-orange-100 text-orange-700 border-orange-200">À déclarer</Badge>
    case "En retard":
      return <Badge className="bg-red-100 text-red-700 border-red-200">En retard</Badge>
    default:
      return <Badge variant="secondary">{statut}</Badge>
  }
}

export default function ComptableTVAPage() {
  const [search, setSearch] = useState("")
  const { profile } = useProfile()

  const filtered = mockData.filter(
    (row) =>
      row.societe.toLowerCase().includes(search.toLowerCase()) ||
      row.mois.toLowerCase().includes(search.toLowerCase()) ||
      row.refMRA.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          TVA — Déclarations MRA
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suivi des déclarations TVA et obligations fiscales auprès de la MRA
          {profile?.role === "comptable_dedie" && " — Dossiers assignés"}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={`rounded-lg p-2 ${card.bg}`}>
                <card.icon className="h-5 w-5" style={{ color: card.color }} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
                {"isCount" in card && card.isCount
                  ? card.value
                  : formatMUR(card.value as number)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher société, mois, référence MRA..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#1E2A4A" }}>
            Déclarations TVA ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Société</TableHead>
                <TableHead>Mois</TableHead>
                <TableHead className="text-right">TVA Collectée</TableHead>
                <TableHead className="text-right">TVA Déductible</TableHead>
                <TableHead className="text-right">TVA Nette</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Référence MRA</TableHead>
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
                  <TableCell className="font-medium">{row.mois}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.collectee)}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.deductible)}</TableCell>
                  <TableCell
                    className={`text-right font-semibold ${
                      row.nette > 0
                        ? "text-red-600"
                        : row.nette < 0
                        ? "text-green-600"
                        : "text-gray-500"
                    }`}
                  >
                    {row.nette < 0
                      ? `(${formatMUR(Math.abs(row.nette))})`
                      : formatMUR(row.nette)}
                  </TableCell>
                  <TableCell>{row.deadline}</TableCell>
                  <TableCell>{getStatutBadge(row.statut)}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {row.refMRA || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Aucune déclaration TVA trouvée.
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
