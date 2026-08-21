"use client"

/**
 * Page /client/jobs/[id] — Fiche job (Job Costing, Module D).
 *
 * En-tête + rentabilité (coût de revient, marge, avancement budget), onglets :
 *  - Temps       : imputations, saisie de temps, validation, suppression
 *  - Dépenses    : dépenses non-salariales + consommation de stock (lib inventaire)
 *  - Coûts horaires : snapshots de coût horaire chargé (dérivés du salaire)
 * Bouton « Facturer » : gèle le montant facturable et passe le job en facturé.
 *
 * Le picker d'employé pour la saisie de temps s'appuie sur les snapshots de
 * coût horaire (§2.5 : imputation au taux figé), avec override manuel possible.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
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
  RefreshCw,
  Clock,
  Receipt,
  Package,
  FileCheck2,
  Trash2,
  ArrowLeft,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import {
  LIBELLES_STATUT_JOB,
  LIBELLES_TYPE_DEPENSE,
  type StatutJob,
  type StatutValidation,
  type TypeDepense,
} from "@/lib/jobcosting/types"

function fmtMoney(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " MUR"
}

interface Rentabilite {
  cout_revient: number
  produit: number
  marge: number
  marge_pct: number | null
  ecart_budget: number | null
  avancement_heures_pct: number | null
  depassement_budget: boolean
}

interface TempsRow {
  id: string
  date_prestation: string
  heures: number
  cout_horaire_charge: number
  cout_total: number
  taux_horaire_facture: number | null
  facturable: boolean
  statut_validation: StatutValidation
  tache: string | null
  employes?: { nom: string; prenom: string; code: string } | null
}

interface DepenseRow {
  id: string
  type_depense: TypeDepense
  description: string | null
  montant_ht: number
  facturable: boolean
  marge_refacturation_pct: number
  mouvement_stock_id: string | null
  date_depense: string
}

interface JobDetail {
  id: string
  code: string
  libelle: string
  client_nom: string | null
  statut: StatutJob
  budget_heures: number | null
  budget_montant: number | null
  cout_temps_reel: number
  cout_depenses_reel: number
  montant_facturable: number
  montant_facture: number | null
}

interface CoutHoraire {
  employe_id: string
  cout_horaire_charge: number
  employes?: { nom: string; prenom: string; code: string } | null
}

interface ProduitOpt {
  id: string
  sku: string
  designation: string
  cout_unitaire_moyen: number
}

const STATUT_VALIDATION_LABEL: Record<StatutValidation, string> = {
  brouillon: "Brouillon",
  soumis: "Soumis",
  valide: "Validé",
  rejete: "Rejeté",
  facture: "Facturé",
}

export default function JobDetailPage() {
  const params = useParams()
  const jobId = String(params?.id || "")
  const { societeId } = useSocieteActive()

  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const [job, setJob] = useState<JobDetail | null>(null)
  const [temps, setTemps] = useState<TempsRow[]>([])
  const [depenses, setDepenses] = useState<DepenseRow[]>([])
  const [rentabilite, setRentabilite] = useState<Rentabilite | null>(null)
  const [heuresImputees, setHeuresImputees] = useState(0)
  const [coutsHoraires, setCoutsHoraires] = useState<CoutHoraire[]>([])
  const [produits, setProduits] = useState<ProduitOpt[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Saisie de temps
  const [tDialog, setTDialog] = useState(false)
  const [tEmploye, setTEmploye] = useState("")
  const [tDate, setTDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [tHeures, setTHeures] = useState("")
  const [tTaux, setTTaux] = useState("")
  const [tCoutManuel, setTCoutManuel] = useState("")
  const [tFacturable, setTFacturable] = useState(true)
  const [tTache, setTTache] = useState("")

  // Dépense
  const [dDialog, setDDialog] = useState(false)
  const [dType, setDType] = useState<TypeDepense>("sous_traitance")
  const [dMontant, setDMontant] = useState("")
  const [dDesc, setDDesc] = useState("")
  const [dMarge, setDMarge] = useState("0")
  const [dFacturable, setDFacturable] = useState(true)

  // Consommation stock
  const [cDialog, setCDialog] = useState(false)
  const [cProduit, setCProduit] = useState("")
  const [cQuantite, setCQuantite] = useState("")
  const [cMarge, setCMarge] = useState("0")
  const [cFacturable, setCFacturable] = useState(true)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }

  const load = useCallback(async () => {
    if (!societeId || !jobId) return
    setLoading(true)
    try {
      const [jRes, cRes, pRes] = await Promise.all([
        fetch(`/api/client/jobs/${jobId}`),
        fetch(`/api/client/jobs/couts-horaires?societe_id=${societeId}`),
        fetch(`/api/client/inventaire/produits?societe_id=${societeId}`),
      ])
      const [jData, cData, pData] = await Promise.all([jRes.json(), cRes.json(), pRes.json()])
      if (!jRes.ok) throw new Error(jData.error || "Erreur job")
      setJob(jData.item)
      setTemps(jData.temps || [])
      setDepenses(jData.depenses || [])
      setRentabilite(jData.rentabilite || null)
      setHeuresImputees(jData.heures_imputees || 0)
      // Snapshots de coût horaire : dernier par employé
      const map = new Map<string, CoutHoraire>()
      for (const c of cData.items || []) if (!map.has(c.employe_id)) map.set(c.employe_id, c)
      setCoutsHoraires(Array.from(map.values()))
      setProduits(pData.items || [])
    } catch (e: any) {
      showToast(e?.message || "Erreur de chargement", "error")
    } finally {
      setLoading(false)
    }
  }, [societeId, jobId])

  useEffect(() => {
    load()
  }, [load])

  const employeSelectionne = useMemo(
    () => coutsHoraires.find((c) => c.employe_id === tEmploye),
    [coutsHoraires, tEmploye],
  )

  const submitTemps = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/jobs/${jobId}/temps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employe_id: tEmploye,
          date_prestation: tDate,
          heures: tHeures,
          taux_horaire_facture: tTaux || null,
          cout_horaire_charge: tCoutManuel || null,
          facturable: tFacturable,
          tache: tTache || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`Temps imputé — coût ${fmtMoney(data.cout_total)}`)
      setTDialog(false)
      setTHeures("")
      setTTache("")
      setTCoutManuel("")
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const submitDepense = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/jobs/${jobId}/depenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type_depense: dType,
          montant_ht: dMontant,
          description: dDesc || null,
          marge_refacturation_pct: dMarge || 0,
          facturable: dFacturable,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`Dépense ajoutée (${fmtMoney(data.item.montant_ht)})`)
      setDDialog(false)
      setDMontant("")
      setDDesc("")
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const submitConsommation = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/jobs/${jobId}/consommation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produit_id: cProduit,
          quantite: cQuantite,
          marge_refacturation_pct: cMarge || 0,
          facturable: cFacturable,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`Stock consommé — ${fmtMoney(data.valeur_mouvement)} (écriture ${data.ecritures?.nb_entries ? "générée" : "aucune"})`)
      setCDialog(false)
      setCQuantite("")
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const changerValidation = async (id: string, statut: StatutValidation) => {
    try {
      const res = await fetch(`/api/client/jobs/temps/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut_validation: statut }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    }
  }

  const supprimerTemps = async (id: string) => {
    try {
      const res = await fetch(`/api/client/jobs/temps/${id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    }
  }

  const facturer = async () => {
    if (!confirm("Facturer ce job ? Le montant facturable sera gelé et les temps validés figés.")) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/jobs/${jobId}/facturer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reclassement: false }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`Job facturé — ${fmtMoney(data.montant_facture)}`)
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const facturable = job && !["facture", "annule"].includes(job.statut)

  return (
    <ClientPageShell
      breadcrumbs={[
        { label: "Espace client", href: "/client" },
        { label: "Jobs", href: "/client/jobs" },
        { label: job?.code || "…" },
      ]}
      kicker="Contrôle de gestion"
      title={job ? `${job.code} — ${job.libelle}` : "Job"}
      subtitle={job?.client_nom || undefined}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/client/jobs">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          {facturable && (
            <Button size="sm" onClick={facturer} disabled={submitting}>
              <FileCheck2 className="h-4 w-4 mr-1" /> Facturer
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

      {job && (
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="outline">{LIBELLES_STATUT_JOB[job.statut]}</Badge>
        </div>
      )}

      {rentabilite && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card>
            <CardContent className="py-4">
              <div className="text-xs text-muted-foreground">Coût de revient</div>
              <div className="text-lg font-semibold">{fmtMoney(rentabilite.cout_revient)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                MO {fmtMoney(job?.cout_temps_reel)} · dép. {fmtMoney(job?.cout_depenses_reel)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="text-xs text-muted-foreground">
                {job?.montant_facture != null ? "Facturé" : "Facturable"}
              </div>
              <div className="text-lg font-semibold">{fmtMoney(rentabilite.produit)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="text-xs text-muted-foreground">Marge</div>
              <div className={`text-lg font-semibold ${rentabilite.marge < 0 ? "text-red-600" : "text-emerald-700"}`}>
                {fmtMoney(rentabilite.marge)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {rentabilite.marge_pct == null ? "—" : `${rentabilite.marge_pct.toFixed(1)}%`}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="text-xs text-muted-foreground">Avancement budget</div>
              <div className="text-lg font-semibold">
                {heuresImputees.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h
                {job?.budget_heures ? ` / ${job.budget_heures} h` : ""}
              </div>
              {rentabilite.depassement_budget && (
                <div className="text-xs text-red-600 mt-1">Dépassement du budget montant</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="temps">
        <TabsList>
          <TabsTrigger value="temps">
            <Clock className="h-4 w-4 mr-1" /> Temps ({temps.length})
          </TabsTrigger>
          <TabsTrigger value="depenses">
            <Receipt className="h-4 w-4 mr-1" /> Dépenses ({depenses.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="temps">
          <div className="mb-3 flex gap-2">
            <Button size="sm" onClick={() => setTDialog(true)} disabled={!facturable}>
              <Clock className="h-4 w-4 mr-1" /> Saisir du temps
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Employé</TableHead>
                      <TableHead className="text-right">Heures</TableHead>
                      <TableHead className="text-right">Coût/h</TableHead>
                      <TableHead className="text-right">Coût total</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {temps.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Aucune imputation
                        </TableCell>
                      </TableRow>
                    )}
                    {temps.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs">{t.date_prestation}</TableCell>
                        <TableCell>
                          {t.employes ? `${t.employes.prenom} ${t.employes.nom}` : "—"}
                          {!t.facturable && <span className="ml-1 text-xs text-muted-foreground">(non fact.)</span>}
                        </TableCell>
                        <TableCell className="text-right">{t.heures}</TableCell>
                        <TableCell className="text-right">{fmtMoney(t.cout_horaire_charge)}</TableCell>
                        <TableCell className="text-right">{fmtMoney(t.cout_total)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {STATUT_VALIDATION_LABEL[t.statut_validation]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {t.statut_validation === "brouillon" && (
                              <Button size="sm" variant="ghost" onClick={() => changerValidation(t.id, "soumis")}>
                                Soumettre
                              </Button>
                            )}
                            {t.statut_validation === "soumis" && (
                              <>
                                <Button size="sm" variant="ghost" onClick={() => changerValidation(t.id, "valide")}>
                                  Valider
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => changerValidation(t.id, "rejete")}>
                                  Rejeter
                                </Button>
                              </>
                            )}
                            {t.statut_validation !== "facture" && (
                              <Button size="sm" variant="ghost" onClick={() => supprimerTemps(t.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="depenses">
          <div className="mb-3 flex gap-2">
            <Button size="sm" onClick={() => setDDialog(true)} disabled={!facturable}>
              <Receipt className="h-4 w-4 mr-1" /> Ajouter une dépense
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCDialog(true)} disabled={!facturable}>
              <Package className="h-4 w-4 mr-1" /> Consommer du stock
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Montant HT</TableHead>
                      <TableHead className="text-right">Marge %</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {depenses.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Aucune dépense
                        </TableCell>
                      </TableRow>
                    )}
                    {depenses.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="text-xs">{d.date_depense}</TableCell>
                        <TableCell>{LIBELLES_TYPE_DEPENSE[d.type_depense]}</TableCell>
                        <TableCell className="text-muted-foreground">{d.description || "—"}</TableCell>
                        <TableCell className="text-right">{fmtMoney(d.montant_ht)}</TableCell>
                        <TableCell className="text-right">{d.marge_refacturation_pct}%</TableCell>
                        <TableCell>
                          {d.mouvement_stock_id ? (
                            <Badge variant="outline" className="text-xs">Stock</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Manuel</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog saisie de temps */}
      <Dialog open={tDialog} onOpenChange={setTDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Saisir du temps</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Employé</Label>
              <Select value={tEmploye} onValueChange={setTEmploye}>
                <SelectTrigger>
                  <SelectValue placeholder={coutsHoraires.length ? "Choisir…" : "Aucun coût horaire — en saisir un"} />
                </SelectTrigger>
                <SelectContent>
                  {coutsHoraires.map((c) => (
                    <SelectItem key={c.employe_id} value={c.employe_id}>
                      {c.employes ? `${c.employes.prenom} ${c.employes.nom}` : c.employe_id} — {fmtMoney(c.cout_horaire_charge)}/h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {employeSelectionne && (
                <p className="text-xs text-muted-foreground mt-1">
                  Coût horaire figé : {fmtMoney(employeSelectionne.cout_horaire_charge)}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={tDate} onChange={(e) => setTDate(e.target.value)} />
              </div>
              <div>
                <Label>Heures</Label>
                <Input type="number" value={tHeures} onChange={(e) => setTHeures(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Taux facturation /h</Label>
                <Input type="number" value={tTaux} onChange={(e) => setTTaux(e.target.value)} />
              </div>
              <div>
                <Label>Coût /h (override)</Label>
                <Input
                  type="number"
                  value={tCoutManuel}
                  onChange={(e) => setTCoutManuel(e.target.value)}
                  placeholder="snapshot si vide"
                />
              </div>
            </div>
            <div>
              <Label>Tâche</Label>
              <Input value={tTache} onChange={(e) => setTTache(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={tFacturable} onChange={(e) => setTFacturable(e.target.checked)} />
              Facturable
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={submitTemps}
              disabled={submitting || (!tEmploye && !tCoutManuel) || !tHeures}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Imputer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog dépense */}
      <Dialog open={dDialog} onOpenChange={setDDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter une dépense</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Type</Label>
              <Select value={dType} onValueChange={(v) => setDType(v as TypeDepense)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LIBELLES_TYPE_DEPENSE) as TypeDepense[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {LIBELLES_TYPE_DEPENSE[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Montant HT</Label>
                <Input type="number" value={dMontant} onChange={(e) => setDMontant(e.target.value)} />
              </div>
              <div>
                <Label>Marge refacturation %</Label>
                <Input type="number" value={dMarge} onChange={(e) => setDMarge(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={dDesc} onChange={(e) => setDDesc(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dFacturable} onChange={(e) => setDFacturable(e.target.checked)} />
              Facturable
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDDialog(false)}>
              Annuler
            </Button>
            <Button onClick={submitDepense} disabled={submitting || !dMontant}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog consommation stock */}
      <Dialog open={cDialog} onOpenChange={setCDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Consommer du stock</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Produit</Label>
              <Select value={cProduit} onValueChange={setCProduit}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un produit…" />
                </SelectTrigger>
                <SelectContent>
                  {produits.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.sku} — {p.designation} ({fmtMoney(p.cout_unitaire_moyen)}/u)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantité</Label>
                <Input type="number" value={cQuantite} onChange={(e) => setCQuantite(e.target.value)} />
              </div>
              <div>
                <Label>Marge refacturation %</Label>
                <Input type="number" value={cMarge} onChange={(e) => setCMarge(e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cFacturable} onChange={(e) => setCFacturable(e.target.checked)} />
              Facturable
            </label>
            <p className="text-xs text-muted-foreground">
              Sortie valorisée au CUMP courant, écriture D 6037 / C 3701 taggée sur ce job.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCDialog(false)}>
              Annuler
            </Button>
            <Button onClick={submitConsommation} disabled={submitting || !cProduit || !cQuantite}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Consommer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPageShell>
  )
}
