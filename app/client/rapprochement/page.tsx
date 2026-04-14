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
import { Loader2, RefreshCw, Link2, Unlink, Zap, CheckCircle2, AlertCircle, Users, Search, ChevronDown, ChevronUp, Sparkles, Send, Bot, Wrench, X, Target, BrainCircuit, BarChart3 } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Checkbox } from "@/components/ui/checkbox"
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

  // Auto-classer preview dialog (shown before running the deterministic agent)
  const [autoPreview, setAutoPreview] = useState<null | {
    salaires: { count: number; total: number }
    mra: { count: number; total: number }
    frais: { count: number; total: number }
    internes: { count: number; total: number }
    remboursements: { count: number; total: number }
  }>(null)

  // Pagination — Factures fournisseurs table (Part 1: 20/page).
  const [facturesPage, setFacturesPage] = useState(1)
  const FACTURES_PAGE_SIZE = 20
  const [selectedSmartKeys, setSelectedSmartKeys] = useState<Set<string>>(new Set())
  const [applyingSelection, setApplyingSelection] = useState(false)

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

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
      if (!res.ok) { showToast('Erreur apply: ' + (data.error || 'inconnue'), 'error'); return }
      showToast(`✅ ${data.applied} rapprochements appliqués${data.skipped > 0 ? ` · ${data.skipped} ignorés` : ''}`)
      setSmartDialog(null)
      setSmartProposals([])
      setSmartResult(null)
      setSelectedSmartKeys(new Set())
      await load()
    } catch (e: any) {
      showToast('Erreur reseau: ' + (e.message || ''), 'error')
    } finally { setSmartLoading(false) }
  }

  const handleSmartApplySelection = async () => {
    if (!societeId || selectedSmartKeys.size === 0) return
    const toApply = smartProposals.filter((_p: any, i: number) => selectedSmartKeys.has(String(i)))
    if (toApply.length === 0) return
    setApplyingSelection(true)
    try {
      const res = await fetch('/api/comptable/rapprochement/smart/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societe_id: societeId,
          proposals: toApply,
          min_confidence: 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) { showToast('Erreur apply: ' + (data.error || 'inconnue'), 'error'); return }
      showToast(`✅ ${data.applied} rapprochements appliqués`)
      setSmartDialog(null)
      setSmartProposals([])
      setSmartResult(null)
      setSelectedSmartKeys(new Set())
      await load()
    } catch (e: any) {
      showToast('Erreur reseau: ' + (e.message || ''), 'error')
    } finally { setApplyingSelection(false) }
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

  /**
   * Compute a preview of what the deterministic agent will classify from
   * the current unmatched-transactions list — using the same rules the
   * server applies. Values here are indicative; the server remains the
   * source of truth when actually applying.
   */
  const computeAutoPreview = () => {
    const u = (transactions as any[]).filter((t: any) =>
      t.statut !== 'rapproche' && t.statut !== 'interne' && t.statut !== 'propose' && t.statut !== 'a_verifier'
    )
    const amtOf = (t: any) => Math.max(Number(t.debit) || 0, Number(t.credit) || 0)
    const lib = (t: any) => String(t.libelle || '').toLowerCase()
    const tiers = (t: any) => String(t.tiers_detecte || '').toLowerCase()

    const salaires = { count: 0, total: 0 }
    const mra = { count: 0, total: 0 }
    const frais = { count: 0, total: 0 }
    const internes = { count: 0, total: 0 }
    const remboursements = { count: 0, total: 0 }

    for (const t of u) {
      const a = amtOf(t)
      const L = lib(t)
      const T = tiers(t)

      // Remboursement perso (RBT CC STEPHANE HENRI BACH)
      if (L.includes('rbt cc') || T.includes('stephane henri bach')) {
        remboursements.count++; remboursements.total += a; continue
      }
      // Virement interne (IB Own Account Transfer, DDS↔OCC)
      if (L.includes('ib own account') || L.includes('own account transfer') || L.includes('virement interne')) {
        internes.count++; internes.total += a; continue
      }
      // MRA
      if (T.includes('mauritius revenue') || L.includes('direct debit') && L.includes('mra')) {
        mra.count++; mra.total += a; continue
      }
      // Salaires (bulk ou individuels marqués PERSONNEL/SALARY)
      if (L.includes('salary') || L.includes('salaire') || (L.includes('bulk payment') && (L.includes('personnel') || L.includes('salary')))
          || T === 'personnel' || T === 'salary') {
        salaires.count++; salaires.total += a; continue
      }
      // Frais bancaires (MCB/MASTERCARD, petits montants)
      const feeKeywords = ['fee', 'subs', 'interest', 'penalty', 'service charge', 'commission', 'frais']
      if ((T.includes('mcb') || T.includes('mastercard') || feeKeywords.some(k => L.includes(k))) && a > 0 && a < 2000) {
        frais.count++; frais.total += a; continue
      }
    }
    return { salaires, mra, frais, internes, remboursements }
  }

  const openAutoClasserPreview = () => {
    if (!societeId) return
    setAutoPreview(computeAutoPreview())
  }

  const confirmAutoClasser = () => {
    setAutoPreview(null)
    openAgentIA()
  }

  // Open chat + auto-launch full analysis
  const openAgentIA = () => {
    if (!societeId) return
    setChatOpen(true)
    // Add a message immediately so the user sees activity
    setTimeout(() => {
      const prompt = 'Analyse toutes les transactions non rapprochées et applique les matches haute confiance'
      setChatMessages(prev => {
        // Avoid duplicating if already launched
        if (prev.some(m => m.role === 'user' && m.content === prompt)) return prev
        return [...prev, { role: 'user' as const, content: prompt }]
      })
      setChatLoading(true)
      fetch('/api/comptable/rapprochement/agent/deterministic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: societeId }),
      }).then(r => r.json()).then(data => {
        const content = data.summary || data.message || data.error || 'Agent déterministe terminé.'
        setChatMessages(prev => [...prev, { role: 'assistant' as const, content, tool_calls: [] }])
        if ((data.matched || 0) > 0) {
          load()
          showToast(`✅ ${data.matched} transactions rapprochées par l'agent IA`)
        }
      }).catch((e: any) => {
        setChatMessages(prev => [...prev, { role: 'assistant' as const, content: `❌ Erreur agent: ${e.message}`, tool_calls: [] }])
      }).finally(() => setChatLoading(false))
    }, 100)
  }

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
        showToast("Erreur: " + (data.result?.error || data.error || "inconnue"), 'error')
        return
      }
      showToast("✅ Rapprochement appliqué")
      // Remove from proposals
      setAiProposals(prev => { const next = { ...prev }; delete next[key]; return next })
      await load()
    } catch (e: any) {
      showToast("Erreur reseau: " + (e.message || ""), 'error')
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
      showToast(`✅ ${highConf.length} rapprochements appliqués`)
      await load()
    } catch (e: any) {
      showToast("Erreur: " + (e.message || ""), 'error')
    } finally { setApplyingBatch(false) }
  }

  const rejectAiProposal = (key: string) => {
    setRejectedProposals(p => new Set([...p, key]))
    setAiProposals(prev => { const next = { ...prev }; delete next[key]; return next })
  }

  // ── Agent déterministe (fallback sans LLM) ────────────────────────
  const runDeterministicAgent = async (): Promise<void> => {
    if (!societeId) return
    setChatLoading(true)
    try {
      const res = await fetch('/api/comptable/rapprochement/agent/deterministic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: societeId }),
      })
      const data = await res.json()
      const content = data.summary || data.message || data.error || 'Agent déterministe terminé.'
      setChatMessages(prev => [...prev, { role: 'assistant', content, tool_calls: [] }])
      if ((data.matched || 0) > 0) await load()
    } catch (e: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `❌ Erreur agent déterministe: ${e.message}` }])
    } finally {
      setChatLoading(false)
    }
  }

  // ── Patterns apply ────────────────────────────────────────────────
  const runApplyPatterns = async (): Promise<void> => {
    if (!societeId) return
    setChatLoading(true)
    try {
      const res = await fetch('/api/comptable/rapprochement/patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', societe_id: societeId }),
      })
      const data = await res.json()
      const content = data.message || data.error || 'Patterns appliqués.'
      setChatMessages(prev => [...prev, { role: 'assistant', content, tool_calls: [] }])
      if (res.ok) await load()
    } catch (e: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `❌ Erreur patterns: ${e.message}` }])
    } finally {
      setChatLoading(false)
    }
  }

  // ── Chat IA functions ──────────────────────────────────────────────
  const sendChatMessage = async (overrideText?: string) => {
    const text = overrideText || chatInput.trim()
    if (!text || !societeId || chatLoading) return

    // Handle special chip actions without going through the LLM
    if (text === 'Analyse toutes les transactions') {
      const userMsg = { role: 'user' as const, content: text }
      setChatMessages(prev => [...prev, userMsg])
      setChatInput('')
      await runDeterministicAgent()
      return
    }
    if (text === 'Applique les patterns mémorisés') {
      const userMsg = { role: 'user' as const, content: text }
      setChatMessages(prev => [...prev, userMsg])
      setChatInput('')
      await runApplyPatterns()
      return
    }

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
      // Fallback automatique vers agent déterministe si ANTHROPIC_API_KEY absent
      if (res.status === 503 || (data.error || '').includes('ANTHROPIC_API_KEY')) {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: '⚠️ ANTHROPIC_API_KEY non configurée — bascule automatique sur l\'agent déterministe…',
          tool_calls: [],
        }])
        await runDeterministicAgent()
        return
      }
      let content = data.response || data.error || 'Erreur inconnue'
      const aiMsg = {
        role: 'assistant' as const,
        content,
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

  // Reset factures pagination whenever the filters change so the user never
  // lands on a stale empty page (e.g. change month → fewer rows → old page
  // is out of bounds until our clamp logic kicks in).
  useEffect(() => { setFacturesPage(1) }, [societeId, selectedMois, selectedPeriode])

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
      if (!res.ok) {
        const errMsg = d.error || d.message || JSON.stringify(d).substring(0, 300)
        alert(`ERREUR RAPPROCHEMENT (${res.status}):\n\n${errMsg}\n\nPhase: ${d._phase || 'inconnue'}`)
        showToast(`Erreur serveur: ${errMsg}`, 'error')
        return
      }
      const result = { matched: d.matched || 0, total: d.total || 0, interne: d.interne || 0, frais_bancaires: d.frais_bancaires || 0, salaire_bulk: d.salaire_bulk || 0, mra: d.mra || 0, not_matched: d.not_matched || 0, total_classified: d.total_classified || 0, matches: d.matches || [] }
      setAutoResult(result)
      const totalDone = (result.matched || 0) + (result.interne || 0) + (result.frais_bancaires || 0) + (result.salaire_bulk || 0) + (result.mra || 0)
      const dbg = d._debug || {}
      if (totalDone > 0) {
        showToast(`✅ ${totalDone} transactions classifiées (${result.frais_bancaires} frais · ${result.mra} MRA · ${result.salaire_bulk} salaires · ${result.matched} factures) — ${dbg.duration_ms || '?'}ms`)
      } else {
        showToast(`⚠️ 0 résultat — total=${result.total}, factures=${dbg.factures_count || '?'}, non-classifiées=${dbg.global_unclassified || '?'}, version=${dbg.version || 'inconnue'}`, 'error')
      }
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
  // ── 4 catégories claires ──────────────────────────────────────
  // 1. VERT: Rapproché AVEC pièce comptable (facture matchée)
  const matchedWithInvoice = transactions.filter((t: any) =>
    (t.statut === 'rapproche') && (t.facture_id || (Array.isArray(t.facture_ids) && t.facture_ids.length > 0))
  )
  // 2. BLEU: Classifié SANS pièce (frais bancaires, salaires, MRA, charges)
  const classifiedAuto = transactions.filter((t: any) =>
    t.statut === 'rapproche' && !t.facture_id && !(Array.isArray(t.facture_ids) && t.facture_ids.length > 0) &&
    ['frais_bancaires', 'salaire_bulk', 'salaire_bulk_non_verifie', 'salaire_individuel', 'paiement_mra', 'paiement_mra_non_verifie', 'charges_sociales', 'reversal_salaire'].includes(t.matched_type)
  )
  // 3. GRIS: Virements internes
  const interne = transactions.filter((t: any) => t.statut === 'interne' || t.matched_type === 'transfert_interne')
  // 4. ORANGE: Payé sans pièce comptable (rapproché mais ni facture ni classification reconnue)
  const paidNoInvoice = transactions.filter((t: any) =>
    t.statut === 'rapproche' && !t.facture_id && !(Array.isArray(t.facture_ids) && t.facture_ids.length > 0) &&
    !['frais_bancaires', 'salaire_bulk', 'salaire_bulk_non_verifie', 'salaire_individuel', 'paiement_mra', 'paiement_mra_non_verifie', 'charges_sociales', 'reversal_salaire'].includes(t.matched_type)
  )
  // 5. JAUNE: Propositions à valider
  const proposed = transactions.filter((t: any) => t.statut === 'propose' || t.statut === 'a_verifier')
  // 6. ROUGE: Non rapproché
  const unmatched = transactions.filter((t: any) =>
    t.statut !== 'rapproche' && t.statut !== 'interne' && t.statut !== 'propose' && t.statut !== 'a_verifier'
  )
  // Legacy compatibility
  const matched = [...matchedWithInvoice, ...classifiedAuto, ...paidNoInvoice]

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
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

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
          <Button onClick={handleResetAll} disabled={resetting || !societeId} variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
            {resetting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Unlink className="w-4 h-4 mr-2" />}
            Réinitialiser
          </Button>
        </div>
      </div>

      {/* ── Bouton unique: Rapprocher automatiquement ─────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-500">
          Rapprochement automatique : frais bancaires, MRA, salaires, virements internes, factures fournisseurs.
        </div>
        <Button
          onClick={handleAutoMatch}
          disabled={autoMatching || !societeId}
          className="bg-[#D4AF37] hover:bg-[#C9A82E] text-[#0B0F2E] font-semibold"
          size="lg"
        >
          {autoMatching
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{autoStep || "Analyse en cours..."}</>
            : <><span className="mr-2">✨</span>Rapprocher automatiquement</>
          }
        </Button>
      </div>
      {/* ── Section "💳 Factures fournisseurs" ─────────────────────────────
          Statut calculé par facture, tenant compte de la présence d'un
          relevé pour le mois de paiement. Ne montre JAMAIS "En retard"
          quand le relevé du mois n'est pas disponible. */}
      {(() => {
        const allFactures = (data?.factures || []) as any[]
        const releves = (data?.releves || []) as any[]
        if (allFactures.length === 0 && !selectedMois) return null

        // Helper: is there a releve for a given YYYY-MM on this société?
        const monthHasReleve = (ym: string | null | undefined): boolean => {
          if (!ym) return false
          return releves.some((r: any) => {
            const p = String(r.periode || '').slice(0, 7)
            if (p === ym) return true
            if (r.date_debut && r.date_fin) {
              return String(r.date_debut).slice(0, 7) <= ym && ym <= String(r.date_fin).slice(0, 7)
            }
            return false
          })
        }

        // Filter factures by selectedMois (date_facture) + selectedPeriode.
        // Fallbacks: keep 'paye' and 'en_attente'/'partiel'/'retard'.
        const factureMois = (f: any): string | null =>
          f.date_facture ? String(f.date_facture).slice(0, 7) : null
        const fournFactures = allFactures
          .filter((f: any) => f.type_facture !== 'client') // suppliers only
          .filter((f: any) => !selectedMois || factureMois(f) === selectedMois)

        if (fournFactures.length === 0) return null

        // Compute display status per facture.
        type FactureRow = {
          f: any
          status: 'paye' | 'releve_manquant' | 'en_attente' | 'en_retard'
          label: string
          badgeCls: string
          payDate?: string | null
        }
        const today = new Date().toISOString().slice(0, 10)
        const rows: FactureRow[] = fournFactures.map((f: any) => {
          const isPaye = f.statut === 'paye'
          const echeance = f.date_echeance ? String(f.date_echeance).slice(0, 10) : null
          const payMonth = isPaye && f.rapproche_date
            ? String(f.rapproche_date).slice(0, 7)
            : (factureMois(f))
          const releveExists = monthHasReleve(payMonth)

          if (isPaye) {
            return {
              f, status: 'paye',
              label: '✅ Payé',
              badgeCls: 'bg-green-100 text-green-700 border-green-200',
              payDate: f.rapproche_date || null,
            }
          }
          // Not paid yet — decide based on releve availability
          if (!releveExists) {
            return {
              f, status: 'releve_manquant',
              label: '📋 Relevé manquant',
              badgeCls: 'bg-orange-100 text-orange-700 border-orange-200',
            }
          }
          if (echeance && echeance < today) {
            return {
              f, status: 'en_retard',
              label: '🔴 En retard',
              badgeCls: 'bg-red-100 text-red-700 border-red-200',
            }
          }
          return {
            f, status: 'en_attente',
            label: '⏳ En attente',
            badgeCls: 'bg-amber-100 text-amber-700 border-amber-200',
          }
        })

        const counts = {
          paye: rows.filter(r => r.status === 'paye').length,
          missingReleve: rows.filter(r => r.status === 'releve_manquant').length,
          attente: rows.filter(r => r.status === 'en_attente').length,
          retard: rows.filter(r => r.status === 'en_retard').length,
        }

        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-[#0B0F2E] flex items-center gap-2">
                <span>💳</span> Factures fournisseurs
                <span className="text-xs font-normal text-gray-500 ml-2">
                  {rows.length} facture{rows.length > 1 ? 's' : ''}{selectedMois ? ` pour ${selectedMois}` : ''}
                </span>
              </CardTitle>
              <div className="flex flex-wrap gap-3 text-xs text-gray-500 pt-1">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />{counts.paye} payées</span>
                {counts.missingReleve > 0 && <span className="flex items-center gap-1 text-orange-700"><span className="w-2 h-2 rounded-full bg-orange-500" />{counts.missingReleve} relevé manquant</span>}
                {counts.attente > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />{counts.attente} en attente</span>}
                {counts.retard > 0 && <span className="flex items-center gap-1 text-red-700"><span className="w-2 h-2 rounded-full bg-red-500" />{counts.retard} en retard</span>}
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {(() => {
                // Pagination — clamp page if the rows length shrinks.
                const totalPages = Math.max(1, Math.ceil(rows.length / FACTURES_PAGE_SIZE))
                const safePage = Math.min(Math.max(1, facturesPage), totalPages)
                const start = (safePage - 1) * FACTURES_PAGE_SIZE
                const pageRows = rows.slice(start, start + FACTURES_PAGE_SIZE)
                return (
              <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fournisseur</TableHead>
                    <TableHead>N° Facture</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Paiement</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map(({ f, label, badgeCls, payDate, status }) => (
                    <TableRow key={f.id}>
                      <TableCell className="text-sm font-medium">
                        <TruncatedCell text={f.tiers || '—'} />
                      </TableCell>
                      <TableCell className="text-sm font-mono text-gray-600">
                        {f.numero_facture || '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {fmt(Number(f.montant_ttc) || Number(f.montant_mur) || 0)}{' '}
                        <span className="text-xs text-gray-400">{f.devise || 'MUR'}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={`border ${badgeCls} font-medium`}>
                          {label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {status === 'paye' && payDate ? `Virement du ${formatDate(payDate)}` : '—'}
                      </TableCell>
                      <TableCell>
                        {status !== 'paye' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              // Pre-open manual lettrage dialog on the unmatched side
                              setDialogTab('factures')
                              // Find a matching unmatched transaction to pre-fill
                              const prefill = unmatched.find((t: any) =>
                                Number(t.debit) > 0 &&
                                Math.abs(Number(t.debit) - (Number(f.montant_ttc) || 0)) < (Number(f.montant_ttc) || 1) * 0.05
                              )
                              setLinkDialog(prefill || { preselected_facture_id: f.id })
                            }}
                          >
                            Lettrer
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t bg-gray-50/50 px-4 py-2 text-sm">
                  <span className="text-gray-600">
                    Page <strong>{safePage}</strong> sur {totalPages}{" "}
                    <span className="text-gray-400">· {rows.length} facture{rows.length > 1 ? "s" : ""}</span>
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage <= 1}
                      onClick={() => setFacturesPage(p => Math.max(1, p - 1))}
                      className="h-7 text-xs"
                    >
                      ← Précédent
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage >= totalPages}
                      onClick={() => setFacturesPage(p => Math.min(totalPages, p + 1))}
                      className="h-7 text-xs"
                    >
                      Suivant →
                    </Button>
                  </div>
                </div>
              )}
              </>
                )
              })()}
            </CardContent>
          </Card>
        )
      })()}

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

      {/* ── Statut du relevé pour le mois sélectionné ──────────────────── */}
      {selectedMois && (() => {
        const releves = data?.releves || []
        const releveForMonth = releves.find((r: any) => {
          const p = String(r.periode || '').slice(0, 7)
          if (p === selectedMois) return true
          // Fallback: match by date_debut / date_fin range
          if (r.date_debut && r.date_fin) {
            return String(r.date_debut).slice(0, 7) <= selectedMois
              && selectedMois <= String(r.date_fin).slice(0, 7)
          }
          return false
        })
        const [y, m] = selectedMois.split('-')
        const MOIS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
        const moisLabel = `${MOIS_FR[parseInt(m) - 1]} ${y}`

        if (releveForMonth) {
          return (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-green-900">
                ✅ Relevé de <strong>{moisLabel}</strong> importé — rapprochement possible pour ce mois.
              </span>
            </div>
          )
        }
        return (
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 flex items-start gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="text-orange-900">
              <strong>⚠ Relevé bancaire de {moisLabel} non disponible.</strong>{" "}
              Les factures de ce mois ne peuvent pas être vérifiées automatiquement.
              Importez le relevé dans <a href="/client/documents" className="underline font-medium">Documents & OCR</a> pour continuer.
            </div>
          </div>
        )
      })()}

      {/* Auto-rapprochement progress */}
      {autoStep && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-sm text-blue-800">{autoStep}</span>
          </CardContent>
        </Card>
      )}

      {/* SECTION 3a — Rapprochées AVEC facture (vert) */}
      {matchedWithInvoice.length > 0 && (
        <Card className="border-green-200">
          <CardHeader className="cursor-pointer" onClick={() => setMatchedOpen(!matchedOpen)}>
            <CardTitle className="text-[#0B0F2E] flex items-center justify-between">
              <span className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-600" />✅ Transactions confirmées ({matchedWithInvoice.length})</span>
              {matchedOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </CardTitle>
          </CardHeader>
          {matchedOpen && (
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Montant</TableHead><TableHead>Tiers</TableHead><TableHead>Type</TableHead><TableHead>Lettre</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {matchedWithInvoice.map((tx: any) => (
                    <TableRow key={tx.id} className="bg-green-50/50">
                      <TableCell className="text-sm">{formatDate(tx.date)}</TableCell>
                      <TableCell className="text-sm"><TruncatedCell text={tx.libelle} /></TableCell>
                      <TableCell className="text-right font-medium">{Number(tx.debit) > 0 ? <span className="text-red-600">-{fmt(Number(tx.debit))} {tx.devise}</span> : <span className="text-green-600">+{fmt(Number(tx.credit))} {tx.devise}</span>}</TableCell>
                      <TableCell className="text-sm">{tx.tiers_detecte || "—"}</TableCell>
                      <TableCell><Badge className="bg-green-100 text-green-700 text-[10px]">{tx.matched_type || 'facture'}</Badge></TableCell>
                      <TableCell><Badge className="bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3" /></Badge></TableCell>
                      <TableCell><Button variant="ghost" size="sm" onClick={() => handleUnlink(tx)}><Unlink className="w-4 h-4 text-red-500" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      )}

      {/* SECTION 3b — Classifiées auto SANS facture (bleu) */}
      {classifiedAuto.length > 0 && (
        <Card className="border-blue-200">
          <CardHeader>
            <CardTitle className="text-[#0B0F2E] flex items-center gap-2 text-base">
              📋 Classifiées automatiquement — sans pièce comptable ({classifiedAuto.length})
            </CardTitle>
            <p className="text-xs text-gray-500">Frais bancaires, salaires, charges sociales, paiements MRA — lettrées automatiquement</p>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Montant</TableHead><TableHead>Tiers</TableHead><TableHead>Type</TableHead><TableHead>Lettre</TableHead></TableRow></TableHeader>
              <TableBody>
                {classifiedAuto.map((tx: any) => (
                  <TableRow key={tx.id} className="bg-blue-50/30">
                    <TableCell className="text-sm">{formatDate(tx.date)}</TableCell>
                    <TableCell className="text-sm"><TruncatedCell text={tx.libelle} /></TableCell>
                    <TableCell className="text-right font-medium">{Number(tx.debit) > 0 ? <span className="text-red-600">-{fmt(Number(tx.debit))} {tx.devise}</span> : <span className="text-green-600">+{fmt(Number(tx.credit))} {tx.devise}</span>}</TableCell>
                    <TableCell className="text-sm">{tx.tiers_detecte || "—"}</TableCell>
                    <TableCell><Badge className="bg-blue-100 text-blue-700 text-[10px]">{tx.matched_type?.replace(/_/g, ' ') || '—'}</Badge></TableCell>
                    <TableCell><Badge className="bg-blue-100 text-blue-700"><CheckCircle2 className="w-3 h-3" /></Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* SECTION 3c — Payées SANS pièce comptable — collapsed by default (Avancé) */}
      {paidNoInvoice.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-[#0B0F2E] py-2 px-2 rounded-md hover:bg-gray-50">
            <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform" />
            🔧 Avancé — Payées sans pièce comptable à vérifier ({paidNoInvoice.length})
          </summary>
          <Card className="border-amber-300 bg-amber-50/30 mt-2">
            <CardHeader>
              <CardTitle className="text-amber-800 flex items-center gap-2 text-base">
                ⚠️ Payées sans pièce comptable — à vérifier ({paidNoInvoice.length})
              </CardTitle>
              <p className="text-xs text-amber-600">Transactions rapprochées mais ne correspondant à aucune facture ni classification reconnue. Vérifiez manuellement.</p>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead><TableHead>Tiers</TableHead><TableHead>Type détecté</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {paidNoInvoice.map((tx: any) => (
                    <TableRow key={tx.id} className="bg-amber-50/50">
                      <TableCell className="text-sm">{formatDate(tx.date)}</TableCell>
                      <TableCell className="text-sm"><TruncatedCell text={tx.libelle} /></TableCell>
                      <TableCell className="text-right text-sm text-red-600">{Number(tx.debit) > 0 ? fmt(Number(tx.debit)) + ' ' + tx.devise : "—"}</TableCell>
                      <TableCell className="text-right text-sm text-green-600">{Number(tx.credit) > 0 ? fmt(Number(tx.credit)) + ' ' + tx.devise : "—"}</TableCell>
                      <TableCell className="text-sm font-medium">{tx.tiers_detecte || "—"}</TableCell>
                      <TableCell><Badge className="bg-amber-100 text-amber-700 text-[10px]">{tx.matched_type?.replace(/_/g, ' ') || 'inconnu'}</Badge></TableCell>
                      <TableCell><Button variant="ghost" size="sm" onClick={() => handleUnlink(tx)} title="Délettrer"><Unlink className="w-4 h-4 text-amber-600" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </details>
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

      {/* SECTION 3d — Virements internes (dépliable) */}
      {interne.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer">
            <Card className="border-gray-200">
              <CardHeader className="py-3">
                <CardTitle className="text-gray-500 flex items-center gap-2 text-base">
                  ↔ Virements internes ({interne.length})
                  <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform ml-auto" />
                </CardTitle>
              </CardHeader>
            </Card>
          </summary>
          <Card className="border-gray-200 border-t-0 rounded-t-none">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead><TableHead>Tiers</TableHead><TableHead>Devise</TableHead></TableRow></TableHeader>
                <TableBody>
                  {interne.slice(0, 30).map((tx: any) => (
                    <TableRow key={tx.id} className="bg-gray-50/30">
                      <TableCell className="text-sm text-gray-500">{formatDate(tx.date)}</TableCell>
                      <TableCell className="text-sm text-gray-500"><TruncatedCell text={tx.libelle} /></TableCell>
                      <TableCell className="text-right text-sm text-red-400">{Number(tx.debit) > 0 ? fmt(Number(tx.debit)) : "—"}</TableCell>
                      <TableCell className="text-right text-sm text-green-400">{Number(tx.credit) > 0 ? fmt(Number(tx.credit)) : "—"}</TableCell>
                      <TableCell className="text-sm text-gray-400">{tx.tiers_detecte || "—"}</TableCell>
                      <TableCell className="text-xs text-gray-400">{tx.devise}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {interne.length > 30 && <p className="text-xs text-gray-400 p-3">... et {interne.length - 30} autres virements internes</p>}
            </CardContent>
          </Card>
        </details>
      )}

      {/* SECTION 4 — Transactions à classer (main focus) */}
      <Card className={unmatched.length > 0 ? "border-orange-200" : ""}>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-[#0B0F2E] flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            📋 À faire — Transactions à classer ({unmatched.length})
          </CardTitle>
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

        {/* Quick-action CTA bar — auto-classify the obvious cases in one click. */}
        {unmatched.length > 0 && (
          <div className="border-t border-b border-orange-100 bg-orange-50/50 px-4 py-3 space-y-2">
            <p className="text-sm text-[#0B0F2E]">
              <strong>{unmatched.length}</strong> transaction{unmatched.length > 1 ? "s" : ""} à classer.
              Cliquez ci-dessous pour traiter automatiquement les cas évidents (salaires, frais bancaires, MRA, virements internes entre vos sociétés, remboursements personnels).
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={openAutoClasserPreview}
                disabled={chatLoading}
                className="bg-[#D4AF37] text-[#0B0F2E] hover:bg-[#C9A82E]"
              >
                {chatLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <span className="mr-2">✨</span>}
                Auto-classer les évidences
              </Button>
              <span className="text-xs text-gray-500">
                Salaires · Frais bancaires MCB · MRA · Virements internes · Remboursements
              </span>
            </div>
          </div>
        )}

        <CardContent className="p-0 overflow-x-auto">
          {unmatched.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Toutes les transactions sont classées ✅</div>
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
                        <div className="flex gap-1 flex-wrap">
                          <Button variant="outline" size="sm" onClick={() => { setDialogTab("factures"); setLinkDialog(tx) }} className="gap-1"><Link2 className="w-3 h-3" />Lettrer</Button>
                          {associes.length > 0 && (
                            <Button variant="outline" size="sm" onClick={() => { setPayeParNom(associes[0]?.nom || ""); setPayeParType("associe"); setDialogTab("bach"); setLinkDialog(tx) }} className="gap-1 text-purple-600 border-purple-200 hover:bg-purple-50"><Users className="w-3 h-3" />Associé</Button>
                          )}
                          {/* Classification manuelle sans facture */}
                          <select
                            className="text-xs border rounded px-1 py-1 bg-white text-gray-600 cursor-pointer"
                            defaultValue=""
                            onChange={async (e) => {
                              const classType = e.target.value
                              if (!classType || !societeId) return
                              try {
                                await fetch('/api/comptable/rapprochement', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    action: 'lettrer_manuel',
                                    transaction_id: tx.id,
                                    releve_id: tx.releve_id,
                                    societe_id: societeId,
                                    classification: classType,
                                  }),
                                })
                                showToast(`Classifié: ${classType}`)
                                load()
                              } catch { showToast('Erreur classification', 'error') }
                            }}
                          >
                            <option value="">Classer...</option>
                            <option value="compte_courant_associe">Compte courant associé</option>
                            <option value="avance_personnel">Avance personnel</option>
                            <option value="charge_diverse">Charge diverse</option>
                            <option value="paiement_mra">Paiement MRA</option>
                            <option value="frais_bancaires">Frais bancaires</option>
                          </select>
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

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* SECTION — Espace de suivi : factures sans paiement + anomalies */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {data && (
        <Card className="border-2 border-purple-200">
          <CardHeader>
            <CardTitle className="text-[#0B0F2E] flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-600" />
              Suivi comptable — Factures & Anomalies
            </CardTitle>
            <p className="text-xs text-gray-500">Factures sans paiement, factures en retard, paiements sans pièce comptable</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Sub-section A: Factures fournisseur sans paiement */}
            {(() => {
              const unpaidFactures = (data?.factures || []).filter((f: any) =>
                f.statut === 'en_attente' || f.statut === 'retard' || f.statut === 'partiel'
              )
              const overdue = unpaidFactures.filter((f: any) => {
                if (!f.date_echeance) return false
                return new Date(f.date_echeance) < new Date()
              })
              const recent = unpaidFactures.filter((f: any) => {
                if (!f.date_echeance) return true
                return new Date(f.date_echeance) >= new Date()
              })

              if (unpaidFactures.length === 0) return (
                <div className="p-4 bg-green-50 rounded-lg text-center text-sm text-green-700">
                  Toutes les factures sont payées ou rapprochées
                </div>
              )

              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-purple-800">
                      📄 Factures sans paiement ({unpaidFactures.length})
                      {overdue.length > 0 && <span className="ml-2 text-red-600">dont {overdue.length} en retard</span>}
                    </p>
                  </div>

                  {overdue.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-red-700">🔴 En retard :</p>
                      {overdue.slice(0, 10).map((f: any) => (
                        <div key={f.id} className="flex items-center justify-between p-2 bg-red-50 border border-red-200 rounded text-sm">
                          <div className="flex-1">
                            <span className="font-medium">{f.tiers || '—'}</span>
                            <span className="text-xs text-gray-500 ml-2">{f.numero_facture || '—'}</span>
                            <span className="text-xs text-red-600 ml-2">échéance: {formatDate(f.date_echeance)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm">{fmt(Number(f.montant_ttc) || 0)} {f.devise || 'MUR'}</span>
                            <Button variant="ghost" size="sm" className="h-6 text-xs text-red-600 hover:bg-red-100"
                              onClick={async () => {
                                await fetch('/api/comptable/rapprochement', {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'update_facture_statut', facture_id: f.id, statut: 'retard' }),
                                })
                                load()
                              }}>Marquer retard</Button>
                          </div>
                        </div>
                      ))}
                      {overdue.length > 10 && <p className="text-xs text-gray-400">... et {overdue.length - 10} autres</p>}
                    </div>
                  )}

                  {recent.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-orange-700">🟠 En attente (non échues) :</p>
                      {recent.slice(0, 5).map((f: any) => (
                        <div key={f.id} className="flex items-center justify-between p-2 bg-orange-50 border border-orange-200 rounded text-sm">
                          <div className="flex-1">
                            <span className="font-medium">{f.tiers || '—'}</span>
                            <span className="text-xs text-gray-500 ml-2">{f.numero_facture || '—'}</span>
                            {f.date_echeance && <span className="text-xs text-orange-600 ml-2">échéance: {formatDate(f.date_echeance)}</span>}
                          </div>
                          <span className="font-bold text-sm">{fmt(Number(f.montant_ttc) || 0)} {f.devise || 'MUR'}</span>
                        </div>
                      ))}
                      {recent.length > 5 && <p className="text-xs text-gray-400">... et {recent.length - 5} autres en attente</p>}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Sub-sections B & C removed — the "Paiements bancaires sans facture"
                list was a duplicate of the main "À classer" section above, and
                the "Écritures 401 non lettrées" summary now lives in the
                Avancé accordion below. */}
          </CardContent>
        </Card>
      )}

      {/* SECTION 5 — Lettrage écritures 401/411 — advanced, collapsed by default */}
      <details className="group">
        <summary className="cursor-pointer flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-[#0B0F2E] py-2 px-2 rounded-md hover:bg-gray-50">
          <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform" />
          🔧 Avancé — Lettrage comptable (écritures 401/411) {ecrituresLettrage.length > 0 && <span className="text-xs text-gray-400">— {ecrituresLettrage.length} non lettrées</span>}
        </summary>
        <div className="mt-2 space-y-4">
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
        </div>
      </details>

      {/* Auto-classer les évidences — preview dialog */}
      <Dialog open={!!autoPreview} onOpenChange={o => { if (!o) setAutoPreview(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>✨</span> Auto-classer les évidences
            </DialogTitle>
          </DialogHeader>
          {autoPreview && (() => {
            const { salaires, mra, frais, internes, remboursements } = autoPreview
            const total = salaires.count + mra.count + frais.count + internes.count + remboursements.count
            const totalMontant = salaires.total + mra.total + frais.total + internes.total + remboursements.total
            if (total === 0) {
              return (
                <div className="py-6 text-center text-sm text-gray-500">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                  Aucune transaction évidente à classer automatiquement.
                  Toutes les transactions non classées nécessitent une décision manuelle.
                </div>
              )
            }
            return (
              <div className="space-y-3 py-2">
                <p className="text-sm text-gray-600">
                  Voici ce qui sera classé automatiquement :
                </p>
                <div className="space-y-2">
                  {salaires.count > 0 && (
                    <div className="flex items-center justify-between p-2.5 bg-blue-50 border border-blue-200 rounded">
                      <span className="text-sm"><span className="mr-2">👥</span>{salaires.count} paiement{salaires.count > 1 ? 's' : ''} salaire{salaires.count > 1 ? 's' : ''}</span>
                      <span className="font-mono text-sm font-semibold text-blue-900">{fmt(salaires.total)} MUR</span>
                    </div>
                  )}
                  {mra.count > 0 && (
                    <div className="flex items-center justify-between p-2.5 bg-purple-50 border border-purple-200 rounded">
                      <span className="text-sm"><span className="mr-2">🏛️</span>{mra.count} paiement{mra.count > 1 ? 's' : ''} MRA</span>
                      <span className="font-mono text-sm font-semibold text-purple-900">{fmt(mra.total)} MUR</span>
                    </div>
                  )}
                  {frais.count > 0 && (
                    <div className="flex items-center justify-between p-2.5 bg-amber-50 border border-amber-200 rounded">
                      <span className="text-sm"><span className="mr-2">💳</span>{frais.count} frais bancaire{frais.count > 1 ? 's' : ''}</span>
                      <span className="font-mono text-sm font-semibold text-amber-900">{fmt(frais.total)} MUR</span>
                    </div>
                  )}
                  {internes.count > 0 && (
                    <div className="flex items-center justify-between p-2.5 bg-gray-50 border border-gray-200 rounded">
                      <span className="text-sm"><span className="mr-2">↔</span>{internes.count} virement{internes.count > 1 ? 's' : ''} interne{internes.count > 1 ? 's' : ''}</span>
                      <span className="font-mono text-sm font-semibold text-gray-700">{fmt(internes.total)} MUR</span>
                    </div>
                  )}
                  {remboursements.count > 0 && (
                    <div className="flex items-center justify-between p-2.5 bg-indigo-50 border border-indigo-200 rounded">
                      <span className="text-sm"><span className="mr-2">💼</span>{remboursements.count} remboursement{remboursements.count > 1 ? 's' : ''} personnel{remboursements.count > 1 ? 's' : ''}</span>
                      <span className="font-mono text-sm font-semibold text-indigo-900">{fmt(remboursements.total)} MUR</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm font-semibold text-[#0B0F2E]">Total à classer : {total}</span>
                  <span className="font-mono text-sm font-bold text-[#0B0F2E]">{fmt(totalMontant)} MUR</span>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setAutoPreview(null)}>Annuler</Button>
                  <Button
                    className="bg-[#D4AF37] text-[#0B0F2E] hover:bg-[#C9A82E]"
                    onClick={confirmAutoClasser}
                    disabled={chatLoading}
                  >
                    <span className="mr-2">✨</span>
                    Confirmer — classer {total} transaction{total > 1 ? 's' : ''}
                  </Button>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

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
              {/* 3-column breakdown */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                  <p className="text-2xl font-bold text-green-700">{smartResult.auto_apply || 0}</p>
                  <p className="text-xs font-medium text-green-600 mt-0.5">✅ Auto (≥85%)</p>
                  <p className="text-[10px] text-green-500 mt-0.5">Haute confiance</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-2xl font-bold text-amber-700">{smartResult.needs_arbitration || 0}</p>
                  <p className="text-xs font-medium text-amber-600 mt-0.5">⚠️ À valider (65–85%)</p>
                  <p className="text-[10px] text-amber-500 mt-0.5">Arbitrage manuel</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <p className="text-2xl font-bold text-gray-600">{smartResult.orphans || 0}</p>
                  <p className="text-xs font-medium text-gray-500 mt-0.5">❌ Orphelins</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Sans correspondance</p>
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
                {smartResult.proposed || 0} proposition{(smartResult.proposed || 0) !== 1 ? 's' : ''} sur {smartResult.total || 0} transaction{(smartResult.total || 0) !== 1 ? 's' : ''} non-rapprochée{(smartResult.total || 0) !== 1 ? 's' : ''}
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleSmartApplyAll}
                  disabled={smartLoading || (smartResult.auto_apply || 0) === 0}
                  className="w-full text-white"
                  style={{ background: "linear-gradient(135deg, #059669, #0891b2)" }}
                >
                  {smartLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                  Appliquer tout ≥85% — {smartResult.auto_apply || 0} rapprochements
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setSelectedSmartKeys(new Set()); setSmartDialog('list') }}
                  disabled={(smartProposals.length || 0) === 0}
                  className="w-full"
                >
                  <Search className="w-4 h-4 mr-2" />
                  Voir et sélectionner ({smartProposals.length})
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
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>🎯 Propositions Smart ({smartProposals.length})</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Section règles auto (pre_classified) */}
            {smartProposals.some((p: any) => p.pre_classified) && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                  🏷️ Règles automatiques ({smartProposals.filter((p: any) => p.pre_classified).length})
                </p>
                <div className="space-y-1.5">
                  {smartProposals.filter((p: any) => p.pre_classified).map((p: any, idx: number) => {
                    const globalIdx = smartProposals.indexOf(p)
                    const key = String(globalIdx)
                    const isSelected = selectedSmartKeys.has(key)
                    const typeConfig: Record<string, { label: string; icon: string; color: string; badgeColor: string }> = {
                      frais_bancaires:    { label: 'Frais bancaires', icon: '🏦', color: 'bg-gray-50 border-gray-200', badgeColor: 'bg-gray-100 text-gray-700' },
                      paiement_mra:       { label: 'MRA', icon: '🏛️', color: 'bg-red-50 border-red-200', badgeColor: 'bg-red-100 text-red-700' },
                      salaire_individuel: { label: 'Salaire', icon: '👤', color: 'bg-green-50 border-green-200', badgeColor: 'bg-green-100 text-green-700' },
                      salaire_bulk:       { label: 'Salaires bulk', icon: '👥', color: 'bg-green-50 border-green-200', badgeColor: 'bg-green-100 text-green-700' },
                      transfert_interne:  { label: 'Interne', icon: '🔄', color: 'bg-blue-50 border-blue-200', badgeColor: 'bg-blue-100 text-blue-700' },
                      associe:            { label: 'Associé', icon: '🤝', color: 'bg-purple-50 border-purple-200', badgeColor: 'bg-purple-100 text-purple-700' },
                    }
                    const cfg = typeConfig[p.match_type] || { label: p.match_type, icon: '🏷️', color: 'bg-gray-50 border-gray-200', badgeColor: 'bg-gray-100 text-gray-700' }
                    return (
                      <div key={`rule-${idx}`}
                        onClick={() => {
                          const next = new Set(selectedSmartKeys)
                          if (next.has(key)) next.delete(key); else next.add(key)
                          setSelectedSmartKeys(next)
                        }}
                        className={`border rounded-lg p-3 text-sm cursor-pointer transition-all ${isSelected ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300' : cfg.color}`}>
                        <div className="flex items-start gap-2">
                          <Checkbox checked={isSelected} className="mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="font-medium truncate max-w-[220px] text-sm">{p.transaction?.libelle || '—'}</span>
                              <Badge className={`text-[10px] shrink-0 ${cfg.badgeColor}`}>{cfg.icon} {cfg.label}</Badge>
                            </div>
                            <div className="flex justify-between text-xs text-gray-500">
                              <span>{p.transaction?.date || '—'}</span>
                              <span className="font-mono font-semibold">{p.transaction?.debit ? `-${fmt(p.transaction.debit)}` : `+${fmt(p.transaction?.credit || 0)}`} MUR</span>
                            </div>
                            {p.reasoning && <p className="mt-1 text-[11px] text-gray-400 italic">{p.reasoning}</p>}
                          </div>
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
                <div className="space-y-2">
                  {smartProposals.filter((p: any) => !p.pre_classified).map((p: any, idx: number) => {
                    const globalIdx = smartProposals.indexOf(p)
                    const key = String(globalIdx)
                    const isSelected = selectedSmartKeys.has(key)
                    const conf = Math.round((p.confidence || 0) * 100)
                    const isHigh = conf >= 85
                    const isMid = conf >= 65 && conf < 85
                    const strategyBadge: Record<string, { label: string; color: string }> = {
                      exact_reference: { label: 'Réf. exacte', color: 'bg-emerald-100 text-emerald-700' },
                      exact_ref:       { label: 'Réf. exacte', color: 'bg-emerald-100 text-emerald-700' },
                      exact_amount:    { label: 'Montant exact', color: 'bg-blue-100 text-blue-700' },
                      close_amount:    { label: 'Montant proche', color: 'bg-yellow-100 text-yellow-700' },
                      grouped_sum:     { label: 'Paiement groupé', color: 'bg-violet-100 text-violet-700' },
                      historical:      { label: 'Historique', color: 'bg-orange-100 text-orange-700' },
                      rule_based:      { label: 'Règle', color: 'bg-gray-100 text-gray-700' },
                    }
                    const strat = strategyBadge[p.strategy || p.match_type || ''] || { label: p.strategy || '—', color: 'bg-gray-100 text-gray-600' }
                    const txAmt = p.transaction?.debit || p.transaction?.credit || 0
                    const facAmt = p.factures?.reduce((s: number, f: any) => s + (Number(f.montant_ttc) || 0), 0) || 0
                    const ecart = txAmt > 0 && facAmt > 0 ? Math.abs((txAmt - facAmt) / txAmt * 100).toFixed(1) : null
                    return (
                      <div key={`engine-${idx}`}
                        onClick={() => {
                          const next = new Set(selectedSmartKeys)
                          if (next.has(key)) next.delete(key); else next.add(key)
                          setSelectedSmartKeys(next)
                        }}
                        className={`border-2 rounded-lg p-3 text-sm cursor-pointer transition-all ${isSelected ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300' : isHigh ? 'border-green-200 bg-green-50/40 hover:border-green-300' : 'border-amber-200 bg-amber-50/30 hover:border-amber-300'}`}>
                        <div className="flex items-start gap-2">
                          <Checkbox checked={isSelected} className="mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            {/* Header row */}
                            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                              <span className="font-semibold text-sm truncate max-w-[200px]">{p.transaction?.libelle || '—'}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Badge className={`text-[10px] ${strat.color}`}>{strat.label}</Badge>
                                <Badge className={`text-[10px] ${isHigh ? 'bg-green-600 text-white' : isMid ? 'bg-amber-500 text-white' : 'bg-gray-400 text-white'}`}>{conf}%</Badge>
                              </div>
                            </div>
                            {/* Confidence bar */}
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                              <div className={`h-full rounded-full transition-all ${isHigh ? 'bg-green-500' : isMid ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${conf}%` }} />
                            </div>
                            {/* Tiers matching arrow */}
                            <div className="flex items-center gap-1.5 text-xs mb-1.5">
                              <span className="text-gray-600 truncate max-w-[100px]">{p.transaction?.tiers_detecte || p.transaction?.libelle?.slice(0, 20) || '—'}</span>
                              <span className="text-gray-400 shrink-0">→</span>
                              <span className="text-gray-600 truncate max-w-[120px]">{p.factures?.map((f: any) => f.tiers || f.numero_facture).join(', ') || '—'}</span>
                            </div>
                            {/* Amount comparison */}
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-mono font-medium text-gray-700">{p.transaction?.debit ? `-${fmt(p.transaction.debit)}` : `+${fmt(p.transaction?.credit || 0)}`} MUR</span>
                              {facAmt > 0 && <><span className="text-gray-400">vs</span><span className="font-mono text-gray-500">{fmt(facAmt)} MUR</span></>}
                              {ecart && Number(ecart) > 0 && <Badge className={`text-[9px] ${Number(ecart) < 5 ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>écart {ecart}%</Badge>}
                            </div>
                            {/* Reasoning */}
                            {p.reasoning && <p className="mt-1.5 text-[11px] text-gray-400 italic leading-snug">{p.reasoning}</p>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-3 border-t shrink-0 flex-wrap">
            <Button
              onClick={handleSmartApplyAll}
              disabled={smartLoading || (smartResult?.auto_apply || 0) === 0}
              className="flex-1 text-white text-xs"
              style={{ background: "linear-gradient(135deg, #059669, #0891b2)" }}
            >
              {smartLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
              Appliquer ≥85% ({smartResult?.auto_apply || 0})
            </Button>
            <Button
              onClick={handleSmartApplySelection}
              disabled={applyingSelection || selectedSmartKeys.size === 0}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
            >
              {applyingSelection ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
              Appliquer sélection ({selectedSmartKeys.size})
            </Button>
            <Button variant="outline" onClick={() => setSmartDialog('summary')} className="flex-1 text-xs">Retour</Button>
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
              onClick={() => {
                const userMsg = { role: 'user' as const, content: '🤖 Lancer analyse complète (agent déterministe)' }
                setChatMessages(prev => [...prev, userMsg])
                runDeterministicAgent()
              }}
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
