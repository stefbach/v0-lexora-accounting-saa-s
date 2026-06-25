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
  Calculator, Loader2, FileDown, ShieldAlert, BanknoteArrowDown,
  CheckCircle2, AlertTriangle, FileText, BookOpenCheck,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale, type Locale } from "@/lib/i18n"
import {
  formaterMUR, libellePeriode, deadlineMraFromPeriode, firstDayOfMonth,
  STATUT_MRA_LABELS, PRGF_EXEMPTION_LABELS,
  type DeclarationMraRecap, type DeclarationPayeRecord, type DeclarationCsgRecord,
  type StatutDeclarationMra,
} from "@/lib/rh/declarations-mra"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Societe { id: string; nom: string; ern?: string }

function getMoisLabels(locale: Locale): string[] {
  return [
    t('rhdiv.decmra.month_jan', locale), t('rhdiv.decmra.month_feb', locale),
    t('rhdiv.decmra.month_mar', locale), t('rhdiv.decmra.month_apr', locale),
    t('rhdiv.decmra.month_may', locale), t('rhdiv.decmra.month_jun', locale),
    t('rhdiv.decmra.month_jul', locale), t('rhdiv.decmra.month_aug', locale),
    t('rhdiv.decmra.month_sep', locale), t('rhdiv.decmra.month_oct', locale),
    t('rhdiv.decmra.month_nov', locale), t('rhdiv.decmra.month_dec', locale),
  ]
}

export default function DeclarationsMraPage() {
  const locale: Locale = getLocale()
  const now = new Date()
  const [societes, setSocietes] = useState<Societe[]>([])
  const [societeId, setSocieteId] = useState<string>("")
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [userRole, setUserRole] = useState<string>("")

  const [annee, setAnnee] = useState<number>(now.getFullYear())
  // Mois par défaut = mois précédent (décalage naturel)
  const [mois, setMois] = useState<number>(now.getMonth() === 0 ? 12 : now.getMonth())

  const [recap, setRecap] = useState<DeclarationMraRecap | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [ern, setErn] = useState<string>("")
  const [showDetails, setShowDetails] = useState(false)

  const [payeHist, setPayeHist] = useState<DeclarationPayeRecord[]>([])
  const [csgHist, setCsgHist] = useState<DeclarationCsgRecord[]>([])
  const [loadingHist, setLoadingHist] = useState(false)

  // Dialog paiement
  const [showPayDialog, setShowPayDialog] = useState(false)
  const [payDate, setPayDate] = useState<string>(now.toISOString().slice(0, 10))
  const [payRef, setPayRef] = useState<string>("")

  const isAdmin = userRole === 'admin'
  const periode = `${annee}-${String(mois).padStart(2, '0')}-01`
  const periodeLabel = libellePeriode(periode)
  const deadline = deadlineMraFromPeriode(periode)

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

  const loadHist = useCallback(async () => {
    if (!societeId) return
    setLoadingHist(true)
    try {
      const r = await fetch(`/api/rh/declarations-mra?societe_id=${societeId}&annee=${annee}`)
      const d = r.ok ? await r.json() : { paye: [], csg: [] }
      setPayeHist(d?.paye || [])
      setCsgHist(d?.csg || [])
    } catch { setPayeHist([]); setCsgHist([]) }
    finally { setLoadingHist(false) }
  }, [societeId, annee])

  useEffect(() => { loadHist() }, [loadHist])

  useEffect(() => { setRecap(null); setFeedback(null) }, [societeId, annee, mois])

  const handleCalculer = useCallback(async () => {
    if (!societeId) return
    setCalculating(true); setFeedback(null); setRecap(null)
    try {
      const r = await fetch('/api/rh/declarations-mra/calculer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: societeId, periode: firstDayOfMonth(periode) }),
      })
      const d = await r.json()
      if (!r.ok) { setFeedback(`❌ ${d.error || 'Erreur'}`); return }
      setRecap(d.recap)
    } catch (e: any) { setFeedback(`❌ ${e?.message}`) }
    finally { setCalculating(false) }
  }, [societeId, periode])

  const handleSauvegarder = useCallback(async () => {
    if (!societeId) return
    setSaving(true); setFeedback(null)
    try {
      const r = await fetch('/api/rh/declarations-mra/sauvegarder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: societeId, periode: firstDayOfMonth(periode), ern: ern || null }),
      })
      const d = await r.json()
      if (!r.ok) { setFeedback(`❌ ${d.error}`); return }
      setFeedback(`✅ Déclarations sauvegardées (${d.recap?.nb_employes || 0} employés)`)
      loadHist()
    } catch (e: any) { setFeedback(`❌ ${e?.message}`) }
    finally { setSaving(false) }
  }, [societeId, periode, ern, loadHist])

  // Récupère les IDs déclarations sauvegardés pour le mois sélectionné
  const declsMois = useMemo(() => {
    const p = firstDayOfMonth(periode)
    return {
      paye: payeHist.find(x => x.periode === p) || null,
      csg: csgHist.find(x => x.periode === p) || null,
    }
  }, [payeHist, csgHist, periode])

  const handleOuvrirPay = useCallback(() => {
    if (!declsMois.paye || !declsMois.csg) {
      setFeedback('❌ Sauvegardez d\'abord la déclaration avant de la marquer payée.')
      return
    }
    setPayDate(now.toISOString().slice(0, 10))
    setPayRef("")
    setShowPayDialog(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [declsMois])

  const handleValiderPay = useCallback(async () => {
    if (!declsMois.paye || !declsMois.csg || !isAdmin) return
    setPaying(true); setFeedback(null)
    try {
      const r = await fetch('/api/rh/declarations-mra/valider-paiement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societe_id: societeId,
          declaration_paye_id: declsMois.paye.id,
          declaration_csg_id: declsMois.csg.id,
          date_paiement: payDate,
          reference_bancaire: payRef,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setFeedback(`❌ ${d.error}`); return }
      setFeedback(`✅ Paiement MRA enregistré. ${(d.ecritures?.length || 0)} écritures générées.`)
      setShowPayDialog(false)
      loadHist()
    } catch (e: any) { setFeedback(`❌ ${e?.message}`) }
    finally { setPaying(false) }
  }, [declsMois, isAdmin, societeId, payDate, payRef, loadHist])

  const MOIS_LABELS = getMoisLabels(locale)
  // ─── Rendu ─────────────────────────────────────────────────────────
  if (authorized === null) {
    return <ClientPageShell><div className="flex items-center gap-2 text-slate-500 p-6">
      <Loader2 className="h-4 w-4 animate-spin" /> {t('rhdiv.decmra.loading', locale)}
    </div></ClientPageShell>
  }
  if (authorized === false) {
    return <ClientPageShell><Card><CardContent className="p-6 flex items-start gap-3">
      <ShieldAlert className="h-5 w-5 text-red-600 mt-1" />
      <div>
        <div className="font-semibold">{t('rhdiv.decmra.access_denied', locale)}</div>
        <div className="text-sm text-slate-600">{t('rhdiv.decmra.access_msg', locale)}</div>
      </div>
    </CardContent></Card></ClientPageShell>
  }

  const joursRestants = Math.ceil(
    (new Date(deadline + 'T12:00:00').getTime() - Date.now()) / (86400 * 1000),
  )

  return (
    <ClientPageShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: NAVY }}>
            <BookOpenCheck className="h-6 w-6" style={{ color: GOLD }} /> {t('rhdiv.decmra.title', locale)}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('rhdiv.decmra.subtitle', locale)}
          </p>
        </div>

        {/* Sélection période */}
        <Card>
          <CardHeader><CardTitle className="text-base">{t('rhdiv.decmra.section_period', locale)}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-5 gap-3">
              <div>
                <Label>{t('rhdiv.decmra.lbl_societe', locale)}</Label>
                <Select value={societeId} onValueChange={setSocieteId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('rhdiv.decmra.lbl_year', locale)}</Label>
                <Select value={String(annee)} onValueChange={v => setAnnee(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[now.getFullYear() - 1, now.getFullYear()].map(y =>
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('rhdiv.decmra.lbl_month', locale)}</Label>
                <Select value={String(mois)} onValueChange={v => setMois(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MOIS_LABELS.map((l, i) =>
                      <SelectItem key={i + 1} value={String(i + 1)}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('rhdiv.decmra.lbl_ern', locale)}</Label>
                <Input value={ern} onChange={e => setErn(e.target.value)} placeholder="E12345678" />
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={handleCalculer} disabled={calculating || !societeId}
                  className="gap-2" style={{ backgroundColor: NAVY, color: 'white' }}>
                  {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                  {t('rhdiv.decmra.btn_calculate', locale)}
                </Button>
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-600 flex items-center gap-2">
              <AlertTriangle className="h-3 w-3 text-amber-600" />
              <span>
                {t('rhdiv.decmra.period_label', locale)} : <strong>{periodeLabel}</strong> · {t('rhdiv.decmra.deadline', locale)} :
                <strong> {deadline}</strong>
                {joursRestants >= 0
                  ? <span className="text-amber-700"> ({t('rhdiv.decmra.in_x_days', locale).replace('{n}', String(joursRestants))})</span>
                  : <span className="text-red-700"> ({t('rhdiv.decmra.overdue_x_days', locale).replace('{n}', String(-joursRestants))})</span>}
              </span>
            </div>
            {feedback && <div className="mt-3 text-sm px-3 py-2 rounded border bg-slate-50">{feedback}</div>}
          </CardContent>
        </Card>

        {/* Récapitulatif */}
        {recap && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>{t('rhdiv.decmra.recap_title', locale)} — {periodeLabel}</span>
                <Button size="sm" variant="outline"
                  onClick={() => setShowDetails(v => !v)}>
                  {showDetails ? t('rhdiv.decmra.hide_detail', locale) : t('rhdiv.decmra.show_detail', locale)}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-3">
                <div className="p-3 rounded border bg-slate-50">
                  <div className="text-xs text-slate-500">{t('rhdiv.decmra.kpi_employees', locale)}</div>
                  <div className="text-xl font-semibold" style={{ color: NAVY }}>{recap.nb_employes}</div>
                </div>
                <div className="p-3 rounded border bg-slate-50">
                  <div className="text-xs text-slate-500">{t('rhdiv.decmra.kpi_payroll', locale)}</div>
                  <div className="text-xl font-semibold" style={{ color: NAVY }}>
                    {formaterMUR(recap.masse_salariale)}
                  </div>
                </div>
                <div className="p-3 rounded border bg-slate-50">
                  <div className="text-xs text-slate-500">{t('rhdiv.decmra.kpi_prgf_eligible', locale)}</div>
                  <div className="text-xl font-semibold text-slate-700">{recap.nb_prgf_eligibles}</div>
                </div>
              </div>

              <div className="border rounded p-3 space-y-1 font-mono text-xs">
                <div className="flex justify-between"><span>{t('rhdiv.decmra.row_paye', locale)}</span><span>{formaterMUR(recap.total_paye)}</span></div>
                <div className="flex justify-between"><span>{t('rhdiv.decmra.row_csg_emp', locale)}</span><span>{formaterMUR(recap.total_csg_salarie)}</span></div>
                <div className="flex justify-between"><span>{t('rhdiv.decmra.row_csg_empr', locale)}</span><span>{formaterMUR(recap.total_csg_patronal)}</span></div>
                <div className="flex justify-between"><span>{t('rhdiv.decmra.row_nsf_emp', locale)}</span><span>{formaterMUR(recap.total_nsf_salarie)}</span></div>
                <div className="flex justify-between"><span>{t('rhdiv.decmra.row_nsf_empr', locale)}</span><span>{formaterMUR(recap.total_nsf_patronal)}</span></div>
                <div className="flex justify-between"><span>{t('rhdiv.decmra.row_levy', locale)}</span><span>{formaterMUR(recap.total_training_levy)}</span></div>
                <div className="flex justify-between"><span>{t('rhdiv.decmra.row_prgf_n_eligible', locale).replace('{n}', String(recap.nb_prgf_eligibles))}</span><span>{formaterMUR(recap.total_prgf)}</span></div>
                <div className="flex justify-between pt-2 border-t-2 border-slate-800 font-sans">
                  <span className="font-semibold">{t('rhdiv.decmra.row_total_mra', locale)}</span>
                  <span className="font-bold text-lg" style={{ color: NAVY }}>
                    {formaterMUR(recap.total_a_remettre_mra)}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleSauvegarder} disabled={saving || recap.nb_employes === 0}
                  className="gap-2" style={{ backgroundColor: NAVY, color: 'white' }}>
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookOpenCheck className="h-3 w-3" />}
                  {t('rhdiv.decmra.btn_save', locale)}
                </Button>
                {declsMois.paye && (
                  <>
                    <a href={`/api/rh/declarations-mra/${declsMois.paye.id}/csv-paye`}
                      target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline" className="gap-2">
                        <FileDown className="h-3 w-3" /> {t('rhdiv.decmra.btn_csv_paye', locale)}
                      </Button>
                    </a>
                    {declsMois.csg && (
                      <a href={`/api/rh/declarations-mra/${declsMois.csg.id}/csv-csg`}
                        target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline" className="gap-2">
                          <FileDown className="h-3 w-3" /> {t('rhdiv.decmra.btn_csv_csg', locale)}
                        </Button>
                      </a>
                    )}
                  </>
                )}
                {isAdmin && declsMois.paye && declsMois.csg && declsMois.csg.statut !== 'paye' && (
                  <Button size="sm" onClick={handleOuvrirPay}
                    className="gap-2" style={{ backgroundColor: GOLD, color: NAVY }}>
                    <BanknoteArrowDown className="h-3 w-3" /> {t('rhdiv.decmra.btn_mark_paid', locale)}
                  </Button>
                )}
              </div>

              {showDetails && recap.details.length > 0 && (
                <div className="overflow-x-auto border rounded">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('rhdiv.decmra.col_employee', locale)}</TableHead>
                        <TableHead>{t('rhdiv.decmra.col_nic', locale)}</TableHead>
                        <TableHead className="text-right">{t('rhdiv.decmra.col_basic', locale)}</TableHead>
                        <TableHead className="text-right">{t('rhdiv.decmra.col_ot', locale)}</TableHead>
                        <TableHead className="text-right">{t('rhdiv.decmra.col_paye', locale)}</TableHead>
                        <TableHead className="text-right">{t('rhdiv.decmra.col_csg_s', locale)}</TableHead>
                        <TableHead className="text-right">{t('rhdiv.decmra.col_csg_p', locale)}</TableHead>
                        <TableHead className="text-right">{t('rhdiv.decmra.col_nsf_s', locale)}</TableHead>
                        <TableHead className="text-right">{t('rhdiv.decmra.col_nsf_p', locale)}</TableHead>
                        <TableHead className="text-right">{t('rhdiv.decmra.col_hrdc', locale)}</TableHead>
                        <TableHead className="text-right">{t('rhdiv.decmra.col_prgf', locale)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recap.details.map(d => (
                        <TableRow key={d.employe_id}>
                          <TableCell className="font-medium">{d.nom}</TableCell>
                          <TableCell className="text-xs">{d.nic || '—'}</TableCell>
                          <TableCell className="text-right">{formaterMUR(d.basic)}</TableCell>
                          <TableCell className="text-right">{formaterMUR(d.overtime)}</TableCell>
                          <TableCell className="text-right">{formaterMUR(d.paye)}</TableCell>
                          <TableCell className="text-right">{formaterMUR(d.csg_salarie)}</TableCell>
                          <TableCell className="text-right">{formaterMUR(d.csg_patronal)}</TableCell>
                          <TableCell className="text-right">{formaterMUR(d.nsf_salarie)}</TableCell>
                          <TableCell className="text-right">{formaterMUR(d.nsf_patronal)}</TableCell>
                          <TableCell className="text-right">{formaterMUR(d.training_levy)}</TableCell>
                          <TableCell className="text-right">
                            {d.prgf_eligible
                              ? formaterMUR(d.prgf)
                              : <span className="text-xs text-slate-500 italic">
                                  {PRGF_EXEMPTION_LABELS[d.prgf_motif_exemption || ''] || t('rhdiv.decmra.col_exempt', locale)}
                                </span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Dialog paiement */}
        {showPayDialog && (
          <Card className="border-2" style={{ borderColor: GOLD }}>
            <CardHeader><CardTitle className="text-base">{t('rhdiv.decmra.pay_dialog_title', locale)}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>{t('rhdiv.decmra.lbl_pay_date', locale)}</Label>
                  <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
                </div>
                <div>
                  <Label>{t('rhdiv.decmra.lbl_bank_ref', locale)}</Label>
                  <Input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="VIR-XXXX" />
                </div>
              </div>
              <div className="text-xs text-slate-600">
                {t('rhdiv.decmra.entries_intro', locale)}
                <ul className="list-disc pl-5 mt-1">
                  <li>PAYE : D 444 / C 512</li>
                  <li>CSG + NSF : D 431 / C 512</li>
                  <li>Training Levy + PRGF : D 432 / C 512</li>
                </ul>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleValiderPay} disabled={paying}
                  style={{ backgroundColor: GOLD, color: NAVY }} className="gap-2">
                  {paying ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  {t('rhdiv.decmra.btn_validate_pay', locale)}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowPayDialog(false)}>{t('rhdiv.decmra.btn_cancel', locale)}</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Historique */}
        <Card>
          <CardHeader><CardTitle className="text-base">{t('rhdiv.decmra.history_title', locale).replace('{year}', String(annee))}</CardTitle></CardHeader>
          <CardContent>
            {loadingHist ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('rhdiv.decmra.loading', locale)}
              </div>
            ) : payeHist.length === 0 && csgHist.length === 0 ? (
              <div className="text-sm text-slate-500 italic">{t('rhdiv.decmra.no_history', locale).replace('{year}', String(annee))}</div>
            ) : (
              <div className="overflow-x-auto border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('rhdiv.decmra.col_month', locale)}</TableHead>
                      <TableHead className="text-right">{t('rhdiv.decmra.col_paye', locale)}</TableHead>
                      <TableHead className="text-right">{t('rhdiv.decmra.col_csg_full', locale)}</TableHead>
                      <TableHead className="text-right">{t('rhdiv.decmra.col_total', locale)}</TableHead>
                      <TableHead>{t('rhdiv.decmra.col_status', locale)}</TableHead>
                      <TableHead>{t('rhdiv.decmra.col_deadline', locale)}</TableHead>
                      <TableHead>{t('rhdiv.decmra.col_paid_on', locale)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payeHist.map(paye => {
                      const csg = csgHist.find(c => c.periode === paye.periode)
                      const totalCsg = csg
                        ? csg.total_csg_salarie + csg.total_csg_patronal + csg.total_nsf_salarie
                          + csg.total_nsf_patronal + csg.total_training_levy + csg.total_prgf
                        : 0
                      const totalMois = paye.total_paye_retenu + totalCsg
                      return (
                        <TableRow key={paye.id}>
                          <TableCell>{libellePeriode(paye.periode)}</TableCell>
                          <TableCell className="text-right font-mono">{formaterMUR(paye.total_paye_retenu)}</TableCell>
                          <TableCell className="text-right font-mono">{formaterMUR(totalCsg)}</TableCell>
                          <TableCell className="text-right font-semibold" style={{ color: NAVY }}>
                            {formaterMUR(totalMois)}
                          </TableCell>
                          <TableCell><StatutBadge statut={paye.statut} /></TableCell>
                          <TableCell className="text-xs">{paye.date_limite || '—'}</TableCell>
                          <TableCell className="text-xs">{paye.date_paiement || '—'}</TableCell>
                        </TableRow>
                      )
                    })}
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
              <FileText className="h-3 w-3" /> {t('rhdiv.decmra.reminder_title', locale)}
            </div>
            <div>
              {t('rhdiv.decmra.reminder_body', locale)}
            </div>
          </CardContent>
        </Card>
      </div>
    </ClientPageShell>
  )
}

function StatutBadge({ statut }: { statut: StatutDeclarationMra }) {
  const cfg: Record<StatutDeclarationMra, { bg: string; color: string }> = {
    brouillon: { bg: '#e5e7eb', color: '#1f2937' },
    calcule: { bg: '#dbeafe', color: '#1e40af' },
    declare: { bg: '#fef3c7', color: '#92400e' },
    paye: { bg: '#dcfce7', color: '#166534' },
    annule: { bg: '#fee2e2', color: '#991b1b' },
  }
  const c = cfg[statut] || cfg.brouillon
  return (
    <Badge style={{ backgroundColor: c.bg, color: c.color }} className="font-normal">
      {STATUT_MRA_LABELS[statut] || statut}
    </Badge>
  )
}
