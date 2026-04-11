"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, RefreshCw, Link2, Unlink, Zap, CheckCircle2, AlertCircle, ArrowRightLeft, History, BrainCircuit } from "lucide-react"

function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function formatDate(d: string) { return d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—" }
function formatDateTime(d: string) {
  if (!d) return "—"
  const dt = new Date(d)
  return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
    + " " + dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}

interface Societe { id: string; nom: string }

export default function RapprochementPage() {
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState("all")
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [autoMatching, setAutoMatching] = useState(false)
  const [applyingPatterns, setApplyingPatterns] = useState(false)
  const [linkDialog, setLinkDialog] = useState<any>(null)
  const [auditDialog, setAuditDialog] = useState(false)
  const [auditEntries, setAuditEntries] = useState<any[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Multi-facture selection state (resets when dialog closes)
  const [selectedFactureIds, setSelectedFactureIds] = useState<Set<string>>(new Set())
  const [selectedEcritureId, setSelectedEcritureId] = useState<string | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => {
      const s = d.societes || []
      setSocietes(s)
      if (s.length === 1) setSelectedSociete(s[0].id)
    })
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

  // Reset selection when dialog opens on a new transaction
  useEffect(() => {
    setSelectedFactureIds(new Set())
    setSelectedEcritureId(null)
  }, [linkDialog?.id])

  const handleAutoMatch = async () => {
    if (!selectedSociete || selectedSociete === "all") return
    setAutoMatching(true)
    try {
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto_rapprocher", societe_id: selectedSociete }),
      })
      const d = await res.json()
      showToast(`${d.matched || 0} transaction(s) rapprochée(s) automatiquement`)
      load()
    } catch { showToast("Erreur rapprochement auto", 'error') }
    finally { setAutoMatching(false) }
  }

  const handleApplyPatterns = async () => {
    if (!selectedSociete || selectedSociete === "all") return
    setApplyingPatterns(true)
    try {
      const res = await fetch("/api/comptable/rapprochement/patterns", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", societe_id: selectedSociete }),
      })
      const d = await res.json()
      if (!res.ok) { showToast(d.error || "Erreur application patterns", 'error'); return }
      showToast(`${d.matched || 0} transaction(s) rapprochée(s) via patterns mémorisés`)
      load()
    } catch (e: any) { showToast("Erreur patterns: " + (e?.message || ""), 'error') }
    finally { setApplyingPatterns(false) }
  }

  const handleOpenAudit = async () => {
    if (!selectedSociete || selectedSociete === "all") return
    setAuditDialog(true)
    setAuditLoading(true)
    try {
      const res = await fetch(`/api/comptable/rapprochement/audit?societe_id=${selectedSociete}&limit=200`)
      const d = await res.json()
      setAuditEntries(d.entries || [])
      if (d.migrated === false) {
        showToast("Historique non disponible — migration 126 à appliquer", 'error')
      }
    } catch { setAuditEntries([]) }
    finally { setAuditLoading(false) }
  }

  // Single-facture manual lettrage (legacy single-click flow)
  const handleSingleLink = async (tx: any, target: any, type: 'facture' | 'ecriture') => {
    try {
      const res = await fetch("/api/comptable/rapprochement", {
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
      const d = await res.json()
      if (!res.ok) { showToast(d.error || "Erreur lettrage", 'error'); return }
      setLinkDialog(null)
      showToast(`Lettrage effectué (${d.lettre})`)
      load()
    } catch (e: any) { showToast("Erreur lettrage: " + (e?.message || ""), 'error') }
  }

  // Confirm the multi-facture selection from the dialog
  const handleConfirmMulti = async () => {
    if (!linkDialog || selectedFactureIds.size === 0) return
    // Single facture → legacy endpoint (already works + atomic)
    if (selectedFactureIds.size === 1 && !selectedEcritureId) {
      const fId = Array.from(selectedFactureIds)[0]
      const f = factures.find((x: any) => x.id === fId)
      if (f) return handleSingleLink(linkDialog, f, 'facture')
    }
    // Multi facture → lettrer_multi endpoint
    try {
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "lettrer_multi",
          transaction_id: linkDialog.id,
          releve_id: linkDialog.releve_id,
          facture_ids: Array.from(selectedFactureIds),
          societe_id: selectedSociete,
        }),
      })
      const d = await res.json()
      if (!res.ok) { showToast(d.error || "Erreur lettrage multi", 'error'); return }
      setLinkDialog(null)
      showToast(`${selectedFactureIds.size} facture(s) lettrée(s) — écart ${d.ecart?.toFixed(2) || 0}`)
      load()
    } catch (e: any) { showToast("Erreur lettrage: " + (e?.message || ""), 'error') }
  }

  const handleUnlink = async (tx: any) => {
    try {
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delettrer",
          transaction_id: tx.id,
          releve_id: tx.releve_id,
          facture_id: tx.facture_id,
          ecriture_id: tx.ecriture_id,
          societe_id: selectedSociete,
        }),
      })
      const d = await res.json()
      if (!res.ok) { showToast(d.error || "Erreur délettrage", 'error'); return }
      showToast("Délettrage effectué")
      load()
    } catch (e: any) { showToast("Erreur délettrage: " + (e?.message || ""), 'error') }
  }

  const transactions = data?.bankTransactions || []
  const factures = data?.factures || []
  const ecritures = (data?.ecritures || []).filter((e: any) => !e.lettre)
  const matched = transactions.filter((t: any) => t.facture_id || (Array.isArray(t.facture_ids) && t.facture_ids.length > 0))
  const unmatched = transactions.filter((t: any) => !(t.facture_id || (Array.isArray(t.facture_ids) && t.facture_ids.length > 0)))

  // Compute selected totals for the multi-facture dialog
  const selectedTotal = useMemo(() => {
    return factures
      .filter((f: any) => selectedFactureIds.has(f.id))
      .reduce((s: number, f: any) => s + (Number(f.montant_ttc) || 0), 0)
  }, [selectedFactureIds, factures])

  const txAmount = linkDialog ? (Number(linkDialog.debit) > 0 ? Number(linkDialog.debit) : Number(linkDialog.credit)) : 0
  const ecart = Math.abs(txAmount - selectedTotal)
  const ecartPct = txAmount > 0 ? ecart / txAmount : 0

  return (
    <div className="p-6 space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]">Rapprochement bancaire</h1>
          <p className="text-sm text-gray-500">Lettrage auto, multi-factures, patterns mémorisés et historique d'audit</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading || selectedSociete === "all"}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />Actualiser
          </Button>
          <Button variant="outline" onClick={handleOpenAudit} disabled={selectedSociete === "all"}>
            <History className="w-4 h-4 mr-2" />Historique
          </Button>
          <Button variant="outline" onClick={handleApplyPatterns} disabled={applyingPatterns || selectedSociete === "all"}>
            <BrainCircuit className={`w-4 h-4 mr-2 ${applyingPatterns ? "animate-spin" : ""}`} style={{ color: "#D4AF37" }} />
            {applyingPatterns ? "Application..." : "Appliquer patterns"}
          </Button>
          <Button onClick={handleAutoMatch} disabled={autoMatching || selectedSociete === "all"} className="bg-[#0B0F2E]">
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
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-[#0B0F2E]" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Transactions</p><p className="text-2xl font-bold text-[#0B0F2E]">{transactions.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Rapprochees</p><p className="text-2xl font-bold text-green-600">{matched.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Non rapprochees</p><p className="text-2xl font-bold text-red-600">{unmatched.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Factures en attente</p><p className="text-2xl font-bold text-orange-600">{factures.length}</p></CardContent></Card>
          </div>

          {/* Rapprochees */}
          {matched.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-[#0B0F2E] flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-600" />Rapprochees ({matched.length})</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Libelle</TableHead><TableHead className="text-right">Montant</TableHead><TableHead>Tiers</TableHead><TableHead>Lettre</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {matched.map((tx: any) => {
                      const debitNum = Number(tx.debit) || 0
                      const creditNum = Number(tx.credit) || 0
                      const isRefund = debitNum < 0 || creditNum < 0
                      return (
                        <TableRow key={tx.id} className="bg-green-50/50">
                          <TableCell className="text-sm">{formatDate(tx.date)}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{tx.libelle}</TableCell>
                          <TableCell className="text-right font-medium">
                            {debitNum > 0 ? <span className="text-red-600">-{fmt(debitNum)} {tx.devise}</span>
                              : creditNum > 0 ? <span className="text-green-600">+{fmt(creditNum)} {tx.devise}</span>
                              : isRefund ? <span className="text-blue-600">{debitNum < 0 ? "+" : "-"}{fmt(Math.abs(debitNum || creditNum))} {tx.devise}</span>
                              : <span className="text-gray-400">0</span>
                            }
                          </TableCell>
                          <TableCell className="text-sm">{tx.tiers_detecte || "—"}</TableCell>
                          <TableCell>
                            <Badge className="bg-green-100 text-green-700">{tx.lettre}</Badge>
                            {tx.rapprochement_multi && (
                              <Badge className="ml-1 bg-blue-100 text-blue-700">{tx.nb_factures}×</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => handleUnlink(tx)} title="Delettrer">
                              <Unlink className="w-4 h-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Non rapprochees */}
          <Card>
            <CardHeader><CardTitle className="text-[#0B0F2E] flex items-center gap-2"><AlertCircle className="w-5 h-5 text-orange-500" />Non rapprochees ({unmatched.length})</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {unmatched.length === 0 ? (
                <div className="p-8 text-center text-gray-400">Toutes les transactions sont rapprochees</div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Banque</TableHead><TableHead>Libelle</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead>Tiers</TableHead><TableHead>Compte</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {unmatched.map((tx: any) => {
                      const debitNum = Number(tx.debit) || 0
                      const creditNum = Number(tx.credit) || 0
                      const isRefund = debitNum < 0 || creditNum < 0
                      return (
                        <TableRow key={tx.id}>
                          <TableCell className="text-sm">{formatDate(tx.date)}</TableCell>
                          <TableCell><Badge variant="outline" style={{ borderColor: "#D4AF37" }}>{tx.banque}</Badge></TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">
                            {tx.libelle}
                            {isRefund && <Badge className="ml-2 bg-blue-100 text-blue-700 text-[10px]">Remboursement</Badge>}
                          </TableCell>
                          <TableCell className="text-right text-sm text-red-600 font-medium">{debitNum > 0 ? fmt(debitNum) : debitNum < 0 ? fmt(debitNum) : "—"}</TableCell>
                          <TableCell className="text-right text-sm text-green-600 font-medium">{creditNum > 0 ? fmt(creditNum) : creditNum < 0 ? fmt(creditNum) : "—"}</TableCell>
                          <TableCell className="text-sm">{tx.tiers_detecte || <span className="text-gray-400 italic">—</span>}</TableCell>
                          <TableCell className="font-mono text-sm text-gray-500">{tx.compte_comptable || "—"}</TableCell>
                          <TableCell><Button variant="outline" size="sm" onClick={() => setLinkDialog(tx)} className="gap-1"><Link2 className="w-3 h-3" />Lettrer</Button></TableCell>
                        </TableRow>
                      )
                    })}
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

      {/* Dialog lettrage manuel — multi-facture + ecriture */}
      <Dialog open={!!linkDialog} onOpenChange={(o) => { if (!o) setLinkDialog(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Lettrer manuellement (multi-facture supporté)</DialogTitle></DialogHeader>
          {linkDialog && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg text-sm">
                <p className="font-medium">{linkDialog.libelle}</p>
                <p className="text-gray-500">
                  {formatDate(linkDialog.date)} — {Number(linkDialog.debit) > 0 ? `-${fmt(Number(linkDialog.debit))}` : `+${fmt(Number(linkDialog.credit))}`} {linkDialog.devise}
                </p>
                {linkDialog.tiers_detecte && <p className="text-gray-500">Tiers: {linkDialog.tiers_detecte}</p>}
              </div>

              {/* Multi-facture selection */}
              {factures.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Factures en attente (cochez pour sélectionner plusieurs) :</p>
                    <Badge variant="outline" className="text-xs">
                      {selectedFactureIds.size} sélectionnée(s)
                    </Badge>
                  </div>
                  <div className="space-y-2 max-h-[280px] overflow-y-auto border rounded-lg p-2">
                    {factures.map((f: any) => {
                      const fAmount = Number(f.montant_ttc) || 0
                      const isChecked = selectedFactureIds.has(f.id)
                      const isClose = !isChecked && Math.abs(txAmount - fAmount) <= Math.max(fAmount * 0.02, 1)
                      return (
                        <label
                          key={f.id}
                          className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors
                            ${isChecked ? "bg-blue-50 border-blue-400" : isClose ? "border-green-300 bg-green-50" : "border-gray-200 hover:bg-gray-50"}`}
                        >
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              setSelectedFactureIds(prev => {
                                const next = new Set(prev)
                                if (checked) next.add(f.id)
                                else next.delete(f.id)
                                return next
                              })
                            }}
                          />
                          <div className="flex-1 flex justify-between items-center">
                            <div>
                              <p className="font-medium text-sm">
                                {f.numero_facture || "Sans numéro"}
                                <Badge className="bg-blue-100 text-blue-700 text-xs ml-1">{f.type_facture}</Badge>
                              </p>
                              <p className="text-xs text-gray-500">{f.tiers || "—"} — {formatDate(f.date_facture)}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-sm">{fmt(fAmount)} {f.devise || "MUR"}</p>
                              {isClose && <Badge className="bg-green-100 text-green-700 text-xs">Montant proche</Badge>}
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>

                  {/* Sum vs tx amount display */}
                  {selectedFactureIds.size > 0 && (
                    <div className={`p-3 rounded-lg border ${ecartPct < 0.02 ? "bg-emerald-50 border-emerald-300" : ecartPct < 0.08 ? "bg-yellow-50 border-yellow-300" : "bg-red-50 border-red-300"}`}>
                      <div className="flex justify-between text-sm">
                        <span>Montant transaction :</span>
                        <span className="font-mono font-bold">{fmt(txAmount)} {linkDialog.devise}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Somme factures sélectionnées :</span>
                        <span className="font-mono font-bold">{fmt(selectedTotal)}</span>
                      </div>
                      <div className="flex justify-between text-sm pt-1 border-t mt-1">
                        <span>Écart :</span>
                        <span className="font-mono font-bold">
                          {fmt(ecart)} ({(ecartPct * 100).toFixed(1)}%)
                          {ecartPct >= 0.02 && ecartPct <= 0.06 && (
                            <span className="ml-2 text-xs text-amber-700">(probable TDS/retenue)</span>
                          )}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setLinkDialog(null)}>Annuler</Button>
                    <Button
                      className="bg-[#0B0F2E]"
                      disabled={selectedFactureIds.size === 0}
                      onClick={handleConfirmMulti}
                    >
                      Lettrer {selectedFactureIds.size > 1 ? `${selectedFactureIds.size} factures` : "la facture"}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400">Aucune facture en attente</p>
              )}

              {/* Ecritures comptables (fallback single-click) */}
              <div className="pt-4 border-t">
                <p className="text-sm font-medium mb-2">Ou lettrer sur une écriture comptable non lettrée :</p>
                {ecritures.length === 0 ? (
                  <p className="text-sm text-gray-400">Aucune écriture non lettrée</p>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {ecritures.map((e: any) => {
                      const eAmount = Number(e.debit) > 0 ? Number(e.debit) : Number(e.credit)
                      const isClose = Math.abs(txAmount - eAmount) <= Math.max(eAmount * 0.02, 1)
                      return (
                        <div
                          key={e.id}
                          onClick={() => handleSingleLink(linkDialog, e, 'ecriture')}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-purple-50 ${isClose ? "border-green-300 bg-green-50" : "border-gray-200"}`}
                        >
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
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Audit log dialog */}
      <Dialog open={auditDialog} onOpenChange={setAuditDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Historique des rapprochements</DialogTitle></DialogHeader>
          {auditLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#0B0F2E]" /></div>
          ) : auditEntries.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Aucun historique disponible</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Lettre</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Raison</TableHead>
                  <TableHead>Utilisateur</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs whitespace-nowrap">{formatDateTime(entry.created_at)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{entry.action}</Badge></TableCell>
                    <TableCell><span className="font-mono text-xs">{entry.lettre_code || "—"}</span></TableCell>
                    <TableCell className="text-right font-mono text-sm">{entry.montant ? fmt(Number(entry.montant)) : "—"}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={entry.reason || ""}>{entry.reason || "—"}</TableCell>
                    <TableCell className="text-xs">{entry.user_email || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
