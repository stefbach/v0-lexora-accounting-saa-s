"use client"

import { useState, useEffect } from "react"
import { useProfile } from "@/hooks/use-profile"
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Loader2, Banknote, Lock, Wallet, ArrowDownUp, AlertTriangle,
  RefreshCw, Building2, TrendingUp, TrendingDown,
} from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function fmt(n: number, devise?: string) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + (devise || "MUR")
}
function formatMUR(n: number) { return fmt(n, "MUR") }
function formatDate(dateStr: string) {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
}

// ---------------------------------------------------------------------------
// Access denied view
// ---------------------------------------------------------------------------
function AccessDenied() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Card className="border-orange-200 bg-orange-50">
        <CardContent className="py-12 text-center space-y-4">
          <Lock className="h-12 w-12 mx-auto text-orange-400" />
          <h2 className="text-lg font-semibold" style={{ color: "#1E2A4A" }}>Acces reserve</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Cette page est reservee au responsable de l{"'"}entreprise.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main treasury view
// ---------------------------------------------------------------------------
function TresorerieView() {
  const [data, setData] = useState<any>(null)
  const [rates, setRates] = useState<Record<string, number>>({})
  const [fetching, setFetching] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedSociete, setSelectedSociete] = useState<string>("all")
  const [societes, setSocietes] = useState<{ id: string; nom: string }[]>([])

  async function fetchRates() {
    try {
      const res = await fetch("/api/taux-change")
      if (res.ok) {
        const json = await res.json()
        setRates(json.rates || {})
      }
    } catch {}
  }

  async function fetchData(societeId?: string) {
    try {
      const url = societeId && societeId !== "all"
        ? `/api/client/financial?societe_id=${societeId}`
        : "/api/client/financial"
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        setData(json.financial)
        if (json.financial?.availableSocietes) setSocietes(json.financial.availableSocietes)
      } else {
        setData(null)
      }
    } catch {
      setData(null)
    }
  }

  useEffect(() => {
    setFetching(true)
    Promise.all([fetchData(selectedSociete), fetchRates()]).finally(() => setFetching(false))
  }, [selectedSociete])

  // Rafraichir les taux toutes les 5 minutes
  useEffect(() => {
    const interval = setInterval(fetchRates, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    await Promise.all([fetchData(selectedSociete), fetchRates()])
    setRefreshing(false)
  }

  function toMUR(amount: number, devise: string) {
    if (!devise || devise === "MUR") return amount
    return amount * (rates[devise] || 1)
  }

  if (fetching) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} /></div>
  }

  const bankAccounts: any[] = data?.bankAccounts ?? []
  const totalBankMUR = bankAccounts.reduce((s, a) => s + toMUR(Number(a.solde_actuel) || 0, a.devise || "MUR"), 0)

  const rawBankTx: any[] = data?.bankTransactions ?? []
  const transactions = rawBankTx.map((tx: any) => {
    const devise = tx.devise || "MUR"
    const debit = Number(tx.debit) || 0
    const credit = Number(tx.credit) || 0
    return {
      id: tx.id,
      date: tx.date || "",
      libelle: tx.libelle || "",
      debit, credit, devise,
      debit_mur: toMUR(debit, devise),
      credit_mur: toMUR(credit, devise),
      solde_apres: tx.solde_apres ?? null,
      tiers: tx.tiers || null,
      compte_comptable: tx.compte_comptable || null,
      statut: tx.statut || "non_identifie",
      banque: tx.banque || "—",
    }
  })
  transactions.sort((a, b) => {
    if (!a.date) return 1; if (!b.date) return -1
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })

  const anomalies = transactions.filter(t => !t.tiers || t.statut.includes("non_identifie") || t.statut.includes("a_verifier"))

  function getStatutBadge(statut: string) {
    if (statut.includes("non_identifie")) return <Badge className="bg-red-100 text-red-700 border-red-200">Non identifie</Badge>
    if (statut.includes("a_verifier")) return <Badge className="bg-orange-100 text-orange-700 border-orange-200">A verifier</Badge>
    return <Badge className="bg-green-100 text-green-700 border-green-200">Identifie</Badge>
  }

  const hasMultiCurrency = bankAccounts.some(a => a.devise && a.devise !== "MUR")

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Ma Tresorerie</h1>
          <p className="text-sm text-muted-foreground mt-1">Situation financiere consolidee en temps reel</p>
        </div>
        <div className="flex items-center gap-3">
          {societes.length > 1 && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedSociete} onValueChange={setSelectedSociete}>
                <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les societes</SelectItem>
                  {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
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

      {/* Taux de change en temps réel */}
      {hasMultiCurrency && Object.keys(rates).length > 0 && (
        <Card className="bg-gradient-to-r from-[#1E2A4A] to-[#2a3d6b]">
          <CardContent className="py-4">
            <div className="flex items-center gap-6 flex-wrap">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">Taux de change (MRA)</p>
              {["EUR", "GBP", "USD"].map(d => rates[d] ? (
                <div key={d} className="flex items-center gap-2">
                  <span className="text-white font-bold text-sm">1 {d}</span>
                  <span className="text-white/60">=</span>
                  <span className="text-[#C9A84C] font-bold text-sm">{rates[d].toFixed(2)} MUR</span>
                </div>
              ) : null)}
              <span className="text-white/40 text-xs ml-auto">Mise a jour automatique toutes les 5 min</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Solde total consolidé */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Banknote className="h-4 w-4" style={{ color: "#C9A84C" }} />
              Solde consolide (MUR)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" style={{ color: "#1E2A4A" }}>
              {totalBankMUR > 0 ? formatMUR(Math.round(totalBankMUR)) : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{bankAccounts.length} compte{bankAccounts.length !== 1 ? "s" : ""} actif{bankAccounts.length !== 1 ? "s" : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Total credits (mois)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const total = transactions.reduce((s, t) => s + t.credit_mur, 0)
              return <p className="text-2xl font-bold text-green-600">{total > 0 ? formatMUR(Math.round(total)) : "—"}</p>
            })()}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Total debits (mois)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const total = transactions.reduce((s, t) => s + t.debit_mur, 0)
              return <p className="text-2xl font-bold text-red-600">{total > 0 ? formatMUR(Math.round(total)) : "—"}</p>
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Comptes bancaires avec conversion temps réel */}
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
              <p className="text-sm text-muted-foreground">Aucun compte bancaire. Uploadez un releve dans Mes Documents.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Banque</TableHead>
                  <TableHead>N° compte</TableHead>
                  <TableHead>Devise</TableHead>
                  <TableHead className="text-right">Solde devise</TableHead>
                  <TableHead className="text-right">Taux applique</TableHead>
                  <TableHead className="text-right">Contre-valeur MUR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankAccounts.map((acc: any) => {
                  const solde = Number(acc.solde_actuel) || 0
                  const devise = acc.devise || "MUR"
                  const taux = devise === "MUR" ? 1 : (rates[devise] || 1)
                  const soldeMur = solde * taux
                  return (
                    <TableRow key={acc.id || acc.nom_compte}>
                      <TableCell>
                        <Badge variant="outline" style={{ borderColor: "#C9A84C", color: "#C9A84C" }}>{acc.banque}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{acc.numero_compte || acc.nom_compte || "—"}</TableCell>
                      <TableCell><Badge variant="secondary">{devise}</Badge></TableCell>
                      <TableCell className="text-right font-semibold">{fmt(solde, devise)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {devise !== "MUR" ? `1 ${devise} = ${taux.toFixed(2)} MUR` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-bold" style={{ color: "#1E2A4A" }}>
                        {formatMUR(Math.round(soldeMur * 100) / 100)}
                      </TableCell>
                    </TableRow>
                  )
                })}
                <TableRow className="bg-muted/30 font-bold">
                  <TableCell colSpan={5} className="text-right">Total consolide IAS 21</TableCell>
                  <TableCell className="text-right text-lg" style={{ color: "#1E2A4A" }}>{formatMUR(Math.round(totalBankMUR))}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Transactions avec devise + MUR */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
            <ArrowDownUp className="h-5 w-5" style={{ color: "#C9A84C" }} />
            Transactions bancaires ({transactions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <ArrowDownUp className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">Uploadez un releve bancaire dans Mes Documents.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Banque</TableHead>
                    <TableHead>Libelle</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    {hasMultiCurrency && <TableHead className="text-right">MUR</TableHead>}
                    <TableHead>Tiers</TableHead>
                    <TableHead>Compte</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-sm whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                      <TableCell>
                        <span className="text-xs">{tx.banque}</span>
                        {tx.devise !== "MUR" && <Badge variant="secondary" className="ml-1 text-xs">{tx.devise}</Badge>}
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{tx.libelle}</TableCell>
                      <TableCell className="text-right text-sm font-medium text-red-600">
                        {tx.debit > 0 ? fmt(tx.debit, tx.devise) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-green-600">
                        {tx.credit > 0 ? fmt(tx.credit, tx.devise) : "—"}
                      </TableCell>
                      {hasMultiCurrency && (
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {tx.devise !== "MUR" ? (
                            tx.debit > 0 ? formatMUR(Math.round(tx.debit_mur)) : tx.credit > 0 ? formatMUR(Math.round(tx.credit_mur)) : "—"
                          ) : "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-sm">{tx.tiers || <span className="text-muted-foreground italic">Non identifie</span>}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{tx.compte_comptable || "—"}</TableCell>
                      <TableCell>{getStatutBadge(tx.statut)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Anomalies ({anomalies.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Libelle</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Tiers</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {anomalies.map((tx) => (
                    <TableRow key={tx.id} className="bg-orange-50/50">
                      <TableCell className="text-sm whitespace-nowrap">{formatDate(tx.date)}</TableCell>
                      <TableCell className="text-sm max-w-[250px] truncate">{tx.libelle}</TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {tx.debit > 0 ? <span className="text-red-600">{fmt(tx.debit, tx.devise)}</span> : <span className="text-green-600">{fmt(tx.credit, tx.devise)}</span>}
                        {tx.devise !== "MUR" && <div className="text-xs text-muted-foreground">{tx.debit > 0 ? `≈ ${formatMUR(Math.round(tx.debit_mur))}` : `≈ ${formatMUR(Math.round(tx.credit_mur))}`}</div>}
                      </TableCell>
                      <TableCell className="text-sm">{tx.tiers || <span className="text-muted-foreground italic">Non identifie</span>}</TableCell>
                      <TableCell>{getStatutBadge(tx.statut)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export default function TresoreriePage() {
  const { profile, loading } = useProfile()
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} /></div>
  if (profile?.role === "client_user") return <AccessDenied />
  return <TresorerieView />
}
