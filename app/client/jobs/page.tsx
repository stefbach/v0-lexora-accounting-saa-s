"use client"

/**
 * /client/jobs — Chantiers & affaires (Job costing).
 *
 * Vrai module de coûts par affaire, distinct de la comptabilité analytique :
 * on impute à un job le TEMPS passé (heures × coût horaire chargé), la
 * CONSOMMATION de stock (sortie valorisée au CUMP) et les DÉPENSES, puis on
 * suit la rentabilité (produit − coût de revient) et on facture.
 *
 * Le calcul et les écritures sont faits côté serveur (RPC imputer_temps_job,
 * consommer_stock_job, facturer_job — migrations 490-492).
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Plus, Briefcase, Clock, Package, ReceiptText, TrendingUp, FileCheck2 } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { SectionCard, OpsEmpty, OpsSkeleton, KpiCard, KpiGrid, formatMUR, formatNumber, signedClass } from "@/components/operations"
import { rentabiliteJob } from "@/lib/jobcosting/couts"
import { LIBELLES_STATUT_JOB, LIBELLES_TYPE_DEPENSE, type StatutJob, type TypeFacturation, type TypeDepense, type TypeHeures } from "@/lib/jobcosting/types"

interface Job {
  id: string
  code: string
  libelle: string
  client_nom: string | null
  statut: StatutJob
  type_facturation: TypeFacturation
  budget_montant: number | null
  budget_heures: number | null
  cout_temps_reel: number
  cout_depenses_reel: number
  montant_facturable: number
  montant_facture: number | null
  devise: string
}

interface Employe { id: string; nom: string; prenom: string; code?: string | null }
interface Produit { id: string; sku: string; designation: string }
interface Temps { id: string; date_prestation: string; heures: number; facturable: boolean; cout_total: number | null; employes?: { nom: string; prenom: string } | null }
interface Depense { id: string; type_depense: TypeDepense; description: string | null; montant_ht: number; facturable: boolean; date_depense: string }

const STATUT_STYLE: Record<StatutJob, string> = {
  ouvert: "bg-sky-100 text-sky-800",
  en_cours: "bg-amber-100 text-amber-800",
  en_pause: "bg-slate-100 text-slate-600",
  cloture: "bg-indigo-100 text-indigo-800",
  facture: "bg-emerald-100 text-emerald-800",
  annule: "bg-red-100 text-red-700",
}

const TODAY = () => new Date().toISOString().slice(0, 10)
const fmt = (n: number | null | undefined) => (Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function JobsPage() {
  const { societeId } = useSocieteActive()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const [jobs, setJobs] = useState<Job[]>([])
  const [employes, setEmployes] = useState<Employe[]>([])
  const [produits, setProduits] = useState<Produit[]>([])

  // Création job
  const [jobOpen, setJobOpen] = useState(false)
  const [jf, setJf] = useState({ code: "", libelle: "", client_nom: "", type_facturation: "temps_materiel" as TypeFacturation, budget_montant: "", budget_heures: "" })

  // Détail job
  const [detail, setDetail] = useState<{ item: Job; temps: Temps[]; depenses: Depense[]; heures_imputees: number; rentabilite: ReturnType<typeof rentabiliteJob> } | null>(null)

  // Formulaires d'imputation (dans le détail)
  const [tf, setTf] = useState({ employe_id: "", date_prestation: TODAY(), heures: "", type_heures: "normale" as TypeHeures, facturable: true, taux_horaire_facture: "", cout_horaire_charge: "" })
  const [df, setDf] = useState({ type_depense: "achat_materiel" as TypeDepense, description: "", montant_ht: "", facturable: true, marge_refacturation_pct: "0", date_depense: TODAY() })
  const [cf, setCf] = useState({ produit_id: "", quantite: "", facturable: false, marge_refacturation_pct: "0", motif: "", date_mouvement: TODAY() })

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const [jRes, eRes, pRes] = await Promise.all([
        fetch(`/api/client/jobs?societe_id=${societeId}`),
        fetch(`/api/rh/employes?societe_id=${societeId}`).catch(() => null),
        fetch(`/api/client/inventaire/produits?societe_id=${societeId}`),
      ])
      const jData = await jRes.json()
      if (!jRes.ok) throw new Error(jData.error || "Erreur jobs")
      setJobs(jData.items || [])
      if (eRes && eRes.ok) { const eData = await eRes.json(); setEmployes(eData.employes || []) }
      const pData = await pRes.json()
      setProduits((pData.items || []).filter((p: any) => p.actif !== false))
    } catch (e: any) {
      showToast(e?.message || "Erreur de chargement", "error")
    } finally {
      setLoading(false)
    }
  }, [societeId])

  useEffect(() => { load() }, [load])

  const rentaDe = useCallback(
    (j: Job) => rentabiliteJob({
      cout_temps_reel: j.cout_temps_reel, cout_depenses_reel: j.cout_depenses_reel,
      montant_facturable: j.montant_facturable, montant_facture: j.montant_facture,
      budget_montant: j.budget_montant, budget_heures: j.budget_heures,
    }),
    [],
  )

  const kpis = useMemo(() => {
    const actifs = jobs.filter((j) => j.statut === "ouvert" || j.statut === "en_cours").length
    let cout = 0, marge = 0
    for (const j of jobs) { const r = rentaDe(j); cout += r.cout_revient; marge += r.marge }
    return { actifs, total: jobs.length, cout, marge }
  }, [jobs, rentaDe])

  const openDetail = useCallback(async (jobId: string) => {
    if (!societeId) return
    try {
      const res = await fetch(`/api/client/jobs/${jobId}?societe_id=${societeId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      setDetail(data)
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    }
  }, [societeId])

  const creerJob = async () => {
    if (!societeId || !jf.code.trim() || !jf.libelle.trim()) { showToast("Code et libellé requis", "error"); return }
    setSubmitting(true)
    try {
      const res = await fetch("/api/client/jobs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, code: jf.code, libelle: jf.libelle, client_nom: jf.client_nom || null, type_facturation: jf.type_facturation, budget_montant: jf.budget_montant || null, budget_heures: jf.budget_heures || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`Chantier ${data.item?.code || ""} créé`)
      setJobOpen(false)
      setJf({ code: "", libelle: "", client_nom: "", type_facturation: "temps_materiel", budget_montant: "", budget_heures: "" })
      await load()
    } catch (e: any) { showToast(e?.message || "Erreur", "error") } finally { setSubmitting(false) }
  }

  const post = async (url: string, body: Record<string, unknown>) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ societe_id: societeId, ...body }) })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Erreur")
    return data
  }

  const ajouterTemps = async () => {
    if (!detail || !tf.employe_id || !(Number(tf.heures) > 0)) { showToast("Employé et heures (> 0) requis", "error"); return }
    setSubmitting(true)
    try {
      await post(`/api/client/jobs/${detail.item.id}/temps`, {
        employe_id: tf.employe_id, date_prestation: tf.date_prestation, heures: Number(tf.heures), type_heures: tf.type_heures,
        facturable: tf.facturable,
        taux_horaire_facture: tf.taux_horaire_facture ? Number(tf.taux_horaire_facture) : null,
        cout_horaire_charge: tf.cout_horaire_charge ? Number(tf.cout_horaire_charge) : null,
      })
      showToast("Temps imputé")
      setTf((f) => ({ ...f, heures: "" }))
      await openDetail(detail.item.id); await load()
    } catch (e: any) { showToast(e?.message || "Erreur", "error") } finally { setSubmitting(false) }
  }

  const ajouterDepense = async () => {
    if (!detail || !(Number(df.montant_ht) > 0)) { showToast("Montant HT > 0 requis", "error"); return }
    setSubmitting(true)
    try {
      await post(`/api/client/jobs/${detail.item.id}/depenses`, {
        type_depense: df.type_depense, description: df.description || null, montant_ht: Number(df.montant_ht),
        facturable: df.facturable, marge_refacturation_pct: Number(df.marge_refacturation_pct) || 0, date_depense: df.date_depense,
      })
      showToast("Dépense enregistrée")
      setDf((f) => ({ ...f, description: "", montant_ht: "" }))
      await openDetail(detail.item.id); await load()
    } catch (e: any) { showToast(e?.message || "Erreur", "error") } finally { setSubmitting(false) }
  }

  const ajouterConso = async () => {
    if (!detail || !cf.produit_id || !(Number(cf.quantite) > 0)) { showToast("Produit et quantité (> 0) requis", "error"); return }
    setSubmitting(true)
    try {
      await post(`/api/client/jobs/${detail.item.id}/consommation`, {
        produit_id: cf.produit_id, quantite: Number(cf.quantite), facturable: cf.facturable,
        marge_refacturation_pct: Number(cf.marge_refacturation_pct) || 0, motif: cf.motif || null, date_mouvement: cf.date_mouvement,
      })
      showToast("Stock consommé et imputé")
      setCf((f) => ({ ...f, quantite: "", motif: "" }))
      await openDetail(detail.item.id); await load()
    } catch (e: any) { showToast(e?.message || "Erreur", "error") } finally { setSubmitting(false) }
  }

  const facturer = async () => {
    if (!detail) return
    if (!confirm("Facturer ce chantier ? Le montant facturable sera gelé et le job passe en « facturé ».")) return
    setSubmitting(true)
    try {
      await post(`/api/client/jobs/${detail.item.id}/facturer`, {})
      showToast("Chantier facturé")
      setDetail(null); await load()
    } catch (e: any) { showToast(e?.message || "Erreur", "error") } finally { setSubmitting(false) }
  }

  const r = detail ? detail.rentabilite : null

  return (
    <ClientPageShell
      breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Chantiers & affaires" }]}
      kicker="Job costing"
      title="Chantiers & affaires"
      subtitle="Coûts par affaire : imputez le temps passé, la consommation de stock et les dépenses ; suivez la rentabilité en temps réel (produit − coût de revient) puis facturez."
      disableParticles
      actions={<Button size="sm" onClick={() => setJobOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nouveau chantier</Button>}
    >
      {toast && <div className={`mb-4 rounded-md px-4 py-2 text-sm ${toast.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`} role="status">{toast.msg}</div>}

      {loading ? (
        <OpsSkeleton kpis={4} rows={4} />
      ) : (
        <div className="space-y-6">
          <KpiGrid cols={4}>
            <KpiCard label="Chantiers actifs" value={formatNumber(kpis.actifs)} icon={Briefcase} color="#A88925" />
            <KpiCard label="Total chantiers" value={formatNumber(kpis.total)} icon={FileCheck2} color="#0B0F2E" />
            <KpiCard label="Coût de revient cumulé" value={formatMUR(kpis.cout)} icon={ReceiptText} color="#9F1239" />
            <KpiCard label="Marge cumulée" value={formatMUR(kpis.marge)} icon={TrendingUp} color="#0F766E" />
          </KpiGrid>

          <SectionCard title="Chantiers" subtitle="Cliquez pour imputer temps / dépenses / stock et suivre la marge" contentClassName="pt-0">
            {jobs.length === 0 ? (
              <OpsEmpty icon={Briefcase} title="Aucun chantier" description="Créez votre premier chantier pour y imputer temps, stock et dépenses." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Libellé</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Coût revient</TableHead>
                      <TableHead className="text-right">Produit</TableHead>
                      <TableHead className="text-right">Marge</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((j) => {
                      const rj = rentaDe(j)
                      return (
                        <TableRow key={j.id} className="cursor-pointer" onClick={() => openDetail(j.id)}>
                          <TableCell className="font-mono text-xs">{j.code}</TableCell>
                          <TableCell className="font-medium">{j.libelle}</TableCell>
                          <TableCell>{j.client_nom || "—"}</TableCell>
                          <TableCell><Badge className={STATUT_STYLE[j.statut]}>{LIBELLES_STATUT_JOB[j.statut]}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(rj.cout_revient)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(rj.produit)}</TableCell>
                          <TableCell className={`text-right tabular-nums font-medium ${signedClass(rj.marge)}`}>
                            {fmt(rj.marge)}{rj.marge_pct != null ? ` (${rj.marge_pct}%)` : ""}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* ── Dialog nouveau chantier ── */}
      <Dialog open={jobOpen} onOpenChange={setJobOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nouveau chantier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Code *</Label><Input value={jf.code} onChange={(e) => setJf((f) => ({ ...f, code: e.target.value }))} placeholder="CH-001" autoFocus /></div>
              <div>
                <Label>Facturation</Label>
                <Select value={jf.type_facturation} onValueChange={(v) => setJf((f) => ({ ...f, type_facturation: v as TypeFacturation }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="temps_materiel">Temps &amp; matériel</SelectItem>
                    <SelectItem value="forfait">Forfait</SelectItem>
                    <SelectItem value="abonnement">Abonnement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Libellé *</Label><Input value={jf.libelle} onChange={(e) => setJf((f) => ({ ...f, libelle: e.target.value }))} placeholder="Rénovation villa X" /></div>
            <div><Label>Client</Label><Input value={jf.client_nom} onChange={(e) => setJf((f) => ({ ...f, client_nom: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Budget montant</Label><Input type="number" min="0" step="0.01" value={jf.budget_montant} onChange={(e) => setJf((f) => ({ ...f, budget_montant: e.target.value }))} /></div>
              <div><Label>Budget heures</Label><Input type="number" min="0" step="0.5" value={jf.budget_heures} onChange={(e) => setJf((f) => ({ ...f, budget_heures: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJobOpen(false)}>Annuler</Button>
            <Button onClick={creerJob} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog détail chantier ── */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {detail && r && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono text-sm">{detail.item.code}</span> {detail.item.libelle}
                  <Badge className={STATUT_STYLE[detail.item.statut]}>{LIBELLES_STATUT_JOB[detail.item.statut]}</Badge>
                </DialogTitle>
              </DialogHeader>

              {/* Rentabilité */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-lg border p-3 text-sm">
                <div><div className="text-xs text-muted-foreground">Coût de revient</div><div className="font-semibold">{fmt(r.cout_revient)}</div></div>
                <div><div className="text-xs text-muted-foreground">{detail.item.montant_facture != null ? "Facturé" : "Facturable"}</div><div className="font-semibold">{fmt(r.produit)}</div></div>
                <div><div className="text-xs text-muted-foreground">Marge</div><div className={`font-semibold ${signedClass(r.marge)}`}>{fmt(r.marge)}{r.marge_pct != null ? ` (${r.marge_pct}%)` : ""}</div></div>
                <div><div className="text-xs text-muted-foreground">Heures imputées</div><div className="font-semibold">{formatNumber(detail.heures_imputees)}{r.avancement_heures_pct != null ? ` / ${r.avancement_heures_pct}%` : ""}</div></div>
              </div>
              {r.depassement_budget && <div className="rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700">⚠ Coût de revient au-delà du budget</div>}

              {/* Temps */}
              <SectionCard title={<span className="flex items-center gap-1.5 text-sm"><Clock className="h-4 w-4" /> Temps</span>} contentClassName="pt-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-6 items-end">
                  <div className="col-span-2">
                    <Label className="text-xs">Employé</Label>
                    <Select value={tf.employe_id} onValueChange={(v) => setTf((f) => ({ ...f, employe_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                      <SelectContent>{employes.map((e) => <SelectItem key={e.id} value={e.id}>{e.prenom} {e.nom}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Date</Label><Input type="date" value={tf.date_prestation} onChange={(e) => setTf((f) => ({ ...f, date_prestation: e.target.value }))} /></div>
                  <div><Label className="text-xs">Heures</Label><Input type="number" min="0" step="0.25" value={tf.heures} onChange={(e) => setTf((f) => ({ ...f, heures: e.target.value }))} /></div>
                  <div><Label className="text-xs">Coût/h</Label><Input type="number" min="0" step="0.01" value={tf.cout_horaire_charge} onChange={(e) => setTf((f) => ({ ...f, cout_horaire_charge: e.target.value }))} /></div>
                  <div><Label className="text-xs">Fact./h</Label><Input type="number" min="0" step="0.01" value={tf.taux_horaire_facture} onChange={(e) => setTf((f) => ({ ...f, taux_horaire_facture: e.target.value }))} /></div>
                  <div className="col-span-2 flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={tf.facturable} onChange={(e) => setTf((f) => ({ ...f, facturable: e.target.checked }))} /> facturable</label>
                    <Button size="sm" onClick={ajouterTemps} disabled={submitting}>Imputer</Button>
                  </div>
                </div>
                {detail.temps.length > 0 && (
                  <div className="mt-2 space-y-1 text-xs">
                    {detail.temps.map((t) => (
                      <div key={t.id} className="flex justify-between border-b pb-1">
                        <span>{t.date_prestation} · {t.employes ? `${t.employes.prenom} ${t.employes.nom}` : ""} · {formatNumber(t.heures)}h{t.facturable ? "" : " (non fact.)"}</span>
                        <span className="tabular-nums">{fmt(t.cout_total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {/* Consommation stock */}
              <SectionCard title={<span className="flex items-center gap-1.5 text-sm"><Package className="h-4 w-4" /> Consommation de stock</span>} contentClassName="pt-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 items-end">
                  <div className="col-span-2">
                    <Label className="text-xs">Produit</Label>
                    <Select value={cf.produit_id} onValueChange={(v) => setCf((f) => ({ ...f, produit_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
                      <SelectContent>{produits.map((p) => <SelectItem key={p.id} value={p.id}>{p.designation} ({p.sku})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Quantité</Label><Input type="number" min="0" step="0.001" value={cf.quantite} onChange={(e) => setCf((f) => ({ ...f, quantite: e.target.value }))} /></div>
                  <div><Label className="text-xs">Date</Label><Input type="date" value={cf.date_mouvement} onChange={(e) => setCf((f) => ({ ...f, date_mouvement: e.target.value }))} /></div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={cf.facturable} onChange={(e) => setCf((f) => ({ ...f, facturable: e.target.checked }))} /> fact.</label>
                    <Button size="sm" onClick={ajouterConso} disabled={submitting}>Sortir</Button>
                  </div>
                </div>
              </SectionCard>

              {/* Dépenses */}
              <SectionCard title={<span className="flex items-center gap-1.5 text-sm"><ReceiptText className="h-4 w-4" /> Dépenses</span>} contentClassName="pt-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-6 items-end">
                  <div className="col-span-2">
                    <Label className="text-xs">Type</Label>
                    <Select value={df.type_depense} onValueChange={(v) => setDf((f) => ({ ...f, type_depense: v as TypeDepense }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{(Object.keys(LIBELLES_TYPE_DEPENSE) as TypeDepense[]).map((k) => <SelectItem key={k} value={k}>{LIBELLES_TYPE_DEPENSE[k]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2"><Label className="text-xs">Description</Label><Input value={df.description} onChange={(e) => setDf((f) => ({ ...f, description: e.target.value }))} /></div>
                  <div><Label className="text-xs">Montant HT</Label><Input type="number" min="0" step="0.01" value={df.montant_ht} onChange={(e) => setDf((f) => ({ ...f, montant_ht: e.target.value }))} /></div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={df.facturable} onChange={(e) => setDf((f) => ({ ...f, facturable: e.target.checked }))} /> fact.</label>
                    <Button size="sm" onClick={ajouterDepense} disabled={submitting}>Ajouter</Button>
                  </div>
                </div>
                {detail.depenses.length > 0 && (
                  <div className="mt-2 space-y-1 text-xs">
                    {detail.depenses.map((d) => (
                      <div key={d.id} className="flex justify-between border-b pb-1">
                        <span>{d.date_depense} · {LIBELLES_TYPE_DEPENSE[d.type_depense]}{d.description ? ` · ${d.description}` : ""}{d.facturable ? "" : " (non fact.)"}</span>
                        <span className="tabular-nums">{fmt(d.montant_ht)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDetail(null)}>Fermer</Button>
                {detail.item.statut !== "facture" && detail.item.statut !== "annule" && (
                  <Button onClick={facturer} disabled={submitting}>
                    {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Facturer {fmt(r.produit)}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ClientPageShell>
  )
}
