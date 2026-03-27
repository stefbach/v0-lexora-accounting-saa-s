"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Loader2,
  FileText,
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

function formatMUR(n: number) {
  return n.toLocaleString("fr-FR") + " MUR"
}

export default function FinancesPage() {
  const { profile, loading } = useProfile()
  const [data, setData] = useState<any>(null)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    fetch("/api/client/financial")
      .then((res) => res.json())
      .then((json) => setData(json.financial))
      .catch(() => setData(null))
      .finally(() => setFetching(false))
  }, [])

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "#1E2A4A" }}>
          Acc&egrave;s non autoris&eacute;
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;acc&eacute;der &agrave; cette page.
        </p>
        <Link href="/client/upload" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour &agrave; l&apos;envoi de documents
        </Link>
      </div>
    )
  }

  const totalRevenue = data?.totalRevenue ?? 0
  const totalExpenses = data?.totalExpenses ?? 0
  const resultat = data?.resultat ?? 0
  const invoices: any[] = data?.extractedInvoices ?? []

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Mes Chiffres
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suivez vos revenus, vos d&eacute;penses, la TVA et les salaires en un coup d&apos;oeil.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total revenus
            </CardTitle>
            <TrendingUp className="h-5 w-5" style={{ color: "#22C55E" }} />
          </CardHeader>
          <CardContent>
            {totalRevenue === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune donn&eacute;e</p>
            ) : (
              <p className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>{formatMUR(totalRevenue)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total d&eacute;penses
            </CardTitle>
            <TrendingDown className="h-5 w-5" style={{ color: "#EF4444" }} />
          </CardHeader>
          <CardContent>
            {totalExpenses === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune donn&eacute;e</p>
            ) : (
              <p className="text-2xl font-bold" style={{ color: "#EF4444" }}>{formatMUR(totalExpenses)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              R&eacute;sultat
            </CardTitle>
            <DollarSign className="h-5 w-5" style={{ color: "#C9A84C" }} />
          </CardHeader>
          <CardContent>
            {resultat === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune donn&eacute;e</p>
            ) : (
              <p className="text-2xl font-bold" style={{ color: resultat >= 0 ? "#22C55E" : "#EF4444" }}>
                {formatMUR(resultat)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#1E2A4A" }}>
            Factures extraites ({invoices.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Aucune donn&eacute;e de revenus ou de d&eacute;penses disponible pour le moment.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Vos chiffres appara&icirc;tront ici une fois vos documents comptables trait&eacute;s.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>&Eacute;metteur</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Montant original</TableHead>
                  <TableHead className="text-right">Montant MUR</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv: any) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.emetteur || "—"}</TableCell>
                    <TableCell>{inv.date || "—"}</TableCell>
                    <TableCell className="text-right">
                      {(inv.montant_ttc ?? 0).toLocaleString("fr-FR")} {inv.devise || "MUR"}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatMUR(inv.montant_ttc_mur ?? inv.montant_ttc ?? 0)}</TableCell>
                    <TableCell>{inv.type === "facture_fournisseur" ? "Fournisseur" : inv.type === "facture_client" ? "Client" : inv.type || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
