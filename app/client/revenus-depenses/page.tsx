"use client"

/**
 * Page /client/revenus-depenses — agent-friendly.
 *
 * Synthèse mensuelle/annuelle des revenus (classe 7) et dépenses (classe 6).
 * Données issues du grand livre alimenté entre autres par Lex Banque.
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Sparkles,
  Wallet,
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

const ANNEES = ["2023", "2024", "2025", "2026", "2027"]

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ClientRevenusDepensesPage() {
  const { societeId } = useSocieteActive()
  const [comptes, setComptes] = useState<CompteSolde[]>([])
  const [loading, setLoading] = useState(false)
  const [annee, setAnnee] = useState(String(new Date().getFullYear()))

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/comptable/grand-livre?societe_id=${societeId}&annee=${annee}`
      )
      const d = await res.json()
      setComptes(d?.comptes || d?.balance || [])
    } catch {}
    finally {
      setLoading(false)
    }
  }, [societeId, annee])
  useEffect(() => {
    load()
  }, [load])

  const revenus = useMemo(
    () =>
      comptes
        .filter((c) => c.numero_compte.startsWith("7"))
        .map((c) => ({ ...c, montant: Math.abs(c.solde) }))
        .sort((a, b) => b.montant - a.montant),
    [comptes]
  )
  const depenses = useMemo(
    () =>
      comptes
        .filter((c) => c.numero_compte.startsWith("6"))
        .map((c) => ({ ...c, montant: c.solde }))
        .sort((a, b) => b.montant - a.montant),
    [comptes]
  )

  const totalRevenus = revenus.reduce((s, c) => s + c.montant, 0)
  const totalDepenses = depenses.reduce((s, c) => s + c.montant, 0)
  const resultat = totalRevenus - totalDepenses

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-7xl">
        <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-pink-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-3 text-white shadow-md">
                <Wallet className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-violet-900">Revenus & Dépenses</h1>
                <p className="text-sm text-violet-700/80 mt-0.5">
                  P&amp;L par compte — exercice {annee}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <Select value={annee} onValueChange={setAnnee}>
                <SelectTrigger className="h-9 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANNEES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={load} disabled={loading || !societeId} size="sm">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Actualiser
              </Button>
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
            <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <KpiCard
                label="Revenus totaux"
                value={fmt(totalRevenus)}
                tone="green"
                icon={<TrendingUp className="h-4 w-4" />}
              />
              <KpiCard
                label="Dépenses totales"
                value={fmt(totalDepenses)}
                tone="rose"
                icon={<TrendingDown className="h-4 w-4" />}
              />
              <KpiCard
                label="Résultat"
                value={fmt(resultat)}
                tone={resultat >= 0 ? "green" : "rose"}
                accent
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Card className="border-green-200">
                <CardHeader className="bg-green-50/50 border-b">
                  <CardTitle className="text-base flex items-center gap-2 text-green-900">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    Revenus (classe 7) — {fmt(totalRevenus)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {revenus.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Aucun revenu sur l'exercice.
                    </p>
                  ) : (
                    <div className="divide-y">
                      {revenus.map((c) => (
                        <div
                          key={c.numero_compte}
                          className="flex items-start justify-between gap-3 p-3 hover:bg-green-50/30"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {c.numero_compte}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {c.nb_ecritures} écr.
                              </span>
                            </div>
                            <p className="text-sm mt-0.5 break-words">
                              {c.libelle || "—"}
                            </p>
                          </div>
                          <p className="font-mono text-sm text-green-700 flex-shrink-0">
                            +{fmt(c.montant)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-rose-200">
                <CardHeader className="bg-rose-50/50 border-b">
                  <CardTitle className="text-base flex items-center gap-2 text-rose-900">
                    <TrendingDown className="h-5 w-5 text-rose-600" />
                    Dépenses (classe 6) — {fmt(totalDepenses)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {depenses.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Aucune dépense sur l'exercice.
                    </p>
                  ) : (
                    <div className="divide-y">
                      {depenses.map((c) => (
                        <div
                          key={c.numero_compte}
                          className="flex items-start justify-between gap-3 p-3 hover:bg-rose-50/30"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {c.numero_compte}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {c.nb_ecritures} écr.
                              </span>
                            </div>
                            <p className="text-sm mt-0.5 break-words">
                              {c.libelle || "—"}
                            </p>
                          </div>
                          <p className="font-mono text-sm text-rose-700 flex-shrink-0">
                            -{fmt(c.montant)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
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
  icon,
}: {
  label: string
  value: number | string
  tone?: "amber" | "green" | "rose" | "blue"
  accent?: boolean
  icon?: React.ReactNode
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
    <Card className={`${cls} ${accent ? "ring-2 ring-violet-400" : ""}`}>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          {icon}
          {label}
        </div>
        <div className="text-xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  )
}
