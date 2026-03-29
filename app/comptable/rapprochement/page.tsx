"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, RefreshCw, Link2, Unlink, Zap, CheckCircle2, AlertCircle, ArrowRightLeft } from "lucide-react"

function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function formatDate(d: string) { return d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—" }

interface Societe { id: string; nom: string }

export default function RapprochementPage() {
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState("all")
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [autoMatching, setAutoMatching] = useState(false)
  const [linkDialog, setLinkDialog] = useState<any>(null)

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  const load = useCallback(async () => {
    if (selectedSociete === "all") { setData(null); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/comptable/rapprochement?societe_id=${selectedSociete}`)
      setData(await res.json())
    } catch { setData(null) }
    finally { setLoading(false) }
  }, [selectedSociete])

  useEffect(() => { load() }, [load])

  const handleAutoMatch = async () => {
    if (!selectedSociete || selectedSociete === "all") return
    setAutoMatching(true)
    try {
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto_rapprocher", societe_id: selectedSociete }),
      })
      const d = await res.json()
      alert(`${d.matched} transaction(s) rapprochee(s) automatiquement`)
      load()
    } catch { alert("Erreur rapprochement auto") }
    finally { setAutoMatching(false) }
  }

  const handleManualLink = async (tx: any, target: any, type: 'facture' | 'ecriture') => {
    try {
      await fetch("/api/comptable/rapprochement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "lettrer_manuel",
          transaction_id: tx.id,
          releve_id: tx.releve_id,
          facture_id: type === 'facture' ? target.id : undefined,
          ecriture_id: type === 'ecriture' ? target.id : undefined,
          societe_id: selectedSociete,
        }),
      })
      setLinkDialog(null)
      load()
    } catch { alert("Erreur lettrage") }
  }

  const handleUnlink = async (tx: any) => {
    try {
      await fetch("/api/comptable/rapprochement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delettrer", transaction_id: tx.id, releve_id: tx.releve_id, facture_id: tx.facture_id }),
      })
      load()
    } catch { alert("Erreur delettrage") }
  }

  const transactions = data?.bankTransactions || []
  const factures = data?.factures || []
  const ecritures = (data?.ecritures || []).filter((e: any) => !e.lettre)
  const matched = transactions.filter((t: any) => t.facture_id)
  const unmatched = transactions.filter((t: any) => !t.facture_id)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Rapprochement bancaire</h1>
          <p className="text-sm text-gray-500">Rapprocher transactions bancaires et factures — lettrage auto et manuel</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading || selectedSociete === "all"}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />Actualiser
          </Button>
          <Button onClick={handleAutoMatch} disabled={autoMatching || selectedSociete === "all"} className="bg-[#1E2A4A]">
            <Zap className={`w-4 h-4 mr-2 ${autoMatching ? "animate-spin" : ""}`} />
            {autoMatching ? "Analyse..." : "Rapprochement auto"}
          </Button>
        </div>
      </div>

      <div className="w-72">
        <Select value={selectedSociete} onValueChange={setSelectedSociete}>
          <SelectTrigger><SelectValue placeholder="Choisir une societe..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">-- Choisir une societe --</SelectItem>
            {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {selectedSociete === "all" ? (
        <Card><CardContent className="py-16 text-center text-gray-400">Selectionnez une societe</CardContent></Card>
      ) : loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-[#1E2A4A]" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Transactions</p><p className="text-2xl font-bold text-[#1E2A4A]">{transactions.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Rapprochees</p><p className="text-2xl font-bold text-green-600">{matched.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Non rapprochees</p><p className="text-2xl font-bold text-red-600">{unmatched.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Factures en attente</p><p className="text-2xl font-bold text-orange-600">{factures.length}</p></CardContent></Card>
          </div>

          {/* Rapprochees */}
          {matched.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-[#1E2A4A] flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-600" />Rapprochees ({matched.length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Libelle</TableHead><TableHead className="text-right">Montant</TableHead><TableHead>Tiers</TableHead><TableHead>Lettre</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {matched.map((tx: any) => (
                      <TableRow key={tx.id} className="bg-green-50/50">
                        <TableCell className="text-sm">{formatDate(tx.date)}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{tx.libelle}</TableCell>
                        <TableCell className="text-right font-medium">{tx.debit > 0 ? <span className="text-red-600">-{fmt(tx.debit)} {tx.devise}</span> : <span className="text-green-600">+{fmt(tx.credit)} {tx.devise}</span>}</TableCell>
                        <TableCell className="text-sm">{tx.tiers_detecte || "—"}</TableCell>
                        <TableCell><Badge className="bg-green-100 text-green-700">{tx.lettre}</Badge></TableCell>
                        <TableCell><Button variant="ghost" size="sm" onClick={() => handleUnlink(tx)} title="Delettrer"><Unlink className="w-4 h-4 text-red-500" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Non rapprochees */}
          <Card>
            <CardHeader><CardTitle className="text-[#1E2A4A] flex items-center gap-2"><AlertCircle className="w-5 h-5 text-orange-500" />Non rapprochees ({unmatched.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              {unmatched.length === 0 ? (
                <div className="p-8 text-center text-gray-400">Toutes les transactions sont rapprochees</div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Banque</TableHead><TableHead>Libelle</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead>Tiers</TableHead><TableHead>Compte</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {unmatched.map((tx: any) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-sm">{formatDate(tx.date)}</TableCell>
                        <TableCell><Badge variant="outline" style={{ borderColor: "#C9A84C" }}>{tx.banque}</Badge></TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{tx.libelle}</TableCell>
                        <TableCell className="text-right text-sm text-red-600 font-medium">{tx.debit > 0 ? fmt(tx.debit) : "—"}</TableCell>
                        <TableCell className="text-right text-sm text-green-600 font-medium">{tx.credit > 0 ? fmt(tx.credit) : "—"}</TableCell>
                        <TableCell className="text-sm">{tx.tiers_detecte || <span className="text-gray-400 italic">—</span>}</TableCell>
                        <TableCell className="font-mono text-sm text-gray-500">{tx.compte_comptable || "—"}</TableCell>
                        <TableCell><Button variant="outline" size="sm" onClick={() => setLinkDialog(tx)} className="gap-1"><Link2 className="w-3 h-3" />Lettrer</Button></TableCell>
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
              <CardHeader><CardTitle className="text-[#1E2A4A] flex items-center gap-2"><ArrowRightLeft className="w-5 h-5" style={{ color: "#C9A84C" }} />Factures en attente ({factures.length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>N° Facture</TableHead><TableHead>Type</TableHead><TableHead>Tiers</TableHead><TableHead>Date</TableHead><TableHead>Echeance</TableHead><TableHead className="text-right">Montant TTC</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {factures.map((f: any) => (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.numero_facture || "—"}</TableCell>
                        <TableCell><Badge className={f.type_facture === "client" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}>{f.type_facture === "client" ? "Client" : "Fournisseur"}</Badge></TableCell>
                        <TableCell className="text-sm">{f.tiers || "—"}</TableCell>
                        <TableCell className="text-sm">{formatDate(f.date_facture)}</TableCell>
                        <TableCell className="text-sm">{formatDate(f.date_echeance)}</TableCell>
                        <TableCell className="text-right font-bold">{fmt(Number(f.montant_ttc) || 0)} {f.devise || "MUR"}</TableCell>
                        <TableCell><Badge className={f.statut === "retard" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}>{f.statut === "retard" ? "En retard" : "En attente"}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Dialog lettrage manuel */}
      <Dialog open={!!linkDialog} onOpenChange={(o) => { if (!o) setLinkDialog(null) }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Lettrer manuellement</DialogTitle></DialogHeader>
          {linkDialog && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg text-sm">
                <p className="font-medium">{linkDialog.libelle}</p>
                <p className="text-gray-500">{formatDate(linkDialog.date)} — {linkDialog.debit > 0 ? `-${fmt(linkDialog.debit)}` : `+${fmt(linkDialog.credit)}`} {linkDialog.devise}</p>
                {linkDialog.tiers_detecte && <p className="text-gray-500">Tiers: {linkDialog.tiers_detecte}</p>}
              </div>
              {/* Factures */}
              {factures.length > 0 && (
                <>
                  <p className="text-sm font-medium">Factures en attente :</p>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {factures.map((f: any) => {
                      const txAmount = linkDialog.debit > 0 ? linkDialog.debit : linkDialog.credit
                      const fAmount = Number(f.montant_ttc) || 0
                      const isClose = Math.abs(txAmount - fAmount) <= fAmount * 0.02
                      return (
                        <div key={f.id} onClick={() => handleManualLink(linkDialog, f, 'facture')}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-blue-50 ${isClose ? "border-green-300 bg-green-50" : "border-gray-200"}`}>
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-medium text-sm">{f.numero_facture || "Sans numero"} <Badge className="bg-blue-100 text-blue-700 text-xs ml-1">{f.type_facture}</Badge></p>
                              <p className="text-xs text-gray-500">{f.tiers || "—"} — {formatDate(f.date_facture)}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-sm">{fmt(fAmount)} {f.devise || "MUR"}</p>
                              {isClose && <Badge className="bg-green-100 text-green-700 text-xs">Montant proche</Badge>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {/* Ecritures comptables */}
              <p className="text-sm font-medium mt-2">Ecritures comptables non lettrees :</p>
              {ecritures.length === 0 ? (
                <p className="text-sm text-gray-400">Aucune ecriture non lettree</p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {ecritures.map((e: any) => {
                    const txAmount = linkDialog.debit > 0 ? linkDialog.debit : linkDialog.credit
                    const eAmount = Number(e.debit) > 0 ? Number(e.debit) : Number(e.credit)
                    const isClose = Math.abs(txAmount - eAmount) <= Math.max(eAmount * 0.02, 1)
                    return (
                      <div key={e.id} onClick={() => handleManualLink(linkDialog, e, 'ecriture')}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-purple-50 ${isClose ? "border-green-300 bg-green-50" : "border-gray-200"}`}>
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-medium text-sm">{e.compte} — {e.libelle || "—"}</p>
                            <p className="text-xs text-gray-500">{formatDate(e.date_ecriture)} — {e.journal || "—"}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-sm">{Number(e.debit) > 0 ? fmt(Number(e.debit)) + " D" : fmt(Number(e.credit)) + " C"}</p>
                            {isClose && <Badge className="bg-green-100 text-green-700 text-xs">Montant proche</Badge>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
