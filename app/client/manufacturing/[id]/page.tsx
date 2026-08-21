"use client"

/**
 * Page /client/manufacturing/[id] — Suivi d'un ordre de fabrication.
 *
 * planifie : consommations théoriques préremplies, quantités réelles
 *            éditables, bouton « Lancer » (sortie matières atomique +
 *            pièce OF-CONSO) ou « Annuler ».
 * en_cours : consommations réelles + écart, bouton « Produire & clôturer »
 *            (entrée produit fini au coût de revient + pièce OF-PROD).
 * cloture  : récapitulatif figé (coût de revient, production, écart).
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
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
import { ArrowLeft, Factory, Loader2, PackageCheck, Play, XCircle } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
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
      consommations.reduce(
        (s, c) => s + ((Number(c.valeur_reelle) || 0) - (Number(c.valeur_theorique) || 0)),
        0,
      ),
    [consommations],
  )

  return (
    <ClientPageShell
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
          className={`mb-4 rounded-md px-4 py-2 text-sm ${
            toast.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {loading && !ordre ? (
        <div className="py-16 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 mx-auto animate-spin" />
        </div>
      ) : !ordre ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Ordre introuvable.</p>
      ) : (
        <>
          {/* ── Synthèse ────────────────────────────────────────────── */}
          <div className="grid gap-4 md:grid-cols-4 mb-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Statut</p>
                <div className="mt-1">
                  <StatutBadge statut={ordre.statut} />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Dépôt : {ordre.depots?.nom || "—"} · BOM v{ordre.nomenclatures?.version}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Production</p>
                <p className="text-lg font-semibold">
                  {fmtQte(ordre.quantite_produite)} / {fmtQte(ordre.quantite_a_produire)}
                </p>
                <p className="text-xs text-muted-foreground">{produitFini?.unite_mesure}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Coût matières (en-cours 3300)</p>
                <p className="text-lg font-semibold">{fmtMoney(ordre.cout_matieres_reel)}</p>
                {ecartTotal !== 0 && (
                  <p className={`text-xs ${ecartTotal > 0 ? "text-red-600" : "text-emerald-700"}`}>
                    Écart matière : {ecartTotal > 0 ? "+" : ""}
                    {fmtMoney(ecartTotal)} (6586)
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Coût de revient unitaire</p>
                <p className="text-lg font-semibold">
                  {ordre.cout_unitaire_revient != null ? fmtMoney(ordre.cout_unitaire_revient) : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ordre.statut === "cloture" ? "Figé à la clôture" : "Calculé à la clôture"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ── Consommations ───────────────────────────────────────── */}
          <Card className="mb-4">
            <CardContent className="pt-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Factory className="h-4 w-4" />
                {ordre.statut === "planifie"
                  ? "Composants à consommer (quantités réelles éditables)"
                  : "Composants consommés"}
              </h3>

              {ordre.statut === "planifie" ? (
                theoriques.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nomenclature vide.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Composant</TableHead>
                          <TableHead className="text-right">Quantité théorique</TableHead>
                          <TableHead className="text-right">Quantité réelle</TableHead>
                          <TableHead className="text-right">CUMP courant</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {theoriques.map((t) => {
                          const p = composantsParId.get(t.produit_id)
                          return (
                            <TableRow key={t.produit_id}>
                              <TableCell>
                                <span className="font-mono text-xs mr-2">{p?.sku}</span>
                                {p?.designation || t.produit_id}
                              </TableCell>
                              <TableCell className="text-right">
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
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                {fmtMoney(p?.cout_unitaire_moyen || 0)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )
              ) : consommations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Aucune consommation.</p>
              ) : (
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
                        const ecart = (Number(c.valeur_reelle) || 0) - (Number(c.valeur_theorique) || 0)
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="whitespace-nowrap">{c.date_consommation}</TableCell>
                            <TableCell>
                              <span className="font-mono text-xs mr-2">{c.produits?.sku}</span>
                              {c.produits?.designation}
                            </TableCell>
                            <TableCell className="text-right">{fmtQte(c.quantite_theorique)}</TableCell>
                            <TableCell className="text-right">{fmtQte(c.quantite_reelle)}</TableCell>
                            <TableCell className="text-right">{fmtMoney(c.cout_unitaire)}</TableCell>
                            <TableCell className="text-right">{fmtMoney(c.valeur_theorique)}</TableCell>
                            <TableCell
                              className={`text-right ${
                                ecart > 0 ? "text-red-600" : ecart < 0 ? "text-emerald-700" : ""
                              }`}
                            >
                              {ecart === 0 ? "—" : `${ecart > 0 ? "+" : ""}${fmtMoney(ecart)}`}
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

          {/* ── Productions ─────────────────────────────────────────── */}
          <Card>
            <CardContent className="pt-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <PackageCheck className="h-4 w-4" /> Entrées en stock du produit fini
              </h3>
              {productions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Aucune production enregistrée — la production est saisie à la clôture de l&apos;OF.
                </p>
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
                          <TableCell className="whitespace-nowrap">{p.date_production}</TableCell>
                          <TableCell>
                            <span className="font-mono text-xs mr-2">{p.produits?.sku}</span>
                            {p.produits?.designation}
                          </TableCell>
                          <TableCell className="text-right">{fmtQte(p.quantite)}</TableCell>
                          <TableCell className="text-right">{fmtMoney(p.cout_unitaire_revient)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {ordre.notes && (
                <p className="text-xs text-muted-foreground mt-3">Notes : {ordre.notes}</p>
              )}
            </CardContent>
          </Card>
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
