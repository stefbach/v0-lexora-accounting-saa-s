"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  TrendingUp, TrendingDown, DollarSign, Loader2, FileText, Receipt,
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

function formatMUR(n: number) {
  return Math.round(n).toLocaleString("fr-FR") + " MUR"
}

function formatAmount(n: number, devise: string) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + devise
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
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: NAVY }}>Accès non autorisé</h1>
        <p className="text-sm text-muted-foreground">Vous n&apos;avez pas la permission d&apos;accéder à cette page.</p>
        <Link href="/client/upload" className="text-sm underline" style={{ color: GOLD }}>Retour</Link>
      </div>
    )
  }

  const invoices: any[] = data?.extractedInvoices ?? []
  const facturesFournisseurs = invoices.filter(i => i.type === "facture_fournisseur")
  const facturesClients = invoices.filter(i => i.type === "facture_client")

  // Use the MUR-converted amounts from the API for totals
  const totalDepenses = facturesFournisseurs.reduce((sum: number, i: any) => sum + (i.montant_ttc_mur ?? 0), 0)
  const totalRevenus = facturesClients.reduce((sum: number, i: any) => sum + (i.montant_ttc_mur ?? 0), 0)
  const resultat = totalRevenus - totalDepenses

  function InvoiceTable({ items, emptyMsg }: { items: any[]; emptyMsg: string }) {
    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">{emptyMsg}</p>
        </div>
      )
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Émetteur / Destinataire</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>N° Facture</TableHead>
            <TableHead className="text-right">Montant HT</TableHead>
            <TableHead className="text-right">TVA</TableHead>
            <TableHead className="text-right">TTC</TableHead>
            <TableHead className="text-right">TTC (MUR)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((inv: any) => (
            <TableRow key={inv.id}>
              <TableCell className="font-medium">{inv.emetteur || inv.destinataire || "—"}</TableCell>
              <TableCell>{inv.date || "—"}</TableCell>
              <TableCell className="text-muted-foreground">{inv.numero || "—"}</TableCell>
              <TableCell className="text-right">{formatAmount(inv.montant_ht ?? 0, inv.devise)}</TableCell>
              <TableCell className="text-right">{formatAmount(inv.montant_tva ?? 0, inv.devise)}</TableCell>
              <TableCell className="text-right font-medium">{formatAmount(inv.montant_ttc ?? 0, inv.devise)}</TableCell>
              <TableCell className="text-right font-bold" style={{ color: NAVY }}>
                {inv.devise !== "MUR" ? formatMUR(inv.montant_ttc_mur ?? 0) : "—"}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-muted/30 font-bold">
            <TableCell colSpan={6} className="text-right">Total (MUR)</TableCell>
            <TableCell className="text-right" style={{ color: NAVY }}>
              {formatMUR(items.reduce((s: number, i: any) => s + (i.montant_ttc_mur ?? 0), 0))}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Mes Chiffres</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suivez vos revenus, vos dépenses et votre résultat.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revenus (factures clients)</CardTitle>
            <TrendingUp className="h-5 w-5" style={{ color: "#22C55E" }} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" style={{ color: NAVY }}>{formatMUR(totalRevenus)}</p>
            <p className="text-xs text-muted-foreground mt-1">{facturesClients.length} facture(s) client</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Dépenses (factures fournisseurs)</CardTitle>
            <TrendingDown className="h-5 w-5" style={{ color: "#EF4444" }} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" style={{ color: "#EF4444" }}>{formatMUR(totalDepenses)}</p>
            <p className="text-xs text-muted-foreground mt-1">{facturesFournisseurs.length} facture(s) fournisseur</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Résultat net</CardTitle>
            <DollarSign className="h-5 w-5" style={{ color: GOLD }} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" style={{ color: resultat >= 0 ? "#22C55E" : "#EF4444" }}>
              {formatMUR(resultat)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Revenus - Dépenses</p>
          </CardContent>
        </Card>
      </div>

      {/* Factures Clients (Revenue) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5" style={{ color: "#22C55E" }} />
            <CardTitle style={{ color: NAVY }}>Factures Clients — Revenus ({facturesClients.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <InvoiceTable items={facturesClients} emptyMsg="Aucune facture client. Uploadez vos factures envoyées à vos clients." />
        </CardContent>
      </Card>

      {/* Factures Fournisseurs (Expenses) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5" style={{ color: "#EF4444" }} />
            <CardTitle style={{ color: NAVY }}>Factures Fournisseurs — Dépenses ({facturesFournisseurs.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <InvoiceTable items={facturesFournisseurs} emptyMsg="Aucune facture fournisseur. Uploadez vos factures de fournisseurs." />
        </CardContent>
      </Card>
    </div>
  )
}
