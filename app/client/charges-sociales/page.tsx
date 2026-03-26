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

const summaryCards = [
  {
    title: "NPF total",
    value: 182400,
    icon: Shield,
    color: "#1E2A4A",
    bg: "bg-blue-50",
  },
  {
    title: "HRDC total",
    value: 24800,
    icon: GraduationCap,
    color: "#C9A84C",
    bg: "bg-amber-50",
  },
  {
    title: "NPS total",
    value: 37200,
    icon: PiggyBank,
    color: "#1E2A4A",
    bg: "bg-blue-50",
  },
  {
    title: "PAYE total",
    value: 148500,
    icon: Receipt,
    color: "#DC2626",
    bg: "bg-red-50",
  },
]

const mockData = [
  {
    id: "1",
    societe: "TIBOK",
    periode: "Mars 2026",
    npfPatronal: 25500,
    npfSalarie: 17000,
    hrdc: 5100,
    nps: 8500,
    paye: 42500,
    total: 98600,
    echeance: "15/04/2026",
    statut: "Conforme" as const,
  },
  {
    id: "2",
    societe: "BPO Services",
    periode: "Mars 2026",
    npfPatronal: 18600,
    npfSalarie: 12400,
    hrdc: 3720,
    nps: 6200,
    paye: 28200,
    total: 69120,
    echeance: "15/04/2026",
    statut: "Conforme" as const,
  },
  {
    id: "3",
    societe: "TIBOK",
    periode: "Février 2026",
    npfPatronal: 25500,
    npfSalarie: 17000,
    hrdc: 5100,
    nps: 8500,
    paye: 42500,
    total: 98600,
    echeance: "15/03/2026",
    statut: "Conforme" as const,
  },
  {
    id: "4",
    societe: "BPO Services",
    periode: "Février 2026",
    npfPatronal: 18600,
    npfSalarie: 12400,
    hrdc: 3720,
    nps: 6200,
    paye: 28200,
    total: 69120,
    echeance: "15/03/2026",
    statut: "Écart détecté" as const,
  },
  {
    id: "5",
    societe: "TIBOK",
    periode: "Janvier 2026",
    npfPatronal: 24000,
    npfSalarie: 16000,
    hrdc: 4800,
    nps: 8000,
    paye: 40000,
    total: 92800,
    echeance: "15/02/2026",
    statut: "Conforme" as const,
  },
  {
    id: "6",
    societe: "BPO Services",
    periode: "Janvier 2026",
    npfPatronal: 17400,
    npfSalarie: 11600,
    hrdc: 3480,
    nps: 5800,
    paye: 26400,
    total: 64680,
    echeance: "15/02/2026",
    statut: "Conforme" as const,
  },
]

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

  const filtered = mockData.filter(
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
          Suivi des cotisations NPF, HRDC, NPS et PAYE
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
                {formatMUR(card.value)}
              </div>
            </CardContent>
          </Card>
        ))}
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
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Badge variant="outline" style={{ borderColor: "#1E2A4A", color: "#1E2A4A" }}>
                      {row.societe}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{row.periode}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.npfPatronal)}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.npfSalarie)}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.hrdc)}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.nps)}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.paye)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatMUR(row.total)}</TableCell>
                  <TableCell>{row.echeance}</TableCell>
                  <TableCell>{getStatutBadge(row.statut)}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    Aucune charge sociale trouvée.
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
