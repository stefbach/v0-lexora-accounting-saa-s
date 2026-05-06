"use client"

/**
 * Page /client/plan-comptable — Plan Comptable Mauricien navigable.
 *
 * 7 classes (1 Capitaux, 2 Immo, 3 Stocks, 4 Tiers, 5 Trésorerie, 6 Charges,
 * 7 Produits). Recherche + tri par numéro. Indique si le compte a été
 * personnalisé pour la société (override).
 */

import { useState, useEffect, useCallback, useMemo } from "react"
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
  BookOpen,
  Search,
  Layers,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface ComptePCM {
  id: string
  compte: string
  libelle: string | null
  classe: number
  type_compte: string | null
  sens_normal: "D" | "C" | null
  compte_parent: string | null
  niveau: number | null
  actif: boolean
  est_analytique: boolean
  notes: string | null
  societe_id: string | null
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

export default function PlanComptablePage() {
  const { societeId } = useSocieteActive()
  const [comptes, setComptes] = useState<ComptePCM[]>([])
  const [loading, setLoading] = useState(false)
  const [classeFilter, setClasseFilter] = useState<number | "all">("all")
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/client/plan-comptable?societe_id=${societeId}`)
      const d = await res.json()
      setComptes(d?.comptes || [])
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
    if (classeFilter !== "all") list = list.filter((c) => c.classe === classeFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (c) =>
          c.compte.toLowerCase().includes(q) ||
          (c.libelle || "").toLowerCase().includes(q)
      )
    }
    return list
  }, [comptes, classeFilter, search])

  const statsByClasse = useMemo(() => {
    const map = new Map<number, number>()
    for (const c of comptes) map.set(c.classe, (map.get(c.classe) || 0) + 1)
    return map
  }, [comptes])

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-7xl">
        {/* HEADER */}
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-zinc-50 to-stone-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 p-3 text-white shadow-md">
                <BookOpen className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Plan Comptable Mauricien</h1>
                <p className="text-sm text-slate-700/80 mt-0.5">
                  Référentiel des 210 comptes officiels (PCM 4-digits) — 7 classes
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={load} disabled={loading || !societeId} size="sm">
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
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
                <div className="text-[10px] text-muted-foreground">{comptes.length} comptes</div>
              </button>
              {CLASSES.map((c) => {
                const count = statsByClasse.get(c.num) || 0
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
                    <div className="text-xs font-bold mt-1">
                      Classe {c.num}
                    </div>
                    <div className="text-[10px]">{c.label}</div>
                    <div className="text-[10px] text-muted-foreground">{count} comptes</div>
                  </button>
                )
              })}
            </div>

            {/* Recherche */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="h-5 w-5 text-slate-700" />
                    {classeFilter === "all"
                      ? `Tous les comptes (${filtered.length})`
                      : `Classe ${classeFilter} — ${CLASSES.find((c) => c.num === classeFilter)?.label} (${filtered.length})`}
                  </CardTitle>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Rechercher (n° ou libellé)…"
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
                      const cl = CLASSES.find((x) => x.num === c.classe)
                      const isOverride = !!c.societe_id
                      return (
                        <div
                          key={c.id}
                          className="flex items-start justify-between gap-3 p-3 hover:bg-muted/20"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant="outline"
                                className={`text-[11px] font-mono ${cl?.color}`}
                              >
                                {c.compte}
                              </Badge>
                              {c.sens_normal && (
                                <Badge variant="outline" className="text-[10px]">
                                  Sens {c.sens_normal === "D" ? "Débit" : "Crédit"}
                                </Badge>
                              )}
                              {c.type_compte && (
                                <Badge variant="outline" className="text-[10px]">
                                  {c.type_compte}
                                </Badge>
                              )}
                              {isOverride && (
                                <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                                  Personnalisé société
                                </Badge>
                              )}
                              {!c.actif && (
                                <Badge variant="outline" className="text-[10px] opacity-60">
                                  Inactif
                                </Badge>
                              )}
                              {c.est_analytique && (
                                <Badge variant="outline" className="text-[10px]">
                                  Analytique
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm mt-1 break-words font-medium">
                              {c.libelle || "—"}
                            </p>
                            {c.compte_parent && (
                              <p className="text-[11px] text-muted-foreground">
                                Parent : <span className="font-mono">{c.compte_parent}</span>
                              </p>
                            )}
                            {c.notes && (
                              <p className="text-[11px] italic text-muted-foreground">{c.notes}</p>
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
