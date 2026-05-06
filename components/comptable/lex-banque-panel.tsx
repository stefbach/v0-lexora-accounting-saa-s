"use client"

/**
 * LexBanquePanel — interface agent-first du rapprochement bancaire.
 *
 * Affiche les suggestions de l'agent IA "Lex Banque" (matches + classifications)
 * dans des onglets dédiés et permet la validation en lot. Chaque validation
 * appelle l'API native /api/comptable/rapprochement avec action="lettrer_manuel"
 * qui crée immédiatement l'écriture bancaire (BNQ) au grand livre.
 *
 * Statuts utilisés (compatibles front Lexora) :
 *   - propose      → match agent en attente de validation
 *   - a_verifier   → classification PCM en attente de validation
 *   - rapproche    → confirmé par humain (BNQ créée)
 *   - non_identifie → orphelin
 */

import { useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  Bot,
} from "lucide-react"

const AGENT_NAME = "Lex Banque"

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
function formatDate(d: string): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

interface BankTx {
  id: string
  releve_id: string
  date: string
  libelle: string
  debit: number
  credit: number
  devise?: string
  statut?: string
  facture_id?: string | null
  facture_ids?: string[]
  matched_type?: string | null
  matched_strategy?: string | null
  matched_confidence?: number | null
  match_confidence?: string | null
  classification?: string | null
  classification_suggestion?: any
  compte_comptable?: string | null
  tiers_detecte?: string | null
  suggestion_source?: string | null
  note?: string | null
  rapprochement_multi?: boolean
  nb_factures?: number
  lettre?: string | null
}

interface Facture {
  id: string
  numero_facture: string | null
  tiers: string | null
  montant_ttc: number
  montant_mur: number | null
  devise: string | null
  type_facture: string | null
  statut: string | null
  date_facture: string | null
  date_echeance: string | null
}

interface LexBanquePanelProps {
  societeId: string
  societeName: string
  periodeDebut: string | null
  periodeFin: string | null
  data: any
  loading: boolean
  onReload: () => void
  showToast: (msg: string, type?: "success" | "error") => void
}

type SuggestionGroup = {
  key: string
  title: string
  description: string
  items: BankTx[]
  source: "algo" | "ai"
  type: "match" | "classification"
}

export function LexBanquePanel({
  societeId,
  societeName,
  periodeDebut,
  periodeFin,
  data,
  loading,
  onReload,
  showToast,
}: LexBanquePanelProps) {
  const [runningAgent, setRunningAgent] = useState(false)
  const [validatingBatch, setValidatingBatch] = useState(false)
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState("a-valider")
  const [agentLastRun, setAgentLastRun] = useState<string | null>(null)
  const [agentStats, setAgentStats] = useState<any>(null)

  const transactions: BankTx[] = data?.bankTransactions || []
  const factures: Facture[] = data?.factures || []
  const facturesById = useMemo(() => {
    const m = new Map<string, Facture>()
    for (const f of factures) m.set(f.id, f)
    return m
  }, [factures])

  // Buckets par statut
  const proposes = useMemo(
    () => transactions.filter((t) => t.statut === "propose"),
    [transactions]
  )
  const aVerifier = useMemo(
    () => transactions.filter((t) => t.statut === "a_verifier"),
    [transactions]
  )
  const rapprochees = useMemo(
    () =>
      transactions.filter(
        (t) =>
          t.statut === "rapproche" ||
          (!t.statut &&
            (t.facture_id ||
              (Array.isArray(t.facture_ids) && t.facture_ids.length > 0)))
      ),
    [transactions]
  )
  const orphelines = useMemo(
    () =>
      transactions.filter(
        (t) =>
          (t.statut === "non_identifie" ||
            t.statut === undefined ||
            t.statut === null) &&
          !t.facture_id &&
          !(Array.isArray(t.facture_ids) && t.facture_ids.length > 0) &&
          !t.compte_comptable
      ),
    [transactions]
  )

  // Sous-groupes par source dans "À valider"
  const groups: SuggestionGroup[] = useMemo(() => {
    const matchAlgo = proposes.filter((t) => t.suggestion_source !== "agent_ai")
    const matchAi = proposes.filter((t) => t.suggestion_source === "agent_ai")
    const classifAlgo = aVerifier.filter((t) => t.suggestion_source !== "agent_ai")
    const classifAi = aVerifier.filter((t) => t.suggestion_source === "agent_ai")
    const out: SuggestionGroup[] = []
    if (matchAlgo.length)
      out.push({
        key: "match-algo",
        title: `Rapprochements algorithme (${matchAlgo.length})`,
        description: "Tx ↔ facture proposés par le moteur de matching pur. Confiance élevée.",
        items: matchAlgo,
        source: "algo",
        type: "match",
      })
    if (matchAi.length)
      out.push({
        key: "match-ai",
        title: `Rapprochements IA Claude (${matchAi.length})`,
        description: "Tx ↔ facture proposés par l'IA pour les libellés ambigus. Vérifier au cas par cas.",
        items: matchAi,
        source: "ai",
        type: "match",
      })
    if (classifAlgo.length)
      out.push({
        key: "classif-algo",
        title: `Classifications algorithme (${classifAlgo.length})`,
        description: "Frais bancaires, salaires, MRA, virements internes. Compte PCM pré-rempli.",
        items: classifAlgo,
        source: "algo",
        type: "classification",
      })
    if (classifAi.length)
      out.push({
        key: "classif-ai",
        title: `Classifications IA Claude (${classifAi.length})`,
        description: "Cas atypiques classés par l'IA. Vérifier le compte PCM proposé.",
        items: classifAi,
        source: "ai",
        type: "classification",
      })
    return out
  }, [proposes, aVerifier])

  const totalSuggestions = proposes.length + aVerifier.length

  // Reset selection if data changes
  useEffect(() => {
    setSelectedTxIds(new Set())
  }, [transactions.length])

  const handleRunAgent = async () => {
    if (!societeId) return
    setRunningAgent(true)
    try {
      const body: any = {
        societe_id: societeId,
        dry_run: false,
        min_confidence: 0.7,
      }
      if (periodeDebut) body.date_debut = periodeDebut
      if (periodeFin) body.date_fin = periodeFin
      const res = await fetch("/api/agent/rapprochement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) {
        showToast(d.error || `Erreur ${AGENT_NAME}`, "error")
        return
      }
      setAgentStats(d.stats || null)
      setAgentLastRun(new Date().toISOString())
      const matches =
        (d.stats?.matched || 0) +
        (d.stats?.classified || 0) +
        (d.stats?.semantic_matches || 0) +
        (d.stats?.semantic_classifications || 0)
      showToast(
        `${AGENT_NAME} : ${matches} suggestion(s) produites (${d.writes?.transactions_modifiees || 0} écrites)`
      )
      onReload()
    } catch (e: any) {
      showToast(`Erreur ${AGENT_NAME} : ${e?.message || ""}`, "error")
    } finally {
      setRunningAgent(false)
    }
  }

  // Valide une tx (match ou classification) via lettrer_manuel.
  // Pour un match : passe les facture_ids → l'API lettre + crée la BNQ.
  // Pour une classification : passe classification + compte_charge → l'API
  //   crée l'écriture comptable (Bank ↔ compte de charge/produit).
  const validateOne = useCallback(
    async (tx: BankTx): Promise<{ ok: boolean; error?: string; lettre?: string }> => {
      const body: any = {
        societe_id: societeId,
        transaction_id: tx.id,
        releve_id: tx.releve_id,
      }
      // Match : a une facture associée
      if (tx.facture_id || (tx.facture_ids && tx.facture_ids.length > 0)) {
        const fids = (tx.facture_ids && tx.facture_ids.length > 0
          ? tx.facture_ids
          : tx.facture_id
            ? [tx.facture_id]
            : []
        ).filter(Boolean)
        if (fids.length === 0) {
          return { ok: false, error: "Pas de facture sur la suggestion" }
        }
        if (fids.length > 1) {
          body.action = "lettrer_multi"
          body.facture_ids = fids
        } else {
          body.action = "lettrer_manuel"
          body.facture_id = fids[0]
        }
      } else if (tx.compte_comptable && tx.classification) {
        // Classification : crée l'écriture comptable BNQ contre le compte PCM
        body.action = "lettrer_manuel"
        body.classification = tx.classification
        body.compte_charge = tx.compte_comptable
      } else {
        return { ok: false, error: "Suggestion incomplète (ni facture ni compte)" }
      }
      try {
        const res = await fetch("/api/comptable/rapprochement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const d = await res.json()
        if (!res.ok) return { ok: false, error: d?.error || `HTTP ${res.status}` }
        return { ok: true, lettre: d?.lettre }
      } catch (e: any) {
        return { ok: false, error: e?.message || "Erreur réseau" }
      }
    },
    [societeId]
  )

  const handleValidateOne = async (tx: BankTx) => {
    const r = await validateOne(tx)
    if (!r.ok) {
      showToast(`Validation échouée : ${r.error}`, "error")
      return
    }
    showToast(`Validé (${r.lettre || "—"}) — écriture BNQ créée`)
    onReload()
  }

  const handleRejectOne = async (tx: BankTx) => {
    // Reset à "non_identifie" en passant par un endpoint dédié n'existe pas —
    // on appelle un POST minimal qui réinitialise les champs agent.
    try {
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rejeter_suggestion",
          societe_id: societeId,
          transaction_id: tx.id,
          releve_id: tx.releve_id,
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        showToast(d?.error || "Rejet impossible", "error")
        return
      }
      showToast("Suggestion rejetée — la transaction redevient orpheline")
      onReload()
    } catch (e: any) {
      showToast(e?.message || "Erreur rejet", "error")
    }
  }

  const handleValidateBatch = async (group: SuggestionGroup) => {
    const items = group.items.filter((t) => selectedTxIds.has(t.id))
    if (items.length === 0) {
      showToast("Aucune suggestion cochée", "error")
      return
    }
    setValidatingBatch(true)
    let ok = 0
    const errors: string[] = []
    for (const tx of items) {
      const r = await validateOne(tx)
      if (r.ok) ok++
      else errors.push(`${tx.libelle.slice(0, 40)} : ${r.error}`)
    }
    setValidatingBatch(false)
    setSelectedTxIds(new Set())
    if (errors.length === 0) {
      showToast(`${ok} suggestion(s) validée(s) — écritures BNQ créées`)
    } else {
      showToast(
        `${ok} OK / ${errors.length} échec — ${errors[0]}${errors.length > 1 ? "…" : ""}`,
        "error"
      )
    }
    onReload()
  }

  const handleValidateAllInGroup = (group: SuggestionGroup) => {
    setSelectedTxIds(new Set(group.items.map((t) => t.id)))
    setTimeout(() => handleValidateBatch(group), 0)
  }

  const toggleTx = (id: string) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAllInGroup = (group: SuggestionGroup) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev)
      const allSelected = group.items.every((t) => next.has(t.id))
      for (const t of group.items) {
        if (allSelected) next.delete(t.id)
        else next.add(t.id)
      }
      return next
    })
  }

  const total = transactions.length
  const tauxRapprochement = total > 0 ? Math.round((rapprochees.length / total) * 100) : 0

  if (!societeId) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Sélectionne une société pour activer {AGENT_NAME}.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header agent */}
      <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-600 p-2 text-white">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {AGENT_NAME}
                  <Badge variant="outline" className="text-[10px] font-normal">
                    Agent IA
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Rapproche tes transactions bancaires automatiquement et propose les classifications
                  {agentLastRun ? ` — dernière exécution : ${formatDate(agentLastRun)}` : ""}
                </p>
              </div>
            </div>
            <Button
              onClick={handleRunAgent}
              disabled={runningAgent || loading}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              size="sm"
            >
              {runningAgent ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  En cours…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Lancer {AGENT_NAME}
                </>
              )}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Total transactions" value={total} />
        <KpiCard
          label="À valider"
          value={totalSuggestions}
          tone="amber"
          accent={totalSuggestions > 0}
        />
        <KpiCard label="Rapprochées" value={rapprochees.length} tone="green" />
        <KpiCard label="Orphelines" value={orphelines.length} tone="rose" />
        <KpiCard label="Taux rapproché" value={`${tauxRapprochement}%`} tone="blue" />
      </div>

      {/* Tabs */}
      <Card>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="px-4 pt-2 bg-transparent border-b rounded-none w-full justify-start gap-1">
            <TabsTrigger value="a-valider" className="data-[state=active]:bg-amber-100">
              <AlertTriangle className="h-4 w-4 mr-1.5 text-amber-600" />À valider ({totalSuggestions})
            </TabsTrigger>
            <TabsTrigger value="rapprochees">
              <CheckCircle2 className="h-4 w-4 mr-1.5 text-green-600" />
              Rapprochées ({rapprochees.length})
            </TabsTrigger>
            <TabsTrigger value="orphelines">
              <HelpCircle className="h-4 w-4 mr-1.5 text-rose-600" />
              Orphelines ({orphelines.length})
            </TabsTrigger>
          </TabsList>

          {/* Tab "À valider" */}
          <TabsContent value="a-valider" className="p-4 space-y-5 mt-0">
            {totalSuggestions === 0 ? (
              <EmptyState
                icon={<Sparkles className="h-8 w-8 text-purple-400" />}
                title="Aucune suggestion en attente"
                hint={`Lance ${AGENT_NAME} pour proposer des rapprochements et classifications.`}
              />
            ) : (
              groups.map((group) => (
                <GroupSection
                  key={group.key}
                  group={group}
                  selectedIds={selectedTxIds}
                  onToggleTx={toggleTx}
                  onToggleAll={() => toggleAllInGroup(group)}
                  onValidateAll={() => handleValidateAllInGroup(group)}
                  onValidateBatch={() => handleValidateBatch(group)}
                  onValidateOne={handleValidateOne}
                  onRejectOne={handleRejectOne}
                  validating={validatingBatch}
                  facturesById={facturesById}
                />
              ))
            )}
          </TabsContent>

          {/* Tab "Rapprochées" */}
          <TabsContent value="rapprochees" className="p-4 mt-0">
            {rapprochees.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="h-8 w-8 text-green-400" />}
                title="Aucune transaction rapprochée"
                hint="Valide les suggestions de l'onglet À valider pour les voir ici."
              />
            ) : (
              <div className="rounded border bg-card">
                {rapprochees.map((tx) => (
                  <TxRow
                    key={tx.id}
                    tx={tx}
                    facturesById={facturesById}
                    locked
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tab "Orphelines" */}
          <TabsContent value="orphelines" className="p-4 mt-0">
            {orphelines.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="h-8 w-8 text-green-400" />}
                title="Aucune transaction orpheline"
                hint="Toutes les tx ont reçu une suggestion ou ont été validées."
              />
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Ces transactions n'ont pas été identifiées par {AGENT_NAME}. Imputation manuelle requise via le module legacy ci-dessous.
                </p>
                <div className="rounded border bg-card">
                  {orphelines.map((tx) => (
                    <TxRow key={tx.id} tx={tx} facturesById={facturesById} />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      {agentStats && (
        <p className="text-[11px] text-muted-foreground text-center">
          Dernier run : {agentStats.totalTransactions} tx analysées · {agentStats.matched} matchs · {agentStats.classified} classifs ·{" "}
          {(agentStats.semantic_matches || 0) + (agentStats.semantic_classifications || 0)} via IA Claude
        </p>
      )}
    </div>
  )
}

function KpiCard({
  label,
  value,
  tone,
  accent,
}: {
  label: string
  value: number | string
  tone?: "amber" | "green" | "rose" | "blue"
  accent?: boolean
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : tone === "green"
        ? "border-green-200 bg-green-50"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50"
          : tone === "blue"
            ? "border-blue-200 bg-blue-50"
            : "border-muted bg-card"
  return (
    <Card className={`${toneClass} ${accent ? "ring-2 ring-amber-400" : ""}`}>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  )
}

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode
  title: string
  hint?: string
}) {
  return (
    <div className="py-8 text-center space-y-2">
      <div className="flex justify-center">{icon}</div>
      <p className="font-medium text-sm">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function ConfidenceBadge({ confidence }: { confidence: number | null | undefined }) {
  if (confidence == null) return null
  const pct = Math.round(confidence * 100)
  const color =
    pct >= 90
      ? "bg-green-100 text-green-800 border-green-300"
      : pct >= 80
        ? "bg-blue-100 text-blue-800 border-blue-300"
        : "bg-amber-100 text-amber-800 border-amber-300"
  return (
    <Badge variant="outline" className={`text-[10px] font-mono ${color}`}>
      {pct}%
    </Badge>
  )
}

function SourceBadge({ source }: { source: string | null | undefined }) {
  if (!source) return null
  const isAi = source === "agent_ai"
  return (
    <Badge
      variant="outline"
      className={`text-[10px] ${
        isAi
          ? "bg-purple-100 text-purple-800 border-purple-300"
          : "bg-slate-100 text-slate-700 border-slate-300"
      }`}
    >
      {isAi ? (
        <>
          <Bot className="h-3 w-3 mr-0.5" />
          IA
        </>
      ) : (
        "Algo"
      )}
    </Badge>
  )
}

function GroupSection({
  group,
  selectedIds,
  onToggleTx,
  onToggleAll,
  onValidateAll,
  onValidateBatch,
  onValidateOne,
  onRejectOne,
  validating,
  facturesById,
}: {
  group: SuggestionGroup
  selectedIds: Set<string>
  onToggleTx: (id: string) => void
  onToggleAll: () => void
  onValidateAll: () => void
  onValidateBatch: () => void
  onValidateOne: (tx: BankTx) => void
  onRejectOne: (tx: BankTx) => void
  validating: boolean
  facturesById: Map<string, Facture>
}) {
  const selectedCount = group.items.filter((t) => selectedIds.has(t.id)).length
  const allChecked = selectedCount === group.items.length && group.items.length > 0

  return (
    <div className="rounded border bg-card">
      <div className="flex items-center justify-between gap-2 p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Checkbox checked={allChecked} onCheckedChange={onToggleAll} />
          <div className="min-w-0">
            <h3 className="font-medium text-sm">{group.title}</h3>
            <p className="text-[11px] text-muted-foreground">{group.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {selectedCount > 0 ? (
            <Button
              size="sm"
              onClick={onValidateBatch}
              disabled={validating}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {validating ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
              )}
              Valider {selectedCount}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onValidateAll} disabled={validating}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Tout valider
            </Button>
          )}
        </div>
      </div>
      <div>
        {group.items.map((tx) => (
          <SuggestionRow
            key={tx.id}
            tx={tx}
            type={group.type}
            checked={selectedIds.has(tx.id)}
            onToggle={() => onToggleTx(tx.id)}
            onValidate={() => onValidateOne(tx)}
            onReject={() => onRejectOne(tx)}
            facturesById={facturesById}
          />
        ))}
      </div>
    </div>
  )
}

function SuggestionRow({
  tx,
  type,
  checked,
  onToggle,
  onValidate,
  onReject,
  facturesById,
}: {
  tx: BankTx
  type: "match" | "classification"
  checked: boolean
  onToggle: () => void
  onValidate: () => void
  onReject: () => void
  facturesById: Map<string, Facture>
}) {
  const montant = tx.debit > 0 ? -tx.debit : tx.credit
  const fids = tx.facture_ids && tx.facture_ids.length > 0
    ? tx.facture_ids
    : tx.facture_id
      ? [tx.facture_id]
      : []
  const factures = fids.map((id) => facturesById.get(id)).filter(Boolean) as Facture[]

  return (
    <div className="flex items-start gap-3 p-3 border-b last:border-b-0 hover:bg-muted/20">
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-1" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
            <p className="font-medium text-sm break-all">{tx.libelle}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p
              className={`font-mono text-sm ${
                montant >= 0 ? "text-green-700" : "text-rose-700"
              }`}
            >
              {montant >= 0 ? "+" : ""}
              {fmt(montant)} {tx.devise || "MUR"}
            </p>
          </div>
        </div>

        {/* Détail suggestion */}
        {type === "match" ? (
          <div className="text-xs space-y-1">
            <p>
              <span className="text-muted-foreground">→ </span>
              {factures.length > 0 ? (
                factures.map((f, i) => (
                  <span key={f.id}>
                    Facture <span className="font-mono">{f.numero_facture || f.id.slice(0, 8)}</span>
                    {f.tiers && <span className="text-muted-foreground"> · {f.tiers.slice(0, 50)}</span>}
                    <span className="text-muted-foreground">
                      {" "}
                      ({fmt(f.montant_ttc)} {f.devise || "MUR"})
                    </span>
                    {i < factures.length - 1 ? <span className="text-muted-foreground"> + </span> : null}
                  </span>
                ))
              ) : (
                <span className="italic text-muted-foreground">facture introuvable</span>
              )}
            </p>
          </div>
        ) : (
          <div className="text-xs">
            <span className="text-muted-foreground">→ Compte PCM </span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {tx.compte_comptable || "?"}
            </Badge>
            <span className="text-muted-foreground"> ({tx.classification})</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          <ConfidenceBadge confidence={tx.matched_confidence} />
          <SourceBadge source={tx.suggestion_source} />
          {tx.matched_strategy && (
            <Badge variant="outline" className="text-[10px] font-mono">
              {tx.matched_strategy}
            </Badge>
          )}
          {tx.tiers_detecte && (
            <Badge variant="outline" className="text-[10px]">
              {tx.tiers_detecte.slice(0, 30)}
            </Badge>
          )}
          {tx.rapprochement_multi && (
            <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-700 border-blue-300">
              {tx.nb_factures}× factures
            </Badge>
          )}
        </div>

        {tx.note && (
          <p className="text-[11px] italic text-muted-foreground">{tx.note}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <Button
          size="sm"
          variant="default"
          onClick={onValidate}
          className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          Valider
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onReject}
          className="h-7 text-xs text-muted-foreground hover:text-rose-700 hover:bg-rose-50"
        >
          <XCircle className="h-3.5 w-3.5 mr-1" />
          Rejeter
        </Button>
      </div>
    </div>
  )
}

function TxRow({
  tx,
  facturesById,
  locked,
}: {
  tx: BankTx
  facturesById: Map<string, Facture>
  locked?: boolean
}) {
  const montant = tx.debit > 0 ? -tx.debit : tx.credit
  return (
    <div className="flex items-start justify-between gap-3 p-3 border-b last:border-b-0 hover:bg-muted/20">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
        <p className="font-medium text-sm break-all">{tx.libelle}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {tx.lettre && (
            <Badge variant="outline" className="text-[10px] font-mono bg-green-50">
              {tx.lettre}
            </Badge>
          )}
          {tx.compte_comptable && (
            <Badge variant="outline" className="text-[10px] font-mono">
              PCM {tx.compte_comptable}
            </Badge>
          )}
          {tx.facture_id && (
            <Badge variant="outline" className="text-[10px]">
              Facture {(facturesById.get(tx.facture_id)?.numero_facture || tx.facture_id.slice(0, 8))}
            </Badge>
          )}
          {tx.matched_strategy && (
            <Badge variant="outline" className="text-[10px] font-mono opacity-70">
              {tx.matched_strategy}
            </Badge>
          )}
        </div>
      </div>
      <p
        className={`font-mono text-sm flex-shrink-0 ${
          montant >= 0 ? "text-green-700" : "text-rose-700"
        }`}
      >
        {montant >= 0 ? "+" : ""}
        {fmt(montant)} {tx.devise || "MUR"}
      </p>
    </div>
  )
}
