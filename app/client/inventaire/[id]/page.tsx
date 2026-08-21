"use client"

/**
 * Page /client/inventaire/[id] — Fiche produit enrichie : KPI (stock, valeur,
 * CUMP, marge), courbe d'évolution stock/valeur reconstituée depuis le journal
 * des mouvements, répartition par dépôt et timeline lisible des mouvements.
 *
 * ⚠️ Refonte de PRÉSENTATION : la logique (fetch fiche, édition PATCH,
 * désactivation DELETE) est conservée à l'identique.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
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
import {
  Loader2,
  Pencil,
  ArrowLeft,
  Archive,
  Boxes,
  Wallet,
  Coins,
  Percent,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Warehouse,
} from "lucide-react"
import {
  ComposedChart,
  Area,
  Line,
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
  SectionCard,
  ChartCard,
  OpsEmpty,
  OpsSkeleton,
  formatMUR,
} from "@/components/operations"
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

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
const GOLD_TXT = "#A88925"
const TEAL = "#0F766E"
const RED = "#9F1239"

function fmtMoney(n: number): string {
  return (Number(n) || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " MUR"
}

function fmtQte(n: number): string {
  return (Number(n) || 0).toLocaleString("fr-FR", { maximumFractionDigits: 3 })
}

function fmtDate(d: string): string {
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
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
  const marge = produit ? (Number(produit.prix_vente_ht) || 0) - (Number(produit.cout_unitaire_moyen) || 0) : 0
  const margePct =
    produit && Number(produit.prix_vente_ht) > 0 ? (marge / Number(produit.prix_vente_ht)) * 100 : null

  // ── Évolution stock & valeur (cumul chronologique depuis le journal) ──
  const evolution = useMemo(() => {
    if (mouvements.length === 0) return [] as { date: string; stock: number; valeur: number }[]
    const ordered = [...mouvements].sort(
      (a, b) => new Date(a.date_mouvement).getTime() - new Date(b.date_mouvement).getTime(),
    )
    let cumQte = 0
    let cumVal = 0
    const points = ordered.map((m) => {
      const q = Number(m.quantite) || 0
      const v = Number(m.valeur_mouvement) || 0
      if (m.sens === "E") {
        cumQte += q
        cumVal += v
      } else {
        cumQte -= q
        cumVal -= v
      }
      return {
        date: fmtDate(m.date_mouvement),
        stock: Math.round(cumQte * 1000) / 1000,
        valeur: Math.round(cumVal),
      }
    })
    return points.slice(-30)
  }, [mouvements])

  const showSkeleton = loading && !produit

  return (
    <ClientPageShell
      disableParticles
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
          role="status"
          className={`mb-4 rounded-md px-4 py-2 text-sm ${
            toast.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {showSkeleton ? (
        <OpsSkeleton kpis={4} chart rows={5} />
      ) : !produit ? (
        <OpsEmpty
          icon={Boxes}
          title="Produit introuvable"
          description="Ce produit n’existe pas ou n’est pas accessible pour la société active."
          action={
            <Button size="sm" variant="outline" onClick={() => router.push("/client/inventaire")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Retour à l’inventaire
            </Button>
          }
        />
      ) : (
        <>
          {/* ── KPI ───────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <KpiCard
              label="Stock courant"
              value={
                <>
                  {fmtQte(totalQuantite)} <span className="text-sm font-normal text-gray-400">{produit.unite_mesure}</span>
                </>
              }
              icon={Boxes}
              color={NAVY}
              hint={!produit.actif ? "Produit inactif" : produit.gere_en_stock ? "Géré en stock" : "Non géré en stock"}
            />
            <KpiCard
              label="Valeur du stock"
              value={formatMUR(totalValeur)}
              icon={Wallet}
              color={GOLD_TXT}
              hint="Valorisation CUMP"
            />
            <KpiCard
              label="CUMP courant"
              value={formatMUR(produit.cout_unitaire_moyen, 2)}
              icon={Coins}
              color={NAVY}
              hint="Coût unitaire moyen pondéré"
            />
            <KpiCard
              label="Marge unitaire"
              value={formatMUR(marge, 2)}
              icon={Percent}
              color={marge < 0 ? RED : TEAL}
              hint={margePct != null ? `Taux de marge ${margePct.toFixed(1)} %` : "Prix vente HT − CUMP"}
            />
          </div>

          {/* ── Évolution ─────────────────────────────────────────────── */}
          <ChartCard
            title="Évolution du stock et de la valeur"
            subtitle="Cumul reconstitué depuis le journal des mouvements"
            height={280}
            className="mb-4"
          >
            {evolution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={evolution} margin={{ top: 8, right: 12, left: 6, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradFicheVal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={GOLD} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#E5E7EB" }} minTickGap={24} />
                  <YAxis
                    yAxisId="valeur"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                    width={44}
                  />
                  <YAxis
                    yAxisId="stock"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip
                    formatter={(v: number, name) =>
                      name === "Valeur" ? [formatMUR(v), "Valeur"] : [fmtQte(v), "Stock"]
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    yAxisId="valeur"
                    type="monotone"
                    dataKey="valeur"
                    name="Valeur"
                    stroke={GOLD_TXT}
                    strokeWidth={2}
                    fill="url(#gradFicheVal)"
                  />
                  <Line
                    yAxisId="stock"
                    type="monotone"
                    dataKey="stock"
                    name="Stock"
                    stroke={NAVY}
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <OpsEmpty
                  icon={History}
                  title="Pas encore de mouvement"
                  description="La courbe d’évolution apparaîtra dès le premier mouvement enregistré."
                />
              </div>
            )}
          </ChartCard>

          {/* ── Caractéristiques ──────────────────────────────────────── */}
          <SectionCard title="Caractéristiques" className="mb-4">
            <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
              <div><span className="text-muted-foreground">Catégorie : </span>{produit.categorie || "—"}</div>
              <div><span className="text-muted-foreground">Prix de vente HT : </span>{fmtMoney(produit.prix_vente_ht)}</div>
              <div><span className="text-muted-foreground">TVA : </span>{produit.taux_tva}%</div>
              <div><span className="text-muted-foreground">Seuil d&apos;alerte : </span>{produit.seuil_alerte != null ? fmtQte(produit.seuil_alerte) : "—"}</div>
              <div><span className="text-muted-foreground">Stock mini / maxi : </span>{fmtQte(produit.stock_mini)} / {produit.stock_maxi != null ? fmtQte(produit.stock_maxi) : "—"}</div>
              <div><span className="text-muted-foreground">Géré en stock : </span>{produit.gere_en_stock ? "Oui" : "Non"}</div>
              <div className="sm:col-span-2 lg:col-span-3">
                <span className="text-muted-foreground">Comptes (stock / variation / achat / vente) : </span>
                <span className="font-mono text-xs">
                  {produit.compte_stock} / {produit.compte_variation_stock} / {produit.compte_achat} / {produit.compte_vente}
                </span>
              </div>
            </div>
          </SectionCard>

          {/* ── Stock par dépôt ───────────────────────────────────────── */}
          {niveaux.length > 0 && (
            <SectionCard title="Stock par dépôt" subtitle="Répartition de la quantité et de la valeur" className="mb-4">
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
                        <TableCell className="flex items-center gap-2">
                          <Warehouse className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          {n.depots?.nom || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtQte(n.quantite)} {produit.unite_mesure}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmtMoney(n.valeur_stock)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          )}

          {/* ── Timeline des mouvements ───────────────────────────────── */}
          <SectionCard title="Historique des mouvements" subtitle={`${mouvements.length} mouvement${mouvements.length > 1 ? "s" : ""} valorisé${mouvements.length > 1 ? "s" : ""}`}>
            {mouvements.length === 0 ? (
              <OpsEmpty icon={History} title="Aucun mouvement" description="Ce produit n’a pas encore de mouvement enregistré." />
            ) : (
              <ol className="relative space-y-3">
                {mouvements.map((m) => {
                  const entree = m.sens === "E"
                  const accent = entree ? TEAL : RED
                  const Icon = entree ? ArrowDownToLine : ArrowUpFromLine
                  return (
                    <li
                      key={m.id}
                      className="rounded-lg border bg-white p-3 pl-4"
                      style={{ borderLeft: `3px solid ${accent}` }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${accent}14` }}
                          aria-hidden="true"
                        >
                          <Icon className="w-4 h-4" style={{ color: accent }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={entree ? "default" : "secondary"}>
                                {LIBELLES_TYPE_MOUVEMENT[m.type_mouvement] || m.type_mouvement}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{fmtDate(m.date_mouvement)}</span>
                              {m.depots?.nom && (
                                <span className="text-xs text-muted-foreground">· {m.depots.nom}</span>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-semibold tabular-nums" style={{ color: accent }}>
                                {entree ? "+" : "−"}{fmtQte(m.quantite)}
                              </span>
                              <span className="text-xs text-muted-foreground ml-2 tabular-nums">
                                {fmtMoney(m.valeur_mouvement)}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Coût unitaire {fmtMoney(m.cout_unitaire)}
                            {m.motif ? <span className="text-gray-600"> · {m.motif}</span> : null}
                          </p>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </SectionCard>
        </>
      )}

      {/* ── Dialog édition ─────────────────────────────────────────────── */}
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
