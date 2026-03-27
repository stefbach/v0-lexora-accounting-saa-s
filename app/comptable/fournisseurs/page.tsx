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
    fournisseur: "ABC Supplies Ltd",
    societe: "TIBOK",
    numFacture: "FAC-2026-0145",
    date: "05/03/2026",
    montantHT: 125000,
    tva: 18750,
    ttc: 143750,
    echeance: "05/04/2026",
    statut: "En attente" as const,
    compte: "401100",
  },
  {
    id: "2",
    fournisseur: "Island Office Pro",
    societe: "BPO Services",
    numFacture: "FAC-2026-0146",
    date: "28/02/2026",
    montantHT: 87500,
    tva: 13125,
    ttc: 100625,
    echeance: "30/03/2026",
    statut: "Payé" as const,
    compte: "401200",
  },
  {
    id: "3",
    fournisseur: "MauriTech Solutions",
    societe: "TIBOK",
    numFacture: "FAC-2026-0132",
    date: "15/02/2026",
    montantHT: 245000,
    tva: 36750,
    ttc: 281750,
    echeance: "15/03/2026",
    statut: "En retard" as const,
    compte: "401300",
  },
  {
    id: "4",
    fournisseur: "Global Freight MU",
    societe: "TIBOK",
    numFacture: "FAC-2026-0150",
    date: "10/03/2026",
    montantHT: 58000,
    tva: 8700,
    ttc: 66700,
    echeance: "10/04/2026",
    statut: "En attente" as const,
    compte: "401400",
  },
  {
    id: "5",
    fournisseur: "Cyber Print Co",
    societe: "BPO Services",
    numFacture: "FAC-2026-0128",
    date: "10/02/2026",
    montantHT: 32000,
    tva: 4800,
    ttc: 36800,
    echeance: "10/03/2026",
    statut: "Payé" as const,
    compte: "401500",
  },
  {
    id: "6",
    fournisseur: "CleanPro Mauritius",
    societe: "TIBOK",
    numFacture: "FAC-2026-0155",
    date: "18/03/2026",
    montantHT: 15500,
    tva: 2325,
    ttc: 17825,
    echeance: "18/04/2026",
    statut: "En attente" as const,
    compte: "401600",
  },
  {
    id: "7",
    fournisseur: "Securitas MU",
    societe: "BPO Services",
    numFacture: "FAC-2026-0119",
    date: "01/02/2026",
    montantHT: 42000,
    tva: 6300,
    ttc: 48300,
    echeance: "01/03/2026",
    statut: "En retard" as const,
    compte: "401700",
  },
  {
    id: "8",
    fournisseur: "Tropical Catering",
    societe: "TIBOK",
    numFacture: "FAC-2026-0160",
    date: "22/03/2026",
    montantHT: 19800,
    tva: 2970,
    ttc: 22770,
    echeance: "22/04/2026",
    statut: "En attente" as const,
    compte: "401800",
  },
]

function getStatutBadge(statut: string) {
  switch (statut) {
    case "Payé":
      return <Badge className="bg-green-100 text-green-700 border-green-200">Payé</Badge>
    case "En attente":
      return <Badge className="bg-orange-100 text-orange-700 border-orange-200">En attente</Badge>
    case "En retard":
      return <Badge className="bg-red-100 text-red-700 border-red-200">En retard</Badge>
    default:
      return <Badge variant="secondary">{statut}</Badge>
  }
}

export default function ComptableFournisseursPage() {
  const [search, setSearch] = useState("")
  const { profile } = useProfile()

  const filtered = mockData.filter(
    (row) =>
      row.fournisseur.toLowerCase().includes(search.toLowerCase()) ||
      row.societe.toLowerCase().includes(search.toLowerCase()) ||
      row.numFacture.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Fournisseurs
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suivi des factures fournisseurs et paiements
          {profile?.role === "comptable_dedie" && " — Dossiers assignés"}
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher fournisseur, société, facture..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#1E2A4A" }}>
            Factures fournisseurs ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fournisseur</TableHead>
                <TableHead>Société</TableHead>
                <TableHead>N° Facture</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Montant HT</TableHead>
                <TableHead className="text-right">TVA</TableHead>
                <TableHead className="text-right">TTC</TableHead>
                <TableHead>Échéance</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Compte</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.fournisseur}</TableCell>
                  <TableCell>
                    <Badge variant="outline" style={{ borderColor: "#1E2A4A", color: "#1E2A4A" }}>
                      {row.societe}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{row.numFacture}</TableCell>
                  <TableCell>{row.date}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.montantHT)}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.tva)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatMUR(row.ttc)}</TableCell>
                  <TableCell>{row.echeance}</TableCell>
                  <TableCell>{getStatutBadge(row.statut)}</TableCell>
                  <TableCell className="font-mono text-sm">{row.compte}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    Aucune facture fournisseur trouvée.
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
