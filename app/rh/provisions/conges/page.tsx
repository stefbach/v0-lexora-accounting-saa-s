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
import { t, getLocale, type Locale } from "@/lib/i18n"
import {
  formaterMUR, STATUT_LABELS,
  type IAS19Snapshot, type IAS19Statut,
} from "@/lib/rh/ias19-provisions"

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
  const locale: Locale = getLocale()
  const [societes, setSocietes] = useState<Societe[]>([])
  const [societeId, setSocieteId] = useState<string>("")
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
        const { data: prof } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle<{ role: string | null }>()
        const role = prof?.role || ''
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

  // Charger coef charges patronales + historique quand societe change
  useEffect(() => {
    if (!societeId) return
    ;(async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const sb = createClient()
        const { data } = await sb.from('societes')
          .select('ias19_charges_patronales_pct')
          .eq('id', societeId).maybeSingle<{ ias19_charges_patronales_pct: number | null }>()
        setChargesPct(Number(data?.ias19_charges_patronales_pct ?? 0.13))
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
      if (!r.ok) { setFeedback(`❌ ${d.error || t('rhc.prov.err_calcul', locale)}`); return }
      setSnapshotCalc(d.snapshot)
    } catch (e: any) { setFeedback(`❌ ${e?.message || t('rhc.prov.err_reseau', locale)}`) }
    finally { setCalculating(false) }
  }, [societeId, dateSnapshot])

  const handleComptabiliser = useCallback(async () => {
    if (!societeId || !isAdmin) return
    if (!confirm(
      t('rhc.prov.confirm_book_l1', locale).replace('{periode}', libellePeriodeLocal(dateSnapshot)) + `\n\n` +
      t('rhc.prov.confirm_book_l2', locale) + `\n` +
      (snapshotPrecedent ? t('rhc.prov.confirm_book_extourne', locale).replace('{date}', snapshotPrecedent.date_snapshot) : ''),
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
      if (!r.ok) { setFeedback(`❌ ${d.error || t('rhc.prov.err_compta', locale)}`); return }
      setFeedback(t('rhc.prov.ok_book', locale).replace('{amt}', formaterMUR(d.provision_total_mur || 0))
        + (d.extourne_precedent ? t('rhc.prov.ok_book_extourne', locale) : ''))
      loadHistorique()
      setSnapshotCalc(null)
    } catch (e: any) { setFeedback(`❌ ${e?.message || t('rhc.prov.err_reseau', locale)}`) }
    finally { setComptabilizing(false) }
  }, [societeId, dateSnapshot, isAdmin, snapshotPrecedent, loadHistorique])

  const handleAnnuler = useCallback(async (id: string) => {
    if (!isAdmin) return
    if (!confirm(t('rhc.prov.confirm_annuler', locale))) return
    setRowLoading(id)
    try {
      const r = await fetch(`/api/rh/provisions/conges/${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) { setFeedback(`❌ ${d.error || t('rhc.prov.err_generic', locale)}`); return }
      loadHistorique()
    } catch (e: any) { setFeedback(`❌ ${e?.message || t('rhc.prov.err_generic', locale)}`) }
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
          <Loader2 className="h-4 w-4 animate-spin" /> {t('rha.b.provc.loading', locale)}
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
              <div className="font-semibold">{t('rha.b.provc.access_denied', locale)}</div>
              <div className="text-sm text-slate-600">{t('rha.b.provc.access_msg', locale)}</div>
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
            {t('rha.b.provc.title', locale)}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('rha.b.provc.subtitle', locale)}
          </p>
        </div>

        {/* Sélection + actions */}
        <Card>
          <CardHeader><CardTitle className="text-base">{t('rha.b.provc.month_title', locale)}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-3">
              <div>
                <Label>{t('rha.b.provc.lbl_societe', locale)}</Label>
                <Select value={societeId} onValueChange={setSocieteId}>
                  <SelectTrigger><SelectValue placeholder={t('rha.b.provc.select', locale)} /></SelectTrigger>
                  <SelectContent>
                    {societes.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('rha.b.provc.lbl_snapshot_date', locale)}</Label>
                <Input
                  type="date"
                  value={dateSnapshot}
                  onChange={e => setDateSnapshot(finDeMoisLocal(e.target.value))}
                />
              </div>
              <div>
                <Label>{t('rha.b.provc.lbl_employer_charges', locale)}</Label>
                <Input value={`${(chargesPct * 100).toFixed(1)} %`} disabled />
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={handleCalculer} disabled={calculating || !societeId}
                  className="gap-2" style={{ backgroundColor: NAVY, color: 'white' }}>
                  {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                  {t('rha.b.provc.btn_preview', locale)}
                </Button>
                {isAdmin && (
                  <Button onClick={handleComptabiliser} disabled={comptabilizing || !societeId}
                    className="gap-2" style={{ backgroundColor: GOLD, color: NAVY }}>
                    {comptabilizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpenCheck className="h-4 w-4" />}
                    {t('rha.b.provc.btn_book', locale)}
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
                {t('rha.b.provc.preview_for', locale)} {libellePeriodeLocal(snapshotCalc.date_snapshot)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-4 gap-3">
                <div className="p-3 rounded border bg-slate-50">
                  <div className="text-xs text-slate-500">{t('rha.b.provc.kpi_total', locale)}</div>
                  <div className="text-xl font-semibold" style={{ color: NAVY }}>
                    {formaterMUR(snapshotCalc.provision_total_mur)}
                  </div>
                </div>
                <div className="p-3 rounded border bg-slate-50">
                  <div className="text-xs text-slate-500">{t('rha.b.provc.kpi_prev_month', locale)}</div>
                  <div className="text-xl font-semibold text-slate-700">
                    {formaterMUR(snapshotPrecedent?.provision_total_mur || 0)}
                  </div>
                </div>
                <div className="p-3 rounded border bg-slate-50">
                  <div className="text-xs text-slate-500">{t('rha.b.provc.kpi_variation', locale)}</div>
                  <div className="text-xl font-semibold"
                    style={{ color: (variation || 0) >= 0 ? '#166534' : '#b91c1c' }}>
                    {(variation || 0) >= 0 ? '+' : ''}{formaterMUR(variation || 0)}
                  </div>
                </div>
                <div className="p-3 rounded border bg-slate-50">
                  <div className="text-xs text-slate-500">{t('rha.b.provc.kpi_employees', locale)}</div>
                  <div className="text-xl font-semibold text-slate-700">
                    {snapshotCalc.details_par_employe.filter(e => e.provision_mur > 0).length}
                    <span className="text-xs text-slate-500"> / {snapshotCalc.details_par_employe.length}</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2" style={{ color: NAVY }}>
                  {t('rha.b.provc.detail_per_emp', locale)}
                </div>
                <div className="overflow-x-auto border rounded">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('rha.b.provc.col_employee', locale)}</TableHead>
                        <TableHead className="text-right">{t('rha.b.provc.col_al_acquired', locale)}</TableHead>
                        <TableHead className="text-right">{t('rha.b.provc.col_al_taken', locale)}</TableHead>
                        <TableHead className="text-right">{t('rha.b.provc.col_unused', locale)}</TableHead>
                        <TableHead className="text-right">{t('rha.b.provc.col_base_salary', locale)}</TableHead>
                        <TableHead className="text-right">{t('rha.b.provc.col_cost_day', locale)}</TableHead>
                        <TableHead className="text-right">{t('rha.b.provc.col_provision_mur', locale)}</TableHead>
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
                  {t('rha.b.provc.entries_to_gen', locale)}
                </div>
                <div className="text-xs font-mono space-y-1">
                  <div className="flex justify-between border-b pb-1">
                    <span>{t('rhc.prov.journal_piece', locale).replace('{ref}', dateSnapshot.slice(0, 7).replace('-', ''))}</span>
                    <span>{t('rhc.prov.journal_date', locale).replace('{date}', dateSnapshot)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('rhc.prov.debit_charge', locale)}</span>
                    <span className="font-semibold">{formaterMUR(snapshotCalc.provision_total_mur)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('rhc.prov.credit_passif', locale)}</span>
                    <span className="font-semibold">{formaterMUR(snapshotCalc.provision_total_mur)}</span>
                  </div>
                  {snapshotPrecedent && (
                    <div className="flex items-center gap-2 text-amber-900 pt-2 border-t">
                      <RotateCcw className="h-3 w-3" />
                      <span>
                        {t('rhc.prov.extourne_ligne', locale)
                          .replace('{date}', snapshotPrecedent.date_snapshot)
                          .replace('{amt}', formaterMUR(snapshotPrecedent.provision_total_mur))}
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
              <span>{t('rha.b.provc.history_title', locale)}</span>
              <Select value={filtreAnnee} onValueChange={setFiltreAnnee}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('rha.b.provc.all', locale)}</SelectItem>
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
                <Loader2 className="h-4 w-4 animate-spin" /> {t('rha.b.provc.loading', locale)}
              </div>
            ) : historique.length === 0 ? (
              <div className="text-sm text-slate-500 italic">{t('rha.b.provc.no_snapshot', locale)}</div>
            ) : (
              <div className="overflow-x-auto border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('rha.b.provc.col_month', locale)}</TableHead>
                      <TableHead className="text-right">{t('rha.b.provc.col_provision', locale)}</TableHead>
                      <TableHead className="text-right">{t('rha.b.provc.col_charges', locale)}</TableHead>
                      <TableHead>{t('rha.b.provc.col_status', locale)}</TableHead>
                      <TableHead>{t('rha.b.provc.col_entries', locale)}</TableHead>
                      {isAdmin && <TableHead className="text-right">{t('rha.b.provc.col_actions', locale)}</TableHead>}
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
                              <RotateCcw className="h-3 w-3" /> {t('rha.b.provc.reversed', locale)}
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
              <AlertTriangle className="h-3 w-3" /> {t('rha.b.provc.reminder_title', locale)}
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
