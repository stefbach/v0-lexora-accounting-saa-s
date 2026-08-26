"use client"

/**
 * /client/pos/salle — Vue « Salle » du POS restauration.
 *
 * Plan de salle (tables) + additions ouvertes (running tabs) alimentées au fil
 * du service. Une addition encaissée devient un ticket POS via la RPC atomique
 * valider_vente_pos (stock + écritures dans la transaction). Module conçu pour
 * être isolable en application autonome : il ne consomme que les endpoints
 * /api/client/pos/**.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Loader2,
  Plus,
  Minus,
  Trash2,
  Search,
  Utensils,
  Users,
  Ban,
  Banknote,
  ArrowLeft,
  ShoppingCart,
} from "lucide-react"
import Link from "next/link"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { OpsSkeleton } from "@/components/operations"
import { additionTotaux } from "@/lib/pos/restaurant"
import { sumMoney } from "@/lib/money"
import { LIBELLES_MOYEN_PAIEMENT, MOYENS_PAIEMENT, type MoyenPaiement } from "@/lib/pos/types"

interface ProduitRow {
  id: string
  sku: string
  designation: string
  gere_en_stock: boolean
  prix_vente_ht: number
  taux_tva: number
  actif: boolean
}

interface TableRow {
  id: string
  code: string
  nom: string | null
  zone: string | null
  capacite: number | null
  statut: "libre" | "occupee" | "reservee"
  addition: {
    id: string
    numero: string | null
    couverts: number | null
    opened_at: string
    nb_articles: number
    total_ttc: number
  } | null
}

interface LigneAddition {
  id: string
  produit_id: string
  quantite: number
  prix_unitaire_ht: number
  remise_pct: number
  taux_tva: number
  produits?: { sku: string; designation: string } | null
}

interface AdditionDetail {
  id: string
  numero: string | null
  couverts: number | null
  statut: string
  table_id: string | null
  session_caisse_id: string | null
  additions_lignes: LigneAddition[]
  tables_restaurant?: { code: string; nom: string | null } | null
}

interface PaiementSaisie {
  moyen_paiement: MoyenPaiement
  montant: string
  reference: string
}

function fmt(n: number): string {
  return (Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const STATUT_STYLE: Record<TableRow["statut"], string> = {
  libre: "border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50",
  occupee: "border-amber-300 bg-amber-50/70 hover:bg-amber-50",
  reservee: "border-sky-200 bg-sky-50/50 hover:bg-sky-50",
}

export default function SallePage() {
  const { societeId } = useSocieteActive()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const [tables, setTables] = useState<TableRow[]>([])
  const [produits, setProduits] = useState<ProduitRow[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)

  // Addition ouverte dans l'éditeur.
  const [addition, setAddition] = useState<AdditionDetail | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [search, setSearch] = useState("")

  // Création de table.
  const [tableOpen, setTableOpen] = useState(false)
  const [tCode, setTCode] = useState("")
  const [tNom, setTNom] = useState("")
  const [tZone, setTZone] = useState("")
  const [tCapacite, setTCapacite] = useState("")

  // Encaissement.
  const [encaisserOpen, setEncaisserOpen] = useState(false)
  const [paiements, setPaiements] = useState<PaiementSaisie[]>([])

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const [tRes, pRes, sRes] = await Promise.all([
        fetch(`/api/client/pos/tables?societe_id=${societeId}`),
        fetch(`/api/client/inventaire/produits?societe_id=${societeId}`),
        fetch(`/api/client/pos/sessions?societe_id=${societeId}&statut=ouverte`),
      ])
      const tData = await tRes.json()
      const pData = await pRes.json()
      const sData = await sRes.json()
      if (!tRes.ok) throw new Error(tData.error || "Erreur tables")
      setTables(tData.items || [])
      setProduits((pData.items || []).filter((p: ProduitRow) => p.actif))
      setSessionId(((sData.items || [])[0] || null)?.id || null)
    } catch (e: any) {
      showToast(e?.message || "Erreur de chargement", "error")
    } finally {
      setLoading(false)
    }
  }, [societeId])

  useEffect(() => {
    load()
  }, [load])

  const produitsFiltres = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return produits
    return produits.filter((p) => p.designation.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
  }, [produits, search])

  const totaux = useMemo(() => additionTotaux(addition?.additions_lignes || []), [addition])

  // ── Ouvrir / rafraîchir l'éditeur d'addition ────────────────────────────
  const openEditor = useCallback(
    async (additionId: string) => {
      if (!societeId) return
      try {
        const res = await fetch(`/api/client/pos/additions/${additionId}?societe_id=${societeId}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Erreur addition")
        setAddition(data.addition)
        setEditorOpen(true)
      } catch (e: any) {
        showToast(e?.message || "Erreur", "error")
      }
    },
    [societeId],
  )

  // Clic sur une table : ouvre l'addition existante ou en crée une.
  const onTableClick = async (t: TableRow) => {
    if (!societeId) return
    if (t.addition) return openEditor(t.addition.id)
    setSubmitting(true)
    try {
      const res = await fetch("/api/client/pos/additions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, table_id: t.id, session_id: sessionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur ouverture")
      await load()
      await openEditor(data.item.id)
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  // Addition « à emporter » (sans table).
  const openWalkIn = async () => {
    if (!societeId) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/client/pos/additions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, session_id: sessionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      await openEditor(data.item.id)
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const additionAction = async (body: Record<string, unknown>) => {
    if (!societeId || !addition) return null
    const res = await fetch(`/api/client/pos/additions/${addition.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ societe_id: societeId, ...body }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Erreur")
    return data
  }

  const addProduit = async (p: ProduitRow) => {
    if (!addition) return
    try {
      await additionAction({ action: "add_ligne", produit_id: p.id, quantite: 1 })
      await openEditor(addition.id)
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    }
  }

  const changeQte = async (l: LigneAddition, delta: number) => {
    if (!addition) return
    const q = Number(l.quantite) + delta
    try {
      if (q <= 0) await additionAction({ action: "remove_ligne", ligne_id: l.id })
      else await additionAction({ action: "update_ligne", ligne_id: l.id, quantite: q })
      await openEditor(addition.id)
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    }
  }

  const removeLigne = async (l: LigneAddition) => {
    if (!addition) return
    try {
      await additionAction({ action: "remove_ligne", ligne_id: l.id })
      await openEditor(addition.id)
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    }
  }

  const annulerAddition = async () => {
    if (!addition) return
    if (!confirm("Annuler cette addition ? Les lignes seront perdues.")) return
    setSubmitting(true)
    try {
      await additionAction({ action: "annuler" })
      showToast("Addition annulée")
      setEditorOpen(false)
      setAddition(null)
      await load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  // ── Encaissement ────────────────────────────────────────────────────────
  const ouvrirEncaissement = () => {
    if (!sessionId) {
      showToast("Ouvrez d'abord une session de caisse dans le POS.", "error")
      return
    }
    setPaiements([{ moyen_paiement: "especes", montant: String(totaux.total_ttc), reference: "" }])
    setEncaisserOpen(true)
  }

  const totalPaye = useMemo(
    () => sumMoney(paiements.map((p) => Number(p.montant) || 0)),
    [paiements],
  )
  // Signé : > 0 reste à payer, < 0 rendu monnaie.
  const reste = useMemo(
    () => Math.round((totaux.total_ttc - totalPaye) * 100) / 100,
    [totaux.total_ttc, totalPaye],
  )

  const encaisser = async () => {
    if (!addition || !sessionId) return
    setSubmitting(true)
    try {
      const data = await additionAction({
        action: "encaisser",
        session_id: sessionId,
        paiements: paiements
          .filter((p) => Number(p.montant) > 0)
          .map((p) => ({ moyen_paiement: p.moyen_paiement, montant: Number(p.montant), reference: p.reference || null })),
      })
      if (!data) return
      showToast(`Addition encaissée — ticket ${data?.vente?.numero_ticket || ""}`.trim())
      setEncaisserOpen(false)
      setEditorOpen(false)
      setAddition(null)
      await load()
    } catch (e: any) {
      showToast(e?.message || "Erreur d'encaissement", "error")
    } finally {
      setSubmitting(false)
    }
  }

  // ── Création de table ───────────────────────────────────────────────────
  const creerTable = async () => {
    if (!societeId) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/client/pos/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          code: tCode,
          nom: tNom || null,
          zone: tZone || null,
          capacite: tCapacite || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`Table ${data.item.code} créée`)
      setTableOpen(false)
      setTCode(""); setTNom(""); setTZone(""); setTCapacite("")
      await load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const zones = useMemo(() => {
    const set = new Map<string, TableRow[]>()
    for (const t of tables) {
      const z = t.zone || "Salle"
      ;(set.get(z) || set.set(z, []).get(z)!).push(t)
    }
    return Array.from(set.entries())
  }, [tables])

  const nbOccupees = tables.filter((t) => t.addition).length

  return (
    <ClientPageShell
      breadcrumbs={[
        { label: "Espace client", href: "/client" },
        { label: "Point de vente", href: "/client/pos" },
        { label: "Salle" },
      ]}
      kicker="Restauration"
      title="Salle"
      subtitle="Plan de salle et additions ouvertes : ouvrez une table, ajoutez les articles au fil du service, puis encaissez — l'addition devient un ticket POS avec stock et écritures automatiques."
      disableParticles
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/client/pos">
              <ArrowLeft className="h-4 w-4 mr-1" /> Caisse
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={openWalkIn} disabled={submitting}>
            <ShoppingCart className="h-4 w-4 mr-1" /> À emporter
          </Button>
          <Button size="sm" onClick={() => setTableOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Table
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

      {!sessionId && !loading && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Aucune session de caisse ouverte — vous pouvez préparer les additions, mais l&apos;encaissement exige une session
          ouverte (
          <Link href="/client/pos" className="underline font-medium">
            ouvrir la caisse
          </Link>
          ).
        </div>
      )}

      {loading ? (
        <OpsSkeleton kpis={0} rows={4} />
      ) : tables.length === 0 ? (
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center bg-[rgba(212,175,55,0.12)]">
              <Utensils className="h-6 w-6 text-[#A88925]" />
            </div>
            <h2 className="font-semibold text-[#0B0F2E]">Aucune table configurée</h2>
            <p className="text-sm text-muted-foreground">
              Créez vos tables (numéro, zone, capacité) pour dessiner votre plan de salle.
            </p>
            <Button onClick={() => setTableOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Créer une table
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="text-sm text-muted-foreground">
            {tables.length} table{tables.length > 1 ? "s" : ""} · {nbOccupees} occupée{nbOccupees > 1 ? "s" : ""}
          </div>
          {zones.map(([zone, ts]) => (
            <div key={zone} className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{zone}</div>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {ts.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onTableClick(t)}
                    disabled={submitting}
                    className={`rounded-xl border p-3 text-left transition ${STATUT_STYLE[t.statut]} disabled:opacity-60`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#0B0F2E]">{t.code}</span>
                      {t.capacite ? (
                        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                          <Users className="h-3 w-3" /> {t.capacite}
                        </span>
                      ) : null}
                    </div>
                    {t.nom ? <div className="text-[11px] text-muted-foreground truncate">{t.nom}</div> : null}
                    {t.addition ? (
                      <div className="mt-2 space-y-0.5">
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px]">
                          {t.addition.nb_articles} art. · {fmt(t.addition.total_ttc)}
                        </Badge>
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-emerald-700">Libre</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Éditeur d'addition ──────────────────────────────────────────── */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Addition{" "}
              {addition?.tables_restaurant?.code
                ? `— Table ${addition.tables_restaurant.code}`
                : addition?.numero || "à emporter"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-[1fr_320px]">
            {/* Catalogue produits */}
            <div>
              <div className="relative mb-2">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Rechercher un produit…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="grid gap-2 grid-cols-2 max-h-[45vh] overflow-y-auto pr-1">
                {produitsFiltres.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addProduit(p)}
                    className="rounded-lg border p-2 text-left hover:border-[#A88925] hover:bg-amber-50/40 transition"
                  >
                    <div className="font-mono text-[10px] text-muted-foreground">{p.sku}</div>
                    <div className="text-sm font-medium leading-tight line-clamp-2">{p.designation}</div>
                    <div className="mt-1 text-xs text-[#0B0F2E]">{fmt(p.prix_vente_ht * (1 + (p.taux_tva || 0) / 100))}</div>
                  </button>
                ))}
                {produitsFiltres.length === 0 && (
                  <div className="col-span-2 py-6 text-center text-sm text-muted-foreground">Aucun produit</div>
                )}
              </div>
            </div>

            {/* Lignes de l'addition */}
            <div className="flex flex-col">
              <div className="flex-1 space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                {(addition?.additions_lignes || []).length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">Addition vide</div>
                )}
                {(addition?.additions_lignes || []).map((l) => (
                  <div key={l.id} className="rounded-lg border p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {l.produits?.designation || l.produits?.sku || "Produit"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {fmt(l.prix_unitaire_ht * (1 + (l.taux_tva || 0) / 100))} · TVA {l.taux_tva}%
                        </div>
                      </div>
                      <button onClick={() => removeLigne(l)} className="text-muted-foreground hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => changeQte(l, -1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center text-sm font-medium">{l.quantite}</span>
                        <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => changeQte(l, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <span className="text-sm font-semibold">
                        {fmt(l.quantite * l.prix_unitaire_ht * (1 - (l.remise_pct || 0) / 100) * (1 + (l.taux_tva || 0) / 100))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t mt-2 pt-2 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>HT</span>
                  <span>{fmt(totaux.total_ht)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>TVA</span>
                  <span>{fmt(totaux.total_tva)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-[#0B0F2E]">
                  <span>Total TTC</span>
                  <span>{fmt(totaux.total_ttc)}</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
            <Button variant="outline" onClick={annulerAddition} disabled={submitting} className="text-red-600">
              <Ban className="h-4 w-4 mr-1" /> Annuler l&apos;addition
            </Button>
            <Button
              onClick={ouvrirEncaissement}
              disabled={submitting || (addition?.additions_lignes || []).length === 0}
            >
              <Banknote className="h-4 w-4 mr-1" /> Encaisser {fmt(totaux.total_ttc)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Encaissement multi-moyens ───────────────────────────────────── */}
      <Dialog open={encaisserOpen} onOpenChange={setEncaisserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Encaisser {fmt(totaux.total_ttc)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {paiements.map((p, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Moyen</Label>
                  <Select
                    value={p.moyen_paiement}
                    onValueChange={(v) =>
                      setPaiements((prev) => prev.map((x, j) => (j === i ? { ...x, moyen_paiement: v as MoyenPaiement } : x)))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MOYENS_PAIEMENT.map((m) => (
                        <SelectItem key={m} value={m}>
                          {LIBELLES_MOYEN_PAIEMENT[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-28">
                  <Label className="text-xs">Montant</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={p.montant}
                    onChange={(e) =>
                      setPaiements((prev) => prev.map((x, j) => (j === i ? { ...x, montant: e.target.value } : x)))
                    }
                  />
                </div>
                {paiements.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPaiements((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setPaiements((prev) => [...prev, { moyen_paiement: "carte", montant: String(reste > 0 ? reste : 0), reference: "" }])
              }
            >
              <Plus className="h-4 w-4 mr-1" /> Ajouter un moyen
            </Button>
            <div className="border-t pt-2 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Total dû</span>
                <span>{fmt(totaux.total_ttc)}</span>
              </div>
              <div className="flex justify-between">
                <span>Encaissé</span>
                <span>{fmt(totalPaye)}</span>
              </div>
              <div className={`flex justify-between font-medium ${reste > 0 ? "text-red-600" : "text-emerald-700"}`}>
                <span>{reste > 0 ? "Reste à payer" : "Rendu"}</span>
                <span>{fmt(Math.abs(reste))}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEncaisserOpen(false)}>
              Retour
            </Button>
            <Button onClick={encaisser} disabled={submitting || reste > 0 || totaux.total_ttc <= 0}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Valider l&apos;encaissement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Création de table ───────────────────────────────────────────── */}
      <Dialog open={tableOpen} onOpenChange={setTableOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouvelle table</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Code / numéro *</Label>
              <Input value={tCode} onChange={(e) => setTCode(e.target.value)} placeholder="T1, B2, Terrasse-3…" autoFocus />
            </div>
            <div>
              <Label>Nom (optionnel)</Label>
              <Input value={tNom} onChange={(e) => setTNom(e.target.value)} placeholder="Terrasse vue mer" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Zone</Label>
                <Input value={tZone} onChange={(e) => setTZone(e.target.value)} placeholder="Salle, Terrasse…" />
              </div>
              <div>
                <Label>Capacité</Label>
                <Input type="number" min="1" value={tCapacite} onChange={(e) => setTCapacite(e.target.value)} placeholder="4" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTableOpen(false)}>
              Annuler
            </Button>
            <Button onClick={creerTable} disabled={submitting || !tCode.trim()}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPageShell>
  )
}
