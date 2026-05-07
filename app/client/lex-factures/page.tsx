"use client"

/**
 * Page /client/lex-factures — Agent Lex Factures.
 *
 * Lance une analyse complète des factures clients + fournisseurs :
 * - Détecte les récurrences par tiers (mensuel, trimestriel, annuel)
 * - Liste les périodes manquantes (factures qui devraient exister)
 * - Identifie les factures avec montant > 5% supérieur au médian
 *   (potentielles pénalités, intérêts, surfacturation)
 * - Score de santé /100 + plan d'alerte priorisé
 */

import { useState, useCallback, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Loader2,
  FileText,
  Sparkles,
  Bot,
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  TrendingUp,
  TrendingDown,
  Calendar,
  Search,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface TiersAnalysis {
  tiers: string
  type: "client" | "fournisseur"
  nb_factures: number
  date_debut: string
  date_fin: string
  intervalle_median_jours: number
  frequence_detectee: "mensuel" | "trimestriel" | "annuel" | "irregulier" | "unique"
  montant_median: number
  montant_min: number
  montant_max: number
  montant_ecart_max_pct: number
  devise: string
  periodes_manquantes: string[]
  factures_avec_supplement: Array<{
    id: string
    numero: string | null
    date: string
    montant: number
    montant_attendu: number
    ecart_pct: number
  }>
}

interface Alert {
  severity: "critical" | "warning" | "info"
  code: string
  message: string
  tiers: string
  type: "client" | "fournisseur"
  details?: any
}

const FREQ_LABELS: Record<string, { label: string; color: string }> = {
  mensuel: { label: "Mensuel", color: "bg-blue-100 text-blue-700 border-blue-300" },
  trimestriel: { label: "Trimestriel", color: "bg-cyan-100 text-cyan-700 border-cyan-300" },
  annuel: { label: "Annuel", color: "bg-purple-100 text-purple-700 border-purple-300" },
  irregulier: { label: "Irrégulier", color: "bg-slate-100 text-slate-700 border-slate-300" },
  unique: { label: "Unique", color: "bg-zinc-100 text-zinc-700 border-zinc-300" },
}

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatDate(d: string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

// Identifiant stable d'une alerte pour suivi local
function alertKey(a: Alert): string {
  return `${a.code}|${a.tiers}|${a.type}`
}

const RESOLVED_KEY = "lex-factures-resolved-v1"

export default function LexFacturesPage() {
  const { societeId } = useSocieteActive()
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [filter, setFilter] = useState<"all" | "alerts" | "recurrents" | "missing">(
    "alerts"
  )
  const [search, setSearch] = useState("")
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(
    null
  )
  const [acting, setActing] = useState<string | null>(null)
  const [resolved, setResolved] = useState<Set<string>>(new Set())
  const [showResolved, setShowResolved] = useState(false)
  const [taggedFactures, setTaggedFactures] = useState<Set<string>>(new Set())

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    if (!societeId) return
    try {
      const raw = localStorage.getItem(`${RESOLVED_KEY}:${societeId}`)
      if (raw) setResolved(new Set(JSON.parse(raw)))
      const tagged = localStorage.getItem(`${RESOLVED_KEY}-tagged:${societeId}`)
      if (tagged) setTaggedFactures(new Set(JSON.parse(tagged)))
    } catch {}
  }, [societeId])

  const persistResolved = useCallback(
    (next: Set<string>) => {
      if (!societeId) return
      try {
        localStorage.setItem(
          `${RESOLVED_KEY}:${societeId}`,
          JSON.stringify(Array.from(next))
        )
      } catch {}
    },
    [societeId]
  )

  const persistTagged = useCallback(
    (next: Set<string>) => {
      if (!societeId) return
      try {
        localStorage.setItem(
          `${RESOLVED_KEY}-tagged:${societeId}`,
          JSON.stringify(Array.from(next))
        )
      } catch {}
    },
    [societeId]
  )

  const markResolved = useCallback(
    (a: Alert) => {
      const k = alertKey(a)
      setResolved((prev) => {
        const n = new Set(prev)
        n.add(k)
        persistResolved(n)
        return n
      })
      showToast("Alerte marquée comme résolue")
    },
    [persistResolved]
  )

  const unmarkResolved = useCallback(
    (a: Alert) => {
      const k = alertKey(a)
      setResolved((prev) => {
        const n = new Set(prev)
        n.delete(k)
        persistResolved(n)
        return n
      })
    },
    [persistResolved]
  )

  const callAction = useCallback(
    async (payload: Record<string, any>): Promise<boolean> => {
      if (!societeId) return false
      setActing(JSON.stringify(payload))
      try {
        const res = await fetch("/api/agent/alerts/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ societe_id: societeId, ...payload }),
        })
        const d = await res.json()
        if (!res.ok) {
          showToast(d?.error || "Erreur action", "error")
          return false
        }
        return true
      } catch (e: any) {
        showToast(e?.message || "Erreur réseau", "error")
        return false
      } finally {
        setActing(null)
      }
    },
    [societeId]
  )

  const handleConfirmPenalty = useCallback(
    async (factureId: string, montantSupp: number, tiers: string) => {
      const ok = await callAction({
        action: "tag_penalty",
        facture_id: factureId,
        montant_penalty: montantSupp,
        raison: `Pénalité confirmée — ${tiers}`,
      })
      if (ok) {
        showToast("Pénalité taguée sur la facture")
        setTaggedFactures((prev) => {
          const n = new Set(prev)
          n.add(factureId)
          persistTagged(n)
          return n
        })
      }
    },
    [callAction, persistTagged]
  )

  const handleConfirmNormal = useCallback(
    async (factureId: string, code: string) => {
      const ok = await callAction({
        action: "confirm_normal",
        facture_id: factureId,
        alert_code: code,
      })
      if (ok) {
        showToast("Facture marquée comme normale")
        setTaggedFactures((prev) => {
          const n = new Set(prev)
          n.add(factureId)
          persistTagged(n)
          return n
        })
      }
    },
    [callAction, persistTagged]
  )

  const handleAnalyze = useCallback(async () => {
    if (!societeId) return
    setAnalyzing(true)
    try {
      const res = await fetch("/api/agent/factures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId }),
      })
      const d = await res.json()
      if (!res.ok) {
        showToast(d?.error || "Erreur Lex Factures", "error")
        return
      }
      setResult(d)
      showToast(`Lex Factures : score ${d.score}/100 — ${d.alerts.length} alerte(s)`)
    } catch (e: any) {
      showToast(e?.message || "Erreur réseau", "error")
    } finally {
      setAnalyzing(false)
    }
  }, [societeId])

  const analyses: TiersAnalysis[] = result?.analyses || []
  const alerts: Alert[] = result?.alerts || []

  const visibleAlerts = showResolved
    ? alerts
    : alerts.filter((a) => !resolved.has(alertKey(a)))
  const resolvedCount = alerts.filter((a) => resolved.has(alertKey(a))).length

  const filteredAnalyses = analyses
    .filter((a) => {
      if (filter === "recurrents")
        return a.frequence_detectee !== "irregulier" && a.frequence_detectee !== "unique"
      if (filter === "missing") return a.periodes_manquantes.length > 0
      return true
    })
    .filter((a) => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return a.tiers.toLowerCase().includes(q)
    })

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-7xl">
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white ${
              toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            {toast.msg}
          </div>
        )}

        {/* HEADER */}
        <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 p-3 text-white shadow-md">
                <FileText className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-emerald-900 flex items-center gap-2">
                  Lex Factures
                  <Badge className="bg-emerald-600 text-white text-[10px] uppercase">
                    Agent IA
                  </Badge>
                </h1>
                <p className="text-sm text-emerald-700/80 mt-0.5">
                  Analyse de récurrence + détection factures manquantes + pénalités
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Link href="/client/factures">
                <Button variant="outline" size="sm">
                  <FileText className="h-4 w-4 mr-1.5" />
                  Mes factures
                </Button>
              </Link>
              <Button
                onClick={handleAnalyze}
                disabled={analyzing || !societeId}
                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyse en cours…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Lancer Lex Factures
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {!societeId ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              Société non disponible.
            </CardContent>
          </Card>
        ) : !result ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Bot className="h-12 w-12 mx-auto text-emerald-300 mb-3" />
              <p className="font-medium text-sm">Lance l'analyse pour démarrer</p>
              <p className="text-xs text-muted-foreground mt-1">
                L'agent va parcourir tes factures, détecter les récurrences et identifier
                les anomalies.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Score + Summary */}
            <ScoreCard result={result} />

            {/* Alertes */}
            {alerts.length > 0 && (
              <AlertsPanel
                alerts={visibleAlerts}
                allAlerts={alerts}
                resolved={resolved}
                resolvedCount={resolvedCount}
                showResolved={showResolved}
                setShowResolved={setShowResolved}
                taggedFactures={taggedFactures}
                acting={acting}
                onMarkResolved={markResolved}
                onUnmarkResolved={unmarkResolved}
                onConfirmPenalty={handleConfirmPenalty}
                onConfirmNormal={handleConfirmNormal}
              />
            )}

            {/* Filtres */}
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex gap-1 flex-wrap">
                    {(
                      [
                        { v: "all", label: "Tous", count: analyses.length },
                        {
                          v: "recurrents",
                          label: "Récurrents",
                          count: analyses.filter(
                            (a) =>
                              a.frequence_detectee !== "irregulier" &&
                              a.frequence_detectee !== "unique"
                          ).length,
                        },
                        {
                          v: "missing",
                          label: "Avec manques",
                          count: analyses.filter((a) => a.periodes_manquantes.length > 0)
                            .length,
                        },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.v}
                        onClick={() => setFilter(opt.v as any)}
                        className={`px-3 py-1 text-xs rounded border ${
                          filter === opt.v
                            ? "bg-emerald-600 text-white border-emerald-600"
                            : "border-muted hover:border-emerald-300"
                        }`}
                      >
                        {opt.label} ({opt.count})
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Rechercher un tiers…"
                      className="pl-8 h-9 w-64"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Analyses par tiers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Analyse par tiers ({filteredAnalyses.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredAnalyses.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Aucun tiers pour ce filtre.
                  </p>
                ) : (
                  <div className="rounded border bg-card divide-y">
                    {filteredAnalyses.map((a, i) => (
                      <TiersRow key={`${a.type}-${a.tiers}-${i}`} a={a} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ClientPageShell>
  )
}

function ScoreCard({ result }: { result: any }) {
  const score = result.score || 0
  const severity = result.severity
  const summary = result.summary || {}
  const headerColor =
    severity === "critical"
      ? "border-red-300 bg-gradient-to-br from-red-50 to-rose-50"
      : severity === "warning"
        ? "border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50"
        : "border-green-300 bg-gradient-to-br from-green-50 to-emerald-50"
  const scoreColor =
    score >= 80 ? "text-green-700" : score >= 50 ? "text-amber-700" : "text-red-700"
  return (
    <div className={`rounded-xl border-2 p-4 ${headerColor}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-600 p-2.5 text-white shadow-md">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold">Lex Factures — Analyse</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {summary.total_factures} factures · {summary.total_tiers} tiers ·{" "}
              {summary.tiers_avec_recurrence} récurrent
              {summary.tiers_avec_recurrence > 1 ? "s" : ""} · {summary.total_periodes_manquantes}{" "}
              période(s) manquante(s) · {summary.total_factures_supplement} facture(s) avec
              supplément
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-4xl font-bold ${scoreColor}`}>{score}</div>
          <div className="text-xs text-muted-foreground">/100 santé</div>
        </div>
      </div>
    </div>
  )
}

function AlertsPanel({
  alerts,
  allAlerts,
  resolved,
  resolvedCount,
  showResolved,
  setShowResolved,
  taggedFactures,
  acting,
  onMarkResolved,
  onUnmarkResolved,
  onConfirmPenalty,
  onConfirmNormal,
}: {
  alerts: Alert[]
  allAlerts: Alert[]
  resolved: Set<string>
  resolvedCount: number
  showResolved: boolean
  setShowResolved: (v: boolean | ((p: boolean) => boolean)) => void
  taggedFactures: Set<string>
  acting: string | null
  onMarkResolved: (a: Alert) => void
  onUnmarkResolved: (a: Alert) => void
  onConfirmPenalty: (factureId: string, montantSupp: number, tiers: string) => void
  onConfirmNormal: (factureId: string, code: string) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Alertes ({alerts.length})
          </span>
          {resolvedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowResolved((v) => !v)}
              className="h-7 text-xs"
            >
              {showResolved ? (
                <>
                  <EyeOff className="h-3.5 w-3.5 mr-1" />
                  Masquer résolues ({resolvedCount})
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Voir résolues ({resolvedCount})
                </>
              )}
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.length === 0 && resolvedCount > 0 && (
          <p className="text-sm text-center py-4 text-muted-foreground">
            Toutes les alertes ont été traitées
          </p>
        )}
        {alerts.map((a, i) => {
          const Icon =
            a.severity === "critical"
              ? XCircle
              : a.severity === "warning"
                ? AlertTriangle
                : Info
          const cls =
            a.severity === "critical"
              ? "border-red-300 bg-red-50 text-red-900"
              : a.severity === "warning"
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-blue-300 bg-blue-50 text-blue-900"
          const isResolved = resolved.has(alertKey(a))
          const factures: any[] = a.details?.factures || []
          return (
            <div
              key={i}
              className={`rounded border-l-4 p-3 ${cls} flex items-start gap-3 ${
                isResolved ? "opacity-60" : ""
              }`}
            >
              <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    {a.code}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      a.type === "client"
                        ? "bg-green-50 text-green-700 border-green-300"
                        : "bg-rose-50 text-rose-700 border-rose-300"
                    }`}
                  >
                    {a.type === "client" ? "Client" : "Fournisseur"}
                  </Badge>
                  {isResolved && (
                    <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300">
                      Résolue
                    </Badge>
                  )}
                </div>
                <p className="text-sm mt-1 break-words">{a.message}</p>

                {/* Pour POSSIBLE_PENALTY : action par facture concernée */}
                {!isResolved && a.code === "POSSIBLE_PENALTY" && factures.length > 0 && (
                  <div className="mt-2 rounded border bg-white/60 divide-y">
                    {factures.map((f: any) => {
                      const tagged = taggedFactures.has(f.id)
                      const supplement = (f.montant || 0) - (f.montant_attendu || 0)
                      const actingThis = !!acting && acting.includes(f.id)
                      return (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-2 p-2 text-xs"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-mono">
                              {f.numero || f.id.slice(0, 8)}
                              {tagged && (
                                <Badge className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300">
                                  taguée
                                </Badge>
                              )}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {formatDate(f.date)} — supplément ~{supplement.toFixed(2)}
                            </p>
                          </div>
                          {!tagged && (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                                disabled={actingThis}
                                onClick={() =>
                                  onConfirmPenalty(f.id, supplement, a.tiers)
                                }
                              >
                                {actingThis ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                )}
                                Pénalité
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={actingThis}
                                onClick={() => onConfirmNormal(f.id, a.code)}
                              >
                                <Check className="h-3 w-3 mr-1" />
                                Normal
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {!isResolved && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(a.code === "MISSING_PERIODS" || a.code === "OVERDUE_RECURRING") && (
                      <Link
                        href={`/client/factures/nouvelle?tiers=${encodeURIComponent(
                          a.tiers
                        )}&type=${a.type}`}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          Créer la facture manquante
                        </Button>
                      </Link>
                    )}
                    <Link
                      href={`/client/factures?search=${encodeURIComponent(a.tiers.slice(0, 30))}`}
                    >
                      <Button size="sm" variant="outline" className="h-7 text-xs">
                        <ArrowRight className="h-3 w-3 mr-1" />
                        Voir factures du tiers
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-emerald-700 hover:bg-emerald-100"
                      onClick={() => onMarkResolved(a)}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Marquer résolu
                    </Button>
                  </div>
                )}

                {isResolved && (
                  <div className="mt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => onUnmarkResolved(a)}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Ré-afficher
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function TiersRow({ a }: { a: TiersAnalysis }) {
  const [expanded, setExpanded] = useState(false)
  const freq = FREQ_LABELS[a.frequence_detectee] || FREQ_LABELS.unique
  const isClient = a.type === "client"
  const hasIssues =
    a.periodes_manquantes.length > 0 || a.factures_avec_supplement.length > 0
  return (
    <div className="border-b last:border-b-0">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start justify-between gap-3 p-3 hover:bg-muted/30 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isClient ? (
              <TrendingUp className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
            )}
            <Badge
              variant="outline"
              className={`text-[10px] ${
                isClient
                  ? "bg-green-50 text-green-700 border-green-300"
                  : "bg-rose-50 text-rose-700 border-rose-300"
              }`}
            >
              {isClient ? "Client" : "Fournisseur"}
            </Badge>
            <Badge className={`text-[10px] border ${freq.color}`}>{freq.label}</Badge>
            <span className="text-xs text-muted-foreground">
              {a.nb_factures} facture{a.nb_factures > 1 ? "s" : ""}
            </span>
            {a.periodes_manquantes.length > 0 && (
              <Badge className="text-[10px] bg-red-100 text-red-700 border-red-300">
                <Calendar className="h-3 w-3 mr-1" />
                {a.periodes_manquantes.length} manquante{a.periodes_manquantes.length > 1 ? "s" : ""}
              </Badge>
            )}
            {a.factures_avec_supplement.length > 0 && (
              <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                {a.factures_avec_supplement.length} avec suppl.
              </Badge>
            )}
          </div>
          <p className="text-sm mt-1 break-words font-medium">{a.tiers}</p>
          <p className="text-[11px] text-muted-foreground">
            {formatDate(a.date_debut)} → {formatDate(a.date_fin)}
            {a.intervalle_median_jours > 0 && ` · cadence ~${a.intervalle_median_jours}j`}
          </p>
        </div>
        <div className="text-right flex-shrink-0 text-xs">
          <p className="text-[10px] text-muted-foreground uppercase">Médian</p>
          <p className="font-mono font-medium">
            {fmt(a.montant_median)} {a.devise}
          </p>
          {a.montant_ecart_max_pct > 0 && (
            <p
              className={`text-[10px] font-mono ${
                a.montant_ecart_max_pct > 20 ? "text-red-700" : "text-amber-700"
              }`}
            >
              écart max +{a.montant_ecart_max_pct.toFixed(1)}%
            </p>
          )}
        </div>
      </button>
      {expanded && (
        <div className="bg-slate-50 border-t p-3 space-y-3 text-xs">
          {a.periodes_manquantes.length > 0 && (
            <div>
              <p className="font-medium text-red-900 mb-1">
                Périodes manquantes ({a.periodes_manquantes.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {a.periodes_manquantes.map((p) => (
                  <Badge key={p} variant="outline" className="bg-red-50 border-red-300 text-red-700 font-mono text-[10px]">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {a.factures_avec_supplement.length > 0 && (
            <div>
              <p className="font-medium text-amber-900 mb-1">
                Factures avec montant supérieur au médian ({a.factures_avec_supplement.length})
              </p>
              <div className="rounded border bg-white divide-y">
                {a.factures_avec_supplement.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-2 p-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono">{f.numero || f.id.slice(0, 8)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDate(f.date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono">
                        {fmt(f.montant)} {a.devise}
                      </p>
                      <p
                        className={`text-[10px] font-mono ${
                          f.ecart_pct > 20 ? "text-red-700" : "text-amber-700"
                        }`}
                      >
                        +{f.ecart_pct.toFixed(1)}% (médian {fmt(f.montant_attendu)})
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Link
            href={`/client/factures?search=${encodeURIComponent(a.tiers.slice(0, 30))}`}
            className="text-emerald-700 hover:underline inline-flex items-center gap-1"
          >
            Voir les factures de ce tiers <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  )
}
