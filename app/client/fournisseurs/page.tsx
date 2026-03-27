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

const supplierInvoices: {
  id: string
  fournisseur: string
  societe: string
  numFacture: string
  date: string
  montantHT: number
  tva: number
  ttc: number
  echeance: string
  statut: "En attente" | "Payé" | "En retard"
  compte: string
}[] = []

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

export default function ClientFournisseursPage() {
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

  const filtered = supplierInvoices.filter(
    (row) =>
      row.fournisseur.toLowerCase().includes(search.toLowerCase()) ||
      row.societe.toLowerCase().includes(search.toLowerCase()) ||
      row.numFacture.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Vos factures fournisseurs
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suivi des factures fournisseurs et paiements
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
                    {search
                      ? "Aucune facture fournisseur trouvée pour cette recherche."
                      : "Aucune facture fournisseur disponible. Les factures apparaîtront ici une fois traitées."}
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
