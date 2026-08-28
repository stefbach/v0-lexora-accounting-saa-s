"use client"

/**
 * /client/inventaire/reception-import — Réception à l'import avec coût de revient.
 *
 * Comble le besoin relevé par un comptable : ajouter la quote-part de fret et
 * de dédouanement au coût de chaque produit importé (landed cost), pour une
 * valorisation de stock et des marges justes. Saisie des lignes + charges,
 * prévisualisation du coût landed, puis comptabilisation (mouvements + CUMP).
 */

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Plus, Trash2, Ship, AlertCircle, CheckCircle2, Calculator } from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface Produit { id: string; sku: string; designation: string; gere_en_stock: boolean }
interface Ligne { produit_id: string; quantite: string; prix_unitaire_fob: string }
interface Charge { libelle: string; montant: string }
interface LandedLine {
  produit_id: string; designation?: string; quantite: number; prix_unitaire_fob: number
  valeur_fob: number; charges_reparties: number; cout_total_landed: number; cout_unitaire_landed: number
}

function fmt(n: number | null | undefined) {
  return (Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ReceptionImportPage() {
  const { societeId } = useSocieteActive()
  const [produits, setProduits] = useState<Produit[]>([])
  const [lignes, setLignes] = useState<Ligne[]>([{ produit_id: "", quantite: "", prix_unitaire_fob: "" }])
  const [charges, setCharges] = useState<Charge[]>([{ libelle: "Fret", montant: "" }, { libelle: "Douane", montant: "" }])
  const [methode, setMethode] = useState<"valeur" | "quantite">("valeur")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [preview, setPreview] = useState<LandedLine[] | null>(null)
  const [totaux, setTotaux] = useState<{ fob: number; charges: number; landed: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!societeId) return
    fetch(`/api/client/inventaire/produits?societe_id=${societeId}`)
      .then(r => r.json())
      .then(d => setProduits((d.produits || d.data || []).filter((p: Produit) => p.gere_en_stock)))
      .catch(() => {})
  }, [societeId])

  const validLignes = useMemo(
    () => lignes.filter(l => l.produit_id && Number(l.quantite) > 0),
    [lignes],
  )

  function buildBody(dryRun: boolean) {
    return {
      societe_id: societeId, methode, date, dry_run: dryRun,
      charges: charges.map(c => ({ libelle: c.libelle, montant: Number(c.montant) || 0 })).filter(c => c.montant > 0),
      lignes: validLignes.map(l => ({ produit_id: l.produit_id, quantite: Number(l.quantite), prix_unitaire_fob: Number(l.prix_unitaire_fob) || 0 })),
    }
  }

  async function call(dryRun: boolean) {
    if (!societeId) return
    if (validLignes.length === 0) { setError("Ajoutez au moins une ligne (produit + quantité)."); return }
    setBusy(true); setError(null); setMsg(null)
    try {
      const r = await fetch("/api/client/inventaire/reception-import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(dryRun)),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "Erreur")
      setPreview(d.lignes || [])
      setTotaux({ fob: d.total_fob, charges: d.total_charges, landed: d.total_landed })
      if (!dryRun) {
        setMsg(`Réception comptabilisée : ${d.mouvements} mouvement(s), coût total ${fmt(d.total_landed)} MUR (dont ${fmt(d.total_charges)} de charges réparties).`)
      }
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  const setLigne = (i: number, patch: Partial<Ligne>) => setLignes(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const setChg = (i: number, patch: Partial<Charge>) => setCharges(cs => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c))

  if (!societeId) return <div className="p-6 text-sm text-slate-500">Sélectionnez une société.</div>

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Ship className="h-6 w-6 text-indigo-600" /> Réception à l'import (coût de revient)</h1>
        <p className="text-sm text-slate-500">Répartit le fret et les frais de dédouanement sur chaque produit pour un coût de stock et des marges justes.</p>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}
      {msg && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex gap-2"><CheckCircle2 className="h-4 w-4" />{msg}</div>}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Lignes de réception</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {lignes.map((l, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select value={l.produit_id} onChange={e => setLigne(i, { produit_id: e.target.value })} className="text-sm border rounded px-2 py-2 flex-1 min-w-0">
                <option value="">— Produit —</option>
                {produits.map(p => <option key={p.id} value={p.id}>{p.designation} ({p.sku})</option>)}
              </select>
              <Input type="number" placeholder="Qté" value={l.quantite} onChange={e => setLigne(i, { quantite: e.target.value })} className="w-24" />
              <Input type="number" placeholder="Prix FOB u." value={l.prix_unitaire_fob} onChange={e => setLigne(i, { prix_unitaire_fob: e.target.value })} className="w-32" />
              <Button variant="ghost" size="icon" onClick={() => setLignes(ls => ls.filter((_, idx) => idx !== i))} disabled={lignes.length === 1}><Trash2 className="h-4 w-4 text-slate-400" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setLignes(ls => [...ls, { produit_id: "", quantite: "", prix_unitaire_fob: "" }])}><Plus className="h-4 w-4 mr-1" />Ligne</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Charges annexes (fret, douane, assurance…)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {charges.map((c, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input placeholder="Libellé" value={c.libelle} onChange={e => setChg(i, { libelle: e.target.value })} className="flex-1" />
              <Input type="number" placeholder="Montant (MUR)" value={c.montant} onChange={e => setChg(i, { montant: e.target.value })} className="w-40" />
              <Button variant="ghost" size="icon" onClick={() => setCharges(cs => cs.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4 text-slate-400" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setCharges(cs => [...cs, { libelle: "", montant: "" }])}><Plus className="h-4 w-4 mr-1" />Charge</Button>
        </CardContent>
      </Card>

      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Répartition</label>
          <select value={methode} onChange={e => setMethode(e.target.value as any)} className="text-sm border rounded px-2 py-1.5">
            <option value="valeur">Au prorata de la valeur (FOB)</option>
            <option value="quantite">Au prorata de la quantité</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Date</label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-40" />
        </div>
        <Button variant="outline" onClick={() => call(true)} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}Prévisualiser
        </Button>
        <Button onClick={() => call(false)} disabled={busy || !preview}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}Comptabiliser la réception
        </Button>
      </div>

      {preview && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Coût de revient (landed cost)</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead className="text-right">Valeur FOB</TableHead>
                  <TableHead className="text-right">Charges réparties</TableHead>
                  <TableHead className="text-right">Coût unitaire landed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">{l.designation || l.produit_id}</TableCell>
                    <TableCell className="text-right text-sm">{l.quantite}</TableCell>
                    <TableCell className="text-right text-sm">{fmt(l.valeur_fob)}</TableCell>
                    <TableCell className="text-right text-sm text-amber-700">{fmt(l.charges_reparties)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold text-indigo-700">{fmt(l.cout_unitaire_landed)}</TableCell>
                  </TableRow>
                ))}
                {totaux && (
                  <TableRow className="bg-slate-900 text-white font-bold">
                    <TableCell colSpan={2}>TOTAL</TableCell>
                    <TableCell className="text-right">{fmt(totaux.fob)}</TableCell>
                    <TableCell className="text-right">{fmt(totaux.charges)}</TableCell>
                    <TableCell className="text-right">{fmt(totaux.landed)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
