"use client"

/**
 * Page /client/reclassement — Reclassement assisté + Clôture mensuelle.
 *
 * Outil dédié (spec §6.4) :
 *   - Reclasser les écritures d'un compte vers un autre (dry-run obligatoire)
 *   - Clôturer / déclôturer une période mensuelle
 *
 * La consultation du grand livre reste sur /client/grand-livre.
 * S'appuie sur /api/societes/{id}/grand-livre/reclass et /cloture.
 */

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, ArrowRightLeft, Lock, Unlock } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

function fmt(n: number): string {
  return (n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ReclassementPage() {
  const { societeId } = useSocieteActive()
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 4000)
  }

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-3xl">
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white ${toast.type === "success" ? "bg-emerald-600" : "bg-red-600"}`}>{toast.msg}</div>
        )}

        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-[#0B0F2E] p-3 text-white"><ArrowRightLeft className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-bold text-[#0B0F2E]">Reclassement & Clôture</h1>
            <p className="text-sm text-gray-500">Reclasser des écritures entre comptes, clôturer les périodes</p>
          </div>
        </div>

        <ReclassCard societeId={societeId || ""} onToast={(m, ok) => showToast(m, ok === false ? "error" : "success")} />
        <ClotureCard societeId={societeId || ""} onToast={(m, ok) => showToast(m, ok === false ? "error" : "success")} />
      </div>
    </ClientPageShell>
  )
}

function ReclassCard({ societeId, onToast }: { societeId: string; onToast: (m: string, ok?: boolean) => void }) {
  const [fromCompte, setFromCompte] = useState("")
  const [toCompte, setToCompte] = useState("")
  const [libelleContains, setLibelleContains] = useState("")
  const [dateDebut, setDateDebut] = useState("")
  const [dateFin, setDateFin] = useState("")
  const [reason, setReason] = useState("")
  const [preview, setPreview] = useState<any>(null)
  const [busy, setBusy] = useState(false)

  const run = async (dryRun: boolean) => {
    if (!fromCompte || !toCompte || !reason) return onToast("Compte source, cible et raison requis", false)
    setBusy(true)
    try {
      const filter: any = {}
      if (libelleContains) filter.libelle_contains = libelleContains
      if (dateDebut) filter.date_debut = dateDebut
      if (dateFin) filter.date_fin = dateFin
      const res = await fetch(`/api/societes/${societeId}/grand-livre/reclass`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_compte: fromCompte, to_compte: toCompte, filter: Object.keys(filter).length ? filter : undefined, dry_run: dryRun, reason }),
      })
      const d = await res.json()
      if (!res.ok) return onToast(d?.error || "Échec", false)
      if (dryRun) setPreview(d)
      else { onToast(`${d.executed} écriture(s) reclassée(s) ${fromCompte} → ${toCompte}`, true); setPreview(null) }
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><ArrowRightLeft className="w-4 h-4" /> Reclassement assisté</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Compte source</Label><Input value={fromCompte} onChange={e => setFromCompte(e.target.value)} placeholder="471" /></div>
          <div className="space-y-1"><Label>Compte cible</Label><Input value={toCompte} onChange={e => setToCompte(e.target.value)} placeholder="4511.OCC" /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1"><Label className="text-xs">Libellé contient</Label><Input value={libelleContains} onChange={e => setLibelleContains(e.target.value)} placeholder="OCC" /></div>
          <div className="space-y-1"><Label className="text-xs">Du</Label><Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Au</Label><Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} /></div>
        </div>
        <div className="space-y-1"><Label>Raison</Label><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="reclassement interco OCC" /></div>

        {preview && (
          <div className="rounded-lg border bg-amber-50 p-3 text-sm">
            <div className="font-medium">Aperçu (dry-run) — {preview.nb_ecritures} écriture(s)</div>
            <div className="text-gray-600">Débit {fmt(preview.total_debit)} / Crédit {fmt(preview.total_credit)}</div>
            {preview.sample?.length > 0 && (
              <ul className="mt-2 text-xs text-gray-600 max-h-40 overflow-y-auto space-y-0.5">
                {preview.sample.map((s: any) => (
                  <li key={s.id} className="flex justify-between gap-2">
                    <span>{s.date_ecriture}</span>
                    <span className="flex-1 truncate">{s.libelle}</span>
                    <span>{fmt(Math.max(s.debit_mur, s.credit_mur))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => run(true)} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Prévisualiser</Button>
          <Button onClick={() => run(false)} disabled={busy || !preview} className="bg-[#0B0F2E] text-white">Exécuter le reclassement</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ClotureCard({ societeId, onToast }: { societeId: string; onToast: (m: string, ok?: boolean) => void }) {
  const [periodes, setPeriodes] = useState<any[]>([])
  const [periode, setPeriode] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!societeId) return
    const res = await fetch(`/api/societes/${societeId}/cloture`)
    const d = await res.json()
    if (res.ok) setPeriodes(d.periodes || [])
  }, [societeId])

  useEffect(() => { load(); setPeriode(new Date().toISOString().slice(0, 7)) }, [load])

  const action = async (act: "cloturer" | "decloturer") => {
    if (!periode) return onToast("Période requise", false)
    let motif: string | undefined
    if (act === "decloturer") { motif = prompt("Motif de déclôture ?") || undefined; if (!motif) return }
    setBusy(true)
    try {
      const res = await fetch(`/api/societes/${societeId}/cloture`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periode, action: act, motif }),
      })
      const d = await res.json()
      if (!res.ok) onToast(d?.error || "Échec", false)
      else { onToast(`Période ${periode} ${act === "cloturer" ? "clôturée" : "déclôturée"}`, true); load() }
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Lock className="w-4 h-4" /> Clôture mensuelle</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-500">Une période clôturée bloque toute modification d'écriture. La déclôture nécessite un motif (tracé).</p>
        <div className="flex items-end gap-2">
          <div className="space-y-1 flex-1"><Label>Période</Label><Input type="month" value={periode} onChange={e => setPeriode(e.target.value)} /></div>
          <Button onClick={() => action("cloturer")} disabled={busy} className="bg-[#0B0F2E] text-white"><Lock className="w-4 h-4 mr-2" />Clôturer</Button>
          <Button variant="outline" onClick={() => action("decloturer")} disabled={busy}><Unlock className="w-4 h-4 mr-2" />Déclôturer</Button>
        </div>
        {periodes.length > 0 && (
          <div className="rounded-lg border bg-gray-50 p-3 max-h-48 overflow-y-auto">
            <div className="text-xs font-medium text-gray-600 mb-2">Historique des clôtures</div>
            <ul className="space-y-1 text-sm">
              {periodes.map((p: any) => (
                <li key={p.periode} className="flex justify-between items-center">
                  <span>{String(p.periode).slice(0, 7)}</span>
                  <Badge variant="outline" className={p.statut === "cloture" ? "border-red-300 text-red-600" : "border-emerald-300 text-emerald-600"}>{p.statut}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
