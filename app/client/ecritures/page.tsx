"use client"

/**
 * Page /client/ecritures — agent-friendly.
 *
 * Vue des écritures comptables (grand livre détaillé) de la société.
 * Lex Banque produit les écritures BNQ qui apparaîtront ici.
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Loader2,
  RefreshCw,
  BookOpen,
  Search,
  ArrowRight,
  Sparkles,
  Bot,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface Ecriture {
  id: string
  date_ecriture: string
  journal: string
  numero_compte: string
  libelle: string | null
  debit_mur: number
  credit_mur: number
  devise_origine: string | null
  montant_origine: number | null
  taux_change_applique: number | null
  ref_folio: string | null
  lettre: string | null
  date_lettrage: string | null
  facture_id: string | null
}

const JOURNAL_LABELS: Record<string, { label: string; color: string }> = {
  VTE: { label: "Ventes", color: "bg-green-100 text-green-700 border-green-300" },
  ACH: { label: "Achats", color: "bg-rose-100 text-rose-700 border-rose-300" },
  BNQ: { label: "Banque", color: "bg-blue-100 text-blue-700 border-blue-300" },
  SAL: { label: "Salaires", color: "bg-purple-100 text-purple-700 border-purple-300" },
  OD: { label: "Diverses", color: "bg-amber-100 text-amber-700 border-amber-300" },
  CLS: { label: "Clôture", color: "bg-slate-100 text-slate-700 border-slate-300" },
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

export default function ClientEcrituresPage() {
  const { societeId } = useSocieteActive()
  const [ecritures, setEcritures] = useState<Ecriture[]>([])
  const [loading, setLoading] = useState(false)
  const [journalFilter, setJournalFilter] = useState("all")
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/comptable/ecritures?societe_id=${societeId}&limit=500`
      )
      const d = await res.json()
      setEcritures(d?.ecritures || d?.data || [])
    } catch {}
    finally {
      setLoading(false)
    }
  }, [societeId])
  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    let list = ecritures
    if (journalFilter !== "all") list = list.filter((e) => e.journal === journalFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (e) =>
          e.libelle?.toLowerCase().includes(q) ||
          e.numero_compte?.includes(q) ||
          e.ref_folio?.toLowerCase().includes(q)
      )
    }
    return list
      .slice()
      .sort((a, b) => (b.date_ecriture || "").localeCompare(a.date_ecriture || ""))
  }, [ecritures, journalFilter, search])

  const totalDebit = filtered.reduce((s, e) => s + (Number(e.debit_mur) || 0), 0)
  const totalCredit = filtered.reduce((s, e) => s + (Number(e.credit_mur) || 0), 0)
  const journaux = useMemo(() => {
    const set = new Set<string>()
    for (const e of ecritures) if (e.journal) set.add(e.journal)
    return Array.from(set).sort()
  }, [ecritures])

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-7xl">
        {/* HEADER */}
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-blue-50 to-sky-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 p-3 text-white shadow-md">
                <BookOpen className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-indigo-900">Écritures comptables</h1>
                <p className="text-sm text-indigo-700/80 mt-0.5">
                  Grand livre détaillé · les BNQ sont produites par Lex Banque
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={load} disabled={loading || !societeId} size="sm">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Actualiser
              </Button>
              <Link href="/client/grand-livre">
                <Button variant="outline" size="sm">
                  Grand livre
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </Link>
              <Link href="/client/rapprochement">
                <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  Lex Banque
                </Button>
              </Link>
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
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <KpiCard label="Écritures" value={filtered.length} />
              <KpiCard label="Total débit" value={fmt(totalDebit)} tone="green" />
              <KpiCard label="Total crédit" value={fmt(totalCredit)} tone="rose" />
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-indigo-600" />
                    Liste des écritures ({filtered.length})
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Libellé, compte, ref…"
                        className="pl-8 h-9 w-56"
                      />
                    </div>
                    <Select value={journalFilter} onValueChange={setJournalFilter}>
                      <SelectTrigger className="h-9 w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous journaux</SelectItem>
                        {journaux.map((j) => (
                          <SelectItem key={j} value={j}>
                            {JOURNAL_LABELS[j]?.label || j}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filtered.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Aucune écriture pour ce filtre.
                  </p>
                ) : (
                  <div className="rounded border bg-card divide-y">
                    {filtered.map((e) => {
                      const jLabel = JOURNAL_LABELS[e.journal] || {
                        label: e.journal,
                        color: "bg-slate-100 text-slate-700 border-slate-300",
                      }
                      const isBnqLex = e.journal === "BNQ" && e.ref_folio?.startsWith("BANK-")
                      return (
                        <div
                          key={e.id}
                          className="flex items-start justify-between gap-3 p-3 hover:bg-muted/20"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-muted-foreground font-mono">
                                {formatDate(e.date_ecriture)}
                              </span>
                              <Badge className={`text-[10px] border ${jLabel.color}`}>
                                {jLabel.label}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {e.numero_compte}
                              </Badge>
                              {e.lettre && (
                                <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300 font-mono">
                                  {e.lettre}
                                </Badge>
                              )}
                              {isBnqLex && (
                                <Badge className="text-[10px] bg-purple-100 text-purple-700 border-purple-300">
                                  <Bot className="h-3 w-3 mr-0.5" />
                                  Lex Banque
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm mt-1 break-words">{e.libelle || "—"}</p>
                            {e.devise_origine && e.devise_origine !== "MUR" && e.montant_origine && (
                              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                                Origine : {fmt(e.montant_origine)} {e.devise_origine}
                                {e.taux_change_applique && ` × ${e.taux_change_applique}`}
                              </p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0 font-mono text-sm">
                            {e.debit_mur > 0 && (
                              <p className="text-green-700">D {fmt(e.debit_mur)}</p>
                            )}
                            {e.credit_mur > 0 && (
                              <p className="text-rose-700">C {fmt(e.credit_mur)}</p>
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
}: {
  label: string
  value: number | string
  tone?: "amber" | "green" | "rose" | "blue"
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
    <Card className={cls}>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  )
}
