"use client"

/**
 * Page /client/inventaire — Tableau de bord Stock & inventaire (Module A).
 *
 * Refonte "opérations intelligentes" : rangée de KPI valorisés, graphiques
 * recharts (évolution de la valeur de stock, top produits, répartition par
 * catégorie), bloc d'alertes actionnables trié par sévérité, analyse IA à la
 * demande, puis onglets modernisés (Produits / Stock & alertes / Mouvements).
 *
 * ⚠️ Refonte de PRÉSENTATION : toute la logique métier (fetch produits/stock/
 * mouvements/alertes, dialogs de création produit et de saisie de mouvement,
 * RPC atomique de valorisation CUMP) est conservée à l'identique.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
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
  Plus,
  Package,
  PackageX,
  PackageSearch,
  RefreshCw,
  Search,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpDown,
  Boxes,
  Wallet,
  Percent,
  TriangleAlert,
  ClipboardList,
} from "lucide-react"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
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
  SectionCard,
  ChartCard,
  OpsEmpty,
  OpsSkeleton,
  AlertsPanel,
  OperationsInsights,
  formatMUR,
  signedClass,
  type AlertItem,
} from "@/components/operations"
import {
  LIBELLES_TYPE_MOUVEMENT,
  type TypeMouvement,
} from "@/lib/inventaire/types"

interface ProduitRow {
  id: string
  sku: string
  designation: string
  categorie: string | null
  unite_mesure: string
  gere_en_stock: boolean
  cout_unitaire_moyen: number
  prix_vente_ht: number
  taux_tva: number
  stock_mini: number
  stock_maxi: number | null
  seuil_alerte: number | null
  actif: boolean
  stock_niveaux?: Array<{ depot_id: string; quantite: number; valeur_stock: number }>
}

interface NiveauRow {
  id: string
  produit_id: string
  depot_id: string
  quantite: number
  valeur_stock: number
  produits?: { sku: string; designation: string; unite_mesure: string; cout_unitaire_moyen: number; seuil_alerte: number | null; stock_mini: number; actif: boolean } | null
  depots?: { nom: string; type: string } | null
}

interface AlerteRow {
  id: string
  produit_id: string
  type_alerte: "seuil_bas" | "rupture" | "surstockage"
  seuil_reference: number | null
  quantite_constatee: number
  produits?: { sku: string; designation: string } | null
}

interface MouvementRow {
  id: string
  type_mouvement: TypeMouvement
  sens: "E" | "S"
  quantite: number
  cout_unitaire: number
  valeur_mouvement: number
  date_mouvement: string
  motif: string | null
  produits?: { sku: string; designation: string; unite_mesure: string } | null
  depots?: { nom: string } | null
}

const TYPES_SAISIE: TypeMouvement[] = [
  "entree_achat",
  "sortie_vente",
  "ajustement_inventaire_plus",
  "ajustement_inventaire_moins",
  "retour_client",
  "retour_fournisseur",
  "perte_casse",
]

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
const GOLD_TXT = "#A88925"
const TEAL = "#0F766E"
const RED = "#9F1239"
const AMBER = "#B45309"

/** Palette catégorielle (donut) — dérivée de la charte Lexora. */
const CATEGORY_COLORS = [
  NAVY,
  GOLD,
  TEAL,
  "#2A6FCC",
  AMBER,
  "#7C3AED",
  RED,
  "#0891B2",
  "#65A30D",
  "#BE185D",
]

function fmtMoney(n: number): string {
  return (Number(n) || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " MUR"
}

function fmtQte(n: number): string {
  return (Number(n) || 0).toLocaleString("fr-FR", { maximumFractionDigits: 3 })
}

/** "2026-08" → "août 26" (libellé compact pour l'axe X). */
function moisCourt(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, (m || 1) - 1).toLocaleDateString("fr-FR", {
    month: "short",
    year: "2-digit",
  })
}

function AlerteBadge({ type }: { type: AlerteRow["type_alerte"] }) {
  if (type === "rupture") return <Badge variant="destructive">Rupture</Badge>
  if (type === "seuil_bas")
    return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Seuil bas</Badge>
  return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Surstockage</Badge>
}

type SortKey = "sku" | "designation" | "stock" | "cump" | "valeur" | "marge" | "prix"

export default function InventairePage() {
  const { societeId } = useSocieteActive()
  const [tab, setTab] = useState("produits")
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const [produits, setProduits] = useState<ProduitRow[]>([])
  const [niveaux, setNiveaux] = useState<NiveauRow[]>([])
  const [alertes, setAlertes] = useState<AlerteRow[]>([])
  const [mouvements, setMouvements] = useState<MouvementRow[]>([])
  const [includeInactifs, setIncludeInactifs] = useState(false)
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("valeur")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  // Dialog produit
  const [produitDialogOpen, setProduitDialogOpen] = useState(false)
  const [pSku, setPSku] = useState("")
  const [pDesignation, setPDesignation] = useState("")
  const [pCategorie, setPCategorie] = useState("")
  const [pUnite, setPUnite] = useState("unite")
  const [pPrixVente, setPPrixVente] = useState("")
  const [pTva, setPTva] = useState("15")
  const [pSeuil, setPSeuil] = useState("")
  const [pStockMini, setPStockMini] = useState("")
  const [pGereEnStock, setPGereEnStock] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Dialog mouvement
  const [mvtDialogOpen, setMvtDialogOpen] = useState(false)
  const [mProduitId, setMProduitId] = useState("")
  const [mType, setMType] = useState<TypeMouvement>("entree_achat")
  const [mQuantite, setMQuantite] = useState("")
  const [mCout, setMCout] = useState("")
  const [mDate, setMDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [mMotif, setMMotif] = useState("")

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const [pRes, sRes, mRes] = await Promise.all([
        fetch(`/api/client/inventaire/produits?societe_id=${societeId}${includeInactifs ? "&include_inactifs=1" : ""}`),
        fetch(`/api/client/inventaire/stock?societe_id=${societeId}`),
        fetch(`/api/client/inventaire/mouvements?societe_id=${societeId}`),
      ])
      const [pData, sData, mData] = await Promise.all([pRes.json(), sRes.json(), mRes.json()])
      if (!pRes.ok) throw new Error(pData.error || "Erreur produits")
      if (!sRes.ok) throw new Error(sData.error || "Erreur stock")
      if (!mRes.ok) throw new Error(mData.error || "Erreur mouvements")
      setProduits(pData.items || [])
      setNiveaux(sData.niveaux || [])
      setAlertes(sData.alertes || [])
      setMouvements(mData.items || [])
    } catch (e: any) {
      showToast(e?.message || "Erreur de chargement", "error")
    } finally {
      setLoading(false)
    }
  }, [societeId, includeInactifs])

  useEffect(() => {
    load()
  }, [load])

  const stockTotal = (p: ProduitRow) =>
    (p.stock_niveaux || []).reduce((s, n) => s + (Number(n.quantite) || 0), 0)
  const valeurTotale = (p: ProduitRow) =>
    (p.stock_niveaux || []).reduce((s, n) => s + (Number(n.valeur_stock) || 0), 0)
  const margeUnitaire = (p: ProduitRow) =>
    (Number(p.prix_vente_ht) || 0) - (Number(p.cout_unitaire_moyen) || 0)

  const produitsFiltres = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return produits
    return produits.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.designation.toLowerCase().includes(q) ||
        (p.categorie || "").toLowerCase().includes(q),
    )
  }, [produits, search])

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(k)
      setSortDir(k === "sku" || k === "designation" ? "asc" : "desc")
    }
  }

  const produitsAffiches = useMemo(() => {
    const arr = [...produitsFiltres]
    arr.sort((a, b) => {
      let av: number | string = 0
      let bv: number | string = 0
      switch (sortKey) {
        case "sku": av = a.sku.toLowerCase(); bv = b.sku.toLowerCase(); break
        case "designation": av = a.designation.toLowerCase(); bv = b.designation.toLowerCase(); break
        case "stock": av = stockTotal(a); bv = stockTotal(b); break
        case "cump": av = Number(a.cout_unitaire_moyen) || 0; bv = Number(b.cout_unitaire_moyen) || 0; break
        case "valeur": av = valeurTotale(a); bv = valeurTotale(b); break
        case "marge": av = margeUnitaire(a); bv = margeUnitaire(b); break
        case "prix": av = Number(a.prix_vente_ht) || 0; bv = Number(b.prix_vente_ht) || 0; break
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })
    return arr
  }, [produitsFiltres, sortKey, sortDir])

  const alertesParProduit = useMemo(() => {
    const map = new Map<string, AlerteRow>()
    for (const a of alertes) if (!map.has(a.produit_id)) map.set(a.produit_id, a)
    return map
  }, [alertes])

  // ── Agrégats KPI ─────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const valeurTotaleStock = niveaux.reduce((s, n) => s + (Number(n.valeur_stock) || 0), 0)
    const geres = produits.filter((p) => p.gere_en_stock)
    const rupture = new Set<string>()
    const seuilBas = new Set<string>()
    for (const a of alertes) {
      if (a.type_alerte === "rupture") rupture.add(a.produit_id)
      else if (a.type_alerte === "seuil_bas") seuilBas.add(a.produit_id)
    }
    const margeables = produits.filter((p) => (Number(p.prix_vente_ht) || 0) > 0)
    const margeMoyenne =
      margeables.length > 0
        ? margeables.reduce((s, p) => s + margeUnitaire(p), 0) / margeables.length
        : null
    return {
      valeurTotaleStock,
      nbReferences: produits.length,
      nbGeres: geres.length,
      nbRupture: rupture.size,
      nbSeuilBas: seuilBas.size,
      margeMoyenne,
    }
  }, [niveaux, produits, alertes])

  // ── Évolution de la valeur de stock (mensuelle, ancrée au réel) ───────
  const valeurSeries = useMemo(() => {
    if (mouvements.length === 0) return [] as { mois: string; valeur: number }[]
    const deltas = new Map<string, number>()
    for (const m of mouvements) {
      const k = (m.date_mouvement || "").slice(0, 7)
      if (!k) continue
      const signed = m.sens === "E" ? Number(m.valeur_mouvement) || 0 : -(Number(m.valeur_mouvement) || 0)
      deltas.set(k, (deltas.get(k) || 0) + signed)
    }
    const months = [...deltas.keys()].sort()
    if (months.length === 0) return []
    // Valeur actuelle réelle = fin du dernier mois ; on remonte le temps.
    const total = niveaux.reduce((s, n) => s + (Number(n.valeur_stock) || 0), 0)
    const endVals: Record<string, number> = {}
    let running = total
    for (let i = months.length - 1; i >= 0; i--) {
      endVals[months[i]] = running
      running = running - (deltas.get(months[i]) || 0)
    }
    return months
      .slice(-12)
      .map((k) => ({ mois: moisCourt(k), valeur: Math.round(endVals[k]) }))
  }, [mouvements, niveaux])

  const topProduits = useMemo(
    () =>
      produits
        .map((p) => ({ sku: p.sku, valeur: Math.round(valeurTotale(p)) }))
        .filter((x) => x.valeur > 0)
        .sort((a, b) => b.valeur - a.valeur)
        .slice(0, 8),
    [produits],
  )

  const repartitionCategorie = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of produits) {
      const v = valeurTotale(p)
      if (v <= 0) continue
      const cat = p.categorie || "Sans catégorie"
      map.set(cat, (map.get(cat) || 0) + v)
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
  }, [produits])

  const openMouvement = useCallback((produitId?: string, type?: TypeMouvement) => {
    setMProduitId(produitId || "")
    setMType(type || "entree_achat")
    setMQuantite("")
    setMCout("")
    setMDate(new Date().toISOString().slice(0, 10))
    setMMotif("")
    setMvtDialogOpen(true)
  }, [])

  // ── Alertes actionnables ─────────────────────────────────────────────
  const alertItems: AlertItem[] = useMemo(
    () =>
      alertes.map((a) => {
        const sev = a.type_alerte === "rupture" ? "danger" : a.type_alerte === "seuil_bas" ? "warning" : "info"
        const nom = a.produits?.designation || a.produits?.sku || "Produit"
        const libelle =
          a.type_alerte === "rupture" ? "Rupture de stock" : a.type_alerte === "seuil_bas" ? "Sous le seuil d’alerte" : "Surstockage"
        return {
          severity: sev,
          title: `${nom} — ${libelle}`,
          detail: (
            <>
              Stock constaté&nbsp;: <span className="font-semibold">{fmtQte(a.quantite_constatee)}</span>
              {a.seuil_reference != null && (
                <> · seuil&nbsp;: {fmtQte(a.seuil_reference)}</>
              )}
            </>
          ),
          recommendation:
            a.type_alerte === "surstockage"
              ? "Réduire les commandes / envisager une promotion pour écouler."
              : "Réapprovisionner rapidement pour éviter la rupture commerciale.",
          cta: a.type_alerte === "surstockage" ? undefined : "Réapprovisionner",
          onAction:
            a.type_alerte === "surstockage" ? undefined : () => openMouvement(a.produit_id, "entree_achat"),
        }
      }),
    [alertes, openMouvement],
  )

  const insightsPayload = useMemo(
    () => ({
      valeur_totale_stock: Math.round(kpis.valeurTotaleStock),
      nb_references: kpis.nbReferences,
      nb_references_gerees: kpis.nbGeres,
      nb_rupture: kpis.nbRupture,
      nb_sous_seuil: kpis.nbSeuilBas,
      marge_unitaire_moyenne: kpis.margeMoyenne != null ? Math.round(kpis.margeMoyenne) : null,
      top_produits: topProduits.slice(0, 5),
      repartition_categories: repartitionCategorie.slice(0, 8),
      evolution_valeur: valeurSeries,
      alertes: alertes.slice(0, 25).map((a) => ({
        sku: a.produits?.sku,
        type: a.type_alerte,
        quantite: a.quantite_constatee,
        seuil: a.seuil_reference,
      })),
    }),
    [kpis, topProduits, repartitionCategorie, valeurSeries, alertes],
  )

  const resetProduitForm = () => {
    setPSku("")
    setPDesignation("")
    setPCategorie("")
    setPUnite("unite")
    setPPrixVente("")
    setPTva("15")
    setPSeuil("")
    setPStockMini("")
    setPGereEnStock(true)
  }

  const submitProduit = async () => {
    if (!societeId) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/client/inventaire/produits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          sku: pSku,
          designation: pDesignation,
          categorie: pCategorie || null,
          unite_mesure: pUnite,
          prix_vente_ht: pPrixVente || 0,
          taux_tva: pTva || 15,
          seuil_alerte: pSeuil || null,
          stock_mini: pStockMini || 0,
          gere_en_stock: pGereEnStock,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`Produit ${data.item?.sku} créé`)
      setProduitDialogOpen(false)
      resetProduitForm()
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const isEntreeAchat = mType === "entree_achat"

  const submitMouvement = async () => {
    if (!societeId || !mProduitId) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/client/inventaire/mouvements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          produit_id: mProduitId,
          type_mouvement: mType,
          quantite: mQuantite,
          cout_unitaire: isEntreeAchat ? mCout : null,
          date_mouvement: mDate,
          motif: mMotif || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(
        `Mouvement enregistré — stock : ${fmtQte(data.quantite_apres)} · écriture : ${
          data.ecritures?.nb_entries ? "générée" : "aucune"
        }`,
      )
      setMvtDialogOpen(false)
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const SortHead = ({ k, children, align }: { k: SortKey; children: ReactNode; align?: "right" }) => (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-[#0B0F2E] transition-colors ${
          align === "right" ? "ml-auto" : ""
        } ${sortKey === k ? "text-[#0B0F2E] font-semibold" : ""}`}
        aria-label={`Trier par ${typeof children === "string" ? children : k}`}
      >
        {children}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === k ? "opacity-90" : "opacity-40"}`} aria-hidden="true" />
      </button>
    </TableHead>
  )

  const showSkeleton = loading && produits.length === 0 && niveaux.length === 0

  return (
    <ClientPageShell
      disableParticles
      breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Inventaire" }]}
      kicker="Gestion commerciale"
      title="Stock & inventaire"
      subtitle="Catalogue produits, niveaux de stock valorisés au CUMP, journal des mouvements et alertes de seuil."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} aria-label="Rafraîchir">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={() => openMouvement()}>
            <ArrowDownToLine className="h-4 w-4 mr-1" /> Mouvement
          </Button>
          <Button size="sm" onClick={() => setProduitDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Produit
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
          icon={Package}
          title="Aucune société sélectionnée"
          description="Choisissez une société active pour afficher son stock et son inventaire."
        />
      ) : showSkeleton ? (
        <OpsSkeleton kpis={5} chart rows={6} />
      ) : (
        <>
          {/* ── Rangée KPI ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
            <KpiCard
              label="Valeur totale du stock"
              value={formatMUR(kpis.valeurTotaleStock)}
              icon={Wallet}
              color={GOLD_TXT}
              hint="Valorisation CUMP"
            />
            <KpiCard
              label="Références"
              value={kpis.nbReferences}
              icon={Boxes}
              color={NAVY}
              hint={`${kpis.nbGeres} gérées en stock`}
            />
            <KpiCard
              label="En rupture"
              value={kpis.nbRupture}
              icon={PackageX}
              color={kpis.nbRupture > 0 ? RED : TEAL}
              hint={kpis.nbRupture > 0 ? "Action requise" : "Aucune rupture"}
            />
            <KpiCard
              label="Sous le seuil"
              value={kpis.nbSeuilBas}
              icon={TriangleAlert}
              color={kpis.nbSeuilBas > 0 ? AMBER : TEAL}
              hint={kpis.nbSeuilBas > 0 ? "À réapprovisionner" : "Niveaux sains"}
            />
            <KpiCard
              label="Marge unitaire moy."
              value={kpis.margeMoyenne != null ? formatMUR(kpis.margeMoyenne, 2) : "—"}
              icon={Percent}
              color={kpis.margeMoyenne != null && kpis.margeMoyenne < 0 ? RED : TEAL}
              hint="Prix vente HT − CUMP"
            />
          </div>

          {/* ── Graphiques ────────────────────────────────────────────── */}
          <div className="grid gap-4 mb-4">
            <ChartCard
              title="Évolution de la valeur de stock"
              subtitle="Valorisation CUMP reconstituée depuis les mouvements (12 derniers mois)"
              height={260}
            >
              {valeurSeries.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={valeurSeries} margin={{ top: 5, right: 12, left: 6, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradValeur" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" vertical={false} />
                    <XAxis dataKey="mois" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#E5E7EB" }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                      width={44}
                    />
                    <Tooltip formatter={(v: number) => [formatMUR(v), "Valeur du stock"]} />
                    <Area
                      type="monotone"
                      dataKey="valeur"
                      stroke={GOLD_TXT}
                      strokeWidth={2}
                      fill="url(#gradValeur)"
                      name="Valeur du stock"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <OpsEmpty
                    icon={ClipboardList}
                    title="Pas encore d’historique"
                    description="Enregistrez des mouvements pour visualiser l’évolution de la valeur de stock."
                  />
                </div>
              )}
            </ChartCard>

            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Top produits par valeur" subtitle="Valeur de stock immobilisée" height={280}>
                {topProduits.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topProduits}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                      />
                      <YAxis
                        type="category"
                        dataKey="sku"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={80}
                      />
                      <Tooltip formatter={(v: number) => [formatMUR(v), "Valeur"]} />
                      <Bar dataKey="valeur" fill={NAVY} radius={[0, 4, 4, 0]} name="Valeur" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <OpsEmpty icon={Package} title="Aucun stock valorisé" />
                  </div>
                )}
              </ChartCard>

              <ChartCard title="Répartition par catégorie" subtitle="Part de la valeur de stock" height={280}>
                {repartitionCategorie.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={repartitionCategorie}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={88}
                        paddingAngle={2}
                      >
                        {repartitionCategorie.map((entry, i) => (
                          <Cell key={entry.name} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number, n) => [formatMUR(v), n as string]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <OpsEmpty icon={PackageSearch} title="Aucune catégorie valorisée" />
                  </div>
                )}
              </ChartCard>
            </div>
          </div>

          {/* ── Alertes + IA ──────────────────────────────────────────── */}
          <div className="grid gap-4 mb-4 lg:grid-cols-2">
            <SectionCard
              title="Alertes de stock"
              subtitle={
                alertes.length > 0
                  ? `${alertes.length} alerte${alertes.length > 1 ? "s" : ""} active${alertes.length > 1 ? "s" : ""}`
                  : "Niveaux sous contrôle"
              }
            >
              <AlertsPanel
                items={alertItems}
                emptyState={
                  <OpsEmpty
                    icon={Package}
                    title="Aucune alerte de stock"
                    description="Tous les produits gérés sont au-dessus de leur seuil d’alerte."
                  />
                }
              />
            </SectionCard>

            <SectionCard title="Assistant réapprovisionnement" subtitle="Analyse des niveaux et suggestions">
              <OperationsInsights module="inventaire" societeId={societeId} payload={insightsPayload} />
            </SectionCard>
          </div>

          {/* ── Onglets ───────────────────────────────────────────────── */}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="produits">Produits ({produits.length})</TabsTrigger>
              <TabsTrigger value="stock">Stock & alertes</TabsTrigger>
              <TabsTrigger value="mouvements">Mouvements ({mouvements.length})</TabsTrigger>
            </TabsList>

            {/* ── Produits ───────────────────────────────────────────── */}
            <TabsContent value="produits">
              <Card className="mt-2">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3 mb-4 flex-wrap">
                    <div className="relative flex-1 min-w-[220px]">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <Input
                        placeholder="Rechercher SKU, désignation, catégorie…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8"
                        aria-label="Rechercher un produit"
                      />
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Switch checked={includeInactifs} onCheckedChange={setIncludeInactifs} id="incl-inactifs" />
                      <Label htmlFor="incl-inactifs" className="cursor-pointer">Inclure inactifs</Label>
                    </div>
                  </div>

                  {produitsAffiches.length === 0 ? (
                    <OpsEmpty
                      icon={Package}
                      title={search ? "Aucun produit trouvé" : "Aucun produit"}
                      description={
                        search
                          ? "Aucun article ne correspond à votre recherche."
                          : "Créez votre premier article pour démarrer le suivi de stock."
                      }
                      action={
                        !search ? (
                          <Button size="sm" onClick={() => setProduitDialogOpen(true)}>
                            <Plus className="h-4 w-4 mr-1" /> Nouveau produit
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <SortHead k="sku">SKU</SortHead>
                            <SortHead k="designation">Désignation</SortHead>
                            <TableHead>Catégorie</TableHead>
                            <SortHead k="stock" align="right">Stock</SortHead>
                            <SortHead k="cump" align="right">CUMP</SortHead>
                            <SortHead k="valeur" align="right">Valeur stock</SortHead>
                            <SortHead k="marge" align="right">Marge/u</SortHead>
                            <SortHead k="prix" align="right">Prix vente HT</SortHead>
                            <TableHead>Statut</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {produitsAffiches.map((p) => {
                            const alerte = alertesParProduit.get(p.id)
                            const marge = margeUnitaire(p)
                            return (
                              <TableRow key={p.id}>
                                <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                                <TableCell>
                                  <Link href={`/client/inventaire/${p.id}`} className="font-medium hover:underline text-[#0B0F2E]">
                                    {p.designation}
                                  </Link>
                                </TableCell>
                                <TableCell className="text-muted-foreground">{p.categorie || "—"}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {p.gere_en_stock ? `${fmtQte(stockTotal(p))} ${p.unite_mesure}` : "n/a"}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{fmtMoney(p.cout_unitaire_moyen)}</TableCell>
                                <TableCell className="text-right tabular-nums font-medium">{fmtMoney(valeurTotale(p))}</TableCell>
                                <TableCell className={`text-right tabular-nums font-medium ${signedClass(marge)}`}>
                                  {fmtMoney(marge)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{fmtMoney(p.prix_vente_ht)}</TableCell>
                                <TableCell>
                                  <div className="flex gap-1 flex-wrap">
                                    {!p.actif && <Badge variant="secondary">Inactif</Badge>}
                                    {alerte && <AlerteBadge type={alerte.type_alerte} />}
                                    {p.actif && !alerte && (
                                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">OK</Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      title="Entrée de stock"
                                      aria-label={`Entrée de stock ${p.sku}`}
                                      onClick={() => openMouvement(p.id, "entree_achat")}
                                    >
                                      <ArrowDownToLine className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      title="Sortie de stock"
                                      aria-label={`Sortie de stock ${p.sku}`}
                                      onClick={() => openMouvement(p.id, "sortie_vente")}
                                    >
                                      <ArrowUpFromLine className="h-4 w-4" />
                                    </Button>
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

            {/* ── Stock & alertes ────────────────────────────────────── */}
            <TabsContent value="stock" className="space-y-4">
              {alertes.length > 0 && (
                <SectionCard title="Alertes actives" subtitle="Ruptures et seuils à traiter en priorité" className="mt-2">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produit</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Quantité constatée</TableHead>
                          <TableHead className="text-right">Seuil</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {alertes.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell>
                              <span className="font-mono text-xs mr-2">{a.produits?.sku}</span>
                              <Link href={`/client/inventaire/${a.produit_id}`} className="hover:underline">
                                {a.produits?.designation}
                              </Link>
                            </TableCell>
                            <TableCell><AlerteBadge type={a.type_alerte} /></TableCell>
                            <TableCell className="text-right tabular-nums">{fmtQte(a.quantite_constatee)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {a.seuil_reference != null ? fmtQte(a.seuil_reference) : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openMouvement(a.produit_id, "entree_achat")}
                              >
                                <ArrowDownToLine className="h-4 w-4 mr-1" /> Réapprovisionner
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </SectionCard>
              )}

              <SectionCard
                title="Niveaux de stock par dépôt"
                subtitle="Quantités et valorisation CUMP par emplacement"
                className={alertes.length > 0 ? undefined : "mt-2"}
              >
                {niveaux.length === 0 ? (
                  <OpsEmpty
                    icon={Boxes}
                    title="Aucun niveau de stock"
                    description="Enregistrez un premier mouvement d’entrée pour alimenter vos dépôts."
                    action={
                      <Button size="sm" onClick={() => openMouvement()}>
                        <ArrowDownToLine className="h-4 w-4 mr-1" /> Enregistrer une entrée
                      </Button>
                    }
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produit</TableHead>
                          <TableHead>Dépôt</TableHead>
                          <TableHead className="text-right">Quantité</TableHead>
                          <TableHead className="text-right">CUMP</TableHead>
                          <TableHead className="text-right">Valeur</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {niveaux.map((n) => (
                          <TableRow key={n.id}>
                            <TableCell>
                              <span className="font-mono text-xs mr-2">{n.produits?.sku}</span>
                              <Link href={`/client/inventaire/${n.produit_id}`} className="hover:underline">
                                {n.produits?.designation}
                              </Link>
                            </TableCell>
                            <TableCell>{n.depots?.nom || "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtQte(n.quantite)} {n.produits?.unite_mesure}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtMoney(n.produits?.cout_unitaire_moyen || 0)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fmtMoney(n.valeur_stock)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </SectionCard>
            </TabsContent>

            {/* ── Mouvements ─────────────────────────────────────────── */}
            <TabsContent value="mouvements">
              <Card className="mt-2">
                <CardContent className="pt-4">
                  {mouvements.length === 0 ? (
                    <OpsEmpty
                      icon={ClipboardList}
                      title="Aucun mouvement"
                      description="Le journal des entrées et sorties valorisées apparaîtra ici."
                      action={
                        <Button size="sm" onClick={() => openMouvement()}>
                          <ArrowDownToLine className="h-4 w-4 mr-1" /> Nouveau mouvement
                        </Button>
                      }
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Produit</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Dépôt</TableHead>
                            <TableHead className="text-right">Quantité</TableHead>
                            <TableHead className="text-right">Coût unitaire</TableHead>
                            <TableHead className="text-right">Valeur</TableHead>
                            <TableHead>Motif</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {mouvements.map((m) => (
                            <TableRow key={m.id}>
                              <TableCell className="whitespace-nowrap tabular-nums">{m.date_mouvement}</TableCell>
                              <TableCell>
                                <span className="font-mono text-xs mr-2">{m.produits?.sku}</span>
                                {m.produits?.designation}
                              </TableCell>
                              <TableCell>
                                <Badge variant={m.sens === "E" ? "default" : "secondary"}>
                                  {LIBELLES_TYPE_MOUVEMENT[m.type_mouvement] || m.type_mouvement}
                                </Badge>
                              </TableCell>
                              <TableCell>{m.depots?.nom || "—"}</TableCell>
                              <TableCell className={`text-right tabular-nums font-medium ${m.sens === "E" ? "text-[#0F766E]" : "text-[#9F1239]"}`}>
                                {m.sens === "E" ? "+" : "−"}
                                {fmtQte(m.quantite)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{fmtMoney(m.cout_unitaire)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtMoney(m.valeur_mouvement)}</TableCell>
                              <TableCell className="text-muted-foreground max-w-[240px] truncate">
                                {m.motif || "—"}
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

      {/* ── Dialog nouveau produit ─────────────────────────────────────── */}
      <Dialog open={produitDialogOpen} onOpenChange={setProduitDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouveau produit</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>SKU *</Label>
              <Input value={pSku} onChange={(e) => setPSku(e.target.value)} placeholder="CIM-25" />
            </div>
            <div>
              <Label>Catégorie</Label>
              <Input value={pCategorie} onChange={(e) => setPCategorie(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Désignation *</Label>
              <Input value={pDesignation} onChange={(e) => setPDesignation(e.target.value)} />
            </div>
            <div>
              <Label>Unité de mesure</Label>
              <Input value={pUnite} onChange={(e) => setPUnite(e.target.value)} placeholder="unite, kg, m…" />
            </div>
            <div>
              <Label>Prix de vente HT (MUR)</Label>
              <Input type="number" min="0" step="0.01" value={pPrixVente} onChange={(e) => setPPrixVente(e.target.value)} />
            </div>
            <div>
              <Label>TVA (%)</Label>
              <Input type="number" min="0" max="100" step="0.01" value={pTva} onChange={(e) => setPTva(e.target.value)} />
            </div>
            <div>
              <Label>Seuil d&apos;alerte</Label>
              <Input type="number" min="0" step="0.001" value={pSeuil} onChange={(e) => setPSeuil(e.target.value)} />
            </div>
            <div>
              <Label>Stock minimum</Label>
              <Input type="number" min="0" step="0.001" value={pStockMini} onChange={(e) => setPStockMini(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={pGereEnStock} onCheckedChange={setPGereEnStock} />
              <span className="text-sm">Géré en stock</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProduitDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submitProduit} disabled={submitting || !pSku.trim() || !pDesignation.trim()}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog mouvement ───────────────────────────────────────────── */}
      <Dialog open={mvtDialogOpen} onOpenChange={setMvtDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mouvement de stock</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Produit *</Label>
              <Select value={mProduitId} onValueChange={setMProduitId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un produit" />
                </SelectTrigger>
                <SelectContent>
                  {produits
                    .filter((p) => p.gere_en_stock && p.actif)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.sku} — {p.designation}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type de mouvement *</Label>
              <Select value={mType} onValueChange={(v) => setMType(v as TypeMouvement)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES_SAISIE.map((t) => (
                    <SelectItem key={t} value={t}>
                      {LIBELLES_TYPE_MOUVEMENT[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantité *</Label>
                <Input type="number" min="0" step="0.001" value={mQuantite} onChange={(e) => setMQuantite(e.target.value)} />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} />
              </div>
            </div>
            {isEntreeAchat ? (
              <div>
                <Label>Coût unitaire d&apos;achat (MUR) *</Label>
                <Input type="number" min="0" step="0.0001" value={mCout} onChange={(e) => setMCout(e.target.value)} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Mouvement valorisé automatiquement au coût unitaire moyen pondéré (CUMP) courant.
              </p>
            )}
            <div>
              <Label>Motif</Label>
              <Input value={mMotif} onChange={(e) => setMMotif(e.target.value)} placeholder="Réception BL n°…, casse, inventaire…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMvtDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={submitMouvement}
              disabled={submitting || !mProduitId || !(Number(mQuantite) > 0) || (isEntreeAchat && !(Number(mCout) >= 0 && mCout !== ""))}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPageShell>
  )
}
