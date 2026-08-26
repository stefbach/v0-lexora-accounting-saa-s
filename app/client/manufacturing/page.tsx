"use client"

/**
 * /client/manufacturing — Production (Manufacturing).
 *
 * Vrai module de fabrication, distinct de la comptabilité analytique :
 *   • Nomenclatures (BOM) — un produit fini = un assemblage de composants.
 *   • Ordres de fabrication — planifie → lancer (consomme le stock composants
 *     vers l'en-cours) → clôturer (produit fini entré au coût de revient).
 *
 * Tout le calcul (explosion BOM, CUMP, écritures 3100/3300/3500, écart 6586)
 * est fait côté serveur par les RPC consommer/produire (migrations 487-489).
 * Cette page ne fait que piloter ces flux et afficher les coûts figés.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Loader2, Plus, Trash2, Factory, Layers, Play, CheckCircle2, PackageCheck } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { SectionCard, OpsEmpty, OpsSkeleton, KpiCard, KpiGrid, formatMUR, formatNumber } from "@/components/operations"
import { buildLignesConsommation } from "@/lib/manufacturing/ordres"
import { LIBELLES_STATUT_OF, type StatutOF } from "@/lib/manufacturing/types"

interface Produit {
  id: string
  sku: string
  designation: string
  unite_mesure?: string | null
  cout_unitaire_moyen?: number | null
}

interface LigneBom {
  id: string
  produit_composant_id: string
  quantite: number
  taux_perte_pct: number
  unite?: string | null
  produits?: Produit | null
}

interface Nomenclature {
  id: string
  produit_fini_id: string
  version: string
  libelle: string | null
  quantite_produite: number
  statut: "brouillon" | "active" | "obsolete"
  cout_matieres_estime: number | null
  produits?: Produit | null
  lignes_nomenclature?: LigneBom[]
}

interface OrdreFab {
  id: string
  numero_of: string
  quantite_a_produire: number
  quantite_produite: number
  statut: StatutOF
  cout_matieres_reel: number
  cout_unitaire_revient: number | null
  nomenclatures?: {
    quantite_produite: number
    produit_fini_id: string
    produits?: Produit | null
    lignes_nomenclature?: LigneBom[]
  } | null
  depots?: { nom: string } | null
}

const STATUT_OF_STYLE: Record<StatutOF, string> = {
  planifie: "bg-slate-100 text-slate-700",
  en_cours: "bg-amber-100 text-amber-800",
  cloture: "bg-emerald-100 text-emerald-800",
  annule: "bg-red-100 text-red-700",
}

function fmt(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtQte(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString("fr-FR", { maximumFractionDigits: 3 })
}

export default function ManufacturingPage() {
  const { societeId } = useSocieteActive()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const [produits, setProduits] = useState<Produit[]>([])
  const [nomenclatures, setNomenclatures] = useState<Nomenclature[]>([])
  const [ordres, setOrdres] = useState<OrdreFab[]>([])

  // Création BOM
  const [bomOpen, setBomOpen] = useState(false)
  const [bomFini, setBomFini] = useState("")
  const [bomQte, setBomQte] = useState("1")
  const [bomLibelle, setBomLibelle] = useState("")
  const [bomLignes, setBomLignes] = useState<Array<{ produit_composant_id: string; quantite: string; taux_perte_pct: string }>>([
    { produit_composant_id: "", quantite: "", taux_perte_pct: "0" },
  ])

  // Création OF
  const [ofOpen, setOfOpen] = useState(false)
  const [ofNom, setOfNom] = useState("")
  const [ofQte, setOfQte] = useState("")

  // Lancement (consommation)
  const [lancerOf, setLancerOf] = useState<OrdreFab | null>(null)
  const [lancerLignes, setLancerLignes] = useState<Array<{ produit_id: string; label: string; theorique: number; reelle: string }>>([])

  // Clôture (production)
  const [cloturerOf, setCloturerOf] = useState<OrdreFab | null>(null)
  const [cloturerQte, setCloturerQte] = useState("")

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
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
      setProduits((pData.items || []).filter((p: Produit & { actif?: boolean }) => (p as any).actif !== false))
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

  const produitLabel = useCallback(
    (id: string) => {
      const p = produits.find((x) => x.id === id)
      return p ? `${p.designation} (${p.sku})` : id
    },
    [produits],
  )

  const nomenclaturesActives = useMemo(() => nomenclatures.filter((n) => n.statut === "active"), [nomenclatures])

  const kpis = useMemo(() => {
    const enCours = ordres.filter((o) => o.statut === "en_cours").length
    const clotures = ordres.filter((o) => o.statut === "cloture")
    const valeurProduite = clotures.reduce((s, o) => s + (Number(o.cout_unitaire_revient) || 0) * (Number(o.quantite_produite) || 0), 0)
    return { bomActives: nomenclaturesActives.length, enCours, produits: clotures.length, valeurProduite }
  }, [ordres, nomenclaturesActives.length])

  // ── BOM ──────────────────────────────────────────────────────────────
  const creerBom = async () => {
    if (!societeId) return
    const lignes = bomLignes
      .filter((l) => l.produit_composant_id && Number(l.quantite) > 0)
      .map((l) => ({
        produit_composant_id: l.produit_composant_id,
        quantite: Number(l.quantite),
        taux_perte_pct: Number(l.taux_perte_pct) || 0,
      }))
    if (!bomFini || lignes.length === 0) {
      showToast("Produit fini et au moins un composant requis", "error")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/client/manufacturing/nomenclatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, produit_fini_id: bomFini, libelle: bomLibelle || null, quantite_produite: Number(bomQte) || 1, lignes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast("Nomenclature créée")
      setBomOpen(false)
      setBomFini(""); setBomQte("1"); setBomLibelle("")
      setBomLignes([{ produit_composant_id: "", quantite: "", taux_perte_pct: "0" }])
      await load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const changerStatutBom = async (n: Nomenclature, statut: "active" | "obsolete") => {
    if (!societeId) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/manufacturing/nomenclatures/${n.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, statut }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(statut === "active" ? "Nomenclature activée" : "Nomenclature rendue obsolète")
      await load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  // ── OF ───────────────────────────────────────────────────────────────
  const creerOf = async () => {
    if (!societeId || !ofNom || !(Number(ofQte) > 0)) {
      showToast("Nomenclature et quantité (> 0) requises", "error")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/client/manufacturing/ordres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, nomenclature_id: ofNom, quantite_a_produire: Number(ofQte) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`Ordre ${data.item?.numero_of || ""} créé`)
      setOfOpen(false)
      setOfNom(""); setOfQte("")
      await load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const ouvrirLancement = (o: OrdreFab) => {
    const bom = o.nomenclatures
    const lignesBom = (bom?.lignes_nomenclature || []).map((l) => ({
      produit_composant_id: l.produit_composant_id,
      quantite: Number(l.quantite),
      taux_perte_pct: Number(l.taux_perte_pct),
    }))
    const theo = buildLignesConsommation(lignesBom, Number(o.quantite_a_produire), Number(bom?.quantite_produite) || 1)
    setLancerLignes(
      theo.map((t) => ({
        produit_id: t.produit_id,
        label: produitLabel(t.produit_id),
        theorique: t.quantite_theorique,
        reelle: String(t.quantite_theorique),
      })),
    )
    setLancerOf(o)
  }

  const lancer = async () => {
    if (!societeId || !lancerOf) return
    const lignes = lancerLignes.map((l) => ({ produit_id: l.produit_id, quantite_theorique: l.theorique, quantite_reelle: Number(l.reelle) || 0 }))
    if (lignes.some((l) => l.quantite_reelle <= 0)) {
      showToast("Quantité réelle > 0 requise sur chaque composant", "error")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/manufacturing/ordres/${lancerOf.id}/lancer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, lignes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast("OF lancé — composants consommés")
      setLancerOf(null)
      await load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const cloturer = async () => {
    if (!societeId || !cloturerOf || !(Number(cloturerQte) > 0)) {
      showToast("Quantité produite > 0 requise", "error")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/manufacturing/ordres/${cloturerOf.id}/cloturer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, quantite_produite: Number(cloturerQte) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`OF clôturé — coût de revient ${fmt(data?.cout_unitaire_revient ?? data?.item?.cout_unitaire_revient)}/u`)
      setCloturerOf(null); setCloturerQte("")
      await load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ClientPageShell
      breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Production" }]}
      kicker="Fabrication"
      title="Production"
      subtitle="Nomenclatures et ordres de fabrication : le stock des composants est consommé vers l'en-cours, puis le produit fini entre en stock à son coût de revient réel — écritures comptables générées automatiquement."
      disableParticles
    >
      {toast && (
        <div className={`mb-4 rounded-md px-4 py-2 text-sm ${toast.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`} role="status">
          {toast.msg}
        </div>
      )}

      {loading ? (
        <OpsSkeleton kpis={4} rows={4} />
      ) : (
        <div className="space-y-6">
          <KpiGrid cols={4}>
            <KpiCard label="Nomenclatures actives" value={formatNumber(kpis.bomActives)} icon={Layers} color="#0B0F2E" />
            <KpiCard label="OF en cours" value={formatNumber(kpis.enCours)} icon={Factory} color="#A88925" />
            <KpiCard label="OF clôturés" value={formatNumber(kpis.produits)} icon={PackageCheck} color="#0F766E" />
            <KpiCard label="Valeur produite (revient)" value={formatMUR(kpis.valeurProduite)} icon={CheckCircle2} color="#0B0F2E" />
          </KpiGrid>

          <Tabs defaultValue="ordres" className="space-y-4">
            <TabsList>
              <TabsTrigger value="ordres"><Factory className="h-4 w-4 mr-1.5" /> Ordres de fabrication</TabsTrigger>
              <TabsTrigger value="bom"><Layers className="h-4 w-4 mr-1.5" /> Nomenclatures</TabsTrigger>
            </TabsList>

            {/* ── Ordres de fabrication ── */}
            <TabsContent value="ordres">
              <SectionCard
                title="Ordres de fabrication"
                subtitle="Planifier → lancer (consommer) → clôturer (produire)"
                actions={
                  <Button size="sm" onClick={() => setOfOpen(true)} disabled={nomenclaturesActives.length === 0}>
                    <Plus className="h-4 w-4 mr-1" /> Nouvel OF
                  </Button>
                }
                contentClassName="pt-0"
              >
                {ordres.length === 0 ? (
                  <OpsEmpty
                    icon={Factory}
                    title="Aucun ordre de fabrication"
                    description={nomenclaturesActives.length === 0 ? "Créez et activez d'abord une nomenclature." : "Lancez votre premier OF depuis une nomenclature active."}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>N° OF</TableHead>
                          <TableHead>Produit fini</TableHead>
                          <TableHead className="text-right">À produire</TableHead>
                          <TableHead className="text-right">Produit</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead className="text-right">Coût matières</TableHead>
                          <TableHead className="text-right">Revient / u</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ordres.map((o) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-mono text-xs">{o.numero_of}</TableCell>
                            <TableCell>{o.nomenclatures?.produits?.designation || "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtQte(o.quantite_a_produire)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtQte(o.quantite_produite)}</TableCell>
                            <TableCell><Badge className={STATUT_OF_STYLE[o.statut]}>{LIBELLES_STATUT_OF[o.statut]}</Badge></TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(o.cout_matieres_reel)}</TableCell>
                            <TableCell className="text-right tabular-nums">{o.cout_unitaire_revient != null ? fmt(o.cout_unitaire_revient) : "—"}</TableCell>
                            <TableCell className="text-right">
                              {o.statut === "planifie" && (
                                <Button variant="ghost" size="sm" className="h-7" onClick={() => ouvrirLancement(o)}>
                                  <Play className="h-3.5 w-3.5 mr-1" /> Lancer
                                </Button>
                              )}
                              {o.statut === "en_cours" && (
                                <Button variant="ghost" size="sm" className="h-7 text-emerald-700" onClick={() => { setCloturerOf(o); setCloturerQte(String(o.quantite_a_produire)) }}>
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Clôturer
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </SectionCard>
            </TabsContent>

            {/* ── Nomenclatures ── */}
            <TabsContent value="bom">
              <SectionCard
                title="Nomenclatures (BOM)"
                subtitle="Un produit fini = un assemblage de composants (mono-niveau)"
                actions={
                  <Button size="sm" onClick={() => setBomOpen(true)} disabled={produits.length === 0}>
                    <Plus className="h-4 w-4 mr-1" /> Nouvelle nomenclature
                  </Button>
                }
                contentClassName="pt-0"
              >
                {nomenclatures.length === 0 ? (
                  <OpsEmpty icon={Layers} title="Aucune nomenclature" description="Définissez la recette d'un produit fini pour pouvoir le fabriquer." />
                ) : (
                  <div className="space-y-3">
                    {nomenclatures.map((n) => (
                      <div key={n.id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium text-[#0B0F2E]">
                              {n.produits?.designation || "Produit"} <span className="text-xs text-muted-foreground">v{n.version} · pour {fmtQte(n.quantite_produite)} u</span>
                            </div>
                            {n.libelle && <div className="text-xs text-muted-foreground">{n.libelle}</div>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={n.statut === "active" ? "bg-emerald-100 text-emerald-800" : n.statut === "obsolete" ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-800"}>
                              {n.statut}
                            </Badge>
                            {n.statut !== "active" ? (
                              <Button variant="outline" size="sm" className="h-7" onClick={() => changerStatutBom(n, "active")} disabled={submitting}>Activer</Button>
                            ) : (
                              <Button variant="ghost" size="sm" className="h-7 text-muted-foreground" onClick={() => changerStatutBom(n, "obsolete")} disabled={submitting}>Rendre obsolète</Button>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(n.lignes_nomenclature || []).map((l) => (
                            <Badge key={l.id} variant="secondary" className="font-normal">
                              {l.produits?.designation || l.produit_composant_id} · {fmtQte(l.quantite)}{l.taux_perte_pct ? ` (+${l.taux_perte_pct}%)` : ""}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* ── Dialog nouvelle BOM ── */}
      <Dialog open={bomOpen} onOpenChange={setBomOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nouvelle nomenclature</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div>
                <Label>Produit fini *</Label>
                <Select value={bomFini} onValueChange={setBomFini}>
                  <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                  <SelectContent>
                    {produits.map((p) => <SelectItem key={p.id} value={p.id}>{p.designation} ({p.sku})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-28">
                <Label>Produit pour</Label>
                <Input type="number" min="0.001" step="0.001" value={bomQte} onChange={(e) => setBomQte(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Libellé (optionnel)</Label>
              <Input value={bomLibelle} onChange={(e) => setBomLibelle(e.target.value)} placeholder="Recette standard" />
            </div>
            <div>
              <Label>Composants</Label>
              <div className="space-y-2">
                {bomLignes.map((l, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="flex-1">
                      <Select value={l.produit_composant_id} onValueChange={(v) => setBomLignes((prev) => prev.map((x, j) => j === i ? { ...x, produit_composant_id: v } : x))}>
                        <SelectTrigger><SelectValue placeholder="Composant…" /></SelectTrigger>
                        <SelectContent>
                          {produits.filter((p) => p.id !== bomFini).map((p) => <SelectItem key={p.id} value={p.id}>{p.designation} ({p.sku})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-20">
                      <Input type="number" min="0" step="0.001" placeholder="Qté" value={l.quantite} onChange={(e) => setBomLignes((prev) => prev.map((x, j) => j === i ? { ...x, quantite: e.target.value } : x))} />
                    </div>
                    <div className="w-16">
                      <Input type="number" min="0" max="99" step="0.01" placeholder="% perte" value={l.taux_perte_pct} onChange={(e) => setBomLignes((prev) => prev.map((x, j) => j === i ? { ...x, taux_perte_pct: e.target.value } : x))} />
                    </div>
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setBomLignes((prev) => prev.filter((_, j) => j !== i))} disabled={bomLignes.length === 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setBomLignes((prev) => [...prev, { produit_composant_id: "", quantite: "", taux_perte_pct: "0" }])}>
                  <Plus className="h-4 w-4 mr-1" /> Ajouter un composant
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBomOpen(false)}>Annuler</Button>
            <Button onClick={creerBom} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog nouvel OF ── */}
      <Dialog open={ofOpen} onOpenChange={setOfOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nouvel ordre de fabrication</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nomenclature active *</Label>
              <Select value={ofNom} onValueChange={setOfNom}>
                <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                <SelectContent>
                  {nomenclaturesActives.map((n) => <SelectItem key={n.id} value={n.id}>{n.produits?.designation} (v{n.version})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantité à produire *</Label>
              <Input type="number" min="0.001" step="0.001" value={ofQte} onChange={(e) => setOfQte(e.target.value)} autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfOpen(false)}>Annuler</Button>
            <Button onClick={creerOf} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog lancement (consommation) ── */}
      <Dialog open={!!lancerOf} onOpenChange={(o) => !o && setLancerOf(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Lancer l&apos;OF {lancerOf?.numero_of} — consommation</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Quantités théoriques calculées depuis la nomenclature. Ajustez le réel si besoin ; l&apos;écart part en compte 6586.</p>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {lancerLignes.map((l, i) => (
              <div key={l.produit_id} className="flex items-center gap-2">
                <div className="flex-1 text-sm">{l.label}</div>
                <div className="text-xs text-muted-foreground w-24 text-right">théo. {fmtQte(l.theorique)}</div>
                <div className="w-24">
                  <Input type="number" min="0" step="0.001" value={l.reelle} onChange={(e) => setLancerLignes((prev) => prev.map((x, j) => j === i ? { ...x, reelle: e.target.value } : x))} />
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLancerOf(null)}>Annuler</Button>
            <Button onClick={lancer} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Consommer &amp; lancer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog clôture (production) ── */}
      <Dialog open={!!cloturerOf} onOpenChange={(o) => !o && setCloturerOf(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Clôturer l&apos;OF {cloturerOf?.numero_of}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Le produit fini entre en stock au coût de revient (matières consommées ÷ quantité produite).</p>
            <div>
              <Label>Quantité réellement produite *</Label>
              <Input type="number" min="0.001" step="0.001" value={cloturerQte} onChange={(e) => setCloturerQte(e.target.value)} autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloturerOf(null)}>Annuler</Button>
            <Button onClick={cloturer} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Produire &amp; clôturer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPageShell>
  )
}
