"use client"

/**
 * /client/immobilisations — Registre des immobilisations & amortissements.
 *
 * Comble un manque relevé par un comptable en test : l'amortissement est une
 * opération mensuelle/annuelle clé, mais aucune UI ne permettait de gérer le
 * registre ni de COMPTABILISER la dotation (D 6811 / C 281x). Cette page :
 *   - liste les immobilisations (coût, cumul amortissements, valeur nette)
 *   - permet d'ajouter une immobilisation (le plan d'amortissement est calculé)
 *   - comptabilise les dotations d'un exercice en écritures équilibrées.
 */

import { Fragment, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Loader2, RefreshCw, AlertCircle, Plus, Building2, ChevronRight, ChevronDown, CheckCircle2, Calculator,
} from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

const CATEGORIES: { value: string; label: string; taux: number }[] = [
  { value: "materiel_informatique", label: "Matériel informatique", taux: 50 },
  { value: "logiciel", label: "Logiciel", taux: 50 },
  { value: "vehicule", label: "Véhicule", taux: 25 },
  { value: "mobilier", label: "Mobilier & agencements", taux: 20 },
  { value: "equipement", label: "Équipement", taux: 20 },
  { value: "immobilier", label: "Immobilier", taux: 5 },
  { value: "autre", label: "Autre", taux: 20 },
]

interface Amort { exercice: string; date_fin: string; dotation: number; cumul_apres: number; valeur_nette: number }
interface Immo {
  id: string
  designation: string
  categorie: string
  date_acquisition: string
  cout_acquisition: number
  cout_mur: number
  taux_amortissement: number
  methode: string
  valeur_nette_actuelle: number
  cumul_amortissements: number
  amortissements: Amort[]
}
interface Totaux { cout_total: number; cumul_total: number; vnc_total: number }

function fmt(n: number | null | undefined) {
  return (Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string | null) {
  if (!d) return "—"
  try { return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) } catch { return d }
}
function catLabel(v: string) { return CATEGORIES.find(c => c.value === v)?.label || v }

export default function ImmobilisationsPage() {
  const { societeId } = useSocieteActive()
  const [immos, setImmos] = useState<Immo[]>([])
  const [totaux, setTotaux] = useState<Totaux | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [posting, setPosting] = useState(false)
  const [selectedExercice, setSelectedExercice] = useState<string>("")

  const [form, setForm] = useState({
    designation: "", categorie: "materiel_informatique",
    date_acquisition: new Date().toISOString().slice(0, 10),
    cout_acquisition: "", valeur_residuelle: "0", methode: "lineaire",
  })

  async function load() {
    if (!societeId) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`/api/comptable/immobilisations?societe_id=${societeId}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "Erreur de chargement")
      setImmos(d.immobilisations || [])
      setTotaux(d.totaux || null)
    } catch (e: any) { setError(e.message); setImmos([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId])

  const exercices = useMemo(() => {
    const set = new Set<string>()
    for (const i of immos) for (const a of i.amortissements || []) set.add(a.exercice)
    return Array.from(set).sort()
  }, [immos])
  useEffect(() => {
    if (exercices.length && !selectedExercice) {
      // exercice courant par défaut : le plus récent dont la fin est passée, sinon le 1er
      const today = new Date().toISOString().slice(0, 10)
      const past = immos.flatMap(i => i.amortissements || []).filter(a => a.date_fin <= today).map(a => a.exercice).sort()
      setSelectedExercice(past.length ? past[past.length - 1] : exercices[0])
    }
  }, [exercices, selectedExercice, immos])

  function toggle(id: string) {
    setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function addImmo() {
    if (!societeId) return
    if (!form.designation.trim() || !form.cout_acquisition) { setError("Désignation et coût requis"); return }
    setSaving(true); setError(null); setMsg(null)
    try {
      const cat = CATEGORIES.find(c => c.value === form.categorie)
      const r = await fetch("/api/comptable/immobilisations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          designation: form.designation.trim(),
          categorie: form.categorie,
          date_acquisition: form.date_acquisition,
          cout_acquisition: Number(form.cout_acquisition),
          valeur_residuelle: Number(form.valeur_residuelle) || 0,
          taux_amortissement: cat?.taux || 20,
          methode: form.methode,
          devise: "MUR",
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "Échec de création")
      setShowForm(false)
      setForm({ ...form, designation: "", cout_acquisition: "", valeur_residuelle: "0" })
      setMsg("Immobilisation ajoutée et plan d'amortissement calculé.")
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function comptabiliser() {
    if (!societeId || !selectedExercice) return
    setPosting(true); setError(null); setMsg(null)
    try {
      const r = await fetch("/api/comptable/immobilisations/comptabiliser", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, exercice: selectedExercice }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "Échec de comptabilisation")
      setMsg(
        `Exercice ${selectedExercice} : ${d.comptabilise} dotation(s) comptabilisée(s) (${fmt(d.total_dotation_mur)} MUR)` +
        (d.skipped ? `, ${d.skipped} déjà comptabilisée(s)` : ""),
      )
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setPosting(false) }
  }

  if (!societeId) return <div className="p-6 text-sm text-slate-500">Sélectionnez une société.</div>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-indigo-600" /> Immobilisations & amortissements
          </h1>
          <p className="text-sm text-slate-500">Registre des actifs, plan d'amortissement et comptabilisation des dotations.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={load} variant="outline" size="sm"><RefreshCw className="h-4 w-4 mr-2" />Actualiser</Button>
          <Button onClick={() => setShowForm(v => !v)} size="sm"><Plus className="h-4 w-4 mr-2" />Ajouter</Button>
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}
      {msg && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex gap-2"><CheckCircle2 className="h-4 w-4" />{msg}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Coût d'acquisition</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(totaux?.cout_total)}</div><div className="text-xs text-slate-500">MUR</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Amortissements cumulés</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-amber-700">{fmt(totaux?.cumul_total)}</div><div className="text-xs text-slate-500">MUR</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Valeur nette comptable</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-indigo-700">{fmt(totaux?.vnc_total)}</div><div className="text-xs text-slate-500">MUR</div></CardContent></Card>
      </div>

      {/* Comptabilisation dotations */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Calculator className="h-4 w-4" />Comptabiliser les dotations</CardTitle></CardHeader>
        <CardContent className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Exercice</label>
            <select value={selectedExercice} onChange={e => setSelectedExercice(e.target.value)} className="text-sm border rounded px-2 py-1.5 min-w-[140px]">
              {exercices.length === 0 && <option value="">—</option>}
              {exercices.map(ex => <option key={ex} value={ex}>{ex}</option>)}
            </select>
          </div>
          <Button onClick={comptabiliser} disabled={posting || !selectedExercice} size="sm">
            {posting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}
            Comptabiliser {selectedExercice && `(${selectedExercice})`}
          </Button>
          <p className="text-xs text-slate-500 max-w-md">
            Génère les écritures D&nbsp;« Dotations aux amortissements » / C&nbsp;« Amortissements cumulés »
            pour l'exercice choisi. Idempotent : relancer ne crée pas de doublon.
          </p>
        </CardContent>
      </Card>

      {/* Formulaire d'ajout */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Nouvelle immobilisation</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-slate-500 block mb-1">Désignation *</label>
              <Input value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} placeholder="Ex : MacBook Pro 14&quot;" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Catégorie</label>
              <select value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })} className="w-full text-sm border rounded px-2 py-2">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label} ({c.taux}%/an)</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Méthode</label>
              <select value={form.methode} onChange={e => setForm({ ...form, methode: e.target.value })} className="w-full text-sm border rounded px-2 py-2">
                <option value="lineaire">Linéaire</option>
                <option value="degressif">Dégressif</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Date d'acquisition</label>
              <Input type="date" value={form.date_acquisition} onChange={e => setForm({ ...form, date_acquisition: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Coût d'acquisition (MUR) *</label>
              <Input type="number" value={form.cout_acquisition} onChange={e => setForm({ ...form, cout_acquisition: e.target.value })} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Valeur résiduelle (MUR)</label>
              <Input type="number" value={form.valeur_residuelle} onChange={e => setForm({ ...form, valeur_residuelle: e.target.value })} />
            </div>
            <div className="md:col-span-2 flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button size="sm" onClick={addImmo} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Enregistrer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Liste */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" />Chargement…</div>
          ) : immos.length === 0 ? (
            <div className="text-sm text-slate-500 p-6 text-center">Aucune immobilisation. Cliquez « Ajouter » pour créer votre premier actif.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Désignation</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead className="text-right">Coût</TableHead>
                  <TableHead className="text-right">Cumul amort.</TableHead>
                  <TableHead className="text-right">Valeur nette</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {immos.map(immo => (
                  <Fragment key={immo.id}>
                    <TableRow className="cursor-pointer hover:bg-slate-50" onClick={() => toggle(immo.id)}>
                      <TableCell>{expanded.has(immo.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</TableCell>
                      <TableCell className="text-sm font-medium">{immo.designation}<div className="text-[11px] text-slate-400">{fmtDate(immo.date_acquisition)} · {immo.taux_amortissement}%/an · {immo.methode}</div></TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{catLabel(immo.categorie)}</Badge></TableCell>
                      <TableCell className="text-right text-sm">{fmt(immo.cout_mur || immo.cout_acquisition)}</TableCell>
                      <TableCell className="text-right text-sm text-amber-700">{fmt(immo.cumul_amortissements)}</TableCell>
                      <TableCell className="text-right text-sm font-semibold text-indigo-700">{fmt(immo.valeur_nette_actuelle)}</TableCell>
                    </TableRow>
                    {expanded.has(immo.id) && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-slate-50 p-0">
                          <div className="p-3">
                            <p className="text-xs font-semibold text-slate-600 mb-2">Plan d'amortissement</p>
                            <table className="w-full text-xs">
                              <thead className="text-slate-500"><tr>
                                <th className="text-left py-1">Exercice</th>
                                <th className="text-right py-1">Dotation</th>
                                <th className="text-right py-1">Cumul</th>
                                <th className="text-right py-1">Valeur nette</th>
                              </tr></thead>
                              <tbody>
                                {(immo.amortissements || []).slice().sort((a, b) => a.exercice.localeCompare(b.exercice)).map((a, i) => (
                                  <tr key={i} className="border-t border-slate-200">
                                    <td className="py-1">{a.exercice}</td>
                                    <td className="py-1 text-right">{fmt(a.dotation)}</td>
                                    <td className="py-1 text-right text-amber-700">{fmt(a.cumul_apres)}</td>
                                    <td className="py-1 text-right text-indigo-700">{fmt(a.valeur_nette)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
