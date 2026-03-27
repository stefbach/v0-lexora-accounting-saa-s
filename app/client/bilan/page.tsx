"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Landmark,
  Banknote,
  Loader2,
  FileText,
  DollarSign,
} from "lucide-react"

function formatMUR(n: number) {
  return n.toLocaleString("fr-FR") + " MUR"
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BilanPage() {
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
        <Link href="/client/documents" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour aux documents
        </Link>
      </div>
    )
  }

  const totalRevenue = data?.totalRevenue ?? 0
  const totalExpenses = data?.totalExpenses ?? 0
  const resultat = data?.resultat ?? 0

  const hasData = totalRevenue !== 0 || totalExpenses !== 0 || resultat !== 0

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Mon Bilan
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Votre situation financi&egrave;re &agrave; la cl&ocirc;ture de l&apos;exercice
          </p>
        </div>
      </div>

      {/* P&L Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenus (Actif) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
              <Landmark className="h-5 w-5" style={{ color: "#C9A84C" }} />
              Revenus (Produits)
            </CardTitle>
            <p className="text-xs text-muted-foreground">Total des revenus per&ccedil;us</p>
          </CardHeader>
          <CardContent>
            {totalRevenue === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Aucune donn&eacute;e de revenus disponible pour le moment.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Votre comptable pr&eacute;parera votre bilan en fin d&apos;exercice.
                </p>
              </div>
            ) : (
              <p className="text-3xl font-bold" style={{ color: "#22C55E" }}>
                {formatMUR(totalRevenue)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Depenses (Passif) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
              <Banknote className="h-5 w-5" style={{ color: "#C9A84C" }} />
              D&eacute;penses (Charges)
            </CardTitle>
            <p className="text-xs text-muted-foreground">Total des d&eacute;penses engag&eacute;es</p>
          </CardHeader>
          <CardContent>
            {totalExpenses === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Aucune donn&eacute;e de d&eacute;penses disponible pour le moment.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Votre comptable pr&eacute;parera votre bilan en fin d&apos;exercice.
                </p>
              </div>
            ) : (
              <p className="text-3xl font-bold" style={{ color: "#EF4444" }}>
                {formatMUR(totalExpenses)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Resultat (Bottom Line) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
            <DollarSign className="h-5 w-5" style={{ color: "#C9A84C" }} />
            R&eacute;sultat net
          </CardTitle>
          <p className="text-xs text-muted-foreground">Revenus - D&eacute;penses</p>
        </CardHeader>
        <CardContent>
          {resultat === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune donn&eacute;e</p>
          ) : (
            <p className="text-3xl font-bold" style={{ color: resultat >= 0 ? "#22C55E" : "#EF4444" }}>
              {formatMUR(resultat)}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Footer note */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground italic">
          Pr&eacute;par&eacute; par votre comptable
        </p>
      </div>
    </div>
  )
}
