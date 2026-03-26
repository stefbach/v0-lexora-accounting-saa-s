"use client"

import { useState } from "react"
import Link from "next/link"
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

const summaryCards = [
  {
    title: "Solde total",
    value: 2845000,
    icon: Landmark,
    color: "#1E2A4A",
    bg: "bg-blue-50",
  },
  {
    title: "Opérations non rapprochées",
    value: 4,
    isCount: true,
    icon: AlertCircle,
    color: "#DC2626",
    bg: "bg-red-50",
  },
  {
    title: "Dernière MAJ",
    value: "25/03/2026",
    isDate: true,
    icon: Clock,
    color: "#C9A84C",
    bg: "bg-amber-50",
  },
]

const mockData = [
  {
    id: "1",
    date: "25/03/2026",
    banque: "MCB",
    societe: "TIBOK",
    libelle: "Virement client — Raj Doobur",
    debit: 0,
    credit: 402500,
    solde: 1850000,
    tiers: "Raj Doobur",
    compteImpute: "411100",
    statut: "Rapproché" as const,
  },
  {
    id: "2",
    date: "24/03/2026",
    banque: "MCB",
    societe: "TIBOK",
    libelle: "Paiement fournisseur — ABC Supplies",
    debit: 143750,
    credit: 0,
    solde: 1447500,
    tiers: "ABC Supplies Ltd",
    compteImpute: "401100",
    statut: "Rapproché" as const,
  },
  {
    id: "3",
    date: "23/03/2026",
    banque: "SBM",
    societe: "BPO Services",
    libelle: "Prélèvement NPF — Mars 2026",
    debit: 85200,
    credit: 0,
    solde: 995000,
    tiers: "MRA/NPF",
    compteImpute: "431000",
    statut: "Rapproché" as const,
  },
  {
    id: "4",
    date: "22/03/2026",
    banque: "MCB",
    societe: "TIBOK",
    libelle: "Virement entrant — REF-29384",
    debit: 0,
    credit: 178500,
    solde: 1626000,
    tiers: "",
    compteImpute: "",
    statut: "Non identifié" as const,
  },
  {
    id: "5",
    date: "21/03/2026",
    banque: "SBM",
    societe: "BPO Services",
    libelle: "Paiement salaires — Mars 2026",
    debit: 425000,
    credit: 0,
    solde: 1080200,
    tiers: "Salariés",
    compteImpute: "421000",
    statut: "Rapproché" as const,
  },
  {
    id: "6",
    date: "20/03/2026",
    banque: "MCB",
    societe: "TIBOK",
    libelle: "Frais bancaires — Mars",
    debit: 3500,
    credit: 0,
    solde: 1447500,
    tiers: "MCB",
    compteImpute: "627000",
    statut: "À vérifier" as const,
  },
  {
    id: "7",
    date: "19/03/2026",
    banque: "MCB",
    societe: "TIBOK",
    libelle: "Encaissement chèque — JP Lagesse",
    debit: 0,
    credit: 598000,
    solde: 1451000,
    tiers: "Jean-Pierre Lagesse",
    compteImpute: "411300",
    statut: "À vérifier" as const,
  },
  {
    id: "8",
    date: "18/03/2026",
    banque: "SBM",
    societe: "BPO Services",
    libelle: "Virement sortant — REF-88201",
    debit: 65000,
    credit: 0,
    solde: 1505200,
    tiers: "",
    compteImpute: "",
    statut: "Non identifié" as const,
  },
  {
    id: "9",
    date: "17/03/2026",
    banque: "MCB",
    societe: "TIBOK",
    libelle: "Paiement loyer — Mars 2026",
    debit: 95000,
    credit: 0,
    solde: 853000,
    tiers: "SCI Moka",
    compteImpute: "613000",
    statut: "Rapproché" as const,
  },
  {
    id: "10",
    date: "16/03/2026",
    banque: "SBM",
    societe: "BPO Services",
    libelle: "Virement client — Marie Cupidon",
    debit: 0,
    credit: 316250,
    solde: 1570200,
    tiers: "Marie Cupidon",
    compteImpute: "411500",
    statut: "Rapproché" as const,
  },
]

function getStatutBadge(statut: string) {
  switch (statut) {
    case "Rapproché":
      return <Badge className="bg-green-100 text-green-700 border-green-200">Rapproché</Badge>
    case "À vérifier":
      return <Badge className="bg-orange-100 text-orange-700 border-orange-200">À vérifier</Badge>
    case "Non identifié":
      return <Badge className="bg-red-100 text-red-700 border-red-200">Non identifié</Badge>
    default:
      return <Badge variant="secondary">{statut}</Badge>
  }
}

export default function ClientBanquePage() {
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
      row.libelle.toLowerCase().includes(search.toLowerCase()) ||
      row.societe.toLowerCase().includes(search.toLowerCase()) ||
      row.tiers.toLowerCase().includes(search.toLowerCase()) ||
      row.banque.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Vos comptes bancaires
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suivi et rapprochement des opérations bancaires
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                {"isDate" in card && card.isDate
                  ? card.value
                  : "isCount" in card && card.isCount
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
          placeholder="Rechercher par libellé, société, tiers..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#1E2A4A" }}>
            Opérations bancaires ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Banque</TableHead>
                <TableHead>Société</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead className="text-right">Débit</TableHead>
                <TableHead className="text-right">Crédit</TableHead>
                <TableHead className="text-right">Solde</TableHead>
                <TableHead>Tiers identifié</TableHead>
                <TableHead>Compte imputé</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.date}</TableCell>
                  <TableCell>
                    <Badge variant="outline" style={{ borderColor: "#C9A84C", color: "#C9A84C" }}>
                      {row.banque}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" style={{ borderColor: "#1E2A4A", color: "#1E2A4A" }}>
                      {row.societe}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">{row.libelle}</TableCell>
                  <TableCell className="text-right">
                    {row.debit > 0 ? (
                      <span className="text-red-600">{formatMUR(row.debit)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.credit > 0 ? (
                      <span className="text-green-600">{formatMUR(row.credit)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{formatMUR(row.solde)}</TableCell>
                  <TableCell>
                    {row.tiers || <span className="text-muted-foreground italic">Non identifié</span>}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {row.compteImpute || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>{getStatutBadge(row.statut)}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    Aucune opération trouvée.
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
