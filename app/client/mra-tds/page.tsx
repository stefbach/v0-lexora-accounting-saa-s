"use client"
import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, Download, AlertTriangle, CheckCircle2, Clock, FileSpreadsheet } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'
import { t, getLocale, type Locale } from '@/lib/i18n'

const NAVY = '#0B0F2E'
const fmt = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(n)) + ' MUR'

const typeLabel = (locale: Locale): Record<string, string> => ({
  PAYE: 'PAYE', CSG: 'CSG', NSF: 'NSF', TDS: t('cmra.tds.type_tds', locale), TVA: 'TVA',
  CIT: t('cmra.tds.type_cit', locale), APS: t('cmra.tds.type_aps', locale), IT_FORM3: 'IT Form 3',
})
const prioStyle = (locale: Locale): Record<string, { bg: string; label: string }> => ({
  retard:  { bg: 'bg-red-100 text-red-800 border-red-300',          label: t('cmra.tds.prio_retard', locale) },
  urgent:  { bg: 'bg-orange-100 text-orange-800 border-orange-300', label: t('cmra.tds.prio_urgent', locale) },
  bientot: { bg: 'bg-amber-100 text-amber-800 border-amber-300',    label: t('cmra.tds.prio_bientot', locale) },
  futur:   { bg: 'bg-slate-100 text-slate-700 border-slate-300',    label: t('cmra.tds.prio_futur', locale) },
  declare: { bg: 'bg-blue-100 text-blue-800 border-blue-300',       label: t('cmra.tds.prio_declare', locale) },
  paye:    { bg: 'bg-emerald-100 text-emerald-800 border-emerald-300', label: t('cmra.tds.prio_paye', locale) },
  sans_objet: { bg: 'bg-gray-50 text-gray-400 border-gray-200',     label: '—' },
})

export default function MraTdsPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string>('')

  const load = useCallback(async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const r = await fetch(`/api/client/mra/dashboard?societe_id=${societeId}`)
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'Erreur'); setData(null) }
      else setData(j)
    } catch (e: any) { setError(e?.message || 'Erreur') }
    finally { setLoading(false) }
  }, [societeId])

  useEffect(() => { load() }, [load])

  async function action(decl: any, act: 'declarer' | 'payer' | 'reset') {
    if (act === 'reset' && !confirm(t('cmra.tds.confirm_reset', locale))) return
    setBusy(decl.id)
    try {
      const r = await fetch(`/api/client/mra/declaration/${decl.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: act }),
      })
      const j = await r.json()
      if (!r.ok) alert(t('cmra.tds.err_prefix', locale) + (j.error || r.status))
      await load()
    } catch (e: any) { alert(t('cmra.tds.err_network', locale) + (e?.message || '')) }
    finally { setBusy('') }
  }

  function bordereau(decl: any, format: 'csv' | 'xlsx') {
    if (!societeId) return
    if (!['PAYE', 'CSG', 'NSF', 'TDS'].includes(decl.type)) { alert(t('cmra.tds.bordereau_na', locale)); return }
    window.location.href = `/api/client/mra/bordereau?societe_id=${societeId}&type=${decl.type}&periode=${decl.periode}&format=${format}`
  }

  async function scanTds() {
    if (!societeId) return
    setBusy('tds-scan')
    try {
      const r = await fetch('/api/client/mra/tds-scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: societeId, only_missing: true }),
      })
      const j = await r.json()
      if (!r.ok) { alert(t('cmra.tds.err_prefix', locale) + (j.error || r.status)); return }
      alert(`🔎 ${j.scanned} ${t('cmra.tds.scan_result_a', locale)} ${j.applied} ${t('cmra.tds.scan_result_b', locale)} ${j.total_tds} MUR.`)
      await load()
    } catch (e: any) { alert(t('cmra.tds.err_network', locale) + (e?.message || '')) }
    finally { setBusy('') }
  }

  const TYPE_LABEL = typeLabel(locale)
  const PRIO_STYLE = prioStyle(locale)

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('cmra.tds.no_societe', locale)}</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> {t('cmra.tds.loading', locale)}</div>

  const k = data?.kpis || {}
  const groups = data?.groups || {}
  const prochaine = data?.prochaine_echeance
  const ordered = ['retard', 'urgent', 'bientot', 'futur', 'done']
  const titleMap: Record<string, string> = {
    retard: `🔴 ${t('cmra.tds.group_retard', locale)}`, urgent: `🟠 ${t('cmra.tds.group_urgent', locale)}`, bientot: `🟡 ${t('cmra.tds.group_bientot', locale)}`,
    futur: `⚪ ${t('cmra.tds.group_futur', locale)}`, done: `✅ ${t('cmra.tds.group_done', locale)}`,
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>{t('cmra.tds.title', locale)}</h1>
          <p className="text-sm text-slate-500">{t('cmra.tds.subtitle', locale)}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={scanTds} variant="outline" disabled={busy === 'tds-scan'}>
            {busy === 'tds-scan' ? '…' : `🔎 ${t('cmra.tds.detect_tds', locale)}`}
          </Button>
          <Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />{t('cmra.tds.refresh', locale)}</Button>
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-amber-500"><CardContent className="p-4">
          <p className="text-xs text-gray-400">{t('cmra.tds.kpi_to_process', locale)}</p>
          <p className="text-2xl font-bold text-amber-600">{k.total_a_traiter ?? 0}</p>
          <p className="text-xs text-gray-400 mt-1">{t('cmra.tds.kpi_to_process_sub', locale)}</p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-red-500"><CardContent className="p-4">
          <p className="text-xs text-gray-400">{t('cmra.tds.kpi_overdue', locale)}</p>
          <p className="text-2xl font-bold text-red-600">{k.nb_retard ?? 0}</p>
          <p className="text-xs text-gray-400 mt-1">{fmt(k.montant_retard)}</p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4">
          <p className="text-xs text-gray-400">{t('cmra.tds.kpi_total_due', locale)}</p>
          <p className="text-2xl font-bold text-blue-600">{fmt(k.montant_du)}</p>
          <p className="text-xs text-gray-400 mt-1">{t('cmra.tds.kpi_total_due_sub', locale)}</p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-violet-500"><CardContent className="p-4">
          <p className="text-xs text-gray-400">{t('cmra.tds.kpi_next', locale)}</p>
          {prochaine ? (
            <>
              <p className="text-lg font-bold text-violet-700">{TYPE_LABEL[prochaine.type] || prochaine.type} {prochaine.periode}</p>
              <p className="text-xs text-gray-400 mt-1">{prochaine.date_echeance} · {prochaine.jours_restants}j · {fmt(prochaine.montant_du)}</p>
            </>
          ) : <p className="text-sm text-gray-400 mt-2">{t('cmra.tds.nothing_upcoming', locale)} 🎉</p>}
        </CardContent></Card>
      </div>

      {ordered.map(g => {
        const rows = (groups[g] || []) as any[]
        if (!rows.length) return null
        return (
          <div key={g} className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-600">{titleMap[g]} <span className="text-gray-400">({rows.length})</span></h2>
            <Card><CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">{t('cmra.tds.col_obligation', locale)}</th>
                    <th className="px-3 py-2 text-left">{t('cmra.tds.col_period', locale)}</th>
                    <th className="px-3 py-2 text-left">{t('cmra.tds.col_deadline', locale)}</th>
                    <th className="px-3 py-2 text-right">{t('cmra.tds.col_amount_due', locale)}</th>
                    <th className="px-3 py-2 text-center">{t('cmra.tds.col_status', locale)}</th>
                    <th className="px-3 py-2 text-center">{t('cmra.tds.col_bordereau', locale)}</th>
                    <th className="px-3 py-2 text-center">{t('cmra.tds.col_actions', locale)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map(d => {
                    const st = PRIO_STYLE[d.priorite] || PRIO_STYLE[d.statut] || PRIO_STYLE.futur
                    return (
                      <tr key={d.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{TYPE_LABEL[d.type] || d.type}</td>
                        <td className="px-3 py-2 text-gray-600">{d.periode}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {d.date_echeance}
                          {typeof d.jours_restants === 'number' && d.statut !== 'paye' && (
                            <span className="text-xs text-gray-400 ml-1">({d.jours_restants}j)</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(d.montant_du)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-[11px] px-2 py-0.5 rounded border ${st.bg}`}>{st.label}</span>
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          {['PAYE', 'CSG', 'NSF', 'TDS'].includes(d.type) && Number(d.montant_du) > 0 ? (
                            <span className="inline-flex gap-1">
                              <button onClick={() => bordereau(d, 'xlsx')} title={t('cmra.tds.title_excel', locale)} className="text-emerald-600 hover:text-emerald-800"><FileSpreadsheet className="h-4 w-4" /></button>
                              <button onClick={() => bordereau(d, 'csv')} title={t('cmra.tds.title_csv', locale)} className="text-blue-600 hover:text-blue-800"><Download className="h-4 w-4" /></button>
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          {d.statut === 'paye' ? (
                            <button onClick={() => action(d, 'reset')} disabled={busy === d.id} className="text-[11px] text-gray-400 hover:text-gray-600">{t('cmra.tds.btn_cancel', locale)}</button>
                          ) : d.statut === 'sans_objet' ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <span className="inline-flex gap-1">
                              {d.statut !== 'declare' && (
                                <button onClick={() => action(d, 'declarer')} disabled={busy === d.id}
                                  className="text-[11px] px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                                  {busy === d.id ? '…' : t('cmra.tds.btn_declare', locale)}
                                </button>
                              )}
                              <button onClick={() => action(d, 'payer')} disabled={busy === d.id}
                                className="text-[11px] px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                                {busy === d.id ? '…' : t('cmra.tds.btn_pay', locale)}
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent></Card>
          </div>
        )
      })}

      {data && (data.declarations || []).length === 0 && (
        <p className="text-center text-gray-400 py-8">{t('cmra.tds.empty_all', locale)}</p>
      )}
    </div>
  )
}
