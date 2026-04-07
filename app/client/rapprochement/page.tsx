"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, RefreshCw, Link2, Unlink, Zap, CheckCircle2, AlertCircle, ArrowRightLeft, Users, Building2, Search } from "lucide-react"
import { MonthPicker } from "@/components/ui/MonthPicker"

function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function formatDate(d: string) { return d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—" }

export default function ClientRapprochementPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [autoMatching, setAutoMatching] = useState(false)
  const [linkDialog, setLinkDialog] = useState<any>(null)
  const [societeId, setSocieteId] = useState<string | null>(null)
  const [societes, setSocietes] = useState<any[]>([])
  const [payeParAssocie, setPayeParAssocie] = useState(false)
  const [payeParType, setPayeParType] = useState("associe")
  const [payeParNom, setPayeParNom] = useState("")
  const [selectedMois, setSelectedMois] = useState<string | null>(null)
  const [selectedCompte, setSelectedCompte] = useState("all")
  const [activeTab, setActiveTab] = useState("auto")
  const [manualSearch, setManualSearch] = useState("")

  // Get sociétés
  useEffect(() => {
    Promise.all([
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
      setSocietes(unique)
      if (unique.length > 0) setSocieteId(unique[0].id)
    })
  }, [])

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/comptable/rapprochement?societe_id=${societeId}`)
      setData(await res.json())
    } catch { setData(null) }
    finally { setLoading(false) }
  }, [societeId])

  useEffect(() => { load() }, [load])

  const handleAutoMatch = async () => {
    if (!societeId) return
    setAutoMatching(true)
    try {
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto_rapprocher", societe_id: societeId }),
      })
      const d = await res.json()
      alert(`${d.matched || 0} transaction(s) rapprochee(s) automatiquement`)
      load()
    } catch { alert("Erreur rapprochement auto") }
    finally { setAutoMatching(false) }
  }

  const handleManualLink = async (tx: any, target: any, type: "facture" | "ecriture") => {
    try {
      await fetch("/api/comptable/rapprochement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "lettrer_manuel", transaction_id: tx.id, releve_id: tx.releve_id,
          facture_id: type === "facture" ? target.id : undefined,
          ecriture_id: type === "ecriture" ? target.id : undefined,
          societe_id: societeId,
        }),
      })
      setLinkDialog(null); load()
    } catch { alert("Erreur lettrage") }
  }

  const handleUnlink = async (tx: any) => {
    try {
      await fetch("/api/comptable/rapprochement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delettrer", transaction_id: tx.id, releve_id: tx.releve_id, facture_id: tx.facture_id, ecriture_id: tx.ecriture_id }),
      })
      load()
    } catch { alert("Erreur") }
  }

  const handlePayeParAssocie = async (facture: any) => {
    if (!societeId || !payeParNom) return
    try {
      // 1. Mark facture as paid by associate/collaborateur
      await fetch("/api/comptable/factures", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_mode_paiement", facture_id: facture.id,
          mode_paiement: payeParType, paye_par: payeParNom,
        }),
      })

      // 2. Create or find the compte courant and record the advance
      await fetch("/api/comptable/compte-courant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "creer_compte", societe_id: societeId,
          nom: payeParNom, type: payeParType,
        }),
      })

      // Fetch the compte courant id
      const ccRes = await fetch(`/api/comptable/compte-courant?societe_id=${societeId}`)
      const ccData = await ccRes.json()
      const compte = (ccData.comptes || []).find((c: any) => c.nom === payeParNom)

      if (compte) {
        await fetch("/api/comptable/compte-courant", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "avance", societe_id: societeId,
            compte_courant_id: compte.id,
            montant: Number(facture.montant_ttc) || 0,
            description: `Facture ${facture.numero_facture || facture.tiers || ''} payee par ${payeParNom}`,
            facture_id: facture.id,
          }),
        })
      }

      setLinkDialog(null)
      setPayeParAssocie(false)
      setPayeParNom("")
      load()
    } catch { alert("Erreur lors de l'enregistrement") }
  }

  // Lettrage écritures comptables (401/411)
  const [lettrageDialog, setLettrageDialog] = useState<any>(null)
  const [lettrageSelection, setLettrageSelection] = useState<Set<string>>(new Set())
  const [autoLettraging, setAutoLettraging] = useState(false)

  const allTransactions = data?.bankTransactions || []
  const allComptes = data?.comptes || []
  const factures = data?.factures || []
  const ecritures = (data?.ecritures || []).filter((e: any) => !e.lettre)

  // Filter by month + compte
  const transactions = allTransactions.filter((t: any) => {
    if (selectedMois !== null && t.date) {
      if (t.date.substring(0, 7) !== selectedMois) return false
    }
    if (selectedCompte !== "all" && t.compte_bancaire_id) {
      if (String(t.compte_bancaire_id) !== selectedCompte && t.banque !== selectedCompte) return false
    }
    return true
  })
  const matched = transactions.filter((t: any) => t.facture_id || t.ecriture_id || t.lettre)
  const proposed = transactions.filter((t: any) => t.statut === 'propose')
  const unmatched = transactions.filter((t: any) => !t.facture_id && !t.ecriture_id && !t.lettre && t.statut !== 'propose')

  // Bank comptes for selector
  const uniqueBanques = Array.from(new Set(allTransactions.map((t: any) => t.banque).filter(Boolean))).sort()

  // Lettrage computed values (must be AFTER ecritures is defined)
  const ecritures401 = ecritures.filter((e: any) => e.compte?.startsWith('401') && !e.lettre)
  const ecritures411 = ecritures.filter((e: any) => e.compte?.startsWith('411') && !e.lettre)
  const ecrituresLettrage = [...ecritures401, ...ecritures411]
  const ecrituresLettrees = ecritures.filter((e: any) => e.lettre)

  const handleLettrer = async () => {
    if (!societeId || lettrageSelection.size < 2) return
    try {
      const ids = Array.from(lettrageSelection)
      await fetch("/api/comptable/rapprochement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lettrer_multi", ecriture_ids: ids, societe_id: societeId }),
      })
      setLettrageDialog(null)
      setLettrageSelection(new Set())
      load()
    } catch { alert("Erreur lettrage") }
  }

  const handleDelettrer = async (e: any) => {
    try {
      await fetch("/api/comptable/rapprochement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delettrer", ecriture_id: e.id }),
      })
      load()
    } catch { alert("Erreur") }
  }

  const handleAutoLettrage = async () => {
    if (!societeId) return
    setAutoLettraging(true)
    try {
      const toLetter: string[][] = []
      const used = new Set<string>()
      for (const e of ecrituresLettrage) {
        if (used.has(e.id)) continue
        const amount = Number(e.debit) > 0 ? Number(e.debit) : Number(e.credit)
        const isDebit = Number(e.debit) > 0
        const match = ecrituresLettrage.find((e2: any) => {
          if (e2.id === e.id || used.has(e2.id)) return false
          if (e2.compte !== e.compte) return false
          const amount2 = Number(e2.debit) > 0 ? Number(e2.debit) : Number(e2.credit)
          const isDebit2 = Number(e2.debit) > 0
          if (isDebit === isDebit2) return false
          return Math.abs(amount - amount2) <= 0.01
        })
        if (match) {
          toLetter.push([e.id, match.id])
          used.add(e.id)
          used.add(match.id)
        }
      }
      let lettered = 0
      for (const ids of toLetter) {
        await fetch("/api/comptable/rapprochement", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "lettrer_multi", ecriture_ids: ids, societe_id: societeId }),
        })
        lettered++
      }
      alert(`${lettered} paire(s) d'écritures lettrées automatiquement`)
      load()
    } catch { alert("Erreur auto-lettrage") }
    finally { setAutoLettraging(false) }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-[#0B0F2E]" /></div>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]">Rapprochement bancaire</h1>
          <p className="text-sm text-gray-500">Rapprocher les transactions avec les factures et ecritures</p>
        </div>
        <div className="flex gap-2 items-center">
          {societes.length > 0 && (
            <Select value={societeId || ""} onValueChange={v => setSocieteId(v)}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Société" /></SelectTrigger>
              <SelectContent>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4 mr-2" />Actualiser</Button>
          <Button onClick={handleAutoMatch} disabled={autoMatching} className="bg-[#0B0F2E]">
            <Zap className={`w-4 h-4 mr-2 ${autoMatching ? "animate-spin" : ""}`} />
            {autoMatching ? "Analyse..." : "Rapprochement auto"}
          </Button>
        </div>
      </div>

      {/* Month navigator + Compte selector */}
      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker value={selectedMois} onChange={setSelectedMois} />
        {uniqueBanques.length > 1 && (
          <Select value={selectedCompte} onValueChange={setSelectedCompte}>
            <SelectTrigger className="w-[180px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les comptes</SelectItem>
              {uniqueBanques.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Transactions</p><p className="text-2xl font-bold text-[#0B0F2E]">{transactions.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Rapprochées</p><p className="text-2xl font-bold text-green-600">{matched.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500">À valider</p><p className="text-2xl font-bold text-orange-600">{proposed.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Non rapprochées</p><p className="text-2xl font-bold text-red-600">{unmatched.length}</p></CardContent></Card>
      </div>

      {/* Tabs: Automatique + Manuel */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="auto"><Zap className="w-4 h-4 mr-1" />Automatique</TabsTrigger>
          <TabsTrigger value="manuel"><Link2 className="w-4 h-4 mr-1" />Manuel</TabsTrigger>
        </TabsList>

        {/* TAB: Automatique */}
        <TabsContent value="auto" className="space-y-4">
          {/* Rapprochées */}
          {matched.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-[#0B0F2E] flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-600" />Rapprochées ({matched.length})</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Montant</TableHead><TableHead>Tiers</TableHead><TableHead>Lettre</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {matched.map((tx: any) => (
                      <TableRow key={tx.id} className="bg-green-50/50">
                        <TableCell className="text-sm">{formatDate(tx.date)}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{tx.libelle}</TableCell>
                        <TableCell className="text-right font-medium">{tx.debit > 0 ? <span className="text-red-600">-{fmt(tx.debit)} {tx.devise}</span> : <span className="text-green-600">+{fmt(tx.credit)} {tx.devise}</span>}</TableCell>
                        <TableCell className="text-sm">{tx.tiers_detecte || "—"}</TableCell>
                        <TableCell><Badge className="bg-green-100 text-green-700">{tx.lettre || "OK"}</Badge></TableCell>
                        <TableCell><Button variant="ghost" size="sm" onClick={() => handleUnlink(tx)}><Unlink className="w-4 h-4 text-red-500" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Non rapprochées */}
          <Card>
            <CardHeader><CardTitle className="text-[#0B0F2E] flex items-center gap-2"><AlertCircle className="w-5 h-5 text-orange-500" />Non rapprochées ({unmatched.length})</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {unmatched.length === 0 ? (
                <div className="p-8 text-center text-gray-400">Toutes les transactions sont rapprochées</div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead><TableHead>Tiers</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {unmatched.map((tx: any) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-sm">{formatDate(tx.date)}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{tx.libelle}</TableCell>
                        <TableCell className="text-right text-sm text-red-600 font-medium">{tx.debit > 0 ? fmt(tx.debit) + " " + tx.devise : "—"}</TableCell>
                        <TableCell className="text-right text-sm text-green-600 font-medium">{tx.credit > 0 ? fmt(tx.credit) + " " + tx.devise : "—"}</TableCell>
                        <TableCell className="text-sm">{tx.tiers_detecte || "—"}</TableCell>
                        <TableCell><Button variant="outline" size="sm" onClick={() => setLinkDialog(tx)} className="gap-1"><Link2 className="w-3 h-3" />Lettrer</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Manuel */}
        <TabsContent value="manuel" className="space-y-4">
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Rechercher par libellé, tiers, montant..." className="pl-9" value={manualSearch} onChange={e => setManualSearch(e.target.value)} />
          </div>

          {/* Unmatched transactions for manual matching */}
          <Card>
            <CardHeader><CardTitle className="text-[#0B0F2E]">Transactions non rapprochées ({unmatched.length})</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {unmatched.length === 0 ? (
                <div className="p-8 text-center text-gray-400">Aucune transaction non rapprochée</div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead><TableHead>Tiers</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {unmatched
                      .filter(tx => {
                        if (!manualSearch) return true
                        const s = manualSearch.toLowerCase()
                        return tx.libelle?.toLowerCase().includes(s) || (tx.tiers_detecte || "").toLowerCase().includes(s) || String(tx.debit).includes(s) || String(tx.credit).includes(s)
                      })
                      .map((tx: any) => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-sm">{formatDate(tx.date)}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{tx.libelle}</TableCell>
                          <TableCell className="text-right text-sm text-red-600 font-medium">{tx.debit > 0 ? fmt(tx.debit) + " " + tx.devise : "—"}</TableCell>
                          <TableCell className="text-right text-sm text-green-600 font-medium">{tx.credit > 0 ? fmt(tx.credit) + " " + tx.devise : "—"}</TableCell>
                          <TableCell className="text-sm">{tx.tiers_detecte || "—"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="outline" size="sm" onClick={() => setLinkDialog(tx)} className="gap-1"><Link2 className="w-3 h-3" />Lettrer</Button>
                              <Button variant="outline" size="sm" onClick={() => { setPayeParNom("STEPHANE BACH"); setPayeParType("associe"); setLinkDialog(tx) }} className="gap-1 text-purple-600 border-purple-200 hover:bg-purple-50"><Users className="w-3 h-3" />Bach</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Factures en attente */}
          {factures.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-[#0B0F2E] flex items-center gap-2"><ArrowRightLeft className="w-5 h-5" style={{ color: "#D4AF37" }} />Factures en attente ({factures.length})</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>N°</TableHead><TableHead>Type</TableHead><TableHead>Tiers</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Montant TTC</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {factures.map((f: any) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.numero_facture || "—"}</TableCell>
                        <TableCell><Badge className={f.type_facture === "client" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}>{f.type_facture}</Badge></TableCell>
                        <TableCell className="text-sm">{f.tiers || "—"}</TableCell>
                        <TableCell className="text-sm">{formatDate(f.date_facture)}</TableCell>
                        <TableCell className="text-right font-bold">{fmt(Number(f.montant_ttc) || 0)} {f.devise || "MUR"}</TableCell>
                        <TableCell><Badge className="bg-orange-100 text-orange-700">{f.statut}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Lettrage écritures comptables (401/411) */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[#0B0F2E]">Lettrage écritures (401/411) — {ecrituresLettrage.length} non lettrées</CardTitle>
              <Button variant="outline" size="sm" onClick={handleAutoLettrage} disabled={autoLettraging}>
                <Zap className={`w-4 h-4 mr-1 ${autoLettraging ? "animate-spin" : ""}`} />
                {autoLettraging ? "Analyse..." : "Auto-lettrage"}
              </Button>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {ecrituresLettrage.length === 0 ? (
                <div className="p-8 text-center text-gray-400">Aucune écriture non lettrée en 401/411</div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Compte</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead><TableHead>Journal</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {ecrituresLettrage.slice(0, 50).map((e: any) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-sm">{formatDate(e.date_ecriture)}</TableCell>
                        <TableCell className="font-mono text-sm">{e.compte}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{e.libelle || "—"}</TableCell>
                        <TableCell className="text-right text-sm text-red-600 font-medium">{Number(e.debit) > 0 ? fmt(Number(e.debit)) : "—"}</TableCell>
                        <TableCell className="text-right text-sm text-green-600 font-medium">{Number(e.credit) > 0 ? fmt(Number(e.credit)) : "—"}</TableCell>
                        <TableCell className="text-sm">{e.journal || "—"}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => {
                            setLettrageDialog(e)
                            setLettrageSelection(new Set([e.id]))
                          }}><Link2 className="w-3 h-3 mr-1" />Lettrer</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Écritures lettrées */}
          {ecrituresLettrees.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-[#0B0F2E] flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-600" />Écritures lettrées ({ecrituresLettrees.length})</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Compte</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead><TableHead>Lettre</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {ecrituresLettrees.slice(0, 30).map((e: any) => (
                      <TableRow key={e.id} className="bg-green-50/50">
                        <TableCell className="text-sm">{formatDate(e.date_ecriture)}</TableCell>
                        <TableCell className="font-mono text-sm">{e.compte}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{e.libelle || "—"}</TableCell>
                        <TableCell className="text-right text-sm">{Number(e.debit) > 0 ? fmt(Number(e.debit)) : "—"}</TableCell>
                        <TableCell className="text-right text-sm">{Number(e.credit) > 0 ? fmt(Number(e.credit)) : "—"}</TableCell>
                        <TableCell><Badge className="bg-green-100 text-green-700">{e.lettre}</Badge></TableCell>
                        <TableCell><Button variant="ghost" size="sm" onClick={() => handleDelettrer(e)}><Unlink className="w-4 h-4 text-red-500" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Lettrage dialog */}
      <Dialog open={!!lettrageDialog} onOpenChange={o => { if (!o) { setLettrageDialog(null); setLettrageSelection(new Set()) } }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Lettrer les écritures</DialogTitle></DialogHeader>
          {lettrageDialog && (
            <div className="space-y-3">
              <div className="p-3 bg-blue-50 rounded-lg text-sm">
                <p className="font-medium">{lettrageDialog.compte} — {lettrageDialog.libelle}</p>
                <p className="text-gray-500">{formatDate(lettrageDialog.date_ecriture)} — {Number(lettrageDialog.debit) > 0 ? `${fmt(Number(lettrageDialog.debit))} Débit` : `${fmt(Number(lettrageDialog.credit))} Crédit`}</p>
              </div>
              <p className="text-sm font-medium">Sélectionnez les écritures à lettrer ensemble :</p>
              <div className="space-y-1 max-h-[300px] overflow-y-auto">
                {ecrituresLettrage
                  .filter((e: any) => e.compte === lettrageDialog.compte && e.id !== lettrageDialog.id)
                  .map((e: any) => {
                    const selected = lettrageSelection.has(e.id)
                    return (
                      <div key={e.id} onClick={() => {
                        const next = new Set(lettrageSelection)
                        if (next.has(e.id)) next.delete(e.id); else next.add(e.id)
                        setLettrageSelection(next)
                      }} className={`p-2 border rounded cursor-pointer ${selected ? "border-green-400 bg-green-50" : "border-gray-200 hover:bg-gray-50"}`}>
                        <div className="flex justify-between text-sm">
                          <span>{formatDate(e.date_ecriture)} — {e.libelle || "—"}</span>
                          <span className="font-bold">{Number(e.debit) > 0 ? fmt(Number(e.debit)) + " D" : fmt(Number(e.credit)) + " C"}</span>
                        </div>
                      </div>
                    )
                  })}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setLettrageDialog(null); setLettrageSelection(new Set()) }}>Annuler</Button>
                <Button className="bg-[#0B0F2E]" onClick={handleLettrer} disabled={lettrageSelection.size < 2}>
                  <Link2 className="w-4 h-4 mr-1" />Lettrer ({lettrageSelection.size} écritures)
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog lettrage manuel */}
      <Dialog open={!!linkDialog} onOpenChange={(o) => { if (!o) setLinkDialog(null) }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Lettrer manuellement</DialogTitle></DialogHeader>
          {linkDialog && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg text-sm">
                <p className="font-medium">{linkDialog.libelle}</p>
                <p className="text-gray-500">{formatDate(linkDialog.date)} — {linkDialog.debit > 0 ? `-${fmt(linkDialog.debit)}` : `+${fmt(linkDialog.credit)}`} {linkDialog.devise}</p>
              </div>

              {factures.length > 0 && (
                <>
                  <p className="text-sm font-medium">Factures en attente :</p>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {factures.map((f: any) => {
                      const txAmount = linkDialog.debit > 0 ? linkDialog.debit : linkDialog.credit
                      const fAmount = Number(f.montant_ttc) || 0
                      const isClose = Math.abs(txAmount - fAmount) <= fAmount * 0.05
                      return (
                        <div key={f.id} onClick={() => handleManualLink(linkDialog, f, "facture")}
                          className={`p-3 border rounded-lg cursor-pointer hover:bg-blue-50 ${isClose ? "border-green-300 bg-green-50" : "border-gray-200"}`}>
                          <div className="flex justify-between">
                            <div><p className="font-medium text-sm">{f.numero_facture || "---"} <Badge className="text-xs ml-1">{f.type_facture}</Badge></p><p className="text-xs text-gray-500">{f.tiers}</p></div>
                            <div className="text-right"><p className="font-bold text-sm">{fmt(fAmount)} {f.devise}</p>{isClose && <Badge className="bg-green-100 text-green-700 text-xs">Proche</Badge>}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {/* Paye par associe / collaborateur */}
              {factures.length > 0 && (
                <div className="border-t pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-purple-600" />
                    <p className="text-sm font-medium">Facture payee par un associe ou collaborateur</p>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    Si cette facture n'a PAS ete payee via le compte bancaire mais par un associe ou collaborateur
                    avec ses fonds personnels, selectionnez la facture ci-dessous.
                  </p>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <Label className="text-xs">Type</Label>
                      <Select value={payeParType} onValueChange={setPayeParType}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="associe">Associe (455)</SelectItem>
                          <SelectItem value="collaborateur">Collaborateur (467)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Nom</Label>
                      <Input className="h-8 text-xs" value={payeParNom} onChange={e => setPayeParNom(e.target.value)} placeholder="Nom de la personne" />
                    </div>
                  </div>
                  {payeParNom && (
                    <div className="space-y-2 max-h-[150px] overflow-y-auto">
                      {factures.map((f: any) => {
                        const fAmount = Number(f.montant_ttc) || 0
                        return (
                          <div key={`cca-${f.id}`} onClick={() => handlePayeParAssocie(f)}
                            className="p-3 border border-purple-200 rounded-lg cursor-pointer hover:bg-purple-50">
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="font-medium text-sm">{f.numero_facture || "---"} <Badge className="text-xs ml-1 bg-purple-100 text-purple-700">{payeParType === 'associe' ? 'Associe' : 'Collaborateur'}</Badge></p>
                                <p className="text-xs text-gray-500">{f.tiers} — paye par {payeParNom}</p>
                              </div>
                              <p className="font-bold text-sm">{fmt(fAmount)} {f.devise}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              <p className="text-sm font-medium">Ecritures comptables :</p>
              {ecritures.length === 0 ? (
                <p className="text-sm text-gray-400">Aucune ecriture non lettree</p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {ecritures.map((e: any) => {
                    const txAmount = linkDialog.debit > 0 ? linkDialog.debit : linkDialog.credit
                    const eAmount = Number(e.debit) > 0 ? Number(e.debit) : Number(e.credit)
                    const isClose = eAmount > 0 && Math.abs(txAmount - eAmount) <= Math.max(eAmount * 0.05, 1)
                    return (
                      <div key={e.id} onClick={() => handleManualLink(linkDialog, e, "ecriture")}
                        className={`p-3 border rounded-lg cursor-pointer hover:bg-purple-50 ${isClose ? "border-green-300 bg-green-50" : "border-gray-200"}`}>
                        <div className="flex justify-between">
                          <div><p className="font-medium text-sm">{e.compte} — {e.libelle || "—"}</p><p className="text-xs text-gray-500">{formatDate(e.date_ecriture)} — {e.journal}</p></div>
                          <div className="text-right"><p className="font-bold text-sm">{Number(e.debit) > 0 ? fmt(Number(e.debit)) + " D" : fmt(Number(e.credit)) + " C"}</p>{isClose && <Badge className="bg-green-100 text-green-700 text-xs">Proche</Badge>}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Bach fallback suggestion */}
              <div className="border-t pt-4">
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <p className="text-sm font-medium text-purple-800 flex items-center gap-2">
                    <Users className="w-4 h-4" />Assigner au compte courant de STEPHANE BACH ?
                  </p>
                  <p className="text-xs text-purple-600 mt-1">
                    Si cette opération a été payée par l&apos;associé avec ses fonds personnels
                  </p>
                  <Button size="sm" className="mt-2 bg-purple-600 hover:bg-purple-700 text-white" onClick={() => {
                    setPayeParNom("STEPHANE BACH")
                    setPayeParType("associe")
                    if (factures.length > 0) {
                      // Find closest facture match
                      const txAmount = linkDialog.debit > 0 ? linkDialog.debit : linkDialog.credit
                      const closest = factures.sort((a: any, b: any) => Math.abs((Number(a.montant_ttc) || 0) - txAmount) - Math.abs((Number(b.montant_ttc) || 0) - txAmount))[0]
                      if (closest) handlePayeParAssocie(closest)
                    }
                  }}>
                    Assigner à Bach
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
