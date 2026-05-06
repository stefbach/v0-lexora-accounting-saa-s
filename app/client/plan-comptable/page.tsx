"use client"

/**
 * Page /client/plan-comptable — Plan Comptable Mauricien hiérarchique.
 *
 * 7 classes collapsibles. Au sein de chaque classe, arborescence
 * parent → enfants (compte_parent + niveau). Recherche full-text qui
 * ouvre automatiquement les classes correspondantes.
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
  ChevronDown,
  ChevronRight,
  Layers,
  Wallet,
  Building2,
  Package,
  Users,
  Landmark,
  ArrowDownCircle,
  ArrowUpCircle,
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

const CLASSES: Array<{ num: number; label: string; desc: string; color: string; Icon: any }> = [
  { num: 1, label: "Capitaux", desc: "Capital, réserves, emprunts long terme", color: "blue", Icon: Wallet },
  { num: 2, label: "Immobilisations", desc: "Actifs corporels, incorporels, financiers", color: "cyan", Icon: Building2 },
  { num: 3, label: "Stocks", desc: "Marchandises, matières premières, produits finis", color: "teal", Icon: Package },
  { num: 4, label: "Tiers", desc: "Clients, fournisseurs, État, personnel, associés", color: "amber", Icon: Users },
  { num: 5, label: "Trésorerie", desc: "Banque, caisse, virements internes", color: "purple", Icon: Landmark },
  { num: 6, label: "Charges", desc: "Achats, services extérieurs, salaires, impôts", color: "rose", Icon: ArrowDownCircle },
  { num: 7, label: "Produits", desc: "Ventes, prestations, produits financiers", color: "green", Icon: ArrowUpCircle },
]
const colorMap: Record<string, { bg: string; border: string; text: string; bgLight: string }> = {
  blue: { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-900", bgLight: "bg-blue-100" },
  cyan: { bg: "bg-cyan-50", border: "border-cyan-300", text: "text-cyan-900", bgLight: "bg-cyan-100" },
  teal: { bg: "bg-teal-50", border: "border-teal-300", text: "text-teal-900", bgLight: "bg-teal-100" },
  amber: { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-900", bgLight: "bg-amber-100" },
  purple: { bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-900", bgLight: "bg-purple-100" },
  rose: { bg: "bg-rose-50", border: "border-rose-300", text: "text-rose-900", bgLight: "bg-rose-100" },
  green: { bg: "bg-green-50", border: "border-green-300", text: "text-green-900", bgLight: "bg-green-100" },
}

export default function PlanComptablePage() {
  const { societeId } = useSocieteActive()
  const [comptes, setComptes] = useState<ComptePCM[]>([])
  const [loading, setLoading] = useState(false)
  const [openClasses, setOpenClasses] = useState<Set<number>>(new Set([1, 2, 3, 4, 5, 6, 7]))
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

  // Index par classe
  const byClass = useMemo(() => {
    const map = new Map<number, ComptePCM[]>()
    for (const c of comptes) {
      const arr = map.get(c.classe) || []
      arr.push(c)
      map.set(c.classe, arr)
    }
    for (const [, v] of map) v.sort((a, b) => a.compte.localeCompare(b.compte))
    return map
  }, [comptes])

  // Filtre par recherche
  const filteredByClass = useMemo(() => {
    const q = search.trim().toLowerCase()
    const result = new Map<number, ComptePCM[]>()
    for (const [cl, arr] of byClass) {
      const filtered = q
        ? arr.filter(
            (c) =>
              c.compte.toLowerCase().includes(q) ||
              (c.libelle || "").toLowerCase().includes(q)
          )
        : arr
      result.set(cl, filtered)
    }
    return result
  }, [byClass, search])

  // Auto-open matching classes when searching
  useEffect(() => {
    if (search.trim()) {
      const next = new Set<number>()
      for (const [cl, arr] of filteredByClass) if (arr.length > 0) next.add(cl)
      setOpenClasses(next)
    }
  }, [search, filteredByClass])

  const toggleClass = (cl: number) => {
    setOpenClasses((prev) => {
      const next = new Set(prev)
      if (next.has(cl)) next.delete(cl)
      else next.add(cl)
      return next
    })
  }

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-7xl">
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-zinc-50 to-stone-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 p-3 text-white shadow-md">
                <BookOpen className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Plan Comptable Mauricien</h1>
                <p className="text-sm text-slate-700/80 mt-0.5">
                  Référentiel des {comptes.length} comptes officiels — 7 classes
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
            {/* Recherche */}
            <Card>
              <CardContent className="p-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher (n° compte, libellé)…"
                    className="pl-8 h-9"
                  />
                </div>
                <div className="flex justify-end mt-2 gap-2">
                  <button
                    onClick={() => setOpenClasses(new Set([1, 2, 3, 4, 5, 6, 7]))}
                    className="text-xs text-blue-700 hover:underline"
                  >
                    Tout déplier
                  </button>
                  <span className="text-xs text-muted-foreground">·</span>
                  <button
                    onClick={() => setOpenClasses(new Set())}
                    className="text-xs text-blue-700 hover:underline"
                  >
                    Tout replier
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Sections par classe */}
            <div className="space-y-3">
              {CLASSES.map((cl) => {
                const arr = filteredByClass.get(cl.num) || []
                const open = openClasses.has(cl.num)
                const cls = colorMap[cl.color]
                const totalInClass = (byClass.get(cl.num) || []).length
                return (
                  <Card key={cl.num} className={`${cls.border} border-2`}>
                    <button
                      onClick={() => toggleClass(cl.num)}
                      className={`w-full ${cls.bg} hover:${cls.bgLight} transition-colors p-4 flex items-center justify-between gap-3 text-left`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`rounded-lg ${cls.bgLight} p-2.5 ${cls.text}`}>
                          <cl.Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className={`font-bold ${cls.text}`}>
                            Classe {cl.num} — {cl.label}
                          </h3>
                          <p className="text-xs text-muted-foreground">{cl.desc}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-[10px] text-muted-foreground uppercase">
                            Comptes
                          </div>
                          <div className={`font-bold ${cls.text}`}>
                            {arr.length}
                            {search.trim() && arr.length !== totalInClass && (
                              <span className="text-muted-foreground"> / {totalInClass}</span>
                            )}
                          </div>
                        </div>
                        {open ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                    {open && (
                      <div className="border-t bg-white">
                        {arr.length === 0 ? (
                          <p className="py-4 text-center text-xs text-muted-foreground italic">
                            {search.trim()
                              ? "Aucun compte ne correspond à la recherche dans cette classe"
                              : "Classe vide"}
                          </p>
                        ) : (
                          <div className="divide-y">
                            {arr.map((c) => (
                              <PCMRow key={c.id} c={c} cls={cls} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          </>
        )}
      </div>
    </ClientPageShell>
  )
}

function PCMRow({
  c,
  cls,
}: {
  c: ComptePCM
  cls: { bgLight: string; text: string }
}) {
  const indent = Math.max(0, (c.niveau || 1) - 2) * 16
  const isOverride = !!c.societe_id
  return (
    <div
      className="flex items-start gap-3 p-3 hover:bg-muted/30"
      style={{ paddingLeft: 12 + indent }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={`text-[11px] font-mono ${cls.bgLight} ${cls.text}`}>
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
          {c.compte_parent && (
            <span className="text-[10px] text-muted-foreground font-mono">
              ↳ parent {c.compte_parent}
            </span>
          )}
        </div>
        <p className="text-sm mt-1 break-words font-medium">{c.libelle || "—"}</p>
        {c.notes && <p className="text-[11px] italic text-muted-foreground">{c.notes}</p>}
      </div>
    </div>
  )
}
