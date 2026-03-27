"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Search, FileText } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

function formatMUR(amount: number) {
  return amount.toLocaleString("fr-FR") + " MUR"
}

interface Invoice {
  id: string
  client: string
  societe: string
  numFacture: string
  dateEmission: string
  montantHT: number
  tva: number
  ttc: number
  echeance: string
  statut: "Soldé" | "Impayé" | "Partiellement payé"
  joursRetard: number
}

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

  const invoices: Invoice[] = []

  const filtered = invoices.filter(
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
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="h-10 w-10 text-muted-foreground/40" />
                      <p className="font-medium">Aucune facture client</p>
                      <p className="text-sm">Les factures émises apparaîtront ici une fois créées.</p>
                    </div>
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
