"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, RefreshCw, Link2, Unlink, Zap, CheckCircle2, AlertCircle, ArrowRightLeft, Users, Building2, Search, ChevronDown, ChevronUp, Sparkles, Send, Bot, Wrench, X, MessageSquare } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { MonthPicker } from "@/components/ui/MonthPicker"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"

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
  const [resetting, setResetting] = useState(false)

  // ── Chat IA state ──────────────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; tool_calls?: any[] }>>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = React.useRef<HTMLDivElement>(null)

  // Smart Apply state
  const [smartLoading, setSmartLoading] = useState(false)
  const [smartResult, setSmartResult] = useState<any>(null)
  const [smartProposals, setSmartProposals] = useState<any[]>([])
  const [smartDialog, setSmartDialog] = useState<'summary' | 'list' | null>(null)

  const handleSmartRapprochement = async () => {
    if (!societeId) return
    setSmartLoading(true)
    setSmartResult(null)
    setSmartProposals([])
    try {
      const res = await fetch('/api/comptable/rapprochement/smart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societe_id: societeId,
          ...(selectedPeriode !== 'tout' ? {
            date_debut: selectedPeriode === '2025-2026' ? '2025-07-01' : '2024-07-01',
            date_fin: selectedPeriode === '2025-2026' ? '2026-06-30' : '2025-06-30',
          } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) { alert('Erreur smart: ' + (data.error || 'inconnue')); return }
      setSmartProposals(data.proposals || [])
      setSmartResult(data.stats || {})
      setSmartDialog('summary')
    } catch (e: any) {
      alert('Erreur reseau: ' + (e.message || ''))
    } finally { setSmartLoading(false) }
  }

  const handleSmartApplyAll = async () => {
    if (!societeId || smartProposals.length === 0) return
    setSmartLoading(true)
    try {
      const res = await fetch('/api/comptable/rapprochement/smart/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societe_id: societeId,
          proposals: smartProposals,
          min_confidence: 0.85,
        }),
      })
      const data = await res.json()
      if (!res.ok) { alert('Erreur apply: ' + (data.error || 'inconnue')); return }
      const s = data.stats || {}
      alert(
        `Rapprochement Smart terminé :\n\n` +
        `✅ ${data.applied} rapprochements appliqués\n` +
        `⏭ ${data.skipped} ignorés (confiance insuffisante ou déjà traités)\n` +
        (data.errors?.length > 0 ? `⚠️ ${data.errors.length} erreur(s)\n` : '') +
        (s.consistency?.orphans > 0 ? `\n⚠️ ${s.consistency.orphans} facture(s) orpheline(s) détectée(s)` : '\n✅ Cohérence OK')
      )
      setSmartDialog(null)
      setSmartProposals([])
      setSmartResult(null)
      await load()
    } catch (e: any) {
      alert('Erreur reseau: ' + (e.message || ''))
    } finally { setSmartLoading(false) }
  }

  const handleResetAll = async () => {
    if (!societeId) return
    const msg = `⚠️ REINITIALISATION COMPLETE du rapprochement

Cette action va :
- Supprimer TOUTES les ecritures de factures (FAC-*) et paiements (BANK-*)
- Remettre TOUTES les factures a "en attente"
- Effacer le lettrage de TOUTES les transactions bancaires
- Effacer les liens rapprochement des factures

Puis vous pourrez regenerer les ecritures proprement avec le bouton "Generer ecritures comptables" sur la page Fournisseurs.

Voulez-vous vraiment continuer ?`
    if (!confirm(msg)) return
    if (!confirm("Derniere confirmation : cette action est irreversible. Continuer ?")) return
    setResetting(true)
    try {
      const res = await fetch("/api/comptable/rapprochement/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, confirm: "RESET" }),
      })
      const data = await res.json()
      if (!res.ok) { alert("Erreur : " + (data.error || "inconnue")); return }
      const s = data.stats || {}
      alert(
        "Reset complet effectue :\n\n" +
        `- ${s.ecritures_factures_supprimees} ecritures de factures supprimees\n` +
        `- ${s.ecritures_paiements_supprimees} ecritures de paiements supprimees\n` +
        `- ${s.ecritures_legacy_supprimees} ecritures legacy supprimees\n` +
        `- ${s.factures_reset} factures remises a en_attente\n` +
        `- ${s.transactions_reset} transactions bancaires delettrees\n\n` +
        "Prochaine etape : allez sur /client/fournisseurs et cliquez 'Generer ecritures comptables' pour repartir d'un etat propre."
      )
      await load()
      setAiProposals({})
      setAiStats(null)
      setRejectedProposals(new Set())
    } catch (e: any) {
      alert("Erreur reseau : " + (e.message || ""))
    } finally { setResetting(false) }
  }

  // Agent IA state — inline analysis (no chat)
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const [aiProposals, setAiProposals] = useState<Record<string, any>>({}) // keyed by releve_id:idx
  const [aiStats, setAiStats] = useState<{ auto: number; arbitration: number; total: number } | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [rejectedProposals, setRejectedProposals] = useState<Set<string>>(new Set())
  const [applyingKey, setApplyingKey] = useState<string | null>(null)
  const [applyingBatch, setApplyingBatch] = useState(false)

  const proposalKey = (releve_id: string, idx: number) => `${releve_id}:${idx}`

  // Trigger AI analysis on unmatched transactions
  const runAiAnalysis = async () => {
    if (!societeId) return
    setAiAnalyzing(true)
    setAiError(null)
    try {
      const res = await fetch("/api/comptable/rapprochement/smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          use_claude: false, // heuristic only for speed — avoids timeouts
          apply: false,
          ...(selectedPeriode !== 'tout' ? {
            date_debut: selectedPeriode === '2025-2026' ? '2025-07-01' : '2024-07-01',
            date_fin: selectedPeriode === '2025-2026' ? '2026-06-30' : '2025-06-30',
          } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAiError(data.error || "Erreur analyse IA")
        return
      }
      // Index proposals by transaction key
      const byKey: Record<string, any> = {}
      for (const p of data.proposals || []) {
        const key = proposalKey(p.releve_id, p.transaction_idx)
        byKey[key] = p
      }
      setAiProposals(byKey)
      setAiStats({
        auto: data.stats?.auto_apply || 0,
        arbitration: data.stats?.needs_arbitration || 0,
        total: data.stats?.proposed || 0,
        orphans: data.stats?.orphans || 0,
        by_strategy: data.stats?.by_strategy || {},
      } as any)
    } catch (e: any) {
      setAiError("Erreur reseau: " + (e.message || ""))
    } finally { setAiAnalyzing(false) }
  }

  // Apply a single proposal
  const applyAiProposal = async (key: string) => {
    const p = aiProposals[key]
    if (!p) return
    setApplyingKey(key)
    try {
      const res = await fetch("/api/comptable/rapprochement/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          direct_action: {
            tool: "apply_match",
            input: {
              releve_id: p.releve_id,
              transaction_idx: p.transaction_idx,
              facture_ids: p.facture_ids,
              reasoning: p.reasoning,
            },
          },
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.result?.success) {
        alert("Erreur: " + (data.result?.error || data.error || "inconnue"))
        return
      }
      // Remove from proposals
      setAiProposals(prev => { const next = { ...prev }; delete next[key]; return next })
      await load()
    } catch (e: any) {
      alert("Erreur reseau: " + (e.message || ""))
    } finally { setApplyingKey(null) }
  }

  // Apply all high-confidence proposals in batch
  const applyAllHighConfidence = async () => {
    const highConf = Object.entries(aiProposals).filter(([_, p]: any) => !p.needs_arbitration && p.confidence >= 0.85)
    if (highConf.length === 0) return
    if (!confirm(`Appliquer ${highConf.length} rapprochement(s) automatique(s) ?`)) return
    setApplyingBatch(true)
    try {
      for (const [key, p] of highConf) {
        const pp = p as any
        await fetch("/api/comptable/rapprochement/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            societe_id: societeId,
            direct_action: {
              tool: "apply_match",
              input: {
                releve_id: pp.releve_id,
                transaction_idx: pp.transaction_idx,
                facture_ids: pp.facture_ids,
                reasoning: pp.reasoning,
              },
            },
          }),
        })
        setAiProposals(prev => { const next = { ...prev }; delete next[key]; return next })
      }
      await load()
    } catch (e: any) {
      alert("Erreur: " + (e.message || ""))
    } finally { setApplyingBatch(false) }
  }

  const rejectAiProposal = (key: string) => {
    setRejectedProposals(p => new Set([...p, key]))
    setAiProposals(prev => { const next = { ...prev }; delete next[key]; return next })
  }

  // ── Chat IA functions ──────────────────────────────────────────────
  const sendChatMessage = async (overrideText?: string) => {
    const text = overrideText || chatInput.trim()
    if (!text || !societeId || chatLoading) return
    setChatInput('')
    const userMsg = { role: 'user' as const, content: text }
    const updatedMessages = [...chatMessages, userMsg]
    setChatMessages(updatedMessages)
    setChatLoading(true)
    try {
      const res = await fetch('/api/comptable/rapprochement/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societe_id: societeId,
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      const aiMsg = {
        role: 'assistant' as const,
        content: data.response || data.error || 'Erreur inconnue',
        tool_calls: data.tool_calls || [],
      }
      setChatMessages(prev => [...prev, aiMsg])
      // Reload main data if agent applied matches
      const appliedTools = (data.tool_calls || []).filter((t: any) => t.name === 'apply_match' && t.result?.success)
      if (appliedTools.length > 0) await load()
    } catch (e: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `❌ Erreur réseau: ${e.message}` }])
    } finally {
      setChatLoading(false)
    }
  }

  // Auto-scroll chat to bottom
  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

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
          <Button onClick={handleSmartRapprochement} disabled={smartLoading || !societeId} className="text-white" style={{ background: "linear-gradient(135deg, #059669, #0891b2)" }}>
            <Search className={`w-4 h-4 mr-2 ${smartLoading ? "animate-spin" : ""}`} />
            {smartLoading ? "Analyse..." : "🎯 Rapprochement Smart"}
          </Button>
          <Button onClick={runAiAnalysis} disabled={aiAnalyzing || !societeId} className="text-white" style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
            <Sparkles className={`w-4 h-4 mr-2 ${aiAnalyzing ? "animate-spin" : ""}`} />
            {aiAnalyzing ? "Analyse IA..." : "Analyser avec IA"}
          </Button>
          <Button
            onClick={() => setChatOpen(true)}
            disabled={!societeId}
            className="text-white"
            style={{ background: "linear-gradient(135deg, #0891b2, #0e7490)" }}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            💬 Chat IA
          </Button>
          <Button onClick={handleResetAll} disabled={resetting || !societeId} variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
            {resetting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Unlink className="w-4 h-4 mr-2" />}
            Tout reinitialiser
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

      {/* AI Analysis banner */}
      {(aiStats || aiError) && (
        <Card className="border-2" style={{ borderColor: aiError ? '#fca5a5' : '#c4b5fd', background: aiError ? '#fef2f2' : 'linear-gradient(135deg, #f5f3ff, #faf5ff)' }}>
          <CardContent className="p-4">
            {aiError ? (
              <div className="flex items-center gap-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4" />
                <span>{aiError}</span>
                <Button variant="ghost" size="sm" onClick={() => setAiError(null)} className="ml-auto h-6 w-6 p-0"><X className="w-3 h-3" /></Button>
              </div>
            ) : aiStats && (
              <div className="space-y-3">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-purple-900">Analyse terminee</p>
                    <p className="text-xs text-gray-600">
                      {aiStats.total} proposition(s) — {aiStats.auto} auto-matches (haute confiance), {aiStats.arbitration} a arbitrer
                    </p>
                  </div>
                  {aiStats.auto > 0 && (
                    <Button onClick={applyAllHighConfidence} disabled={applyingBatch} size="sm" className="text-white" style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                      {applyingBatch ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                      Tout appliquer ({aiStats.auto})
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => { setAiStats(null); setAiProposals({}); setRejectedProposals(new Set()) }}>
                    Effacer
                  </Button>
                </div>
                {/* Progress bar */}
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full transition-all" style={{
                    width: `${aiStats.total > 0 ? (aiStats.total / (aiStats.total + (aiStats as any).orphans || 1)) * 100 : 0}%`,
                    background: "linear-gradient(90deg, #10b981, #7c3aed)",
                  }} />
                </div>
                {/* Strategy breakdown */}
                {(aiStats as any).by_strategy && Object.keys((aiStats as any).by_strategy).length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap text-[10px]">
                    <span className="text-gray-500 font-medium">Strategies:</span>
                    {Object.entries((aiStats as any).by_strategy).map(([k, v]) => {
                      const labels: Record<string, { label: string; color: string }> = {
                        exact_reference: { label: "Ref. exacte", color: "bg-emerald-100 text-emerald-700" },
                        exact_amount: { label: "Montant exact", color: "bg-green-100 text-green-700" },
                        close_amount: { label: "Montant proche", color: "bg-blue-100 text-blue-700" },
                        grouped_sum: { label: "Paiement groupe", color: "bg-purple-100 text-purple-700" },
                        partial: { label: "Partiel", color: "bg-amber-100 text-amber-700" },
                        historical: { label: "Historique", color: "bg-indigo-100 text-indigo-700" },
                      }
                      const meta = labels[k] || { label: k, color: "bg-gray-100 text-gray-700" }
                      return (
                        <span key={k} className={`px-2 py-0.5 rounded-full font-medium ${meta.color}`}>
                          {meta.label}: {String(v)}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </CardContent>
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
                  .map((tx: any) => {
                    // Find AI proposal for this transaction
                    const txKey = proposalKey(tx.releve_id, tx.transaction_idx ?? tx.idx ?? -1)
                    const proposal = aiProposals[txKey]
                    const isHighConf = proposal?.confidence >= 0.85 && !proposal?.needs_arbitration
                    return (
                    <React.Fragment key={tx.id}>
                    <TableRow className={proposal ? "bg-purple-50/30" : ""}>
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
                    {/* AI proposal inline sub-row */}
                    {proposal && (
                      <TableRow className="border-t-0 bg-purple-50/50">
                        <TableCell colSpan={6} className="py-3">
                          <div className="flex items-start gap-3 pl-4">
                            <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                              <Sparkles className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-xs font-bold text-purple-900">
                                  {proposal.match_type === 'facture_groupee' ? 'Paiement groupe' : 'Proposition IA'}
                                </span>
                                <Badge className={`text-[9px] px-1.5 py-0 ${isHighConf ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {Math.round((proposal.confidence || 0) * 100)}% confiance
                                </Badge>
                                {proposal.within_terms === false && (
                                  <Badge className="text-[9px] px-1.5 py-0 bg-orange-100 text-orange-700">
                                    Hors delais ({proposal.delay_days}j)
                                  </Badge>
                                )}
                                {isHighConf && <Badge className="text-[9px] px-1.5 py-0 bg-green-100 text-green-700">Auto-match</Badge>}
                              </div>
                              <p className="text-[11px] text-gray-600 leading-snug mb-2">{proposal.reasoning}</p>
                              {/* Invoices list */}
                              {proposal.facture_ids && proposal.facture_ids.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                  {proposal.facture_ids.map((fid: string, fi: number) => (
                                    <span key={fi} className="text-[10px] px-2 py-0.5 bg-white border border-purple-200 rounded-full font-mono text-purple-800">
                                      {fid.slice(0, 8)}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {/* Action buttons */}
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="h-7 text-[11px] text-white"
                                  style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
                                  disabled={applyingKey === txKey}
                                  onClick={() => applyAiProposal(txKey)}
                                >
                                  {applyingKey === txKey ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                                  Appliquer le rapprochement
                                </Button>
                                <Button
                                  size="sm" variant="outline"
                                  className="h-7 text-[11px] text-gray-600"
                                  onClick={() => rejectAiProposal(txKey)}
                                >
                                  <X className="w-3 h-3 mr-1" /> Rejeter
                                </Button>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </React.Fragment>
                    )
                  })}
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

      {/* ── Smart Apply Dialog ────────────────────────────────────────── */}
      <Dialog open={smartDialog === 'summary'} onOpenChange={(o) => { if (!o) setSmartDialog(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>🎯 Rapprochement Smart — Résultats</DialogTitle>
          </DialogHeader>
          {smartResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-green-700">{smartResult.auto_apply || 0}</p>
                  <p className="text-xs text-green-600">Haute confiance (≥85%)</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-orange-700">{smartResult.needs_arbitration || 0}</p>
                  <p className="text-xs text-orange-600">À valider manuellement</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-2xl font-bold text-gray-700">{smartResult.orphans || 0}</p>
                  <p className="text-xs text-gray-500">Orphelins</p>
                </div>
              </div>
              {(smartResult.pre_classified || 0) > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                  <p className="text-sm font-medium text-blue-700">
                    🏷️ {smartResult.pre_classified} classifiés par règles auto
                  </p>
                  <p className="text-xs text-blue-500 mt-0.5">Frais bancaires · MRA · Salaires · Internes · Associés</p>
                </div>
              )}
              <p className="text-sm text-gray-500 text-center">
                {smartResult.proposed || 0} match{smartResult.proposed !== 1 ? 'es' : ''} proposé{smartResult.proposed !== 1 ? 's' : ''} sur {smartResult.total || 0} transaction{smartResult.total !== 1 ? 's' : ''} non-rapprochée{smartResult.total !== 1 ? 's' : ''}
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleSmartApplyAll}
                  disabled={smartLoading || (smartResult.auto_apply || 0) === 0}
                  className="w-full text-white"
                  style={{ background: "linear-gradient(135deg, #059669, #0891b2)" }}
                >
                  {smartLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                  Appliquer tout (≥85%) — {smartResult.auto_apply || 0} rapprochements
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setSmartDialog('list')}
                  disabled={(smartProposals.length || 0) === 0}
                  className="w-full"
                >
                  <Search className="w-4 h-4 mr-2" />
                  Voir les propositions ({smartProposals.length})
                </Button>
                <Button variant="ghost" onClick={() => setSmartDialog(null)} className="w-full">
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={smartDialog === 'list'} onOpenChange={(o) => { if (!o) setSmartDialog('summary') }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>🎯 Propositions Smart ({smartProposals.length})</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Section règles auto (pre_classified) */}
            {smartProposals.some((p: any) => p.pre_classified) && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                  🏷️ Règles automatiques ({smartProposals.filter((p: any) => p.pre_classified).length})
                </p>
                <div className="space-y-1.5">
                  {smartProposals.filter((p: any) => p.pre_classified).map((p: any, idx: number) => {
                    const typeConfig: Record<string, { label: string; icon: string; color: string }> = {
                      frais_bancaires:    { label: 'Frais bancaires', icon: '🏦', color: 'bg-gray-100 text-gray-700 border-gray-200' },
                      paiement_mra:       { label: 'MRA', icon: '🏛️', color: 'bg-red-50 text-red-700 border-red-200' },
                      salaire_individuel: { label: 'Salaire', icon: '👤', color: 'bg-green-50 text-green-700 border-green-200' },
                      salaire_bulk:       { label: 'Salaires bulk', icon: '👥', color: 'bg-green-50 text-green-700 border-green-200' },
                      transfert_interne:  { label: 'Interne', icon: '🔄', color: 'bg-blue-50 text-blue-700 border-blue-200' },
                      associe:            { label: 'Associé', icon: '🤝', color: 'bg-purple-50 text-purple-700 border-purple-200' },
                    }
                    const cfg = typeConfig[p.match_type] || { label: p.match_type, icon: '🏷️', color: 'bg-gray-50 text-gray-700 border-gray-200' }
                    return (
                      <div key={`rule-${idx}`} className={`border rounded-lg p-3 text-sm ${cfg.color}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium truncate max-w-[220px]">{p.transaction?.libelle || '—'}</span>
                          <Badge variant="outline" className={`text-xs ${cfg.color}`}>
                            {cfg.icon} {cfg.label}
                          </Badge>
                        </div>
                        <div className="flex justify-between text-xs opacity-70">
                          <span>{p.transaction?.date || '—'}</span>
                          <span className="font-mono">{p.transaction?.debit ? `-${fmt(p.transaction.debit)}` : `+${fmt(p.transaction?.credit || 0)}`} MUR</span>
                        </div>
                        <div className="mt-1 text-xs opacity-60 italic">{p.reasoning}</div>
                        <div className="mt-1">
                          <span className="text-xs font-medium opacity-80">Appliquer (règle auto)</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {/* Section matching heuristique */}
            {smartProposals.some((p: any) => !p.pre_classified) && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                  🔍 Matching heuristique ({smartProposals.filter((p: any) => !p.pre_classified).length})
                </p>
                <div className="space-y-1.5">
                  {smartProposals.filter((p: any) => !p.pre_classified).map((p: any, idx: number) => (
                    <div key={`engine-${idx}`} className={`border rounded-lg p-3 text-sm ${p.confidence >= 0.85 ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium truncate max-w-[200px]">{p.transaction?.libelle || '—'}</span>
                        <Badge className={p.confidence >= 0.85 ? 'bg-green-600' : 'bg-orange-500'}>
                          {Math.round(p.confidence * 100)}%
                        </Badge>
                      </div>
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>{p.transaction?.date || '—'}</span>
                        <span className="font-mono">{p.transaction?.debit ? `-${fmt(p.transaction.debit)}` : `+${fmt(p.transaction?.credit || 0)}`} MUR</span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        <span className="font-medium">Facture(s) :</span> {p.factures?.map((f: any) => f.numero_facture || f.tiers).join(', ') || '—'}
                      </div>
                      <div className="mt-1 text-xs text-gray-400 italic">{p.reasoning}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-2 sticky bottom-0 bg-white border-t">
            <Button onClick={handleSmartApplyAll} disabled={smartLoading || (smartResult?.auto_apply || 0) === 0} className="flex-1 text-white" style={{ background: "linear-gradient(135deg, #059669, #0891b2)" }}>
              {smartLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
              Appliquer (≥85%)
            </Button>
            <Button variant="outline" onClick={() => setSmartDialog('summary')} className="flex-1">Retour</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Chat IA Panel (fixed right drawer) ───────────────────────── */}
      {chatOpen && (
        <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#0891b2] to-[#0e7490] text-white">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              <div>
                <p className="font-semibold text-sm">LEXORA AI</p>
                <p className="text-xs opacity-80">Expert Rapprochement</p>
              </div>
              <div className={`ml-2 w-2 h-2 rounded-full ${chatLoading ? 'bg-yellow-300 animate-pulse' : 'bg-green-300'}`} />
            </div>
            <Button variant="ghost" size="sm" onClick={() => setChatOpen(false)} className="text-white hover:bg-white/20 p-1">
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Quick action button */}
          <div className="px-3 py-2 border-b border-gray-100">
            <Button
              className="w-full text-white text-xs h-8"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
              disabled={chatLoading}
              onClick={() => sendChatMessage("Lance une analyse complète du rapprochement bancaire : charge les patterns, liste les transactions non rapprochées, trouve les factures correspondantes, applique les matches certains et propose les ambigus.")}
            >
              <Sparkles className="w-3 h-3 mr-1" />
              🤖 Lancer analyse complète
            </Button>
          </div>

          {/* Quick chips */}
          <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap gap-1">
            {[
              "Analyse toutes les transactions",
              "Montre les orphelins",
              "Applique les patterns mémorisés",
              "Rapport de cohérence",
            ].map(chip => (
              <button
                key={chip}
                onClick={() => sendChatMessage(chip)}
                disabled={chatLoading}
                className="text-xs px-2 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50 transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 px-3 py-3">
            {chatMessages.length === 0 && (
              <div className="text-center text-gray-400 text-sm mt-8 space-y-2">
                <Bot className="w-8 h-8 mx-auto opacity-40" />
                <p>Bonjour ! Je suis LEXORA AI.</p>
                <p className="text-xs">Posez-moi une question ou lancez une analyse complète.</p>
              </div>
            )}
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`mb-3 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-[#0891b2] text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0 && (
                    <details className="mb-2 text-xs">
                      <summary className="cursor-pointer text-gray-500 flex items-center gap-1">
                        <Wrench className="w-3 h-3" />
                        {msg.tool_calls.length} outil(s) utilisé(s)
                      </summary>
                      <div className="mt-1 space-y-1 pl-2 border-l-2 border-gray-300">
                        {msg.tool_calls.map((t: any, ti: number) => (
                          <div key={ti} className="text-gray-500">
                            <span className="font-mono text-[10px] bg-gray-200 px-1 rounded">{t.name}</span>
                            {t.result?.success === false && (
                              <span className="ml-1 text-red-500">❌ {t.result.error}</span>
                            )}
                            {t.result?.success === true && (
                              <span className="ml-1 text-green-600">✅</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start mb-3">
                <div className="bg-gray-100 rounded-xl px-3 py-2 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin text-gray-500" />
                  <span className="text-xs text-gray-500">LEXORA AI réfléchit...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </ScrollArea>

          {/* Input */}
          <div className="px-3 py-3 border-t border-gray-200">
            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage() } }}
                placeholder="Posez une question..."
                disabled={chatLoading}
                className="flex-1 text-sm h-9"
              />
              <Button
                onClick={() => sendChatMessage()}
                disabled={chatLoading || !chatInput.trim()}
                size="sm"
                className="h-9 px-3 bg-[#0891b2] hover:bg-[#0e7490] text-white"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1 text-center">Entrée pour envoyer · Ctrl+Entrée pour saut de ligne</p>
          </div>
        </div>
      )}

    </div>
  )
}
