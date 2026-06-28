"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  Gift, Loader2, Calculator, Save, AlertTriangle, CheckCircle2,
  Eye, ShieldAlert, CalendarDays, Wallet,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale, type Locale } from "@/lib/i18n"
import {
  formaterMontantMUR, formaterPct, getMotifLabel,
  type EoyBonusCalcul, type EoyBonusRecap,
} from "@/lib/rh/eoy-bonus"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

type EoyCalculEnriched = EoyBonusCalcul & {
  id?: string
  bulletin_75pct_id?: string | null
  bulletin_25pct_id?: string | null
  statut?: string
}

export default function EoyBonusPage() {
  const locale: Locale = getLocale()
  const [societes, setSocietes] = useState<Array<{ id: string; nom: string }>>([])
  const [societeId, setSocieteId] = useState<string>("")
  const [annee, setAnnee] = useState<number>(new Date().getFullYear())

  const [calculs, setCalculs] = useState<EoyCalculEnriched[]>([])
  const [recap, setRecap] = useState<EoyBonusRecap | null>(null)
  const [savedFlag, setSavedFlag] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState<'preview' | 'save' | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [userRole, setUserRole] = useState<string>("")
  const [rowLoading, setRowLoading] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<
    | { kind: 'generer'; portion: '75pct' | '25pct'; calcul: EoyCalculEnriched }
    | { kind: 'annuler'; portion: '75pct' | '25pct'; calcul: EoyCalculEnriched }
    | null
  >(null)

  const [detailOpen, setDetailOpen] = useState<EoyBonusCalcul | null>(null)

  // Charge liste sociétés + vérif rôle
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

        const res = await fetch('/api/comptable/societes')
        const d = res.ok ? await res.json() : { societes: [] }
        setSocietes(d?.societes || [])
        if (d?.societes?.length > 0) setSocieteId(d.societes[0].id)
      } catch { setAuthorized(false) }
    })()
  }, [])

  const loadExisting = useCallback(async () => {
    if (!societeId || !annee) return
    setLoading(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/rh/eoy-bonus?societe_id=${societeId}&annee=${annee}`)
      const d = await res.json()
      if (!res.ok) { setFeedback(`⚠ ${d?.error || t('uirh.eoybonus.err_generic', locale)}`); return }
      setCalculs(d.calculs || [])
      setRecap(d.recap || null)
      setSavedFlag(d.saved ?? null)
    } catch (e: any) {
      setFeedback(`⚠ ${e?.message || t('uirh.eoybonus.err_network', locale)}`)
    } finally {
      setLoading(false)
    }
  }, [societeId, annee])

  useEffect(() => {
    if (authorized && societeId) loadExisting()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, societeId, annee])

  const runAction = async (path: 'preview' | 'calculer') => {
    if (!societeId) return
    setProcessing(path === 'preview' ? 'preview' : 'save')
    setFeedback(null)
    try {
      const res = await fetch(`/api/rh/eoy-bonus/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: societeId, annee }),
      })
      const d = await res.json()
      if (!res.ok) { setFeedback(`⚠ ${d?.error || `HTTP ${res.status}`}`); return }
      setCalculs(d.calculs || [])
      setRecap(d.recap || null)
      setSavedFlag(d.saved === true || d.saved > 0)
      if (path === 'calculer') {
        setFeedback(`✅ ${t('uirh.eoybonus.fb_saved', locale).replace('{n}', String(d.saved || 0))}`)
      } else {
        setFeedback(`🔍 ${t('uirh.eoybonus.fb_preview', locale).replace('{n}', String((d.calculs || []).length))}`)
      }
    } catch (e: any) {
      setFeedback(`⚠ ${e?.message || t('uirh.eoybonus.err_generic', locale)}`)
    } finally {
      setProcessing(null)
    }
  }

  // G11.10 — génération / annulation d'un bulletin EOY.
  const runGenererOrAnnuler = async (
    kind: 'generer' | 'annuler',
    portion: '75pct' | '25pct',
    calcul: EoyCalculEnriched,
    force = false,
  ) => {
    if (!calcul.id) return
    setRowLoading(calcul.id)
    setFeedback(null)
    try {
      const path = kind === 'generer'
        ? `/api/rh/eoy-bonus/${calcul.id}/generer-bulletin-${portion.replace('pct', '')}`
        : `/api/rh/eoy-bonus/${calcul.id}/annuler-bulletin?portion=${portion.replace('pct', '')}`
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'generer' ? { force } : {}),
      })
      const d = await res.json()
      if (!res.ok) { setFeedback(`⚠ ${d?.error || `HTTP ${res.status}`}`); return }
      setFeedback(kind === 'generer'
        ? `✅ ${t('uirh.eoybonus.fb_bull_gen', locale).replace('{p}', portion).replace('{id}', d.bulletin_id?.slice(0, 8) || 'OK')}`
        : `✅ ${t('uirh.eoybonus.fb_bull_cancel', locale).replace('{p}', portion)}`)
      await loadExisting()
    } catch (e: any) {
      setFeedback(`⚠ ${e?.message || t('uirh.eoybonus.err_generic', locale)}`)
    } finally {
      setRowLoading(null)
      setConfirmAction(null)
    }
  }

  const anneesDisponibles = useMemo(() => {
    const y = new Date().getFullYear()
    return [y - 2, y - 1, y, y + 1]
  }, [])

  if (authorized === false) {
    return (
      <ClientPageShell hideHero disableParticles>
        <Card className="max-w-lg mx-auto mt-12 border-red-300 bg-red-50">
          <CardContent className="p-6 flex items-start gap-3">
            <ShieldAlert className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">{t('rhdiv.eoy.access_denied', locale)}</p>
              <p className="text-sm text-red-800 mt-1">
                {t('rhdiv.eoy.access_msg', locale)}
              </p>
            </div>
          </CardContent>
        </Card>
      </ClientPageShell>
    )
  }

  if (authorized === null) {
    return (
      <ClientPageShell hideHero disableParticles>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
        </div>
      </ClientPageShell>
    )
  }

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2" style={{ color: NAVY }}>
            <Gift className="h-7 w-7" style={{ color: GOLD }} />
            {t('rhdiv.eoy.title', locale)}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('rhdiv.eoy.subtitle', locale)}
          </p>
        </div>

        {/* Filtres + actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base" style={{ color: NAVY }}>{t('rhdiv.eoy.params_title', locale)}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-sm">{t('rhdiv.eoy.lbl_societe', locale)}</Label>
              <Select value={societeId} onValueChange={setSocieteId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">{t('rhdiv.eoy.lbl_year', locale)}</Label>
              <Select value={String(annee)} onValueChange={v => setAnnee(parseInt(v, 10))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anneesDisponibles.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline" className="w-full"
                disabled={!societeId || processing !== null}
                onClick={() => runAction('preview')}
              >
                {processing === 'preview' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                {t('rhdiv.eoy.btn_preview', locale)}
              </Button>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full text-white"
                style={{ backgroundColor: NAVY }}
                disabled={!societeId || processing !== null}
                onClick={() => runAction('calculer')}
              >
                {processing === 'save' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                {t('rhdiv.eoy.btn_calc_save', locale)}
              </Button>
            </div>
          </CardContent>
        </Card>

        {feedback && (
          <div className={`rounded-md px-4 py-2 text-sm border ${feedback.startsWith('⚠') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-800 border-green-200'}`}>
            {feedback}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
        ) : recap ? (
          <>
            {/* Récap */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="border-2" style={{ borderColor: GOLD + '40' }}>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{t('rhdiv.eoy.kpi_total', locale)}</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: NAVY }}>{formaterMontantMUR(recap.total_bonus)}</p>
                  <p className="text-[11px] text-gray-400 mt-1">{t('rhdiv.eoy.kpi_eligible', locale).replace('{n}', String(recap.nb_eligibles))}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1">
                    <Wallet className="h-3 w-3" /> {t('rhdiv.eoy.kpi_75_before', locale)}
                  </p>
                  <p className="text-xl font-bold mt-1" style={{ color: NAVY }}>{formaterMontantMUR(recap.total_75pct)}</p>
                  <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" /> {formatDateFR(recap.date_paiement_75pct)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1">
                    <Wallet className="h-3 w-3" /> {t('rhdiv.eoy.kpi_25_before', locale)}
                  </p>
                  <p className="text-xl font-bold mt-1" style={{ color: NAVY }}>{formaterMontantMUR(recap.total_25pct)}</p>
                  <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" /> {formatDateFR(recap.date_paiement_25pct)}
                  </p>
                </CardContent>
              </Card>
              <Card className={recap.nb_bulletins_manquants_total > 0 ? 'border-2 border-amber-300 bg-amber-50' : ''}>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{t('rhdiv.eoy.kpi_diagnostic', locale)}</p>
                  {recap.nb_bulletins_manquants_total > 0 ? (
                    <>
                      <p className="text-lg font-bold text-amber-700 mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4" /> {(recap.nb_bulletins_manquants_total > 1 ? t('uirh.eoybonus.bull_missing_plural', locale) : t('uirh.eoybonus.bull_missing', locale)).replace('{n}', String(recap.nb_bulletins_manquants_total))}
                      </p>
                      <p className="text-[11px] text-amber-700 mt-1">
                        {(recap.nb_employes_avec_bulletins_manquants > 1 ? t('uirh.eoybonus.emp_concerned_plural', locale) : t('uirh.eoybonus.emp_concerned', locale)).replace('{n}', String(recap.nb_employes_avec_bulletins_manquants))}
                      </p>
                    </>
                  ) : (
                    <p className="text-lg font-bold text-emerald-700 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" /> {t('rhdiv.eoy.complete_data', locale)}
                    </p>
                  )}
                  {recap.nb_non_eligibles > 0 && (
                    <p className="text-[11px] text-gray-500 mt-1">
                      {(recap.nb_non_eligibles > 1 ? t('uirh.eoybonus.non_eligible_count_plural', locale) : t('uirh.eoybonus.non_eligible_count', locale)).replace('{n}', String(recap.nb_non_eligibles))}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Banner Phase 1 */}
            <div className="rounded-md border-2 border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                <p className="font-semibold">{t('rhdiv.eoy.phase1_title', locale)}</p>
                <p className="text-[13px]">
                  {t('uirh.eoybonus.phase1_body', locale)}
                </p>
              </div>
            </div>

            {/* Tableau détaillé */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between" style={{ color: NAVY }}>
                  <span>{t('rhdiv.eoy.detail_per_emp', locale).replace('{n}', String(calculs.length))}</span>
                  {savedFlag !== null && (
                    <Badge className={savedFlag ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}>
                      {savedFlag ? t('rhdiv.eoy.saved', locale) : t('rhdiv.eoy.preview', locale)}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('rhdiv.eoy.col_employee', locale)}</TableHead>
                        <TableHead className="text-right">{t('rhdiv.eoy.col_earnings', locale)}</TableHead>
                        <TableHead className="text-right">{t('rhdiv.eoy.col_months', locale)}</TableHead>
                        <TableHead className="text-right">{t('rhdiv.eoy.col_avg', locale)}</TableHead>
                        <TableHead className="text-right">{t('rhdiv.eoy.col_dec_salary', locale)}</TableHead>
                        <TableHead className="text-right">{t('rhdiv.eoy.col_base', locale)}</TableHead>
                        <TableHead className="text-right">{t('rhdiv.eoy.col_prorata', locale)}</TableHead>
                        <TableHead className="text-right">{t('rhdiv.eoy.col_bonus', locale)}</TableHead>
                        <TableHead className="text-right">{t('rhdiv.eoy.col_75_25', locale)}</TableHead>
                        <TableHead>{t('rhdiv.eoy.col_status', locale)}</TableHead>
                        <TableHead className="text-right">{t('rhdiv.eoy.col_actions', locale)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calculs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center text-gray-400 py-8">
                            {t('rhdiv.eoy.no_calc', locale)}
                          </TableCell>
                        </TableRow>
                      ) : calculs.map(c => {
                        const manquants = c.bulletins_attendus - c.bulletins_trouves
                        const b75 = Math.round(c.bonus_calcule * 0.75 * 100) / 100
                        const b25 = Math.round((c.bonus_calcule - b75) * 100) / 100
                        return (
                          <TableRow key={c.employe_id} className="cursor-pointer hover:bg-gray-50" onClick={() => setDetailOpen(c)}>
                            <TableCell className="font-medium">
                              {c.employe_nom || c.employe_id.slice(0, 8)}
                              {manquants > 0 && c.eligible && (
                                <span className="ml-2 text-[10px] text-amber-700" title={t('uirh.eoybonus.bull_missing_tip', locale).replace('{n}', String(manquants))}>
                                  ⚠ {manquants}j
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">{formaterMontantMUR(c.earnings_annuel)}</TableCell>
                            <TableCell className="text-right text-xs">{c.nb_mois_travailles.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{formaterMontantMUR(c.moyenne_mensuelle)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {c.salaire_decembre == null ? '—' : formaterMontantMUR(c.salaire_decembre)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs font-semibold">{formaterMontantMUR(c.base_calcul)}</TableCell>
                            <TableCell className="text-right text-xs">{formaterPct(c.prorata, 1)}</TableCell>
                            <TableCell className="text-right font-mono text-sm font-bold" style={{ color: c.eligible ? NAVY : '#9ca3af' }}>
                              {formaterMontantMUR(c.bonus_calcule)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-[11px] text-gray-500">
                              {c.eligible ? (
                                <>
                                  <div>{formaterMontantMUR(b75)}</div>
                                  <div>{formaterMontantMUR(b25)}</div>
                                </>
                              ) : '—'}
                            </TableCell>
                            <TableCell>
                              {c.eligible ? (
                                <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">{t('rhdiv.eoy.eligible', locale)}</Badge>
                              ) : (
                                <Badge className="bg-red-100 text-red-700 text-[10px]" title={c.motif_non_eligible || ''}>
                                  {getMotifLabel(c.motif_non_eligible)}
                                </Badge>
                              )}
                            </TableCell>
                            {/* G11.10 — Actions : générer / annuler 75-25 */}
                            <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                              <ActionCell
                                calcul={c}
                                userRole={userRole}
                                locale={locale}
                                rowLoading={rowLoading === c.id}
                                onGenerer={(portion) => setConfirmAction({ kind: 'generer', portion, calcul: c })}
                                onAnnuler={(portion) => setConfirmAction({ kind: 'annuler', portion, calcul: c })}
                              />
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="text-center py-16 text-gray-500">
              <Gift className="h-10 w-10 mx-auto text-gray-300 mb-3" />
              <p>{t('rhdiv.eoy.empty_hint', locale)}</p>
            </CardContent>
          </Card>
        )}

        {/* Modale détail employé */}
        <Dialog open={detailOpen !== null} onOpenChange={v => !v && setDetailOpen(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle style={{ color: NAVY }}>
                {detailOpen?.employe_nom || t('uirh.eoybonus.detail_fallback', locale)} — EOY {detailOpen?.annee}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {t('uirh.eoybonus.detail_desc', locale)}
              </DialogDescription>
            </DialogHeader>
            {detailOpen && (
              <div className="space-y-3 text-sm">
                <LineDetail label={t('uirh.eoybonus.ld_earnings', locale)} value={formaterMontantMUR(detailOpen.earnings_annuel)} />
                <LineDetail label={t('uirh.eoybonus.ld_months', locale)} value={detailOpen.nb_mois_travailles.toFixed(2)} />
                <LineDetail label={t('uirh.eoybonus.ld_bulletins', locale)} value={`${detailOpen.bulletins_trouves} / ${detailOpen.bulletins_attendus}`} warning={detailOpen.bulletins_trouves < detailOpen.bulletins_attendus} />
                <LineDetail label={t('uirh.eoybonus.ld_avg', locale)} value={formaterMontantMUR(detailOpen.moyenne_mensuelle)} />
                <LineDetail label={t('uirh.eoybonus.ld_dec_salary', locale)} value={detailOpen.salaire_decembre == null ? '—' : formaterMontantMUR(detailOpen.salaire_decembre)} />
                <LineDetail
                  label={t('uirh.eoybonus.ld_base', locale)}
                  value={formaterMontantMUR(detailOpen.base_calcul)}
                  hint={detailOpen.salaire_decembre != null && detailOpen.salaire_decembre > detailOpen.moyenne_mensuelle
                    ? t('uirh.eoybonus.ld_base_hint_dec', locale)
                    : t('uirh.eoybonus.ld_base_hint_avg', locale)}
                />
                <LineDetail label={t('uirh.eoybonus.ld_prorata', locale)} value={formaterPct(detailOpen.prorata, 2)} />
                <div className="pt-2 border-t">
                  <LineDetail
                    label={detailOpen.eligible ? t('uirh.eoybonus.ld_bonus', locale) : t('uirh.eoybonus.ld_non_eligible', locale)}
                    value={detailOpen.eligible
                      ? formaterMontantMUR(detailOpen.bonus_calcule)
                      : getMotifLabel(detailOpen.motif_non_eligible)}
                    big
                  />
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* G11.10 — Modale de confirmation génération / annulation */}
        <Dialog open={confirmAction !== null} onOpenChange={v => !v && setConfirmAction(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle style={{ color: NAVY }}>
                {confirmAction?.kind === 'generer' ? t('uirh.eoybonus.confirm_gen_title', locale) : t('uirh.eoybonus.confirm_cancel_title', locale)} {confirmAction?.portion === '75pct' ? '75%' : '25%'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {confirmAction?.kind === 'generer'
                  ? t('uirh.eoybonus.confirm_gen_desc', locale)
                  : t('uirh.eoybonus.confirm_cancel_desc', locale)}
              </DialogDescription>
            </DialogHeader>
            {confirmAction && (
              <div className="space-y-2 text-sm">
                <p>
                  {t('uirh.eoybonus.confirm_employee', locale)} <strong>{confirmAction.calcul.employe_nom || '—'}</strong>
                </p>
                <p>
                  {t('uirh.eoybonus.confirm_annual_bonus', locale)} <span className="font-mono">{formaterMontantMUR(confirmAction.calcul.bonus_calcule)}</span>
                </p>
                <p>
                  {t('uirh.eoybonus.confirm_portion', locale)} {confirmAction.portion === '75pct' ? '75%' : '25%'} :{' '}
                  <span className="font-mono font-semibold">
                    {formaterMontantMUR(
                      confirmAction.portion === '75pct'
                        ? Math.round(confirmAction.calcul.bonus_calcule * 0.75 * 100) / 100
                        : Math.round((confirmAction.calcul.bonus_calcule
                            - Math.round(confirmAction.calcul.bonus_calcule * 0.75 * 100) / 100) * 100) / 100,
                    )}
                  </span>
                </p>
                {confirmAction.kind === 'annuler' && (
                  <p className="text-amber-700 text-xs italic">
                    {t('uirh.eoybonus.confirm_irreversible', locale)}
                  </p>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setConfirmAction(null)}>{t('cui.cancel', locale)}</Button>
              <Button
                onClick={() => confirmAction && runGenererOrAnnuler(
                  confirmAction.kind,
                  confirmAction.portion,
                  confirmAction.calcul,
                )}
                className="text-white"
                style={{ backgroundColor: confirmAction?.kind === 'generer' ? NAVY : '#dc2626' }}
              >
                {confirmAction?.kind === 'generer' ? t('uirh.eoybonus.btn_generate', locale) : t('uirh.eoybonus.btn_confirm_delete', locale)}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ClientPageShell>
  )
}

// ─── G11.10 — Bouton d'action par ligne ──────────────────────────────
function ActionCell({
  calcul, userRole, locale, rowLoading, onGenerer, onAnnuler,
}: {
  calcul: EoyCalculEnriched
  userRole: string
  locale: Locale
  rowLoading: boolean
  onGenerer: (portion: '75pct' | '25pct') => void
  onAnnuler: (portion: '75pct' | '25pct') => void
}) {
  if (!calcul.eligible) {
    return <span className="text-[11px] text-gray-400 italic">—</span>
  }
  const has75 = !!calcul.bulletin_75pct_id
  const has25 = !!calcul.bulletin_25pct_id
  const isAdmin = userRole === 'admin'
  // Garde période : désactivé hors novembre-décembre pour le 75, hors
  // 15 déc-janv pour le 25. Admin bypass via la route (force=true).
  const today = new Date()
  const m = today.getMonth() + 1
  const inPeriod75 = m === 11 || m === 12
  const inPeriod25 = (m === 12 && today.getDate() >= 15) || m === 1

  if (has75 && has25) {
    return (
      <div className="flex flex-col items-end gap-0.5 text-[11px]">
        <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">{t('uirh.eoybonus.paid_75', locale)}</Badge>
        <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">{t('uirh.eoybonus.paid_25', locale)}</Badge>
        {isAdmin && !rowLoading && (
          <button
            type="button"
            className="text-[10px] text-red-600 underline mt-1"
            onClick={() => onAnnuler('25pct')}
          >
            {t('uirh.eoybonus.cancel_25', locale)}
          </button>
        )}
      </div>
    )
  }

  if (has75 && !has25) {
    return (
      <div className="flex flex-col items-end gap-0.5 text-[11px]">
        <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">{t('uirh.eoybonus.paid_75', locale)}</Badge>
        <button
          type="button"
          disabled={rowLoading || (!inPeriod25 && !isAdmin)}
          className="text-[10px] px-2 py-0.5 rounded bg-indigo-600 text-white disabled:opacity-40"
          title={!inPeriod25 ? t('uirh.eoybonus.period_25', locale) : t('uirh.eoybonus.gen_25_tip', locale)}
          onClick={() => onGenerer('25pct')}
        >
          {rowLoading ? '…' : t('uirh.eoybonus.gen_25', locale)}
        </button>
        {isAdmin && (
          <button
            type="button"
            className="text-[10px] text-red-600 underline"
            onClick={() => onAnnuler('75pct')}
          >
            {t('uirh.eoybonus.cancel_75', locale)}
          </button>
        )}
      </div>
    )
  }

  // Ni 75 ni 25 générés
  return (
    <button
      type="button"
      disabled={rowLoading || (!inPeriod75 && !isAdmin)}
      className="text-[11px] px-2 py-1 rounded text-white disabled:opacity-40"
      style={{ backgroundColor: '#0B0F2E' }}
      title={!inPeriod75 ? t('uirh.eoybonus.period_75', locale) : t('uirh.eoybonus.gen_75_tip', locale)}
      onClick={() => onGenerer('75pct')}
    >
      {rowLoading ? '…' : t('uirh.eoybonus.gen_75', locale)}
    </button>
  )
}

function LineDetail({ label, value, hint, warning, big }: { label: string; value: string; hint?: string; warning?: boolean; big?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className={big ? 'text-sm font-semibold' : 'text-xs text-gray-500'}>{label}</p>
        {hint && <p className="text-[10px] text-gray-400 italic">{hint}</p>}
      </div>
      <p className={`font-mono ${big ? 'text-lg font-bold' : warning ? 'text-amber-700 font-semibold' : 'text-sm'}`} style={big ? { color: NAVY } : undefined}>
        {value}
      </p>
    </div>
  )
}

function formatDateFR(ymd: string): string {
  if (!ymd || ymd.length < 10) return '—'
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`
}
