"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Search, Loader2, FileText, AlertTriangle, Download, User, Trash2, Building2, AlertCircle, RefreshCw, Wrench, CheckCircle2 } from "lucide-react"
import * as XLSX from "xlsx"
import { MonthPicker } from "@/components/ui/MonthPicker"

const NAVY = "#0B0F2E"
function formatMUR(amount: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount) + " MUR"
}
function fmt2(n: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function getStatutBadge(statut: string) {
  switch (statut) {
    case "paye": case "payé":
      return <Badge className="bg-green-100 text-green-700 border-green-200">Payé</Badge>
    case "en_attente":
      return <Badge className="bg-orange-100 text-orange-700 border-orange-200">En attente</Badge>
    case "retard": case "en_retard":
      return <Badge className="bg-red-100 text-red-700 border-red-200">En retard</Badge>
    case "partiel":
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Partiel</Badge>
    default:
      return <Badge variant="secondary">{statut || "—"}</Badge>
  }
}

export default function ClientFournisseursPage() {
  const [search, setSearch] = useState("")
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [loading, setLoading] = useState(true)
  const [factures, setFactures] = useState<any[]>([])
  const [totaux, setTotaux] = useState<any>({})
  const [selectedFournisseur, setSelectedFournisseur] = useState<string>("all")
  const [selectedMois, setSelectedMois] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
      setSocietes(unique)
      if (unique.length >= 1) setSociete(unique[0].id)
    })
  }, [])

  const load = useCallback(async () => {
    if (!societe) return
    setLoading(true)
    try {
      const res = await fetch(`/api/comptable/factures?societe_id=${societe}&type=fournisseur&limit=1000`)
      const data = await res.json()
      setFactures(data.factures || [])
      setTotaux(data.totaux || {})
    } catch {
      setFactures([])
      setTotaux({})
    }
    setLoading(false)
  }, [societe])

  useEffect(() => { load() }, [load])

  // Delete
  const handleDelete = async (f: any) => {
    if (!confirm(`Supprimer la facture ${f.numero_facture || ""} de ${f.tiers || ""} ?\n\nLes ecritures comptables associees seront aussi supprimees.`)) return
    try {
      const res = await fetch(`/api/comptable/factures?id=${f.id}`, { method: "DELETE" })
      if (res.ok) load()
      else { const d = await res.json().catch(() => ({})); alert(d.error || "Erreur") }
    } catch (e: any) { alert("Erreur: " + (e.message || "")) }
  }

  // Reassign
  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignFacture, setReassignFacture] = useState<any>(null)
  const [reassignSocieteId, setReassignSocieteId] = useState("")
  const [reassignSaving, setReassignSaving] = useState(false)

  const openReassign = (f: any) => {
    setReassignFacture(f)
    setReassignSocieteId(f.societe_id || "")
    setReassignOpen(true)
  }

  const saveReassign = async () => {
    if (!reassignFacture || !reassignSocieteId) return
    if (reassignSocieteId === reassignFacture.societe_id) { setReassignOpen(false); return }
    setReassignSaving(true)
    try {
      const res = await fetch("/api/comptable/factures", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reassignFacture.id, societe_id: reassignSocieteId }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || "Erreur"); return }
      setReassignOpen(false)
      load()
    } catch (e: any) { alert("Erreur: " + (e.message || "")) }
    finally { setReassignSaving(false) }
  }

  // Consistency check
  const [consistency, setConsistency] = useState<any>(null)
  const [consistencyLoading, setConsistencyLoading] = useState(false)
  const [consistencyFixing, setConsistencyFixing] = useState<string | null>(null)

  const loadConsistency = useCallback(async () => {
    if (!societe) return
    setConsistencyLoading(true)
    try {
      const res = await fetch(`/api/comptable/rapprochement/consistency?societe_id=${societe}`)
      if (res.ok) setConsistency(await res.json())
    } catch {} finally { setConsistencyLoading(false) }
  }, [societe])

  useEffect(() => { loadConsistency() }, [loadConsistency])

  const runFix = async (action: 'link_existing_matches' | 'unmark_orphans') => {
    if (!societe) return
    setConsistencyFixing(action)
    try {
      const res = await fetch("/api/comptable/rapprochement/consistency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societe, action }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || "Erreur"); return }
      alert(`${data.fixed || 0} facture(s) corrigee(s)`)
      await loadConsistency()
      await load()
    } catch (e: any) {
      alert("Erreur: " + (e.message || ""))
    } finally { setConsistencyFixing(null) }
  }

  // Build unique fournisseur list
  const fournisseurs = Array.from(new Set(factures.map(f => f.tiers).filter(Boolean))).sort()

  const filtered = factures.filter((row) => {
    // Apply month filter
    if (selectedMois !== null && row.date_facture) {
      if (row.date_facture.substring(0, 7) !== selectedMois) return false
    }
    // Apply fournisseur filter
    if (selectedFournisseur !== "all" && row.tiers !== selectedFournisseur) return false
    // Apply search
    return (
      (row.tiers || "").toLowerCase().includes(search.toLowerCase()) ||
      (row.numero_facture || "").toLowerCase().includes(search.toLowerCase()) ||
      (row.description || "").toLowerCase().includes(search.toLowerCase())
    )
  })

  // Compute fournisseur-specific totals when one is selected
  const fournisseurTotaux = selectedFournisseur !== "all" ? {
    total_ht: filtered.reduce((s, f) => s + (f.montant_ht || 0), 0),
    total_tva: filtered.reduce((s, f) => s + (f.montant_tva || 0), 0),
    total_ttc: filtered.reduce((s, f) => s + (f.montant_ttc || 0), 0),
    total_mur: filtered.reduce((s, f) => s + (f.montant_mur || f.montant_ttc || 0), 0),
    nb_factures: filtered.length,
    nb_en_attente: filtered.filter(f => f.statut === "en_attente").length,
  } : null

  const handleExport = () => {
    const data = filtered.map(f => ({
      "N° Facture": f.numero_facture || "—",
      "Fournisseur": f.tiers || "—",
      "Date": f.date_facture ? new Date(f.date_facture).toLocaleDateString("fr-FR") : "—",
      "Montant HT": fmt2(f.montant_ht || 0),
      "TVA": fmt2(f.montant_tva || 0),
      "Montant TTC": fmt2(f.montant_ttc || 0),
      "Devise": f.devise || "MUR",
      "Statut": f.statut || "—",
      "Échéance": f.date_echeance ? new Date(f.date_echeance).toLocaleDateString("fr-FR") : "—",
    }))
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data)
    XLSX.utils.book_append_sheet(wb, ws, "Factures fournisseurs")
    const dateStr = new Date().toISOString().split("T")[0]
    XLSX.writeFile(wb, `fournisseurs_${dateStr}.xlsx`)
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            Factures fournisseurs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Suivi des factures fournisseurs et paiements
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Société" /></SelectTrigger>
            <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="w-4 h-4 mr-2" />Exporter
          </Button>
        </div>
      </div>

      {/* Month navigator */}
      <MonthPicker value={selectedMois} onChange={setSelectedMois} />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center">
          <FileText className="h-5 w-5 mx-auto mb-1" style={{ color: NAVY }} />
          <p className="text-2xl font-bold" style={{ color: NAVY }}>{totaux.nb_factures || 0}</p>
          <p className="text-xs text-gray-500">Factures</p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4">
          <p className="text-xs text-gray-400">Total HT</p>
          <p className="text-xl font-bold text-blue-600">{formatMUR(totaux.total_ht || 0)}</p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-emerald-500"><CardContent className="p-4">
          <p className="text-xs text-gray-400">Total TTC</p>
          <p className="text-xl font-bold text-emerald-600">{formatMUR(totaux.total_ttc || 0)}</p>
          <p className="text-xs text-gray-400 mt-1">TVA: {formatMUR(totaux.total_tva || 0)}</p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-orange-500"><CardContent className="p-4">
          <AlertTriangle className="h-4 w-4 text-orange-500 mb-1" />
          <p className="text-xl font-bold text-orange-600">{totaux.nb_en_attente || 0}</p>
          <p className="text-xs text-gray-400">En attente / {totaux.nb_retard || 0} en retard</p>
        </CardContent></Card>
      </div>

      {/* Consistency check banner */}
      {consistency?.stats && (
        <Card className={`border-l-4 ${(consistency.inconsistencies?.length || 0) > 0 ? 'border-l-red-500 bg-red-50' : 'border-l-green-500 bg-green-50'}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {(consistency.inconsistencies?.length || 0) > 0 ? (
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  )}
                  <p className="text-sm font-bold" style={{ color: NAVY }}>
                    Coherence factures / rapprochement bancaire
                  </p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs mt-2">
                  <div>
                    <p className="text-gray-500">Total factures</p>
                    <p className="font-bold text-base">{consistency.stats.total_factures}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Payees</p>
                    <p className="font-bold text-base text-green-600">{consistency.stats.paye_count}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Dont rapprochees bancaire</p>
                    <p className="font-bold text-base text-blue-600">{consistency.stats.paye_avec_rapprochement}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Payees sans lien bancaire</p>
                    <p className={`font-bold text-base ${consistency.stats.paye_sans_rapprochement > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                      {consistency.stats.paye_sans_rapprochement}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Incoherences</p>
                    <p className={`font-bold text-base ${(consistency.inconsistencies?.length || 0) > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {consistency.inconsistencies?.length || 0}
                    </p>
                  </div>
                </div>
                {(consistency.stats.paye_sans_rapprochement > 0 || (consistency.inconsistencies?.length || 0) > 0) && (
                  <p className="text-xs text-gray-500 mt-2">
                    {consistency.stats.paye_sans_rapprochement > 0 && (
                      <>{consistency.stats.paye_sans_rapprochement} facture(s) payee(s) sans rapprochement bancaire. </>
                    )}
                    Cliquez &quot;Reparer automatiquement&quot; pour lier les paiements aux transactions existantes.
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={loadConsistency} disabled={consistencyLoading}>
                  {consistencyLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                  Verifier
                </Button>
                {(consistency.stats.paye_sans_rapprochement > 0 || (consistency.inconsistencies?.length || 0) > 0) && (
                  <Button
                    size="sm"
                    className="bg-[#0B0F2E] text-white"
                    onClick={() => runFix('link_existing_matches')}
                    disabled={!!consistencyFixing}
                  >
                    {consistencyFixing === 'link_existing_matches' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wrench className="w-3 h-3 mr-1" />}
                    Reparer automatiquement
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fournisseur-specific summary card */}
      {fournisseurTotaux && (
        <Card className="border-l-4 border-l-[#0B0F2E] bg-[#0B0F2E]/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-5 h-5 text-[#0B0F2E]" />
              <p className="font-bold text-[#0B0F2E]">{selectedFournisseur}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div><p className="text-gray-500">Total HT</p><p className="font-bold text-blue-600">{formatMUR(fournisseurTotaux.total_ht)}</p></div>
              <div><p className="text-gray-500">Total TVA</p><p className="font-bold text-orange-600">{formatMUR(fournisseurTotaux.total_tva)}</p></div>
              <div><p className="text-gray-500">Total TTC (MUR)</p><p className="font-bold text-emerald-600">{formatMUR(fournisseurTotaux.total_mur)}</p></div>
              <div><p className="text-gray-500">Factures</p><p className="font-bold text-[#0B0F2E]">{fournisseurTotaux.nb_factures}</p></div>
              <div><p className="text-gray-500">En attente</p><p className={`font-bold ${fournisseurTotaux.nb_en_attente > 0 ? "text-orange-600" : "text-green-600"}`}>{fournisseurTotaux.nb_en_attente}</p></div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher fournisseur, n° facture..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={selectedFournisseur} onValueChange={setSelectedFournisseur}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Fournisseur" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les fournisseurs</SelectItem>
            {fournisseurs.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle style={{ color: NAVY }}>
              Factures fournisseurs ({filtered.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>N° Facture</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Montant HT</TableHead>
                  <TableHead className="text-right">TVA</TableHead>
                  <TableHead className="text-right">TTC</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Devise</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.tiers || "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{row.numero_facture || "—"}</TableCell>
                    <TableCell>{row.date_facture ? new Date(row.date_facture).toLocaleDateString("fr-FR") : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{formatMUR(row.montant_ht || 0)}</TableCell>
                    <TableCell className="text-right font-mono">{formatMUR(row.montant_tva || 0)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{formatMUR(row.montant_ttc || 0)}</TableCell>
                    <TableCell>{row.date_echeance ? new Date(row.date_echeance).toLocaleDateString("fr-FR") : "—"}</TableCell>
                    <TableCell>{getStatutBadge(row.statut)}</TableCell>
                    <TableCell>{row.devise || "MUR"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openReassign(row)} title="Changer de societe" className="h-7 w-7 p-0 text-amber-600">
                          <Building2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(row)} title="Supprimer" className="h-7 w-7 p-0 text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      {search || selectedFournisseur !== "all"
                        ? "Aucune facture fournisseur trouvée pour cette recherche."
                        : "Aucune facture fournisseur disponible. Les factures apparaîtront ici une fois traitées par OCR."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Reassign dialog */}
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-amber-600" />
              Changer de societe
            </DialogTitle>
          </DialogHeader>
          {reassignFacture && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-gray-50 rounded-lg text-sm">
                <p><strong>Fournisseur :</strong> {reassignFacture.tiers || "—"}</p>
                <p><strong>N° Facture :</strong> {reassignFacture.numero_facture || "—"}</p>
                <p><strong>Montant :</strong> {fmt2(reassignFacture.montant_ttc || 0)} {reassignFacture.devise || "MUR"}</p>
              </div>
              <div>
                <Label>Societe actuelle</Label>
                <p className="text-sm text-gray-500 mt-1">
                  {societes.find(s => s.id === reassignFacture.societe_id)?.nom || "Inconnue"}
                </p>
              </div>
              <div>
                <Label>Reassigner vers</Label>
                <Select value={reassignSocieteId} onValueChange={setReassignSocieteId}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {societes.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-amber-600 flex items-start gap-1">
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                La facture et le document numerise associe seront deplaces vers la nouvelle societe.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOpen(false)}>Annuler</Button>
            <Button onClick={saveReassign} disabled={reassignSaving || !reassignSocieteId} className="bg-[#0B0F2E] text-white">
              {reassignSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Reassigner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
