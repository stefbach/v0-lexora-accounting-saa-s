"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Zap, CheckCircle2, AlertTriangle, Clock, ThumbsUp, ThumbsDown, RotateCcw, TrendingUp } from "lucide-react"

function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function formatDate(d: string) { return d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—" }

const CLASS_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  customer_payment: { label: "Encaissement client", icon: "💰", color: "bg-green-100 text-green-700" },
  supplier_payment: { label: "Paiement fournisseur", icon: "📤", color: "bg-blue-100 text-blue-700" },
  payroll: { label: "Salaire", icon: "👤", color: "bg-purple-100 text-purple-700" },
  tax_payment: { label: "Paiement fiscal", icon: "🏛️", color: "bg-orange-100 text-orange-700" },
  shareholder_loan: { label: "Compte courant associé", icon: "🤝", color: "bg-indigo-100 text-indigo-700" },
  internal_transfer: { label: "Virement interne", icon: "🔄", color: "bg-gray-100 text-gray-700" },
  bank_fee: { label: "Frais bancaires", icon: "🏦", color: "bg-slate-100 text-slate-700" },
  unknown: { label: "Non classifié", icon: "❓", color: "bg-red-100 text-red-700" },
}

const STATUS_STYLES: Record<string, { label: string; bg: string; icon: typeof CheckCircle2 }> = {
  auto_validated: { label: "Auto-validé", bg: "bg-[#0F766E]/10 text-[#0F766E] border-[#0F766E]/30", icon: CheckCircle2 },
  proposed: { label: "Proposé", bg: "bg-[#D4AF37]/10 text-[#A88925] border-[#D4AF37]/30", icon: Clock },
  user_validated: { label: "Validé", bg: "bg-green-100 text-green-700 border-green-200", icon: ThumbsUp },
  user_rejected: { label: "Rejeté", bg: "bg-red-100 text-red-700 border-red-200", icon: ThumbsDown },
  reversed: { label: "Annulé", bg: "bg-gray-100 text-gray-500 border-gray-200", icon: RotateCcw },
  flagged: { label: "À vérifier", bg: "bg-amber-100 text-amber-700 border-amber-200", icon: AlertTriangle },
}

export default function AgentLogsPage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societeId, setSocieteId] = useState<string>("")
  const [allocations, setAllocations] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [batchResult, setBatchResult] = useState<any>(null)

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

  const loadData = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const [allocRes, statsRes] = await Promise.all([
        fetch(`/api/v1/agent/stats?societe_id=${societeId}&period=30d`).then(r => r.json()).catch(() => null),
        fetch(`/api/v1/agent/stats?societe_id=${societeId}&period=7d`).then(r => r.json()).catch(() => null),
      ])
      setStats(statsRes)
      // Charger les allocations récentes
      const { createClient } = await import("@supabase/supabase-js")
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const { data } = await supabase
        .from('transaction_allocations')
        .select('*, transactions_bancaires(libelle_banque, date_transaction, debit, credit, devise)')
        .eq('societe_id', societeId)
        .order('created_at', { ascending: false })
        .limit(50)
      setAllocations(data || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [societeId])

  useEffect(() => { loadData() }, [loadData])

  const handleBatchReconcile = async () => {
    if (!societeId) return
    setProcessing(true)
    setBatchResult(null)
    try {
      const res = await fetch("/api/v1/agent/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, batch: true, limit: 50 }),
      })
      const data = await res.json()
      setBatchResult(data)
      await loadData()
    } catch (e: any) {
      setBatchResult({ error: e.message })
    } finally {
      setProcessing(false)
    }
  }

  const handleAction = async (allocationId: string, action: 'accept' | 'reverse') => {
    try {
      await fetch(`/api/v1/agent/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocation_id: allocationId }),
      })
      await loadData()
    } catch { /* ignore */ }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E] flex items-center gap-2">
            <Zap className="w-6 h-6 text-[#D4AF37]" />
            Agent IA — Rapprochement
          </h1>
          <p className="text-sm text-gray-500 mt-1">L&apos;agent analyse les relevés bancaires et propose les rapprochements</p>
        </div>
        <div className="flex gap-2 items-center">
          {societes.length > 0 && (
            <Select value={societeId} onValueChange={setSocieteId}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Société" /></SelectTrigger>
              <SelectContent>
                {societes.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button
            onClick={handleBatchReconcile}
            disabled={processing || !societeId}
            className="bg-[#D4AF37] hover:bg-[#A88925] text-[#0B0F2E] font-semibold gap-2"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {processing ? "Agent en cours..." : "Lancer l'agent"}
          </Button>
        </div>
      </div>

      {/* Résultat batch */}
      {batchResult && !batchResult.error && (
        <Card className="border-[#0F766E]/30 bg-[#0F766E]/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <CheckCircle2 className="w-5 h-5 text-[#0F766E]" />
              <span className="font-semibold text-[#0B0F2E]">{batchResult.processed} transaction{batchResult.processed > 1 ? 's' : ''} traitée{batchResult.processed > 1 ? 's' : ''}</span>
              <Badge className="bg-green-100 text-green-700">✅ {batchResult.allocated} rapprochées</Badge>
              <Badge className="bg-amber-100 text-amber-700">⏳ {batchResult.proposed} proposées</Badge>
              <Badge className="bg-red-100 text-red-700">⚠️ {batchResult.flagged} à vérifier</Badge>
              {batchResult.failed > 0 && <Badge className="bg-red-100 text-red-700">❌ {batchResult.failed} erreur{batchResult.failed > 1 ? 's' : ''}</Badge>}
              <span className="text-xs text-gray-500 ml-auto">{(batchResult.duration_ms / 1000).toFixed(1)}s · ${batchResult.total_cost_usd?.toFixed(4)} USD</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card><CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-[#0B0F2E]">{stats.total_allocations}</div>
            <p className="text-xs text-gray-500">Allocations (7j)</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-[#0F766E]">{stats.auto_validation_rate}%</div>
            <p className="text-xs text-gray-500">Taux auto-validation</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-[#D4AF37]">{stats.proposed}</div>
            <p className="text-xs text-gray-500">À confirmer</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-[#0B0F2E]">${stats.total_cost_usd?.toFixed(3)}</div>
            <p className="text-xs text-gray-500">Coût IA</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-[#0F766E] flex items-center justify-center gap-1">
              <TrendingUp className="w-5 h-5" />{stats.time_saved_minutes} min
            </div>
            <p className="text-xs text-gray-500">Temps économisé</p>
          </CardContent></Card>
        </div>
      )}

      {/* Liste des allocations */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-[#0B0F2E]">Résultats de l&apos;agent</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" /></div>
          ) : allocations.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              Aucune allocation. Cliquez &quot;Lancer l&apos;agent&quot; pour démarrer le rapprochement automatique.
            </div>
          ) : (
            <div className="divide-y">
              {allocations.map((alloc: any) => {
                const tx = alloc.transactions_bancaires || {}
                const cls = CLASS_LABELS[alloc.agent_name] || CLASS_LABELS.unknown
                const st = STATUS_STYLES[alloc.status] || STATUS_STYLES.proposed
                const StatusIcon = st.icon
                return (
                  <div key={alloc.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="text-2xl">{cls.icon}</div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={cls.color + " text-xs"}>{cls.label}</Badge>
                            <Badge className={st.bg + " text-xs gap-1"}>
                              <StatusIcon className="w-3 h-3" />{st.label}
                            </Badge>
                            {alloc.agent_confidence && (
                              <span className="text-xs text-gray-400">{alloc.agent_confidence}%</span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-[#0B0F2E] mt-1 truncate">
                            {tx.libelle_banque || "—"}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {formatDate(tx.date_transaction)} · {Number(tx.debit) > 0 ? `-${fmt(Number(tx.debit))}` : `+${fmt(Number(tx.credit))}`} {tx.devise || 'MUR'}
                            {alloc.third_party_name && ` · ${alloc.third_party_name}`}
                          </p>
                          {alloc.agent_rationale && (
                            <p className="text-xs text-gray-600 mt-1 italic bg-gray-50 rounded px-2 py-1">
                              💡 {alloc.agent_rationale}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {alloc.status === 'proposed' && (
                          <>
                            <Button size="sm" className="h-7 text-xs bg-[#0F766E] hover:bg-[#0F766E]/90 text-white gap-1"
                              onClick={() => handleAction(alloc.id, 'accept')}>
                              <ThumbsUp className="w-3 h-3" /> Valider
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-[#9F1239] gap-1"
                              onClick={() => handleAction(alloc.id, 'reverse')}>
                              <ThumbsDown className="w-3 h-3" /> Rejeter
                            </Button>
                          </>
                        )}
                        {alloc.status === 'auto_validated' && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-gray-500 gap-1"
                            onClick={() => handleAction(alloc.id, 'reverse')}>
                            <RotateCcw className="w-3 h-3" /> Annuler
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
