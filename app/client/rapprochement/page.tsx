"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, RefreshCw, Link2, Unlink, Zap, CheckCircle2, AlertCircle, ArrowRightLeft, Users } from "lucide-react"

function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function formatDate(d: string) { return d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—" }

export default function ClientRapprochementPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [autoMatching, setAutoMatching] = useState(false)
  const [linkDialog, setLinkDialog] = useState<any>(null)
  const [societeId, setSocieteId] = useState<string | null>(null)
  const [payeParAssocie, setPayeParAssocie] = useState(false)
  const [payeParType, setPayeParType] = useState("associe")
  const [payeParNom, setPayeParNom] = useState("")

  // Get societe_id from client/societes
  useEffect(() => {
    fetch("/api/client/societes").then(r => r.json()).then(d => {
      const s = d.societes || []
      if (s.length > 0) setSocieteId(s[0].id)
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

  const transactions = data?.bankTransactions || []
  const factures = data?.factures || []
  const ecritures = (data?.ecritures || []).filter((e: any) => !e.lettre)
  const matched = transactions.filter((t: any) => t.facture_id || t.ecriture_id)
  const unmatched = transactions.filter((t: any) => !t.facture_id && !t.ecriture_id)

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-[#1E2A4A]" /></div>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Rapprochement bancaire</h1>
          <p className="text-sm text-gray-500">Rapprocher les transactions avec les factures et ecritures</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4 mr-2" />Actualiser</Button>
          <Button onClick={handleAutoMatch} disabled={autoMatching} className="bg-[#1E2A4A]">
            <Zap className={`w-4 h-4 mr-2 ${autoMatching ? "animate-spin" : ""}`} />
            {autoMatching ? "Analyse..." : "Rapprochement auto"}
          </Button>
        </div>
      </div>

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
                    <TableCell><Button variant="ghost" size="sm" onClick={() => handleUnlink(tx)}><Unlink className="w-4 h-4 text-red-500" /></Button></TableCell>
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
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Libelle</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead>Tiers</TableHead><TableHead>Compte</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {unmatched.map((tx: any) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-sm">{formatDate(tx.date)}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{tx.libelle}</TableCell>
                    <TableCell className="text-right text-sm text-red-600 font-medium">{tx.debit > 0 ? fmt(tx.debit) + " " + tx.devise : "—"}</TableCell>
                    <TableCell className="text-right text-sm text-green-600 font-medium">{tx.credit > 0 ? fmt(tx.credit) + " " + tx.devise : "—"}</TableCell>
                    <TableCell className="text-sm">{tx.tiers_detecte || "—"}</TableCell>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
