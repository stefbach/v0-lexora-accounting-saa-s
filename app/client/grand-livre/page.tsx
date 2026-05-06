"use client"

/**
 * Page /client/grand-livre — refonte avec audit Lex Livre + navigation classes.
 *
 * Sections :
 * 1. Header avec bouton "Lancer Lex Livre" (audit complet)
 * 2. Score d'audit + anomalies critiques (R1 balance, comptes hors PCM, etc.)
 * 3. Navigation par classe 1-7 (cards visuelles avec totaux)
 * 4. Liste détaillée des comptes filtrée par classe
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Loader2,
  RefreshCw,
  BookCopy,
  Search,
  ArrowRight,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Bot,
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  BookOpen,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface CompteSolde {
  numero_compte: string
  libelle?: string | null
  total_debit: number
  total_credit: number
  solde: number
  nb_ecritures: number
}

interface AuditIssue {
  severity: "critical" | "warning" | "info"
  code: string
  message: string
  count?: number
}

const CLASSES = [
  { num: 1, label: "Capitaux", color: "bg-blue-100 text-blue-700 border-blue-300", icon: "💰" },
  { num: 2, label: "Immobilisations", color: "bg-cyan-100 text-cyan-700 border-cyan-300", icon: "🏢" },
  { num: 3, label: "Stocks", color: "bg-teal-100 text-teal-700 border-teal-300", icon: "📦" },
  { num: 4, label: "Tiers", color: "bg-amber-100 text-amber-700 border-amber-300", icon: "🤝" },
  { num: 5, label: "Trésorerie", color: "bg-purple-100 text-purple-700 border-purple-300", icon: "🏦" },
  { num: 6, label: "Charges", color: "bg-rose-100 text-rose-700 border-rose-300", icon: "📤" },
  { num: 7, label: "Produits", color: "bg-green-100 text-green-700 border-green-300", icon: "📥" },
]

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ClientGrandLivrePage() {
  const { societeId } = useSocieteActive()
  const [comptes, setComptes] = useState<CompteSolde[]>([])
  const [loading, setLoading] = useState(false)
  const [auditing, setAuditing] = useState(false)
  const [audit, setAudit] = useState<any>(null)
  const [classeFilter, setClasseFilter] = useState<number | "all">("all")
  const [search, setSearch] = useState("")
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/client/financial?societe_id=${societeId}`)
      const d = await res.json()
      const fin = d?.financial || {}
      const ecr: any[] = fin.ecritures || []
      const map = new Map<string, CompteSolde>()
      for (const e of ecr) {
        const num = e.numero_compte || e.compte || "?"
        const debit = Number(e.debit_mur) || Number(e.debit) || 0
        const credit = Number(e.credit_mur) || Number(e.credit) || 0
        const cur = map.get(num) || {
          numero_compte: num,
          libelle: e.libelle || null,
          total_debit: 0,
          total_credit: 0,
          solde: 0,
          nb_ecritures: 0,
        }
        cur.total_debit += debit
        cur.total_credit += credit
        cur.solde = cur.total_debit - cur.total_credit
        cur.nb_ecritures++
        map.set(num, cur)
      }
      setComptes(Array.from(map.values()))
    } catch {}
    finally {
      setLoading(false)
    }
  }, [societeId])
  useEffect(() => {
    load()
  }, [load])

  const handleAudit = async () => {
    if (!societeId) return
    setAuditing(true)
    try {
      const res = await fetch("/api/agent/grand-livre", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId }),
      })
      const d = await res.json()
      if (!res.ok) {
        showToast(d?.error || "Erreur Lex Livre", "error")
        return
      }
      setAudit(d)
      showToast(`Lex Livre : score ${d.score}/100 — ${d.issues?.length || 0} alerte(s)`)
    } catch (e: any) {
      showToast(e?.message || "Erreur Lex Livre", "error")
    } finally {
      setAuditing(false)
    }
  }

  // Stats par classe
  const statsByClasse = useMemo(() => {
    const map = new Map<number, { nb: number; debit: number; credit: number }>()
    for (const c of comptes) {
      const cl = parseInt(c.numero_compte[0]) || 0
      if (cl < 1 || cl > 7) continue
      const cur = map.get(cl) || { nb: 0, debit: 0, credit: 0 }
      cur.nb++
      cur.debit += c.total_debit
      cur.credit += c.total_credit
      map.set(cl, cur)
    }
    return map
  }, [comptes])

  const filtered = useMemo(() => {
    let list = comptes
    if (classeFilter !== "all") {
      list = list.filter((c) => parseInt(c.numero_compte[0]) === classeFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (c) =>
          c.numero_compte.toLowerCase().includes(q) ||
          (c.libelle || "").toLowerCase().includes(q)
      )
    }
    return list.slice().sort((a, b) => a.numero_compte.localeCompare(b.numero_compte))
  }, [comptes, classeFilter, search])

  const totalDebit = comptes.reduce((s, c) => s + c.total_debit, 0)
  const totalCredit = comptes.reduce((s, c) => s + c.total_credit, 0)
  const ecart = totalDebit - totalCredit

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
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-zinc-50 to-stone-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 p-3 text-white shadow-md">
                <BookCopy className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Grand livre</h1>
                <p className="text-sm text-slate-700/80 mt-0.5">
                  Soldes par compte PCM 4-digits — audit & navigation par classe
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={load} disabled={loading || !societeId} size="sm">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Actualiser
              </Button>
              <Link href="/client/plan-comptable">
                <Button variant="outline" size="sm">
                  <BookOpen className="h-4 w-4 mr-1.5" />
                  Plan comptable
                </Button>
              </Link>
              <Button
                onClick={handleAudit}
                disabled={auditing || !societeId}
                className="bg-purple-600 hover:bg-purple-700 text-white shadow-md"
              >
                {auditing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Lancer Lex Livre
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
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
          </div>
        ) : (
          <>
            {/* Audit Lex Livre */}
            {audit && <AuditPanel audit={audit} />}

            {/* KPIs globaux */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Comptes mouvementés" value={comptes.length} />
              <KpiCard label="Total débit" value={fmt(totalDebit)} tone="green" />
              <KpiCard label="Total crédit" value={fmt(totalCredit)} tone="rose" />
              <KpiCard
                label="Balance R1"
                value={fmt(ecart)}
                tone={Math.abs(ecart) < 0.01 ? "green" : "rose"}
                accent={Math.abs(ecart) >= 0.01}
              />
            </div>

            {/* Navigation par classe */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
              <button
                onClick={() => setClasseFilter("all")}
                className={`rounded-lg border-2 p-3 text-center transition-all ${
                  classeFilter === "all"
                    ? "border-slate-900 bg-slate-100"
                    : "border-muted bg-card hover:border-slate-300"
                }`}
              >
                <div className="text-2xl">📚</div>
                <div className="text-xs font-medium mt-1">Toutes</div>
                <div className="text-[10px] text-muted-foreground">
                  {comptes.length} comptes
                </div>
              </button>
              {CLASSES.map((c) => {
                const stats = statsByClasse.get(c.num) || { nb: 0, debit: 0, credit: 0 }
                const active = classeFilter === c.num
                return (
                  <button
                    key={c.num}
                    onClick={() => setClasseFilter(c.num)}
                    className={`rounded-lg border-2 p-3 text-center transition-all ${
                      active ? "border-slate-900" : "border-muted hover:border-slate-300"
                    } ${c.color.split(" ").filter((x) => x.startsWith("bg-")).join(" ")}`}
                  >
                    <div className="text-2xl">{c.icon}</div>
                    <div className="text-xs font-bold mt-1">Classe {c.num}</div>
                    <div className="text-[10px]">{c.label}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {stats.nb} comptes
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Liste comptes */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BookCopy className="h-5 w-5 text-slate-700" />
                    {classeFilter === "all"
                      ? `Tous les comptes mouvementés (${filtered.length})`
                      : `Classe ${classeFilter} — ${CLASSES.find((c) => c.num === classeFilter)?.label} (${filtered.length})`}
                  </CardTitle>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="N° ou libellé…"
                      className="pl-8 h-9 w-72"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filtered.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Aucun compte pour ce filtre.
                  </p>
                ) : (
                  <div className="rounded border bg-card divide-y">
                    {filtered.map((c) => {
                      const cl = CLASSES.find(
                        (x) => x.num === parseInt(c.numero_compte[0])
                      )
                      return (
                        <Link
                          key={c.numero_compte}
                          href={`/client/ecritures?search=${encodeURIComponent(c.numero_compte)}`}
                          className="flex items-start justify-between gap-3 p-3 hover:bg-muted/30"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant="outline"
                                className={`text-[11px] font-mono ${cl?.color}`}
                              >
                                {c.numero_compte}
                              </Badge>
                              {cl && (
                                <Badge variant="outline" className="text-[10px]">
                                  {cl.label}
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {c.nb_ecritures} écriture{c.nb_ecritures > 1 ? "s" : ""}
                              </span>
                            </div>
                            {c.libelle && (
                              <p className="text-sm mt-1 break-words">{c.libelle}</p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0 font-mono text-sm space-y-0.5">
                            <p className="text-[11px] text-muted-foreground">
                              D {fmt(c.total_debit)} · C {fmt(c.total_credit)}
                            </p>
                            <p
                              className={`text-base font-medium ${
                                c.solde >= 0 ? "text-green-700" : "text-rose-700"
                              }`}
                            >
                              {c.solde >= 0 ? (
                                <TrendingUp className="inline h-3 w-3 mr-0.5" />
                              ) : (
                                <TrendingDown className="inline h-3 w-3 mr-0.5" />
                              )}
                              {fmt(c.solde)} MUR
                            </p>
                          </div>
                        </Link>
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

function AuditPanel({ audit }: { audit: any }) {
  const issues: AuditIssue[] = audit.issues || []
  const score = audit.score || 0
  const severity = audit.severity || "ok"
  const summary = audit.summary || {}

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
          <div className="rounded-lg bg-purple-600 p-2.5 text-white shadow-md">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold flex items-center gap-2">
              Lex Livre — Audit Grand Livre
              <Badge className="bg-purple-600 text-white text-[10px]">Agent IA</Badge>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {summary.total_ecritures} écritures · D {fmt(summary.total_debit || 0)} · C{" "}
              {fmt(summary.total_credit || 0)} · écart{" "}
              <span
                className={
                  Math.abs(summary.ecart_balance || 0) > 0.01
                    ? "text-red-700 font-medium"
                    : "text-green-700"
                }
              >
                {fmt(summary.ecart_balance || 0)}
              </span>
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-4xl font-bold ${scoreColor}`}>{score}</div>
          <div className="text-xs text-muted-foreground">/100 santé</div>
        </div>
      </div>

      {issues.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          Aucune anomalie détectée — grand livre propre.
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {issues.map((issue, i) => {
            const Icon =
              issue.severity === "critical"
                ? XCircle
                : issue.severity === "warning"
                  ? AlertTriangle
                  : Info
            const cls =
              issue.severity === "critical"
                ? "text-red-700"
                : issue.severity === "warning"
                  ? "text-amber-700"
                  : "text-blue-700"
            return (
              <div key={i} className={`flex items-start gap-2 text-xs ${cls}`}>
                <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{issue.message}</span>
              </div>
            )
          })}
        </div>
      )}

      {audit.comptes_hors_pcm?.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer font-medium text-amber-700">
            Comptes hors PCM ({audit.comptes_hors_pcm.length})
          </summary>
          <div className="mt-2 space-y-0.5">
            {audit.comptes_hors_pcm.slice(0, 10).map((c: any) => (
              <div key={c.numero} className="flex justify-between gap-2 font-mono">
                <span>{c.numero}</span>
                <span className="text-muted-foreground">
                  {c.nb} écr. · solde {fmt((c.debit - c.credit) || 0)}
                </span>
              </div>
            ))}
          </div>
        </details>
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
    <Card className={`${cls} ${accent ? "ring-2 ring-red-400" : ""}`}>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  )
}
