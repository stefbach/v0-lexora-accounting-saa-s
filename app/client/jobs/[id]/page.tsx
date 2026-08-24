"use client"

/**
 * Page /client/jobs/[id] — Fiche job (Job Costing, Module D).
 *
 * Refonte "tableau de bord" : hero rentabilité (coût de revient vs facturable
 * vs facturé, marge % en évidence, avancement budget en barres), composition du
 * coût de revient (donut MO/dépenses), onglets Temps/Dépenses modernisés,
 * timeline des imputations et action « Facturer » mise en valeur.
 *
 * Toute la logique métier est PRÉSERVÉE : saisie de temps (au coût horaire figé
 * §2.5, override possible), validation, suppression, dépenses, consommation de
 * stock (CUMP + écriture D 6037 / C 3701) et facturation (gel du montant).
 *
 * Composant client (useParams) — pas de params Promise à awaiter ici.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  RefreshCw,
  Clock,
  Receipt,
  Package,
  FileCheck2,
  Trash2,
  ArrowLeft,
  Wallet,
  TrendingUp,
  Percent,
} from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import {
  KpiCard,
  KpiGrid,
  SectionCard,
  OpsEmpty,
  OpsSkeleton,
  formatMUR,
  formatNumber,
  formatPct,
  signedClass,
} from "@/components/operations"
import {
  LIBELLES_STATUT_JOB,
  LIBELLES_TYPE_DEPENSE,
  type StatutJob,
  type StatutValidation,
  type TypeDepense,
} from "@/lib/jobcosting/types"

function fmtMoney(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " MUR"
}

const NAVY = "#0B0F2E"
const GOLD = "#A88925"
const TEAL = "#0F766E"
const ROUGE = "#9F1239"

interface Rentabilite {
  cout_revient: number
  produit: number
  marge: number
  marge_pct: number | null
  ecart_budget: number | null
  avancement_heures_pct: number | null
  depassement_budget: boolean
}

interface TempsRow {
  id: string
  date_prestation: string
  heures: number
  cout_horaire_charge: number
  cout_total: number
  taux_horaire_facture: number | null
  facturable: boolean
  statut_validation: StatutValidation
  tache: string | null
  employes?: { nom: string; prenom: string; code: string } | null
}

interface DepenseRow {
  id: string
  type_depense: TypeDepense
  description: string | null
  montant_ht: number
  facturable: boolean
  marge_refacturation_pct: number
  mouvement_stock_id: string | null
  date_depense: string
}

interface JobDetail {
  id: string
  code: string
  libelle: string
  client_nom: string | null
  statut: StatutJob
  budget_heures: number | null
  budget_montant: number | null
  cout_temps_reel: number
  cout_depenses_reel: number
  montant_facturable: number
  montant_facture: number | null
}

interface CoutHoraire {
  employe_id: string
  cout_horaire_charge: number
  employes?: { nom: string; prenom: string; code: string } | null
}

interface ProduitOpt {
  id: string
  sku: string
  designation: string
  cout_unitaire_moyen: number
}

const STATUT_VALIDATION_LABEL: Record<StatutValidation, string> = {
  brouillon: "Brouillon",
  soumis: "Soumis",
  valide: "Validé",
  rejete: "Rejeté",
  facture: "Facturé",
}

const STATUT_VALIDATION_STYLE: Record<StatutValidation, string> = {
  brouillon: "bg-slate-100 text-slate-700 border-slate-200",
  soumis: "bg-amber-50 text-amber-700 border-amber-200",
  valide: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejete: "bg-red-50 text-red-700 border-red-200",
  facture: "bg-indigo-50 text-indigo-700 border-indigo-200",
}

const STATUT_JOB_STYLE: Record<StatutJob, string> = {
  ouvert: "bg-blue-50 text-blue-700 border-blue-200",
  en_cours: "bg-indigo-50 text-indigo-700 border-indigo-200",
  en_pause: "bg-amber-50 text-amber-700 border-amber-200",
  cloture: "bg-slate-100 text-slate-700 border-slate-200",
  facture: "bg-emerald-50 text-emerald-700 border-emerald-200",
  annule: "bg-red-50 text-red-700 border-red-200",
}

function nomEmploye(e?: { nom: string; prenom: string } | null): string {
  return e ? `${e.prenom} ${e.nom}` : "—"
}

/** Barre d'avancement colorée (label + valeur/max + pourcentage). */
function BudgetBar({
  label,
  pct,
  danger,
  right,
}: {
  label: string
  pct: number | null
  danger?: boolean
  right?: string
}) {
  const color = danger ? ROUGE : TEAL
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className={`tabular-nums font-medium ${danger ? "text-[#9F1239]" : "text-gray-700"}`}>
          {right ?? (pct == null ? "—" : formatPct(pct, 0))}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={pct == null ? undefined : Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

export default function JobDetailPage() {
  const params = useParams()
  const jobId = String(params?.id || "")
  const { societeId } = useSocieteActive()

  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const [job, setJob] = useState<JobDetail | null>(null)
  const [temps, setTemps] = useState<TempsRow[]>([])
  const [depenses, setDepenses] = useState<DepenseRow[]>([])
  const [rentabilite, setRentabilite] = useState<Rentabilite | null>(null)
  const [heuresImputees, setHeuresImputees] = useState(0)
  const [coutsHoraires, setCoutsHoraires] = useState<CoutHoraire[]>([])
  const [produits, setProduits] = useState<ProduitOpt[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Saisie de temps
  const [tDialog, setTDialog] = useState(false)
  const [tEmploye, setTEmploye] = useState("")
  const [tDate, setTDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [tHeures, setTHeures] = useState("")
  const [tTaux, setTTaux] = useState("")
  const [tCoutManuel, setTCoutManuel] = useState("")
  const [tFacturable, setTFacturable] = useState(true)
  const [tTache, setTTache] = useState("")

  // Dépense
  const [dDialog, setDDialog] = useState(false)
  const [dType, setDType] = useState<TypeDepense>("sous_traitance")
  const [dMontant, setDMontant] = useState("")
  const [dDesc, setDDesc] = useState("")
  const [dMarge, setDMarge] = useState("0")
  const [dFacturable, setDFacturable] = useState(true)

  // Consommation stock
  const [cDialog, setCDialog] = useState(false)
  const [cProduit, setCProduit] = useState("")
  const [cQuantite, setCQuantite] = useState("")
  const [cMarge, setCMarge] = useState("0")
  const [cFacturable, setCFacturable] = useState(true)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }

  const load = useCallback(async () => {
    if (!societeId || !jobId) return
    setLoading(true)
    try {
      const [jRes, cRes, pRes] = await Promise.all([
        fetch(`/api/client/jobs/${jobId}`),
        fetch(`/api/client/jobs/couts-horaires?societe_id=${societeId}`),
        fetch(`/api/client/inventaire/produits?societe_id=${societeId}`),
      ])
      const [jData, cData, pData] = await Promise.all([jRes.json(), cRes.json(), pRes.json()])
      if (!jRes.ok) throw new Error(jData.error || "Erreur job")
      setJob(jData.item)
      setTemps(jData.temps || [])
      setDepenses(jData.depenses || [])
      setRentabilite(jData.rentabilite || null)
      setHeuresImputees(jData.heures_imputees || 0)
      // Snapshots de coût horaire : dernier par employé
      const map = new Map<string, CoutHoraire>()
      for (const c of cData.items || []) if (!map.has(c.employe_id)) map.set(c.employe_id, c)
      setCoutsHoraires(Array.from(map.values()))
      setProduits(pData.items || [])
    } catch (e: any) {
      showToast(e?.message || "Erreur de chargement", "error")
    } finally {
      setLoading(false)
    }
  }, [societeId, jobId])

  useEffect(() => {
    load()
  }, [load])

  const employeSelectionne = useMemo(
    () => coutsHoraires.find((c) => c.employe_id === tEmploye),
    [coutsHoraires, tEmploye],
  )

  // Composition du coût de revient (MO vs dépenses) pour le donut.
  const compositionCout = useMemo(() => {
    const mo = Number(job?.cout_temps_reel) || 0
    const dep = Number(job?.cout_depenses_reel) || 0
    return [
      { name: "Main d'œuvre", value: mo, color: NAVY },
      { name: "Dépenses & matières", value: dep, color: GOLD },
    ].filter((d) => d.value > 0)
  }, [job])

  // Avancement du budget montant = coût de revient / budget montant.
  const avancementMontantPct = useMemo(() => {
    const budget = Number(job?.budget_montant) || 0
    if (budget <= 0 || !rentabilite) return null
    return (rentabilite.cout_revient / budget) * 100
  }, [job, rentabilite])

  // Timeline des imputations (les plus récentes d'abord).
  const timeline = useMemo(
    () =>
      [...temps]
        .sort((a, b) => (a.date_prestation < b.date_prestation ? 1 : -1))
        .slice(0, 12),
    [temps],
  )

  const submitTemps = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/jobs/${jobId}/temps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employe_id: tEmploye,
          date_prestation: tDate,
          heures: tHeures,
          taux_horaire_facture: tTaux || null,
          cout_horaire_charge: tCoutManuel || null,
          facturable: tFacturable,
          tache: tTache || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`Temps imputé — coût ${fmtMoney(data.cout_total)}`)
      setTDialog(false)
      setTHeures("")
      setTTache("")
      setTCoutManuel("")
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const submitDepense = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/jobs/${jobId}/depenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type_depense: dType,
          montant_ht: dMontant,
          description: dDesc || null,
          marge_refacturation_pct: dMarge || 0,
          facturable: dFacturable,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`Dépense ajoutée (${fmtMoney(data.item.montant_ht)})`)
      setDDialog(false)
      setDMontant("")
      setDDesc("")
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const submitConsommation = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/jobs/${jobId}/consommation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produit_id: cProduit,
          quantite: cQuantite,
          marge_refacturation_pct: cMarge || 0,
          facturable: cFacturable,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`Stock consommé — ${fmtMoney(data.valeur_mouvement)} (écriture ${data.ecritures?.nb_entries ? "générée" : "aucune"})`)
      setCDialog(false)
      setCQuantite("")
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const changerValidation = async (id: string, statut: StatutValidation) => {
    try {
      const res = await fetch(`/api/client/jobs/temps/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut_validation: statut }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    }
  }

  const supprimerTemps = async (id: string) => {
    try {
      const res = await fetch(`/api/client/jobs/temps/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    }
  }

  const facturer = async () => {
    if (!confirm("Facturer ce job ? Le montant facturable sera gelé et les temps validés figés.")) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/jobs/${jobId}/facturer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reclassement: false }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`Job facturé — ${fmtMoney(data.montant_facture)}`)
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const facturable = job && !["facture", "annule"].includes(job.statut)
  const estFacture = job?.montant_facture != null

  return (
    <ClientPageShell
      breadcrumbs={[
        { label: "Espace client", href: "/client" },
        { label: "Jobs", href: "/client/jobs" },
        { label: job?.code || "…" },
      ]}
      kicker="Contrôle de gestion"
      title={job ? `${job.code} — ${job.libelle}` : "Job"}
      subtitle={job?.client_nom || undefined}
      disableParticles
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild aria-label="Retour à la liste des jobs">
            <Link href="/client/jobs">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} aria-label="Rafraîchir">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          {facturable && (
            <Button size="sm" onClick={facturer} disabled={submitting}>
              <FileCheck2 className="h-4 w-4 mr-1" /> Facturer
            </Button>
          )}
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

      {loading && !job ? (
        <OpsSkeleton kpis={4} chart rows={4} />
      ) : !job ? (
        <SectionCard>
          <OpsEmpty
            icon={Receipt}
            title="Job introuvable"
            description="Ce job n'existe pas ou n'est pas accessible pour la société active."
            action={
              <Button size="sm" variant="outline" asChild>
                <Link href="/client/jobs">Retour aux jobs</Link>
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <div className="space-y-6">
          {/* ── Hero rentabilité ─────────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card className="py-0 overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${STATUT_JOB_STYLE[job.statut]}`}
                      >
                        {LIBELLES_STATUT_JOB[job.statut]}
                      </span>
                      {estFacture && (
                        <span className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                          <FileCheck2 className="h-3 w-3" /> Facturé
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-3">Marge {estFacture ? "réalisée" : "estimée"}</p>
                    <p
                      className="text-3xl font-bold tabular-nums leading-tight mt-0.5"
                      style={{ color: (rentabilite?.marge ?? 0) < 0 ? ROUGE : TEAL }}
                    >
                      {formatMUR(rentabilite?.marge)}
                    </p>
                    <p className={`text-sm font-medium mt-0.5 ${signedClass(rentabilite?.marge_pct)}`}>
                      {formatPct(rentabilite?.marge_pct)} de marge
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-gray-500">Coût de revient</p>
                    <p className="text-lg font-semibold tabular-nums text-[#0B0F2E]">
                      {formatMUR(rentabilite?.cout_revient)}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      MO {formatMUR(job.cout_temps_reel)} · dép. {formatMUR(job.cout_depenses_reel)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{estFacture ? "Facturé" : "Facturable"}</p>
                    <p className="text-lg font-semibold tabular-nums" style={{ color: GOLD }}>
                      {formatMUR(rentabilite?.produit)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Heures imputées</p>
                    <p className="text-lg font-semibold tabular-nums text-[#0B0F2E]">
                      {formatNumber(heuresImputees, 1)} h
                    </p>
                    {job.budget_heures ? (
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        budget {formatNumber(job.budget_heures)} h
                      </p>
                    ) : null}
                  </div>
                </div>

                {(job.budget_heures || job.budget_montant) && (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {job.budget_heures ? (
                      <BudgetBar
                        label="Avancement heures"
                        pct={rentabilite?.avancement_heures_pct ?? null}
                        danger={(rentabilite?.avancement_heures_pct ?? 0) > 100}
                      />
                    ) : null}
                    {job.budget_montant ? (
                      <BudgetBar
                        label="Avancement budget (coût / budget)"
                        pct={avancementMontantPct}
                        danger={rentabilite?.depassement_budget}
                        right={
                          avancementMontantPct == null
                            ? undefined
                            : `${formatPct(avancementMontantPct, 0)} · ${formatMUR(job.budget_montant)}`
                        }
                      />
                    ) : null}
                  </div>
                )}
                {rentabilite?.depassement_budget && (
                  <p className="mt-3 text-xs text-[#9F1239] font-medium">
                    Le coût de revient dépasse le budget montant du job.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Composition du coût de revient */}
            <SectionCard title="Composition du coût" subtitle="Main d'œuvre vs dépenses & matières">
              {compositionCout.length === 0 ? (
                <OpsEmpty
                  icon={Wallet}
                  title="Aucun coût imputé"
                  description="Saisissez du temps ou une dépense pour voir la composition du coût de revient."
                />
              ) : (
                <>
                  <div style={{ width: "100%", height: 180 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={compositionCout}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={80}
                          paddingAngle={2}
                          stroke="none"
                        >
                          {compositionCout.map((d) => (
                            <Cell key={d.name} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number, n) => [formatMUR(v), n as string]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 space-y-1">
                    {compositionCout.map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-gray-600">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-sm"
                            style={{ backgroundColor: d.color }}
                            aria-hidden="true"
                          />
                          {d.name}
                        </span>
                        <span className="font-medium tabular-nums">{formatMUR(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>
          </div>

          {/* ── KPIs synthétiques ────────────────────────────────────── */}
          <KpiGrid cols={4}>
            <KpiCard
              label="Coût de revient"
              value={formatMUR(rentabilite?.cout_revient)}
              icon={Wallet}
              color={NAVY}
            />
            <KpiCard
              label={estFacture ? "Facturé" : "Facturable"}
              value={formatMUR(rentabilite?.produit)}
              icon={Receipt}
              color={GOLD}
            />
            <KpiCard
              label="Marge"
              value={formatMUR(rentabilite?.marge)}
              icon={TrendingUp}
              color={(rentabilite?.marge ?? 0) < 0 ? ROUGE : TEAL}
              hint={formatPct(rentabilite?.marge_pct)}
            />
            <KpiCard
              label="Taux de marge"
              value={formatPct(rentabilite?.marge_pct)}
              icon={Percent}
              color={(rentabilite?.marge_pct ?? 0) < 0 ? ROUGE : TEAL}
            />
          </KpiGrid>

          {/* ── Onglets Temps / Dépenses ─────────────────────────────── */}
          <Tabs defaultValue="temps">
            <TabsList>
              <TabsTrigger value="temps">
                <Clock className="h-4 w-4 mr-1" /> Temps ({temps.length})
              </TabsTrigger>
              <TabsTrigger value="depenses">
                <Receipt className="h-4 w-4 mr-1" /> Dépenses ({depenses.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="temps" className="mt-4">
              <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
                {/* Table des imputations */}
                <SectionCard
                  title="Imputations de temps"
                  subtitle="Coût interne figé au taux horaire chargé"
                  actions={
                    <Button size="sm" onClick={() => setTDialog(true)} disabled={!facturable}>
                      <Clock className="h-4 w-4 mr-1" /> Saisir du temps
                    </Button>
                  }
                  contentClassName="pt-0"
                >
                  {temps.length === 0 ? (
                    <OpsEmpty
                      icon={Clock}
                      title="Aucune imputation"
                      description="Saisissez le temps passé par vos collaborateurs pour alimenter le coût de revient du job."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Employé</TableHead>
                            <TableHead className="text-right">Heures</TableHead>
                            <TableHead className="text-right">Coût/h</TableHead>
                            <TableHead className="text-right">Coût total</TableHead>
                            <TableHead>Statut</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {temps.map((t) => (
                            <TableRow key={t.id}>
                              <TableCell className="text-xs whitespace-nowrap">{t.date_prestation}</TableCell>
                              <TableCell>
                                {nomEmploye(t.employes)}
                                {!t.facturable && (
                                  <span className="ml-1 text-xs text-muted-foreground">(non fact.)</span>
                                )}
                                {t.tache && (
                                  <div className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                                    {t.tache}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{formatNumber(t.heures, 2)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatMUR(t.cout_horaire_charge)}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">{formatMUR(t.cout_total)}</TableCell>
                              <TableCell>
                                <span
                                  className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${STATUT_VALIDATION_STYLE[t.statut_validation]}`}
                                >
                                  {STATUT_VALIDATION_LABEL[t.statut_validation]}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  {t.statut_validation === "brouillon" && (
                                    <Button size="sm" variant="ghost" onClick={() => changerValidation(t.id, "soumis")}>
                                      Soumettre
                                    </Button>
                                  )}
                                  {t.statut_validation === "soumis" && (
                                    <>
                                      <Button size="sm" variant="ghost" onClick={() => changerValidation(t.id, "valide")}>
                                        Valider
                                      </Button>
                                      <Button size="sm" variant="ghost" onClick={() => changerValidation(t.id, "rejete")}>
                                        Rejeter
                                      </Button>
                                    </>
                                  )}
                                  {t.statut_validation !== "facture" && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      aria-label="Supprimer l'imputation"
                                      onClick={() => supprimerTemps(t.id)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </SectionCard>

                {/* Timeline des imputations */}
                <SectionCard title="Chronologie" subtitle="Dernières imputations">
                  {timeline.length === 0 ? (
                    <OpsEmpty icon={Clock} title="Rien à afficher" />
                  ) : (
                    <ol className="relative space-y-4 pl-5">
                      <span
                        className="absolute left-[5px] top-1 bottom-1 w-px bg-slate-200"
                        aria-hidden="true"
                      />
                      {timeline.map((t) => (
                        <li key={t.id} className="relative">
                          <span
                            className="absolute -left-[15px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white"
                            style={{ backgroundColor: t.facturable ? TEAL : "#94A3B8" }}
                            aria-hidden="true"
                          />
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-[#0B0F2E] truncate">
                                {nomEmploye(t.employes)}
                              </p>
                              <p className="text-[11px] text-gray-500">
                                {t.date_prestation} · {formatNumber(t.heures, 2)} h
                                {t.tache ? ` · ${t.tache}` : ""}
                              </p>
                            </div>
                            <span className="text-xs font-medium tabular-nums text-[#0B0F2E] shrink-0">
                              {formatMUR(t.cout_total)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </SectionCard>
              </div>
            </TabsContent>

            <TabsContent value="depenses" className="mt-4">
              <SectionCard
                title="Dépenses & consommation de stock"
                subtitle="Dépenses non salariales et sorties de stock au CUMP"
                actions={
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setDDialog(true)} disabled={!facturable}>
                      <Receipt className="h-4 w-4 mr-1" /> Ajouter une dépense
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setCDialog(true)} disabled={!facturable}>
                      <Package className="h-4 w-4 mr-1" /> Consommer du stock
                    </Button>
                  </div>
                }
                contentClassName="pt-0"
              >
                {depenses.length === 0 ? (
                  <OpsEmpty
                    icon={Receipt}
                    title="Aucune dépense"
                    description="Ajoutez des dépenses (sous-traitance, matériel, déplacement) ou consommez du stock pour ce job."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Montant HT</TableHead>
                          <TableHead className="text-right">Marge %</TableHead>
                          <TableHead>Source</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {depenses.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="text-xs whitespace-nowrap">{d.date_depense}</TableCell>
                            <TableCell>{LIBELLES_TYPE_DEPENSE[d.type_depense]}</TableCell>
                            <TableCell className="text-muted-foreground max-w-[220px] truncate">
                              {d.description || "—"}
                              {!d.facturable && (
                                <span className="ml-1 text-xs">(non fact.)</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{formatMUR(d.montant_ht)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatPct(d.marge_refacturation_pct, 0)}</TableCell>
                            <TableCell>
                              {d.mouvement_stock_id ? (
                                <Badge variant="outline" className="text-xs">Stock</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">Manuel</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </SectionCard>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Dialog saisie de temps */}
      <Dialog open={tDialog} onOpenChange={setTDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Saisir du temps</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Employé</Label>
              <Select value={tEmploye} onValueChange={setTEmploye}>
                <SelectTrigger>
                  <SelectValue placeholder={coutsHoraires.length ? "Choisir…" : "Aucun coût horaire — en saisir un"} />
                </SelectTrigger>
                <SelectContent>
                  {coutsHoraires.map((c) => (
                    <SelectItem key={c.employe_id} value={c.employe_id}>
                      {c.employes ? `${c.employes.prenom} ${c.employes.nom}` : c.employe_id} — {fmtMoney(c.cout_horaire_charge)}/h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {employeSelectionne && (
                <p className="text-xs text-muted-foreground mt-1">
                  Coût horaire figé : {fmtMoney(employeSelectionne.cout_horaire_charge)}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={tDate} onChange={(e) => setTDate(e.target.value)} />
              </div>
              <div>
                <Label>Heures</Label>
                <Input type="number" value={tHeures} onChange={(e) => setTHeures(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Taux facturation /h</Label>
                <Input type="number" value={tTaux} onChange={(e) => setTTaux(e.target.value)} />
              </div>
              <div>
                <Label>Coût /h (override)</Label>
                <Input
                  type="number"
                  value={tCoutManuel}
                  onChange={(e) => setTCoutManuel(e.target.value)}
                  placeholder="snapshot si vide"
                />
              </div>
            </div>
            <div>
              <Label>Tâche</Label>
              <Input value={tTache} onChange={(e) => setTTache(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={tFacturable} onChange={(e) => setTFacturable(e.target.checked)} />
              Facturable
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={submitTemps}
              disabled={submitting || (!tEmploye && !tCoutManuel) || !tHeures}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Imputer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog dépense */}
      <Dialog open={dDialog} onOpenChange={setDDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter une dépense</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Type</Label>
              <Select value={dType} onValueChange={(v) => setDType(v as TypeDepense)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LIBELLES_TYPE_DEPENSE) as TypeDepense[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {LIBELLES_TYPE_DEPENSE[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Montant HT</Label>
                <Input type="number" value={dMontant} onChange={(e) => setDMontant(e.target.value)} />
              </div>
              <div>
                <Label>Marge refacturation %</Label>
                <Input type="number" value={dMarge} onChange={(e) => setDMarge(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={dDesc} onChange={(e) => setDDesc(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dFacturable} onChange={(e) => setDFacturable(e.target.checked)} />
              Facturable
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDDialog(false)}>
              Annuler
            </Button>
            <Button onClick={submitDepense} disabled={submitting || !dMontant}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog consommation stock */}
      <Dialog open={cDialog} onOpenChange={setCDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Consommer du stock</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Produit</Label>
              <Select value={cProduit} onValueChange={setCProduit}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un produit…" />
                </SelectTrigger>
                <SelectContent>
                  {produits.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.sku} — {p.designation} ({fmtMoney(p.cout_unitaire_moyen)}/u)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantité</Label>
                <Input type="number" value={cQuantite} onChange={(e) => setCQuantite(e.target.value)} />
              </div>
              <div>
                <Label>Marge refacturation %</Label>
                <Input type="number" value={cMarge} onChange={(e) => setCMarge(e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cFacturable} onChange={(e) => setCFacturable(e.target.checked)} />
              Facturable
            </label>
            <p className="text-xs text-muted-foreground">
              Sortie valorisée au CUMP courant, écriture D 6037 / C 3701 taggée sur ce job.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCDialog(false)}>
              Annuler
            </Button>
            <Button onClick={submitConsommation} disabled={submitting || !cProduit || !cQuantite}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Consommer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPageShell>
  )
}
