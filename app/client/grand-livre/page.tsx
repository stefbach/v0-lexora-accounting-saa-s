"use client"

/**
 * Page /client/grand-livre — agent-friendly.
 *
 * Synthèse par compte du plan comptable mauricien (PCM 4-digits).
 * Lex Banque alimente les comptes 411x/401x/4210/512x/etc.
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function classeColor(numero: string): string {
  const c = numero[0]
  if (c === "1") return "bg-blue-100 text-blue-700 border-blue-300"
  if (c === "2") return "bg-cyan-100 text-cyan-700 border-cyan-300"
  if (c === "3") return "bg-teal-100 text-teal-700 border-teal-300"
  if (c === "4") return "bg-amber-100 text-amber-700 border-amber-300"
  if (c === "5") return "bg-purple-100 text-purple-700 border-purple-300"
  if (c === "6") return "bg-rose-100 text-rose-700 border-rose-300"
  if (c === "7") return "bg-green-100 text-green-700 border-green-300"
  return "bg-slate-100 text-slate-700 border-slate-300"
}
function classeLabel(numero: string): string {
  const c = numero[0]
  return (
    {
      "1": "Capitaux",
      "2": "Immo.",
      "3": "Stocks",
      "4": "Tiers",
      "5": "Trésorerie",
      "6": "Charges",
      "7": "Produits",
    }[c] || "—"
  )
}

export default function ClientGrandLivrePage() {
  const { societeId } = useSocieteActive()
  const [comptes, setComptes] = useState<CompteSolde[]>([])
  const [loading, setLoading] = useState(false)
  const [classeFilter, setClasseFilter] = useState("all")
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      // Utilise /api/client/financial.ecritures et agrège côté client par compte.
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

  const filtered = useMemo(() => {
    let list = comptes
    if (classeFilter !== "all") list = list.filter((c) => c.numero_compte.startsWith(classeFilter))
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

  const totalActif = comptes
    .filter((c) => /^[1-5]/.test(c.numero_compte))
    .reduce((s, c) => s + c.solde, 0)
  const totalCharges = comptes
    .filter((c) => c.numero_compte.startsWith("6"))
    .reduce((s, c) => s + c.solde, 0)
  const totalProduits = comptes
    .filter((c) => c.numero_compte.startsWith("7"))
    .reduce((s, c) => s + Math.abs(c.solde), 0)

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-7xl">
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-zinc-50 to-stone-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 p-3 text-white shadow-md">
                <BookCopy className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Grand livre</h1>
                <p className="text-sm text-slate-700/80 mt-0.5">
                  Soldes par compte PCM mauricien
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={load} disabled={loading || !societeId} size="sm">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Actualiser
              </Button>
              <Link href="/client/ecritures">
                <Button variant="outline" size="sm">
                  Détail écritures
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
            <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Comptes mouvementés" value={comptes.length} />
              <KpiCard label="Total actif net (1-5)" value={fmt(totalActif)} tone="blue" />
              <KpiCard
                label="Total charges (6)"
                value={fmt(totalCharges)}
                tone="rose"
              />
              <KpiCard
                label="Total produits (7)"
                value={fmt(totalProduits)}
                tone="green"
              />
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BookCopy className="h-5 w-5 text-slate-700" />
                    Soldes ({filtered.length})
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="N° ou libellé…"
                        className="pl-8 h-9 w-56"
                      />
                    </div>
                    <div className="flex gap-1 border rounded p-1 bg-card">
                      {["all", "1", "2", "3", "4", "5", "6", "7"].map((c) => (
                        <button
                          key={c}
                          onClick={() => setClasseFilter(c)}
                          className={`px-2 py-0.5 text-xs rounded ${
                            classeFilter === c
                              ? "bg-slate-900 text-white"
                              : "hover:bg-muted"
                          }`}
                        >
                          {c === "all" ? "Tous" : `Cl ${c}`}
                        </button>
                      ))}
                    </div>
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
                    {filtered.map((c) => (
                      <div
                        key={c.numero_compte}
                        className="flex items-start justify-between gap-3 p-3 hover:bg-muted/20"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-mono ${classeColor(c.numero_compte)}`}
                            >
                              {c.numero_compte}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {classeLabel(c.numero_compte)}
                            </Badge>
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
                      </div>
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
