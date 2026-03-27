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

const bankOperations: {
  id: string
  date: string
  banque: string
  societe: string
  libelle: string
  debit: number
  credit: number
  solde: number
  tiers: string
  compteImpute: string
  statut: "Rapproché" | "À vérifier" | "Non identifié"
}[] = []

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

  const filtered = bankOperations.filter(
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Solde total
            </CardTitle>
            <div className="rounded-lg p-2 bg-blue-50">
              <Landmark className="h-5 w-5" style={{ color: "#1E2A4A" }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
              {formatMUR(0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Aucune donnée disponible</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Opérations non rapprochées
            </CardTitle>
            <div className="rounded-lg p-2 bg-red-50">
              <AlertCircle className="h-5 w-5" style={{ color: "#DC2626" }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
              0
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Dernière MAJ
            </CardTitle>
            <div className="rounded-lg p-2 bg-amber-50">
              <Clock className="h-5 w-5" style={{ color: "#C9A84C" }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
              —
            </div>
          </CardContent>
        </Card>
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
                    {search
                      ? "Aucune opération trouvée pour cette recherche."
                      : "Aucune opération bancaire disponible. Les données apparaîtront ici une fois vos relevés bancaires importés."}
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
