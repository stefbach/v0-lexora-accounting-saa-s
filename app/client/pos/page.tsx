"use client"

/**
 * Page /client/pos — Point de vente (Module B, MVP).
 *
 * Session de caisse (ouverture avec fond initial, clôture avec comptage et
 * écart), écran caisse (recherche produit, panier, remises, totaux TVA),
 * encaissement multi-moyens et tickets du shift. La validation d'un ticket
 * est atomique côté serveur (RPC valider_vente_pos) : déduction de stock au
 * CUMP + écritures comptables (journal POS + COGS).
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Loader2,
  Search,
  ShoppingCart,
  Trash2,
  Banknote,
  LockKeyhole,
  Plus,
  Minus,
  Receipt,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { calculerLigne, calculerTotaux, resteAPayer, type LignePanier } from "@/lib/pos/panier"
import {
  LIBELLES_MOYEN_PAIEMENT,
  MOYENS_PAIEMENT,
  type MoyenPaiement,
} from "@/lib/pos/types"

interface ProduitRow {
  id: string
  sku: string
  designation: string
  gere_en_stock: boolean
  prix_vente_ht: number
  taux_tva: number
  actif: boolean
  stock_niveaux?: Array<{ quantite: number }>
}

interface SessionRow {
  id: string
  statut: "ouverte" | "fermee"
  fond_ouverture: number
  ouverte_at: string
  depots?: { nom: string } | null
}

interface TicketRow {
  id: string
  numero_ticket: string
  date_vente: string
  montant_ttc: number
  statut: string
  paiements_pos?: Array<{ moyen_paiement: MoyenPaiement; montant: number }>
}

interface PanierItem extends LignePanier {
  sku: string
  designation: string
}

interface PaiementSaisie {
  moyen_paiement: MoyenPaiement
  montant: string
  reference: string
}

interface RecapFermeture {
  fond_ouverture: number
  fond_fermeture_theorique: number
  fond_fermeture_compte: number
  ecart_caisse: number
  nb_tickets: number
  total_ttc: number
  par_moyen: Record<string, number>
}

function fmt(n: number): string {
  return (Number(n) || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " MUR"
}

export default function PosPage() {
  const { societeId } = useSocieteActive()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const [session, setSession] = useState<SessionRow | null>(null)
  const [produits, setProduits] = useState<ProduitRow[]>([])
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [search, setSearch] = useState("")
  const [panier, setPanier] = useState<PanierItem[]>([])

  const [fondOuverture, setFondOuverture] = useState("")
  const [encaisserOpen, setEncaisserOpen] = useState(false)
  const [paiements, setPaiements] = useState<PaiementSaisie[]>([])
  const [clotureOpen, setClotureOpen] = useState(false)
  const [fondCompte, setFondCompte] = useState("")
  const [recap, setRecap] = useState<RecapFermeture | null>(null)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 6000)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const sRes = await fetch(`/api/client/pos/sessions?societe_id=${societeId}&statut=ouverte`)
      const sData = await sRes.json()
      if (!sRes.ok) throw new Error(sData.error || "Erreur sessions")
      const ouverte: SessionRow | null = (sData.items || [])[0] || null
      setSession(ouverte)

      const pRes = await fetch(`/api/client/inventaire/produits?societe_id=${societeId}`)
      const pData = await pRes.json()
      if (!pRes.ok) throw new Error(pData.error || "Erreur produits")
      setProduits((pData.items || []).filter((p: ProduitRow) => p.actif))

      if (ouverte) {
        const tRes = await fetch(`/api/client/pos/ventes?societe_id=${societeId}&session_id=${ouverte.id}`)
        const tData = await tRes.json()
        if (tRes.ok) setTickets(tData.items || [])
      } else {
        setTickets([])
      }
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
    const list = q
      ? produits.filter(
          (p) => p.sku.toLowerCase().includes(q) || p.designation.toLowerCase().includes(q),
        )
      : produits
    return list.slice(0, 60)
  }, [produits, search])

  const stockDe = (p: ProduitRow) =>
    (p.stock_niveaux || []).reduce((s, n) => s + (Number(n.quantite) || 0), 0)

  const totaux = useMemo(() => calculerTotaux(panier), [panier])

  const totalEspecesSession = useMemo(
    () =>
      tickets
        .filter((t) => t.statut === "validee")
        .flatMap((t) => t.paiements_pos || [])
        .filter((p) => p.moyen_paiement === "especes")
        .reduce((s, p) => s + (Number(p.montant) || 0), 0),
    [tickets],
  )

  const ajouterAuPanier = (p: ProduitRow) => {
    setPanier((prev) => {
      const idx = prev.findIndex((l) => l.produit_id === p.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantite: next[idx].quantite + 1 }
        return next
      }
      return [
        ...prev,
        {
          produit_id: p.id,
          sku: p.sku,
          designation: p.designation,
          quantite: 1,
          prix_unitaire_ht: Number(p.prix_vente_ht) || 0,
          remise_pct: 0,
          taux_tva: Number(p.taux_tva) || 0,
        },
      ]
    })
  }

  const majLigne = (produitId: string, patch: Partial<LignePanier>) => {
    setPanier((prev) =>
      prev.map((l) => (l.produit_id === produitId ? { ...l, ...patch } : l)),
    )
  }

  const changerQuantite = (produitId: string, delta: number) => {
    setPanier((prev) =>
      prev
        .map((l) =>
          l.produit_id === produitId ? { ...l, quantite: l.quantite + delta } : l,
        )
        .filter((l) => l.quantite > 0),
    )
  }

  const ouvrirSession = async () => {
    if (!societeId) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/client/pos/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, fond_ouverture: fondOuverture || 0 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast("Session de caisse ouverte")
      setFondOuverture("")
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const ouvrirEncaissement = () => {
    if (panier.length === 0) return
    setPaiements([{ moyen_paiement: "especes", montant: String(totaux.total_ttc), reference: "" }])
    setEncaisserOpen(true)
  }

  const ajouterPaiement = () => {
    const reste = resteAPayer(
      totaux.total_ttc,
      paiements.map((p) => ({ montant: Number(p.montant) || 0 })),
    )
    setPaiements((prev) => [...prev, { moyen_paiement: "carte", montant: String(reste), reference: "" }])
  }

  const totalSaisi = paiements.reduce((s, p) => s + (Number(p.montant) || 0), 0)

  const validerTicket = async () => {
    if (!societeId || !session) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/client/pos/ventes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          session_id: session.id,
          lignes: panier.map(({ produit_id, quantite, prix_unitaire_ht, remise_pct, taux_tva }) => ({
            produit_id,
            quantite,
            prix_unitaire_ht,
            remise_pct,
            taux_tva,
          })),
          paiements: paiements.map((p) => ({
            moyen_paiement: p.moyen_paiement,
            montant: Number(p.montant) || 0,
            reference: p.reference || null,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`Ticket ${data.numero_ticket} validé — ${fmt(Number(data.montant_ttc) || 0)}`)
      setEncaisserOpen(false)
      setPanier([])
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const fermerSession = async () => {
    if (!societeId || !session) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/pos/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, fond_fermeture_compte: fondCompte || 0 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      setRecap(data.recap)
      setClotureOpen(false)
      setFondCompte("")
      setPanier([])
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ClientPageShell
      breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Point de vente" }]}
      kicker="Gestion commerciale"
      title="Point de vente"
      subtitle="Caisse tactile : panier, TVA, encaissement multi-moyens, déduction de stock temps réel et écritures automatiques (journal POS)."
      actions={
        session ? (
          <Button variant="outline" size="sm" onClick={() => setClotureOpen(true)}>
            <LockKeyhole className="h-4 w-4 mr-1" /> Clôturer la caisse
          </Button>
        ) : undefined
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
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !session ? (
        /* ── Ouverture de session ─────────────────────────────────── */
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 space-y-4">
            <div className="text-center">
              <Banknote className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <h2 className="font-semibold">Ouvrir une session de caisse</h2>
              <p className="text-sm text-muted-foreground">
                Saisissez le fond de caisse initial (espèces) pour démarrer le shift.
              </p>
            </div>
            <div>
              <Label>Fond de caisse d&apos;ouverture (MUR)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={fondOuverture}
                onChange={(e) => setFondOuverture(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <Button className="w-full" onClick={ouvrirSession} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Ouvrir la caisse
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2 flex-wrap text-sm">
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              Session ouverte
            </Badge>
            <span className="text-muted-foreground">
              {session.depots?.nom || "Caisse"} · fond d&apos;ouverture {fmt(session.fond_ouverture)} ·
              espèces encaissées {fmt(totalEspecesSession)} · {tickets.length} ticket
              {tickets.length > 1 ? "s" : ""}
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
            {/* ── Produits ─────────────────────────────────────────── */}
            <Card>
              <CardContent className="pt-4">
                <div className="relative mb-3">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un produit (SKU, désignation)…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                {produitsFiltres.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Aucun produit vendable — créez vos articles dans Stock &amp; inventaire.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {produitsFiltres.map((p) => {
                      const stock = stockDe(p)
                      const rupture = p.gere_en_stock && stock <= 0
                      return (
                        <button
                          key={p.id}
                          onClick={() => !rupture && ajouterAuPanier(p)}
                          disabled={rupture}
                          className={`rounded-md border p-3 text-left transition hover:border-primary hover:bg-accent ${
                            rupture ? "opacity-50 cursor-not-allowed" : ""
                          }`}
                        >
                          <div className="font-mono text-[11px] text-muted-foreground">{p.sku}</div>
                          <div className="text-sm font-medium truncate">{p.designation}</div>
                          <div className="mt-1 flex items-center justify-between text-xs">
                            <span className="font-semibold">{fmt(p.prix_vente_ht)} HT</span>
                            {p.gere_en_stock ? (
                              <span className={rupture ? "text-red-600" : "text-muted-foreground"}>
                                {rupture ? "Rupture" : `Stock ${stock}`}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Service</span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Panier ───────────────────────────────────────────── */}
            <Card className="h-fit lg:sticky lg:top-4">
              <CardContent className="pt-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" /> Panier ({panier.length})
                </h3>
                {panier.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    Cliquez sur un produit pour l&apos;ajouter.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {panier.map((l) => {
                      const m = calculerLigne(l)
                      return (
                        <div key={l.produit_id} className="rounded-md border p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{l.designation}</div>
                              <div className="text-[11px] text-muted-foreground font-mono">{l.sku}</div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPanier((prev) => prev.filter((x) => x.produit_id !== l.produit_id))}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => changerQuantite(l.produit_id, -1)}>
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-8 text-center text-sm">{l.quantite}</span>
                              <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => changerQuantite(l.produit_id, 1)}>
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-muted-foreground">Remise %</span>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                className="h-7 w-16 text-xs"
                                value={l.remise_pct || ""}
                                onChange={(e) =>
                                  majLigne(l.produit_id, {
                                    remise_pct: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                                  })
                                }
                              />
                            </div>
                            <span className="ml-auto text-sm font-semibold">{fmt(m.montant_ttc)}</span>
                          </div>
                        </div>
                      )
                    })}

                    <div className="border-t pt-3 space-y-1 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Total HT</span>
                        <span>{fmt(totaux.total_ht)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>TVA</span>
                        <span>{fmt(totaux.total_tva)}</span>
                      </div>
                      <div className="flex justify-between text-base font-bold">
                        <span>Total TTC</span>
                        <span>{fmt(totaux.total_ttc)}</span>
                      </div>
                    </div>
                    <Button className="w-full" size="lg" onClick={ouvrirEncaissement}>
                      <Banknote className="h-4 w-4 mr-2" /> Encaisser {fmt(totaux.total_ttc)}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Tickets du shift ─────────────────────────────────────── */}
          <Card className="mt-4">
            <CardContent className="pt-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Receipt className="h-4 w-4" /> Tickets de la session
              </h3>
              {tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Aucun ticket pour l&apos;instant.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ticket</TableHead>
                        <TableHead>Heure</TableHead>
                        <TableHead>Paiement</TableHead>
                        <TableHead className="text-right">Montant TTC</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tickets.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono text-xs">{t.numero_ticket}</TableCell>
                          <TableCell>
                            {new Date(t.date_vente).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {(t.paiements_pos || []).map((p, i) => (
                                <Badge key={i} variant="secondary">
                                  {LIBELLES_MOYEN_PAIEMENT[p.moyen_paiement] || p.moyen_paiement} · {fmt(p.montant)}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">{fmt(t.montant_ttc)}</TableCell>
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

      {/* ── Dialog encaissement ────────────────────────────────────── */}
      <Dialog open={encaisserOpen} onOpenChange={setEncaisserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Encaissement — {fmt(totaux.total_ttc)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {paiements.map((p, i) => (
              <div key={i} className="flex gap-2 items-end">
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
                    size="sm"
                    onClick={() => setPaiements((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={ajouterPaiement}>
              <Plus className="h-4 w-4 mr-1" /> Ajouter un moyen de paiement
            </Button>
            <div className="text-sm flex justify-between border-t pt-2">
              <span className="text-muted-foreground">Saisi / à payer</span>
              <span className={Math.abs(totalSaisi - totaux.total_ttc) <= 0.01 ? "text-emerald-700 font-medium" : "text-red-600 font-medium"}>
                {fmt(totalSaisi)} / {fmt(totaux.total_ttc)}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEncaisserOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={validerTicket}
              disabled={submitting || Math.abs(totalSaisi - totaux.total_ttc) > 0.01}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Valider le ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog clôture ─────────────────────────────────────────── */}
      <Dialog open={clotureOpen} onOpenChange={setClotureOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Clôture de la session</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fond d&apos;ouverture</span>
              <span>{fmt(session?.fond_ouverture || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Espèces encaissées</span>
              <span>{fmt(totalEspecesSession)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Fond théorique attendu</span>
              <span>{fmt((session?.fond_ouverture || 0) + totalEspecesSession)}</span>
            </div>
            <div>
              <Label>Fond de caisse compté (MUR) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={fondCompte}
                onChange={(e) => setFondCompte(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Un écart génère automatiquement l&apos;écriture comptable correspondante
              (manque : 6588 / surplus : 758).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClotureOpen(false)}>
              Annuler
            </Button>
            <Button onClick={fermerSession} disabled={submitting || fondCompte === ""}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Clôturer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog récapitulatif de clôture ────────────────────────── */}
      <Dialog open={!!recap} onOpenChange={(o) => !o && setRecap(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Session clôturée</DialogTitle>
          </DialogHeader>
          {recap && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tickets validés</span>
                <span>{recap.nb_tickets}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Chiffre d&apos;affaires TTC</span>
                <span className="font-medium">{fmt(recap.total_ttc)}</span>
              </div>
              {Object.entries(recap.par_moyen || {}).map(([moyen, montant]) => (
                <div key={moyen} className="flex justify-between text-muted-foreground">
                  <span>· {LIBELLES_MOYEN_PAIEMENT[moyen as MoyenPaiement] || moyen}</span>
                  <span>{fmt(Number(montant))}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between">
                <span className="text-muted-foreground">Fond théorique</span>
                <span>{fmt(recap.fond_fermeture_theorique)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fond compté</span>
                <span>{fmt(recap.fond_fermeture_compte)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Écart de caisse</span>
                <span className={recap.ecart_caisse === 0 ? "" : recap.ecart_caisse < 0 ? "text-red-600" : "text-emerald-700"}>
                  {fmt(recap.ecart_caisse)}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setRecap(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPageShell>
  )
}
