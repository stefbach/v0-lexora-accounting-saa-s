"use client"

/**
 * Page /client/factures — agent-friendly.
 *
 * Vue d'ensemble des factures (clients + fournisseurs) de la société active,
 * avec filtres et boutons d'action. Lex Banque utilise ces factures pour
 * proposer les rapprochements bancaires.
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Loader2,
  RefreshCw,
  FileText,
  Plus,
  Search,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Bot,
  Sparkles,
  TrendingUp,
  TrendingDown,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface Facture {
  id: string
  numero_facture: string | null
  tiers: string | null
  type_facture: "client" | "fournisseur" | null
  date_facture: string | null
  date_echeance: string | null
  montant_ttc: number
  montant_mur: number | null
  devise: string | null
  statut: string | null
  rapproche_releve_id: string | null
}

function fmt(n: number, dev = "MUR"): string {
  return (
    n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " " +
    dev
  )
}
function formatDate(d: string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}
function daysUntil(d: string | null): number | null {
  if (!d) return null
  return Math.floor((new Date(d).getTime() - Date.now()) / 86400000)
}

const STATUT_LABELS: Record<string, { label: string; color: string }> = {
  paye: { label: "Payée", color: "bg-green-100 text-green-700 border-green-300" },
  partiel: { label: "Partiel", color: "bg-blue-100 text-blue-700 border-blue-300" },
  retard: { label: "En retard", color: "bg-red-100 text-red-700 border-red-300" },
  en_attente: { label: "En attente", color: "bg-amber-100 text-amber-700 border-amber-300" },
  annule: { label: "Annulée", color: "bg-gray-100 text-gray-600 border-gray-300" },
}

export default function ClientFacturesPage() {
  const { societeId } = useSocieteActive()
  const [factures, setFactures] = useState<Facture[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"toutes" | "client" | "fournisseur">("toutes")
  const [statutFilter, setStatutFilter] = useState<string>("all")
  const [tiersFilter, setTiersFilter] = useState<string>("all")
  const [rapprochementFilter, setRapprochementFilter] = useState<string>("all")
  const [dateDebut, setDateDebut] = useState<string>("")
  const [dateFin, setDateFin] = useState<string>("")
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
      // /api/client/factures retourne uniquement les factures clients.
      // Pour avoir aussi les fournisseurs on utilise /api/client/financial
      // qui retourne `financial.factures` (tous types).
      const res = await fetch(`/api/client/financial?societe_id=${societeId}`)
      const d = await res.json()
      const fin = d?.financial || {}
      setFactures(fin.factures || [])
    } catch {
      showToast("Erreur chargement", "error")
    } finally {
      setLoading(false)
    }
  }, [societeId])
  useEffect(() => {
    load()
  }, [load])

  // Liste unique des tiers (pour le dropdown filtre tiers)
  const tiersList = useMemo(() => {
    const set = new Set<string>()
    const inScope = activeTab === "toutes" ? factures : factures.filter((f) => f.type_facture === activeTab)
    for (const f of inScope) if (f.tiers) set.add(f.tiers)
    return Array.from(set).sort()
  }, [factures, activeTab])

  const filtered = useMemo(() => {
    let list = factures
    if (activeTab !== "toutes") list = list.filter((f) => f.type_facture === activeTab)
    if (statutFilter !== "all") list = list.filter((f) => f.statut === statutFilter)
    if (tiersFilter !== "all") list = list.filter((f) => f.tiers === tiersFilter)
    if (rapprochementFilter === "rapproche") list = list.filter((f) => !!f.rapproche_releve_id)
    if (rapprochementFilter === "non_rapproche") list = list.filter((f) => !f.rapproche_releve_id)
    if (dateDebut) list = list.filter((f) => (f.date_facture || "") >= dateDebut)
    if (dateFin) list = list.filter((f) => (f.date_facture || "") <= dateFin)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (f) =>
          f.numero_facture?.toLowerCase().includes(q) ||
          f.tiers?.toLowerCase().includes(q)
      )
    }
    return list.slice().sort((a, b) =>
      (b.date_facture || "").localeCompare(a.date_facture || "")
    )
  }, [factures, activeTab, statutFilter, tiersFilter, rapprochementFilter, dateDebut, dateFin, search])

  // Stats sur le périmètre filtré (pas seulement par tab) — donne le bon
  // total quand l'utilisateur isole un client ou une période
  const stats = useMemo(() => {
    const paye = filtered.filter((f) => f.statut === "paye")
    const enAttente = filtered.filter(
      (f) => f.statut === "en_attente" || f.statut === "partiel"
    )
    const retard = filtered.filter((f) => f.statut === "retard")
    const rapproche = filtered.filter((f) => !!f.rapproche_releve_id)
    const totalAll = filtered.reduce(
      (s, f) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0),
      0
    )
    const totalImpaye = enAttente.concat(retard).reduce(
      (s, f) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0),
      0
    )
    const totalPaye = paye.reduce(
      (s, f) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0),
      0
    )
    return {
      total: filtered.length,
      paye: paye.length,
      enAttente: enAttente.length,
      retard: retard.length,
      rapproche: rapproche.length,
      totalAll,
      totalImpaye,
      totalPaye,
    }
  }, [filtered])

  const hasActiveFilter =
    activeTab !== "toutes" ||
    statutFilter !== "all" ||
    tiersFilter !== "all" ||
    rapprochementFilter !== "all" ||
    !!dateDebut ||
    !!dateFin ||
    !!search.trim()
  const resetFilters = () => {
    setActiveTab("toutes")
    setStatutFilter("all")
    setTiersFilter("all")
    setRapprochementFilter("all")
    setDateDebut("")
    setDateFin("")
    setSearch("")
  }

  const counts = useMemo(
    () => ({
      toutes: factures.length,
      client: factures.filter((f) => f.type_facture === "client").length,
      fournisseur: factures.filter((f) => f.type_facture === "fournisseur").length,
    }),
    [factures]
  )

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
                <h1 className="text-2xl font-bold text-emerald-900">Factures</h1>
                <p className="text-sm text-emerald-700/80 mt-0.5">
                  Clients & fournisseurs · sources de vérité pour Lex Banque
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={load} disabled={loading || !societeId} size="sm">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Actualiser
              </Button>
              <Link href="/client/nouvelle-facture">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Nouvelle facture
                </Button>
              </Link>
              <Link href="/client/rapprochement">
                <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  Lex Banque
                  <ArrowRight className="h-4 w-4 ml-1.5" />
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
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          </div>
        ) : (
          <>
            {/* KPIs (sur le périmètre filtré) */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <KpiCard
                label={hasActiveFilter ? "Filtrées" : "Total factures"}
                value={stats.total}
                accent={hasActiveFilter}
              />
              <KpiCard label="Total filtré" value={fmt(stats.totalAll)} tone="blue" />
              <KpiCard label="Impayées" value={`${stats.enAttente + stats.retard} · ${fmt(stats.totalImpaye)}`} tone={stats.retard > 0 ? "rose" : "amber"} accent={stats.enAttente + stats.retard > 0} />
              <KpiCard label="Payées" value={`${stats.paye} · ${fmt(stats.totalPaye)}`} tone="green" />
              <KpiCard
                label="Rapprochées banque"
                value={`${stats.rapproche} / ${stats.total}`}
                tone={stats.rapproche === stats.total && stats.total > 0 ? "green" : "amber"}
              />
            </div>

            {/* Filtres */}
            <Card>
              <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
                <div className="p-3 border-b space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <TabsList className="bg-transparent gap-1">
                      <TabsTrigger value="toutes" className="px-3 py-1.5">
                        Toutes ({counts.toutes})
                      </TabsTrigger>
                      <TabsTrigger value="client" className="px-3 py-1.5">
                        <TrendingUp className="h-3.5 w-3.5 mr-1 text-green-600" />
                        Clients ({counts.client})
                      </TabsTrigger>
                      <TabsTrigger value="fournisseur" className="px-3 py-1.5">
                        <TrendingDown className="h-3.5 w-3.5 mr-1 text-rose-600" />
                        Fournisseurs ({counts.fournisseur})
                      </TabsTrigger>
                    </TabsList>
                    {hasActiveFilter && (
                      <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs">
                        Réinitialiser les filtres
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="N° ou tiers…"
                        className="pl-8 h-9 w-56"
                      />
                    </div>
                    <Select value={tiersFilter} onValueChange={setTiersFilter}>
                      <SelectTrigger className="h-9 w-56">
                        <SelectValue placeholder="Tiers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous les tiers</SelectItem>
                        {tiersList.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t.length > 50 ? t.slice(0, 47) + "…" : t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={statutFilter} onValueChange={setStatutFilter}>
                      <SelectTrigger className="h-9 w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous statuts</SelectItem>
                        <SelectItem value="en_attente">En attente</SelectItem>
                        <SelectItem value="partiel">Partiel</SelectItem>
                        <SelectItem value="retard">En retard</SelectItem>
                        <SelectItem value="paye">Payée</SelectItem>
                        <SelectItem value="annule">Annulée</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={rapprochementFilter} onValueChange={setRapprochementFilter}>
                      <SelectTrigger className="h-9 w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous rapprochements</SelectItem>
                        <SelectItem value="rapproche">Rapprochée banque</SelectItem>
                        <SelectItem value="non_rapproche">Pas encore rapprochée</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Input
                        type="date"
                        value={dateDebut}
                        onChange={(e) => setDateDebut(e.target.value)}
                        className="h-9 w-36"
                        title="Date début"
                      />
                      <span>→</span>
                      <Input
                        type="date"
                        value={dateFin}
                        onChange={(e) => setDateFin(e.target.value)}
                        className="h-9 w-36"
                        title="Date fin"
                      />
                    </div>
                  </div>
                </div>

                <TabsContent value="toutes" className="mt-0 p-0">
                  <FactureList factures={filtered} />
                </TabsContent>
                <TabsContent value="client" className="mt-0 p-0">
                  <FactureList factures={filtered} />
                </TabsContent>
                <TabsContent value="fournisseur" className="mt-0 p-0">
                  <FactureList factures={filtered} />
                </TabsContent>
              </Tabs>
            </Card>
          </>
        )}
      </div>
    </ClientPageShell>
  )
}

function FactureList({ factures }: { factures: Facture[] }) {
  if (factures.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Aucune facture pour ce filtre.
      </p>
    )
  }
  return (
    <div className="divide-y">
      {factures.map((f) => {
        const days = daysUntil(f.date_echeance)
        const overdue = f.statut !== "paye" && f.statut !== "annule" && days !== null && days < 0
        const dueSoon = f.statut !== "paye" && f.statut !== "annule" && days !== null && days >= 0 && days <= 7
        const statutInfo = STATUT_LABELS[f.statut || "en_attente"] || STATUT_LABELS.en_attente
        const isClient = f.type_facture === "client"
        return (
          <div
            key={f.id}
            className="flex items-start justify-between gap-3 p-3 hover:bg-muted/20"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-medium text-sm font-mono">
                  {f.numero_facture || f.id.slice(0, 8)}
                </h4>
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
                <Badge className={`text-[10px] border ${statutInfo.color}`}>
                  {statutInfo.label}
                </Badge>
                {overdue && (
                  <Badge className="text-[10px] bg-red-100 text-red-700 border-red-300">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Échue depuis {Math.abs(days!)}j
                  </Badge>
                )}
                {dueSoon && !overdue && (
                  <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                    <Clock className="h-3 w-3 mr-1" />
                    Dans {days}j
                  </Badge>
                )}
                {f.rapproche_releve_id && (
                  <Badge className="text-[10px] bg-purple-100 text-purple-700 border-purple-300">
                    <Bot className="h-3 w-3 mr-1" />
                    Rapprochée
                  </Badge>
                )}
              </div>
              <p className="text-sm mt-1 break-words">{f.tiers || "—"}</p>
              <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                <span>Émise : {formatDate(f.date_facture)}</span>
                <span>Échéance : {formatDate(f.date_echeance)}</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p
                className={`font-mono font-medium ${
                  isClient ? "text-green-700" : "text-rose-700"
                }`}
              >
                {isClient ? "+" : "-"}
                {fmt(f.montant_ttc, f.devise || "MUR")}
              </p>
              {f.devise && f.devise !== "MUR" && f.montant_mur && (
                <p className="text-[11px] text-muted-foreground font-mono">
                  ≈ {fmt(f.montant_mur, "MUR")}
                </p>
              )}
            </div>
          </div>
        )
      })}
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
    <Card className={`${cls} ${accent ? "ring-2 ring-amber-400" : ""}`}>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  )
}
