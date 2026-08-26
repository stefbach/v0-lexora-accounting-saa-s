"use client"

/**
 * VentilationDialog — répartir les charges/produits non affectés sur des
 * sections analytiques. Liste de travail « à ventiler » + éditeur d'allocation
 * (multi-sections, split, répartition du reste à parts égales).
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Scale, Plus, Trash2, Split, X, KeyRound } from "lucide-react"
import { splitByPercentages } from "@/lib/analytique/ventilation"

function fmt(n: number): string {
  return new Intl.NumberFormat("en-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
}
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

interface SectionLite { id: string; code: string; libelle: string; statut: string }
interface WorkItem {
  id: string; date_ecriture: string; numero_compte: string; nom_compte: string
  description: string; nature: string; net: number; ventile: number; reste: number
  allocations: Array<{ section_analytique_id: string; montant: number }>
}
interface Alloc { section_analytique_id: string; montant: string }

export function VentilationDialog({
  societeId, sections, open, onOpenChange, onDone,
}: {
  societeId: string | null
  sections: SectionLite[]
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone: () => void
}) {
  const [items, setItems] = useState<WorkItem[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<WorkItem | null>(null)
  const [allocs, setAllocs] = useState<Alloc[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [cles, setCles] = useState<Array<{ id: string; code: string; libelle: string; lignes: Array<{ section_analytique_id: string; pct: number }> }>>([])

  const activeSections = useMemo(() => sections.filter((s) => s.statut !== "clos"), [sections])

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/client/analytique/ventilations?societe_id=${societeId}&reste=1`)
      const data = await res.json()
      if (res.ok) setItems(data.items || [])
    } finally {
      setLoading(false)
    }
  }, [societeId])

  useEffect(() => { if (open) { load(); setEditing(null) } }, [open, load])

  useEffect(() => {
    if (!open || !societeId) return
    fetch(`/api/client/analytique/cles?societe_id=${societeId}`)
      .then((r) => r.json()).then((d) => setCles(d.items || [])).catch(() => setCles([]))
  }, [open, societeId])

  const appliquerCle = (cleId: string) => {
    if (!editing) return
    const cle = cles.find((c) => c.id === cleId)
    if (!cle) return
    const alloc = splitByPercentages(editing.net, cle.lignes.map((l) => ({ section_analytique_id: l.section_analytique_id, pct: l.pct })))
    setAllocs(alloc.map((a) => ({ section_analytique_id: a.section_analytique_id, montant: String(a.montant) })))
  }

  const startEdit = (it: WorkItem) => {
    setErr(null)
    setEditing(it)
    setAllocs(
      it.allocations.length
        ? it.allocations.map((a) => ({ section_analytique_id: a.section_analytique_id, montant: String(a.montant) }))
        : [{ section_analytique_id: activeSections[0]?.id || "", montant: String(it.reste) }],
    )
  }

  const totalAlloc = allocs.reduce((s, a) => s + (Number(a.montant) || 0), 0)

  const repartirEgal = () => {
    if (!editing || allocs.length === 0) return
    const each = r2(editing.net / allocs.length)
    setAllocs((prev) => prev.map((a, i) => ({
      ...a,
      montant: String(i === prev.length - 1 ? r2(editing.net - each * (prev.length - 1)) : each),
    })))
  }

  const save = async () => {
    if (!societeId || !editing) return
    setSaving(true); setErr(null)
    try {
      const res = await fetch("/api/client/analytique/ventilations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          ecriture_id: editing.id,
          allocations: allocs
            .filter((a) => a.section_analytique_id && Number(a.montant) > 0)
            .map((a) => ({ section_analytique_id: a.section_analytique_id, montant: Number(a.montant) })),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data?.error || "Erreur"); setSaving(false); return }
      setEditing(null)
      await load()
      onDone()
    } catch (e: any) { setErr(e?.message || "Erreur") } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Scale className="h-5 w-5" /> Ventilation des charges &amp; produits</DialogTitle>
        </DialogHeader>

        {!editing ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Écritures de charge (classe 6) et de produit (classe 7) non encore affectées à une section.
              Répartissez-les sur vos sections analytiques.
            </p>
            {loading ? (
              <div className="py-10 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-emerald-600 text-sm">Tout est ventilé — aucune écriture en attente. 🎉</div>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left p-2">Date</th><th className="text-left p-2">Compte</th>
                      <th className="text-left p-2">Libellé</th><th className="text-right p-2">Net</th>
                      <th className="text-right p-2">Reste</th><th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-t hover:bg-slate-50">
                        <td className="p-2 whitespace-nowrap">{it.date_ecriture}</td>
                        <td className="p-2 font-mono text-xs">{it.numero_compte}<span className={`ml-1 text-[10px] ${it.nature === "produit" ? "text-emerald-600" : "text-red-600"}`}>{it.nature}</span></td>
                        <td className="p-2 max-w-[280px] truncate">{it.description}</td>
                        <td className="p-2 text-right tabular-nums">{fmt(it.net)}</td>
                        <td className="p-2 text-right tabular-nums font-medium">{fmt(it.reste)}</td>
                        <td className="p-2 text-right">
                          <Button size="sm" variant="outline" onClick={() => startEdit(it)}>Ventiler</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="font-medium">{editing.numero_compte} — {editing.nom_compte}</div>
              <div className="text-slate-500">{editing.description}</div>
              <div className="mt-1">Montant à ventiler : <strong className="tabular-nums">{fmt(editing.net)}</strong> ({editing.nature})</div>
            </div>

            <div className="space-y-2">
              {allocs.map((a, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    className="flex-1 border rounded px-2 py-1.5 text-sm bg-white"
                    value={a.section_analytique_id}
                    onChange={(e) => setAllocs((prev) => prev.map((x, j) => (j === i ? { ...x, section_analytique_id: e.target.value } : x)))}
                  >
                    <option value="">— Section —</option>
                    {activeSections.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.libelle}</option>)}
                  </select>
                  <Input
                    type="number" className="w-32" value={a.montant}
                    onChange={(e) => setAllocs((prev) => prev.map((x, j) => (j === i ? { ...x, montant: e.target.value } : x)))}
                  />
                  <Button variant="ghost" size="icon" onClick={() => setAllocs((prev) => prev.filter((_, j) => j !== i))} disabled={allocs.length <= 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setAllocs((prev) => [...prev, { section_analytique_id: "", montant: "" }])}>
                <Plus className="h-4 w-4 mr-1" /> Section
              </Button>
              <Button variant="outline" size="sm" onClick={repartirEgal}>
                <Split className="h-4 w-4 mr-1" /> Répartir également
              </Button>
              {cles.length > 0 && (
                <div className="flex items-center gap-1">
                  <KeyRound className="h-4 w-4 text-slate-400" />
                  <select
                    className="border rounded px-2 py-1.5 text-sm bg-white"
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) appliquerCle(e.target.value) }}
                  >
                    <option value="">Appliquer une clé…</option>
                    {cles.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.libelle}</option>)}
                  </select>
                </div>
              )}
              <div className="ml-auto text-sm self-center">
                Réparti : <strong className={totalAlloc > editing.net + 0.01 ? "text-red-600" : ""}>{fmt(totalAlloc)}</strong> / {fmt(editing.net)}
              </div>
            </div>
            {err && <p className="text-sm text-red-600">{err}</p>}

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="outline" onClick={() => setEditing(null)}><X className="h-4 w-4 mr-1" /> Retour</Button>
              <Button onClick={save} disabled={saving || totalAlloc <= 0 || totalAlloc > editing.net + 0.01}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Enregistrer la ventilation
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
