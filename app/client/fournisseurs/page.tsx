"use client"

/**
 * Page /client/fournisseurs — agent-friendly.
 *
 * Liste agrégée des fournisseurs (issus des factures de type "fournisseur").
 * Lex Banque utilise les noms de tiers pour identifier les paiements bancaires.
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
  Building2,
  Search,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  TrendingDown,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface Facture {
  id: string
  tiers: string | null
  type_facture: string | null
  montant_ttc: number
  montant_mur: number | null
  devise: string | null
  statut: string | null
  date_facture: string | null
  date_echeance: string | null
}

interface FournisseurAgrege {
  nom: string
  nb_factures: number
  total_mur: number
  impaye_mur: number
  derniere_facture: string | null
  retard: number
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

export default function ClientFournisseursPage() {
  const { societeId } = useSocieteActive()
  const [factures, setFactures] = useState<Facture[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/client/financial?societe_id=${societeId}`)
      const d = await res.json()
      const fin = d?.financial || {}
      setFactures((fin.factures || []).filter((f: any) => f.type_facture === "fournisseur"))
    } catch {}
    finally {
      setLoading(false)
    }
  }, [societeId])
  useEffect(() => {
    load()
  }, [load])

  const fournisseurs: FournisseurAgrege[] = useMemo(() => {
    const map = new Map<string, FournisseurAgrege>()
    for (const f of factures) {
      const nom = (f.tiers || "Sans nom").trim()
      const cur = map.get(nom) || {
        nom,
        nb_factures: 0,
        total_mur: 0,
        impaye_mur: 0,
        derniere_facture: null,
        retard: 0,
      }
      cur.nb_factures++
      const mur = Number(f.montant_mur) || Number(f.montant_ttc) || 0
      cur.total_mur += mur
      if (f.statut !== "paye" && f.statut !== "annule") {
        cur.impaye_mur += mur
        if (f.date_echeance && new Date(f.date_echeance) < new Date()) cur.retard++
      }
      if (!cur.derniere_facture || (f.date_facture || "") > cur.derniere_facture)
        cur.derniere_facture = f.date_facture
      map.set(nom, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.total_mur - a.total_mur)
  }, [factures])

  const filtered = useMemo(() => {
    if (!search.trim()) return fournisseurs
    const q = search.trim().toLowerCase()
    return fournisseurs.filter((f) => f.nom.toLowerCase().includes(q))
  }, [fournisseurs, search])

  const totalImpaye = fournisseurs.reduce((s, f) => s + f.impaye_mur, 0)
  const totalRetard = fournisseurs.reduce((s, f) => s + f.retard, 0)

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-7xl">
        {/* HEADER */}
        <div className="rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 via-orange-50 to-amber-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-rose-600 to-orange-600 p-3 text-white shadow-md">
                <Building2 className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-rose-900">Fournisseurs</h1>
                <p className="text-sm text-rose-700/80 mt-0.5">
                  Tiers fournisseurs · identifiés par Lex Banque dans les paiements
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
            <Loader2 className="w-8 h-8 animate-spin text-rose-600" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Fournisseurs" value={fournisseurs.length} />
              <KpiCard label="Factures" value={factures.length} />
              <KpiCard
                label="Impayé total"
                value={fmt(totalImpaye)}
                tone="amber"
                accent={totalImpaye > 0}
              />
              <KpiCard
                label="Factures en retard"
                value={totalRetard}
                tone={totalRetard > 0 ? "rose" : "green"}
              />
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-rose-600" />
                    Liste des fournisseurs ({filtered.length})
                  </CardTitle>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Rechercher…"
                      className="pl-8 h-9 w-56"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filtered.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Aucun fournisseur.
                  </p>
                ) : (
                  <div className="rounded border bg-card divide-y">
                    {filtered.map((f) => (
                      <div
                        key={f.nom}
                        className="flex items-start justify-between gap-3 p-3 hover:bg-muted/20"
                      >
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm break-words">{f.nom}</h4>
                          <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                            <span>
                              {f.nb_factures} facture{f.nb_factures > 1 ? "s" : ""}
                            </span>
                            <span>Dernière : {formatDate(f.derniere_facture)}</span>
                            {f.retard > 0 && (
                              <Badge className="text-[10px] bg-red-100 text-red-700 border-red-300">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                {f.retard} en retard
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-mono text-sm text-rose-700">
                            -{fmt(f.total_mur)}
                          </p>
                          {f.impaye_mur > 0 && (
                            <p className="text-[11px] text-amber-700 font-mono">
                              Impayé {fmt(f.impaye_mur)}
                            </p>
                          )}
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
