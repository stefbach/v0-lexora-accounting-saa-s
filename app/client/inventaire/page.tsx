"use client"

/**
 * Page /client/inventaire — Gestion de stock (Module A, Phase 1).
 *
 * Onglets : Produits (catalogue + CRUD), Stock & alertes (niveaux par dépôt,
 * badges seuil bas/rupture), Mouvements (journal immuable + saisie
 * entrée/sortie/ajustement via la RPC atomique).
 */

import { useCallback, useEffect, useMemo, useState } from "react"
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
  RefreshCw,
  Search,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
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

function fmtMoney(n: number): string {
  return (Number(n) || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " MUR"
}

function fmtQte(n: number): string {
  return (Number(n) || 0).toLocaleString("fr-FR", { maximumFractionDigits: 3 })
}

function AlerteBadge({ type }: { type: AlerteRow["type_alerte"] }) {
  if (type === "rupture") return <Badge variant="destructive">Rupture</Badge>
  if (type === "seuil_bas")
    return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Seuil bas</Badge>
  return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Surstockage</Badge>
}

export default function InventairePage() {
  const { societeId } = useSocieteActive()
  const [tab, setTab] = useState("produits")
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const [produits, setProduits] = useState<ProduitRow[]>([])
  const [niveaux, setNiveaux] = useState<NiveauRow[]>([])
  const [alertes, setAlertes] = useState<AlerteRow[]>([])
  const [mouvements, setMouvements] = useState<MouvementRow[]>([])
  const [includeInactifs, setIncludeInactifs] = useState(false)
  const [search, setSearch] = useState("")

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

  const alertesParProduit = useMemo(() => {
    const map = new Map<string, AlerteRow>()
    for (const a of alertes) if (!map.has(a.produit_id)) map.set(a.produit_id, a)
    return map
  }, [alertes])

  const stockTotal = (p: ProduitRow) =>
    (p.stock_niveaux || []).reduce((s, n) => s + (Number(n.quantite) || 0), 0)
  const valeurTotale = (p: ProduitRow) =>
    (p.stock_niveaux || []).reduce((s, n) => s + (Number(n.valeur_stock) || 0), 0)

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

  const openMouvement = (produitId?: string, type?: TypeMouvement) => {
    setMProduitId(produitId || "")
    setMType(type || "entree_achat")
    setMQuantite("")
    setMCout("")
    setMDate(new Date().toISOString().slice(0, 10))
    setMMotif("")
    setMvtDialogOpen(true)
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

  return (
    <ClientPageShell
      breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Inventaire" }]}
      kicker="Gestion commerciale"
      title="Stock & inventaire"
      subtitle="Catalogue produits, niveaux de stock valorisés au CUMP, journal des mouvements et alertes de seuil."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button size="sm" onClick={() => openMouvement()}>
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
          className={`mb-4 rounded-md px-4 py-2 text-sm ${
            toast.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {alertes.length > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50/60">
          <CardContent className="py-3 flex items-center gap-3 flex-wrap">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-sm text-amber-900 font-medium">
              {alertes.length} alerte{alertes.length > 1 ? "s" : ""} de stock active
              {alertes.length > 1 ? "s" : ""}
            </span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setTab("stock")}>
              Voir
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="produits">Produits ({produits.length})</TabsTrigger>
          <TabsTrigger value="stock">Stock & alertes</TabsTrigger>
          <TabsTrigger value="mouvements">Mouvements ({mouvements.length})</TabsTrigger>
        </TabsList>

        {/* ── Produits ─────────────────────────────────────────────── */}
        <TabsContent value="produits">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher SKU, désignation, catégorie…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Switch checked={includeInactifs} onCheckedChange={setIncludeInactifs} />
                  <span>Inclure inactifs</span>
                </div>
              </div>

              {produitsFiltres.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Aucun produit. Créez votre premier article pour démarrer le suivi de stock.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Désignation</TableHead>
                        <TableHead>Catégorie</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">CUMP</TableHead>
                        <TableHead className="text-right">Valeur stock</TableHead>
                        <TableHead className="text-right">Prix vente HT</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {produitsFiltres.map((p) => {
                        const alerte = alertesParProduit.get(p.id)
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                            <TableCell>
                              <Link href={`/client/inventaire/${p.id}`} className="font-medium hover:underline">
                                {p.designation}
                              </Link>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{p.categorie || "—"}</TableCell>
                            <TableCell className="text-right">
                              {p.gere_en_stock ? `${fmtQte(stockTotal(p))} ${p.unite_mesure}` : "n/a"}
                            </TableCell>
                            <TableCell className="text-right">{fmtMoney(p.cout_unitaire_moyen)}</TableCell>
                            <TableCell className="text-right">{fmtMoney(valeurTotale(p))}</TableCell>
                            <TableCell className="text-right">{fmtMoney(p.prix_vente_ht)}</TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {!p.actif && <Badge variant="secondary">Inactif</Badge>}
                                {alerte && <AlerteBadge type={alerte.type_alerte} />}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Entrée de stock"
                                  onClick={() => openMouvement(p.id, "entree_achat")}
                                >
                                  <ArrowDownToLine className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Sortie de stock"
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

        {/* ── Stock & alertes ──────────────────────────────────────── */}
        <TabsContent value="stock">
          {alertes.length > 0 && (
            <Card className="mb-4">
              <CardContent className="pt-4">
                <h3 className="text-sm font-semibold mb-3">Alertes actives</h3>
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
                            {a.produits?.designation}
                          </TableCell>
                          <TableCell><AlerteBadge type={a.type_alerte} /></TableCell>
                          <TableCell className="text-right">{fmtQte(a.quantite_constatee)}</TableCell>
                          <TableCell className="text-right">
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
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-4">
              <h3 className="text-sm font-semibold mb-3">Niveaux de stock par dépôt</h3>
              {niveaux.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Aucun niveau de stock — enregistrez un premier mouvement d&apos;entrée.
                </p>
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
                          <TableCell className="text-right">
                            {fmtQte(n.quantite)} {n.produits?.unite_mesure}
                          </TableCell>
                          <TableCell className="text-right">
                            {fmtMoney(n.produits?.cout_unitaire_moyen || 0)}
                          </TableCell>
                          <TableCell className="text-right">{fmtMoney(n.valeur_stock)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Mouvements ───────────────────────────────────────────── */}
        <TabsContent value="mouvements">
          <Card>
            <CardContent className="pt-4">
              {mouvements.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Aucun mouvement enregistré.
                </p>
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
                          <TableCell className="whitespace-nowrap">{m.date_mouvement}</TableCell>
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
                          <TableCell className="text-right">
                            {m.sens === "E" ? "+" : "−"}
                            {fmtQte(m.quantite)}
                          </TableCell>
                          <TableCell className="text-right">{fmtMoney(m.cout_unitaire)}</TableCell>
                          <TableCell className="text-right">{fmtMoney(m.valeur_mouvement)}</TableCell>
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

      {/* ── Dialog nouveau produit ─────────────────────────────────── */}
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

      {/* ── Dialog mouvement ───────────────────────────────────────── */}
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
