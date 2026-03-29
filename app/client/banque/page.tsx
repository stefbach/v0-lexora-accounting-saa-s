"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Search, Landmark, AlertCircle, Clock, RefreshCw, Loader2, Building2 } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

function formatAmount(amount: number, devise?: string) {
  const d = devise || "MUR"
  return amount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + d
}
function formatMUR(amount: number) {
  return formatAmount(amount, "MUR")
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
}

function getStatutBadge(statut: string) {
  if (statut?.includes("non_identifie")) return <Badge className="bg-red-100 text-red-700 border-red-200">Non identifié</Badge>
  if (statut?.includes("a_verifier")) return <Badge className="bg-orange-100 text-orange-700 border-orange-200">À vérifier</Badge>
  if (statut?.includes("lettre") || statut?.includes("rapproche")) return <Badge className="bg-green-100 text-green-700 border-green-200">Rapproché</Badge>
  return <Badge className="bg-green-100 text-green-700 border-green-200">Identifié</Badge>
}

export default function ClientBanquePage() {
  const [search, setSearch] = useState("")
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedSociete, setSelectedSociete] = useState("all")
  const { profile } = useProfile()

  async function fetchData(societeId?: string) {
    try {
      const url = societeId && societeId !== "all"
        ? `/api/client/financial?societe_id=${societeId}`
        : "/api/client/financial"
      const res = await fetch(url)
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
    setLoading(true)
    fetchData(selectedSociete).finally(() => setLoading(false))
  }, [selectedSociete])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchData(selectedSociete)
    setRefreshing(false)
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Vous n&apos;avez pas accès à cette section.</p>
            <Link href="/client" className="text-sm underline mt-4 inline-block" style={{ color: "#C9A84C" }}>
              Retour au tableau de bord
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  const bankAccounts = data?.bankAccounts ?? []
  const totalBankMUR = data?.totalBankMUR ?? 0
  const societes = data?.availableSocietes ?? []

  // Transactions depuis releves_bancaires (extraction JSON)
  const rawTx: any[] = data?.bankTransactions ?? []
  const allTransactions = rawTx.map((tx: any, idx: number) => ({
    id: tx.id || `tx-${idx}`,
    date: tx.date || "",
    libelle: tx.libelle || "",
    debit: Number(tx.debit) || 0,
    credit: Number(tx.credit) || 0,
    debit_mur: Number(tx.debit_mur) || Number(tx.debit) || 0,
    credit_mur: Number(tx.credit_mur) || Number(tx.credit) || 0,
    devise: tx.devise || "MUR",
    solde_apres: tx.solde_apres ?? null,
    tiers: tx.tiers || tx.tiers_detecte || null,
    compte_comptable: tx.compte_comptable || null,
    statut: tx.statut || "non_identifie",
    banque: tx.banque || "—",
    societe: tx.societe || "—",
  }))

  allTransactions.sort((a, b) => {
    if (!a.date) return 1
    if (!b.date) return -1
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })

  const filtered = allTransactions.filter(
    (row) =>
      row.libelle.toLowerCase().includes(search.toLowerCase()) ||
      (row.tiers || "").toLowerCase().includes(search.toLowerCase()) ||
      (row.banque || "").toLowerCase().includes(search.toLowerCase())
  )

  const nonRaprochees = allTransactions.filter(
    (t) => !t.tiers || t.statut?.includes("non_identifie") || t.statut?.includes("a_verifier")
  ).length

  const derniereMaj = bankAccounts.length > 0
    ? bankAccounts.map((a: any) => a.date_dernier_releve).filter(Boolean).sort().reverse()[0]
    : null

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Vos comptes bancaires
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Suivi et rapprochement des opérations bancaires
          </p>
        </div>
        <div className="flex items-center gap-3">
          {societes.length > 1 && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedSociete} onValueChange={setSelectedSociete}>
                <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les sociétés</SelectItem>
                  {societes.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Solde total</CardTitle>
            <div className="rounded-lg p-2 bg-blue-50">
              <Landmark className="h-5 w-5" style={{ color: "#1E2A4A" }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
              {totalBankMUR > 0 ? formatMUR(totalBankMUR) : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {bankAccounts.length} compte{bankAccounts.length > 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Opérations non rapprochées</CardTitle>
            <div className="rounded-lg p-2 bg-red-50">
              <AlertCircle className="h-5 w-5" style={{ color: "#DC2626" }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: nonRaprochees > 0 ? "#DC2626" : "#1E2A4A" }}>
              {nonRaprochees}
            </div>
            <p className="text-xs text-muted-foreground mt-1">sur {allTransactions.length} transaction{allTransactions.length > 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Dernière MAJ</CardTitle>
            <div className="rounded-lg p-2 bg-amber-50">
              <Clock className="h-5 w-5" style={{ color: "#C9A84C" }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold" style={{ color: "#1E2A4A" }}>
              {derniereMaj ? formatDate(derniereMaj) : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {derniereMaj ? "Dernier relevé importé" : "Aucun relevé importé"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Comptes bancaires */}
      {bankAccounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
              <Landmark className="h-5 w-5" style={{ color: "#C9A84C" }} />
              Comptes ({bankAccounts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Banque</TableHead>
                  <TableHead>Nom du compte</TableHead>
                  <TableHead>N° compte</TableHead>
                  <TableHead>Devise</TableHead>
                  <TableHead className="text-right">Solde</TableHead>
                  <TableHead>Dernier relevé</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankAccounts.map((acc: any) => (
                  <TableRow key={acc.id || acc.nom_compte}>
                    <TableCell>
                      <Badge variant="outline" style={{ borderColor: "#C9A84C", color: "#C9A84C" }}>
                        {acc.banque}
                      </Badge>
                    </TableCell>
                    <TableCell>{acc.nom_compte || "—"}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{acc.numero_compte || "—"}</TableCell>
                    <TableCell>{acc.devise || "MUR"}</TableCell>
                    <TableCell className="text-right font-bold" style={{ color: "#1E2A4A" }}>
                      <div>{formatAmount(acc.solde_actuel ?? 0, acc.devise)}</div>
                      {acc.devise && acc.devise !== "MUR" && acc.solde_mur != null && (
                        <div className="text-xs text-muted-foreground font-normal">≈ {formatMUR(acc.solde_mur)}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {acc.date_dernier_releve ? formatDate(acc.date_dernier_releve) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recherche */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher par libellé, tiers, banque..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#1E2A4A" }}>
            Opérations bancaires ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Banque</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead className="text-right">Débit</TableHead>
                <TableHead className="text-right">Crédit</TableHead>
                <TableHead className="text-right">Solde après</TableHead>
                <TableHead>Tiers identifié</TableHead>
                <TableHead>Compte</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(row.date)}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="text-xs" style={{ borderColor: "#C9A84C" }}>{row.banque}</Badge>
                    {row.devise !== "MUR" && <span className="ml-1 text-muted-foreground">{row.devise}</span>}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">{row.libelle}</TableCell>
                  <TableCell className="text-right">
                    {row.debit > 0 ? (
                      <div>
                        <span className="text-red-600 font-medium">{formatAmount(row.debit, row.devise)}</span>
                        {row.devise && row.devise !== "MUR" && row.debit_mur > 0 && (
                          <div className="text-xs text-muted-foreground">≈ {formatMUR(row.debit_mur)}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.credit > 0 ? (
                      <div>
                        <span className="text-green-600 font-medium">{formatAmount(row.credit, row.devise)}</span>
                        {row.devise && row.devise !== "MUR" && row.credit_mur > 0 && (
                          <div className="text-xs text-muted-foreground">≈ {formatMUR(row.credit_mur)}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {row.solde_apres != null ? formatAmount(row.solde_apres, row.devise) : "—"}
                  </TableCell>
                  <TableCell>
                    {row.tiers || <span className="text-muted-foreground italic">Non identifié</span>}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {row.compte_comptable || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>{getStatutBadge(row.statut)}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                    {search
                      ? "Aucune opération trouvée pour cette recherche."
                      : "Aucune opération bancaire disponible. Importez un relevé bancaire dans Mes Documents pour voir vos données ici."}
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
