"use client"

/**
 * Page /client/echeances — agent-friendly.
 *
 * Liste des échéances à venir et en retard (factures non payées).
 * Lex Banque va automatiquement rapprocher les paiements à venir.
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Loader2,
  RefreshCw,
  Calendar,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  Clock,
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

export default function ClientEcheancesPage() {
  const { societeId } = useSocieteActive()
  const [factures, setFactures] = useState<Facture[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"retard" | "semaine" | "mois" | "tout">(
    "retard"
  )

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/client/factures?societe_id=${societeId}`)
      const d = await res.json()
      setFactures(d?.factures || d?.data || [])
    } catch {}
    finally {
      setLoading(false)
    }
  }, [societeId])
  useEffect(() => {
    load()
  }, [load])

  const impayees = useMemo(
    () => factures.filter((f) => f.statut !== "paye" && f.statut !== "annule"),
    [factures]
  )
  const enRetard = useMemo(
    () =>
      impayees.filter((f) => {
        const d = daysUntil(f.date_echeance)
        return d !== null && d < 0
      }),
    [impayees]
  )
  const dansSemaine = useMemo(
    () =>
      impayees.filter((f) => {
        const d = daysUntil(f.date_echeance)
        return d !== null && d >= 0 && d <= 7
      }),
    [impayees]
  )
  const dansMois = useMemo(
    () =>
      impayees.filter((f) => {
        const d = daysUntil(f.date_echeance)
        return d !== null && d > 7 && d <= 30
      }),
    [impayees]
  )

  const list =
    activeTab === "retard"
      ? enRetard
      : activeTab === "semaine"
        ? dansSemaine
        : activeTab === "mois"
          ? dansMois
          : impayees

  const sorted = list.slice().sort((a, b) =>
    (a.date_echeance || "").localeCompare(b.date_echeance || "")
  )

  const totalRetard = enRetard.reduce(
    (s, f) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0),
    0
  )
  const totalSemaine = dansSemaine.reduce(
    (s, f) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0),
    0
  )
  const totalMois = dansMois.reduce(
    (s, f) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0),
    0
  )

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-7xl">
        {/* HEADER */}
        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 p-3 text-white shadow-md">
                <Calendar className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-amber-900">Échéances</h1>
                <p className="text-sm text-amber-700/80 mt-0.5">
                  Factures impayées · à payer ou à encaisser
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={load} disabled={loading || !societeId} size="sm">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Actualiser
              </Button>
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
            <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                label="En retard"
                value={enRetard.length}
                tone={enRetard.length > 0 ? "rose" : "green"}
                accent={enRetard.length > 0}
              />
              <KpiCard label="Montant en retard" value={fmt(totalRetard)} tone="rose" />
              <KpiCard label="Cette semaine" value={`${dansSemaine.length} · ${fmt(totalSemaine)}`} tone="amber" />
              <KpiCard label="Ce mois-ci" value={`${dansMois.length} · ${fmt(totalMois)}`} tone="blue" />
            </div>

            <Card>
              <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
                <TabsList className="px-4 pt-2 bg-transparent border-b rounded-none w-full justify-start gap-1 h-auto">
                  <TabsTrigger value="retard" className="px-3 py-2">
                    <AlertTriangle className="h-4 w-4 mr-1.5 text-rose-600" />
                    En retard ({enRetard.length})
                  </TabsTrigger>
                  <TabsTrigger value="semaine" className="px-3 py-2">
                    <Clock className="h-4 w-4 mr-1.5 text-amber-600" />
                    Sous 7j ({dansSemaine.length})
                  </TabsTrigger>
                  <TabsTrigger value="mois" className="px-3 py-2">
                    <Calendar className="h-4 w-4 mr-1.5 text-blue-600" />
                    Sous 30j ({dansMois.length})
                  </TabsTrigger>
                  <TabsTrigger value="tout" className="px-3 py-2">
                    Toutes ({impayees.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="retard" className="mt-0 p-0">
                  <FactureList factures={sorted} />
                </TabsContent>
                <TabsContent value="semaine" className="mt-0 p-0">
                  <FactureList factures={sorted} />
                </TabsContent>
                <TabsContent value="mois" className="mt-0 p-0">
                  <FactureList factures={sorted} />
                </TabsContent>
                <TabsContent value="tout" className="mt-0 p-0">
                  <FactureList factures={sorted} />
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
        Aucune échéance pour ce filtre.
      </p>
    )
  }
  return (
    <div className="divide-y">
      {factures.map((f) => {
        const days = daysUntil(f.date_echeance)
        const overdue = days !== null && days < 0
        const isClient = f.type_facture === "client"
        return (
          <div key={f.id} className="flex items-start justify-between gap-3 p-3 hover:bg-muted/20">
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
                  {isClient ? (
                    <TrendingUp className="h-3 w-3 mr-0.5" />
                  ) : (
                    <TrendingDown className="h-3 w-3 mr-0.5" />
                  )}
                  {isClient ? "Client" : "Fournisseur"}
                </Badge>
                {overdue ? (
                  <Badge className="text-[10px] bg-red-100 text-red-700 border-red-300">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Échue depuis {Math.abs(days!)}j
                  </Badge>
                ) : days !== null ? (
                  <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                    <Clock className="h-3 w-3 mr-1" />
                    Dans {days}j
                  </Badge>
                ) : null}
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
