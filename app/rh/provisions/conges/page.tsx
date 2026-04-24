"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Calculator, Loader2, FileCheck, ShieldAlert, AlertTriangle, Trash2,
  BookOpenCheck, RotateCcw,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import {
  formaterMUR, STATUT_LABELS,
  type IAS19Snapshot, type IAS19Statut,
} from "@/lib/rh/ias19-provisions"
import { useRHSocieteActive } from "@/components/rh/RHSocieteActiveProvider"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Societe { id: string; nom: string }

function finDeMoisLocal(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

function libellePeriodeLocal(isoFinMois: string): string {
  const d = new Date(isoFinMois + 'T12:00:00')
  const m = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return m.charAt(0).toUpperCase() + m.slice(1)
}

function defaultMoisCourant(): string {
  const now = new Date()
  return finDeMoisLocal(now.toISOString().slice(0, 10))
}

function moisPrecedentIso(isoFinMois: string): string {
  const d = new Date(isoFinMois + 'T12:00:00')
  return new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10)
}

export default function ProvisionsCongesPage() {
  const { societeId, societe } = useRHSocieteActive()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [userRole, setUserRole] = useState<string>("")
  const [chargesPct, setChargesPct] = useState<number>(0.13)

  const [dateSnapshot, setDateSnapshot] = useState<string>(defaultMoisCourant())

  const [snapshotCalc, setSnapshotCalc] = useState<IAS19Snapshot | null>(null)
  const [snapshotPrecedent, setSnapshotPrecedent] = useState<IAS19Snapshot | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [comptabilizing, setComptabilizing] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const [historique, setHistorique] = useState<IAS19Snapshot[]>([])
  const [loadingHistorique, setLoadingHistorique] = useState(false)
  const [filtreAnnee, setFiltreAnnee] = useState<string>("all")
  const [rowLoading, setRowLoading] = useState<string | null>(null)

  const isAdmin = userRole === 'admin'

  // Auth + liste sociétés
  useEffect(() => {
    ;(async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (!user) { setAuthorized(false); return }
        const { data: prof } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle()
        const role = (prof as any)?.role || ''
        setUserRole(role)
        if (!['admin', 'rh'].includes(role)) { setAuthorized(false); return }
        setAuthorized(true)
      } catch { setAuthorized(false) }
    })()
  }, [])

  // Charger coef charges patronales + historique quand societe change
  useEffect(() => {
    if (!societeId) return
    ;(async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const sb = createClient()
        const { data } = await sb.from('societes')
          .select('ias19_charges_patronales_pct')
          .eq('id', societeId).maybeSingle()
        setChargesPct(Number((data as any)?.ias19_charges_patronales_pct ?? 0.13))
      } catch { setChargesPct(0.13) }
    })()
    loadHistorique()
    setSnapshotCalc(null)
    setSnapshotPrecedent(null)
    setFeedback(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [societeId])

  // Précharger snapshot du mois précédent
  useEffect(() => {
    if (!societeId || !dateSnapshot) { setSnapshotPrecedent(null); return }
    const datePrec = moisPrecedentIso(dateSnapshot)
    ;(async () => {
      try {
        const r = await fetch(`/api/rh/provisions/conges?societe_id=${societeId}`)
        const d = r.ok ? await r.json() : { snapshots: [] }
        const list: IAS19Snapshot[] = d?.snapshots || []
        const match = list.find(s => s.date_snapshot === datePrec && s.statut === 'comptabilise')
        setSnapshotPrecedent(match || null)
      } catch { setSnapshotPrecedent(null) }
    })()
  }, [societeId, dateSnapshot])

  const loadHistorique = useCallback(async () => {
    if (!societeId) return
    setLoadingHistorique(true)
    try {
      const q = new URLSearchParams({ societe_id: societeId })
      if (filtreAnnee !== 'all') q.set('annee', filtreAnnee)
      const r = await fetch(`/api/rh/provisions/conges?${q.toString()}`)
      const d = r.ok ? await r.json() : { snapshots: [] }
      setHistorique(d?.snapshots || [])
    } catch { setHistorique([]) }
    finally { setLoadingHistorique(false) }
  }, [societeId, filtreAnnee])

  useEffect(() => { loadHistorique() }, [loadHistorique])

  const handleCalculer = useCallback(async () => {
    if (!societeId) return
    setCalculating(true)
    setFeedback(null)
    setSnapshotCalc(null)
    try {
      const r = await fetch('/api/rh/provisions/conges/calculer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: societeId, date_snapshot: dateSnapshot }),
      })
      const d = await r.json()
      if (!r.ok) { setFeedback(`❌ ${d.error || 'Erreur calcul'}`); return }
      setSnapshotCalc(d.snapshot)
    } catch (e: any) { setFeedback(`❌ ${e?.message || 'Erreur réseau'}`) }
    finally { setCalculating(false) }
  }, [societeId, dateSnapshot])

  const handleComptabiliser = useCallback(async () => {
    if (!societeId || !isAdmin) return
    if (!confirm(
      `Comptabiliser la provision pour ${libellePeriodeLocal(dateSnapshot)} ?\n\n` +
      `Cette action génère 2 écritures comptables (journal OD).\n` +
      (snapshotPrecedent ? `Le mois précédent (${snapshotPrecedent.date_snapshot}) sera extourné.` : ''),
    )) return
    setComptabilizing(true)
    setFeedback(null)
    try {
      const r = await fetch('/api/rh/provisions/conges/comptabiliser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: societeId, date_snapshot: dateSnapshot }),
      })
      const d = await r.json()
      if (!r.ok) { setFeedback(`❌ ${d.error || 'Erreur comptabilisation'}`); return }
      setFeedback(`✅ Provision ${formaterMUR(d.provision_total_mur || 0)} comptabilisée`
        + (d.extourne_precedent ? ' (extourne mois précédent inclus)' : ''))
      loadHistorique()
      setSnapshotCalc(null)
    } catch (e: any) { setFeedback(`❌ ${e?.message || 'Erreur réseau'}`) }
    finally { setComptabilizing(false) }
  }, [societeId, dateSnapshot, isAdmin, snapshotPrecedent, loadHistorique])

  const handleAnnuler = useCallback(async (id: string) => {
    if (!isAdmin) return
    if (!confirm('Annuler ce snapshot ? (soft delete, les écritures comptables sont conservées pour traçabilité)')) return
    setRowLoading(id)
    try {
      const r = await fetch(`/api/rh/provisions/conges/${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) { setFeedback(`❌ ${d.error || 'Erreur'}`); return }
      loadHistorique()
    } catch (e: any) { setFeedback(`❌ ${e?.message || 'Erreur'}`) }
    finally { setRowLoading(null) }
  }, [isAdmin, loadHistorique])

  const variation = useMemo(() => {
    if (!snapshotCalc) return null
    const prec = snapshotPrecedent?.provision_total_mur || 0
    return snapshotCalc.provision_total_mur - prec
  }, [snapshotCalc, snapshotPrecedent])

  const anneesDisponibles = useMemo(() => {
    const years = new Set<string>()
    for (const s of historique) years.add(String(s.date_snapshot).slice(0, 4))
    return Array.from(years).sort((a, b) => b.localeCompare(a))
  }, [historique])

  // ── Rendu ───────────────────────────────────────────────────────────
  if (authorized === null) {
    return (
      <ClientPageShell>
        <div className="flex items-center gap-2 text-slate-500 p-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      </ClientPageShell>
    )
  }
  if (authorized === false) {
    return (
      <ClientPageShell>
        <Card>
          <CardContent className="p-6 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-red-600 mt-1" />
            <div>
              <div className="font-semibold">Accès refusé</div>
              <div className="text-sm text-slate-600">Cette page est réservée aux rôles admin et rh.</div>
            </div>
          </CardContent>
        </Card>
      </ClientPageShell>
    )
  }

  return (
    <ClientPageShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: NAVY }}>
            📊 Provisions IAS 19 — Congés payés
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Charge mensuelle à passer en comptabilité. Compte <strong>64175</strong> (charge IAS 19) /
            compte <strong>4287</strong> (passif). Journal OD.
          </p>
        </div>

        {/* Sélection + actions */}
        <Card>
          <CardHeader><CardTitle className="text-base">Mois de provision</CardTitle></CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-3">
              <div>
                <Label>Société</Label>
                <div className="h-10 px-3 py-2 text-sm rounded-md border bg-slate-50 flex items-center"
                  style={{ color: NAVY }}>
                  {societe?.nom || <span className="text-slate-500 italic">Sélectionnez dans le menu de gauche</span>}
                </div>
              </div>
              <div>
                <Label>Date de snapshot (fin de mois)</Label>
                <Input
                  type="date"
                  value={dateSnapshot}
                  onChange={e => setDateSnapshot(finDeMoisLocal(e.target.value))}
                />
              </div>
              <div>
                <Label>Charges patronales</Label>
                <Input value={`${(chargesPct * 100).toFixed(1)} %`} disabled />
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={handleCalculer} disabled={calculating || !societeId}
                  className="gap-2" style={{ backgroundColor: NAVY, color: 'white' }}>
                  {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                  Aperçu
                </Button>
                {isAdmin && (
                  <Button onClick={handleComptabiliser} disabled={comptabilizing || !societeId}
                    className="gap-2" style={{ backgroundColor: GOLD, color: NAVY }}>
                    {comptabilizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpenCheck className="h-4 w-4" />}
                    Comptabiliser
                  </Button>
                )}
              </div>
            </div>
            {feedback && (
              <div className="mt-3 text-sm px-3 py-2 rounded border bg-slate-50">{feedback}</div>
            )}
          </CardContent>
        </Card>

        {/* Résultat calcul */}
        {snapshotCalc && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Aperçu — {libellePeriodeLocal(snapshotCalc.date_snapshot)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-4 gap-3">
                <div className="p-3 rounded border bg-slate-50">
                  <div className="text-xs text-slate-500">Provision totale</div>
                  <div className="text-xl font-semibold" style={{ color: NAVY }}>
                    {formaterMUR(snapshotCalc.provision_total_mur)}
                  </div>
                </div>
                <div className="p-3 rounded border bg-slate-50">
                  <div className="text-xs text-slate-500">Mois précédent</div>
                  <div className="text-xl font-semibold text-slate-700">
                    {formaterMUR(snapshotPrecedent?.provision_total_mur || 0)}
                  </div>
                </div>
                <div className="p-3 rounded border bg-slate-50">
                  <div className="text-xs text-slate-500">Variation</div>
                  <div className="text-xl font-semibold"
                    style={{ color: (variation || 0) >= 0 ? '#166534' : '#b91c1c' }}>
                    {(variation || 0) >= 0 ? '+' : ''}{formaterMUR(variation || 0)}
                  </div>
                </div>
                <div className="p-3 rounded border bg-slate-50">
                  <div className="text-xs text-slate-500">Employés concernés</div>
                  <div className="text-xl font-semibold text-slate-700">
                    {snapshotCalc.details_par_employe.filter(e => e.provision_mur > 0).length}
                    <span className="text-xs text-slate-500"> / {snapshotCalc.details_par_employe.length}</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2" style={{ color: NAVY }}>
                  Détail par employé
                </div>
                <div className="overflow-x-auto border rounded">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employé</TableHead>
                        <TableHead className="text-right">AL acquis</TableHead>
                        <TableHead className="text-right">AL pris</TableHead>
                        <TableHead className="text-right">Non pris</TableHead>
                        <TableHead className="text-right">Salaire base</TableHead>
                        <TableHead className="text-right">Coût/jour (+ch)</TableHead>
                        <TableHead className="text-right">Provision MUR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {snapshotCalc.details_par_employe.map(l => (
                        <TableRow key={l.employe_id}>
                          <TableCell>{l.employe_nom}</TableCell>
                          <TableCell className="text-right">{l.al_acquis.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{l.al_pris.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-medium">{l.al_non_pris.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{formaterMUR(l.salaire_base)}</TableCell>
                          <TableCell className="text-right">{formaterMUR(l.cout_journalier_charge)}</TableCell>
                          <TableCell className="text-right font-semibold" style={{ color: NAVY }}>
                            {formaterMUR(l.provision_mur)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="border rounded p-3 bg-amber-50/50">
                <div className="text-sm font-medium mb-2" style={{ color: NAVY }}>
                  Écritures qui seront générées
                </div>
                <div className="text-xs font-mono space-y-1">
                  <div className="flex justify-between border-b pb-1">
                    <span>Journal OD · Pièce PRO-IAS19-{dateSnapshot.slice(0, 7).replace('-', '')}</span>
                    <span>Date : {dateSnapshot}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>64175 DÉBIT  Provision congés (charge)</span>
                    <span className="font-semibold">{formaterMUR(snapshotCalc.provision_total_mur)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>4287 CRÉDIT Provision congés (passif)</span>
                    <span className="font-semibold">{formaterMUR(snapshotCalc.provision_total_mur)}</span>
                  </div>
                  {snapshotPrecedent && (
                    <div className="flex items-center gap-2 text-amber-900 pt-2 border-t">
                      <RotateCcw className="h-3 w-3" />
                      <span>
                        + extourne {snapshotPrecedent.date_snapshot} :
                        {' '}{formaterMUR(snapshotPrecedent.provision_total_mur)} (inverse)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Historique */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Historique des snapshots</span>
              <Select value={filtreAnnee} onValueChange={setFiltreAnnee}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {anneesDisponibles.map(y => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingHistorique ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
              </div>
            ) : historique.length === 0 ? (
              <div className="text-sm text-slate-500 italic">Aucun snapshot pour cette société.</div>
            ) : (
              <div className="overflow-x-auto border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mois</TableHead>
                      <TableHead className="text-right">Provision</TableHead>
                      <TableHead className="text-right">Charges pat.</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Écritures</TableHead>
                      {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historique.map(s => (
                      <TableRow key={s.id}>
                        <TableCell>{libellePeriodeLocal(s.date_snapshot)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formaterMUR(s.provision_total_mur)}
                        </TableCell>
                        <TableCell className="text-right">
                          {(s.charges_patronales_pct * 100).toFixed(1)} %
                        </TableCell>
                        <TableCell>
                          <StatutBadge statut={s.statut} />
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {s.ecriture_debit_id
                            ? <span className="inline-flex items-center gap-1"><FileCheck className="h-3 w-3" /> 64175/4287</span>
                            : <span className="italic">—</span>}
                          {s.ecriture_extourne_debit_id && (
                            <span className="ml-2 inline-flex items-center gap-1 text-amber-700">
                              <RotateCcw className="h-3 w-3" /> extourné
                            </span>
                          )}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            {s.statut !== 'annule' && s.id && (
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => handleAnnuler(s.id!)}
                                disabled={rowLoading === s.id}
                              >
                                {rowLoading === s.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Trash2 className="h-3 w-3 text-red-600" />}
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rappel comptable */}
        <Card>
          <CardContent className="p-4 text-xs text-slate-600 space-y-1">
            <div className="flex items-center gap-2 font-medium" style={{ color: NAVY }}>
              <AlertTriangle className="h-3 w-3" /> Rappel IAS 19 (§11-14)
            </div>
            <div>
              Les congés payés accumulés doivent être provisionnés au fur et à mesure de leur acquisition.
              Montant = jours acquis non pris × (salaire base × (1 + charges patronales) / 22).
            </div>
            <div>
              La provision est extournée le mois suivant (contre-passation) et remplacée par la nouvelle :
              le solde du compte 4287 reflète à tout moment la dette envers les employés.
            </div>
          </CardContent>
        </Card>
      </div>
    </ClientPageShell>
  )
}

function StatutBadge({ statut }: { statut: IAS19Statut }) {
  const cfg: Record<IAS19Statut, { bg: string; color: string }> = {
    calcule: { bg: '#e5e7eb', color: '#1f2937' },
    comptabilise: { bg: '#dcfce7', color: '#166534' },
    extourne: { bg: '#fef3c7', color: '#92400e' },
    annule: { bg: '#fee2e2', color: '#991b1b' },
  }
  const c = cfg[statut]
  return (
    <Badge style={{ backgroundColor: c.bg, color: c.color }} className="font-normal">
      {STATUT_LABELS[statut]}
    </Badge>
  )
}
