"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TrendingUp, TrendingDown, Calculator, AlertTriangle } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"
import Link from "next/link"

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
    color: "#DC2626",
    bg: "bg-red-50",
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

const tvaData = [
  {
    id: "1",
    mois: "Mars 2026",
    societe: "TIBOK",
    collectee: 120000,
    deductible: 75000,
    nette: 45000,
    statut: "a_payer" as const,
    deadline: "20 avril 2026",
    declaration: "a_faire" as const,
    dateDeclaration: null,
    penalite: 0,
  },
  {
    id: "2",
    mois: "Mars 2026",
    societe: "BPO",
    collectee: 85000,
    deductible: 92000,
    nette: -7000,
    statut: "credit" as const,
    deadline: "20 avril 2026",
    declaration: "a_faire" as const,
    dateDeclaration: null,
    penalite: 0,
  },
  {
    id: "3",
    mois: "Février 2026",
    societe: "TIBOK",
    collectee: 135000,
    deductible: 98000,
    nette: 37000,
    statut: "a_payer" as const,
    deadline: "20 mars 2026",
    declaration: "declare" as const,
    dateDeclaration: "18 mars 2026",
    penalite: 0,
  },
  {
    id: "4",
    mois: "Février 2026",
    societe: "BPO",
    collectee: 78000,
    deductible: 65000,
    nette: 13000,
    statut: "a_payer" as const,
    deadline: "20 mars 2026",
    declaration: "declare" as const,
    dateDeclaration: "19 mars 2026",
    penalite: 0,
  },
  {
    id: "5",
    mois: "Janvier 2026",
    societe: "TIBOK",
    collectee: 142000,
    deductible: 110000,
    nette: 32000,
    statut: "a_payer" as const,
    deadline: "20 février 2026",
    declaration: "declare" as const,
    dateDeclaration: "15 février 2026",
    penalite: 0,
  },
  {
    id: "6",
    mois: "Janvier 2026",
    societe: "BPO",
    collectee: 68000,
    deductible: 68000,
    nette: 0,
    statut: "neant" as const,
    deadline: "20 février 2026",
    declaration: "declare" as const,
    dateDeclaration: "18 février 2026",
    penalite: 0,
  },
  {
    id: "7",
    mois: "Décembre 2025",
    societe: "TIBOK",
    collectee: 155000,
    deductible: 120000,
    nette: 35000,
    statut: "a_payer" as const,
    deadline: "20 janvier 2026",
    declaration: "declare" as const,
    dateDeclaration: "19 janvier 2026",
    penalite: 0,
  },
  {
    id: "8",
    mois: "Décembre 2025",
    societe: "BPO",
    collectee: 62000,
    deductible: 54000,
    nette: 8000,
    statut: "a_payer" as const,
    deadline: "20 janvier 2026",
    declaration: "en_retard" as const,
    dateDeclaration: null,
    penalite: 2500,
  },
  {
    id: "9",
    mois: "Novembre 2025",
    societe: "TIBOK",
    collectee: 128000,
    deductible: 95000,
    nette: 33000,
    statut: "a_payer" as const,
    deadline: "20 décembre 2025",
    declaration: "declare" as const,
    dateDeclaration: "17 décembre 2025",
    penalite: 0,
  },
  {
    id: "10",
    mois: "Novembre 2025",
    societe: "BPO",
    collectee: 72000,
    deductible: 80000,
    nette: -8000,
    statut: "credit" as const,
    deadline: "20 décembre 2025",
    declaration: "declare" as const,
    dateDeclaration: "16 décembre 2025",
    penalite: 0,
  },
  {
    id: "11",
    mois: "Octobre 2025",
    societe: "TIBOK",
    collectee: 118000,
    deductible: 88000,
    nette: 30000,
    statut: "a_payer" as const,
    deadline: "20 novembre 2025",
    declaration: "declare" as const,
    dateDeclaration: "18 novembre 2025",
    penalite: 0,
  },
  {
    id: "12",
    mois: "Octobre 2025",
    societe: "BPO",
    collectee: 65000,
    deductible: 60000,
    nette: 5000,
    statut: "a_payer" as const,
    deadline: "20 novembre 2025",
    declaration: "declare" as const,
    dateDeclaration: "14 novembre 2025",
    penalite: 0,
  },
]

function getStatutBadge(statut: string) {
  switch (statut) {
    case "a_payer":
      return <Badge className="bg-red-100 text-red-700 border-red-200">À PAYER</Badge>
    case "credit":
      return <Badge className="bg-green-100 text-green-700 border-green-200">CRÉDIT</Badge>
    case "neant":
      return <Badge className="bg-gray-100 text-gray-600 border-gray-200">NÉANT</Badge>
    default:
      return <Badge variant="secondary">{statut}</Badge>
  }
}

function getDeclarationBadge(
  declaration: string,
  dateDeclaration: string | null,
  penalite: number
) {
  switch (declaration) {
    case "a_faire":
      return (
        <Badge className="bg-orange-100 text-orange-700 border-orange-200">À faire</Badge>
      )
    case "declare":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200">
          Déclaré {dateDeclaration ? `- ${dateDeclaration}` : ""}
        </Badge>
      )
    case "en_retard":
      return (
        <div className="flex flex-col gap-1">
          <Badge className="bg-red-100 text-red-700 border-red-200">En retard</Badge>
          {penalite > 0 && (
            <span className="text-xs text-red-600">
              Pénalité: {formatMUR(penalite)}
            </span>
          )}
        </div>
      )
    default:
      return <Badge variant="secondary">{declaration}</Badge>
  }
}

export default function TVAPage() {
  const { profile } = useProfile()

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "#1E2A4A" }}>
          Vous n&apos;avez pas acc&egrave;s &agrave; cette section
        </h1>
        <Link href="/client" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour au tableau de bord
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          TVA & Fiscal
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suivi de vos déclarations TVA et obligations fiscales auprès de la MRA.
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

      {/* Monthly TVA Table */}
      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#1E2A4A" }}>Déclarations TVA mensuelles</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mois</TableHead>
                <TableHead>Société</TableHead>
                <TableHead className="text-right">TVA Collectée</TableHead>
                <TableHead className="text-right">TVA Déductible</TableHead>
                <TableHead className="text-right">TVA Nette</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Déclaration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tvaData.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.mois}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="font-mono"
                      style={{
                        borderColor: "#1E2A4A",
                        color: "#1E2A4A",
                      }}
                    >
                      {row.societe}
                    </Badge>
                  </TableCell>
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
                  <TableCell>{getStatutBadge(row.statut)}</TableCell>
                  <TableCell className="text-sm">{row.deadline}</TableCell>
                  <TableCell>
                    {getDeclarationBadge(
                      row.declaration,
                      row.dateDeclaration,
                      row.penalite
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
