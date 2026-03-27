"use client"

import { useState, useEffect } from "react"
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
  Calculator,
  AlertTriangle,
  Loader2,
  FileText,
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"
import Link from "next/link"

function formatMUR(n: number) {
  return n.toLocaleString("fr-FR") + " MUR"
}

export default function TVAPage() {
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
          Vous n&apos;avez pas acc&egrave;s &agrave; cette section
        </h1>
        <Link href="/client" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour au tableau de bord
        </Link>
      </div>
    )
  }

  const tvaCollectee = data?.tvaCollectee ?? 0
  const tvaDeductible = data?.tvaDeductible ?? 0
  const tvaNette = data?.tvaNette ?? 0
  const tvaRecords: any[] = data?.tvaRecords ?? []
  const invoices: any[] = data?.extractedInvoices ?? []

  // If no tvaRecords, show TVA from invoices that have montant_tva > 0
  const tvaInvoices = invoices.filter((inv: any) => (inv.montant_tva ?? 0) !== 0)

  const summaryCards = [
    { title: "TVA Collect\u00e9e totale", value: tvaCollectee, icon: TrendingUp, color: "#1E2A4A", bg: "bg-blue-50" },
    { title: "TVA D\u00e9ductible totale", value: tvaDeductible, icon: TrendingDown, color: "#C9A84C", bg: "bg-amber-50" },
    { title: "TVA Nette", value: tvaNette, icon: Calculator, color: "#DC2626", bg: "bg-red-50" },
    { title: "Nombre de d\u00e9clarations", value: tvaRecords.length, icon: AlertTriangle, color: "#DC2626", bg: "bg-red-50", isMUR: false },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          TVA &amp; Fiscal
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suivi de vos d&eacute;clarations TVA et obligations fiscales aupr&egrave;s de la MRA.
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
              {card.value === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune donn&eacute;e</p>
              ) : (
                <p className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
                  {card.isMUR === false ? card.value : formatMUR(card.value)}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* TVA Records Table or Invoice TVA fallback */}
      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#1E2A4A" }}>D&eacute;clarations TVA mensuelles</CardTitle>
        </CardHeader>
        <CardContent>
          {tvaRecords.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>P&eacute;riode</TableHead>
                  <TableHead className="text-right">TVA Collect&eacute;e</TableHead>
                  <TableHead className="text-right">TVA D&eacute;ductible</TableHead>
                  <TableHead className="text-right">TVA Nette</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tvaRecords.map((rec: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{rec.periode || rec.month || "—"}</TableCell>
                    <TableCell className="text-right">{formatMUR(rec.tvaCollectee ?? rec.collectee ?? 0)}</TableCell>
                    <TableCell className="text-right">{formatMUR(rec.tvaDeductible ?? rec.deductible ?? 0)}</TableCell>
                    <TableCell className="text-right">{formatMUR(rec.tvaNette ?? rec.nette ?? 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : tvaInvoices.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                TVA extraite des factures :
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>&Eacute;metteur</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Montant HT</TableHead>
                    <TableHead className="text-right">TVA</TableHead>
                    <TableHead className="text-right">TTC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tvaInvoices.map((inv: any) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.emetteur || "—"}</TableCell>
                      <TableCell>{inv.date || "—"}</TableCell>
                      <TableCell className="text-right">{formatMUR(inv.montant_ht ?? 0)}</TableCell>
                      <TableCell className="text-right">{formatMUR(inv.montant_tva ?? 0)}</TableCell>
                      <TableCell className="text-right">{formatMUR(inv.montant_ttc ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Aucune d&eacute;claration TVA disponible pour le moment.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Vos d&eacute;clarations TVA mensuelles appara&icirc;tront ici une fois trait&eacute;es par votre comptable.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
