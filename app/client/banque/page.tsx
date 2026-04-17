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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Search, Landmark, AlertCircle, Clock, RefreshCw, Loader2, Building2, X, Pencil } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useProfile } from "@/hooks/use-profile"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { MonthPicker } from "@/components/ui/MonthPicker"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

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

function getSocieteBadgeStyle(name?: string): Record<string, string> {
  if (!name) return { backgroundColor: '#f3f4f6', color: '#374151', borderColor: '#e5e7eb' }
  const n = name.toLowerCase()
  if (n.includes('obesity') || n.includes('occ'))
    return { backgroundColor: '#ccfbf1', color: '#0f766e', borderColor: '#99f6e4' }
  if (n.includes('digital') || n.includes('dds'))
    return { backgroundColor: '#dbeafe', color: '#1d4ed8', borderColor: '#bfdbfe' }
  if (n.includes('tibok'))
    return { backgroundColor: '#fef9c3', color: '#a16207', borderColor: '#fef08a' }
  return { backgroundColor: '#f3f4f6', color: '#374151', borderColor: '#e5e7eb' }
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
  const [error, setError] = useState<string | null>(null)
  const { societeId } = useSocieteActive()
  const [selectedCompte, setSelectedCompte] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [showOnlyNonRapprochees, setShowOnlyNonRapprochees] = useState(false)
  const [selectedTx, setSelectedTx] = useState<any>(null)
  const [editingCompte, setEditingCompte] = useState<string | null>(null)
  const [editingNom, setEditingNom] = useState("")
  const [selectedMois, setSelectedMois] = useState<string | null>(null)
  const { profile } = useProfile()

  async function fetchData() {
    if (!societeId) { setData(null); return }
    try {
      setError(null)
      const res = await fetch(`/api/client/financial?societe_id=${societeId}`)
      if (res.ok) {
        const json = await res.json()
        setData(json.financial)
      } else {
        setData(null)
        setError("Erreur de chargement des données bancaires.")
      }
    } catch {
      setData(null)
      setError("Erreur de chargement des données bancaires.")
    }
  }

  useEffect(() => {
    setLoading(true)
    setSelectedCompte("all")
    fetchData().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [societeId])

  async function handleRefresh() {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  function getDisplayName(acc: any): string {
    if (acc.nom_compte && acc.nom_compte !== acc.numero_compte) return acc.nom_compte
    if (acc.numero_compte) return `Compte •${acc.numero_compte.slice(-4)}`
    return "Compte sans nom"
  }

  async function saveNomCompte(accId: string, newNom: string) {
    try {
      await fetch("/api/comptable/banque", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: accId, nom_compte: newNom }),
      })
      await fetchData()
    } catch { /* silent */ }
    setEditingCompte(null)
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Vous n&apos;avez pas accès à cette section.</p>
            <Link href="/client" className="text-sm underline mt-4 inline-block" style={{ color: "#D4AF37" }}>
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
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#D4AF37" }} />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <AlertCircle className="h-8 w-8 mx-auto text-red-500" />
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => { setLoading(true); fetchData().finally(() => setLoading(false)) }}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const bankAccounts = data?.bankAccounts ?? []
  const totalBankMUR = bankAccounts.reduce((s: number, a: any) => s + (a.solde_mur ?? 0), 0)

  // Account IDs for the selected accounts (used to filter transactions)
  const bankAccountIds = new Set(bankAccounts.map((a: any) => a.id))

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
    compte_bancaire_id: tx.compte_bancaire_id || null,
    societe: tx.societe || "—",
    lettre: tx.lettre || null,
    facture_id: tx.facture_id || null,
  }))

  allTransactions.sort((a, b) => {
    if (!a.date) return 1
    if (!b.date) return -1
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })

  const hasActiveFilters = !!(search || selectedCompte !== "all" || dateFrom || dateTo || showOnlyNonRapprochees || selectedMois !== null)

  const filtered = allTransactions.filter((row) => {
    // Month filter
    if (selectedMois !== null && row.date) {
      const txMonth = row.date.substring(0, 7) // "YYYY-MM"
      if (txMonth !== selectedMois) return false
    }
    // Non-rapprochées filter (from KPI click)
    if (showOnlyNonRapprochees && (row.statut?.includes("rapproche") || row.statut?.includes("lettre"))) return false
    // Search filter
    if (search) {
      const s = search.toLowerCase()
      if (!row.libelle.toLowerCase().includes(s) &&
          !(row.tiers || "").toLowerCase().includes(s) &&
          !(row.banque || "").toLowerCase().includes(s)) return false
    }
    // Account filter
    if (selectedCompte !== "all" && row.compte_bancaire_id !== selectedCompte) return false
    // Date range filter (normalize to timestamps for safe comparison)
    if (dateFrom && row.date) {
      const txDate = new Date(row.date).getTime()
      const fromDate = new Date(dateFrom).getTime()
      if (!isNaN(txDate) && !isNaN(fromDate) && txDate < fromDate) return false
    }
    if (dateTo && row.date) {
      const txDate = new Date(row.date).getTime()
      const toDate = new Date(dateTo).getTime()
      if (!isNaN(txDate) && !isNaN(toDate) && txDate > toDate) return false
    }
    return true
  })

  const txForMonth = selectedMois !== null
    ? allTransactions.filter(t => t.date?.substring(0, 7) === selectedMois)
    : allTransactions
  const nonRaprochees = txForMonth.filter(
    (t) => !t.statut?.includes("rapproche") && !t.statut?.includes("lettre")
  ).length

  const derniereMaj = bankAccounts.length > 0
    ? bankAccounts.map((a: any) => a.date_dernier_releve).filter(Boolean).sort().reverse()[0]
    : null

  return (
    <ClientPageShell
      breadcrumbs={[
        { label: "Espace client", href: "/client" },
        { label: "Banque" },
      ]}
      kicker={`${bankAccounts.length} compte${bankAccounts.length > 1 ? "s" : ""} bancaire${bankAccounts.length > 1 ? "s" : ""}`}
      title="Vos comptes bancaires"
      subtitle="Suivi en temps réel de vos comptes, import des relevés et rapprochement automatique des opérations."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </>
      }
    >
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Solde total</CardTitle>
            <div className="rounded-lg p-2 bg-blue-50">
              <Landmark className="h-5 w-5" style={{ color: "#0B0F2E" }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>
              {bankAccounts.length > 0 ? formatMUR(totalBankMUR) : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {bankAccounts.length} compte{bankAccounts.length > 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all ${showOnlyNonRapprochees ? "ring-2 ring-red-300" : "hover:shadow-md"}`}
          onClick={() => setShowOnlyNonRapprochees(v => !v)}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Opérations non rapprochées</CardTitle>
            <div className="rounded-lg p-2 bg-red-50">
              <AlertCircle className="h-5 w-5" style={{ color: "#DC2626" }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: nonRaprochees > 0 ? "#DC2626" : "#0B0F2E" }}>
              {nonRaprochees}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {hasActiveFilters
                ? `sur ${filtered.length} filtrées (${allTransactions.length} au total)`
                : `sur ${allTransactions.length} transaction${allTransactions.length > 1 ? "s" : ""}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Dernière MAJ</CardTitle>
            <div className="rounded-lg p-2 bg-amber-50">
              <Clock className="h-5 w-5" style={{ color: "#D4AF37" }} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold" style={{ color: "#0B0F2E" }}>
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
            <CardTitle className="flex items-center gap-2" style={{ color: "#0B0F2E" }}>
              <Landmark className="h-5 w-5" style={{ color: "#D4AF37" }} />
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
                  <TableHead>Société</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankAccounts.map((acc: any) => (
                  <TableRow key={acc.id || acc.nom_compte} className="cursor-pointer hover:bg-blue-50/50"
                    onClick={() => setSelectedCompte(selectedCompte === acc.id ? "all" : acc.id)}>
                    <TableCell>
                      <Badge variant="outline" style={{ borderColor: "#D4AF37", color: "#D4AF37" }}>
                        {acc.banque}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {editingCompte === acc.id ? (
                        <Input
                          autoFocus
                          className="h-7 text-sm w-40"
                          value={editingNom}
                          onChange={(e) => setEditingNom(e.target.value)}
                          onBlur={() => saveNomCompte(acc.id, editingNom)}
                          onKeyDown={(e) => { if (e.key === "Enter") saveNomCompte(acc.id, editingNom); if (e.key === "Escape") setEditingCompte(null) }}
                        />
                      ) : (
                        <span className="flex items-center gap-1 group">
                          {getDisplayName(acc)}
                          <button className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setEditingCompte(acc.id); setEditingNom(acc.nom_compte || "") }}>
                            <Pencil className="h-3 w-3 text-muted-foreground hover:text-[#0B0F2E]" />
                          </button>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{acc.numero_compte || "—"}</TableCell>
                    <TableCell>{acc.devise || "MUR"}</TableCell>
                    <TableCell className="text-right font-bold" style={{ color: "#0B0F2E" }}>
                      <div>{formatAmount(acc.solde_actuel ?? 0, acc.devise)}</div>
                      {acc.devise && acc.devise !== "MUR" && acc.solde_mur != null && (
                        <div className="text-xs text-muted-foreground font-normal">≈ {formatMUR(acc.solde_mur)}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {acc.date_dernier_releve ? formatDate(acc.date_dernier_releve) : "—"}
                    </TableCell>
                    <TableCell>
                      {acc.societe_nom ? (
                        <Badge variant="outline" className="text-xs" style={getSocieteBadgeStyle(acc.societe_nom)}>{acc.societe_nom}</Badge>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Month navigator */}
      <MonthPicker value={selectedMois} onChange={setSelectedMois} />

      {/* Filtres */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par libellé, tiers, banque..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {bankAccounts.length > 1 && (
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Compte</label>
            <Select value={selectedCompte} onValueChange={setSelectedCompte}>
              <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les comptes</SelectItem>
                {bankAccounts.map((acc: any) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.banque || "Compte"} {acc.numero_compte ? `•${acc.numero_compte.slice(-4)}` : ""} ({acc.devise || "MUR"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">De</label>
          <Input type="date" className="w-[150px] h-9" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">À</label>
          <Input type="date" className="w-[150px] h-9" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setSelectedCompte("all"); setDateFrom(""); setDateTo(""); setShowOnlyNonRapprochees(false) }}>
            Effacer filtres
          </Button>
        )}
      </div>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#0B0F2E" }}>
            Opérations bancaires ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 relative">
          <div className="overflow-x-auto">
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
                <TableHead>Lettre</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id} className="cursor-pointer hover:bg-blue-50/50" onClick={() => setSelectedTx(row)}>
                  <TableCell className="whitespace-nowrap">{formatDate(row.date)}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="text-xs" style={{ borderColor: "#D4AF37" }}>{row.banque}</Badge>
                    {row.devise !== "MUR" && <span className="ml-1 text-muted-foreground">{row.devise}</span>}
                  </TableCell>
                  <TableCell>
                    <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild><span className="block max-w-[300px] truncate cursor-help">{row.libelle}</span></TooltipTrigger><TooltipContent side="top" className="max-w-[400px] text-sm break-words">{row.libelle}</TooltipContent></Tooltip></TooltipProvider>
                  </TableCell>
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
                  <TableCell>
                    {row.lettre ? (
                      <Badge className="bg-green-100 text-green-700 border-green-200">{row.lettre}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                    {search
                      ? "Aucune opération trouvée pour cette recherche."
                      : "Aucune opération bancaire disponible. Importez un relevé bancaire dans Mes Documents pour voir vos données ici."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {/* Transaction detail sheet */}
      <Sheet open={!!selectedTx} onOpenChange={(o) => { if (!o) setSelectedTx(null) }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-[#0B0F2E]">Détail de l&apos;opération</SheetTitle>
          </SheetHeader>
          {selectedTx && (
            <div className="space-y-4 mt-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase mb-1">Libellé complet</p>
                <p className="font-medium">{selectedTx.libelle}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-1">Date</p>
                  <p>{formatDate(selectedTx.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-1">Banque</p>
                  <Badge variant="outline" style={{ borderColor: "#D4AF37" }}>{selectedTx.banque}</Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-1">Débit</p>
                  <p className={selectedTx.debit > 0 ? "text-red-600 font-semibold" : "text-muted-foreground"}>
                    {selectedTx.debit > 0 ? formatAmount(selectedTx.debit, selectedTx.devise) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-1">Crédit</p>
                  <p className={selectedTx.credit > 0 ? "text-green-600 font-semibold" : "text-muted-foreground"}>
                    {selectedTx.credit > 0 ? formatAmount(selectedTx.credit, selectedTx.devise) : "—"}
                  </p>
                </div>
              </div>
              {selectedTx.solde_apres != null && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-1">Solde après</p>
                  <p className="font-semibold">{formatAmount(selectedTx.solde_apres, selectedTx.devise)}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-1">Tiers identifié</p>
                  <p>{selectedTx.tiers || <span className="text-muted-foreground italic">Non identifié</span>}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-1">Compte comptable</p>
                  <p className="font-mono">{selectedTx.compte_comptable || "—"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-1">Statut</p>
                  {getStatutBadge(selectedTx.statut)}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase mb-1">Lettre</p>
                  {selectedTx.lettre
                    ? <Badge className="bg-green-100 text-green-700">{selectedTx.lettre}</Badge>
                    : <span className="text-muted-foreground">—</span>}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase mb-1">Devise</p>
                <p>{selectedTx.devise}</p>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </ClientPageShell>
  )
}
