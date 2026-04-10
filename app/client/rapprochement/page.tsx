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
import { Loader2, RefreshCw, Link2, Unlink, Zap, CheckCircle2, AlertCircle, ArrowRightLeft, Users, Building2, Search, ChevronDown, ChevronUp, Sparkles, Send, Bot, Wrench, X } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { MonthPicker } from "@/components/ui/MonthPicker"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function formatDate(d: string) { return d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—" }

function TruncatedCell({ text, className }: { text: string; className?: string }) {
  if (!text || text === "—") return <span className={className}>{text || "—"}</span>
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`block max-w-[300px] truncate cursor-help ${className || ""}`}>{text}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[400px] text-sm break-words">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default function ClientRapprochementPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [autoMatching, setAutoMatching] = useState(false)
  const [autoStep, setAutoStep] = useState("")
  const [autoResult, setAutoResult] = useState<{ matched: number; total: number; interne: number; frais_bancaires: number; salaire_bulk: number; mra: number; not_matched: number; total_classified: number; matches: any[] } | null>(null)
  const [linkDialog, setLinkDialog] = useState<any>(null)
  const [societeId, setSocieteId] = useState<string | null>(null)
  const [societes, setSocietes] = useState<any[]>([])
  const [payeParAssocie, setPayeParAssocie] = useState(false)
  const [payeParType, setPayeParType] = useState("associe")
  const [payeParNom, setPayeParNom] = useState("")
  const [selectedMois, setSelectedMois] = useState<string | null>(null)
  const [selectedCompte, setSelectedCompte] = useState("all")
  const [matchedOpen, setMatchedOpen] = useState(false)
  const [txSearch, setTxSearch] = useState("")
  const [dialogTab, setDialogTab] = useState<"factures" | "ecritures" | "bach">("factures")
  const [sortField, setSortField] = useState<'date' | 'amount'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedPeriode, setSelectedPeriode] = useState('2025-2026')
  const [associes, setAssocies] = useState<any[]>([])

  // Agent IA state
  const [agentOpen, setAgentOpen] = useState(false)
  const [agentMessages, setAgentMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; tool_calls?: any[] }>>([])
  const [agentInput, setAgentInput] = useState("")
  const [agentLoading, setAgentLoading] = useState(false)

  const sendAgentMessage = async (message?: string) => {
    const msg = (message ?? agentInput).trim()
    if (!msg || !societeId || agentLoading) return
    const newMessages = [...agentMessages, { role: 'user' as const, content: msg }]
    setAgentMessages(newMessages)
    setAgentInput("")
    setAgentLoading(true)
    try {
      const res = await fetch("/api/comptable/rapprochement/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, societe_id: societeId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAgentMessages(m => [...m, { role: 'assistant', content: `Erreur : ${data.error || 'inconnue'}` }])
      } else {
        setAgentMessages(m => [...m, { role: 'assistant', content: data.response || "(pas de reponse)", tool_calls: data.tool_calls }])
        // If the agent applied matches, reload the data
        if (data.tool_calls?.some((t: any) => t.name === 'apply_match' && t.result?.success)) {
          load()
        }
      }
    } catch (e: any) {
      setAgentMessages(m => [...m, { role: 'assistant', content: `Erreur reseau : ${e.message || ''}` }])
    } finally { setAgentLoading(false) }
  }

  const resetAgent = () => {
    setAgentMessages([])
    setAgentInput("")
  }

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
      const [res, ccRes] = await Promise.all([
        fetch(`/api/comptable/rapprochement?societe_id=${societeId}`),
        fetch(`/api/comptable/compte-courant?societe_id=${societeId}`).catch(() => null),
      ])
      setData(await res.json())
      if (ccRes?.ok) { const ccData = await ccRes.json(); console.log('[rapprochement] associes loaded:', ccData.comptes?.length || 0); setAssocies(ccData.comptes || []) }
    } catch { setData(null) }
    finally { setLoading(false) }
  }, [societeId])

  useEffect(() => { load() }, [load])

  const handleAutoMatch = async () => {
    if (!societeId) return
    setAutoMatching(true)
    setAutoResult(null)
    try {
      setAutoStep("Analyse des transactions bancaires...")
      await new Promise(r => setTimeout(r, 800))
      setAutoStep("Recherche des factures correspondantes...")
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto_rapprocher", societe_id: societeId,
          ...(selectedPeriode !== 'tout' ? { date_debut: selectedPeriode === '2025-2026' ? '2025-07-01' : '2024-07-01', date_fin: selectedPeriode === '2025-2026' ? '2026-06-30' : '2025-06-30' } : {}) }),
      })
      setAutoStep("Rapprochement des écritures comptables...")
      const d = await res.json()
      await new Promise(r => setTimeout(r, 500))
      setAutoStep("")
      console.log('[rapprochement] auto_rapprocher response:', d)
      setAutoResult({ matched: d.matched || 0, total: d.total || 0, interne: d.interne || 0, frais_bancaires: d.frais_bancaires || 0, salaire_bulk: d.salaire_bulk || 0, mra: d.mra || 0, not_matched: d.not_matched || 0, total_classified: d.total_classified || 0, matches: d.matches || [] })
      load()
    } catch { setAutoStep(""); setAutoResult({ matched: 0, total: 0, interne: 0, frais_bancaires: 0, salaire_bulk: 0, mra: 0, not_matched: 0, total_classified: 0, matches: [] }) }
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
  const [generatingEcritures, setGeneratingEcritures] = useState(false)

  const handleGenerateEcritures = async () => {
    if (!societeId) return
    setGeneratingEcritures(true)
    try {
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_ecritures", societe_id: societeId }),
      })
      const d = await res.json()
      alert(`${d.created || 0} écriture(s) BNQ générée(s)`)
      load()
    } catch { alert("Erreur génération écritures") }
    finally { setGeneratingEcritures(false) }
  }

  const allTransactions = data?.bankTransactions || []
  const allComptes = data?.comptes || []
  const factures = data?.factures || []
  const ecritures = (data?.ecritures || []).filter((e: any) => !e.lettre)

  // Filter by month + compte
  // Period filter
  const periodDebut = selectedPeriode === '2025-2026' ? '2025-07-01' : selectedPeriode === '2024-2025' ? '2024-07-01' : null
  const periodFin = selectedPeriode === '2025-2026' ? '2026-06-30' : selectedPeriode === '2024-2025' ? '2025-06-30' : null

  const transactions = allTransactions.filter((t: any) => {
    if (selectedMois !== null && t.date) { if (t.date.substring(0, 7) !== selectedMois) return false }
    if (selectedCompte !== "all" && t.compte_bancaire_id) { if (String(t.compte_bancaire_id) !== selectedCompte) return false }
    if (periodDebut && t.date && t.date < periodDebut) return false
    if (periodFin && t.date && t.date > periodFin) return false
    // If period selected but transaction has no date, exclude it
    if ((periodDebut || periodFin) && !t.date) return false
    return true
  })
  const matched = transactions.filter((t: any) => t.statut === 'rapproche' || t.facture_id || t.ecriture_id || t.lettre)
  const interne = transactions.filter((t: any) => t.statut === 'interne' || t.matched_type === 'transfert_interne')
  const proposed = transactions.filter((t: any) => t.statut === 'propose' || t.statut === 'a_verifier')
  const unmatched = transactions.filter((t: any) => !t.facture_id && !t.ecriture_id && !t.lettre && t.statut !== 'rapproche' && t.statut !== 'interne' && t.statut !== 'propose' && t.statut !== 'a_verifier')

  // Sort unmatched
  const sortedUnmatched = [...unmatched].sort((a, b) => {
    if (sortField === 'date') { const cmp = (a.date || '').localeCompare(b.date || ''); return sortDir === 'asc' ? cmp : -cmp }
    const aAmt = (Number(a.debit) || 0) + (Number(a.credit) || 0)
    const bAmt = (Number(b.debit) || 0) + (Number(b.credit) || 0)
    return sortDir === 'asc' ? aAmt - bAmt : bAmt - aAmt
  })

  // Bank comptes from API (always available, not dependent on transactions)
  const comptesBancaires: any[] = data?.comptesBancaires || []
  const uniqueComptes = comptesBancaires.map((c: any) => ({
    id: c.id,
    label: `${c.banque || '—'} ${c.devise || 'MUR'} ${c.numero_compte?.length > 4 ? '•' + c.numero_compte.slice(-4) : ''}`.trim(),
  }))

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
        body: JSON.stringify({ action: "lettrer_ecritures", ecriture_ids: ids, societe_id: societeId }),
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
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto_lettrage_bnq", societe_id: societeId }),
      })
      const d = await res.json()
      alert(`${d.lettered || 0} paire(s) d'écritures lettrées automatiquement`)
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
          <Button onClick={() => setAgentOpen(true)} disabled={!societeId} className="text-white" style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
            <Sparkles className="w-4 h-4 mr-2" />
            Agent IA
          </Button>
        </div>
      </div>

      {/* Filters row: Month + Compte + Période */}
      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker value={selectedMois} onChange={setSelectedMois} />
        <Select value={selectedCompte} onValueChange={setSelectedCompte}>
          <SelectTrigger className="w-[220px] h-8"><SelectValue placeholder="Tous les comptes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les comptes</SelectItem>
            {uniqueComptes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 whitespace-nowrap">Période :</span>
          <Select value={selectedPeriode} onValueChange={setSelectedPeriode}>
            <SelectTrigger className="w-[200px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="2025-2026">Exercice 2025-2026</SelectItem>
              <SelectItem value="2024-2025">Exercice 2024-2025</SelectItem>
              <SelectItem value="tout">Tout</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Transactions</p><p className="text-2xl font-bold text-[#0B0F2E]">{transactions.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Rapprochées</p><p className="text-2xl font-bold text-green-600">{matched.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Internes</p><p className="text-2xl font-bold text-gray-400">{interne.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500">À valider</p><p className="text-2xl font-bold text-orange-600">{proposed.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Non rapprochées</p><p className="text-2xl font-bold text-red-600">{unmatched.length}</p></CardContent></Card>
      </div>

      {/* Auto-rapprochement progress */}
      {autoStep && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-sm text-blue-800">{autoStep}</span>
          </CardContent>
        </Card>
      )}

      {/* Auto-rapprochement result */}
      {autoResult && !autoStep && (
        <Card className={autoResult.total_classified > 0 ? "border-green-200 bg-green-50" : "border-gray-200"}>
          <CardContent className="p-4">
            <p className="font-medium text-sm text-[#0B0F2E]">Rapprochement terminé</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-xs">
              {autoResult.matched > 0 && <div className="flex items-center gap-1"><span className="text-green-600">⚡</span>{autoResult.matched} correspondance(s) factures/écritures</div>}
              {autoResult.interne > 0 && <div className="flex items-center gap-1"><span className="text-gray-400">🏦</span>{autoResult.interne} transfert(s) interne(s)</div>}
              {autoResult.frais_bancaires > 0 && <div className="flex items-center gap-1"><span className="text-blue-500">💰</span>{autoResult.frais_bancaires} frais bancaires</div>}
              {autoResult.salaire_bulk > 0 && <div className="flex items-center gap-1"><span className="text-purple-500">👥</span>{autoResult.salaire_bulk} salaire(s)</div>}
              {autoResult.mra > 0 && <div className="flex items-center gap-1"><span className="text-indigo-500">🏛️</span>{autoResult.mra} paiement(s) MRA</div>}
              {autoResult.not_matched > 0 && <div className="flex items-center gap-1"><span className="text-red-500">❌</span>{autoResult.not_matched} sans correspondance</div>}
            </div>
            {autoResult.total > 0 && (
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${Math.round((autoResult.total_classified / autoResult.total) * 100)}%` }} />
              </div>
            )}
            {autoResult.total > 0 && <p className="text-xs text-gray-400 mt-1">{autoResult.total_classified}/{autoResult.total} transactions traitées ({Math.round((autoResult.total_classified / autoResult.total) * 100)}%)</p>}
            {autoResult.not_matched > 0 && <p className="text-xs text-gray-500 mt-2">Utilisez le rapprochement manuel pour les {autoResult.not_matched} restante(s).</p>}
          </CardContent>
        </Card>
      )}

      {/* SECTION 3 — Rapprochées (collapsible) */}
      {matched.length > 0 && (
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setMatchedOpen(!matchedOpen)}>
            <CardTitle className="text-[#0B0F2E] flex items-center justify-between">
              <span className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-600" />Rapprochées ({matched.length})</span>
              {matchedOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </CardTitle>
          </CardHeader>
          {matchedOpen && (
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Montant</TableHead><TableHead>Tiers</TableHead><TableHead>Lettre</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {matched.map((tx: any) => (
                    <TableRow key={tx.id} className="bg-green-50/50">
                      <TableCell className="text-sm">{formatDate(tx.date)}</TableCell>
                      <TableCell className="text-sm"><TruncatedCell text={tx.libelle} /></TableCell>
                      <TableCell className="text-right font-medium">{tx.debit > 0 ? <span className="text-red-600">-{fmt(tx.debit)} {tx.devise}</span> : <span className="text-green-600">+{fmt(tx.credit)} {tx.devise}</span>}</TableCell>
                      <TableCell className="text-sm">{tx.tiers_detecte || "—"}</TableCell>
                      <TableCell><Badge className="bg-green-100 text-green-700">{tx.lettre || "OK"}</Badge></TableCell>
                      <TableCell><Button variant="ghost" size="sm" onClick={() => handleUnlink(tx)}><Unlink className="w-4 h-4 text-red-500" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      )}

      {/* SECTION 4 — Non rapprochées (main focus) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-[#0B0F2E] flex items-center gap-2"><AlertCircle className="w-5 h-5 text-orange-500" />Non rapprochées ({unmatched.length})</CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex rounded border overflow-hidden text-xs">
              <button onClick={() => { setSortField('date'); setSortDir(d => d === 'desc' ? 'asc' : 'desc') }} className={`px-2 py-1 ${sortField === 'date' ? 'bg-[#0B0F2E] text-white' : 'bg-white'}`}>Date {sortField === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
              <button onClick={() => { setSortField('amount'); setSortDir(d => d === 'desc' ? 'asc' : 'desc') }} className={`px-2 py-1 ${sortField === 'amount' ? 'bg-[#0B0F2E] text-white' : 'bg-white'}`}>Montant {sortField === 'amount' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button>
            </div>
            <div className="relative w-48">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Rechercher..." className="pl-9 h-8 text-sm" value={txSearch} onChange={e => setTxSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {unmatched.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Toutes les transactions sont rapprochées</div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead><TableHead>Tiers</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {sortedUnmatched
                  .filter(tx => {
                    if (!txSearch) return true
                    const s = txSearch.toLowerCase()
                    return tx.libelle?.toLowerCase().includes(s) || (tx.tiers_detecte || "").toLowerCase().includes(s) || String(tx.debit).includes(s) || String(tx.credit).includes(s)
                  })
                  .map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-sm">{formatDate(tx.date)}</TableCell>
                      <TableCell className="text-sm"><TruncatedCell text={tx.libelle} /></TableCell>
                      <TableCell className="text-right text-sm text-red-600 font-medium">{tx.debit > 0 ? fmt(tx.debit) + " " + tx.devise : "—"}</TableCell>
                      <TableCell className="text-right text-sm text-green-600 font-medium">{tx.credit > 0 ? fmt(tx.credit) + " " + tx.devise : "—"}</TableCell>
                      <TableCell className="text-sm">{tx.tiers_detecte || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => { setDialogTab("factures"); setLinkDialog(tx) }} className="gap-1"><Link2 className="w-3 h-3" />Lettrer</Button>
                          {associes.length > 0 && (
                            <Button variant="outline" size="sm" onClick={() => { setPayeParNom(associes[0]?.nom || ""); setPayeParType("associe"); setDialogTab("bach"); setLinkDialog(tx) }} className="gap-1 text-purple-600 border-purple-200 hover:bg-purple-50"><Users className="w-3 h-3" />Associé</Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* SECTION 5 — Lettrage écritures 401/411 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-[#0B0F2E]">Lettrage fournisseurs/clients — {ecrituresLettrage.length} non lettrées</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleGenerateEcritures} disabled={generatingEcritures}>
              {generatingEcritures ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {generatingEcritures ? "Génération..." : "Générer écritures BNQ"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleAutoLettrage} disabled={autoLettraging}>
              <Zap className={`w-4 h-4 mr-1 ${autoLettraging ? "animate-spin" : ""}`} />
              {autoLettraging ? "Analyse..." : "Auto-lettrage"}
            </Button>
          </div>
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
                    <TableCell className="text-sm"><TruncatedCell text={e.libelle || "—"} /></TableCell>
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

      {/* Écritures lettrées (collapsible like rapprochées) */}
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
                    <TableCell className="text-sm"><TruncatedCell text={e.libelle || "—"} /></TableCell>
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
            <div className="space-y-3">
              {/* Transaction details */}
              <div className="p-3 bg-gray-50 rounded-lg text-sm">
                <p className="font-medium">{linkDialog.libelle}</p>
                <p className="text-gray-500">{formatDate(linkDialog.date)} — {linkDialog.debit > 0 ? <span className="text-red-600 font-bold">-{fmt(linkDialog.debit)}</span> : <span className="text-green-600 font-bold">+{fmt(linkDialog.credit)}</span>} {linkDialog.devise}</p>
                {linkDialog.tiers_detecte && <p className="text-xs text-gray-400 mt-1">Tiers: {linkDialog.tiers_detecte}</p>}
              </div>

              {/* Tabs inside panel */}
              <div className="flex gap-1 border-b">
                {(["factures", "ecritures", "bach"] as const).map(tab => (
                  <button key={tab} onClick={() => setDialogTab(tab)}
                    className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${dialogTab === tab ? "border-[#D4AF37] text-[#0B0F2E]" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                    {tab === "factures" ? `Factures (${factures.length})` : tab === "ecritures" ? `Écritures (${ecritures.length})` : "Associé"}
                  </button>
                ))}
              </div>

              {/* Tab: Factures */}
              {dialogTab === "factures" && (
                <div className="space-y-2 max-h-[350px] overflow-y-auto">
                  {factures.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center">Aucune facture en attente</p>
                  ) : factures
                    .sort((a: any, b: any) => {
                      const txAmt = linkDialog.debit > 0 ? linkDialog.debit : linkDialog.credit
                      return Math.abs((Number(a.montant_ttc) || 0) - txAmt) - Math.abs((Number(b.montant_ttc) || 0) - txAmt)
                    })
                    .map((f: any) => {
                      const txAmount = linkDialog.debit > 0 ? linkDialog.debit : linkDialog.credit
                      const fAmount = Number(f.montant_ttc) || 0
                      const isClose = Math.abs(txAmount - fAmount) <= Math.max(fAmount * 0.05, 1)
                      return (
                        <div key={f.id} onClick={() => handleManualLink(linkDialog, f, "facture")}
                          className={`p-3 border rounded-lg cursor-pointer hover:bg-blue-50 ${isClose ? "border-green-300 bg-green-50" : "border-gray-200"}`}>
                          <div className="flex justify-between">
                            <div><p className="font-medium text-sm">{f.numero_facture || "—"} <Badge className="text-xs ml-1">{f.type_facture}</Badge></p><p className="text-xs text-gray-500">{f.tiers} — {formatDate(f.date_facture)}</p></div>
                            <div className="text-right"><p className="font-bold text-sm">{fmt(fAmount)} {f.devise}</p>{isClose && <Badge className="bg-green-100 text-green-700 text-xs">Proche</Badge>}</div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}

              {/* Tab: Écritures */}
              {dialogTab === "ecritures" && (
                <div className="space-y-2 max-h-[350px] overflow-y-auto">
                  {ecritures.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center">Aucune écriture non lettrée</p>
                  ) : ecritures
                    .sort((a: any, b: any) => {
                      const txAmt = linkDialog.debit > 0 ? linkDialog.debit : linkDialog.credit
                      const aAmt = Number(a.debit) > 0 ? Number(a.debit) : Number(a.credit)
                      const bAmt = Number(b.debit) > 0 ? Number(b.debit) : Number(b.credit)
                      return Math.abs(aAmt - txAmt) - Math.abs(bAmt - txAmt)
                    })
                    .map((e: any) => {
                      const txAmount = linkDialog.debit > 0 ? linkDialog.debit : linkDialog.credit
                      const eAmount = Number(e.debit) > 0 ? Number(e.debit) : Number(e.credit)
                      const isClose = eAmount > 0 && Math.abs(txAmount - eAmount) <= Math.max(eAmount * 0.05, 1)
                      return (
                        <div key={e.id} onClick={() => handleManualLink(linkDialog, e, "ecriture")}
                          className={`p-3 border rounded-lg cursor-pointer hover:bg-blue-50 ${isClose ? "border-green-300 bg-green-50" : "border-gray-200"}`}>
                          <div className="flex justify-between">
                            <div><p className="font-medium text-sm">{e.compte} — {e.libelle || "—"}</p><p className="text-xs text-gray-500">{formatDate(e.date_ecriture)} — {e.journal}</p></div>
                            <div className="text-right"><p className="font-bold text-sm">{Number(e.debit) > 0 ? fmt(Number(e.debit)) + " D" : fmt(Number(e.credit)) + " C"}</p>{isClose && <Badge className="bg-green-100 text-green-700 text-xs">Proche</Badge>}</div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}

              {/* Tab: Compte Courant Associé */}
              {dialogTab === "bach" && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">Assigner cette opération au compte courant d&apos;un associé</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Type</Label>
                      <Select value={payeParType} onValueChange={setPayeParType}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="associe">Associé (455)</SelectItem>
                          <SelectItem value="collaborateur">Collaborateur (467)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Nom</Label>
                      {associes.length > 0 ? (
                        <Select value={payeParNom} onValueChange={setPayeParNom}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                          <SelectContent>{associes.map((a: any) => <SelectItem key={a.id} value={a.nom}>{a.nom} ({a.type})</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Input className="h-8 text-xs" value={payeParNom} onChange={e => setPayeParNom(e.target.value)} placeholder="Nom de l'associé" />
                      )}
                    </div>
                  </div>
                  {payeParNom && factures.length > 0 && (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      <p className="text-xs font-medium text-gray-600">Sélectionnez la facture payée par {payeParNom} :</p>
                      {factures.map((f: any) => (
                        <div key={`bach-${f.id}`} onClick={() => handlePayeParAssocie(f)}
                          className="p-3 border border-purple-200 rounded-lg cursor-pointer hover:bg-purple-50">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-medium text-sm">{f.numero_facture || "—"} <Badge className="text-xs ml-1 bg-purple-100 text-purple-700">Associé</Badge></p>
                              <p className="text-xs text-gray-500">{f.tiers}</p>
                            </div>
                            <p className="font-bold text-sm">{fmt(Number(f.montant_ttc) || 0)} {f.devise}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {payeParNom && factures.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">Aucune facture en attente à assigner</p>
                  )}
                </div>
              )}

              {/* Associé fallback suggestion */}
              {associes.length > 0 && (
                <div className="border-t pt-4">
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <p className="text-sm font-medium text-purple-800 flex items-center gap-2">
                      <Users className="w-4 h-4" />Assigner au compte courant associé ?
                    </p>
                    <p className="text-xs text-purple-600 mt-1">
                      Si cette opération a été payée par un associé avec ses fonds personnels
                    </p>
                    <div className="flex gap-2 mt-2">
                      {associes.slice(0, 3).map((a: any) => (
                        <Button key={a.id} size="sm" className="bg-purple-600 hover:bg-purple-700 text-white" onClick={() => {
                          setPayeParNom(a.nom)
                          setPayeParType(a.type || "associe")
                          if (factures.length > 0) {
                            const txAmount = linkDialog.debit > 0 ? linkDialog.debit : linkDialog.credit
                            const closest = [...factures].sort((fa: any, fb: any) => Math.abs((Number(fa.montant_ttc) || 0) - txAmount) - Math.abs((Number(fb.montant_ttc) || 0) - txAmount))[0]
                            if (closest) handlePayeParAssocie(closest)
                          }
                        }}>
                          {a.nom}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Agent IA Panel */}
      <Dialog open={agentOpen} onOpenChange={setAgentOpen}>
        <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-5 border-b" style={{ background: "linear-gradient(135deg, #7c3aed08, #4f46e508)" }}>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-base font-bold" style={{ color: "#0B0F2E" }}>Agent IA — Rapprochement</p>
                  <p className="text-xs text-gray-500 font-normal">Claude Sonnet 4.6 avec outils natifs</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={resetAgent} className="text-xs">
                <X className="w-3 h-3 mr-1" /> Reset
              </Button>
            </DialogTitle>
          </DialogHeader>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {agentMessages.length === 0 && (
              <div className="text-center py-8">
                <div className="h-16 w-16 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: "linear-gradient(135deg, #7c3aed20, #4f46e520)" }}>
                  <Sparkles className="w-8 h-8" style={{ color: "#7c3aed" }} />
                </div>
                <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>Agent de rapprochement intelligent</p>
                <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                  Posez une question ou utilisez une suggestion. L&apos;agent peut analyser les transactions, proposer des matches et executer les rapprochements.
                </p>
                <div className="flex flex-col gap-2 max-w-sm mx-auto mt-5">
                  {[
                    "Analyse l'etat du rapprochement et resume ce qui reste a faire",
                    "Cherche les transactions qui correspondent a plusieurs factures du meme fournisseur",
                    "Rapproche automatiquement les paiements evidents (confiance >= 90%)",
                    "Quelles transactions sont hors delais de paiement (> 60 jours) ?",
                  ].map((q, i) => (
                    <button key={i} onClick={() => sendAgentMessage(q)}
                      className="text-left px-3 py-2 rounded-lg text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {agentMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  m.role === 'user'
                    ? 'bg-[#0B0F2E] text-white'
                    : 'bg-gray-50 border border-gray-200 text-gray-800'
                }`}>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  {m.tool_calls && m.tool_calls.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                      {m.tool_calls.map((tc: any, ti: number) => (
                        <div key={ti} className="flex items-start gap-1.5 text-[10px] text-gray-500">
                          <Wrench className="w-3 h-3 mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <span className="font-mono font-semibold text-purple-600">{tc.name}</span>
                            {tc.result?.count !== undefined && <span className="ml-1">→ {tc.result.count} resultats</span>}
                            {tc.result?.success && <span className="ml-1 text-green-600">✓ applique</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {agentLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    L&apos;agent reflechit...
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t p-4 bg-white">
            <div className="flex gap-2">
              <Textarea
                value={agentInput}
                onChange={e => setAgentInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAgentMessage() } }}
                placeholder="Posez une question a l'agent..."
                className="flex-1 min-h-[44px] max-h-32 resize-none text-sm"
                disabled={agentLoading}
              />
              <Button onClick={() => sendAgentMessage()} disabled={!agentInput.trim() || agentLoading} className="self-end" style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">L&apos;agent peut lister les transactions, analyser les factures et proposer/appliquer des rapprochements.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
