"use client"

/**
 * Page /client/manufacturing — Manufacturing (Module C, MVP).
 *
 * Onglets : Nomenclatures (liste + création de BOM mono-niveau),
 * Ordres de fabrication (liste + lancement d'un OF depuis une BOM active).
 * Le suivi d'un OF (consommation, clôture) est sur /client/manufacturing/[id].
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
import { Factory, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
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
  numero_of: string
  statut: StatutOF
  quantite_a_produire: number
  quantite_produite: number
  cout_matieres_reel: number
  cout_unitaire_revient: number | null
  date_planifiee: string | null
  nomenclatures?: {
    version: string
    produits?: { sku: string; designation: string; unite_mesure: string } | null
  } | null
  depots?: { nom: string } | null
}

interface LigneForm {
  produit_composant_id: string
  quantite: string
  taux_perte_pct: string
}

function fmtMoney(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " MUR"
}

function fmtQte(n: number): string {
  return (Number(n) || 0).toLocaleString("fr-FR", { maximumFractionDigits: 3 })
}

function StatutOFBadge({ statut }: { statut: StatutOF }) {
  if (statut === "cloture")
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Clôturé</Badge>
  if (statut === "en_cours")
    return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">En cours</Badge>
  if (statut === "annule") return <Badge variant="secondary">Annulé</Badge>
  return <Badge variant="outline">{LIBELLES_STATUT_OF[statut] || statut}</Badge>
}

export default function ManufacturingPage() {
  const { societeId } = useSocieteActive()
  const [tab, setTab] = useState("nomenclatures")
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const [produits, setProduits] = useState<ProduitOption[]>([])
  const [nomenclatures, setNomenclatures] = useState<NomenclatureRow[]>([])
  const [ordres, setOrdres] = useState<OrdreRow[]>([])
  const [submitting, setSubmitting] = useState(false)

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

  const resetBomForm = () => {
    setBProduitFini("")
    setBLibelle("")
    setBQuantiteLot("1")
    setBLignes([{ produit_composant_id: "", quantite: "", taux_perte_pct: "0" }])
  }

  const setLigne = (i: number, patch: Partial<LigneForm>) => {
    setBLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  }

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

  return (
    <ClientPageShell
      breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Manufacturing" }]}
      kicker="Gestion commerciale"
      title="Manufacturing"
      subtitle="Nomenclatures (BOM) et ordres de fabrication — consommation de composants, production valorisée au coût de revient réel."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
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
          className={`mb-4 rounded-md px-4 py-2 text-sm ${
            toast.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="nomenclatures">Nomenclatures ({nomenclatures.length})</TabsTrigger>
          <TabsTrigger value="ordres">Ordres de fabrication ({ordres.length})</TabsTrigger>
        </TabsList>

        {/* ── Nomenclatures ────────────────────────────────────────── */}
        <TabsContent value="nomenclatures">
          <Card>
            <CardContent className="pt-4">
              {nomenclatures.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Factory className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>
                    Aucune nomenclature. Créez une BOM (produit fini + composants) pour lancer
                    votre premier ordre de fabrication.
                  </p>
                </div>
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
                            <span className="font-medium">{n.produits?.designation}</span>
                          </TableCell>
                          <TableCell>{n.version}</TableCell>
                          <TableCell className="text-muted-foreground">{n.libelle || "—"}</TableCell>
                          <TableCell className="text-right">
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
                          <TableCell className="text-right">{fmtMoney(n.cout_matieres_estime)}</TableCell>
                          <TableCell>
                            {n.statut === "active" ? (
                              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Active</Badge>
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

        {/* ── Ordres de fabrication ────────────────────────────────── */}
        <TabsContent value="ordres">
          <Card>
            <CardContent className="pt-4">
              {ordres.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Aucun ordre de fabrication.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>N° OF</TableHead>
                        <TableHead>Produit fini</TableHead>
                        <TableHead>Dépôt</TableHead>
                        <TableHead className="text-right">À produire</TableHead>
                        <TableHead className="text-right">Produit</TableHead>
                        <TableHead className="text-right">Coût matières</TableHead>
                        <TableHead className="text-right">Revient unitaire</TableHead>
                        <TableHead>Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordres.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell>
                            <Link
                              href={`/client/manufacturing/${o.id}`}
                              className="font-mono text-xs font-medium hover:underline"
                            >
                              {o.numero_of}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-xs mr-2">
                              {o.nomenclatures?.produits?.sku}
                            </span>
                            {o.nomenclatures?.produits?.designation}
                          </TableCell>
                          <TableCell>{o.depots?.nom || "—"}</TableCell>
                          <TableCell className="text-right">{fmtQte(o.quantite_a_produire)}</TableCell>
                          <TableCell className="text-right">{fmtQte(o.quantite_produite)}</TableCell>
                          <TableCell className="text-right">{fmtMoney(o.cout_matieres_reel)}</TableCell>
                          <TableCell className="text-right">
                            {o.cout_unitaire_revient != null ? fmtMoney(o.cout_unitaire_revient) : "—"}
                          </TableCell>
                          <TableCell>
                            <StatutOFBadge statut={o.statut} />
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
                {bLignes.map((l, i) => (
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
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
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
