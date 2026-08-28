"use client"

/**
 * /client/rapprochement-carte — Rapprochement des règlements carte agrégés.
 *
 * Les ventes carte d'une période arrivent en banque regroupées en une seule
 * ligne, nette de commission. Cette page solde le transit monétique (5118) des
 * ventes carte de la période et comptabilise la commission (D 512 + D 6271 /
 * C 5118).
 */

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, CreditCard, AlertCircle, CheckCircle2, Calculator } from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

function fmt(n: number | null | undefined) {
  return (Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function RapprochementCartePage() {
  const { societeId } = useSocieteActive()
  const today = new Date().toISOString().slice(0, 10)
  const [dateDebut, setDateDebut] = useState(today)
  const [dateFin, setDateFin] = useState(today)
  const [net, setNet] = useState("")
  const [calc, setCalc] = useState<{ brut: number; net: number; commission: number; commission_pct: number; plausible: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function call(dryRun: boolean) {
    if (!societeId) return
    if (!(Number(net) > 0)) { setError("Saisissez le montant net reçu en banque."); return }
    setBusy(true); setError(null); setMsg(null)
    try {
      const r = await fetch("/api/comptable/rapprochement/card-settlement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, date_debut: dateDebut, date_fin: dateFin, montant_net: Number(net), dry_run: dryRun }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error || "Erreur")
      setCalc({ brut: d.brut, net: d.net, commission: d.commission, commission_pct: d.commission_pct, plausible: d.plausible })
      if (!dryRun) {
        setMsg(d.skipped === "exists"
          ? "Ce règlement a déjà été comptabilisé pour cette période."
          : `Règlement comptabilisé : brut ${fmt(d.brut)} MUR, commission ${fmt(d.commission)} MUR (${d.commission_pct}%).`)
      }
    } catch (e: any) { setError(e.message) }
    finally { setBusy(false) }
  }

  if (!societeId) return <div className="p-6 text-sm text-slate-500">Sélectionnez une société.</div>

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><CreditCard className="h-6 w-6 text-indigo-600" /> Règlement carte agrégé</h1>
        <p className="text-sm text-slate-500">Rapproche la ligne bancaire unique (nette de commission) avec les ventes carte de la période et comptabilise la commission.</p>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}
      {msg && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex gap-2"><CheckCircle2 className="h-4 w-4" />{msg}</div>}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Période & montant reçu</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Du</label>
              <Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} className="w-40" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Au</label>
              <Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className="w-40" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Montant net reçu (MUR)</label>
              <Input type="number" value={net} onChange={e => setNet(e.target.value)} placeholder="0.00" className="w-44" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => call(true)} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}Prévisualiser
            </Button>
            <Button onClick={() => call(false)} disabled={busy || !calc}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}Comptabiliser
            </Button>
          </div>
        </CardContent>
      </Card>

      {calc && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Résultat</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Brut ventes carte (transit 5118)</span><span className="font-mono">{fmt(calc.brut)} MUR</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Net reçu en banque</span><span className="font-mono">{fmt(calc.net)} MUR</span></div>
            <div className="flex justify-between font-semibold"><span>Commission</span><span className={`font-mono ${calc.plausible ? "text-amber-700" : "text-red-600"}`}>{fmt(calc.commission)} MUR ({calc.commission_pct}%)</span></div>
            {!calc.plausible && (
              <p className="text-xs text-red-600 pt-1">⚠ Commission inhabituelle (négative ou &gt; 5%). Vérifiez la période et le montant net.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
