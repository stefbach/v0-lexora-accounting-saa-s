"use client"

/**
 * Page /client/jobs — Job Costing (Module D).
 *
 * Liste des jobs/mandats facturables avec coûts cumulés (main d'œuvre +
 * dépenses), montant facturable et marge. Dialog de création de job.
 * Le détail (temps, dépenses, consommation stock, facturation) est sur
 * /client/jobs/[id].
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
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
import { Loader2, Plus, RefreshCw, Search, Briefcase } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import {
  LIBELLES_STATUT_JOB,
  type StatutJob,
  type TypeFacturation,
} from "@/lib/jobcosting/types"

interface JobRow {
  id: string
  code: string
  libelle: string
  client_nom: string | null
  statut: StatutJob
  type_facturation: TypeFacturation
  budget_montant: number | null
  cout_temps_reel: number
  cout_depenses_reel: number
  montant_facturable: number
  montant_facture: number | null
}

function fmtMoney(n: number | null): string {
  return (Number(n) || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " MUR"
}

function StatutBadge({ statut }: { statut: StatutJob }) {
  const variant: Record<StatutJob, string> = {
    ouvert: "bg-blue-50 text-blue-700 border-blue-200",
    en_cours: "bg-indigo-50 text-indigo-700 border-indigo-200",
    en_pause: "bg-amber-50 text-amber-700 border-amber-200",
    cloture: "bg-slate-100 text-slate-700 border-slate-200",
    facture: "bg-emerald-50 text-emerald-700 border-emerald-200",
    annule: "bg-red-50 text-red-700 border-red-200",
  }
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${variant[statut]}`}>
      {LIBELLES_STATUT_JOB[statut]}
    </span>
  )
}

function margeInfo(j: JobRow): { cout: number; produit: number; marge: number; pct: number | null } {
  const cout = (Number(j.cout_temps_reel) || 0) + (Number(j.cout_depenses_reel) || 0)
  const produit = j.montant_facture != null ? Number(j.montant_facture) : Number(j.montant_facturable) || 0
  const marge = produit - cout
  const pct = produit > 0 ? (marge / produit) * 100 : null
  return { cout, produit, marge, pct }
}

export default function JobsPage() {
  const { societeId } = useSocieteActive()
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [search, setSearch] = useState("")
  const [statutFiltre, setStatutFiltre] = useState<string>("tous")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [fCode, setFCode] = useState("")
  const [fLibelle, setFLibelle] = useState("")
  const [fClient, setFClient] = useState("")
  const [fType, setFType] = useState<TypeFacturation>("temps_materiel")
  const [fBudgetHeures, setFBudgetHeures] = useState("")
  const [fBudgetMontant, setFBudgetMontant] = useState("")

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 5000)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/client/jobs?societe_id=${societeId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      setJobs(data.items || [])
    } catch (e: any) {
      showToast(e?.message || "Erreur de chargement", "error")
    } finally {
      setLoading(false)
    }
  }, [societeId])

  useEffect(() => {
    load()
  }, [load])

  const jobsFiltres = useMemo(() => {
    const q = search.trim().toLowerCase()
    return jobs.filter((j) => {
      if (statutFiltre !== "tous" && j.statut !== statutFiltre) return false
      if (!q) return true
      return (
        j.code.toLowerCase().includes(q) ||
        j.libelle.toLowerCase().includes(q) ||
        (j.client_nom || "").toLowerCase().includes(q)
      )
    })
  }, [jobs, search, statutFiltre])

  const totaux = useMemo(() => {
    return jobsFiltres.reduce(
      (acc, j) => {
        const m = margeInfo(j)
        acc.cout += m.cout
        acc.produit += m.produit
        acc.marge += m.marge
        return acc
      },
      { cout: 0, produit: 0, marge: 0 },
    )
  }, [jobsFiltres])

  const resetForm = () => {
    setFCode("")
    setFLibelle("")
    setFClient("")
    setFType("temps_materiel")
    setFBudgetHeures("")
    setFBudgetMontant("")
  }

  const submitJob = async () => {
    if (!societeId) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/client/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          code: fCode,
          libelle: fLibelle,
          client_nom: fClient || null,
          type_facturation: fType,
          budget_heures: fBudgetHeures || null,
          budget_montant: fBudgetMontant || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`Job ${data.item.code} créé`)
      setDialogOpen(false)
      resetForm()
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ClientPageShell
      breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Jobs" }]}
      kicker="Contrôle de gestion"
      title="Jobs & rentabilité"
      subtitle="Projets/mandats facturables : coût de revient (temps + matières), montant facturable et marge par job."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nouveau job
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

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Coût de revient cumulé</div>
            <div className="text-lg font-semibold">{fmtMoney(totaux.cout)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Facturable / facturé</div>
            <div className="text-lg font-semibold">{fmtMoney(totaux.produit)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Marge cumulée</div>
            <div className={`text-lg font-semibold ${totaux.marge < 0 ? "text-red-600" : "text-emerald-700"}`}>
              {fmtMoney(totaux.marge)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 w-64"
            placeholder="Rechercher un job…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statutFiltre} onValueChange={setStatutFiltre}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">Tous les statuts</SelectItem>
            {(Object.keys(LIBELLES_STATUT_JOB) as StatutJob[]).map((s) => (
              <SelectItem key={s} value={s}>
                {LIBELLES_STATUT_JOB[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Libellé</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Coût revient</TableHead>
                  <TableHead className="text-right">Facturable</TableHead>
                  <TableHead className="text-right">Marge</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobsFiltres.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      <Briefcase className="mx-auto mb-2 h-6 w-6 opacity-40" />
                      Aucun job
                    </TableCell>
                  </TableRow>
                )}
                {jobsFiltres.map((j) => {
                  const m = margeInfo(j)
                  return (
                    <TableRow key={j.id} className="hover:bg-muted/40">
                      <TableCell className="font-mono text-xs">
                        <Link href={`/client/jobs/${j.id}`} className="text-primary hover:underline">
                          {j.code}
                        </Link>
                      </TableCell>
                      <TableCell>{j.libelle}</TableCell>
                      <TableCell className="text-muted-foreground">{j.client_nom || "—"}</TableCell>
                      <TableCell>
                        <StatutBadge statut={j.statut} />
                      </TableCell>
                      <TableCell className="text-right">{fmtMoney(m.cout)}</TableCell>
                      <TableCell className="text-right">{fmtMoney(m.produit)}</TableCell>
                      <TableCell className={`text-right ${m.marge < 0 ? "text-red-600" : ""}`}>
                        {fmtMoney(m.marge)}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.pct == null ? "—" : `${m.pct.toFixed(1)}%`}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau job</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Code</Label>
                <Input value={fCode} onChange={(e) => setFCode(e.target.value)} placeholder="JOB-2026-014" />
              </div>
              <div>
                <Label>Type de facturation</Label>
                <Select value={fType} onValueChange={(v) => setFType(v as TypeFacturation)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="temps_materiel">Temps & matériel</SelectItem>
                    <SelectItem value="forfait">Forfait</SelectItem>
                    <SelectItem value="abonnement">Abonnement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Libellé</Label>
              <Input value={fLibelle} onChange={(e) => setFLibelle(e.target.value)} placeholder="Audit annuel ACME Ltd" />
            </div>
            <div>
              <Label>Client (libre si pas de dossier)</Label>
              <Input value={fClient} onChange={(e) => setFClient(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Budget heures</Label>
                <Input type="number" value={fBudgetHeures} onChange={(e) => setFBudgetHeures(e.target.value)} />
              </div>
              <div>
                <Label>Budget montant (MUR)</Label>
                <Input type="number" value={fBudgetMontant} onChange={(e) => setFBudgetMontant(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submitJob} disabled={submitting || !fCode || !fLibelle}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPageShell>
  )
}
