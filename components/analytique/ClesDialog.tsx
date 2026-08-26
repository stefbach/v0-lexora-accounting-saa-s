"use client"

/**
 * ClesDialog — gestion des clés de répartition (charges indirectes).
 * Liste + création (code, libellé, base, sections pondérées) + suppression.
 * Les poids sont normalisés en % à l'affichage et à l'application.
 */

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Plus, Trash2, KeyRound } from "lucide-react"
import { CLE_BASES, CLE_BASE_LABELS, type CleBase } from "@/lib/analytique/cles"

interface SectionLite { id: string; code: string; libelle: string; statut: string }
interface Cle {
  id: string; code: string; libelle: string; base: CleBase
  lignes: Array<{ section_analytique_id: string; poids: number; pct: number }>
}
interface Ligne { section_analytique_id: string; poids: string }

export function ClesDialog({
  societeId, sections, open, onOpenChange, onChanged,
}: {
  societeId: string | null
  sections: SectionLite[]
  open: boolean
  onOpenChange: (v: boolean) => void
  onChanged: () => void
}) {
  const [cles, setCles] = useState<Cle[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [code, setCode] = useState("")
  const [libelle, setLibelle] = useState("")
  const [base, setBase] = useState<CleBase>("pourcentage")
  const [lignes, setLignes] = useState<Ligne[]>([{ section_analytique_id: "", poids: "" }])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const activeSections = sections.filter((s) => s.statut !== "clos")
  const sectionLabel = (id: string) => {
    const s = sections.find((x) => x.id === id)
    return s ? `${s.code} · ${s.libelle}` : id.slice(0, 8)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/client/analytique/cles?societe_id=${societeId}`)
      const d = await res.json()
      if (res.ok) setCles(d.items || [])
    } finally { setLoading(false) }
  }, [societeId])

  useEffect(() => { if (open) { load(); setCreating(false) } }, [open, load])

  const resetForm = () => { setCode(""); setLibelle(""); setBase("pourcentage"); setLignes([{ section_analytique_id: "", poids: "" }]); setErr(null) }

  const save = async () => {
    if (!societeId) return
    setSaving(true); setErr(null)
    try {
      const res = await fetch("/api/client/analytique/cles", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId, code, libelle, base,
          lignes: lignes.filter((l) => l.section_analytique_id && Number(l.poids) > 0)
            .map((l) => ({ section_analytique_id: l.section_analytique_id, poids: Number(l.poids) })),
        }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d?.error || "Erreur"); setSaving(false); return }
      resetForm(); setCreating(false); await load(); onChanged()
    } catch (e: any) { setErr(e?.message || "Erreur") } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!societeId || !window.confirm("Supprimer cette clé ?")) return
    await fetch(`/api/client/analytique/cles/${id}?societe_id=${societeId}`, { method: "DELETE" })
    await load(); onChanged()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Clés de répartition</DialogTitle>
        </DialogHeader>

        {!creating ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">Réparties automatiquement les charges indirectes (loyer, élec…) selon des poids par section.</p>
              <Button size="sm" onClick={() => { resetForm(); setCreating(true) }}><Plus className="h-4 w-4 mr-1" /> Clé</Button>
            </div>
            {loading ? (
              <div className="py-8 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
            ) : cles.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">Aucune clé. Créez-en une pour ventiler automatiquement.</div>
            ) : (
              <div className="space-y-2">
                {cles.map((c) => (
                  <div key={c.id} className="rounded-lg border p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono text-sm">{c.code}</span> <span className="text-sm">{c.libelle}</span>
                        <span className="ml-2 text-xs text-slate-400">{CLE_BASE_LABELS[c.base]}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {c.lignes.map((l, i) => (
                        <span key={i} className="text-xs bg-slate-100 rounded px-2 py-0.5">{sectionLabel(l.section_analytique_id)} — {l.pct}%</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="LOYER" /></div>
              <div>
                <Label>Base</Label>
                <select className="w-full border rounded px-3 py-2 text-sm bg-white" value={base} onChange={(e) => setBase(e.target.value as CleBase)}>
                  {CLE_BASES.map((b) => <option key={b} value={b}>{CLE_BASE_LABELS[b]}</option>)}
                </select>
              </div>
            </div>
            <div><Label>Libellé</Label><Input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Répartition du loyer" /></div>

            <div>
              <Label>Sections &amp; poids</Label>
              <div className="space-y-2 mt-1">
                {lignes.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <select
                      className="flex-1 border rounded px-2 py-1.5 text-sm bg-white"
                      value={l.section_analytique_id}
                      onChange={(e) => setLignes((prev) => prev.map((x, j) => (j === i ? { ...x, section_analytique_id: e.target.value } : x)))}
                    >
                      <option value="">— Section —</option>
                      {activeSections.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.libelle}</option>)}
                    </select>
                    <Input
                      type="number" className="w-28" placeholder="poids" value={l.poids}
                      onChange={(e) => setLignes((prev) => prev.map((x, j) => (j === i ? { ...x, poids: e.target.value } : x)))}
                    />
                    <Button variant="ghost" size="icon" onClick={() => setLignes((prev) => prev.filter((_, j) => j !== i))} disabled={lignes.length <= 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setLignes((prev) => [...prev, { section_analytique_id: "", poids: "" }])}>
                  <Plus className="h-4 w-4 mr-1" /> Section
                </Button>
              </div>
              <p className="text-xs text-slate-400 mt-1">Les poids (m², effectif, %…) sont normalisés automatiquement en pourcentages.</p>
            </div>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <div className="flex justify-end gap-2 border-t pt-3">
              <Button variant="outline" onClick={() => setCreating(false)}>Annuler</Button>
              <Button onClick={save} disabled={saving || !code.trim() || !libelle.trim()}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Créer la clé
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
