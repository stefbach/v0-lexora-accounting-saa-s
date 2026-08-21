"use client"

/**
 * Page /client/manufacturing/[id] — Fiche de suivi d'un ordre de fabrication.
 *
 * Refonte "opérations intelligentes" : rangée de KPI, timeline visuelle du
 * cycle de vie, avancement (Progress), consommation matières théorique vs réel
 * avec écart coloré + mini-graphique, coût de revient figé, et entrées produit
 * fini.
 *
 * ⚠️ Refonte de PRÉSENTATION : la logique métier est conservée à l'identique.
 *  - planifie : consommations théoriques préremplies, quantités réelles
 *               éditables, « Lancer » (sortie matières atomique + pièce
 *               OF-CONSO) ou « Annuler ».
 *  - en_cours : consommations réelles + écart, « Produire & clôturer »
 *               (entrée produit fini au coût de revient + pièce OF-PROD).
 *  - cloture  : récapitulatif figé (coût de revient, production, écart).
 *
 * Next 16 : cette page est un Client Component et lit l'id via useParams()
 * (pas de params Promise à awaiter ici).
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ArrowLeft,
  Factory,
  Loader2,
  PackageCheck,
  Play,
  XCircle,
  Layers,
  Wallet,
  Coins,
  Gauge,
  CheckCircle2,
  Circle,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import {
  KpiCard,
  KpiGrid,
  SectionCard,
  OpsEmpty,
  OpsSkeleton,
  formatMUR,
  signedClass,
} from "@/components/operations"
import { money, round2 } from "@/lib/money"
import { LIBELLES_STATUT_OF, type StatutOF } from "@/lib/manufacturing/types"

interface ProduitInfo {
  id?: string
  sku: string
  designation: string
  unite_mesure: string
  cout_unitaire_moyen?: number
}

interface OrdreDetail {
  id: string
  numero_of: string
  statut: StatutOF
  quantite_a_produire: number
  quantite_produite: number
  cout_matieres_reel: number
  cout_main_oeuvre_reel: number
  cout_unitaire_revient: number | null
  date_planifiee: string | null
  notes: string | null
  nomenclatures?: {
    version: string
    quantite_produite: number
    produits?: ProduitInfo | null
    lignes_nomenclature?: Array<{
      produit_composant_id: string
      quantite: number
      unite: string | null
      taux_perte_pct: number
      produits?: ProduitInfo | null
    }>
  } | null
  depots?: { nom: string } | null
}

interface ConsommationRow {
  id: string
  produit_id: string
  quantite_theorique: number
  quantite_reelle: number
  cout_unitaire: number
  valeur_theorique: number
  valeur_reelle: number
  date_consommation: string
  produits?: ProduitInfo | null
}

interface ProductionRow {
  id: string
  quantite: number
  cout_unitaire_revient: number
  date_production: string
  produits?: ProduitInfo | null
}

interface LigneTheorique {
  produit_id: string
  quantite_theorique: number
}

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
const GOLD_TXT = "#A88925"
const TEAL = "#0F766E"

function fmtMoney(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " MUR"
}

function fmtQte(n: number): string {
  return (Number(n) || 0).toLocaleString("fr-FR", { maximumFractionDigits: 3 })
}

function StatutBadge({ statut }: { statut: StatutOF }) {
  if (statut === "cloture")
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Clôturé</Badge>
  if (statut === "en_cours")
    return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">En cours</Badge>
  if (statut === "annule") return <Badge variant="secondary">Annulé</Badge>
  return <Badge variant="outline">{LIBELLES_STATUT_OF[statut] || statut}</Badge>
}

const STAGE_PCT: Record<StatutOF, number> = {
  planifie: 15,
  en_cours: 60,
  cloture: 100,
  annule: 0,
}

/** Étapes du cycle de vie pour la timeline (l'annulation est un état terminal à part). */
const TIMELINE: { statut: StatutOF; label: string }[] = [
  { statut: "planifie", label: "Planifié" },
  { statut: "en_cours", label: "En cours" },
  { statut: "cloture", label: "Clôturé" },
]
const STAGE_ORDER: Record<StatutOF, number> = { planifie: 0, en_cours: 1, cloture: 2, annule: 0 }

export default function OrdreFabricationPage() {
  const params = useParams<{ id: string }>()
  const ordreId = params?.id

  const [loading, setLoading] = useState(true)
  const [ordre, setOrdre] = useState<OrdreDetail | null>(null)
  const [consommations, setConsommations] = useState<ConsommationRow[]>([])
  const [productions, setProductions] = useState<ProductionRow[]>([])
  const [theoriques, setTheoriques] = useState<LigneTheorique[]>([])
  const [reelles, setReelles] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const [prodDialogOpen, setProdDialogOpen] = useState(false)
  const [prodQuantite, setProdQuantite] = useState("")

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 6000)
  }

  const load = useCallback(async () => {
    if (!ordreId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/client/manufacturing/ordres/${ordreId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      setOrdre(data.item)
      setConsommations(data.consommations || [])
      setProductions(data.productions || [])
      setTheoriques(data.lignes_theoriques || [])
      setReelles((prev) => {
        const next: Record<string, string> = {}
        for (const l of data.lignes_theoriques || []) {
          next[l.produit_id] = prev[l.produit_id] ?? String(l.quantite_theorique)
        }
        return next
      })
      setProdQuantite(String(data.item?.quantite_a_produire ?? ""))
    } catch (e: any) {
      showToast(e?.message || "Erreur de chargement", "error")
    } finally {
      setLoading(false)
    }
  }, [ordreId])

  useEffect(() => {
    load()
  }, [load])

  const composantsParId = useMemo(() => {
    const map = new Map<string, ProduitInfo>()
    for (const l of ordre?.nomenclatures?.lignes_nomenclature || []) {
      if (l.produits) map.set(l.produit_composant_id, l.produits)
    }
    return map
  }, [ordre])

  const lancer = async () => {
    if (!ordreId) return
    setSubmitting(true)
    try {
      const lignes = theoriques.map((t) => ({
        produit_id: t.produit_id,
        quantite_theorique: t.quantite_theorique,
        quantite_reelle: reelles[t.produit_id] ?? t.quantite_theorique,
      }))
      const res = await fetch(`/api/client/manufacturing/ordres/${ordreId}/lancer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lignes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(
        `Fabrication lancée — matières : ${fmtMoney(data.cout_matieres_reel)} · écriture : ${
          data.ecritures?.nb_entries ? "générée" : "aucune"
        }`,
      )
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const cloturer = async () => {
    if (!ordreId) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/manufacturing/ordres/${ordreId}/cloturer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantite_produite: prodQuantite }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(
        `OF clôturé — coût de revient : ${fmtMoney(data.cout_unitaire_revient)} / unité · écriture : ${
          data.ecritures?.nb_entries ? "générée" : "aucune"
        }`,
      )
      setProdDialogOpen(false)
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const annuler = async () => {
    if (!ordreId) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/manufacturing/ordres/${ordreId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "annuler" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast("Ordre annulé")
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const produitFini = ordre?.nomenclatures?.produits

  const ecartTotal = useMemo(
    () =>
      round2(
        consommations.reduce(
          (s, c) => s.plus(money(c.valeur_reelle).minus(money(c.valeur_theorique))),
          money(0),
        ),
      ),
    [consommations],
  )

  const theoriqueTotal = useMemo(
    () => round2(consommations.reduce((s, c) => s.plus(money(c.valeur_theorique)), money(0))),
    [consommations],
  )

  const avancement = ordre ? STAGE_PCT[ordre.statut] : 0

  // Graphique consommation théorique vs réel par composant (en_cours / cloture).
  const consoSeries = useMemo(
    () =>
      consommations.map((c) => ({
        sku: c.produits?.sku || c.produit_id.slice(0, 6),
        theorique: round2(money(c.valeur_theorique)),
        reel: round2(money(c.valeur_reelle)),
      })),
    [consommations],
  )

  return (
    <ClientPageShell
      disableParticles
      breadcrumbs={[
        { label: "Espace client", href: "/client" },
        { label: "Manufacturing", href: "/client/manufacturing" },
        { label: ordre?.numero_of || "Ordre" },
      ]}
      kicker="Gestion commerciale"
      title={ordre ? `Ordre ${ordre.numero_of}` : "Ordre de fabrication"}
      subtitle={
        produitFini
          ? `${produitFini.designation} (${produitFini.sku}) — ${fmtQte(ordre?.quantite_a_produire || 0)} ${produitFini.unite_mesure} à produire`
          : "Suivi de fabrication"
      }
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/client/manufacturing">
              <ArrowLeft className="h-4 w-4 mr-1" /> Retour
            </Link>
          </Button>
          {ordre?.statut === "planifie" && (
            <>
              <Button variant="outline" size="sm" onClick={annuler} disabled={submitting}>
                <XCircle className="h-4 w-4 mr-1" /> Annuler l&apos;OF
              </Button>
              <Button size="sm" onClick={lancer} disabled={submitting || theoriques.length === 0}>
                {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                Lancer la fabrication
              </Button>
            </>
          )}
          {ordre?.statut === "en_cours" && (
            <Button size="sm" onClick={() => setProdDialogOpen(true)} disabled={submitting}>
              <PackageCheck className="h-4 w-4 mr-1" /> Produire &amp; clôturer
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

      {loading && !ordre ? (
        <OpsSkeleton kpis={4} chart rows={4} />
      ) : !ordre ? (
        <OpsEmpty icon={Factory} title="Ordre introuvable" description="Cet ordre de fabrication n'existe pas ou a été supprimé." />
      ) : (
        <>
          {/* ── Rangée KPI ──────────────────────────────────────────── */}
          <KpiGrid cols={4} className="mb-4">
            <KpiCard
              label="Statut"
              value={<StatutBadge statut={ordre.statut} />}
              icon={Gauge}
              color={ordre.statut === "cloture" ? TEAL : ordre.statut === "en_cours" ? "#2A6FCC" : NAVY}
              hint={`Dépôt ${ordre.depots?.nom || "—"} · BOM v${ordre.nomenclatures?.version}`}
            />
            <KpiCard
              label="Production"
              value={`${fmtQte(ordre.quantite_produite)} / ${fmtQte(ordre.quantite_a_produire)}`}
              icon={Factory}
              color={NAVY}
              hint={produitFini?.unite_mesure}
            />
            <KpiCard
              label="Coût matières (en-cours 3300)"
              value={formatMUR(ordre.cout_matieres_reel)}
              icon={Wallet}
              color={GOLD_TXT}
              hint={
                ecartTotal !== 0
                  ? `Écart matière ${ecartTotal > 0 ? "+" : ""}${fmtMoney(ecartTotal)} (6586)`
                  : theoriqueTotal > 0
                    ? "Conforme au théorique"
                    : "Imputé au lancement"
              }
            />
            <KpiCard
              label="Coût de revient unitaire"
              value={ordre.cout_unitaire_revient != null ? formatMUR(ordre.cout_unitaire_revient, 2) : "—"}
              icon={Coins}
              color={ordre.cout_unitaire_revient != null ? NAVY : "#94A3B8"}
              hint={ordre.statut === "cloture" ? "Figé à la clôture" : "Calculé à la clôture"}
            />
          </KpiGrid>

          {/* ── Avancement + timeline ───────────────────────────────── */}
          <SectionCard title="Avancement" subtitle="Cycle de vie de l'ordre de fabrication" className="mb-4">
            {ordre.statut === "annule" ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <XCircle className="h-4 w-4 text-[#9F1239]" aria-hidden="true" />
                Ordre annulé — aucune consommation ni production enregistrée.
              </div>
            ) : (
              <>
                <Progress value={avancement} className="h-2 mb-4" aria-label={`Avancement ${avancement}%`} />
                <ol className="flex items-center justify-between gap-2">
                  {TIMELINE.map((step, i) => {
                    const current = STAGE_ORDER[ordre.statut]
                    const done = current > STAGE_ORDER[step.statut]
                    const active = ordre.statut === step.statut
                    const color = done || active ? (active ? "#2A6FCC" : TEAL) : "#CBD5E1"
                    return (
                      <li key={step.statut} className="flex-1 flex flex-col items-center text-center relative">
                        {i > 0 && (
                          <span
                            className="absolute top-2.5 right-1/2 h-0.5 w-full -z-0"
                            style={{ backgroundColor: current >= STAGE_ORDER[step.statut] ? TEAL : "#E2E8F0" }}
                            aria-hidden="true"
                          />
                        )}
                        <span className="relative z-10 bg-white">
                          {done ? (
                            <CheckCircle2 className="h-5 w-5" style={{ color: TEAL }} aria-hidden="true" />
                          ) : active ? (
                            <Circle className="h-5 w-5 fill-current" style={{ color }} aria-hidden="true" />
                          ) : (
                            <Circle className="h-5 w-5" style={{ color }} aria-hidden="true" />
                          )}
                        </span>
                        <span
                          className={`mt-1 text-xs ${active ? "font-semibold text-[#0B0F2E]" : done ? "text-[#0F766E]" : "text-gray-400"}`}
                        >
                          {step.label}
                        </span>
                        {step.statut === "planifie" && ordre.date_planifiee && (
                          <span className="text-[10px] text-gray-400">{ordre.date_planifiee}</span>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </>
            )}
          </SectionCard>

          {/* ── Consommations ───────────────────────────────────────── */}
          <SectionCard
            title={
              ordre.statut === "planifie"
                ? "Composants à consommer"
                : "Consommation matières — théorique vs réel"
            }
            subtitle={
              ordre.statut === "planifie"
                ? "Quantités réelles éditables avant lancement"
                : "Écart valorisé au CUMP (surconsommation → compte 6586)"
            }
            className="mb-4"
          >
            {ordre.statut === "planifie" ? (
              theoriques.length === 0 ? (
                <OpsEmpty icon={Layers} title="Nomenclature vide" description="Aucun composant à consommer." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Composant</TableHead>
                        <TableHead className="text-right">Quantité théorique</TableHead>
                        <TableHead className="text-right">Quantité réelle</TableHead>
                        <TableHead className="text-right">CUMP courant</TableHead>
                        <TableHead className="text-right">Valeur estimée</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {theoriques.map((t) => {
                        const p = composantsParId.get(t.produit_id)
                        const cump = p?.cout_unitaire_moyen || 0
                        const qte = Number(reelles[t.produit_id] ?? t.quantite_theorique) || 0
                        const valeur = round2(money(qte).times(money(cump)))
                        return (
                          <TableRow key={t.produit_id}>
                            <TableCell>
                              <span className="font-mono text-xs mr-2">{p?.sku}</span>
                              {p?.designation || t.produit_id}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtQte(t.quantite_theorique)} {p?.unite_mesure}
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min="0"
                                step="0.001"
                                className="w-28 ml-auto text-right"
                                value={reelles[t.produit_id] ?? ""}
                                onChange={(e) =>
                                  setReelles((r) => ({ ...r, [t.produit_id]: e.target.value }))
                                }
                                aria-label={`Quantité réelle ${p?.sku || t.produit_id}`}
                              />
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{fmtMoney(cump)}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fmtMoney(valeur)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )
            ) : consommations.length === 0 ? (
              <OpsEmpty icon={Factory} title="Aucune consommation" description="Aucun composant n'a été consommé sur cet ordre." />
            ) : (
              <>
                {consoSeries.length > 0 && (
                  <div className="mb-4" style={{ width: "100%", height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={consoSeries} margin={{ top: 8, right: 12, left: 6, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" vertical={false} />
                        <XAxis dataKey="sku" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#E5E7EB" }} />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                          width={44}
                        />
                        <Tooltip formatter={(v: number, n) => [formatMUR(v), n as string]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="theorique" name="Théorique" fill={GOLD} radius={[3, 3, 0, 0]} />
                        <Bar dataKey="reel" name="Réel" fill={NAVY} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Composant</TableHead>
                        <TableHead className="text-right">Théorique</TableHead>
                        <TableHead className="text-right">Réel</TableHead>
                        <TableHead className="text-right">CUMP</TableHead>
                        <TableHead className="text-right">Valeur en-cours</TableHead>
                        <TableHead className="text-right">Écart</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {consommations.map((c) => {
                        const ecart = round2(money(c.valeur_reelle).minus(money(c.valeur_theorique)))
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="whitespace-nowrap tabular-nums">{c.date_consommation}</TableCell>
                            <TableCell>
                              <span className="font-mono text-xs mr-2">{c.produits?.sku}</span>
                              {c.produits?.designation}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{fmtQte(c.quantite_theorique)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtQte(c.quantite_reelle)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtMoney(c.cout_unitaire)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtMoney(c.valeur_reelle)}</TableCell>
                            <TableCell className={`text-right tabular-nums font-medium ${signedClass(ecart)}`}>
                              {ecart === 0 ? "—" : `${ecart > 0 ? "+" : ""}${fmtMoney(ecart)}`}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                {ecartTotal !== 0 && (
                  <div className="mt-3 flex items-center justify-end gap-2 text-sm">
                    <span className="text-muted-foreground">Écart matière total :</span>
                    <span className={`font-semibold tabular-nums ${signedClass(ecartTotal)}`}>
                      {ecartTotal > 0 ? "+" : ""}
                      {fmtMoney(ecartTotal)}
                    </span>
                    <span className="text-xs text-muted-foreground">(compte 6586)</span>
                  </div>
                )}
              </>
            )}
          </SectionCard>

          {/* ── Coût de revient figé (clôturé) ──────────────────────── */}
          {ordre.statut === "cloture" && ordre.cout_unitaire_revient != null && (
            <div className="grid gap-4 mb-4 lg:grid-cols-3">
              <KpiCard
                label="Matières imputées"
                value={formatMUR(ordre.cout_matieres_reel)}
                icon={Wallet}
                color={GOLD_TXT}
                hint="Compte en-cours 3300"
              />
              <KpiCard
                label="Quantité produite"
                value={`${fmtQte(ordre.quantite_produite)} ${produitFini?.unite_mesure || ""}`}
                icon={Factory}
                color={NAVY}
                hint={`sur ${fmtQte(ordre.quantite_a_produire)} planifiés`}
              />
              <KpiCard
                label="Coût de revient / unité"
                value={formatMUR(ordre.cout_unitaire_revient, 2)}
                icon={Coins}
                color={TEAL}
                hint="Figé — OF immuable"
              />
            </div>
          )}

          {/* ── Productions ─────────────────────────────────────────── */}
          <SectionCard title="Entrées en stock du produit fini" subtitle="Valorisées au coût de revient réel">
            {productions.length === 0 ? (
              <OpsEmpty
                icon={PackageCheck}
                title="Aucune production enregistrée"
                description="La production est saisie à la clôture de l'OF (entrée du produit fini au coût de revient)."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Produit</TableHead>
                      <TableHead className="text-right">Quantité</TableHead>
                      <TableHead className="text-right">Coût de revient unitaire</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productions.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap tabular-nums">{p.date_production}</TableCell>
                        <TableCell>
                          <span className="font-mono text-xs mr-2">{p.produits?.sku}</span>
                          {p.produits?.designation}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtQte(p.quantite)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {fmtMoney(p.cout_unitaire_revient)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {ordre.notes && (
              <p className="text-xs text-muted-foreground mt-3">Notes : {ordre.notes}</p>
            )}
          </SectionCard>
        </>
      )}

      {/* ── Dialog clôture ─────────────────────────────────────────── */}
      <Dialog open={prodDialogOpen} onOpenChange={setProdDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Produire &amp; clôturer l&apos;OF</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Quantité réellement produite *</Label>
              <Input
                type="number"
                min="0"
                step="0.001"
                value={prodQuantite}
                onChange={(e) => setProdQuantite(e.target.value)}
              />
            </div>
            {Number(prodQuantite) > 0 && ordre && (
              <p className="text-xs text-muted-foreground">
                Coût de revient estimé :{" "}
                <span className="font-semibold text-[#0B0F2E]">
                  {fmtMoney(round2(money(ordre.cout_matieres_reel).plus(money(ordre.cout_main_oeuvre_reel)).dividedBy(money(prodQuantite))))}
                </span>{" "}
                / unité.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Le produit fini entre en stock au coût de revient réel ({fmtMoney(ordre?.cout_matieres_reel)}
              {" "}/ quantité produite). Le coût est figé à la clôture — l&apos;OF devient immuable.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProdDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={cloturer} disabled={submitting || !(Number(prodQuantite) > 0)}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Clôturer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPageShell>
  )
}
