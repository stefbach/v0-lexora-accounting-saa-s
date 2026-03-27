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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  Banknote,
  Lock,
  Wallet,
  ArrowDownUp,
  AlertTriangle,
  RefreshCw,
} from "lucide-react"

function formatMUR(n: number) {
  return n.toLocaleString("fr-FR") + " MUR"
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Transaction {
  id: string
  date: string
  libelle: string
  debit: number
  credit: number
  solde_apres: number | null
  tiers: string | null
  compte_comptable: string | null
  statut: string
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
  const [refreshing, setRefreshing] = useState(false)

  async function fetchData() {
    try {
      const res = await fetch("/api/client/financial")
      if (res.ok) {
        const json = await res.json()
        setData(json.financial)
      } else {
        setData(null)
      }
    } catch {
      setData(null)
    }
  }

  useEffect(() => {
    fetchData().finally(() => setFetching(false))
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  const bankAccounts: any[] = data?.bankAccounts ?? []
  const totalBankMUR = data?.totalBankMUR ?? 0

  // Build transactions from bankTransactions (extracted from releve_bancaire documents)
  const rawBankTx: any[] = data?.bankTransactions ?? []

  const transactions: Transaction[] = rawBankTx.map((tx: any) => ({
    id: tx.id,
    date: tx.date || "",
    libelle: tx.libelle || "",
    debit: Number(tx.debit) || 0,
    credit: Number(tx.credit) || 0,
    solde_apres: tx.solde_apres ?? null,
    tiers: tx.tiers || null,
    compte_comptable: tx.compte_comptable || null,
    statut: tx.statut || "non_identifie",
  }))

  // Sort by date descending
  transactions.sort((a, b) => {
    if (!a.date) return 1
    if (!b.date) return -1
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })

  // Anomalies: transactions where tiers is not identified or statut contains "a_verifier" or "non_identifie"
  const anomalies = transactions.filter(
    (t) => !t.tiers || t.statut.includes("non_identifie") || t.statut.includes("a_verifier")
  )

  function getStatutBadge(statut: string) {
    if (statut.includes("non_identifie")) {
      return <Badge className="bg-red-100 text-red-700 border-red-200">Non identifie</Badge>
    }
    if (statut.includes("a_verifier")) {
      return <Badge className="bg-orange-100 text-orange-700 border-orange-200">A verifier</Badge>
    }
    return <Badge className="bg-green-100 text-green-700 border-green-200">Identifie</Badge>
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Ma Tresorerie
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Votre situation financiere en un coup d{"'"}oeil.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Mettre a jour
        </Button>
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
            <p className="text-sm text-muted-foreground">Aucune donnee</p>
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
                Aucun compte bancaire enregistre.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Uploadez un releve bancaire dans &quot;Mes Documents&quot; pour voir vos comptes ici.
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
                  <TableCell colSpan={4} className="text-right">Total consolide (MUR)</TableCell>
                  <TableCell className="text-right" style={{ color: "#1E2A4A" }}>{formatMUR(totalBankMUR)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dernières transactions bancaires */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
            <ArrowDownUp className="h-5 w-5" style={{ color: "#C9A84C" }} />
            Dernieres transactions bancaires ({transactions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <ArrowDownUp className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Aucune transaction disponible.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Uploadez un releve bancaire dans &quot;Mes Documents&quot; pour voir vos transactions ici.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Libelle</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Solde apres</TableHead>
                    <TableHead>Tiers identifie</TableHead>
                    <TableHead>Compte comptable</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-sm whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                      <TableCell className="text-sm max-w-[250px] truncate">{tx.libelle}</TableCell>
                      <TableCell className="text-right text-sm font-medium text-red-600">
                        {tx.debit > 0 ? formatMUR(tx.debit) : "\u2014"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-green-600">
                        {tx.credit > 0 ? formatMUR(tx.credit) : "\u2014"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {tx.solde_apres != null ? formatMUR(tx.solde_apres) : "\u2014"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {tx.tiers || <span className="text-muted-foreground italic">Non identifie</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {tx.compte_comptable || "\u2014"}
                      </TableCell>
                      <TableCell>{getStatutBadge(tx.statut)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Anomalies détectées */}
      <Card className={anomalies.length > 0 ? "border-orange-200" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
            <AlertTriangle className="h-5 w-5" style={{ color: anomalies.length > 0 ? "#F97316" : "#C9A84C" }} />
            Anomalies detectees ({anomalies.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {anomalies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <AlertTriangle className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Aucune anomalie detectee. Toutes les transactions sont identifiees.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Libelle</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead>Tiers</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {anomalies.map((tx) => (
                    <TableRow key={tx.id} className="bg-orange-50/50">
                      <TableCell className="text-sm whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                      <TableCell className="text-sm max-w-[250px] truncate">{tx.libelle}</TableCell>
                      <TableCell className="text-right text-sm font-medium text-red-600">
                        {tx.debit > 0 ? formatMUR(tx.debit) : "\u2014"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-green-600">
                        {tx.credit > 0 ? formatMUR(tx.credit) : "\u2014"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {tx.tiers || <span className="text-muted-foreground italic">Non identifie</span>}
                      </TableCell>
                      <TableCell>{getStatutBadge(tx.statut)}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          style={{ borderColor: "#C9A84C", color: "#C9A84C" }}
                        >
                          Mettre a jour
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
