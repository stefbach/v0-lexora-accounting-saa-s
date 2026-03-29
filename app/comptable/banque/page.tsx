"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Search, RefreshCw, Landmark, Download, AlertCircle } from "lucide-react"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function formatDate(d: string) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
}

interface Societe { id: string; nom: string }
interface CompteBancaire {
  id: string; banque: string; nom_compte: string; numero_compte: string
  devise: string; solde_actuel: number; date_dernier_releve: string | null; actif: boolean
}
interface Transaction {
  id: string; date: string; libelle: string; debit: number; credit: number
  solde_apres: number | null; tiers: string | null; compte_comptable: string | null
  statut: string; banque?: string
}
interface Releve {
  id: string; periode: string; date_debut: string; date_fin: string
  solde_ouverture: number; solde_cloture: number; total_debits: number; total_credits: number
  transactions_json: any[]; statut_rapprochement: string
}

function getStatutBadge(statut: string) {
  if (statut?.includes("non_identifie")) return <Badge className="bg-red-100 text-red-700 border-red-200">Non identifié</Badge>
  if (statut?.includes("a_verifier")) return <Badge className="bg-orange-100 text-orange-700 border-orange-200">À vérifier</Badge>
  return <Badge className="bg-green-100 text-green-700 border-green-200">Identifié</Badge>
}

export default function ComptableBanquePage() {
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState("all")
  const [comptes, setComptes] = useState<CompteBancaire[]>([])
  const [releves, setReleves] = useState<Releve[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedCompte, setSelectedCompte] = useState("all")

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  const load = useCallback(async () => {
    if (selectedSociete === "all") {
      setComptes([]); setReleves([]); setTransactions([])
      setLoading(false); return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/comptable/banque?societe_id=${selectedSociete}`)
      const d = await res.json()
      setComptes(d.comptes || [])
      setReleves(d.releves || [])
      // Flatten transactions from releves
      const txs: Transaction[] = []
      ;(d.releves || []).forEach((r: Releve) => {
        const banque = (d.comptes || []).find((c: CompteBancaire) =>
          r.id.includes(c.id) || true  // best effort
        )?.banque || "—"
        ;(r.transactions_json || []).forEach((tx: any, idx: number) => {
          txs.push({
            id: `${r.id}-${idx}`,
            date: tx.date || tx.date_operation || "",
            libelle: tx.libelle || tx.description || "",
            debit: Number(tx.debit) || 0,
            credit: Number(tx.credit) || 0,
            solde_apres: tx.solde_apres ?? tx.solde ?? null,
            tiers: tx.tiers_detecte || tx.tiers || null,
            compte_comptable: tx.compte_comptable || null,
            statut: tx.statut || "non_identifie",
            banque,
          })
        })
      })
      txs.sort((a, b) => {
        if (!a.date) return 1; if (!b.date) return -1
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      })
      setTransactions(txs)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [selectedSociete])

  useEffect(() => { load() }, [load])

  const filteredTxs = transactions.filter(tx => {
    const matchSearch = !search ||
      tx.libelle.toLowerCase().includes(search.toLowerCase()) ||
      (tx.tiers || "").toLowerCase().includes(search.toLowerCase())
    return matchSearch
  })

  const totalSolde = comptes.reduce((s, c) => s + (c.solde_actuel || 0), 0)
  const nonRaprochees = transactions.filter(t => !t.tiers || t.statut?.includes("non_identifie")).length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Banque & Relevés</h1>
          <p className="text-sm text-gray-500 mt-1">Comptes bancaires et transactions importées</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading || selectedSociete === "all"} className="gap-1">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" /> Exporter
          </Button>
        </div>
      </div>

      {/* Filtre société */}
      <div className="flex gap-4 items-end flex-wrap">
        <div className="w-72">
          <Select value={selectedSociete} onValueChange={setSelectedSociete}>
            <SelectTrigger><SelectValue placeholder="Choisir une société..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">-- Choisir une société --</SelectItem>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedSociete === "all" ? (
        <Card>
          <CardContent className="py-16 text-center text-gray-400">
            Sélectionnez une société pour afficher les comptes bancaires
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-[#1E2A4A]" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">Solde total</p>
                <p className="text-2xl font-bold text-[#1E2A4A]">
                  {totalSolde > 0 ? fmt(totalSolde) + " MUR" : "—"}
                </p>
                <p className="text-xs text-gray-400 mt-1">{comptes.length} compte{comptes.length > 1 ? "s" : ""}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">Transactions totales</p>
                <p className="text-2xl font-bold text-[#1E2A4A]">{transactions.length}</p>
                <p className="text-xs text-gray-400 mt-1">{releves.length} relevé{releves.length > 1 ? "s" : ""} importé{releves.length > 1 ? "s" : ""}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">Non rapprochées</p>
                <p className={`text-2xl font-bold ${nonRaprochees > 0 ? "text-red-600" : "text-green-600"}`}>
                  {nonRaprochees}
                </p>
                <p className="text-xs text-gray-400 mt-1">à vérifier</p>
              </CardContent>
            </Card>
          </div>

          {/* Comptes bancaires */}
          {comptes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-[#1E2A4A] flex items-center gap-2">
                  <Landmark className="w-5 h-5" /> Comptes bancaires ({comptes.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Banque</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>N° compte</TableHead>
                      <TableHead>Devise</TableHead>
                      <TableHead className="text-right">Solde actuel</TableHead>
                      <TableHead>Dernier relevé</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comptes.map(c => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Badge variant="outline" style={{ borderColor: "#C9A84C", color: "#C9A84C" }}>{c.banque}</Badge>
                        </TableCell>
                        <TableCell>{c.nom_compte || "—"}</TableCell>
                        <TableCell className="font-mono text-sm text-gray-500">{c.numero_compte || "—"}</TableCell>
                        <TableCell>{c.devise || "MUR"}</TableCell>
                        <TableCell className="text-right font-bold text-[#1E2A4A]">
                          {fmt(c.solde_actuel || 0)} {c.devise || "MUR"}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {c.date_dernier_releve ? formatDate(c.date_dernier_releve) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Relevés importés */}
          {releves.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-[#1E2A4A] text-base">Relevés importés ({releves.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Période</TableHead>
                      <TableHead className="text-right">Solde ouverture</TableHead>
                      <TableHead className="text-right">Débits</TableHead>
                      <TableHead className="text-right">Crédits</TableHead>
                      <TableHead className="text-right">Solde clôture</TableHead>
                      <TableHead>Nb transactions</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {releves.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm">
                          {formatDate(r.date_debut)} → {formatDate(r.date_fin)}
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.solde_ouverture)}</TableCell>
                        <TableCell className="text-right font-mono text-red-600">{fmt(r.total_debits)}</TableCell>
                        <TableCell className="text-right font-mono text-green-600">{fmt(r.total_credits)}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-[#1E2A4A]">{fmt(r.solde_cloture)}</TableCell>
                        <TableCell>{(r.transactions_json || []).length}</TableCell>
                        <TableCell>
                          <Badge className={
                            r.statut_rapprochement === "equilibre" ? "bg-green-100 text-green-700" :
                            r.statut_rapprochement === "ecart_detecte" ? "bg-red-100 text-red-700" :
                            "bg-amber-100 text-amber-700"
                          }>
                            {r.statut_rapprochement === "equilibre" ? "Équilibré" :
                             r.statut_rapprochement === "ecart_detecte" ? "Écart détecté" : "En attente"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Transactions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#1E2A4A]">
                Transactions ({filteredTxs.length})
              </CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  className="pl-9"
                  placeholder="Rechercher..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <AlertCircle className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm">Aucune transaction.</p>
                  <p className="text-xs mt-1">Importez un relevé bancaire dans Documents pour alimenter cet onglet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Libellé</TableHead>
                        <TableHead className="text-right">Débit</TableHead>
                        <TableHead className="text-right">Crédit</TableHead>
                        <TableHead className="text-right">Solde après</TableHead>
                        <TableHead>Tiers</TableHead>
                        <TableHead>Compte</TableHead>
                        <TableHead>Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTxs.map(tx => (
                        <TableRow key={tx.id}>
                          <TableCell className="whitespace-nowrap text-sm">{formatDate(tx.date)}</TableCell>
                          <TableCell className="text-sm max-w-[240px] truncate">{tx.libelle}</TableCell>
                          <TableCell className="text-right text-red-600 font-medium">
                            {tx.debit > 0 ? fmt(tx.debit) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-green-600 font-medium">
                            {tx.credit > 0 ? fmt(tx.credit) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {tx.solde_apres != null ? fmt(tx.solde_apres) : "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {tx.tiers || <span className="text-gray-400 italic">Non identifié</span>}
                          </TableCell>
                          <TableCell className="font-mono text-sm text-gray-500">
                            {tx.compte_comptable || "—"}
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
        </>
      )}
    </div>
  )
}
