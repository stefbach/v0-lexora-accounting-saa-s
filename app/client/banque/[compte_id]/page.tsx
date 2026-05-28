"use client"

/**
 * Page /client/banque/[compte_id] — détail d'un compte bancaire.
 *
 * Affiche :
 *  - Header avec nom / numéro / IBAN / devise / solde actuel
 *  - Graphique 12 mois du solde mensuel (LineChart Recharts)
 *  - KPIs : nb transactions, débit total, crédit total, solde net
 *  - Tableau filtré des transactions du compte
 *  - Filtres : période + statut lettrage
 *  - Export Excel (endpoint COMPTA-EXPORTS)
 *
 * Multi-tenant : filtre par societe_id via useSocieteActive.
 */

import { useEffect, useMemo, useState, useCallback } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
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
  ArrowLeft,
  Download,
  Landmark,
  Loader2,
  TrendingUp,
  TrendingDown,
  Hash,
  Wallet,
} from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface CompteBancaire {
  id: string
  banque: string
  nom_compte: string | null
  numero_compte: string | null
  iban: string | null
  swift: string | null
  devise: string
  compte_principal: boolean
  actif: boolean
}

interface ReleveBancaire {
  id: string
  compte_bancaire_id: string
  periode: string
  date_debut: string
  date_fin: string
  solde_ouverture: number
  solde_cloture: number
  total_debits: number
  total_credits: number
  statut_rapprochement: string
  transactions_json: any[] | null
  created_at: string
}

interface FlatTx {
  date: string
  libelle: string
  debit: number
  credit: number
  devise: string
  statut: string
  tiers_detecte: string | null
  compte_comptable: string | null
  lettre: string | null
  releve_id: string
  idx: number
}

function fmt(n: number, dev = "MUR"): string {
  return (
    n.toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) +
    " " +
    dev
  )
}

function fmtDate(d: string | null): string {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleDateString("fr-FR")
  } catch {
    return d
  }
}

export default function ClientBanqueDetailPage() {
  const params = useParams<{ compte_id: string }>()
  const compteId = params?.compte_id
  const { societeId } = useSocieteActive()

  const [compte, setCompte] = useState<CompteBancaire | null>(null)
  const [releves, setReleves] = useState<ReleveBancaire[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // filtres
  const [dateDebut, setDateDebut] = useState<string>("")
  const [dateFin, setDateFin] = useState<string>("")
  const [filtreStatut, setFiltreStatut] = useState<string>("all")
  const [search, setSearch] = useState<string>("")

  const load = useCallback(async () => {
    if (!societeId || !compteId) return
    setLoading(true)
    setError(null)
    try {
      const [resComptes, resReleves] = await Promise.all([
        fetch(`/api/client/comptes-bancaires?societe_id=${societeId}`, {
          cache: "no-store",
        }),
        fetch(
          `/api/client/releves-bancaires?societe_id=${societeId}&compte_id=${compteId}`,
          { cache: "no-store" }
        ),
      ])
      if (!resComptes.ok) throw new Error("Erreur chargement comptes")
      if (!resReleves.ok) throw new Error("Erreur chargement relevés")
      const dComptes = await resComptes.json()
      const dReleves = await resReleves.json()
      const found: CompteBancaire | null =
        (dComptes.comptes || []).find((c: any) => c.id === compteId) || null
      setCompte(found)
      const list: ReleveBancaire[] = Array.isArray(dReleves.releves)
        ? dReleves.releves
        : []
      // Garde filet supplémentaire — filtre côté client au cas où l'API
      // ignore le param compte_id.
      setReleves(list.filter((r) => r.compte_bancaire_id === compteId))
    } catch (e: any) {
      setError(e?.message || "Erreur inconnue")
    } finally {
      setLoading(false)
    }
  }, [societeId, compteId])

  useEffect(() => {
    load()
  }, [load])

  // Aplatit les transactions pour ce compte
  const allTx: FlatTx[] = useMemo(() => {
    const out: FlatTx[] = []
    for (const r of releves) {
      const arr: any[] = Array.isArray(r.transactions_json)
        ? r.transactions_json
        : []
      for (let i = 0; i < arr.length; i++) {
        const tx = arr[i] || {}
        out.push({
          date: tx.date || "",
          libelle: tx.libelle || "",
          debit: Number(tx.debit) || 0,
          credit: Number(tx.credit) || 0,
          devise: tx.devise || compte?.devise || "MUR",
          statut: tx.statut || "non_identifie",
          tiers_detecte: tx.tiers_detecte || null,
          compte_comptable: tx.compte_comptable || null,
          lettre: tx.lettre || null,
          releve_id: r.id,
          idx: i,
        })
      }
    }
    // tri par date asc
    return out.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0))
  }, [releves, compte])

  // Filtrage
  const filtered = useMemo(() => {
    return allTx.filter((tx) => {
      if (dateDebut && tx.date && tx.date < dateDebut) return false
      if (dateFin && tx.date && tx.date > dateFin) return false
      if (filtreStatut !== "all") {
        if (filtreStatut === "lettre" && !tx.lettre) return false
        if (filtreStatut === "non_lettre" && tx.lettre) return false
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = (tx.libelle + " " + (tx.tiers_detecte || "")).toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [allTx, dateDebut, dateFin, filtreStatut, search])

  // KPIs
  const stats = useMemo(() => {
    let debit = 0
    let credit = 0
    for (const tx of filtered) {
      debit += tx.debit
      credit += tx.credit
    }
    return {
      nb: filtered.length,
      debit,
      credit,
      net: credit - debit,
    }
  }, [filtered])

  // Solde sur 12 mois — utilise solde_cloture des relevés
  // (groupé par periode YYYY-MM, dernier relevé du mois conservé).
  const chartData = useMemo(() => {
    const byMonth = new Map<string, number>()
    const sorted = [...releves].sort((a, b) =>
      a.date_fin > b.date_fin ? 1 : -1
    )
    for (const r of sorted) {
      const month = (r.periode || r.date_fin?.slice(0, 7) || "").slice(0, 7)
      if (!month) continue
      byMonth.set(month, Number(r.solde_cloture) || 0)
    }
    // Dernières 12 entrées (mois)
    const entries = Array.from(byMonth.entries()).sort((a, b) =>
      a[0] > b[0] ? 1 : -1
    )
    const last12 = entries.slice(-12)
    return last12.map(([month, solde]) => ({ month, solde }))
  }, [releves])

  const handleExport = () => {
    if (!societeId || !compteId) return
    window.location.href = `/api/client/releves-bancaires/export-xlsx?societe_id=${societeId}&compte_id=${compteId}`
  }

  return (
    <ClientPageShell
      breadcrumbs={[
        { label: "Espace client", href: "/client/tableau-de-bord" },
        { label: "Banque", href: "/client/banque" },
        { label: compte?.nom_compte || compte?.numero_compte || "Compte" },
      ]}
      kicker="Comptabilité"
      title={compte ? `${compte.banque} — ${compte.nom_compte || compte.numero_compte || ""}` : "Détail compte"}
      subtitle="Vue détaillée du compte bancaire et de ses transactions"
      actions={
        <div className="flex items-center gap-2">
          <Link href="/client/banque">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Retour à la liste
            </Button>
          </Link>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={!societeId || !compteId}
            className="border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Exporter Excel
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="p-3 rounded bg-red-50 text-red-700 border border-red-200 text-sm">
            {error}
          </div>
        )}

        {loading && !compte ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="animate-spin h-5 w-5 mr-2" />
            Chargement…
          </div>
        ) : !compte ? (
          <div className="p-6 text-sm text-muted-foreground border rounded-lg">
            Compte introuvable ou inaccessible.
          </div>
        ) : (
          <>
            {/* Header info compte */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-blue-600" />
                  Informations du compte
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Banque
                  </p>
                  <p className="font-medium">{compte.banque}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Numéro
                  </p>
                  <p className="font-mono text-sm">{compte.numero_compte || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    IBAN
                  </p>
                  <p className="font-mono text-xs break-all">
                    {compte.iban || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Devise
                  </p>
                  <Badge variant="outline" className="font-mono">
                    {compte.devise}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                icon={<Hash className="h-4 w-4 text-blue-600" />}
                label="Transactions"
                value={String(stats.nb)}
              />
              <KpiCard
                icon={<TrendingDown className="h-4 w-4 text-red-600" />}
                label="Débit total"
                value={fmt(stats.debit, compte.devise)}
              />
              <KpiCard
                icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
                label="Crédit total"
                value={fmt(stats.credit, compte.devise)}
              />
              <KpiCard
                icon={<Wallet className="h-4 w-4 text-amber-600" />}
                label="Solde net"
                value={fmt(stats.net, compte.devise)}
              />
            </div>

            {/* Graphique 12 mois */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Solde sur 12 mois</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Pas assez de relevés pour afficher l'historique.
                  </p>
                ) : (
                  <div style={{ width: "100%", height: 280 }}>
                    <ResponsiveContainer>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                        <XAxis dataKey="month" fontSize={11} />
                        <YAxis
                          fontSize={11}
                          tickFormatter={(v) =>
                            Number(v).toLocaleString("fr-FR", {
                              maximumFractionDigits: 0,
                            })
                          }
                        />
                        <ReTooltip
                          formatter={(v: any) => fmt(Number(v), compte.devise)}
                        />
                        <Line
                          type="monotone"
                          dataKey="solde"
                          stroke="#2563eb"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Filtres */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Filtres</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Date début
                  </label>
                  <Input
                    type="date"
                    value={dateDebut}
                    onChange={(e) => setDateDebut(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Date fin
                  </label>
                  <Input
                    type="date"
                    value={dateFin}
                    onChange={(e) => setDateFin(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Statut lettrage
                  </label>
                  <Select value={filtreStatut} onValueChange={setFiltreStatut}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      <SelectItem value="lettre">Lettré</SelectItem>
                      <SelectItem value="non_lettre">Non-lettré</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Recherche
                  </label>
                  <Input
                    placeholder="Libellé / tiers…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Transactions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Transactions du compte ({filtered.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filtered.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Aucune transaction pour ces filtres.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="text-left p-2 font-medium">Date</th>
                          <th className="text-left p-2 font-medium">Libellé</th>
                          <th className="text-left p-2 font-medium">Tiers</th>
                          <th className="text-right p-2 font-medium">Débit</th>
                          <th className="text-right p-2 font-medium">Crédit</th>
                          <th className="text-center p-2 font-medium">Lettre</th>
                          <th className="text-center p-2 font-medium">Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0, 500).map((tx, i) => (
                          <tr
                            key={`${tx.releve_id}-${tx.idx}-${i}`}
                            className="border-t hover:bg-muted/20"
                          >
                            <td className="p-2 whitespace-nowrap">
                              {fmtDate(tx.date)}
                            </td>
                            <td className="p-2 max-w-xs truncate" title={tx.libelle}>
                              {tx.libelle}
                            </td>
                            <td className="p-2 text-muted-foreground">
                              {tx.tiers_detecte || "—"}
                            </td>
                            <td className="p-2 text-right font-mono text-red-700">
                              {tx.debit > 0 ? fmt(tx.debit, tx.devise) : ""}
                            </td>
                            <td className="p-2 text-right font-mono text-emerald-700">
                              {tx.credit > 0 ? fmt(tx.credit, tx.devise) : ""}
                            </td>
                            <td className="p-2 text-center font-mono">
                              {tx.lettre || "—"}
                            </td>
                            <td className="p-2 text-center">
                              <Badge
                                variant="outline"
                                className="text-[10px]"
                              >
                                {tx.statut}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filtered.length > 500 && (
                      <p className="text-[11px] text-muted-foreground p-2 text-center">
                        Affichage limité à 500 lignes — utiliser l'export Excel
                        pour la liste complète.
                      </p>
                    )}
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
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </div>
        <div className="text-lg font-semibold font-mono">{value}</div>
      </CardContent>
    </Card>
  )
}
