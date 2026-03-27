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
    client: "Raj Doobur",
    societe: "TIBOK",
    numFacture: "FC-2026-0201",
    dateEmission: "01/03/2026",
    montantHT: 350000,
    tva: 52500,
    ttc: 402500,
    echeance: "31/03/2026",
    statut: "Soldé" as const,
    joursRetard: 0,
  },
  {
    id: "2",
    client: "Nisha Doobur",
    societe: "BPO Services",
    numFacture: "FC-2026-0202",
    dateEmission: "05/03/2026",
    montantHT: 185000,
    tva: 27750,
    ttc: 212750,
    echeance: "05/04/2026",
    statut: "Impayé" as const,
    joursRetard: 0,
  },
  {
    id: "3",
    client: "Jean-Pierre Lagesse",
    societe: "TIBOK",
    numFacture: "FC-2026-0185",
    dateEmission: "15/02/2026",
    montantHT: 520000,
    tva: 78000,
    ttc: 598000,
    echeance: "15/03/2026",
    statut: "Impayé" as const,
    joursRetard: 11,
  },
  {
    id: "4",
    client: "Anand Doorgakant",
    societe: "TIBOK",
    numFacture: "FC-2026-0190",
    dateEmission: "20/02/2026",
    montantHT: 98000,
    tva: 14700,
    ttc: 112700,
    echeance: "20/03/2026",
    statut: "Partiellement payé" as const,
    joursRetard: 6,
  },
  {
    id: "5",
    client: "Marie Cupidon",
    societe: "BPO Services",
    numFacture: "FC-2026-0175",
    dateEmission: "01/02/2026",
    montantHT: 275000,
    tva: 41250,
    ttc: 316250,
    echeance: "01/03/2026",
    statut: "Soldé" as const,
    joursRetard: 0,
  },
  {
    id: "6",
    client: "Dev Doobur",
    societe: "TIBOK",
    numFacture: "FC-2026-0210",
    dateEmission: "12/03/2026",
    montantHT: 145000,
    tva: 21750,
    ttc: 166750,
    echeance: "12/04/2026",
    statut: "Impayé" as const,
    joursRetard: 0,
  },
  {
    id: "7",
    client: "Sophie Ramdin",
    societe: "BPO Services",
    numFacture: "FC-2026-0160",
    dateEmission: "20/01/2026",
    montantHT: 68000,
    tva: 10200,
    ttc: 78200,
    echeance: "20/02/2026",
    statut: "Impayé" as const,
    joursRetard: 34,
  },
  {
    id: "8",
    client: "Vikash Doobur",
    societe: "TIBOK",
    numFacture: "FC-2026-0215",
    dateEmission: "20/03/2026",
    montantHT: 420000,
    tva: 63000,
    ttc: 483000,
    echeance: "20/04/2026",
    statut: "Impayé" as const,
    joursRetard: 0,
  },
]

function getStatutBadge(statut: string) {
  switch (statut) {
    case "Soldé":
      return <Badge className="bg-green-100 text-green-700 border-green-200">Soldé</Badge>
    case "Partiellement payé":
      return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Partiellement payé</Badge>
    case "Impayé":
      return <Badge className="bg-red-100 text-red-700 border-red-200">Impayé</Badge>
    default:
      return <Badge variant="secondary">{statut}</Badge>
  }
}

export default function ComptableFacturesClientsPage() {
  const [search, setSearch] = useState("")
  const { profile } = useProfile()

  const filtered = mockData.filter(
    (row) =>
      row.client.toLowerCase().includes(search.toLowerCase()) ||
      row.societe.toLowerCase().includes(search.toLowerCase()) ||
      row.numFacture.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Factures Clients
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suivi des factures émises et encaissements
          {profile?.role === "comptable_dedie" && " — Dossiers assignés"}
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher client, société, facture..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#1E2A4A" }}>
            Factures clients ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Société</TableHead>
                <TableHead>N° Facture</TableHead>
                <TableHead>Date émission</TableHead>
                <TableHead className="text-right">Montant HT</TableHead>
                <TableHead className="text-right">TVA</TableHead>
                <TableHead className="text-right">TTC</TableHead>
                <TableHead>Échéance</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Jours retard</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.client}</TableCell>
                  <TableCell>
                    <Badge variant="outline" style={{ borderColor: "#1E2A4A", color: "#1E2A4A" }}>
                      {row.societe}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{row.numFacture}</TableCell>
                  <TableCell>{row.dateEmission}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.montantHT)}</TableCell>
                  <TableCell className="text-right">{formatMUR(row.tva)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatMUR(row.ttc)}</TableCell>
                  <TableCell>{row.echeance}</TableCell>
                  <TableCell>{getStatutBadge(row.statut)}</TableCell>
                  <TableCell className="text-right">
                    {row.joursRetard > 0 ? (
                      <span className="text-red-600 font-semibold">{row.joursRetard}j</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    Aucune facture client trouvée.
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
