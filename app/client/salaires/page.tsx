"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Search, Loader2, Users, FileText } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

function formatMUR(n: number) {
  return n.toLocaleString("fr-FR") + " MUR"
}

export default function ClientSalairesPage() {
  const [search, setSearch] = useState("")
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

  const salaires = data?.salaires ?? 0
  const chargesSociales = data?.chargesSociales ?? 0
  const invoices: any[] = data?.extractedInvoices ?? []

  // Filter invoices by payroll-related types
  const payrollTypes = ["salaire", "paie", "fiche_paie", "bulletin", "payroll"]
  const payrollInvoices = invoices.filter((inv: any) =>
    payrollTypes.some((t) => (inv.type || "").toLowerCase().includes(t))
  )

  const filtered = payrollInvoices.filter(
    (inv: any) =>
      (inv.emetteur || "").toLowerCase().includes(search.toLowerCase()) ||
      (inv.destinataire || "").toLowerCase().includes(search.toLowerCase()) ||
      (inv.date || "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Salaires
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestion des fiches de paie et charges salariales
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total salaires
            </CardTitle>
            <Users className="h-5 w-5" style={{ color: "#1E2A4A" }} />
          </CardHeader>
          <CardContent>
            {salaires === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune donn&eacute;e</p>
            ) : (
              <p className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>{formatMUR(salaires)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Charges sociales
            </CardTitle>
            <FileText className="h-5 w-5" style={{ color: "#C9A84C" }} />
          </CardHeader>
          <CardContent>
            {chargesSociales === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune donn&eacute;e</p>
            ) : (
              <p className="text-2xl font-bold" style={{ color: "#C9A84C" }}>{formatMUR(chargesSociales)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher par emetteur, destinataire, date..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Payroll Documents Table */}
      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#1E2A4A" }}>
            Documents de paie ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>&Eacute;metteur</TableHead>
                <TableHead>Destinataire</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Montant TTC</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inv: any) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.emetteur || "—"}</TableCell>
                  <TableCell>{inv.destinataire || "—"}</TableCell>
                  <TableCell>{inv.date || "—"}</TableCell>
                  <TableCell className="text-right">{formatMUR(inv.montant_ttc ?? 0)}</TableCell>
                  <TableCell>{inv.type || "—"}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    {search
                      ? "Aucune fiche de paie trouv\u00e9e pour cette recherche."
                      : "Aucune fiche de paie disponible. Les donn\u00e9es appara\u00eetront ici une fois les salaires trait\u00e9s."}
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
