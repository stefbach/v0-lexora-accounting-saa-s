"use client"

/**
 * Page /client/manufacturing — Tableau de bord Production / Manufacturing
 * (Module C).
 *
 * Refonte "opérations intelligentes" : rangée de KPI (OF en cours / en retard /
 * valeur production en-cours / écart moyen coût estimé vs réel), graphiques
 * recharts (coût matières estimé vs réel, rebut théorique vs réel), bloc
 * d'alertes actionnables trié par sévérité, analyse IA à la demande, vue Kanban
 * par statut (togglable en table filtrable), et éditeur de nomenclature avec
 * coût matières estimé recalculé en direct.
 *
 * ⚠️ Refonte de PRÉSENTATION : toute la logique métier (fetch nomenclatures /
 * ordres, dialogs de création de BOM multi-composants et de lancement d'un OF)
 * est conservée à l'identique — mêmes endpoints, mêmes payloads.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
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
  Factory,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Clock,
  Wallet,
  Scale,
  Activity,
  LayoutGrid,
  Rows3,
  ArrowUpDown,
  ClipboardList,
  Layers,
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
  formatPct,
  signedClass,
  type AlertItem,
} from "@/components/operations"
import { money, round2 } from "@/lib/money"
import { LIBELLES_STATUT_OF, type StatutOF } from "@/lib/manufacturing/types"

interface ProduitOption {
  id: string
  sku: string
  designation: string
  unite_mesure: string
  cout_unitaire_moyen: number
  gere_en_stock: boolean
  actif: boolean
}

interface LigneBomRow {
  id: string
  produit_composant_id: string
  quantite: number
  unite: string | null
  taux_perte_pct: number
  produits?: { sku: string; designation: string; unite_mesure: string; cout_unitaire_moyen: number } | null
}

interface NomenclatureRow {
  id: string
  produit_fini_id: string
  version: string
  libelle: string | null
  quantite_produite: number
  statut: "brouillon" | "active" | "obsolete"
  cout_matieres_estime: number | null
  produits?: { sku: string; designation: string; unite_mesure: string } | null
  lignes_nomenclature?: LigneBomRow[]
}

interface OrdreRow {
  id: string
  nomenclature_id: string
  numero_of: string
  statut: StatutOF
  quantite_a_produire: number
  quantite_produite: number
  cout_matieres_reel: number
  cout_unitaire_revient: number | null
  date_planifiee: string | null
  nomenclatures?: {
    version: string
    produit_fini_id?: string
    produits?: { sku: string; designation: string; unite_mesure: string } | null
  } | null
  depots?: { nom: string } | null
}

interface LigneForm {
  produit_composant_id: string
  quantite: string
  taux_perte_pct: string
}

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
const GOLD_TXT = "#A88925"
const TEAL = "#0F766E"
const RED = "#9F1239"
const AMBER = "#B45309"

/** Seuil d'écart coût (%) au-delà duquel un OF clôturé est signalé. */
const SEUIL_ECART_PCT = 10

function fmtMoney(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " MUR"
}

function fmtQte(n: number): string {
  return (Number(n) || 0).toLocaleString("fr-FR", { maximumFractionDigits: 3 })
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function StatutOFBadge({ statut }: { statut: StatutOF }) {
  if (statut === "cloture")
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Clôturé</Badge>
  if (statut === "en_cours")
    return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">En cours</Badge>
  if (statut === "annule") return <Badge variant="secondary">Annulé</Badge>
  return <Badge variant="outline">{LIBELLES_STATUT_OF[statut] || statut}</Badge>
}

/** Avancement "cycle de vie" d'un OF (la production n'est saisie qu'à la clôture). */
const STAGE_PCT: Record<StatutOF, number> = {
  planifie: 15,
  en_cours: 60,
  cloture: 100,
  annule: 0,
}

type OrdreSortKey = "numero" | "produit" | "aproduire" | "reel" | "date" | "statut"

export default function ManufacturingPage() {
  const { societeId } = useSocieteActive()
  const [tab, setTab] = useState("ordres")
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const [produits, setProduits] = useState<ProduitOption[]>([])
  const [nomenclatures, setNomenclatures] = useState<NomenclatureRow[]>([])
  const [ordres, setOrdres] = useState<OrdreRow[]>([])
  const [submitting, setSubmitting] = useState(false)

  const [ordresView, setOrdresView] = useState<"kanban" | "table">("kanban")
  const [ordreSearch, setOrdreSearch] = useState("")
  const [ordreSortKey, setOrdreSortKey] = useState<OrdreSortKey>("date")
  const [ordreSortDir, setOrdreSortDir] = useState<"asc" | "desc">("desc")

  // Dialog BOM
  const [bomDialogOpen, setBomDialogOpen] = useState(false)
  const [bProduitFini, setBProduitFini] = useState("")
  const [bLibelle, setBLibelle] = useState("")
  const [bQuantiteLot, setBQuantiteLot] = useState("1")
  const [bLignes, setBLignes] = useState<LigneForm[]>([
    { produit_composant_id: "", quantite: "", taux_perte_pct: "0" },
  ])

  // Dialog OF
  const [ofDialogOpen, setOfDialogOpen] = useState(false)
  const [oNomenclature, setONomenclature] = useState("")
  const [oQuantite, setOQuantite] = useState("")
  const [oDate, setODate] = useState("")
  const [oNotes, setONotes] = useState("")

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const [pRes, nRes, oRes] = await Promise.all([
        fetch(`/api/client/inventaire/produits?societe_id=${societeId}`),
        fetch(`/api/client/manufacturing/nomenclatures?societe_id=${societeId}`),
        fetch(`/api/client/manufacturing/ordres?societe_id=${societeId}`),
      ])
      const [pData, nData, oData] = await Promise.all([pRes.json(), nRes.json(), oRes.json()])
      if (!pRes.ok) throw new Error(pData.error || "Erreur produits")
      if (!nRes.ok) throw new Error(nData.error || "Erreur nomenclatures")
      if (!oRes.ok) throw new Error(oData.error || "Erreur ordres")
      setProduits(pData.items || [])
      setNomenclatures(nData.items || [])
      setOrdres(oData.items || [])
    } catch (e: any) {
      showToast(e?.message || "Erreur de chargement", "error")
    } finally {
      setLoading(false)
    }
  }, [societeId])

  useEffect(() => {
    load()
  }, [load])

  const produitsStockables = useMemo(
    () => produits.filter((p) => p.gere_en_stock && p.actif),
    [produits],
  )
  const bomsActives = useMemo(() => nomenclatures.filter((n) => n.statut === "active"), [nomenclatures])

  const produitsById = useMemo(() => {
    const m = new Map<string, ProduitOption>()
    for (const p of produits) m.set(p.id, p)
    return m
  }, [produits])

  /** BOM indexée : coût unitaire estimé + rebut théorique moyen (moyenne des taux de perte). */
  const bomById = useMemo(() => {
    const m = new Map<string, { coutUnitaireEstime: number | null; rebutTheoriquePct: number }>()
    for (const n of nomenclatures) {
      const lignes = n.lignes_nomenclature || []
      const rebut =
        lignes.length > 0
          ? lignes.reduce((s, l) => s + (Number(l.taux_perte_pct) || 0), 0) / lignes.length
          : 0
      m.set(n.id, {
        coutUnitaireEstime: n.cout_matieres_estime != null ? Number(n.cout_matieres_estime) : null,
        rebutTheoriquePct: rebut,
      })
    }
    return m
  }, [nomenclatures])

  /** Coût matières estimé d'un OF = coût unitaire BOM × quantité à produire. */
  const estimeMatieres = useCallback(
    (o: OrdreRow): number | null => {
      const bom = bomById.get(o.nomenclature_id)
      if (!bom || bom.coutUnitaireEstime == null) return null
      return round2(money(bom.coutUnitaireEstime).times(money(o.quantite_a_produire)))
    },
    [bomById],
  )

  const today = todayISO()
  const isRetard = useCallback(
    (o: OrdreRow): boolean =>
      !!o.date_planifiee &&
      o.date_planifiee < today &&
      o.statut !== "cloture" &&
      o.statut !== "annule",
    [today],
  )

  /** Écart coût matières (réel − estimé) d'un OF clôturé, en % de l'estimé. */
  const ecartPct = useCallback(
    (o: OrdreRow): number | null => {
      const est = estimeMatieres(o)
      if (est == null || est <= 0) return null
      return round2(money(o.cout_matieres_reel).minus(money(est)).dividedBy(money(est)).times(100))
    },
    [estimeMatieres],
  )

  /** Rebut réel d'un OF clôturé : part non produite (à produire − produit). */
  const rebutReelPct = useCallback((o: OrdreRow): number | null => {
    const qap = Number(o.quantite_a_produire) || 0
    if (qap <= 0) return null
    const qp = Number(o.quantite_produite) || 0
    return round2(money(qap - qp).dividedBy(money(qap)).times(100))
  }, [])

  // ── Agrégats KPI ─────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const enCours = ordres.filter((o) => o.statut === "en_cours")
    const clotures = ordres.filter((o) => o.statut === "cloture")
    const enRetard = ordres.filter(isRetard)
    const valeurEnCours = round2(
      enCours.reduce((s, o) => s.plus(money(o.cout_matieres_reel)), money(0)),
    )
    const ecarts = clotures
      .map((o) => ecartPct(o))
      .filter((v): v is number => v != null)
    const ecartMoyen =
      ecarts.length > 0 ? round2(ecarts.reduce((s, v) => s + v, 0) / ecarts.length) : null
    return {
      nbEnCours: enCours.length,
      nbEnRetard: enRetard.length,
      nbPlanifies: ordres.filter((o) => o.statut === "planifie").length,
      nbClotures: clotures.length,
      valeurEnCours,
      ecartMoyen,
    }
  }, [ordres, isRetard, ecartPct])

  // ── Graphique : coût matières estimé vs réel (OF actifs / clôturés) ───
  const coutSeries = useMemo(
    () =>
      ordres
        .filter((o) => o.statut === "en_cours" || o.statut === "cloture")
        .map((o) => ({
          numero: o.numero_of.replace(/^OF-/, ""),
          estime: estimeMatieres(o) ?? 0,
          reel: round2(money(o.cout_matieres_reel)),
        }))
        .filter((x) => x.estime > 0 || x.reel > 0)
        .slice(0, 12)
        .reverse(),
    [ordres, estimeMatieres],
  )

  // ── Graphique : rebut théorique vs réel (OF clôturés) ────────────────
  const rebutSeries = useMemo(
    () =>
      ordres
        .filter((o) => o.statut === "cloture")
        .map((o) => ({
          numero: o.numero_of.replace(/^OF-/, ""),
          theorique: bomById.get(o.nomenclature_id)?.rebutTheoriquePct ?? 0,
          reel: rebutReelPct(o) ?? 0,
        }))
        .slice(0, 12)
        .reverse(),
    [ordres, bomById, rebutReelPct],
  )

  // ── Alertes actionnables ─────────────────────────────────────────────
  const alertItems: AlertItem[] = useMemo(() => {
    const items: AlertItem[] = []
    for (const o of ordres) {
      if (isRetard(o)) {
        const nom = o.nomenclatures?.produits?.designation || o.nomenclatures?.produits?.sku || "Produit"
        items.push({
          severity: o.statut === "en_cours" ? "danger" : "warning",
          title: `${o.numero_of} en retard — ${nom}`,
          detail: (
            <>
              Planifié le <span className="font-semibold">{o.date_planifiee}</span> ·{" "}
              {LIBELLES_STATUT_OF[o.statut]}
            </>
          ),
          recommendation:
            o.statut === "planifie"
              ? "Lancer la fabrication ou replanifier la date."
              : "Clôturer l'OF ou ajuster la planification.",
          href: `/client/manufacturing/${o.id}`,
          cta: "Ouvrir l'OF",
        })
      }
    }
    for (const o of ordres) {
      if (o.statut !== "cloture") continue
      const ec = ecartPct(o)
      if (ec != null && ec > SEUIL_ECART_PCT) {
        items.push({
          severity: ec > SEUIL_ECART_PCT * 2 ? "danger" : "warning",
          title: `${o.numero_of} — surcoût matières ${formatPct(ec, 1, true)}`,
          detail: (
            <>
              Réel <span className="font-semibold">{fmtMoney(o.cout_matieres_reel)}</span> vs estimé{" "}
              {fmtMoney(estimeMatieres(o))}
            </>
          ),
          recommendation: "Analyser la surconsommation (rebut anormal → 6586) ou réviser la BOM.",
          href: `/client/manufacturing/${o.id}`,
          cta: "Voir le détail",
        })
      }
      const reb = rebutReelPct(o)
      const theo = bomById.get(o.nomenclature_id)?.rebutTheoriquePct ?? 0
      if (reb != null && reb > Math.max(theo, 1) + 5) {
        items.push({
          severity: "warning",
          title: `${o.numero_of} — rebut élevé ${formatPct(reb, 1)}`,
          detail: (
            <>
              Produit {fmtQte(o.quantite_produite)} / {fmtQte(o.quantite_a_produire)} — rebut théorique{" "}
              {formatPct(theo, 1)}
            </>
          ),
          recommendation: "Contrôler le process de fabrication et la qualité des matières.",
          href: `/client/manufacturing/${o.id}`,
          cta: "Voir le détail",
        })
      }
    }
    return items
  }, [ordres, isRetard, ecartPct, rebutReelPct, bomById, estimeMatieres])

  const insightsPayload = useMemo(
    () => ({
      of_en_cours: kpis.nbEnCours,
      of_en_retard: kpis.nbEnRetard,
      of_planifies: kpis.nbPlanifies,
      of_clotures: kpis.nbClotures,
      valeur_production_en_cours: kpis.valeurEnCours,
      ecart_moyen_cout_pct: kpis.ecartMoyen,
      nomenclatures_actives: bomsActives.length,
      cout_estime_vs_reel: coutSeries.slice(0, 8),
      rebut_theorique_vs_reel: rebutSeries.slice(0, 8),
      ordres: ordres.slice(0, 25).map((o) => ({
        numero: o.numero_of,
        statut: o.statut,
        produit: o.nomenclatures?.produits?.sku,
        a_produire: o.quantite_a_produire,
        produit_reel: o.quantite_produite,
        cout_matieres_reel: round2(money(o.cout_matieres_reel)),
        cout_matieres_estime: estimeMatieres(o),
        ecart_pct: ecartPct(o),
        en_retard: isRetard(o),
        date_planifiee: o.date_planifiee,
      })),
    }),
    [kpis, bomsActives, coutSeries, rebutSeries, ordres, estimeMatieres, ecartPct, isRetard],
  )

  // ── Kanban / table ────────────────────────────────────────────────────
  const ordresFiltres = useMemo(() => {
    const q = ordreSearch.trim().toLowerCase()
    if (!q) return ordres
    return ordres.filter(
      (o) =>
        o.numero_of.toLowerCase().includes(q) ||
        (o.nomenclatures?.produits?.sku || "").toLowerCase().includes(q) ||
        (o.nomenclatures?.produits?.designation || "").toLowerCase().includes(q),
    )
  }, [ordres, ordreSearch])

  const KANBAN_COLS: { statut: StatutOF; label: string; accent: string }[] = [
    { statut: "planifie", label: "Planifié", accent: GOLD_TXT },
    { statut: "en_cours", label: "En cours", accent: "#2A6FCC" },
    { statut: "cloture", label: "Clôturé", accent: TEAL },
  ]

  const toggleOrdreSort = (k: OrdreSortKey) => {
    if (ordreSortKey === k) setOrdreSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setOrdreSortKey(k)
      setOrdreSortDir(k === "numero" || k === "produit" ? "asc" : "desc")
    }
  }

  const ordresTries = useMemo(() => {
    const arr = [...ordresFiltres]
    arr.sort((a, b) => {
      let av: number | string = 0
      let bv: number | string = 0
      switch (ordreSortKey) {
        case "numero": av = a.numero_of; bv = b.numero_of; break
        case "produit":
          av = a.nomenclatures?.produits?.sku || ""
          bv = b.nomenclatures?.produits?.sku || ""
          break
        case "aproduire": av = Number(a.quantite_a_produire) || 0; bv = Number(b.quantite_a_produire) || 0; break
        case "reel": av = Number(a.cout_matieres_reel) || 0; bv = Number(b.cout_matieres_reel) || 0; break
        case "date": av = a.date_planifiee || ""; bv = b.date_planifiee || ""; break
        case "statut": av = a.statut; bv = b.statut; break
      }
      if (av < bv) return ordreSortDir === "asc" ? -1 : 1
      if (av > bv) return ordreSortDir === "asc" ? 1 : -1
      return 0
    })
    return arr
  }, [ordresFiltres, ordreSortKey, ordreSortDir])

  const resetBomForm = () => {
    setBProduitFini("")
    setBLibelle("")
    setBQuantiteLot("1")
    setBLignes([{ produit_composant_id: "", quantite: "", taux_perte_pct: "0" }])
  }

  const setLigne = (i: number, patch: Partial<LigneForm>) => {
    setBLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  }

  /** Coût matières estimé recalculé en direct dans le dialog BOM. */
  const bomEstimation = useMemo(() => {
    const lot = money(bQuantiteLot || 0)
    let totalLot = money(0)
    let lignesValides = 0
    for (const l of bLignes) {
      if (!l.produit_composant_id || !(Number(l.quantite) > 0)) continue
      const cump = produitsById.get(l.produit_composant_id)?.cout_unitaire_moyen ?? 0
      totalLot = totalLot.plus(
        money(l.quantite)
          .times(money(1).plus(money(l.taux_perte_pct || 0).dividedBy(100)))
          .times(money(cump)),
      )
      lignesValides++
    }
    const perLot = round2(totalLot)
    const perUnit = lot.gt(0) ? round2(totalLot.dividedBy(lot)) : null
    return { perLot, perUnit, lignesValides }
  }, [bLignes, bQuantiteLot, produitsById])

  const submitBom = async () => {
    if (!societeId) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/client/manufacturing/nomenclatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          produit_fini_id: bProduitFini,
          libelle: bLibelle || null,
          quantite_produite: bQuantiteLot || 1,
          lignes: bLignes
            .filter((l) => l.produit_composant_id)
            .map((l) => ({
              produit_composant_id: l.produit_composant_id,
              quantite: l.quantite,
              taux_perte_pct: l.taux_perte_pct || 0,
            })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast("Nomenclature créée et activée")
      setBomDialogOpen(false)
      resetBomForm()
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const submitOf = async () => {
    if (!societeId) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/client/manufacturing/ordres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          nomenclature_id: oNomenclature,
          quantite_a_produire: oQuantite,
          date_planifiee: oDate || null,
          notes: oNotes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`Ordre ${data.item?.numero_of} créé`)
      setOfDialogOpen(false)
      setONomenclature("")
      setOQuantite("")
      setODate("")
      setONotes("")
      setTab("ordres")
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const bomValide =
    bProduitFini &&
    bLignes.some((l) => l.produit_composant_id && Number(l.quantite) > 0) &&
    bLignes.every((l) => !l.produit_composant_id || Number(l.quantite) > 0)

  const OrdreSortHead = ({ k, children, align }: { k: OrdreSortKey; children: ReactNode; align?: "right" }) => (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => toggleOrdreSort(k)}
        className={`inline-flex items-center gap-1 hover:text-[#0B0F2E] transition-colors ${
          align === "right" ? "ml-auto" : ""
        } ${ordreSortKey === k ? "text-[#0B0F2E] font-semibold" : ""}`}
        aria-label={`Trier par ${typeof children === "string" ? children : k}`}
      >
        {children}
        <ArrowUpDown className={`h-3 w-3 ${ordreSortKey === k ? "opacity-90" : "opacity-40"}`} aria-hidden="true" />
      </button>
    </TableHead>
  )

  /** Carte OF pour la vue Kanban. */
  const OrdreCard = ({ o }: { o: OrdreRow }) => {
    const retard = isRetard(o)
    const est = estimeMatieres(o)
    const ec = ecartPct(o)
    return (
      <Link
        href={`/client/manufacturing/${o.id}`}
        className="block rounded-lg border bg-white p-3 hover:shadow-sm hover:border-[#0B0F2E]/30 transition-all"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-xs font-semibold text-[#0B0F2E]">{o.numero_of}</span>
          {retard && (
            <Badge variant="destructive" className="gap-1 text-[10px] px-1.5 py-0">
              <Clock className="h-3 w-3" /> Retard
            </Badge>
          )}
        </div>
        <p className="text-sm font-medium text-[#0B0F2E] mt-1 leading-snug truncate">
          {o.nomenclatures?.produits?.designation || "—"}
        </p>
        <p className="text-[11px] text-gray-500 font-mono truncate">{o.nomenclatures?.produits?.sku}</p>

        <div className="mt-2.5">
          <Progress value={STAGE_PCT[o.statut]} className="h-1.5" />
          <div className="flex items-center justify-between mt-1 text-[11px] text-gray-500">
            <span>
              {fmtQte(o.quantite_produite)} / {fmtQte(o.quantite_a_produire)}{" "}
              {o.nomenclatures?.produits?.unite_mesure}
            </span>
            {o.date_planifiee && (
              <span className={retard ? "text-[#9F1239] font-medium" : ""}>{o.date_planifiee}</span>
            )}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px]">
          <span className="text-gray-500">
            Matières <span className="font-semibold text-[#0B0F2E]">{fmtMoney(o.cout_matieres_reel)}</span>
          </span>
          {o.statut === "cloture" && ec != null ? (
            <span className={`font-semibold ${signedClass(ec)}`}>{formatPct(ec, 1, true)}</span>
          ) : est != null ? (
            <span className="text-gray-400">est. {formatMUR(est)}</span>
          ) : null}
        </div>
      </Link>
    )
  }

  const showSkeleton = loading && ordres.length === 0 && nomenclatures.length === 0

  return (
    <ClientPageShell
      disableParticles
      breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Manufacturing" }]}
      kicker="Gestion commerciale"
      title="Production & manufacturing"
      subtitle="Nomenclatures (BOM) et ordres de fabrication — consommation de composants, production valorisée au coût de revient réel, écarts coût et rebut suivis."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} aria-label="Rafraîchir">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button size="sm" onClick={() => setOfDialogOpen(true)} disabled={bomsActives.length === 0}>
            <Factory className="h-4 w-4 mr-1" /> Ordre de fabrication
          </Button>
          <Button size="sm" onClick={() => setBomDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nomenclature
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

      {!societeId ? (
        <OpsEmpty
          icon={Factory}
          title="Aucune société sélectionnée"
          description="Choisissez une société active pour afficher sa production."
        />
      ) : showSkeleton ? (
        <OpsSkeleton kpis={4} chart rows={5} />
      ) : (
        <>
          {/* ── Rangée KPI ────────────────────────────────────────────── */}
          <KpiGrid cols={4} className="mb-4">
            <KpiCard
              label="OF en cours"
              value={kpis.nbEnCours}
              icon={Activity}
              color={kpis.nbEnCours > 0 ? "#2A6FCC" : NAVY}
              hint={`${kpis.nbPlanifies} planifié${kpis.nbPlanifies > 1 ? "s" : ""} · ${kpis.nbClotures} clôturé${kpis.nbClotures > 1 ? "s" : ""}`}
            />
            <KpiCard
              label="OF en retard"
              value={kpis.nbEnRetard}
              icon={Clock}
              color={kpis.nbEnRetard > 0 ? RED : TEAL}
              hint={kpis.nbEnRetard > 0 ? "Date planifiée dépassée" : "Aucun retard"}
            />
            <KpiCard
              label="Valeur production en-cours"
              value={formatMUR(kpis.valeurEnCours)}
              icon={Wallet}
              color={GOLD_TXT}
              hint="Matières imputées (compte 3300)"
            />
            <KpiCard
              label="Écart moyen coût matières"
              value={kpis.ecartMoyen != null ? formatPct(kpis.ecartMoyen, 1, true) : "—"}
              icon={Scale}
              color={kpis.ecartMoyen == null ? NAVY : kpis.ecartMoyen > 0 ? RED : TEAL}
              hint="Réel vs estimé (OF clôturés)"
            />
          </KpiGrid>

          {/* ── Graphiques ────────────────────────────────────────────── */}
          <div className="grid gap-4 mb-4 lg:grid-cols-2">
            <ChartCard
              title="Coût matières : estimé vs réel"
              subtitle="Par ordre de fabrication (en cours et clôturés)"
              height={280}
            >
              {coutSeries.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={coutSeries} margin={{ top: 8, right: 12, left: 6, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" vertical={false} />
                    <XAxis dataKey="numero" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#E5E7EB" }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                      width={44}
                    />
                    <Tooltip formatter={(v: number, n) => [formatMUR(v), n as string]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="estime" name="Estimé (BOM)" fill={GOLD} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="reel" name="Réel" fill={NAVY} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <OpsEmpty
                    icon={ClipboardList}
                    title="Pas encore de fabrication"
                    description="Lancez un ordre pour comparer coût estimé et coût réel."
                  />
                </div>
              )}
            </ChartCard>

            <ChartCard
              title="Rebut : théorique vs réel"
              subtitle="Perte BOM moyenne vs production manquante (OF clôturés)"
              height={280}
            >
              {rebutSeries.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rebutSeries} margin={{ top: 8, right: 12, left: 6, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" vertical={false} />
                    <XAxis dataKey="numero" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#E5E7EB" }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                      width={40}
                    />
                    <Tooltip formatter={(v: number, n) => [formatPct(v, 1), n as string]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="theorique" name="Théorique" fill={TEAL} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="reel" name="Réel" fill={AMBER} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <OpsEmpty
                    icon={Scale}
                    title="Aucun OF clôturé"
                    description="Le suivi du rebut apparaît après la clôture d'un ordre."
                  />
                </div>
              )}
            </ChartCard>
          </div>

          {/* ── Alertes + IA ──────────────────────────────────────────── */}
          <div className="grid gap-4 mb-4 lg:grid-cols-2">
            <SectionCard
              title="Alertes de production"
              subtitle={
                alertItems.length > 0
                  ? `${alertItems.length} signal${alertItems.length > 1 ? "s" : ""} à traiter`
                  : "Production sous contrôle"
              }
            >
              <AlertsPanel
                items={alertItems}
                emptyState={
                  <OpsEmpty
                    icon={Factory}
                    title="Aucune alerte"
                    description="Aucun retard ni écart coût/rebut anormal détecté."
                  />
                }
              />
            </SectionCard>

            <SectionCard title="Assistant production" subtitle="Écarts coût et rebut analysés à la demande">
              <OperationsInsights module="production" societeId={societeId} payload={insightsPayload} />
            </SectionCard>
          </div>

          {/* ── Onglets ───────────────────────────────────────────────── */}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="ordres">Ordres de fabrication ({ordres.length})</TabsTrigger>
              <TabsTrigger value="nomenclatures">Nomenclatures ({nomenclatures.length})</TabsTrigger>
            </TabsList>

            {/* ── Ordres de fabrication ───────────────────────────────── */}
            <TabsContent value="ordres" className="space-y-4">
              <Card className="mt-2">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3 mb-4 flex-wrap">
                    <div className="relative flex-1 min-w-[220px]">
                      <Factory className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <Input
                        placeholder="Rechercher N° OF, SKU, produit…"
                        value={ordreSearch}
                        onChange={(e) => setOrdreSearch(e.target.value)}
                        className="pl-8"
                        aria-label="Rechercher un ordre de fabrication"
                      />
                    </div>
                    <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Mode d'affichage">
                      <Button
                        variant={ordresView === "kanban" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setOrdresView("kanban")}
                        aria-pressed={ordresView === "kanban"}
                      >
                        <LayoutGrid className="h-4 w-4 mr-1" /> Kanban
                      </Button>
                      <Button
                        variant={ordresView === "table" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setOrdresView("table")}
                        aria-pressed={ordresView === "table"}
                      >
                        <Rows3 className="h-4 w-4 mr-1" /> Table
                      </Button>
                    </div>
                  </div>

                  {ordresTries.length === 0 ? (
                    <OpsEmpty
                      icon={Factory}
                      title={ordreSearch ? "Aucun ordre trouvé" : "Aucun ordre de fabrication"}
                      description={
                        ordreSearch
                          ? "Aucun OF ne correspond à votre recherche."
                          : "Lancez un ordre depuis une nomenclature active pour démarrer une fabrication."
                      }
                      action={
                        !ordreSearch && bomsActives.length > 0 ? (
                          <Button size="sm" onClick={() => setOfDialogOpen(true)}>
                            <Factory className="h-4 w-4 mr-1" /> Nouvel ordre
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : ordresView === "kanban" ? (
                    <div className="grid gap-3 md:grid-cols-3">
                      {KANBAN_COLS.map((col) => {
                        const cards = ordresTries.filter((o) => o.statut === col.statut)
                        return (
                          <div key={col.statut} className="rounded-lg bg-slate-50/70 border p-2">
                            <div className="flex items-center justify-between px-1 pb-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: col.accent }}
                                  aria-hidden="true"
                                />
                                <span className="text-sm font-semibold text-[#0B0F2E]">{col.label}</span>
                              </div>
                              <Badge variant="secondary" className="text-[11px]">{cards.length}</Badge>
                            </div>
                            <div className="space-y-2 min-h-[60px]">
                              {cards.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-6">Aucun OF</p>
                              ) : (
                                cards.map((o) => <OrdreCard key={o.id} o={o} />)
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {ordresTries.some((o) => o.statut === "annule") && (
                        <p className="text-xs text-muted-foreground md:col-span-3">
                          {ordresTries.filter((o) => o.statut === "annule").length} OF annulé(s) — visibles en vue Table.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <OrdreSortHead k="numero">N° OF</OrdreSortHead>
                            <OrdreSortHead k="produit">Produit fini</OrdreSortHead>
                            <TableHead>Dépôt</TableHead>
                            <OrdreSortHead k="aproduire" align="right">À produire</OrdreSortHead>
                            <TableHead className="text-right">Produit</TableHead>
                            <TableHead className="text-right">Matières estimé</TableHead>
                            <OrdreSortHead k="reel" align="right">Matières réel</OrdreSortHead>
                            <TableHead className="text-right">Écart</TableHead>
                            <OrdreSortHead k="date" align="right">Planifié</OrdreSortHead>
                            <OrdreSortHead k="statut">Statut</OrdreSortHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ordresTries.map((o) => {
                            const est = estimeMatieres(o)
                            const ec = ecartPct(o)
                            const retard = isRetard(o)
                            return (
                              <TableRow key={o.id}>
                                <TableCell>
                                  <Link
                                    href={`/client/manufacturing/${o.id}`}
                                    className="font-mono text-xs font-medium hover:underline text-[#0B0F2E]"
                                  >
                                    {o.numero_of}
                                  </Link>
                                </TableCell>
                                <TableCell>
                                  <span className="font-mono text-xs mr-2">{o.nomenclatures?.produits?.sku}</span>
                                  {o.nomenclatures?.produits?.designation}
                                </TableCell>
                                <TableCell>{o.depots?.nom || "—"}</TableCell>
                                <TableCell className="text-right tabular-nums">{fmtQte(o.quantite_a_produire)}</TableCell>
                                <TableCell className="text-right tabular-nums">{fmtQte(o.quantite_produite)}</TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">
                                  {est != null ? fmtMoney(est) : "—"}
                                </TableCell>
                                <TableCell className="text-right tabular-nums font-medium">
                                  {fmtMoney(o.cout_matieres_reel)}
                                </TableCell>
                                <TableCell className={`text-right tabular-nums font-medium ${ec != null ? signedClass(ec) : ""}`}>
                                  {o.statut === "cloture" && ec != null ? formatPct(ec, 1, true) : "—"}
                                </TableCell>
                                <TableCell className={`text-right tabular-nums whitespace-nowrap ${retard ? "text-[#9F1239] font-medium" : ""}`}>
                                  {o.date_planifiee || "—"}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1.5">
                                    <StatutOFBadge statut={o.statut} />
                                    {retard && <Clock className="h-3.5 w-3.5 text-[#9F1239]" aria-label="En retard" />}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Nomenclatures ───────────────────────────────────────── */}
            <TabsContent value="nomenclatures">
              <Card className="mt-2">
                <CardContent className="pt-4">
                  {nomenclatures.length === 0 ? (
                    <OpsEmpty
                      icon={Layers}
                      title="Aucune nomenclature"
                      description="Créez une BOM (produit fini + composants) pour lancer votre premier ordre de fabrication."
                      action={
                        <Button size="sm" onClick={() => setBomDialogOpen(true)}>
                          <Plus className="h-4 w-4 mr-1" /> Nouvelle nomenclature
                        </Button>
                      }
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Produit fini</TableHead>
                            <TableHead>Version</TableHead>
                            <TableHead>Libellé</TableHead>
                            <TableHead className="text-right">Lot</TableHead>
                            <TableHead>Composants</TableHead>
                            <TableHead className="text-right">Coût matières estimé / unité</TableHead>
                            <TableHead>Statut</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {nomenclatures.map((n) => (
                            <TableRow key={n.id}>
                              <TableCell>
                                <span className="font-mono text-xs mr-2">{n.produits?.sku}</span>
                                <span className="font-medium text-[#0B0F2E]">{n.produits?.designation}</span>
                              </TableCell>
                              <TableCell className="tabular-nums">{n.version}</TableCell>
                              <TableCell className="text-muted-foreground">{n.libelle || "—"}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {fmtQte(n.quantite_produite)} {n.produits?.unite_mesure}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-xs max-w-[320px]">
                                {(n.lignes_nomenclature || [])
                                  .map(
                                    (l) =>
                                      `${fmtQte(l.quantite)}${l.unite ? " " + l.unite : ""} ${l.produits?.sku || "?"}` +
                                      (Number(l.taux_perte_pct) > 0 ? ` (+${l.taux_perte_pct}%)` : ""),
                                  )
                                  .join(" · ") || "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-medium">
                                {fmtMoney(n.cout_matieres_estime)}
                              </TableCell>
                              <TableCell>
                                {n.statut === "active" ? (
                                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                                    Active v{n.version}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">{n.statut}</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* ── Dialog nouvelle nomenclature ───────────────────────────── */}
      <Dialog open={bomDialogOpen} onOpenChange={setBomDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nouvelle nomenclature (BOM)</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Produit fini *</Label>
                <Select value={bProduitFini} onValueChange={setBProduitFini}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir le produit fabriqué" />
                  </SelectTrigger>
                  <SelectContent>
                    {produitsStockables.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.sku} — {p.designation}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantité produite par lot</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={bQuantiteLot}
                  onChange={(e) => setBQuantiteLot(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Libellé</Label>
              <Input value={bLibelle} onChange={(e) => setBLibelle(e.target.value)} placeholder="Recette / gamme…" />
            </div>

            <div>
              <Label>Composants *</Label>
              <div className="mt-1 grid gap-2">
                {bLignes.map((l, i) => {
                  const cump = produitsById.get(l.produit_composant_id)?.cout_unitaire_moyen ?? 0
                  const ligneCout =
                    l.produit_composant_id && Number(l.quantite) > 0
                      ? round2(
                          money(l.quantite)
                            .times(money(1).plus(money(l.taux_perte_pct || 0).dividedBy(100)))
                            .times(money(cump)),
                        )
                      : null
                  return (
                    <div key={i} className="grid grid-cols-[1fr_110px_110px_36px] gap-2 items-center">
                      <Select
                        value={l.produit_composant_id}
                        onValueChange={(v) => setLigne(i, { produit_composant_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Composant" />
                        </SelectTrigger>
                        <SelectContent>
                          {produitsStockables
                            .filter((p) => p.id !== bProduitFini)
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.sku} — {p.designation}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="0"
                        step="0.001"
                        placeholder="Quantité"
                        value={l.quantite}
                        onChange={(e) => setLigne(i, { quantite: e.target.value })}
                      />
                      <Input
                        type="number"
                        min="0"
                        max="99.99"
                        step="0.01"
                        placeholder="Perte %"
                        value={l.taux_perte_pct}
                        onChange={(e) => setLigne(i, { taux_perte_pct: e.target.value })}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={bLignes.length <= 1}
                        onClick={() => setBLignes((ls) => ls.filter((_, j) => j !== i))}
                        aria-label="Retirer le composant"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      {ligneCout != null && (
                        <p className="col-span-4 -mt-1 text-[11px] text-gray-400 text-right">
                          CUMP {fmtMoney(cump)} → {fmtMoney(ligneCout)} / lot
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() =>
                  setBLignes((ls) => [...ls, { produit_composant_id: "", quantite: "", taux_perte_pct: "0" }])
                }
              >
                <Plus className="h-4 w-4 mr-1" /> Ajouter un composant
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Le taux de perte majore la consommation théorique (rebut normal, inclus dans le coût
                de revient). Mono-niveau : un composant ne peut pas avoir sa propre BOM active.
              </p>
            </div>

            {/* Coût matières estimé recalculé en direct */}
            <div className="rounded-lg border bg-slate-50/70 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-[#0B0F2E]">
                <Scale className="h-4 w-4 text-[#A88925]" aria-hidden="true" />
                <span className="font-medium">Coût matières estimé</span>
                <span className="text-xs text-gray-500">
                  ({bomEstimation.lignesValides} composant{bomEstimation.lignesValides > 1 ? "s" : ""} valorisé
                  {bomEstimation.lignesValides > 1 ? "s" : ""})
                </span>
              </div>
              <div className="text-right">
                <p className="text-base font-bold text-[#0B0F2E] tabular-nums">
                  {bomEstimation.perUnit != null ? fmtMoney(bomEstimation.perUnit) : "—"}
                  <span className="text-xs font-normal text-gray-500"> / unité</span>
                </p>
                <p className="text-[11px] text-gray-500 tabular-nums">
                  {fmtMoney(bomEstimation.perLot)} / lot de {fmtQte(Number(bQuantiteLot) || 0)}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBomDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submitBom} disabled={submitting || !bomValide}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Créer et activer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog nouvel OF ───────────────────────────────────────── */}
      <Dialog open={ofDialogOpen} onOpenChange={setOfDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvel ordre de fabrication</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Nomenclature (BOM active) *</Label>
              <Select value={oNomenclature} onValueChange={setONomenclature}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir une nomenclature" />
                </SelectTrigger>
                <SelectContent>
                  {bomsActives.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.produits?.sku} — {n.produits?.designation} (v{n.version})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantité à produire *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  value={oQuantite}
                  onChange={(e) => setOQuantite(e.target.value)}
                />
              </div>
              <div>
                <Label>Date planifiée</Label>
                <Input type="date" value={oDate} onChange={(e) => setODate(e.target.value)} />
              </div>
            </div>
            {oNomenclature && Number(oQuantite) > 0 && (() => {
              const bom = bomById.get(oNomenclature)
              if (!bom || bom.coutUnitaireEstime == null) return null
              const est = round2(money(bom.coutUnitaireEstime).times(money(oQuantite)))
              return (
                <p className="text-xs text-muted-foreground">
                  Coût matières estimé de l&apos;OF :{" "}
                  <span className="font-semibold text-[#0B0F2E]">{fmtMoney(est)}</span> (
                  {fmtMoney(bom.coutUnitaireEstime)} / unité).
                </p>
              )
            })()}
            <div>
              <Label>Notes</Label>
              <Input value={oNotes} onChange={(e) => setONotes(e.target.value)} placeholder="Lot, client, priorité…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submitOf} disabled={submitting || !oNomenclature || !(Number(oQuantite) > 0)}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Créer l&apos;OF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPageShell>
  )
}
