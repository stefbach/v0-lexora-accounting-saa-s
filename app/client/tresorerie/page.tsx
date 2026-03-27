"use client"

import { useState, useEffect } from "react"
import { useProfile } from "@/hooks/use-profile"
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
  Loader2,
  Banknote,
  Lock,
  Wallet,
} from "lucide-react"

function formatMUR(n: number) {
  return n.toLocaleString("fr-FR") + " MUR"
}

// ---------------------------------------------------------------------------
// Access denied view for client_user
// ---------------------------------------------------------------------------

function AccessDenied() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Card className="border-orange-200 bg-orange-50">
        <CardContent className="py-12 text-center space-y-4">
          <Lock className="h-12 w-12 mx-auto text-orange-400" />
          <h2 className="text-lg font-semibold" style={{ color: "#1E2A4A" }}>
            Acces reserve
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Cette page est reservee au responsable de l{"'"}entreprise.
            Si vous pensez que c{"'"}est une erreur, contactez votre administrateur.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main treasury view (client_admin)
// ---------------------------------------------------------------------------

function TresorerieView() {
  const [data, setData] = useState<any>(null)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    fetch("/api/client/financial")
      .then((res) => res.json())
      .then((json) => setData(json.financial))
      .catch(() => setData(null))
      .finally(() => setFetching(false))
  }, [])

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  const bankAccounts: any[] = data?.bankAccounts ?? []
  const totalBankMUR = data?.totalBankMUR ?? 0

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Ma Tresorerie
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Votre situation financiere en un coup d{"'"}oeil.
        </p>
      </div>

      {/* Total */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Banknote className="h-4 w-4" style={{ color: "#C9A84C" }} />
            Solde total
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalBankMUR === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune donn&eacute;e</p>
          ) : (
            <p className="text-3xl font-bold" style={{ color: "#1E2A4A" }}>{formatMUR(totalBankMUR)}</p>
          )}
        </CardContent>
      </Card>

      {/* Bank Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
            <Wallet className="h-5 w-5" style={{ color: "#C9A84C" }} />
            Comptes bancaires ({bankAccounts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bankAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Wallet className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Aucun compte bancaire enregistré.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Uploadez un relevé bancaire dans &quot;Mes Documents&quot; pour voir vos comptes ici.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Banque</TableHead>
                  <TableHead>Nom du compte</TableHead>
                  <TableHead>Devise</TableHead>
                  <TableHead className="text-right">Solde</TableHead>
                  <TableHead className="text-right">Solde (MUR)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankAccounts.map((acc: any) => (
                  <TableRow key={acc.id || acc.nom_compte}>
                    <TableCell className="font-medium">{acc.banque || "—"}</TableCell>
                    <TableCell>{acc.nom_compte || "—"}</TableCell>
                    <TableCell>{acc.devise || "MUR"}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {(acc.solde_actuel ?? 0).toLocaleString("fr-FR")} {acc.devise || "MUR"}
                    </TableCell>
                    <TableCell className="text-right font-bold" style={{ color: "#1E2A4A" }}>
                      {acc.devise !== "MUR" && acc.solde_mur ? formatMUR(acc.solde_mur) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30 font-bold">
                  <TableCell colSpan={4} className="text-right">Total consolidé (MUR)</TableCell>
                  <TableCell className="text-right" style={{ color: "#1E2A4A" }}>{formatMUR(totalBankMUR)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function TresoreriePage() {
  const { profile, loading } = useProfile()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  const isClientUser = profile?.role === "client_user"

  if (isClientUser) {
    return <AccessDenied />
  }

  return <TresorerieView />
}
