"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Calculator, Loader2, FileCheck, ShieldAlert, AlertTriangle, Trash2,
  BookOpenCheck, RotateCcw, Gift,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale, type Locale } from "@/lib/i18n"
import {
  formaterMUREoy, STATUT_EOY_LABELS, MOTIF_NON_ELIGIBLE_EOY, libellePeriodeMois,
  type IAS19EoySnapshot, type IAS19EoyStatut,
} from "@/lib/rh/ias19-eoy-provisions"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Societe { id: string; nom: string }

const MOIS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

export default function ProvisionsEoyPage() {
  const locale: Locale = getLocale()
  const now = new Date()
  const [societes, setSocietes] = useState<Societe[]>([])
  const [societeId, setSocieteId] = useState<string>("")
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [userRole, setUserRole] = useState<string>("")

  const currentMois = Math.min(now.getMonth() + 1, 11) // bloque décembre
  const [annee, setAnnee] = useState<number>(now.getFullYear())
  const [mois, setMois] = useState<number>(currentMois)

  const [snapshotCalc, setSnapshotCalc] = useState<IAS19EoySnapshot | null>(null)
  const [snapshotPrecedent, setSnapshotPrecedent] = useState<IAS19EoySnapshot | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [comptabilizing, setComptabilizing] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const [historique, setHistorique] = useState<IAS19EoySnapshot[]>([])
  const [loadingHistorique, setLoadingHistorique] = useState(false)
  const [filtreAnnee, setFiltreAnnee] = useState<string>("all")
  const [rowLoading, setRowLoading] = useState<string | null>(null)

  const isAdmin = userRole === 'admin'

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
        const r = await fetch('/api/comptable/societes')
        const d = r.ok ? await r.json() : { societes: [] }
        setSocietes(d?.societes || [])
        if (d?.societes?.length > 0) setSocieteId(d.societes[0].id)
      } catch { setAuthorized(false) }
    })()
  }, [])

  const loadHistorique = useCallback(async () => {
    if (!societeId) return
    setLoadingHistorique(true)
    try {
      const q = new URLSearchParams({ societe_id: societeId })
      if (filtreAnnee !== 'all') q.set('annee', filtreAnnee)
      const r = await fetch(`/api/rh/provisions/eoy?${q.toString()}`)
      const d = r.ok ? await r.json() : { snapshots: [] }
      setHistorique(d?.snapshots || [])
    } catch { setHistorique([]) }
    finally { setLoadingHistorique(false) }
  }, [societeId, filtreAnnee])

  useEffect(() => { loadHistorique() }, [loadHistorique])

  // Snapshot précédent (mois-1)
  useEffect(() => {
    if (!societeId || mois <= 1) { setSnapshotPrecedent(null); return }
    ;(async () => {
      try {
        const r = await fetch(`/api/rh/provisions/eoy?societe_id=${societeId}&annee=${annee}`)
        const d = r.ok ? await r.json() : { snapshots: [] }
        const list: IAS19EoySnapshot[] = d?.snapshots || []
        const match = list.find(s => s.annee === annee && s.mois === mois - 1 && s.statut === 'comptabilise')
        setSnapshotPrecedent(match || null)
      } catch { setSnapshotPrecedent(null) }
    })()
  }, [societeId, annee, mois])

  useEffect(() => {
    setSnapshotCalc(null)
    setFeedback(null)
  }, [societeId, annee, mois])

  const handleCalculer = useCallback(async () => {
    if (!societeId) return
    setCalculating(true)
    setFeedback(null)
    setSnapshotCalc(null)
    try {
      const r = await fetch('/api/rh/provisions/eoy/calculer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: societeId, annee, mois }),
      })
      const d = await r.json()
      if (!r.ok) { setFeedback(`❌ ${d.error || 'Erreur calcul'}`); return }
      setSnapshotCalc(d.snapshot)
    } catch (e: any) { setFeedback(`❌ ${e?.message || 'Erreur réseau'}`) }
    finally { setCalculating(false) }
  }, [societeId, annee, mois])

  const handleComptabiliser = useCallback(async () => {
    if (!societeId || !isAdmin) return
    if (!confirm(
      `Comptabiliser la provision EOY pour ${MOIS_LABELS[mois - 1]} ${annee} ?\n\n` +
      `Cette action génère 2 écritures (journal OD).\n` +
      (snapshotPrecedent ? `Le mois précédent sera extourné.` : ''),
    )) return
    setComptabilizing(true)
    setFeedback(null)
    try {
      const r = await fetch('/api/rh/provisions/eoy/comptabiliser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: societeId, annee, mois }),
      })
      const d = await r.json()
      if (!r.ok) { setFeedback(`❌ ${d.error || 'Erreur'}`); return }
      setFeedback(
        `✅ Provision ${formaterMUREoy(d.provision_cumulee_total || 0)} comptabilisée` +
        ` (${d.nb_employes_eligibles || 0} employés éligibles)` +
        (d.extourne_precedent ? ' — extourne mois précédent incluse' : ''),
      )
      loadHistorique()
      setSnapshotCalc(null)
    } catch (e: any) { setFeedback(`❌ ${e?.message || 'Erreur réseau'}`) }
    finally { setComptabilizing(false) }
  }, [societeId, annee, mois, isAdmin, snapshotPrecedent, loadHistorique])

  const handleAnnuler = useCallback(async (id: string) => {
    if (!isAdmin) return
    if (!confirm('Annuler ce snapshot ? (soft delete, écritures conservées)')) return
    setRowLoading(id)
    try {
      const r = await fetch(`/api/rh/provisions/eoy/${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) { setFeedback(`❌ ${d.error}`); return }
      loadHistorique()
    } catch (e: any) { setFeedback(`❌ ${e?.message}`) }
    finally { setRowLoading(null) }
  }, [isAdmin, loadHistorique])

  const anneesDisponibles = useMemo(() => {
    const ys = new Set<string>()
    for (const s of historique) ys.add(String(s.annee))
    return Array.from(ys).sort((a, b) => b.localeCompare(a))
  }, [historique])

  const delta = useMemo(() => {
    if (!snapshotCalc) return null
    const prec = snapshotPrecedent?.provision_cumulee_total || 0
    return snapshotCalc.provision_cumulee_total - prec
  }, [snapshotCalc, snapshotPrecedent])

  if (authorized === null) {
    return (
      <ClientPageShell>
        <div className="flex items-center gap-2 text-slate-500 p-6">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('rha.b.proveoy.loading', locale)}
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
              <div className="font-semibold">{t('rha.b.proveoy.access_denied', locale)}</div>
              <div className="text-sm text-slate-600">{t('rha.b.proveoy.access_msg', locale)}</div>
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
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: NAVY }}>
            <Gift className="h-6 w-6" style={{ color: GOLD }} /> {t('rha.b.proveoy.title', locale)}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('rha.b.proveoy.subtitle', locale)}
          </p>
        </div>

        {/* Sélection */}
        <Card>
          <CardHeader><CardTitle className="text-base">{t('rha.b.proveoy.month_title', locale)}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-3">
              <div>
                <Label>{t('rha.b.proveoy.lbl_societe', locale)}</Label>
                <Select value={societeId} onValueChange={setSocieteId}>
                  <SelectTrigger><SelectValue placeholder={t('rha.b.proveoy.select', locale)} /></SelectTrigger>
                  <SelectContent>
                    {societes.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('rha.b.proveoy.lbl_year', locale)}</Label>
                <Select value={String(annee)} onValueChange={v => setAnnee(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('rha.b.proveoy.lbl_month', locale)}</Label>
                <Select value={String(mois)} onValueChange={v => setMois(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MOIS_LABELS.slice(0, 11).map((label, idx) => (
                      <SelectItem key={idx + 1} value={String(idx + 1)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={handleCalculer} disabled={calculating || !societeId}
                  className="gap-2" style={{ backgroundColor: NAVY, color: 'white' }}>
                  {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                  {t('rha.b.proveoy.btn_preview', locale)}
                </Button>
                {isAdmin && (
                  <Button onClick={handleComptabiliser} disabled={comptabilizing || !societeId}
                    className="gap-2" style={{ backgroundColor: GOLD, color: NAVY }}>
                    {comptabilizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpenCheck className="h-4 w-4" />}
                    {t('rha.b.proveoy.btn_book', locale)}
                  </Button>
                )}
              </div>
            </div>
            {feedback && (
              <div className="mt-3 text-sm px-3 py-2 rounded border bg-slate-50">{feedback}</div>
            )}
          </CardContent>
        </Card>

        {/* Résultat */}
        {snapshotCalc && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('rha.b.proveoy.preview_for', locale)} {libellePeriodeMois(snapshotCalc.annee, snapshotCalc.mois)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-4 gap-3">
                <div className="p-3 rounded border bg-slate-50">
                  <div className="text-xs text-slate-500">{t('rha.b.proveoy.kpi_total', locale)}</div>
                  <div className="text-xl font-semibold" style={{ color: NAVY }}>
                    {formaterMUREoy(snapshotCalc.provision_cumulee_total)}
                  </div>
                </div>
                <div className="p-3 rounded border bg-slate-50">
                  <div className="text-xs text-slate-500">{t('rha.b.proveoy.kpi_prev_month', locale)}</div>
                  <div className="text-xl font-semibold text-slate-700">
                    {formaterMUREoy(snapshotPrecedent?.provision_cumulee_total || 0)}
                  </div>
                </div>
                <div className="p-3 rounded border bg-slate-50">
                  <div className="text-xs text-slate-500">{t('rha.b.proveoy.kpi_delta', locale)}</div>
                  <div className="text-xl font-semibold"
                    style={{ color: (delta || 0) >= 0 ? '#166534' : '#b91c1c' }}>
                    {(delta || 0) >= 0 ? '+' : ''}{formaterMUREoy(delta || 0)}
                  </div>
                </div>
                <div className="p-3 rounded border bg-slate-50">
                  <div className="text-xs text-slate-500">{t('rha.b.proveoy.kpi_eligible', locale)}</div>
                  <div className="text-xl font-semibold text-slate-700">
                    {snapshotCalc.nb_employes_eligibles}
                    <span className="text-xs text-slate-500"> / {snapshotCalc.details_par_employe.length}</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2" style={{ color: NAVY }}>{t('rha.b.proveoy.detail_per_emp', locale)}</div>
                <div className="overflow-x-auto border rounded">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('rha.b.proveoy.col_employee', locale)}</TableHead>
                        <TableHead className="text-right">{t('rha.b.proveoy.col_months_worked', locale)}</TableHead>
                        <TableHead className="text-right">{t('rha.b.proveoy.col_earnings', locale)}</TableHead>
                        <TableHead className="text-right">{t('rha.b.proveoy.col_provision_cum', locale)}</TableHead>
                        <TableHead className="text-right">{t('rha.b.proveoy.col_provision_month', locale)}</TableHead>
                        <TableHead>{t('rha.b.proveoy.col_status', locale)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {snapshotCalc.details_par_employe.map(l => (
                        <TableRow key={l.employe_id}>
                          <TableCell>{l.employe_nom}</TableCell>
                          <TableCell className="text-right">{l.nb_mois_travailles.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{formaterMUREoy(l.earnings_cumulees)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formaterMUREoy(l.provision_cumulee)}
                          </TableCell>
                          <TableCell className="text-right font-semibold"
                            style={{ color: l.provision_du_mois >= 0 ? NAVY : '#b91c1c' }}>
                            {l.provision_du_mois >= 0 ? '+' : ''}{formaterMUREoy(l.provision_du_mois)}
                          </TableCell>
                          <TableCell>
                            {l.eligible ? (
                              <Badge className="bg-green-100 text-green-800 border-green-300 font-normal text-[10px]">
                                {t('rha.b.proveoy.eligible', locale)}
                              </Badge>
                            ) : (
                              <Badge className="bg-slate-100 text-slate-600 border-slate-300 font-normal text-[10px]">
                                {MOTIF_NON_ELIGIBLE_EOY[l.motif_non_eligible || ''] || 'Non éligible'}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="border rounded p-3 bg-amber-50/50">
                <div className="text-sm font-medium mb-2" style={{ color: NAVY }}>
                  {t('rha.b.proveoy.entries_to_gen', locale)}
                </div>
                <div className="text-xs font-mono space-y-1">
                  <div className="flex justify-between border-b pb-1">
                    <span>Journal OD · Pièce PRO-IAS19EOY-{snapshotCalc.annee}{String(snapshotCalc.mois).padStart(2, '0')}</span>
                    <span>Date : {snapshotCalc.date_snapshot}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>64176 DÉBIT  Provision EOY (charge)</span>
                    <span className="font-semibold">{formaterMUREoy(snapshotCalc.provision_cumulee_total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>4288  CRÉDIT Provision EOY (passif)</span>
                    <span className="font-semibold">{formaterMUREoy(snapshotCalc.provision_cumulee_total)}</span>
                  </div>
                  {snapshotPrecedent && (
                    <div className="flex items-center gap-2 text-amber-900 pt-2 border-t">
                      <RotateCcw className="h-3 w-3" />
                      <span>
                        + extourne mois {snapshotPrecedent.mois}/{snapshotPrecedent.annee} :
                        {' '}{formaterMUREoy(snapshotPrecedent.provision_cumulee_total)} (inverse)
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
              <span>{t('rha.b.proveoy.history_title', locale)}</span>
              <Select value={filtreAnnee} onValueChange={setFiltreAnnee}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('rha.b.proveoy.all', locale)}</SelectItem>
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
                <Loader2 className="h-4 w-4 animate-spin" /> {t('rha.b.proveoy.loading', locale)}
              </div>
            ) : historique.length === 0 ? (
              <div className="text-sm text-slate-500 italic">{t('rha.b.proveoy.no_snapshot', locale)}</div>
            ) : (
              <div className="overflow-x-auto border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('rha.b.proveoy.col_period', locale)}</TableHead>
                      <TableHead className="text-right">{t('rha.b.proveoy.col_provision_cum', locale)}</TableHead>
                      <TableHead className="text-right">{t('rha.b.proveoy.col_delta', locale)}</TableHead>
                      <TableHead className="text-right">{t('rha.b.proveoy.col_eligible', locale)}</TableHead>
                      <TableHead>{t('rha.b.proveoy.col_status', locale)}</TableHead>
                      <TableHead>{t('rha.b.proveoy.col_entries', locale)}</TableHead>
                      {isAdmin && <TableHead className="text-right">{t('rha.b.proveoy.col_actions', locale)}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historique.map(s => (
                      <TableRow key={s.id}>
                        <TableCell>{libellePeriodeMois(s.annee, s.mois)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formaterMUREoy(s.provision_cumulee_total)}
                        </TableCell>
                        <TableCell className="text-right text-slate-600">
                          {s.provision_du_mois_total >= 0 ? '+' : ''}
                          {formaterMUREoy(s.provision_du_mois_total)}
                        </TableCell>
                        <TableCell className="text-right">{s.nb_employes_eligibles}</TableCell>
                        <TableCell><StatutBadge statut={s.statut} /></TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {s.ecriture_debit_id
                            ? <span className="inline-flex items-center gap-1"><FileCheck className="h-3 w-3" /> 64176/4288</span>
                            : <span className="italic">—</span>}
                          {s.ecriture_extourne_debit_id && (
                            <span className="ml-2 inline-flex items-center gap-1 text-amber-700">
                              <RotateCcw className="h-3 w-3" /> {t('rha.b.proveoy.reversed', locale)}
                            </span>
                          )}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            {s.statut !== 'annule' && s.id && (
                              <Button variant="ghost" size="sm"
                                onClick={() => handleAnnuler(s.id!)}
                                disabled={rowLoading === s.id}>
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

        {/* Rappel */}
        <Card>
          <CardContent className="p-4 text-xs text-slate-600 space-y-1">
            <div className="flex items-center gap-2 font-medium" style={{ color: NAVY }}>
              <AlertTriangle className="h-3 w-3" /> {t('rha.b.proveoy.reminder_title', locale)}
            </div>
            <div>
              La charge du 13e mois est étalée sur les 12 mois. À chaque fin de mois N (1-11),
              provision cumulée = earnings (brut + OT + disturbance) jan→N ÷ 12 × N.
            </div>
            <div>
              Décembre : pas de provision. Le paiement réel (75% + 25%) se fait via
              le module <strong>EOY Bonus</strong> (G11) et solde le compte 4288.
            </div>
          </CardContent>
        </Card>
      </div>
    </ClientPageShell>
  )
}

function StatutBadge({ statut }: { statut: IAS19EoyStatut }) {
  const cfg: Record<IAS19EoyStatut, { bg: string; color: string }> = {
    calcule: { bg: '#e5e7eb', color: '#1f2937' },
    comptabilise: { bg: '#dcfce7', color: '#166534' },
    extourne: { bg: '#fef3c7', color: '#92400e' },
    annule: { bg: '#fee2e2', color: '#991b1b' },
  }
  const c = cfg[statut]
  return (
    <Badge style={{ backgroundColor: c.bg, color: c.color }} className="font-normal">
      {STATUT_EOY_LABELS[statut]}
    </Badge>
  )
}
