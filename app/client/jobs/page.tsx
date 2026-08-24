"use client"

/**
 * Page /client/jobs — Job Costing (Module D).
 *
 * Tableau de bord de rentabilité des jobs/mandats facturables : coûts cumulés
 * (main d'œuvre + dépenses), montant facturable, marge par job. Au-delà de la
 * liste, la page fournit désormais des KPI de pilotage, des graphiques recharts
 * (marge par job, budget vs réel, répartition par type de facturation, top
 * marges), un bloc d'alertes (marge négative, dépassement, terminés non
 * facturés) et une analyse IA à la demande.
 *
 * Refonte de PRÉSENTATION + intelligence : la logique métier (fetch liste,
 * création de job) et les calculs de rentabilité (lib/jobcosting/couts) sont
 * conservés. Le détail (temps, dépenses, consommation, facturation) reste sur
 * /client/jobs/[id].
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Briefcase,
  Wallet,
  TrendingUp,
  Percent,
  ReceiptText,
  AlertTriangle,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import {
  KpiCard,
  KpiGrid,
  SectionCard,
  ChartCard,
  OpsEmpty,
  OpsSkeleton,
  AlertsPanel,
  OperationsInsights,
  formatMUR,
  formatNumber,
  formatPct,
  signedClass,
  type AlertItem,
} from "@/components/operations"
import { rentabiliteJob } from "@/lib/jobcosting/couts"
import { sumMoney } from "@/lib/money"
import {
  LIBELLES_STATUT_JOB,
  type StatutJob,
  type TypeFacturation,
} from "@/lib/jobcosting/types"

interface JobRow {
  id: string
  code: string
  libelle: string
  client_nom: string | null
  statut: StatutJob
  type_facturation: TypeFacturation
  budget_heures: number | null
  budget_montant: number | null
  cout_temps_reel: number
  cout_depenses_reel: number
  montant_facturable: number
  montant_facture: number | null
}

const NAVY = "#0B0F2E"
const GOLD = "#A88925"
const TEAL = "#0F766E"
const ROUGE = "#9F1239"

const LIBELLES_TYPE_FACTURATION: Record<TypeFacturation, string> = {
  temps_materiel: "Temps & matériel",
  forfait: "Forfait",
  abonnement: "Abonnement",
}

/** Couleur d'accent par type de facturation (donut + légende). */
const COULEUR_TYPE: Record<TypeFacturation, string> = {
  temps_materiel: NAVY,
  forfait: GOLD,
  abonnement: "#2A6FCC",
}

function StatutBadge({ statut }: { statut: StatutJob }) {
  const variant: Record<StatutJob, string> = {
    ouvert: "bg-blue-50 text-blue-700 border-blue-200",
    en_cours: "bg-indigo-50 text-indigo-700 border-indigo-200",
    en_pause: "bg-amber-50 text-amber-700 border-amber-200",
    cloture: "bg-slate-100 text-slate-700 border-slate-200",
    facture: "bg-emerald-50 text-emerald-700 border-emerald-200",
    annule: "bg-red-50 text-red-700 border-red-200",
  }
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${variant[statut]}`}>
      {LIBELLES_STATUT_JOB[statut]}
    </span>
  )
}

/**
 * Rentabilité d'affichage d'un job (réutilise le moteur lib/jobcosting/couts,
 * jamais de flottant natif sur les montants monétaires).
 */
function margeInfo(j: JobRow) {
  const r = rentabiliteJob({
    cout_temps_reel: j.cout_temps_reel,
    cout_depenses_reel: j.cout_depenses_reel,
    montant_facturable: j.montant_facturable,
    montant_facture: j.montant_facture,
    budget_montant: j.budget_montant,
  })
  // Avancement budget = coût de revient / budget montant (borné à l'affichage).
  const budget = Number(j.budget_montant) || 0
  const avancementPct = budget > 0 ? (r.cout_revient / budget) * 100 : null
  return {
    cout: r.cout_revient,
    produit: r.produit,
    marge: r.marge,
    pct: r.marge_pct,
    depassement: r.depassement_budget,
    avancementPct,
    facture: j.montant_facture != null,
  }
}

export default function JobsPage() {
  const { societeId } = useSocieteActive()
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [search, setSearch] = useState("")
  const [statutFiltre, setStatutFiltre] = useState<string>("tous")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [fCode, setFCode] = useState("")
  const [fLibelle, setFLibelle] = useState("")
  const [fClient, setFClient] = useState("")
  const [fType, setFType] = useState<TypeFacturation>("temps_materiel")
  const [fBudgetHeures, setFBudgetHeures] = useState("")
  const [fBudgetMontant, setFBudgetMontant] = useState("")

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/client/jobs?societe_id=${societeId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      setJobs(data.items || [])
    } catch (e: any) {
      showToast(e?.message || "Erreur de chargement", "error")
    } finally {
      setLoading(false)
    }
  }, [societeId])

  useEffect(() => {
    load()
  }, [load])

  const jobsFiltres = useMemo(() => {
    const q = search.trim().toLowerCase()
    return jobs.filter((j) => {
      if (statutFiltre !== "tous" && j.statut !== statutFiltre) return false
      if (!q) return true
      return (
        j.code.toLowerCase().includes(q) ||
        j.libelle.toLowerCase().includes(q) ||
        (j.client_nom || "").toLowerCase().includes(q)
      )
    })
  }, [jobs, search, statutFiltre])

  /* ── Analytics globaux (sur la sélection filtrée) ─────────────────── */
  const analytics = useMemo(() => {
    const enriched = jobsFiltres.map((j) => ({ job: j, m: margeInfo(j) }))

    const cout = sumMoney(enriched.map((e) => e.m.cout))
    const produit = sumMoney(enriched.map((e) => e.m.produit))
    const marge = sumMoney(enriched.map((e) => e.m.marge))
    const margePct = produit > 0 ? (marge / produit) * 100 : null

    // Taux de facturation : facturé / facturable (avancement de la facturation).
    const totalFacturable = sumMoney(enriched.map((e) => Number(e.job.montant_facturable) || 0))
    const totalFacture = sumMoney(
      enriched.map((e) => (e.job.montant_facture != null ? Number(e.job.montant_facture) : 0)),
    )
    const tauxFacturation = totalFacturable > 0 ? (totalFacture / totalFacturable) * 100 : null

    const nbDepassement = enriched.filter((e) => e.m.depassement).length
    const nbMargeNeg = enriched.filter((e) => e.m.marge < 0).length
    const nbTermineNonFacture = enriched.filter(
      (e) => e.job.statut === "cloture" && e.job.montant_facture == null,
    ).length

    // Marge par job (top 8 par |produit|), barres colorées par signe de marge.
    const margeParJob = [...enriched]
      .sort((a, b) => Math.abs(b.m.produit) - Math.abs(a.m.produit))
      .slice(0, 8)
      .map((e) => ({
        code: e.job.code,
        libelle: e.job.libelle,
        marge: e.m.marge,
        positif: e.m.marge >= 0,
      }))

    // Budget vs coût réel (jobs avec un budget montant renseigné, top 6).
    const budgetVsReel = enriched
      .filter((e) => (Number(e.job.budget_montant) || 0) > 0)
      .sort((a, b) => (Number(b.job.budget_montant) || 0) - (Number(a.job.budget_montant) || 0))
      .slice(0, 6)
      .map((e) => ({
        code: e.job.code,
        budget: Number(e.job.budget_montant) || 0,
        reel: e.m.cout,
      }))

    // Répartition par type de facturation (donut, par produit).
    const parTypeMap = new Map<TypeFacturation, number[]>()
    for (const e of enriched) {
      const arr = parTypeMap.get(e.job.type_facturation) ?? []
      arr.push(e.m.produit)
      parTypeMap.set(e.job.type_facturation, arr)
    }
    const parType = (Object.keys(LIBELLES_TYPE_FACTURATION) as TypeFacturation[])
      .map((t) => ({
        type: t,
        name: LIBELLES_TYPE_FACTURATION[t],
        value: sumMoney(parTypeMap.get(t) ?? []),
        count: (parTypeMap.get(t) ?? []).length,
      }))
      .filter((d) => d.count > 0)

    // Top jobs par marge (desc), pour le classement.
    const topMarge = [...enriched]
      .filter((e) => e.m.produit > 0 || e.m.marge !== 0)
      .sort((a, b) => b.m.marge - a.m.marge)
      .slice(0, 5)
      .map((e) => ({ job: e.job, m: e.m }))

    return {
      cout,
      produit,
      marge,
      margePct,
      tauxFacturation,
      totalFacture,
      totalFacturable,
      nbDepassement,
      nbMargeNeg,
      nbTermineNonFacture,
      margeParJob,
      budgetVsReel,
      parType,
      topMarge,
      enriched,
    }
  }, [jobsFiltres])

  /* ── Alertes (triées par sévérité dans AlertsPanel) ───────────────── */
  const alertes = useMemo<AlertItem[]>(() => {
    const items: AlertItem[] = []
    for (const { job, m } of analytics.enriched) {
      if (m.marge < 0) {
        items.push({
          severity: "danger",
          title: `Marge négative — ${job.code}`,
          detail: `${job.libelle} : coût de revient ${formatMUR(m.cout)} pour un produit de ${formatMUR(
            m.produit,
          )} (marge ${formatMUR(m.marge)}).`,
          recommendation:
            "Revoir le périmètre facturable, le taux horaire ou renégocier le forfait avant clôture.",
          href: `/client/jobs/${job.id}`,
          cta: "Ouvrir le job",
        })
      } else if (m.depassement) {
        items.push({
          severity: "warning",
          title: `Dépassement de budget — ${job.code}`,
          detail: `Coût de revient ${formatMUR(m.cout)} au-delà du budget ${formatMUR(
            job.budget_montant,
          )}${m.avancementPct != null ? ` (${formatPct(m.avancementPct)} du budget)` : ""}.`,
          recommendation: "Contenir les imputations restantes ou ajuster le budget avec le client.",
          href: `/client/jobs/${job.id}`,
          cta: "Ouvrir le job",
        })
      }
      if (job.statut === "cloture" && job.montant_facture == null) {
        items.push({
          severity: "warning",
          title: `Job clôturé non facturé — ${job.code}`,
          detail: `${job.libelle} est clôturé mais aucun montant n'a été facturé (${formatMUR(
            job.montant_facturable,
          )} facturables).`,
          recommendation: "Lancer la facturation pour figer la marge et éviter le travail en cours dormant.",
          href: `/client/jobs/${job.id}`,
          cta: "Facturer le job",
        })
      }
    }
    return items
  }, [analytics.enriched])

  const insightsPayload = useMemo(
    () => ({
      nb_jobs: jobsFiltres.length,
      cout_revient_cumule: analytics.cout,
      produit_cumule: analytics.produit,
      marge_cumulee: analytics.marge,
      marge_pct: analytics.margePct,
      total_facturable: analytics.totalFacturable,
      total_facture: analytics.totalFacture,
      taux_facturation_pct: analytics.tauxFacturation,
      nb_jobs_marge_negative: analytics.nbMargeNeg,
      nb_jobs_depassement_budget: analytics.nbDepassement,
      nb_jobs_termines_non_factures: analytics.nbTermineNonFacture,
      repartition_type_facturation: analytics.parType.map((t) => ({
        type: t.type,
        nb: t.count,
        produit: t.value,
      })),
      top_jobs_marge: analytics.topMarge.map((e) => ({
        code: e.job.code,
        marge: e.m.marge,
        marge_pct: e.m.pct,
      })),
    }),
    [jobsFiltres.length, analytics],
  )

  const resetForm = () => {
    setFCode("")
    setFLibelle("")
    setFClient("")
    setFType("temps_materiel")
    setFBudgetHeures("")
    setFBudgetMontant("")
  }

  const submitJob = async () => {
    if (!societeId) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/client/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          code: fCode,
          libelle: fLibelle,
          client_nom: fClient || null,
          type_facturation: fType,
          budget_heures: fBudgetHeures || null,
          budget_montant: fBudgetMontant || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`Job ${data.item.code} créé`)
      setDialogOpen(false)
      resetForm()
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const aucunJob = jobs.length === 0

  return (
    <ClientPageShell
      breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Jobs" }]}
      kicker="Contrôle de gestion"
      title="Jobs & rentabilité"
      subtitle="Projets/mandats facturables : coût de revient (temps + matières), montant facturable, marge par job et pilotage des dépassements."
      disableParticles
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} aria-label="Rafraîchir">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nouveau job
          </Button>
        </div>
      }
    >
      {toast && (
        <div
          role="status"
          className={`mb-4 rounded-md px-4 py-2 text-sm ${
            toast.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {loading ? (
        <OpsSkeleton kpis={6} chart rows={4} />
      ) : aucunJob ? (
        <SectionCard
          title="Jobs & rentabilité"
          subtitle="Suivi analytique des mandats facturables"
        >
          <OpsEmpty
            icon={Briefcase}
            title="Aucun job pour l'instant"
            description="Créez votre premier mandat facturable pour suivre son coût de revient (temps + dépenses), sa marge et son avancement budgétaire."
            action={
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Créer un job
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <div className="space-y-6">
          {/* ── KPIs de pilotage ─────────────────────────────────────── */}
          <KpiGrid cols={6}>
            <KpiCard
              label="Coût de revient cumulé"
              value={formatMUR(analytics.cout)}
              icon={Wallet}
              color={NAVY}
              hint={`${formatNumber(jobsFiltres.length)} job${jobsFiltres.length > 1 ? "s" : ""}`}
            />
            <KpiCard
              label="Facturable / facturé"
              value={formatMUR(analytics.produit)}
              icon={ReceiptText}
              color={GOLD}
            />
            <KpiCard
              label="Marge cumulée"
              value={formatMUR(analytics.marge)}
              icon={TrendingUp}
              color={analytics.marge < 0 ? ROUGE : TEAL}
            />
            <KpiCard
              label="Taux de marge"
              value={formatPct(analytics.margePct)}
              icon={Percent}
              color={analytics.margePct != null && analytics.margePct < 0 ? ROUGE : TEAL}
            />
            <KpiCard
              label="Taux de facturation"
              value={formatPct(analytics.tauxFacturation)}
              icon={ReceiptText}
              color={NAVY}
              hint={`${formatMUR(analytics.totalFacture)} facturés`}
            />
            <KpiCard
              label="Jobs en dépassement"
              value={formatNumber(analytics.nbDepassement)}
              icon={AlertTriangle}
              color={analytics.nbDepassement > 0 ? ROUGE : TEAL}
              hint={
                analytics.nbMargeNeg > 0
                  ? `${formatNumber(analytics.nbMargeNeg)} à marge négative`
                  : undefined
              }
            />
          </KpiGrid>

          {/* ── Graphiques ───────────────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Marge par job"
              subtitle="Top jobs par volume — vert positif, rouge négatif"
              height={280}
            >
              {analytics.margeParJob.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <OpsEmpty icon={TrendingUp} title="Pas encore de marge à afficher" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={analytics.margeParJob}
                    layout="vertical"
                    margin={{ top: 5, right: 16, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef1f5" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                      type="category"
                      dataKey="code"
                      tick={{ fontSize: 11 }}
                      width={90}
                    />
                    <Tooltip
                      formatter={(v: number) => [formatMUR(v), "Marge"]}
                      labelFormatter={(_, p) => (p?.[0]?.payload?.libelle as string) || ""}
                    />
                    <Bar dataKey="marge" radius={[0, 3, 3, 0]}>
                      {analytics.margeParJob.map((d, i) => (
                        <Cell key={i} fill={d.positif ? TEAL : ROUGE} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Répartition par type de facturation"
              subtitle="Produit (facturable/facturé) par mode"
              height={280}
            >
              {analytics.parType.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <OpsEmpty icon={Briefcase} title="Aucune donnée" />
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="80%">
                    <PieChart>
                      <Pie
                        data={analytics.parType}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={54}
                        outerRadius={90}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {analytics.parType.map((d) => (
                          <Cell key={d.type} fill={COULEUR_TYPE[d.type]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number, n) => [formatMUR(v), n as string]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1">
                    {analytics.parType.map((d) => (
                      <div key={d.type} className="flex items-center gap-1.5 text-xs text-gray-600">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-sm"
                          style={{ backgroundColor: COULEUR_TYPE[d.type] }}
                          aria-hidden="true"
                        />
                        {d.name} · <span className="font-medium">{formatNumber(d.count)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </ChartCard>
          </div>

          {/* ── Budget vs réel + Top marges ──────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Budget vs coût réel"
              subtitle="Jobs avec budget montant renseigné"
              height={280}
            >
              {analytics.budgetVsReel.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <OpsEmpty
                    icon={Wallet}
                    title="Aucun budget renseigné"
                    description="Renseignez un budget montant à la création d'un job pour suivre l'écart au réel."
                  />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.budgetVsReel} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f5" />
                    <XAxis dataKey="code" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: number, n) => [
                        formatMUR(v),
                        n === "budget" ? "Budget" : "Coût réel",
                      ]}
                    />
                    <Bar dataKey="budget" name="budget" fill={GOLD} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="reel" name="reel" fill={NAVY} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <SectionCard
              title="Top jobs par marge"
              subtitle="Classement des marges les plus élevées"
              contentClassName="pt-0"
            >
              {analytics.topMarge.length === 0 ? (
                <OpsEmpty icon={TrendingUp} title="Aucune marge à classer" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job</TableHead>
                        <TableHead className="text-right">Marge</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.topMarge.map(({ job, m }) => (
                        <TableRow key={job.id}>
                          <TableCell>
                            <Link
                              href={`/client/jobs/${job.id}`}
                              className="font-medium text-[#0B0F2E] hover:text-[#A88925] hover:underline"
                            >
                              {job.code}
                            </Link>
                            <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                              {job.libelle}
                            </div>
                          </TableCell>
                          <TableCell className={`text-right font-medium tabular-nums ${signedClass(m.marge)}`}>
                            {formatMUR(m.marge)}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums ${signedClass(m.pct)}`}>
                            {formatPct(m.pct)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </SectionCard>
          </div>

          {/* ── Alertes ──────────────────────────────────────────────── */}
          {alertes.length > 0 && (
            <SectionCard
              title={
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Alertes de rentabilité
                </span>
              }
              subtitle="Jobs à marge négative, dépassements et clôturés non facturés"
            >
              <AlertsPanel items={alertes} />
            </SectionCard>
          )}

          {/* ── Liste des jobs ───────────────────────────────────────── */}
          <SectionCard
            title="Tous les jobs"
            subtitle="Coût de revient, marge et avancement budgétaire"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8 w-52"
                    placeholder="Rechercher un job…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Rechercher un job"
                  />
                </div>
                <Select value={statutFiltre} onValueChange={setStatutFiltre}>
                  <SelectTrigger className="w-40" aria-label="Filtrer par statut">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tous">Tous les statuts</SelectItem>
                    {(Object.keys(LIBELLES_STATUT_JOB) as StatutJob[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {LIBELLES_STATUT_JOB[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            }
            contentClassName="pt-0"
          >
            {jobsFiltres.length === 0 ? (
              <OpsEmpty
                icon={Search}
                title="Aucun job ne correspond"
                description="Ajustez la recherche ou le filtre de statut."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Libellé</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Coût revient</TableHead>
                      <TableHead className="text-right">Facturable</TableHead>
                      <TableHead className="text-right">Marge</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="min-w-[140px]">Avancement budget</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobsFiltres.map((j) => {
                      const m = margeInfo(j)
                      return (
                        <TableRow key={j.id} className="hover:bg-muted/40">
                          <TableCell className="font-mono text-xs">
                            <Link
                              href={`/client/jobs/${j.id}`}
                              className="text-[#0B0F2E] font-semibold hover:text-[#A88925] hover:underline"
                            >
                              {j.code}
                            </Link>
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate">{j.libelle}</TableCell>
                          <TableCell className="text-muted-foreground">{j.client_nom || "—"}</TableCell>
                          <TableCell>
                            <StatutBadge statut={j.statut} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatMUR(m.cout)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMUR(m.produit)}</TableCell>
                          <TableCell className={`text-right tabular-nums font-medium ${signedClass(m.marge)}`}>
                            {formatMUR(m.marge)}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums ${signedClass(m.pct)}`}>
                            {formatPct(m.pct)}
                          </TableCell>
                          <TableCell>
                            {m.avancementPct == null ? (
                              <span className="text-xs text-muted-foreground">Pas de budget</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"
                                  role="progressbar"
                                  aria-valuenow={Math.round(m.avancementPct)}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-label="Avancement du budget"
                                >
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${Math.min(100, m.avancementPct)}%`,
                                      backgroundColor: m.depassement ? ROUGE : TEAL,
                                    }}
                                  />
                                </div>
                                <span
                                  className={`text-xs tabular-nums ${
                                    m.depassement ? "text-[#9F1239] font-medium" : "text-muted-foreground"
                                  }`}
                                >
                                  {formatPct(m.avancementPct, 0)}
                                </span>
                                {m.depassement && (
                                  <span className="rounded bg-[#9F1239]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#9F1239]">
                                    Dépassement
                                  </span>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>

          {/* ── Analyse IA ───────────────────────────────────────────── */}
          <SectionCard contentClassName="pt-4">
            <OperationsInsights module="jobs" societeId={societeId} payload={insightsPayload} />
          </SectionCard>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau job</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Code</Label>
                <Input value={fCode} onChange={(e) => setFCode(e.target.value)} placeholder="JOB-2026-014" />
              </div>
              <div>
                <Label>Type de facturation</Label>
                <Select value={fType} onValueChange={(v) => setFType(v as TypeFacturation)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="temps_materiel">Temps & matériel</SelectItem>
                    <SelectItem value="forfait">Forfait</SelectItem>
                    <SelectItem value="abonnement">Abonnement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Libellé</Label>
              <Input value={fLibelle} onChange={(e) => setFLibelle(e.target.value)} placeholder="Audit annuel ACME Ltd" />
            </div>
            <div>
              <Label>Client (libre si pas de dossier)</Label>
              <Input value={fClient} onChange={(e) => setFClient(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Budget heures</Label>
                <Input type="number" value={fBudgetHeures} onChange={(e) => setFBudgetHeures(e.target.value)} />
              </div>
              <div>
                <Label>Budget montant (MUR)</Label>
                <Input type="number" value={fBudgetMontant} onChange={(e) => setFBudgetMontant(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submitJob} disabled={submitting || !fCode || !fLibelle}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPageShell>
  )
}
