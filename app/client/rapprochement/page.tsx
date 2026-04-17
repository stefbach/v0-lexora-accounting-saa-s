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
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { Progress } from "@/components/ui/progress"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { bucketizeTransactions, type BucketItem } from "@/lib/accounting/classification-rules"
import { RapprochementKpiDashboard } from "@/components/rapprochement/KpiDashboard"
import { PeriodeBar } from "@/components/rapprochement/PeriodeBar"
import { BalanceComptes } from "@/components/rapprochement/BalanceComptes"

function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

const CLASSIFICATION_CHOICES = [
  { code: 'fournisseur',            label: 'Fournisseur',              compte: '401' },
  { code: 'frais_bancaires',        label: 'Frais bancaires',          compte: '627' },
  { code: 'paiement_mra',           label: 'Paiement MRA (impôts)',    compte: '447' },
  { code: 'charge_sociale',         label: 'Charges sociales (CSG/NSF)', compte: '431' },
  { code: 'salaire',                label: 'Salaire net',              compte: '4210' },
  { code: 'compte_courant_associe', label: 'Compte courant associé',   compte: '455' },
  { code: 'avance_personnel',       label: 'Avance au personnel',      compte: '425' },
  { code: 'virement_interne',       label: 'Virement interne',         compte: '580' },
  { code: 'loyer',                  label: 'Loyer / charges locatives', compte: '613' },
  { code: 'assurance',              label: 'Assurance',                compte: '616' },
  { code: 'honoraires',             label: 'Honoraires / comptable',   compte: '622' },
  { code: 'telecom',                label: 'Télécom / internet',       compte: '626' },
  { code: 'impot_taxe',             label: 'Impôts et taxes',          compte: '635' },
  { code: 'charge_diverse',         label: 'Charge diverse',           compte: '658' },
  { code: 'autre',                  label: 'À classer plus tard',      compte: '471' },
] as const
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
  // Picker de transaction depuis la facture : si aucun prefill ne matche, on ouvre cette
  // modale qui liste toutes les tx bancaires du mois, classées par proximité de montant.
  const [pickTxForFacture, setPickTxForFacture] = useState<any>(null)
  // Multi-facture lettrage : checkboxes selectionnees + filtre tiers
  const [selectedFactureIds, setSelectedFactureIds] = useState<Set<string>>(new Set())
  const [lettrageTiersFilter, setLettrageTiersFilter] = useState("")
  const [societeId, setSocieteId] = useState<string | null>(null)
  const [societes, setSocietes] = useState<any[]>([])
  const [payeParAssocie, setPayeParAssocie] = useState(false)
  const [payeParType, setPayeParType] = useState("associe")
  const [payeParNom, setPayeParNom] = useState("")
  const [selectedMois, setSelectedMois] = useState<string | null>(() => {
    // Default to the current month so the ← Mois → arrows make sense.
    // The "Tous les mois" link below clears it back to null.
    return new Date().toISOString().slice(0, 7)
  })
  const [selectedCompte, setSelectedCompte] = useState("all")
  const [matchedOpen, setMatchedOpen] = useState(false)
  const [txSearch, setTxSearch] = useState("")
  const [dialogTab, setDialogTab] = useState<"factures" | "ecritures" | "bach">("factures")
  const [sortField, setSortField] = useState<'date' | 'amount'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedPeriode, setSelectedPeriode] = useState('2025-2026')
  const [associes, setAssocies] = useState<any[]>([])
  const [employes, setEmployes] = useState<any[]>([])
  // Dialog remboursement NDF
  const [ndfDialog, setNdfDialog] = useState<any>(null)
  const [ndfEmployeId, setNdfEmployeId] = useState<string>("")
  const [ndfDescription, setNdfDescription] = useState<string>("")
  const [ndfCompte, setNdfCompte] = useState<string>("425")
  // FIX 4 — Candidats associés (employés role=direction sans CCA) et
  // alertes légales Companies Act Mauritius (CCA débiteur).
  const [associesCandidates, setAssociesCandidates] = useState<Array<{ id: string; nom: string; role: string }>>([])
  const [legalAlerts, setLegalAlerts] = useState<Array<{ compte_id: string; nom: string; solde: number; message: string }>>([])
  // FIX 3 + 5 — Alertes sur comptes de transit (467 inter-sociétés, 580
  // virements internes — doit toujours être soldé, règle R3).
  const [transitAlerts, setTransitAlerts] = useState<Array<{ compte: string; type: string; solde?: number; count?: number; message: string }>>([])
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

  // Auto-classer preview dialog (shown before running the deterministic agent).
  // FIX 10 — Buckets come from the shared lib so the preview counts here
  // match exactly what the server will reconcile. Previously the client
  // ran its own keyword matchers that drifted from the server rules and
  // led to "5 détectés mais 2 rapprochés" user complaints.
  type AutoBucketItem = BucketItem
  type AutoBucket = { count: number; total: number; items: AutoBucketItem[] }
  const [autoPreview, setAutoPreview] = useState<null | {
    salaires: AutoBucket
    mra: AutoBucket
    frais: AutoBucket
    internes: AutoBucket
    remboursements: AutoBucket
    notes_frais: AutoBucket
    inconnus: AutoBucket
  }>(null)

  // Pagination — Factures fournisseurs table (Part 1: 20/page).
  const [facturesPage, setFacturesPage] = useState(1)
  const FACTURES_PAGE_SIZE = 20

  // Part 2: Transactions section is split in 3 tabs.
  //   'aclasser' → unmatched (à traiter)
  //   'classees' → confirmées + auto-classées + virements internes
  //   'verifier' → rapprochées sans pièce comptable (paidNoInvoice)
  const [transactionTab, setTransactionTab] = useState<'aclasser' | 'classees' | 'verifier' | 'fournisseurs'>('fournisseurs')

  // Pagination for the "À classer" tab list.
  const [unmatchedPage, setUnmatchedPage] = useState(1)
  const UNMATCHED_PAGE_SIZE = 20
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
  // FIX 10 — Delegates to lib/accounting/classification-rules so client
  // preview and server deterministic agent share the EXACT same matchers.
  const computeAutoPreview = () => {
    const u = (transactions as any[]).filter((t: any) =>
      t.statut !== 'rapproche' && t.statut !== 'interne' && t.statut !== 'propose' && t.statut !== 'a_verifier'
    )
    return bucketizeTransactions(u)
  }

  const openAutoClasserPreview = () => {
    if (!societeId) return
    setAutoPreview(computeAutoPreview())
  }

  /**
   * Confirm "Auto-classer les évidences" — calls the deterministic agent
   * directly and surfaces a visible toast no matter what (the previous
   * version delegated to openAgentIA which opens a chat panel that no
   * longer exists in the redesigned UI, so the user saw nothing happen).
   */
  const confirmAutoClasser = async () => {
    if (!societeId) return
    setAutoPreview(null)
    setChatLoading(true)
    console.log('[auto-classer] POST /api/comptable/rapprochement/agent/deterministic societe_id=', societeId, 'mois=', selectedMois || 'all')
    try {
      const res = await fetch('/api/comptable/rapprochement/agent/deterministic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societe_id: societeId,
          ...(selectedMois ? { mois: selectedMois } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      console.log('[auto-classer] response', res.status, data)
      if (!res.ok) {
        showToast(`❌ Erreur (${res.status}) : ${data?.error || 'inconnue'}`, 'error')
        return
      }
      const matched = Number(data.matched) || 0
      const processed = Number(data.processed) || 0
      if (matched > 0) {
        showToast(`✅ ${matched} transaction(s) classée(s) automatiquement${processed > matched ? ` · ${processed - matched} sans correspondance` : ''}`)
      } else if (processed > 0) {
        showToast(`ℹ️ Aucune correspondance évidente sur ${processed} transaction(s) analysée(s). Utilisez le menu "Classer..." sur chaque ligne.`)
      } else {
        showToast(`ℹ️ ${data.message || 'Aucune transaction à analyser pour le moment.'}`)
      }
      await load()
    } catch (e: any) {
      console.error('[auto-classer] fetch failed:', e)
      showToast(`❌ Erreur réseau : ${e?.message || 'connexion perdue'}`, 'error')
    } finally {
      setChatLoading(false)
    }
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

  // ── Reclassify (réapplique R01-R07 sur tx sans facture) ──────────
  const [reclassifying, setReclassifying] = useState(false)
  const handleReclassify = async () => {
    if (!societeId || reclassifying) return
    setReclassifying(true)
    try {
      // Scoper au mois actif si selectionne
      const res = await fetch('/api/comptable/rapprochement/reclassify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societe_id: societeId,
          scope: 'unclassified',
          ...(selectedMois ? { mois: selectedMois } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setToast({ type: 'error', message: data.error || 'Erreur re-classification' })
      } else {
        setToast({
          type: 'success',
          message: `✓ ${data.matched} transactions classées • ${data.director_detected} dirigeants détectés • ${data.bnq_entries_created} écritures BNQ créées`,
        })
        await load()
      }
    } catch (e: any) {
      setToast({ type: 'error', message: e.message })
    } finally {
      setReclassifying(false)
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
      const rapData = await res.json()
      setData(rapData)
      setTransitAlerts(rapData?.transit_alerts || [])
      if (ccRes?.ok) {
        const ccData = await ccRes.json()
        console.log('[rapprochement] associes loaded:', ccData.comptes?.length || 0, '+ candidats:', ccData.candidates?.length || 0)
        setAssocies(ccData.comptes || [])
        setAssociesCandidates(ccData.candidates || [])
        setLegalAlerts(ccData.legal_alerts || [])
      }
      // Charger les employes pour le picker NDF (remboursement note de frais)
      // Route: /api/rh/employes?societe_id=...  (pas /api/comptable/equipe qui n'existe pas)
      try {
        const empRes = await fetch(`/api/rh/employes?societe_id=${societeId}`).catch(() => null)
        if (empRes?.ok) {
          const empData = await empRes.json()
          setEmployes(empData.employes || empData.membres || [])
        }
      } catch { /* best-effort */ }
    } catch { setData(null) }
    finally { setLoading(false) }
  }, [societeId])

  // Ouvrir le dialog remboursement NDF pour une tx
  const openNdfDialog = (tx: any) => {
    setNdfDialog(tx)
    setNdfEmployeId("")
    setNdfDescription("")
    setNdfCompte("425")
  }

  // Enregistrer le remboursement NDF
  const handleRembourserEmploye = async () => {
    if (!societeId || !ndfDialog) return
    try {
      const emp = employes.find(e => e.id === ndfEmployeId)
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rembourser_employe",
          transaction_id: ndfDialog.id,
          releve_id: ndfDialog.releve_id,
          societe_id: societeId,
          employe_id: ndfEmployeId || null,
          employe_nom: emp ? `${emp.prenom || ''} ${emp.nom || ''}`.trim() : (ndfDialog.tiers_detecte || ''),
          description: ndfDescription,
          compte_charge: ndfCompte,
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        setToast({ type: 'error', message: d.error })
      } else {
        setToast({
          type: 'success',
          message: `✓ Remboursement ${d.employe} enregistré (${fmt(d.montant_mur)} MUR, compte ${d.compte})`,
        })
        setNdfDialog(null)
        await load()
      }
    } catch (e: any) {
      setToast({ type: 'error', message: e.message })
    }
  }

  useEffect(() => { load() }, [load])

  // Reset factures pagination whenever the filters change so the user never
  // lands on a stale empty page (e.g. change month → fewer rows → old page
  // is out of bounds until our clamp logic kicks in).
  useEffect(() => { setFacturesPage(1) }, [societeId, selectedMois, selectedPeriode])
  useEffect(() => { setUnmatchedPage(1) }, [societeId, selectedMois, selectedPeriode, selectedCompte, transactionTab])

  const handleAutoMatch = async () => {
    if (!societeId) return
    setAutoMatching(true)
    setAutoResult(null)
    try {
      setAutoStep("Analyse des transactions bancaires...")
      await new Promise(r => setTimeout(r, 800))
      setAutoStep("Recherche des factures correspondantes...")

      // Dates : si un mois est selectionne, on limite au mois actif
      // (le backend filtrera factures/tx sur cette plage).
      // Sinon fallback sur l exercice fiscal pour ne pas traiter l infini.
      let dateFilter: { date_debut?: string; date_fin?: string } = {}
      if (selectedMois) {
        const [yy, mm] = selectedMois.split('-').map(Number)
        const start = `${yy}-${String(mm).padStart(2, '0')}-01`
        const lastDay = new Date(yy, mm, 0).getDate()
        const end = `${yy}-${String(mm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        dateFilter = { date_debut: start, date_fin: end }
        setAutoStep(`Rapprochement automatique du mois ${selectedMois}...`)
      } else if (selectedPeriode !== 'tout') {
        dateFilter = selectedPeriode === '2025-2026'
          ? { date_debut: '2025-07-01', date_fin: '2026-06-30' }
          : { date_debut: '2024-07-01', date_fin: '2025-06-30' }
      }

      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto_rapprocher", societe_id: societeId, ...dateFilter }),
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
    // Garde: sans tx bancaire réelle (releve_id + id), l'API renvoie 400 "releve_id requis".
    if (!tx?.releve_id || !tx?.id) {
      setToast({ type: 'error', message: "Aucune transaction bancaire sélectionnée. Importez le relevé ou utilisez \"Marquer payée\"." })
      return
    }
    try {
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "lettrer_manuel", transaction_id: tx.id, releve_id: tx.releve_id,
          facture_id: type === "facture" ? target.id : undefined,
          ecriture_id: type === "ecriture" ? target.id : undefined,
          societe_id: societeId,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setToast({ type: 'error', message: `❌ ${d.error || `HTTP ${res.status}`}` })
        return
      }
      setLinkDialog(null); load()
    } catch { setToast({ type: 'error', message: "Erreur réseau lors du lettrage" }) }
  }

  // Lettrage multi-facture : 1 transaction bancaire vs N factures
  const handleManualLinkMulti = async (tx: any, factures: any[]) => {
    if (!societeId || factures.length === 0) return
    // Garde: sans tx bancaire réelle (releve_id + id), l'API renvoie 400 "releve_id requis".
    if (!tx?.releve_id || !tx?.id) {
      setToast({ type: 'error', message: "Aucune transaction bancaire sélectionnée. Importez le relevé ou utilisez \"Marquer payée\"." })
      return
    }
    const ids = factures.map(f => f.id)
    try {
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "lettrer_multi",
          transaction_id: tx.id,
          releve_id: tx.releve_id,
          facture_ids: ids,
          societe_id: societeId,
        }),
      })
      const d = await res.json().catch(() => ({}))
      console.log('[lettrer_multi] response', res.status, d)
      if (!res.ok) {
        setToast({ type: 'error', message: `❌ ${d.error || `HTTP ${res.status}`}` })
        return
      }
      setToast({
        type: 'success',
        message: `✓ ${ids.length} factures lettrees avec la transaction (lettre ${d.lettre || '—'})`,
      })
      setLinkDialog(null)
      setSelectedFactureIds(new Set())
      setLettrageTiersFilter("")
      await load()
    } catch (e: any) {
      setToast({ type: 'error', message: `❌ ${e.message}` })
    }
  }

  // Marquer une facture comme payée (crée BNQ + letters, sans tx)
  const handleMarquerPaye = async (facture: any) => {
    if (!societeId) {
      setToast({ type: 'error', message: 'Aucune société sélectionnée' })
      return
    }
    setToast({ type: 'success', message: 'Enregistrement du paiement…' })
    try {
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "marquer_paye",
          facture_id: facture.id,
          societe_id: societeId,
        }),
      })
      const data = await res.json().catch(() => ({}))
      console.log('[marquer_paye] response', res.status, data)
      if (!res.ok) {
        setToast({ type: 'error', message: `❌ ${data.error || data.hint || `HTTP ${res.status}`}` })
        return
      }
      setToast({ type: 'success', message: `✓ Facture marquée payée (lettre ${data.lettre})` })
      await load()
    } catch (e: any) {
      console.error('[marquer_paye] fetch error', e)
      setToast({ type: 'error', message: `❌ ${e.message || 'Erreur réseau'}` })
    }
  }

  // Classer une transaction "à vérifier" en un type comptable
  // applyToSimilar=true : propage la meme classification a toutes les autres
  // tx de la societe avec le meme tiers (retroactif, 1 clic)
  const handleClasserTx = async (tx: any, classification: string, applyToSimilar: boolean = false) => {
    if (!societeId) {
      setToast({ type: 'error', message: 'Aucune société sélectionnée' })
      return
    }
    setToast({ type: 'success', message: applyToSimilar ? `Classification + propagation…` : `Classification "${classification}"…` })
    try {
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "classer_transaction",
          transaction_id: tx.id,
          releve_id: tx.releve_id,
          societe_id: societeId,
          classification,
          apply_to_similar: applyToSimilar,
          learn_pattern: {
            tiers: tx.tiers_detecte || null,
            libelle: tx.libelle || null,
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      console.log('[classer_transaction] response', res.status, data)
      console.log('[classer_transaction] warnings.ecritures =', data.warnings?.ecritures)
      console.log('[classer_transaction] warnings.learn =', data.warnings?.learn)
      console.log('[classer_transaction] warnings.propagation =', data.warnings?.propagation)
      console.log('[classer_transaction] propagation_stats =', data.propagation_stats)
      console.log('[classer_transaction] FULL JSON =', JSON.stringify(data, null, 2))
      if (!res.ok) {
        setToast({ type: 'error', message: `❌ ${data.error || `HTTP ${res.status}`}` })
        return
      }
      // Construire un message détaillé qui inclut les warnings (écritures non créées, auto-learn KO)
      const parts: string[] = [`✓ Classée en "${classification}"`]
      if (data.nb_ecritures > 0) parts.push(`${data.nb_ecritures} écritures créées`)
      else if (data.warnings?.ecritures) parts.push(`⚠ écritures: ${data.warnings.ecritures}`)
      if (data.pattern_saved) parts.push('règle auto-apprise')
      else if (data.warnings?.learn) parts.push(`⚠ auto-learn: ${data.warnings.learn}`)
      if (data.cca_synced) parts.push('compte courant mis à jour')
      else if (data.warnings?.cca) parts.push(`⚠ CCA: ${data.warnings.cca}`)
      if (data.nb_propagated > 0) parts.push(`⚡ ${data.nb_propagated} tx similaires classées automatiquement`)
      else if (data.warnings?.propagation) parts.push(`⚠ propagation: ${data.warnings.propagation}`)
      setToast({
        type: (data.warnings?.ecritures || data.warnings?.learn) ? 'error' : 'success',
        message: parts.join(' · '),
      })
      await load()
    } catch (e: any) {
      console.error('[classer_transaction] fetch error', e)
      setToast({ type: 'error', message: `❌ ${e.message || 'Erreur réseau'}` })
    }
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

  // ── Annuler le paiement d'une ou plusieurs factures ──────────────
  // Remet la facture en "en_attente", clear les champs rapproche_*, et
  // délettrer la transaction bancaire associée s'il y en a une.
  const [annulationEnCours, setAnnulationEnCours] = useState(false)
  const [selectedFacturesForAnnulation, setSelectedFacturesForAnnulation] = useState<Set<string>>(new Set())

  const handleAnnulerPaiement = async (factureIds: string[]) => {
    if (factureIds.length === 0) return
    if (!confirm(`Annuler le paiement de ${factureIds.length} facture(s) ?\n\nLes factures repasseront en "en attente" et les transactions bancaires associées seront délettrées.`)) return
    setAnnulationEnCours(true)
    try {
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "annuler_paiement_factures",
          societe_id: societeId,
          facture_ids: factureIds,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setToast({ type: 'error', message: data.error || `Erreur HTTP ${res.status}` })
      } else {
        setToast({ type: 'success', message: `✓ ${data.nb_factures_reset || factureIds.length} facture(s) remise(s) en attente` })
        setSelectedFacturesForAnnulation(new Set())
        await load()
      }
    } catch (e: any) {
      setToast({ type: 'error', message: e.message || 'Erreur réseau' })
    } finally {
      setAnnulationEnCours(false)
    }
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
  // FIX 6 — data.factures contient désormais aussi les factures 'paye'.
  // On expose 2 vues : `factures` (compat, factures non-payées uniquement
  // pour le dialog de lettrage manuel) et on laisse les vues par statut
  // filtrer elles-mêmes sur data.factures.
  const factures = (data?.factures || []).filter((f: any) => f.statut !== 'paye')
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
  // ── Catégorisation des transactions ──────────────────────────────
  // Production carries many distinct `statut` values that all mean
  // "this transaction has been classified" — not just 'rapproche'.
  // The bucket logic above missed paiement_mra, frais_bancaires,
  // virement_interne, salaire_bulk_non_verifie, etc. and dropped all
  // of them into `unmatched`, which is why the À classer tab was
  // showing 60+ items the operator had already triaged.
  //
  // Canonical sets:
  //   STATUT_INTERNE_LIKE → goes to the "Internes" sub-bucket of Classées
  //   STATUT_AUTO_LIKE    → goes to the "Classifiées auto" sub-bucket
  //   Otherwise any non-empty statut not equal to 'non_identifie' is
  //   considered classified (we don't know the exact bucket but it's
  //   not "À classer").
  const STATUT_INTERNE_LIKE = new Set(['interne', 'interne_en_attente', 'virement_interne'])
  const STATUT_AUTO_LIKE = new Set([
    'frais_bancaires',
    'salaire', 'salaire_bulk', 'salaire_bulk_non_verifie', 'salaire_individuel',
    'paiement_mra', 'paiement_mra_non_verifie',
    'remboursement_personnel', 'remboursement_test',
    'paiement_fournisseur',           // explicit fournisseur classification (no facture matched)
    'prestation_contracteur',
    'charges_sociales', 'reversal_salaire',
    'identifie',                       // generic "classified" without a sub-type
    // === Classifications du dropdown "Classer..." de l onglet À vérifier ===
    'compte_courant_associe',
    'avance_personnel',
    'charge_diverse',
    'autre',
  ])
  const STATUT_PROPOSED = new Set(['propose', 'a_verifier'])

  const hasFacture = (t: any) =>
    !!t.facture_id || (Array.isArray(t.facture_ids) && t.facture_ids.length > 0)
  const matchedTypeOf = (t: any) => String(t.matched_type || '').toLowerCase()
  const statutOf = (t: any) => String(t.statut || '').toLowerCase()

  // 1. VERT: Rapproché AVEC pièce comptable
  const matchedWithInvoice = transactions.filter((t: any) =>
    statutOf(t) === 'rapproche' && hasFacture(t)
  )
  // 2. BLEU: Classifié auto sans facture (statut OU matched_type recognise)
  const classifiedAuto = transactions.filter((t: any) => {
    if (hasFacture(t)) return false
    if (STATUT_INTERNE_LIKE.has(statutOf(t))) return false // → goes to "interne"
    const s = statutOf(t)
    const m = matchedTypeOf(t)
    return STATUT_AUTO_LIKE.has(s) || STATUT_AUTO_LIKE.has(m)
  })
  // 3. GRIS: Virements internes (statut OU matched_type)
  const interne = transactions.filter((t: any) =>
    STATUT_INTERNE_LIKE.has(statutOf(t)) || matchedTypeOf(t) === 'transfert_interne'
  )
  // 4. ORANGE: À VÉRIFIER — rapproché mais ni facture ni classification reconnue.
  const paidNoInvoice = transactions.filter((t: any) =>
    statutOf(t) === 'rapproche'
    && !hasFacture(t)
    && !STATUT_AUTO_LIKE.has(matchedTypeOf(t))
  )
  // 5. JAUNE: Propositions à valider
  const proposed = transactions.filter((t: any) => STATUT_PROPOSED.has(statutOf(t)))

  // 6. À CLASSER — true unknowns: empty statut, 'non_identifie', or any statut
  // that doesn't match any of the recognised sets above.
  const isClassifiedAnywhere = (t: any): boolean => {
    if (hasFacture(t)) return true
    const s = statutOf(t)
    if (!s || s === 'non_identifie') return false
    if (s === 'rapproche') return true               // matchedWithInvoice OR paidNoInvoice
    if (STATUT_INTERNE_LIKE.has(s)) return true
    if (STATUT_AUTO_LIKE.has(s)) return true
    if (STATUT_PROPOSED.has(s)) return true
    if (STATUT_AUTO_LIKE.has(matchedTypeOf(t))) return true
    if (matchedTypeOf(t) === 'transfert_interne') return true
    return false
  }
  const unmatched = transactions.filter((t: any) => !isClassifiedAnywhere(t))

  // Legacy alias kept for the few read sites using `matched`.
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
  // Filtre optionnel par mois actif (selectedMois = YYYY-MM) pour eviter
  // de polluer la vue avec les ecritures d autres mois.
  const ecrMatchMois = (e: any) =>
    !selectedMois || (e.date_ecriture && String(e.date_ecriture).substring(0, 7) === selectedMois)
  const ecritures401 = ecritures.filter((e: any) => e.compte?.startsWith('401') && !e.lettre && ecrMatchMois(e))
  const ecritures411 = ecritures.filter((e: any) => e.compte?.startsWith('411') && !e.lettre && ecrMatchMois(e))
  const ecrituresLettrage = [...ecritures401, ...ecritures411]
  const ecrituresLettrees = ecritures.filter((e: any) => e.lettre && ecrMatchMois(e))

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

  /**
   * "Tout synchroniser automatiquement" — scans paid factures and
   * materializes / letters the matching BNQ ↔ ACH pairs via
   * POST /api/comptable/rapprochement action=sync_lettrage.
   * Reuses the `autoLettraging` state so the existing spinner still works.
   */
  // P3 — Cloturer un mois (verif invariants + creation bank_reconciliation + lock)
  const [cloturingMois, setCloturingMois] = useState(false)
  const handleCloturerMois = async (mois: string) => {
    if (!societeId || !mois) return
    if (!window.confirm(`Cloturer la periode ${mois} ?\n\nCela va :\n- Verifier que toutes les tx sont classees\n- Verifier que toutes les ecritures 401/411 sont lettrees\n- Verifier solde 580 = 0\n- Creer le tableau de rapprochement officiel\n- VERROUILLER la periode (irreversible sans admin)\n\nContinuer ?`)) return
    setCloturingMois(true)
    try {
      const res = await fetch('/api/comptable/rapprochement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cloturer_mois', societe_id: societeId, mois }),
      })
      const d = await res.json().catch(() => ({}))
      console.log('[cloturer_mois] response', res.status, d)
      if (!res.ok) {
        const blockers = (d.blockers || []).join('\n  - ')
        setToast({
          type: 'error',
          message: `❌ Cloture refusee : ${d.error || 'invariants non respectes'}${blockers ? '\n  - ' + blockers : ''}`,
        })
        return
      }
      setToast({
        type: 'success',
        message: `✓ Periode ${mois} cloturee. ${d.reconciliations_created} tableau(x) cree(s). ${d.period_locked ? 'Periode verrouillee.' : ''}`,
      })
      await load()
    } catch (e: any) {
      setToast({ type: 'error', message: `❌ ${e.message}` })
    } finally {
      setCloturingMois(false)
    }
  }

  const handleAutoLettrage = async () => {
    if (!societeId) return
    setAutoLettraging(true)
    // P4 : si un mois est actif, scoper le lettrage au mois actif uniquement.
    // Permet d eviter de toucher aux factures d autres mois (notamment mois
    // deja cloturees).
    const moisPayload = selectedMois ? { mois: selectedMois } : {}
    console.log('[sync_lettrage] POST societe_id=', societeId, 'mois=', selectedMois || 'all')
    try {
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_lettrage", societe_id: societeId, ...moisPayload }),
      })
      const d = await res.json().catch(() => ({}))
      console.log('[sync_lettrage] response', res.status, d)
      if (!res.ok) {
        // Detect the most common production blocker: migration 133 not yet
        // applied → Postgres returns "column ecritures_comptables_v2.facture_id
        // does not exist" or similar.
        const msg = String(d?.error || d?.message || '')
        if (/facture_id/i.test(msg) && /does not exist|column/i.test(msg)) {
          showToast(
            `⚠ Migration 133 pas encore appliquée en prod. ` +
            `Appliquez supabase/migrations/133_ecritures_facture_id_link.sql ` +
            `puis réessayez.`,
            'error'
          )
        } else {
          showToast(`❌ Erreur (${res.status}) : ${msg || 'inconnue'}`, 'error')
        }
        return
      }
      const parts: string[] = []
      if ((d.pairs_lettered || 0) > 0) parts.push(`${d.pairs_lettered} écriture(s) synchronisée(s)`)
      if ((d.bnq_created || 0) > 0) parts.push(`${d.bnq_created} BNQ créée(s)`)
      if ((d.already_lettered || 0) > 0) parts.push(`${d.already_lettered} déjà à jour`)
      const errCount = Array.isArray(d.errors) ? d.errors.length : 0
      if (errCount > 0) parts.push(`${errCount} non traitée(s)`)
      const total = (d.pairs_lettered || 0) + (d.bnq_created || 0)
      showToast(
        total > 0
          ? `✅ ${parts.join(' · ')}`
          : (parts.length ? `ℹ️ ${parts.join(' · ')}` : 'ℹ️ Aucune facture payée à synchroniser')
      )
      await load()
    } catch (e: any) {
      console.error('[sync_lettrage] fetch failed:', e)
      showToast(`❌ Erreur réseau — synchronisation échouée${e?.message ? ' : ' + e.message : ''}`, 'error')
    } finally { setAutoLettraging(false) }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-[#0B0F2E]" /></div>

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
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

      {/* FIX 3 + 5 — Alertes transit : 467 inter-sociétés + 580 règle R3 */}
      {transitAlerts.length > 0 && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 space-y-2">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-900 text-sm">
                ⚠️ Comptes de transit non soldés
              </p>
              <ul className="mt-2 space-y-1 text-xs text-amber-900">
                {transitAlerts.map((a, i) => (
                  <li key={`ta-${a.compte}-${a.type}-${i}`} className="flex items-start gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">{a.compte}</Badge>
                    <span>{a.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* FIX 4 — Alerte légale Companies Act Mauritius (CCA associé débiteur) */}
      {legalAlerts.length > 0 && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4 space-y-2">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-900 text-sm">
                ⚠️ Compte courant associé débiteur — Convention de prêt obligatoire
              </p>
              <p className="text-xs text-red-700 mt-1">
                Companies Act Mauritius : toute avance nette de la société à un associé exige
                une convention de prêt signée, à défaut risque de requalification en distribution.
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {legalAlerts.map(a => (
                  <li key={a.compte_id} className="flex items-center gap-2">
                    <span className="font-medium text-red-900">{a.nom}</span>
                    <span className="font-mono text-red-800">({fmt(a.solde)} MUR)</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* B4 — Dashboard KPIs rapprochement */}
      <RapprochementKpiDashboard societeId={societeId} />

      {/* P1 — Barre de selection de periode active avec compteurs par mois */}
      <PeriodeBar
        societeId={societeId}
        activeMonth={selectedMois}
        onSelectMonth={setSelectedMois}
        onCloturer={handleCloturerMois}
      />

      {/* Balance par compte — voir tous les comptes comptables utilises */}
      <BalanceComptes societeId={societeId} mois={selectedMois} />

      {/* ── Bouton unique: Rapprocher automatiquement ─────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-500">
          Rapprochement automatique : frais bancaires, MRA, salaires, virements internes, factures fournisseurs.
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleReclassify}
            disabled={reclassifying || !societeId}
            variant="outline"
            size="lg"
            title="Applique les règles R01-R07 (MRA, MCB, E-Payroll, salaires...) sur toutes les transactions sans facture — sans refaire le rapprochement complet"
          >
            {reclassifying
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Re-classification…</>
              : <><Target className="w-4 h-4 mr-2" />Re-classifier (R01-R07)</>
            }
          </Button>
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
      </div>

      {/* Filters row: Month nav (← Mois Année →) + toggle all-months + Compte + Période */}
      <div className="flex flex-wrap items-center gap-3">
        {(() => {
          const MOIS_FR_FULL = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
          const todayYM = new Date().toISOString().slice(0, 7)
          const current = selectedMois || todayYM
          const [yy, mm] = current.split('-').map(Number)
          const label = selectedMois ? `${MOIS_FR_FULL[(mm || 1) - 1]} ${yy}` : 'Toutes périodes'
          const shift = (delta: number) => {
            // Only active when a month is selected — disabled in all-months mode.
            if (!selectedMois) return
            const d = new Date(yy, (mm || 1) - 1 + delta, 1)
            const ny = d.getFullYear()
            const nm = String(d.getMonth() + 1).padStart(2, '0')
            setSelectedMois(`${ny}-${nm}`)
          }
          return (
            <div className="inline-flex items-center gap-1 rounded-lg border bg-white px-1 py-1">
              <button
                type="button"
                onClick={() => shift(-1)}
                disabled={!selectedMois}
                className="h-7 w-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                aria-label="Mois précédent"
              >
                ←
              </button>
              <span className="px-3 text-sm font-medium text-[#0B0F2E] min-w-[140px] text-center">
                {label}
              </span>
              <button
                type="button"
                onClick={() => shift(1)}
                disabled={!selectedMois}
                className="h-7 w-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                aria-label="Mois suivant"
              >
                →
              </button>
            </div>
          )
        })()}

        {/* Toggle: all months ↔ single month (visible outline button) */}
        {selectedMois ? (
          <button
            type="button"
            onClick={() => setSelectedMois(null)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
          >
            Voir tous les mois
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSelectedMois(new Date().toISOString().slice(0, 7))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
          >
            Choisir un mois
          </button>
        )}

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
          txLibelle?: string | null // FIX 5 — libellé de la transaction bancaire
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
              // FIX 5 — afficher la date RÉELLE de la transaction bancaire (rapproche_tx_date),
              // pas la date à laquelle le lettrage a été enregistré (rapproche_date = aujourd'hui).
              payDate: f.rapproche_tx_date || f.rapproche_date || null,
              txLibelle: f.rapproche_tx_libelle || null,
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
              <CardTitle className="text-[#0B0F2E] flex items-center gap-2 flex-wrap">
                <span>💳</span>
                <span>Factures fournisseurs</span>
                {selectedMois ? (() => {
                  const MOIS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
                  const [yy, mm] = selectedMois.split('-').map(Number)
                  return <span className="text-sm font-medium text-gray-500">— {MOIS_FR[(mm || 1) - 1]} {yy}</span>
                })() : (
                  <span className="text-sm font-medium text-gray-500">— Toutes périodes</span>
                )}
                <span className="text-xs font-normal text-gray-400 ml-auto">
                  {rows.length} facture{rows.length > 1 ? 's' : ''}
                </span>
                {/* Bouton "Tout remettre en attente" — reset complet factures + tx + écritures BNQ */}
                {rows.some(r => r.status === 'paye') && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 border-[#9F1239]/40 text-[#9F1239] hover:bg-[#9F1239]/5"
                    disabled={annulationEnCours}
                    onClick={() => handleAnnulerPaiement(['ALL'])}
                  >
                    {annulationEnCours ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Tout remettre en attente ({rows.filter(r => r.status === 'paye').length})
                  </Button>
                )}
              </CardTitle>
              {/* Barre d'annulation en masse — visible quand ≥1 facture payée est cochée */}
              {selectedFacturesForAnnulation.size > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-[#9F1239]/30 bg-[#9F1239]/5 px-3 py-2 mt-2">
                  <span className="text-sm">
                    <span className="font-semibold text-[#0B0F2E]">{selectedFacturesForAnnulation.size}</span>
                    <span className="text-gray-600"> facture{selectedFacturesForAnnulation.size > 1 ? 's' : ''} sélectionnée{selectedFacturesForAnnulation.size > 1 ? 's' : ''}</span>
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedFacturesForAnnulation(new Set())} disabled={annulationEnCours}>
                      Désélectionner
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 gap-1 bg-[#9F1239] hover:bg-[#9F1239]/90 text-white text-xs"
                      onClick={() => handleAnnulerPaiement(Array.from(selectedFacturesForAnnulation))}
                      disabled={annulationEnCours}
                    >
                      {annulationEnCours ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Remettre en attente ({selectedFacturesForAnnulation.size})
                    </Button>
                  </div>
                </div>
              )}
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
                  {pageRows.map(({ f, label, badgeCls, payDate, status, txLibelle }) => (
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
                      {/* FIX 5 — colonne Paiement : date virement + libellé de la transaction */}
                      <TableCell className="text-xs text-gray-500">
                        {status === 'paye' && payDate ? (
                          <div className="space-y-0.5">
                            <div className="font-medium text-gray-700">
                              Virement du {formatDate(payDate)}
                            </div>
                            {txLibelle && (
                              <div className="text-gray-500 text-[11px] truncate max-w-[260px]" title={txLibelle}>
                                {txLibelle}
                              </div>
                            )}
                          </div>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {status === 'paye' && (
                          <div className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 cursor-pointer"
                              checked={selectedFacturesForAnnulation.has(f.id)}
                              onChange={() => {
                                setSelectedFacturesForAnnulation(prev => {
                                  const next = new Set(prev)
                                  if (next.has(f.id)) next.delete(f.id); else next.add(f.id)
                                  return next
                                })
                              }}
                            />
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 text-xs text-[#9F1239] hover:bg-[#9F1239]/5"
                              onClick={() => handleAnnulerPaiement([f.id])}
                              disabled={annulationEnCours}
                            >
                              Annuler
                            </Button>
                          </div>
                        )}
                        {status !== 'paye' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                                Lettrer <ChevronDown className="w-3 h-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64">
                              <DropdownMenuLabel className="text-xs">Action sur cette facture</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleMarquerPaye(f)} className="gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                                <div className="flex flex-col">
                                  <span className="text-sm">Marquer payée</span>
                                  <span className="text-[10px] text-gray-500">Crée BNQ + lettre auto</span>
                                </div>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setDialogTab('factures')
                                const fTTC = Number(f.montant_ttc) || 0
                                const fMUR = Number(f.montant_mur) || fTTC
                                const fDevise = (f.devise || 'MUR').toUpperCase()
                                // Chercher une tx bancaire correspondant à cette facture (±10%)
                                const findTx = (pool: any[]) => pool.find((t: any) => {
                                  const tDebit = Number(t.debit) || 0
                                  if (tDebit <= 0) return false
                                  const tDevise = (t.devise || 'MUR').toUpperCase()
                                  if (tDevise === fDevise && fTTC > 0) return Math.abs(tDebit - fTTC) / fTTC < 0.10
                                  if (fMUR > 0) return Math.abs(tDebit - fMUR) / fMUR < 0.10
                                  return false
                                })
                                const prefill = findTx(unmatched) || findTx(transactions)
                                if (prefill) {
                                  // Match net → on ouvre directement le dialog de lettrage habituel avec cette tx
                                  setLinkDialog(prefill)
                                } else {
                                  // Pas de match net → on ouvre le picker pour choisir une tx manuellement
                                  setPickTxForFacture(f)
                                }
                              }} className="gap-2">
                                <Link2 className="w-4 h-4 text-blue-600" />
                                <div className="flex flex-col">
                                  <span className="text-sm">Lettrer avec une transaction</span>
                                  <span className="text-[10px] text-gray-500">Choisir une tx bancaire</span>
                                </div>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      {/* ════════════════════════════════════════════════════════════════
          Transactions bancaires — 3 onglets (À classer / Classées / À vérifier)
          ════════════════════════════════════════════════════════════════ */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: 'fournisseurs' as const, icon: '📊', label: 'Par fournisseur', count: 0, color: 'border-[#D4AF37] text-[#A88925]' },
          { id: 'aclasser' as const, icon: '📋', label: 'À classer', count: unmatched.length, color: 'border-orange-500 text-orange-700' },
          { id: 'classees' as const, icon: '✅', label: 'Classées', count: matchedWithInvoice.length + classifiedAuto.length + interne.length, color: 'border-green-500 text-green-700' },
          { id: 'verifier' as const, icon: '⚠️', label: 'À vérifier', count: paidNoInvoice.length, color: 'border-amber-500 text-amber-700' },
        ]).map(tab => {
          const isActive = transactionTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTransactionTab(tab.id)}
              className={`px-4 py-2 -mb-px border-b-2 text-sm transition-colors ${
                isActive
                  ? `${tab.color} font-semibold`
                  : 'border-transparent text-gray-500 hover:text-[#0B0F2E]'
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
              <span className={`ml-1.5 text-xs font-medium ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                ({tab.count})
              </span>
            </button>
          )
        })}
      </div>

      {/* SECTION 3a — Rapprochées AVEC facture (vert) */}
      {transactionTab === 'classees' && matchedWithInvoice.length > 0 && (
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
      {transactionTab === 'classees' && classifiedAuto.length > 0 && (
        <Card className="border-blue-200">
          <CardHeader>
            <CardTitle className="text-[#0B0F2E] flex items-center gap-2 text-base">
              📋 Classifiées automatiquement — sans pièce comptable ({classifiedAuto.length})
            </CardTitle>
            <p className="text-xs text-gray-500">Frais bancaires, salaires, charges sociales, paiements MRA — lettrées automatiquement</p>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Montant</TableHead><TableHead>Tiers</TableHead><TableHead>Type</TableHead><TableHead>Lettre</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {classifiedAuto.map((tx: any) => (
                  <TableRow key={tx.id} className="bg-blue-50/30">
                    <TableCell className="text-sm">{formatDate(tx.date)}</TableCell>
                    <TableCell className="text-sm"><TruncatedCell text={tx.libelle} /></TableCell>
                    <TableCell className="text-right font-medium">{Number(tx.debit) > 0 ? <span className="text-red-600">-{fmt(Number(tx.debit))} {tx.devise}</span> : <span className="text-green-600">+{fmt(Number(tx.credit))} {tx.devise}</span>}</TableCell>
                    <TableCell className="text-sm">{tx.tiers_detecte || "—"}</TableCell>
                    <TableCell><Badge className="bg-blue-100 text-blue-700 text-[10px]">{tx.matched_type?.replace(/_/g, ' ') || '—'}</Badge></TableCell>
                    <TableCell><Badge className="bg-blue-100 text-blue-700"><CheckCircle2 className="w-3 h-3" /></Badge></TableCell>
                    <TableCell>
                      {tx.releve_id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-700 hover:text-blue-900">
                              Modifier <ChevronDown className="w-3 h-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-80">
                            <DropdownMenuLabel className="text-xs">Corriger la classification (le système apprend)</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {CLASSIFICATION_CHOICES.map(c => (
                              <DropdownMenuItem key={c.code} onClick={() => handleClasserTx(tx, c.code, false)}>
                                <span className="text-xs font-mono text-gray-500 mr-2">{c.compte}</span>{c.label}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-xs text-amber-700">⚡ Corriger + propager à toutes les tx du même tiers</DropdownMenuLabel>
                            {CLASSIFICATION_CHOICES.map(c => (
                              <DropdownMenuItem key={`prop-${c.code}`} onClick={() => handleClasserTx(tx, c.code, true)}>
                                <span className="text-xs font-mono text-gray-500 mr-2">{c.compte}</span>{c.label} <span className="ml-auto text-[10px] text-amber-600">(propager)</span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* SECTION 3c — Payées SANS pièce comptable — onglet "À vérifier" */}
      {transactionTab === 'verifier' && paidNoInvoice.length > 0 && (
        <div>
          <Card className="border-amber-300 bg-amber-50/30">
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
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {(() => {
                            // Compte toutes les tx non classifiees avec meme tiers (dans a_verifier + a_classer)
                            // Normalisation identique au backend : lowercase, suppression MR/MRS, ponctuation
                            const norm = (s: string) => (s || '')
                              .trim()
                              .toLowerCase()
                              .replace(/\b(mr|mrs|ms|mme|monsieur|madame|m\.|sir)\b/g, '')
                              .replace(/[^a-z0-9\s]/g, ' ')
                              .replace(/\s+/g, ' ')
                              .trim()
                            const myTiers = norm(tx.tiers_detecte || (tx as any).tiers || '')
                            const candidates = [...paidNoInvoice, ...unmatched]
                            const nbSimilaires = myTiers.length >= 3
                              ? candidates.filter((o: any) =>
                                  o.id !== tx.id
                                  && norm(o.tiers_detecte || o.tiers || '') === myTiers
                                ).length
                              : 0
                            const classifications = CLASSIFICATION_CHOICES
                            return (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                                    Classer{nbSimilaires > 0 ? ` (+${nbSimilaires})` : ''} <ChevronDown className="w-3 h-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-80">
                                  <DropdownMenuLabel className="text-xs">Classer cette transaction</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {classifications.map(c => (
                                    <DropdownMenuItem key={c.code} onClick={() => handleClasserTx(tx, c.code, false)}>
                                      <span className="text-xs font-mono text-gray-500 mr-2">{c.compte}</span>{c.label}
                                    </DropdownMenuItem>
                                  ))}
                                  {nbSimilaires > 0 && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuLabel className="text-xs text-amber-700">
                                        ⚡ Classer + propager à {nbSimilaires} tx similaires (même tiers)
                                      </DropdownMenuLabel>
                                      {classifications.map(c => (
                                        <DropdownMenuItem
                                          key={`prop-${c.code}`}
                                          onClick={() => handleClasserTx(tx, c.code, true)}
                                          className="text-amber-700"
                                        >
                                          <Zap className="w-3 h-3 mr-1 text-amber-600" />
                                          <span className="text-xs font-mono text-gray-500 mr-2">{c.compte}</span>
                                          {c.label} <span className="ml-auto text-[10px] text-amber-600">+{nbSimilaires}</span>
                                        </DropdownMenuItem>
                                      ))}
                                    </>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => { setDialogTab('factures'); setLettrageTiersFilter(tx.tiers_detecte || ''); setSelectedFactureIds(new Set()); setLinkDialog(tx) }}>
                                    <Link2 className="w-4 h-4 mr-2 text-blue-600" />Lettrer avec une facture
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openNdfDialog(tx)}>
                                    <Users className="w-4 h-4 mr-2 text-purple-600" />Rembourser un employé (NDF)
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )
                          })()}
                          <Button variant="ghost" size="sm" onClick={() => handleUnlink(tx)} title="Délettrer">
                            <Unlink className="w-4 h-4 text-amber-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
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
      {transactionTab === 'classees' && interne.length > 0 && (
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

      {/* SECTION — Vue par fournisseur */}
      {transactionTab === 'fournisseurs' && (() => {
        const allFacs = (data?.factures || []) as any[]
        const unpaidFacs = allFacs.filter((f: any) => f.statut !== 'paye' && f.statut !== 'annule' && f.type_facture !== 'client')

        // Taux de change approximatifs pour comparer factures MUR avec tx EUR
        const RATES: Record<string, number> = { MUR: 1, EUR: 54.4, USD: 44.8, GBP: 54.2 }
        const toMUR = (amount: number, devise: string) => {
          const rate = RATES[(devise || 'MUR').toUpperCase()] || 1
          return amount * rate
        }

        // Grouper par tiers normalisé + mois
        const groupMap = new Map<string, { tiers: string; tiersNorm: string; mois: string; factures: any[]; totalMUR: number; totalOriginal: number; devise: string }>()
        for (const f of unpaidFacs) {
          const tiersRaw = f.tiers || 'Inconnu'
          const tiersNorm = tiersRaw.toLowerCase().replace(/\b(ltd|limited|sarl|sas|sa|co|inc)\b/gi, '').replace(/[.,;:()/\\'\-"]/g, ' ').replace(/\s+/g, ' ').trim()
          const mois = (f.date_facture || '').substring(0, 7) || 'sans-date'
          const key = `${tiersNorm}__${mois}`
          if (!groupMap.has(key)) {
            groupMap.set(key, { tiers: tiersRaw, tiersNorm, mois, factures: [], totalMUR: 0, totalOriginal: 0, devise: f.devise || 'MUR' })
          }
          const g = groupMap.get(key)!
          g.factures.push(f)
          g.totalMUR += Number(f.montant_mur) || toMUR(Number(f.montant_ttc) || 0, f.devise || 'MUR')
          g.totalOriginal += Number(f.montant_ttc) || 0
        }

        const groupes = Array.from(groupMap.values()).sort((a, b) => b.mois.localeCompare(a.mois) || b.totalMUR - a.totalMUR)

        // Pour chaque groupe, chercher la meilleure tx bancaire
        // IMPORTANT : comparer en MUR (convertir les tx EUR via le taux)
        const allTx = transactions.filter((t: any) => t.statut === 'non_identifie' && Number(t.debit) > 0)
        const usedTxIds = new Set<string>()

        const groupesWithMatch = groupes.map(g => {
          let bestTx: any = null
          let bestScore = -1
          const gTotalMUR = g.totalMUR

          for (const tx of allTx) {
            if (usedTxIds.has(tx.id)) continue
            const txAmt = Number(tx.debit) || 0
            if (txAmt === 0) continue
            const txDevise = (tx.devise || 'MUR').toUpperCase()
            const txAmtMUR = toMUR(txAmt, txDevise)

            // Comparer en MUR
            const amtDiff = Math.abs(txAmtMUR - gTotalMUR) / Math.max(gTotalMUR, 1)
            if (amtDiff > 0.15) continue

            // Aussi comparer en devise native si même devise
            let nativeDiff = 999
            if (txDevise === g.devise.toUpperCase() && g.totalOriginal > 0) {
              nativeDiff = Math.abs(txAmt - g.totalOriginal) / g.totalOriginal
            }
            const bestDiff = Math.min(amtDiff, nativeDiff)

            const txTiers = (tx.tiers_detecte || tx.libelle || '').toLowerCase()
            const tiersWords = g.tiersNorm.split(/\s+/).filter((w: string) => w.length >= 3)
            const matchedWords = tiersWords.filter((w: string) => txTiers.includes(w))
            const tiersSim = tiersWords.length > 0 ? matchedWords.length / tiersWords.length : 0

            let score = 0
            if (bestDiff < 0.005) score += 50
            else if (bestDiff < 0.03) score += 40
            else if (bestDiff < 0.08) score += 25
            else score += 10

            score += tiersSim * 40

            if (g.mois !== 'sans-date' && tx.date) {
              const txMois = (tx.date || '').substring(0, 7)
              if (txMois === g.mois) score += 10
              else {
                const gDate = new Date(g.mois + '-15')
                const tDate = new Date(tx.date)
                const daysDiff = Math.abs((tDate.getTime() - gDate.getTime()) / 86400000)
                if (daysDiff <= 45) score += 5
              }
            }

            if (score > bestScore) {
              bestScore = score
              bestTx = { ...tx, score, amtDiff: bestDiff, tiersSim, txAmtMUR }
            }
          }

          if (bestTx && bestScore >= 20) {
            usedTxIds.add(bestTx.id)
          }

          const matchLevel = !bestTx || bestScore < 20 ? 'none'
            : bestTx.amtDiff < 0.03 && bestTx.tiersSim > 0.3 ? 'exact'
            : bestTx.amtDiff < 0.10 ? 'approximatif'
            : 'none'

          return { ...g, bestTx: bestScore >= 20 ? bestTx : null, matchLevel }
        })

        const MOIS_FR: Record<string, string> = {
          '01': 'Janvier', '02': 'Février', '03': 'Mars', '04': 'Avril',
          '05': 'Mai', '06': 'Juin', '07': 'Juillet', '08': 'Août',
          '09': 'Septembre', '10': 'Octobre', '11': 'Novembre', '12': 'Décembre'
        }
        const fmtMois = (m: string) => {
          const [y, mm] = m.split('-')
          return `${MOIS_FR[mm] || mm} ${y}`
        }

        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[#0B0F2E] flex items-center gap-2 text-base">
                <span>📊</span> Rapprochement par fournisseur
                <span className="text-xs font-normal text-gray-400 ml-auto">
                  {groupes.length} groupe{groupes.length > 1 ? 's' : ''} · {unpaidFacs.length} facture{unpaidFacs.length > 1 ? 's' : ''} en attente
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {groupes.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm">Aucune facture fournisseur en attente</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fournisseur</TableHead>
                      <TableHead>Mois</TableHead>
                      <TableHead className="text-center">Factures</TableHead>
                      <TableHead className="text-right">Total dû</TableHead>
                      <TableHead>Paiement trouvé</TableHead>
                      <TableHead className="text-right">Montant tx</TableHead>
                      <TableHead className="text-center">Écart</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupesWithMatch.map((g, gi) => {
                      const tx = g.bestTx
                      const borderCls = g.matchLevel === 'exact' ? 'border-l-4 border-l-[#0F766E] bg-[#0F766E]/5'
                        : g.matchLevel === 'approximatif' ? 'border-l-4 border-l-[#D4AF37] bg-[#D4AF37]/5'
                        : ''
                      return (
                        <TableRow key={gi} className={borderCls}>
                          <TableCell className="font-medium text-sm text-[#0B0F2E]">{g.tiers}</TableCell>
                          <TableCell className="text-sm text-gray-600">{g.mois !== 'sans-date' ? fmtMois(g.mois) : '—'}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-xs">{g.factures.length}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-sm">
                            {g.devise !== 'MUR' ? (
                              <div>
                                <div>{fmt(g.totalOriginal)} <span className="text-xs text-gray-400">{g.devise}</span></div>
                                <div className="text-[10px] text-gray-400">≈ {fmt(g.totalMUR)} MUR</div>
                              </div>
                            ) : (
                              <span>{fmt(g.totalMUR)} <span className="text-xs text-gray-400">MUR</span></span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {tx ? (
                              <div>
                                <div className="font-medium text-[#0B0F2E] truncate max-w-[200px]" title={tx.libelle}>{tx.tiers_detecte || tx.libelle?.substring(0, 30) || '—'}</div>
                                <div className="text-[10px] text-gray-400">{formatDate(tx.date)}</div>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">❌ Pas trouvé</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {tx ? (
                              <span className={g.matchLevel === 'exact' ? 'text-[#0F766E] font-semibold' : g.matchLevel === 'approximatif' ? 'text-[#A88925]' : ''}>
                                {fmt(Number(tx.debit))} {tx.devise || ''}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-center text-xs">
                            {tx ? (
                              <Badge className={
                                g.matchLevel === 'exact' ? 'bg-[#0F766E]/10 text-[#0F766E] border-[#0F766E]/30' :
                                g.matchLevel === 'approximatif' ? 'bg-[#D4AF37]/10 text-[#A88925] border-[#D4AF37]/30' :
                                'bg-gray-100 text-gray-500'
                              }>
                                {tx.amtDiff < 0.005 ? '✓ exact' : `${(tx.amtDiff * 100).toFixed(1)}%`}
                              </Badge>
                            ) : '—'}
                          </TableCell>
                          <TableCell>
                            {tx && g.matchLevel !== 'none' ? (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  className="h-7 text-xs bg-[#0F766E] hover:bg-[#0F766E]/90 text-white"
                                  onClick={() => {
                                    if (g.factures.length === 1) {
                                      handleManualLink(tx, g.factures[0], 'facture')
                                    } else {
                                      handleManualLinkMulti(tx, g.factures)
                                    }
                                  }}
                                >
                                  Valider
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => { setDialogTab('factures'); setLettrageTiersFilter(g.tiers); setSelectedFactureIds(new Set()); setLinkDialog(tx) }}
                                >
                                  Détail
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  const fakeTx = { id: 'pick', libelle: g.tiers, tiers_detecte: g.tiers, debit: g.totalOriginal, credit: 0, devise: g.devise }
                                  setPickTxForFacture(g.factures[0])
                                }}
                              >
                                Chercher
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {/* SECTION 4 — Transactions à classer — onglet "À classer" */}
      {transactionTab === 'aclasser' && (
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
          ) : (() => {
            // Pagination — apply search first, then page-slice (20/page).
            const filtered = sortedUnmatched.filter(tx => {
              if (!txSearch) return true
              const s = txSearch.toLowerCase()
              return tx.libelle?.toLowerCase().includes(s) || (tx.tiers_detecte || "").toLowerCase().includes(s) || String(tx.debit).includes(s) || String(tx.credit).includes(s)
            })
            const totalPagesU = Math.max(1, Math.ceil(filtered.length / UNMATCHED_PAGE_SIZE))
            const safePageU = Math.min(Math.max(1, unmatchedPage), totalPagesU)
            const startU = (safePageU - 1) * UNMATCHED_PAGE_SIZE
            const pageItems = filtered.slice(startU, startU + UNMATCHED_PAGE_SIZE)
            return (
            <>
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead><TableHead>Tiers</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {pageItems
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
                        <div className="flex gap-1 flex-wrap items-center">
                          <Button variant="outline" size="sm" onClick={() => { setDialogTab("factures"); setLinkDialog(tx) }} className="gap-1">
                            <Link2 className="w-3 h-3" />Lettrer
                          </Button>
                          {associes.length > 0 && (
                            <Button variant="outline" size="sm" onClick={() => { setPayeParNom(associes[0]?.nom || ""); setPayeParType("associe"); setDialogTab("bach"); setLinkDialog(tx) }} className="gap-1 text-purple-600 border-purple-200 hover:bg-purple-50">
                              <Users className="w-3 h-3" />Associé
                            </Button>
                          )}
                          {/* Dropdown riche avec numeros de compte + propagation tiers similaires */}
                          {(() => {
                            const norm = (s: string) => (s || '')
                              .trim()
                              .toLowerCase()
                              .replace(/\b(mr|mrs|ms|mme|monsieur|madame|m\.|sir)\b/g, '')
                              .replace(/[^a-z0-9\s]/g, ' ')
                              .replace(/\s+/g, ' ')
                              .trim()
                            const myTiers = norm(tx.tiers_detecte || (tx as any).tiers || '')
                            const candidates = [...paidNoInvoice, ...unmatched]
                            const nbSimilaires = myTiers.length >= 3
                              ? candidates.filter((o: any) =>
                                  o.id !== tx.id
                                  && norm(o.tiers_detecte || o.tiers || '') === myTiers
                                ).length
                              : 0
                            const classifications = [
                              { code: 'frais_bancaires',         label: 'Frais bancaires',         compte: '627' },
                              { code: 'paiement_mra',            label: 'Paiement MRA (impots)',   compte: '447' },
                              { code: 'salaire',                 label: 'Salaire net',             compte: '421' },
                              { code: 'compte_courant_associe',  label: 'Compte courant associe',  compte: '455' },
                              { code: 'avance_personnel',        label: 'Avance au personnel',     compte: '425' },
                              { code: 'virement_interne',        label: 'Virement interne',        compte: '580' },
                              { code: 'remboursement_personnel', label: 'Remboursement personnel', compte: '108' },
                              { code: 'charge_diverse',          label: 'Charge diverse',          compte: '658' },
                              { code: 'autre',                   label: 'A classer plus tard',     compte: '471' },
                            ]
                            return (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                                    Classer{nbSimilaires > 0 ? ` (+${nbSimilaires})` : ''} <ChevronDown className="w-3 h-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-80">
                                  <DropdownMenuLabel className="text-xs">Classer cette transaction</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {classifications.map(c => (
                                    <DropdownMenuItem key={c.code} onClick={() => handleClasserTx(tx, c.code, false)}>
                                      <span className="text-xs font-mono text-gray-500 mr-2">{c.compte}</span>{c.label}
                                    </DropdownMenuItem>
                                  ))}
                                  {nbSimilaires > 0 && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuLabel className="text-xs text-amber-700">
                                        ⚡ Classer + propager a {nbSimilaires} tx similaires (meme tiers)
                                      </DropdownMenuLabel>
                                      {classifications.map(c => (
                                        <DropdownMenuItem
                                          key={`prop-${c.code}`}
                                          onClick={() => handleClasserTx(tx, c.code, true)}
                                          className="text-amber-700"
                                        >
                                          <Zap className="w-3 h-3 mr-1 text-amber-600" />
                                          <span className="text-xs font-mono text-gray-500 mr-2">{c.compte}</span>
                                          {c.label}
                                          <span className="ml-auto text-[10px] text-amber-600">+{nbSimilaires}</span>
                                        </DropdownMenuItem>
                                      ))}
                                    </>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => { setDialogTab('factures'); setLettrageTiersFilter(tx.tiers_detecte || ''); setSelectedFactureIds(new Set()); setLinkDialog(tx) }}>
                                    <Link2 className="w-4 h-4 mr-2 text-blue-600" />
                                    Lettrer avec facture(s) fournisseur
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openNdfDialog(tx)}>
                                    <Users className="w-4 h-4 mr-2 text-purple-600" />
                                    Rembourser un employé (NDF)
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )
                          })()}
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
            {totalPagesU > 1 && (
              <div className="flex items-center justify-between border-t bg-gray-50/50 px-4 py-2 text-sm">
                <span className="text-gray-600">
                  Page <strong>{safePageU}</strong> sur {totalPagesU}{" "}
                  <span className="text-gray-400">· {filtered.length} transaction{filtered.length > 1 ? "s" : ""}</span>
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline" size="sm"
                    disabled={safePageU <= 1}
                    onClick={() => setUnmatchedPage(p => Math.max(1, p - 1))}
                    className="h-7 text-xs"
                  >
                    ← Précédent
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    disabled={safePageU >= totalPagesU}
                    onClick={() => setUnmatchedPage(p => Math.min(totalPagesU, p + 1))}
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
      )}


      {/* SECTION 5 — Lettrage écritures 401/411 — advanced, collapsed by default */}
      <details className="group">
        <summary className="cursor-pointer flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-[#0B0F2E] py-2 px-2 rounded-md hover:bg-gray-50">
          <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform" />
          🔧 Comptabilité avancée {ecrituresLettrage.length > 0 && <span className="text-xs text-gray-400">— {ecrituresLettrage.length} écritures 401/411 non lettrées</span>}
        </summary>
        <div className="mt-2 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-[#0B0F2E]">
              Écritures comptables à lettrer <span className="text-xs text-gray-400 font-normal">(technique)</span>
              {ecrituresLettrage.length > 0 && <span className="text-xs text-gray-500 font-normal ml-2">— {ecrituresLettrage.length} non lettrées</span>}
            </CardTitle>
            <p className="text-xs text-gray-500 italic mt-1">
              Ces écritures sont générées automatiquement lors du rapprochement.
              Elles sont utilisées pour la clôture comptable.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleGenerateEcritures} disabled={generatingEcritures}>
                {generatingEcritures ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                {generatingEcritures ? "Génération..." : "Générer écritures BNQ"}
              </Button>
              <Button
                onClick={handleAutoLettrage}
                disabled={autoLettraging || !societeId}
                className="bg-[#0B0F2E] hover:bg-[#1a1f4a] text-white"
                size="sm"
              >
                {autoLettraging
                  ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Synchronisation…</>
                  : <><span className="mr-1">🔄</span>Tout synchroniser automatiquement</>
                }
              </Button>
            </div>
            <p className="text-[11px] text-gray-500 italic max-w-xs text-right">
              Met à jour les écritures comptables pour refléter les paiements déjà confirmés.
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {ecrituresLettrage.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Aucune écriture non lettrée en 401/411</div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Compte</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead><TableHead>Journal</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {ecrituresLettrage.slice(0, 50).map((e: any) => {
                  // Une écriture 401 CRÉDIT (ACH) représente une dette fournisseur.
                  // Pour la solder sans tx bancaire, "Marquer payée" crée le BNQ débit + letters.
                  const canMarkPaid = e.facture_id && Number(e.credit) > 0 && String(e.compte || '').startsWith('401')
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">{formatDate(e.date_ecriture)}</TableCell>
                      <TableCell className="font-mono text-sm">{e.compte}</TableCell>
                      <TableCell className="text-sm"><TruncatedCell text={e.libelle || "—"} /></TableCell>
                      <TableCell className="text-right text-sm text-red-600 font-medium">{Number(e.debit) > 0 ? fmt(Number(e.debit)) : "—"}</TableCell>
                      <TableCell className="text-right text-sm text-green-600 font-medium">{Number(e.credit) > 0 ? fmt(Number(e.credit)) : "—"}</TableCell>
                      <TableCell className="text-sm">{e.journal || "—"}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-1">
                              <Link2 className="w-3 h-3" />Lettrer<ChevronDown className="w-3 h-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-64">
                            {canMarkPaid && (
                              <>
                                <DropdownMenuItem onClick={async () => {
                                  if (!societeId) return
                                  if (!confirm("Marquer la facture comme payée ?\n\nCela crée le débit 401 (BNQ) et letters automatiquement avec le crédit 401 (ACH).")) return
                                  try {
                                    const res = await fetch("/api/comptable/rapprochement", {
                                      method: "POST", headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ action: "marquer_paye", facture_id: e.facture_id, societe_id: societeId }),
                                    })
                                    const d = await res.json()
                                    if (!res.ok) setToast({ type: 'error', message: d.error || 'Erreur' })
                                    else { setToast({ type: 'success', message: `✓ Facture payée (lettre ${d.lettre})` }); load() }
                                  } catch (err: any) { setToast({ type: 'error', message: err.message }) }
                                }} className="gap-2">
                                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  <div className="flex flex-col">
                                    <span className="text-sm">Marquer payée</span>
                                    <span className="text-[10px] text-gray-500">Crée BNQ + lettre auto</span>
                                  </div>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem onClick={() => {
                              setLettrageDialog(e)
                              setLettrageSelection(new Set([e.id]))
                            }} className="gap-2">
                              <Link2 className="w-4 h-4 text-blue-600" />
                              <div className="flex flex-col">
                                <span className="text-sm">Lettrer manuellement</span>
                                <span className="text-[10px] text-gray-500">Sélectionner des écritures à regrouper</span>
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleAutoLettrage} disabled={autoLettraging} className="gap-2">
                              <Zap className="w-4 h-4 text-amber-600" />
                              <div className="flex flex-col">
                                <span className="text-sm">Tout synchroniser auto</span>
                                <span className="text-[10px] text-gray-500">Lance sync_lettrage global</span>
                              </div>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
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
            const { salaires, mra, frais, internes, remboursements, notes_frais, inconnus } = autoPreview
            // "inconnus" ne sont PAS auto-classés (pas de règle déclenchée) —
            // on les affiche pour transparence mais on ne les compte pas
            // dans le "Total à classer" ni dans le bouton de confirmation.
            const total = salaires.count + mra.count + frais.count + internes.count + remboursements.count + notes_frais.count
            const totalMontant = salaires.total + mra.total + frais.total + internes.total + remboursements.total + notes_frais.total
            if (total === 0 && inconnus.count === 0) {
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
                  {notes_frais.count > 0 && (
                    <div className="flex items-center justify-between p-2.5 bg-teal-50 border border-teal-200 rounded">
                      <span className="text-sm"><span className="mr-2">🧾</span>{notes_frais.count} note{notes_frais.count > 1 ? 's' : ''} de frais (421/467)</span>
                      <span className="font-mono text-sm font-semibold text-teal-900">{fmt(notes_frais.total)} MUR</span>
                    </div>
                  )}
                  {inconnus.count > 0 && (
                    <div className="flex items-center justify-between p-2.5 bg-orange-50 border border-orange-200 rounded">
                      <span className="text-sm">
                        <span className="mr-2">⚠️</span>
                        {inconnus.count} transaction{inconnus.count > 1 ? 's' : ''} sans règle — <em>à traiter manuellement</em>
                      </span>
                      <span className="font-mono text-sm font-semibold text-orange-900">{fmt(inconnus.total)} MUR</span>
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
                    disabled={chatLoading || total === 0}
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
      {/* NDF — Remboursement employe */}
      <Dialog open={!!ndfDialog} onOpenChange={o => { if (!o) setNdfDialog(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" /> Remboursement note de frais
            </DialogTitle>
          </DialogHeader>
          {ndfDialog && (
            <div className="space-y-3">
              <div className="p-2 bg-slate-50 rounded text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Transaction :</span>
                  <span className="font-medium">{formatDate(ndfDialog.date)}</span>
                </div>
                <div className="truncate" title={ndfDialog.libelle}>{ndfDialog.libelle}</div>
                <div className="flex justify-between font-bold">
                  <span>Montant :</span>
                  <span className={ndfDialog.debit > 0 ? 'text-red-600' : 'text-green-600'}>
                    {fmt(Math.max(Number(ndfDialog.debit) || 0, Number(ndfDialog.credit) || 0))} {ndfDialog.devise}
                  </span>
                </div>
              </div>

              <div>
                <Label className="text-xs">Employé bénéficiaire</Label>
                <Select value={ndfEmployeId} onValueChange={setNdfEmployeId}>
                  <SelectTrigger><SelectValue placeholder="— Sélectionner un employé —" /></SelectTrigger>
                  <SelectContent>
                    {employes.length === 0 ? (
                      <SelectItem value="_none" disabled>Aucun employé (chargez depuis /rh/employes)</SelectItem>
                    ) : (
                      employes.map((e: any) => (
                        <SelectItem key={e.id} value={e.id}>
                          {`${e.prenom || ''} ${e.nom || ''}`.trim() || e.email || e.id}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Optionnel — si vide, le tiers_detecte de la tx sera utilisé
                </p>
              </div>

              <div>
                <Label className="text-xs">Description / Nature de la dépense</Label>
                <Input
                  value={ndfDescription}
                  onChange={e => setNdfDescription(e.target.value)}
                  placeholder="Ex: taxi aéroport, repas client, fournitures…"
                  className="h-8 text-sm"
                />
              </div>

              <div>
                <Label className="text-xs">Compte comptable à débiter</Label>
                <Select value={ndfCompte} onValueChange={setNdfCompte}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="425">425 — Avances au personnel</SelectItem>
                    <SelectItem value="108">108 — Compte de l'exploitant</SelectItem>
                    <SelectItem value="625">625 — Déplacements / missions</SelectItem>
                    <SelectItem value="624">624 — Transports de biens</SelectItem>
                    <SelectItem value="626">626 — Frais postaux / télécom</SelectItem>
                    <SelectItem value="622">622 — Rémunérations intermédiaires</SelectItem>
                    <SelectItem value="6251">6251 — Voyages et déplacements</SelectItem>
                    <SelectItem value="6257">6257 — Réceptions / clients</SelectItem>
                    <SelectItem value="658">658 — Autres charges diverses</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setNdfDialog(null)}>Annuler</Button>
                <Button
                  className="bg-purple-600 text-white hover:bg-purple-700"
                  onClick={handleRembourserEmploye}
                >
                  <Users className="w-4 h-4 mr-1" /> Enregistrer le remboursement
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

      {/* Picker de transaction bancaire depuis une facture
          S'ouvre quand aucun match auto ±10% n'est trouvé : l'utilisateur voit TOUTES les tx
          du mois (classées par proximité de montant) et en choisit une manuellement. */}
      <Dialog open={!!pickTxForFacture} onOpenChange={(o) => { if (!o) setPickTxForFacture(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choisir une transaction bancaire</DialogTitle>
          </DialogHeader>
          {pickTxForFacture && (() => {
            const f = pickTxForFacture
            const fTTC = Number(f.montant_ttc) || 0
            const fMUR = Number(f.montant_mur) || fTTC
            const fDevise = (f.devise || 'MUR').toUpperCase()
            // Tri: tx en débit d'abord, puis par proximité de montant avec la facture
            const pool = [...transactions].filter((t: any) => (Number(t.debit) || 0) > 0)
            const scored = pool.map((t: any) => {
              const tDebit = Number(t.debit) || 0
              const tDevise = (t.devise || 'MUR').toUpperCase()
              const refAmount = tDevise === fDevise ? fTTC : fMUR
              const diffPct = refAmount > 0 ? Math.abs(tDebit - refAmount) / refAmount : 999
              return { tx: t, diffPct }
            }).sort((a, b) => a.diffPct - b.diffPct)
            return (
              <div className="space-y-3">
                <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 border">
                  <div className="font-semibold text-[#0B0F2E]">Facture à lettrer</div>
                  <div className="mt-1">{f.tiers || 'Fournisseur'} — {f.numero_facture || f.id}</div>
                  <div className="mt-0.5">{formatDate(f.date_facture)} — <span className="font-mono font-semibold">{fmt(fTTC)} {fDevise}</span></div>
                </div>
                {scored.length === 0 ? (
                  <div className="text-sm text-gray-500 text-center py-6">
                    Aucune transaction en débit pour la période sélectionnée.<br />
                    Vérifiez que le relevé bancaire est bien importé.
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-gray-500">
                      {scored.length} transaction{scored.length > 1 ? 's' : ''} — triée{scored.length > 1 ? 's' : ''} par proximité de montant.
                    </div>
                    <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                      {scored.slice(0, 100).map(({ tx, diffPct }: any) => {
                        const matchLevel = diffPct < 0.01 ? 'exact' : diffPct < 0.10 ? 'close' : diffPct < 0.30 ? 'far' : 'verydifferent'
                        const borderCls = matchLevel === 'exact' ? 'border-[#0F766E] bg-[#0F766E]/5'
                          : matchLevel === 'close' ? 'border-[#D4AF37] bg-[#D4AF37]/5'
                          : matchLevel === 'far' ? 'border-gray-200 bg-white'
                          : 'border-gray-100 bg-gray-50/50'
                        return (
                          <button
                            key={tx.id}
                            type="button"
                            onClick={() => {
                              setLinkDialog(tx)
                              setPickTxForFacture(null)
                              setDialogTab('factures')
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg border ${borderCls} hover:border-[#0B0F2E] hover:shadow-sm transition-all`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-[#0B0F2E] truncate">{tx.libelle || '—'}</div>
                                <div className="text-[11px] text-gray-500">
                                  {formatDate(tx.date)}
                                  {tx.tiers_detecte && ` • ${tx.tiers_detecte}`}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm font-mono font-semibold text-[#9F1239]">
                                  -{fmt(Number(tx.debit) || 0)} {(tx.devise || 'MUR').toUpperCase()}
                                </div>
                                <div className="text-[10px] text-gray-400">
                                  {matchLevel === 'exact' ? '✓ exact' : `écart ${(diffPct * 100).toFixed(1)}%`}
                                </div>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )
          })()}
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

              {/* Tab: Factures — avec selection multiple pour 1 paiement = N factures */}
              {dialogTab === "factures" && (() => {
                const txAmount = (linkDialog.debit > 0 ? linkDialog.debit : linkDialog.credit) || 0
                const txDate = linkDialog.date ? new Date(linkDialog.date) : null
                // Parser le filtre : supporte "client xxx", "montant 1500", "date 2026-03"
                // ou simplement des tokens separes par espace qui peuvent etre montant, date, ou texte
                const q = lettrageTiersFilter.trim().toLowerCase()
                const tokens = q.split(/\s+/).filter(Boolean)
                // Extraire filtres specifiques
                let filterAmount: number | null = null
                let filterAmountMin: number | null = null
                let filterAmountMax: number | null = null
                let filterDate: string | null = null
                let filterText = ''
                for (const tok of tokens) {
                  const amtMatch = tok.match(/^(\d+(?:\.\d+)?)$/)
                  const dateMatch = tok.match(/^(\d{4}-\d{2}(?:-\d{2})?)$/)
                  const rangeMatch = tok.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/)
                  if (rangeMatch) {
                    filterAmountMin = parseFloat(rangeMatch[1])
                    filterAmountMax = parseFloat(rangeMatch[2])
                  } else if (amtMatch && parseFloat(tok) > 10) {
                    filterAmount = parseFloat(tok)
                  } else if (dateMatch) {
                    filterDate = dateMatch[1]
                  } else {
                    filterText += (filterText ? ' ' : '') + tok
                  }
                }

                const filtered = factures
                  .filter((f: any) => {
                    const fAmt = Number(f.montant_ttc) || 0
                    const fDate = f.date_facture || ''
                    // Filtre texte (tiers + numero)
                    if (filterText) {
                      const hay = `${(f.tiers || '').toLowerCase()} ${(f.numero_facture || '').toLowerCase()} ${(f.description || '').toLowerCase()}`
                      if (!hay.includes(filterText)) return false
                    }
                    // Filtre montant exact (±5%)
                    if (filterAmount !== null) {
                      const tol = Math.max(filterAmount * 0.05, 1)
                      if (Math.abs(fAmt - filterAmount) > tol) return false
                    }
                    // Filtre montant range
                    if (filterAmountMin !== null && filterAmountMax !== null) {
                      if (fAmt < filterAmountMin || fAmt > filterAmountMax) return false
                    }
                    // Filtre date (YYYY-MM ou YYYY-MM-DD)
                    if (filterDate) {
                      if (!fDate.startsWith(filterDate)) return false
                    }
                    return true
                  })
                  // Score de pertinence : plus le score est petit plus c est pertinent
                  .map((f: any) => {
                    const fAmt = Number(f.montant_ttc) || 0
                    const fDate = f.date_facture ? new Date(f.date_facture) : null
                    let score = 0
                    // Ecart de montant (normalise par le montant tx)
                    const amountGap = Math.abs(fAmt - txAmount) / Math.max(txAmount, 1)
                    score += amountGap * 100
                    // Ecart de date en jours (si date tx connue)
                    if (txDate && fDate && !isNaN(fDate.getTime())) {
                      const days = Math.abs((txDate.getTime() - fDate.getTime()) / (1000 * 60 * 60 * 24))
                      score += Math.min(days / 30, 5)
                    }
                    // Bonus tiers matching si le libelle de la tx contient le tiers facture
                    const txTiersNorm = (linkDialog.tiers_detecte || linkDialog.libelle || '').toLowerCase()
                    const fTiersNorm = (f.tiers || '').toLowerCase()
                    if (fTiersNorm && txTiersNorm.includes(fTiersNorm.split(/\s+/)[0])) {
                      score -= 20
                    }
                    return { f, score }
                  })
                  .sort((a: any, b: any) => a.score - b.score)
                  .map((x: any) => x.f)

                const selected = Array.from(selectedFactureIds)
                  .map(id => factures.find((f: any) => f.id === id))
                  .filter(Boolean) as any[]
                const totalSelected = selected.reduce((s: number, f: any) => s + (Number(f.montant_ttc) || 0), 0)
                const gap = totalSelected - txAmount
                const gapClose = Math.abs(gap) < Math.max(txAmount * 0.02, 1)

                return (
                  <div className="space-y-2">
                    {/* Barre de filtre multi-criteres + compteur selection */}
                    <div className="sticky top-0 bg-white pb-1 border-b space-y-1">
                      <div className="flex gap-2 items-center">
                        <Input
                          value={lettrageTiersFilter}
                          onChange={e => setLettrageTiersFilter(e.target.value)}
                          placeholder="🔍 Client, n° facture, montant (1500), plage (1000-2000), date (2026-03)..."
                          className="h-8 text-sm flex-1"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs whitespace-nowrap"
                          onClick={() => {
                            const ids = new Set(selectedFactureIds)
                            filtered.forEach((f: any) => ids.add(f.id))
                            setSelectedFactureIds(ids)
                          }}
                        >
                          Tout cocher ({filtered.length})
                        </Button>
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {filtered.length}/{factures.length}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 italic">
                        Ex : "MyT 225"  ·  "telecom 2026-03"  ·  "1000-2000"  ·  "SKYCALL"
                      </div>
                      {selectedFactureIds.size > 0 && (
                        <div className={`flex items-center justify-between gap-2 p-2 rounded text-xs ${gapClose ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                          <span className="font-medium">
                            {selectedFactureIds.size} facture{selectedFactureIds.size > 1 ? 's' : ''} • Total {fmt(totalSelected)}
                          </span>
                          <span className={gapClose ? 'text-green-700 font-bold' : 'text-amber-700'}>
                            Écart tx : {gap > 0 ? '+' : ''}{fmt(gap)}
                            {gapClose && ' ✓'}
                          </span>
                          <Button
                            size="sm"
                            className="h-6 bg-[#0B0F2E] text-white hover:bg-[#1a1f4a] text-xs"
                            onClick={() => handleManualLinkMulti(linkDialog, selected)}
                            disabled={selectedFactureIds.size === 0}
                          >
                            Lettrer ({selectedFactureIds.size})
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs"
                            onClick={() => setSelectedFactureIds(new Set())}
                          >
                            ×
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 max-h-[320px] overflow-y-auto">
                      {filtered.length === 0 ? (
                        <p className="text-sm text-gray-400 py-4 text-center">
                          {lettrageTiersFilter ? 'Aucune facture ne correspond au filtre' : 'Aucune facture en attente'}
                        </p>
                      ) : filtered.map((f: any) => {
                        const fAmount = Number(f.montant_ttc) || 0
                        const isClose = Math.abs(txAmount - fAmount) <= Math.max(fAmount * 0.05, 1)
                        const isChecked = selectedFactureIds.has(f.id)
                        return (
                          <div
                            key={f.id}
                            className={`p-3 border rounded-lg flex items-center gap-2 transition-colors ${
                              isChecked
                                ? "border-blue-400 bg-blue-50"
                                : isClose
                                  ? "border-green-300 bg-green-50 hover:bg-green-100"
                                  : "border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                const next = new Set(selectedFactureIds)
                                if (checked) next.add(f.id)
                                else next.delete(f.id)
                                setSelectedFactureIds(next)
                              }}
                              className="shrink-0"
                            />
                            <div
                              className="flex-1 cursor-pointer"
                              onClick={() => handleManualLink(linkDialog, f, "facture")}
                              title="Clic pour lettrer cette seule facture"
                            >
                              <div className="flex justify-between">
                                <div>
                                  <p className="font-medium text-sm">
                                    {f.numero_facture || "—"} <Badge className="text-xs ml-1">{f.type_facture}</Badge>
                                  </p>
                                  <p className="text-xs text-gray-500">{f.tiers} — {formatDate(f.date_facture)}</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-sm">{fmt(fAmount)} {f.devise}</p>
                                  {isClose && <Badge className="bg-green-100 text-green-700 text-xs">Proche</Badge>}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

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
                      {(associes.length > 0 || associesCandidates.length > 0) ? (
                        <Select value={payeParNom} onValueChange={setPayeParNom}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                          <SelectContent>
                            {associes.map((a: any) => (
                              <SelectItem key={`cca-${a.id}`} value={a.nom}>{a.nom} ({a.type})</SelectItem>
                            ))}
                            {/* FIX 4 — Candidats : employés role=direction sans CCA */}
                            {associesCandidates.map(c => (
                              <SelectItem key={`cand-${c.id}`} value={c.nom}>{c.nom} (dirigeant — nouveau CCA)</SelectItem>
                            ))}
                          </SelectContent>
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

          {/* Messages — plain scrollable div. Radix ScrollArea was used here
              previously but `flex-1` without `min-h-0` inside a flex-column
              made it grow to its content height instead of constraining it,
              which killed the scroll entirely. Plain overflow-y-auto works
              in every browser and doesn't need any flex tweak. */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
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
          </div>

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
    </ClientPageShell>
  )
}
