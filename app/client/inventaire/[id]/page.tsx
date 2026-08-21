"use client"

/**
 * Page /client/inventaire/[id] — Fiche produit : caractéristiques, comptes,
 * niveaux de stock par dépôt et historique des mouvements (journal immuable).
 */

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
import { Loader2, Pencil, ArrowLeft, Archive } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { LIBELLES_TYPE_MOUVEMENT, type TypeMouvement } from "@/lib/inventaire/types"

interface ProduitDetail {
  id: string
  sku: string
  designation: string
  description: string | null
  categorie: string | null
  unite_mesure: string
  gere_en_stock: boolean
  cout_unitaire_moyen: number
  prix_vente_ht: number
  taux_tva: number
  compte_stock: string
  compte_achat: string
  compte_vente: string
  compte_variation_stock: string
  stock_mini: number
  stock_maxi: number | null
  seuil_alerte: number | null
  actif: boolean
}

interface NiveauDetail {
  depot_id: string
  quantite: number
  valeur_stock: number
  depots?: { nom: string; type: string } | null
}

interface MouvementDetail {
  id: string
  type_mouvement: TypeMouvement
  sens: "E" | "S"
  quantite: number
  cout_unitaire: number
  valeur_mouvement: number
  date_mouvement: string
  motif: string | null
  depots?: { nom: string } | null
}

function fmtMoney(n: number): string {
  return (Number(n) || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " MUR"
}

function fmtQte(n: number): string {
  return (Number(n) || 0).toLocaleString("fr-FR", { maximumFractionDigits: 3 })
}

export default function FicheProduitPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const produitId = params?.id

  const [loading, setLoading] = useState(true)
  const [produit, setProduit] = useState<ProduitDetail | null>(null)
  const [niveaux, setNiveaux] = useState<NiveauDetail[]>([])
  const [mouvements, setMouvements] = useState<MouvementDetail[]>([])
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }

  const load = useCallback(async () => {
    if (!produitId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/client/inventaire/produits/${produitId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      setProduit(data.item)
      setNiveaux(data.niveaux || [])
      setMouvements(data.mouvements || [])
    } catch (e: any) {
      showToast(e?.message || "Erreur de chargement", "error")
    } finally {
      setLoading(false)
    }
  }, [produitId])

  useEffect(() => {
    load()
  }, [load])

  const openEdit = () => {
    if (!produit) return
    setForm({
      sku: produit.sku,
      designation: produit.designation,
      categorie: produit.categorie || "",
      unite_mesure: produit.unite_mesure,
      prix_vente_ht: String(produit.prix_vente_ht ?? 0),
      taux_tva: String(produit.taux_tva ?? 15),
      seuil_alerte: produit.seuil_alerte != null ? String(produit.seuil_alerte) : "",
      stock_mini: String(produit.stock_mini ?? 0),
      stock_maxi: produit.stock_maxi != null ? String(produit.stock_maxi) : "",
    })
    setEditOpen(true)
  }

  const submitEdit = async () => {
    if (!produitId) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/inventaire/produits/${produitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          categorie: form.categorie || null,
          seuil_alerte: form.seuil_alerte || null,
          stock_maxi: form.stock_maxi || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast("Produit mis à jour")
      setEditOpen(false)
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const desactiver = async () => {
    if (!produitId || !produit) return
    if (!window.confirm(`Désactiver le produit ${produit.sku} ? Il restera visible dans l'historique.`)) return
    try {
      const res = await fetch(`/api/client/inventaire/produits/${produitId}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast("Produit désactivé")
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    }
  }

  const totalQuantite = niveaux.reduce((s, n) => s + (Number(n.quantite) || 0), 0)
  const totalValeur = niveaux.reduce((s, n) => s + (Number(n.valeur_stock) || 0), 0)

  return (
    <ClientPageShell
      breadcrumbs={[
        { label: "Espace client", href: "/client" },
        { label: "Inventaire", href: "/client/inventaire" },
        { label: produit?.sku || "Produit" },
      ]}
      kicker="Gestion commerciale"
      title={produit ? produit.designation : "Fiche produit"}
      subtitle={produit ? `SKU ${produit.sku} · valorisation CUMP` : undefined}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/client/inventaire")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour
          </Button>
          <Button variant="outline" size="sm" onClick={openEdit} disabled={!produit}>
            <Pencil className="h-4 w-4 mr-1" /> Modifier
          </Button>
          {produit?.actif && (
            <Button variant="outline" size="sm" onClick={desactiver}>
              <Archive className="h-4 w-4 mr-1" /> Désactiver
            </Button>
          )}
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

      {loading ? (
        <div className="py-16 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </div>
      ) : !produit ? (
        <p className="text-center text-muted-foreground py-16">Produit introuvable.</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3 mb-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase">Stock total</p>
                <p className="text-2xl font-semibold">
                  {fmtQte(totalQuantite)} <span className="text-sm font-normal">{produit.unite_mesure}</span>
                </p>
                {!produit.actif && <Badge variant="secondary" className="mt-1">Inactif</Badge>}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase">CUMP courant</p>
                <p className="text-2xl font-semibold">{fmtMoney(produit.cout_unitaire_moyen)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground uppercase">Valeur du stock</p>
                <p className="text-2xl font-semibold">{fmtMoney(totalValeur)}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-4">
            <CardContent className="pt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
              <div><span className="text-muted-foreground">Catégorie : </span>{produit.categorie || "—"}</div>
              <div><span className="text-muted-foreground">Prix de vente HT : </span>{fmtMoney(produit.prix_vente_ht)}</div>
              <div><span className="text-muted-foreground">TVA : </span>{produit.taux_tva}%</div>
              <div><span className="text-muted-foreground">Seuil d&apos;alerte : </span>{produit.seuil_alerte != null ? fmtQte(produit.seuil_alerte) : "—"}</div>
              <div><span className="text-muted-foreground">Stock mini / maxi : </span>{fmtQte(produit.stock_mini)} / {produit.stock_maxi != null ? fmtQte(produit.stock_maxi) : "—"}</div>
              <div><span className="text-muted-foreground">Géré en stock : </span>{produit.gere_en_stock ? "Oui" : "Non"}</div>
              <div><span className="text-muted-foreground">Comptes : </span>
                <span className="font-mono text-xs">
                  {produit.compte_stock} / {produit.compte_variation_stock} / {produit.compte_achat} / {produit.compte_vente}
                </span>
              </div>
            </CardContent>
          </Card>

          {niveaux.length > 0 && (
            <Card className="mb-4">
              <CardContent className="pt-4">
                <h3 className="text-sm font-semibold mb-3">Stock par dépôt</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dépôt</TableHead>
                        <TableHead className="text-right">Quantité</TableHead>
                        <TableHead className="text-right">Valeur</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {niveaux.map((n) => (
                        <TableRow key={n.depot_id}>
                          <TableCell>{n.depots?.nom || "—"}</TableCell>
                          <TableCell className="text-right">{fmtQte(n.quantite)} {produit.unite_mesure}</TableCell>
                          <TableCell className="text-right">{fmtMoney(n.valeur_stock)}</TableCell>
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
              <h3 className="text-sm font-semibold mb-3">Historique des mouvements</h3>
              {mouvements.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Aucun mouvement.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
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
                            <Badge variant={m.sens === "E" ? "default" : "secondary"}>
                              {LIBELLES_TYPE_MOUVEMENT[m.type_mouvement] || m.type_mouvement}
                            </Badge>
                          </TableCell>
                          <TableCell>{m.depots?.nom || "—"}</TableCell>
                          <TableCell className="text-right">
                            {m.sens === "E" ? "+" : "−"}{fmtQte(m.quantite)}
                          </TableCell>
                          <TableCell className="text-right">{fmtMoney(m.cout_unitaire)}</TableCell>
                          <TableCell className="text-right">{fmtMoney(m.valeur_mouvement)}</TableCell>
                          <TableCell className="text-muted-foreground max-w-[240px] truncate">{m.motif || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Dialog édition ─────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier le produit</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>SKU *</Label>
              <Input value={form.sku || ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div>
              <Label>Catégorie</Label>
              <Input value={form.categorie || ""} onChange={(e) => setForm({ ...form, categorie: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Désignation *</Label>
              <Input value={form.designation || ""} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            </div>
            <div>
              <Label>Unité de mesure</Label>
              <Input value={form.unite_mesure || ""} onChange={(e) => setForm({ ...form, unite_mesure: e.target.value })} />
            </div>
            <div>
              <Label>Prix de vente HT (MUR)</Label>
              <Input type="number" min="0" step="0.01" value={form.prix_vente_ht || ""} onChange={(e) => setForm({ ...form, prix_vente_ht: e.target.value })} />
            </div>
            <div>
              <Label>TVA (%)</Label>
              <Input type="number" min="0" max="100" step="0.01" value={form.taux_tva || ""} onChange={(e) => setForm({ ...form, taux_tva: e.target.value })} />
            </div>
            <div>
              <Label>Seuil d&apos;alerte</Label>
              <Input type="number" min="0" step="0.001" value={form.seuil_alerte || ""} onChange={(e) => setForm({ ...form, seuil_alerte: e.target.value })} />
            </div>
            <div>
              <Label>Stock minimum</Label>
              <Input type="number" min="0" step="0.001" value={form.stock_mini || ""} onChange={(e) => setForm({ ...form, stock_mini: e.target.value })} />
            </div>
            <div>
              <Label>Stock maximum</Label>
              <Input type="number" min="0" step="0.001" value={form.stock_maxi || ""} onChange={(e) => setForm({ ...form, stock_maxi: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
            <Button onClick={submitEdit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPageShell>
  )
}
