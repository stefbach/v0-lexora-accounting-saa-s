"use client"

/**
 * /client/analytique — Comptabilité analytique unifiée.
 *
 * Un seul module pour toutes les sections analytiques (chantiers, ordres de
 * fabrication, centres de coût, projets), bâti sur la compta classique : le
 * P&L de chaque section est calculé depuis les écritures qui lui sont
 * rattachées (ecritures_comptables_v2.section_analytique_id, mig 500).
 *
 * Remplace la lecture éclatée « Production » / « Affaires & Chantiers » par une
 * vue unique réel vs budget + marge, déclinée par type de section.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { KpiCard } from "@/components/operations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Loader2, RefreshCw, Plus, Layers, TrendingUp, TrendingDown, Wallet, Building2, X, Scale, KeyRound,
} from "lucide-react"
import { SECTION_TYPE_LABELS, type SectionType } from "@/lib/analytique/sections"
import { VentilationDialog } from "@/components/analytique/VentilationDialog"
import { GrilleView } from "@/components/analytique/GrilleView"
import { ClesDialog } from "@/components/analytique/ClesDialog"

const NAVY = "#0B0F2E"
const TEAL = "#0F766E"
const RED = "#9F1239"
const GOLD = "#A88925"

function fmt(n: number, dec = 2): string {
  return new Intl.NumberFormat("en-MU", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n || 0)
}

interface SectionPnl {
  produits: number; charges: number; marge: number; marge_pct: number | null; nb_ecritures: number
}
interface Section {
  id: string; code: string; libelle: string; type: SectionType; statut: string
  budget_montant: number | null; budget_heures: number | null; pnl: SectionPnl
}

const TYPE_TABS: { key: string; label: string }[] = [
  { key: "tous", label: "Toutes" },
  { key: "chantier", label: "Chantiers" },
  { key: "production", label: "Production" },
  { key: "centre_cout", label: "Centres de coût" },
  { key: "projet", label: "Projets" },
]

const TYPE_BADGE: Record<SectionType, string> = {
  chantier: "bg-sky-100 text-sky-700",
  production: "bg-violet-100 text-violet-700",
  centre_cout: "bg-amber-100 text-amber-700",
  projet: "bg-emerald-100 text-emerald-700",
}

export default function AnalytiquePage() {
  const { societeId } = useSocieteActive()
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState("tous")
  const [vue, setVue] = useState<"sections" | "grille">("sections")
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [ventilOpen, setVentilOpen] = useState(false)
  const [clesOpen, setClesOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 5000)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/client/analytique/sections?societe_id=${societeId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Erreur de chargement")
      setSections(data.items || [])
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setLoading(false)
    }
  }, [societeId])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(
    () => (tab === "tous" ? sections : sections.filter((s) => s.type === tab)),
    [sections, tab],
  )

  const totals = useMemo(() => {
    let produits = 0, charges = 0
    for (const s of sections) { produits += s.pnl.produits; charges += s.pnl.charges }
    const actives = sections.filter((s) => s.statut === "actif").length
    return { produits, charges, marge: produits - charges, actives }
  }, [sections])

  return (
    <ClientPageShell
      disableParticles
      breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Comptabilité analytique" }]}
      kicker="Pilotage & rentabilité"
      title="Comptabilité analytique"
      subtitle="Chantiers, production, centres de coût et projets — un axe unique posé sur la comptabilité classique. Réel vs budget, marge par section."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} aria-label="Rafraîchir">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setClesOpen(true)}>
            <KeyRound className="h-4 w-4 mr-1" /> Clés
          </Button>
          <Button variant="outline" size="sm" onClick={() => setVentilOpen(true)}>
            <Scale className="h-4 w-4 mr-1" /> Ventiler
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Section
          </Button>
        </div>
      }
    >
      {toast && (
        <div className={`mb-4 rounded-lg px-4 py-2 text-sm ${toast.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {toast.msg}
        </div>
      )}

      {!societeId ? (
        <p className="text-slate-500">Sélectionnez une société.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <KpiCard label="Produits analytiques" value={fmt(totals.produits)} icon={TrendingUp} color={TEAL} hint="Comptes classe 7" />
            <KpiCard label="Charges analytiques" value={fmt(totals.charges)} icon={TrendingDown} color={RED} hint="Comptes classe 6" />
            <KpiCard label="Marge globale" value={fmt(totals.marge)} icon={Wallet} color={totals.marge < 0 ? RED : GOLD} hint="Produits − charges" />
            <KpiCard label="Sections actives" value={totals.actives} icon={Layers} color={NAVY} hint={`${sections.length} au total`} />
          </div>

          <div className="inline-flex rounded-lg border p-0.5 mb-4">
            <button
              className={`px-3 py-1 text-sm rounded-md ${vue === "sections" ? "bg-slate-900 text-white" : "text-slate-600"}`}
              onClick={() => setVue("sections")}
            >Sections</button>
            <button
              className={`px-3 py-1 text-sm rounded-md ${vue === "grille" ? "bg-slate-900 text-white" : "text-slate-600"}`}
              onClick={() => setVue("grille")}
            >Grille (compte × section)</button>
          </div>

          {vue === "grille" ? (
            <GrilleView societeId={societeId} />
          ) : (
          <>
          <Tabs value={tab} onValueChange={setTab} className="mb-4">
            <TabsList>
              {TYPE_TABS.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}
            </TabsList>
          </Tabs>

          <div className="rounded-xl border overflow-x-auto bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left p-3 font-medium">Code</th>
                  <th className="text-left p-3 font-medium">Libellé</th>
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-right p-3 font-medium">Produits</th>
                  <th className="text-right p-3 font-medium">Charges</th>
                  <th className="text-right p-3 font-medium">Marge</th>
                  <th className="text-right p-3 font-medium">Marge %</th>
                  <th className="text-right p-3 font-medium">Budget</th>
                  <th className="text-right p-3 font-medium">Écart</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-slate-400">
                    {loading ? "Chargement…" : "Aucune section analytique. Créez un centre de coût ou un projet, ou lancez un chantier / un ordre de fabrication."}
                  </td></tr>
                )}
                {filtered.map((s) => {
                  const ecartBudget = s.budget_montant != null ? s.pnl.charges - s.budget_montant : null
                  return (
                    <tr key={s.id} className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => setDetailId(s.id)}>
                      <td className="p-3 font-mono text-xs">{s.code}</td>
                      <td className="p-3">{s.libelle}{s.statut === "clos" && <Badge variant="outline" className="ml-2 text-[10px]">clos</Badge>}</td>
                      <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${TYPE_BADGE[s.type]}`}>{SECTION_TYPE_LABELS[s.type]}</span></td>
                      <td className="p-3 text-right tabular-nums">{fmt(s.pnl.produits)}</td>
                      <td className="p-3 text-right tabular-nums">{fmt(s.pnl.charges)}</td>
                      <td className={`p-3 text-right tabular-nums font-medium ${s.pnl.marge < 0 ? "text-red-600" : "text-emerald-700"}`}>{fmt(s.pnl.marge)}</td>
                      <td className="p-3 text-right tabular-nums">{s.pnl.marge_pct != null ? `${fmt(s.pnl.marge_pct, 1)}%` : "—"}</td>
                      <td className="p-3 text-right tabular-nums text-slate-500">{s.budget_montant != null ? fmt(s.budget_montant) : "—"}</td>
                      <td className={`p-3 text-right tabular-nums ${ecartBudget != null && ecartBudget > 0 ? "text-red-600" : "text-slate-500"}`}>
                        {ecartBudget != null ? fmt(ecartBudget) : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
          )}
        </>
      )}

      <CreateSectionDialog
        societeId={societeId} open={createOpen} onOpenChange={setCreateOpen}
        onCreated={() => { showToast("Section créée"); load() }}
      />
      <VentilationDialog
        societeId={societeId} sections={sections} open={ventilOpen} onOpenChange={setVentilOpen}
        onDone={() => { showToast("Ventilation enregistrée"); load() }}
      />
      <ClesDialog
        societeId={societeId} sections={sections} open={clesOpen} onOpenChange={setClesOpen}
        onChanged={() => showToast("Clés mises à jour")}
      />
      <SectionDetailDialog
        societeId={societeId} sectionId={detailId} onClose={() => setDetailId(null)}
        onChanged={() => load()} onToast={showToast}
      />
    </ClientPageShell>
  )
}

function CreateSectionDialog({
  societeId, open, onOpenChange, onCreated,
}: { societeId: string | null; open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [code, setCode] = useState("")
  const [libelle, setLibelle] = useState("")
  const [type, setType] = useState<SectionType>("centre_cout")
  const [budget, setBudget] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (!societeId || !code.trim() || !libelle.trim()) return
    setSubmitting(true); setErr(null)
    try {
      const res = await fetch("/api/client/analytique/sections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, code, libelle, type, budget_montant: budget || null }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data?.error || "Erreur"); setSubmitting(false); return }
      setCode(""); setLibelle(""); setBudget(""); setType("centre_cout")
      onOpenChange(false); onCreated()
    } catch (e: any) { setErr(e?.message || "Erreur") } finally { setSubmitting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouvelle section analytique</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Crée une section analytique : <strong>chantier</strong>, <strong>production</strong>,
            <strong> centre de coût</strong> ou <strong>projet</strong>. Les charges et produits
            s'y ventilent ensuite depuis la comptabilité.
          </p>
          <div>
            <Label>Type</Label>
            <select className="w-full border rounded px-3 py-2 text-sm bg-white mt-1" value={type} onChange={(e) => setType(e.target.value as SectionType)}>
              <option value="chantier">Chantier / Affaire</option>
              <option value="production">Production</option>
              <option value="centre_cout">Centre de coût</option>
              <option value="projet">Projet</option>
            </select>
          </div>
          <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CC-ATELIER" /></div>
          <div><Label>Libellé</Label><Input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Atelier de production" /></div>
          <div><Label>Budget (MUR, optionnel)</Label><Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0.00" /></div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} disabled={submitting || !code.trim() || !libelle.trim()}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface Ventilation { numero_compte: string; nom_compte: string; net: number }
interface DetailData {
  section: Section
  pnl: SectionPnl
  ventilation: Ventilation[]
  ecritures: Array<{ id: string; date_ecriture: string; numero_compte: string; nom_compte: string; description: string; debit_mur: number; credit_mur: number; journal: string }>
}

function SectionDetailDialog({
  societeId, sectionId, onClose, onChanged, onToast,
}: {
  societeId: string | null; sectionId: string | null; onClose: () => void
  onChanged: () => void; onToast: (m: string, t?: "success" | "error") => void
}) {
  const [data, setData] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!societeId || !sectionId) { setData(null); return }
    setLoading(true)
    fetch(`/api/client/analytique/sections/${sectionId}?societe_id=${societeId}`)
      .then((r) => r.json())
      .then((d) => { if (d?.error) onToast(d.error, "error"); else setData(d) })
      .catch((e) => onToast(e?.message || "Erreur", "error"))
      .finally(() => setLoading(false))
  }, [societeId, sectionId, onToast])

  const toggleStatut = async () => {
    if (!societeId || !data) return
    const next = data.section.statut === "clos" ? "actif" : "clos"
    const res = await fetch(`/api/client/analytique/sections/${data.section.id}?societe_id=${societeId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statut: next }),
    })
    if (res.ok) { onToast(next === "clos" ? "Section clôturée" : "Section rouverte"); onChanged(); onClose() }
    else onToast("Erreur", "error")
  }

  return (
    <Dialog open={!!sectionId} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> {data?.section.libelle || "Section"}</DialogTitle>
        </DialogHeader>
        {loading || !data ? (
          <div className="py-8 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 text-center"><div className="text-lg font-bold text-emerald-700">{fmt(data.pnl.produits)}</div><div className="text-xs text-slate-500">Produits</div></div>
              <div className="rounded-lg border p-3 text-center"><div className="text-lg font-bold text-red-600">{fmt(data.pnl.charges)}</div><div className="text-xs text-slate-500">Charges</div></div>
              <div className="rounded-lg border p-3 text-center"><div className={`text-lg font-bold ${data.pnl.marge < 0 ? "text-red-600" : "text-emerald-700"}`}>{fmt(data.pnl.marge)}</div><div className="text-xs text-slate-500">Marge</div></div>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Ventilation par compte</p>
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50"><tr><th className="text-left p-2">Compte</th><th className="text-right p-2">Net</th></tr></thead>
                  <tbody>
                    {data.ventilation.length === 0 && <tr><td colSpan={2} className="p-4 text-center text-slate-400">Aucune écriture rattachée</td></tr>}
                    {data.ventilation.map((v) => (
                      <tr key={v.numero_compte} className="border-t">
                        <td className="p-2">{v.nom_compte || v.numero_compte}</td>
                        <td className={`p-2 text-right tabular-nums ${v.net < 0 ? "text-red-600" : ""}`}>{fmt(v.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          {data && (
            <Button variant="outline" onClick={toggleStatut}>
              {data.section.statut === "clos" ? "Rouvrir" : "Clôturer"}
            </Button>
          )}
          <Button onClick={onClose}><X className="h-4 w-4 mr-1" /> Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
