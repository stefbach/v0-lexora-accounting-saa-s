"use client"

/**
 * Page /client/lex-ocr — Agent Lex OCR (contrôle qualité OCR).
 */

import { useState, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  ScanText,
  Sparkles,
  Bot,
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  FileText,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface Alert {
  severity: "critical" | "warning" | "info"
  code: string
  message: string
  document_id?: string
  document_nom?: string
  details?: any
}

const CODE_LABELS: Record<string, string> = {
  OCR_ERROR: "Erreur OCR",
  ORPHAN_OCR: "Pipeline cassé (facture)",
  ORPHAN_RELEVE: "Pipeline cassé (relevé)",
  DUPLICATE_INVOICE: "Doublon de facture",
  MISSING_FIELDS: "Champs manquants",
  MISMATCH_AMOUNT: "Écart montant",
  MISMATCH_DATE: "Écart date",
  MISMATCH_TIERS: "Écart tiers",
  MISMATCH_CURRENCY: "Écart devise",
  WRONG_SOCIETE: "Mauvaise société",
  MISMATCH_RELEVE_TX: "Écart nb transactions relevé",
}

export default function LexOcrPage() {
  const { societeId } = useSocieteActive()
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [filter, setFilter] = useState<"all" | "critical" | "warning" | "info">("all")
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(
    null
  )

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const handleAnalyze = useCallback(async () => {
    if (!societeId) return
    setAnalyzing(true)
    try {
      const res = await fetch("/api/agent/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId }),
      })
      const d = await res.json()
      if (!res.ok) {
        showToast(d?.error || "Erreur Lex OCR", "error")
        return
      }
      setResult(d)
      showToast(`Lex OCR : score ${d.score}/100 — ${d.alerts.length} alerte(s)`)
    } catch (e: any) {
      showToast(e?.message || "Erreur réseau", "error")
    } finally {
      setAnalyzing(false)
    }
  }, [societeId])

  const alerts: Alert[] = result?.alerts || []
  const summary = result?.summary || {}

  const filteredAlerts =
    filter === "all" ? alerts : alerts.filter((a) => a.severity === filter)

  const score = result?.score || 0
  const severity = result?.severity || "ok"
  const headerColor =
    severity === "critical"
      ? "border-red-300 bg-gradient-to-br from-red-50 to-rose-50"
      : severity === "warning"
        ? "border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50"
        : "border-green-300 bg-gradient-to-br from-green-50 to-emerald-50"
  const scoreColor =
    score >= 80 ? "text-green-700" : score >= 50 ? "text-amber-700" : "text-red-700"

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
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 p-3 text-white shadow-md">
                <ScanText className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-indigo-900 flex items-center gap-2">
                  Lex OCR
                  <Badge className="bg-indigo-600 text-white text-[10px] uppercase">
                    Agent IA
                  </Badge>
                </h1>
                <p className="text-sm text-indigo-700/80 mt-0.5">
                  Contrôle qualité OCR : intégrité des extractions, cohérence DB,
                  doublons, mismatches
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Link href="/client/documents">
                <Button variant="outline" size="sm">
                  <FileText className="h-4 w-4 mr-1.5" />
                  Documents
                </Button>
              </Link>
              <Button
                onClick={handleAnalyze}
                disabled={analyzing || !societeId}
                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyse en cours…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Lancer Lex OCR
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
              <Bot className="h-12 w-12 mx-auto text-indigo-300 mb-3" />
              <p className="font-medium text-sm">Lance l'analyse pour démarrer</p>
              <p className="text-xs text-muted-foreground mt-1">
                L'agent compare les données extraites par OCR avec ce qui a été
                effectivement persisté en base et signale les incohérences.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Score */}
            <div className={`rounded-xl border-2 p-4 ${headerColor}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-indigo-600 p-2.5 text-white shadow-md">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold">Lex OCR — Contrôle qualité</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {summary.total_documents} document(s) analysés ·{" "}
                      {summary.factures_creees} factures · {summary.releves_crees} relevés
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-4xl font-bold ${scoreColor}`}>{score}</div>
                  <div className="text-xs text-muted-foreground">/100 santé</div>
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <KpiCard label="Docs en erreur" value={summary.docs_en_erreur || 0} tone="rose" accent={summary.docs_en_erreur > 0} />
              <KpiCard label="Orphelins" value={summary.docs_orphelins || 0} tone="rose" accent={summary.docs_orphelins > 0} />
              <KpiCard label="Champs manquants" value={summary.docs_champs_manquants || 0} tone="amber" accent={summary.docs_champs_manquants > 0} />
              <KpiCard label="Doublons factures" value={summary.doublons_facture || 0} tone="amber" accent={summary.doublons_facture > 0} />
              <KpiCard label="Mismatch montant" value={summary.mismatches_montant || 0} tone="amber" accent={summary.mismatches_montant > 0} />
              <KpiCard label="Mismatch tiers" value={summary.mismatches_tiers || 0} tone="blue" />
            </div>

            {/* Filtre sévérité */}
            <Card>
              <CardContent className="p-3">
                <div className="flex gap-1 flex-wrap">
                  {(
                    [
                      { v: "all", label: "Toutes", count: alerts.length },
                      { v: "critical", label: "Critiques", count: alerts.filter((a) => a.severity === "critical").length, color: "border-red-300" },
                      { v: "warning", label: "Avertissements", count: alerts.filter((a) => a.severity === "warning").length, color: "border-amber-300" },
                      { v: "info", label: "Infos", count: alerts.filter((a) => a.severity === "info").length, color: "border-blue-300" },
                    ] as const
                  ).map((opt: any) => (
                    <button
                      key={opt.v}
                      onClick={() => setFilter(opt.v as any)}
                      className={`px-3 py-1 text-xs rounded border ${
                        filter === opt.v
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : `border-muted hover:border-indigo-300`
                      }`}
                    >
                      {opt.label} ({opt.count})
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Alertes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Alertes ({filteredAlerts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredAlerts.length === 0 ? (
                  <div className="py-8 text-center">
                    <CheckCircle2 className="h-10 w-10 mx-auto text-green-500 mb-2" />
                    <p className="text-sm font-medium">
                      {filter === "all"
                        ? "Aucune anomalie détectée — pipeline OCR propre"
                        : `Aucune alerte ${filter}`}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredAlerts.map((a, i) => {
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
                      return (
                        <div
                          key={i}
                          className={`rounded border-l-4 p-3 ${cls} flex items-start gap-3`}
                        >
                          <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 flex-wrap">
                              <Badge variant="outline" className="text-[10px]">
                                {CODE_LABELS[a.code] || a.code}
                              </Badge>
                              {a.document_nom && (
                                <Badge variant="outline" className="text-[10px] font-mono">
                                  {a.document_nom.slice(0, 50)}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm mt-1 break-words">{a.message}</p>
                            {a.details && (
                              <details className="mt-1 text-[11px]">
                                <summary className="cursor-pointer text-muted-foreground">
                                  détail
                                </summary>
                                <pre className="mt-1 p-2 bg-white/50 rounded font-mono overflow-x-auto">
                                  {JSON.stringify(a.details, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </div>
                      )
                    })}
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

function KpiCard({
  label,
  value,
  tone,
  accent,
}: {
  label: string
  value: number
  tone?: "amber" | "green" | "rose" | "blue"
  accent?: boolean
}) {
  const cls =
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
    <Card className={`${cls} ${accent ? "ring-2 ring-amber-400" : ""}`}>
      <CardContent className="p-3">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  )
}
