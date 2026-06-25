"use client"

/**
 * /admin/lexora-billing — facturation Lexora (DDS Ltd → clients SaaS).
 *
 * KPIs en haut, table des factures avec actions :
 *  - Voir PDF
 *  - Marquer payée
 *  - Annuler
 *  - Relancer (modal multi-canal)
 *
 * Onglet dédié pour le rapprochement bancaire (Sprint 3) et un bouton
 * vers les paramètres émetteur (DDS).
 */

import { useEffect, useState, useMemo, useCallback } from "react"
import Link from "next/link"
import { Loader2, FileText, CheckCircle2, AlertCircle, Send, X, Eye, Settings, Repeat, Plus } from "lucide-react"
import { t, getLocale, type Locale } from "@/lib/i18n"

type Status = 'brouillon' | 'emise' | 'partiellement_payee' | 'payee' | 'en_retard' | 'annulee'

interface Invoice {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  amount_ht: number
  tva_amount: number
  amount_ttc: number
  amount_paid: number
  devise: string
  status: Status
  paid_at: string | null
  customer_snapshot: any
  bank_transaction_id: string | null
  accounting_entry_ref: string | null
  notes: string | null
}

interface Stats {
  total: number; total_ttc: number; paid_ttc: number; unpaid_ttc: number; overdue_count: number
}

const STATUS_COLORS: Record<Status, { bg: string; text: string; key: string }> = {
  brouillon:            { bg: '#F3F4F6', text: '#374151', key: 'adm3.bill.status_brouillon' },
  emise:                { bg: '#DBEAFE', text: '#1E40AF', key: 'adm3.bill.status_emise' },
  partiellement_payee:  { bg: '#FEF3C7', text: '#92400E', key: 'adm3.bill.status_partielle' },
  payee:                { bg: '#D1FAE5', text: '#065F46', key: 'adm3.bill.status_payee' },
  en_retard:            { bg: '#FEE2E2', text: '#991B1B', key: 'adm3.bill.status_en_retard' },
  annulee:              { bg: '#E5E7EB', text: '#4B5563', key: 'adm3.bill.status_annulee' },
}

function statusLabel(status: Status, locale: Locale) {
  return t(STATUS_COLORS[status].key, locale)
}

function fmt(n: number, devise = 'MUR') {
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)} ${devise}`
}

export default function LexoraBillingPage() {
  const locale = getLocale()
  const [loading, setLoading] = useState(true)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [filter, setFilter] = useState<Status | 'all'>('all')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Dialogs
  const [dunningOpen, setDunningOpen] = useState<Invoice | null>(null)
  const [dunningChannels, setDunningChannels] = useState<string[]>(['email'])
  const [dunningSending, setDunningSending] = useState(false)
  const [dunningResults, setDunningResults] = useState<any[] | null>(null)

  const [payOpen, setPayOpen] = useState<Invoice | null>(null)
  const [payRef, setPayRef] = useState('')
  const [paySaving, setPaySaving] = useState(false)

  const [emitOpen, setEmitOpen] = useState(false)
  const [emitSocietes, setEmitSocietes] = useState<Array<{ id: string; nom: string; brn: string | null }>>([])
  const [emitPlans, setEmitPlans] = useState<Array<{ id: string; nom: string; code: string; prix_mensuel_mur: number; prix_annuel_mur: number | null; type_cible: string }>>([])
  const [emitForm, setEmitForm] = useState({ societe_id: '', plan_id: '', periodicite: 'mensuelle', tarif_ht_mur: '', designation: '', invoice_date: '' })
  const [emitSaving, setEmitSaving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') params.set('status', filter)
      if (search) params.set('q', search)
      const res = await fetch(`/api/admin/lexora-billing?${params}`, { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || t('adm3.bill.err_generic', locale))
      setInvoices(j.invoices || [])
      setStats(j.stats || null)
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || t('adm3.bill.err_generic', locale) })
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { if (message) { const timer = setTimeout(() => setMessage(null), 5000); return () => clearTimeout(timer) } }, [message])

  const triggerDunning = async () => {
    if (!dunningOpen) return
    setDunningSending(true); setDunningResults(null)
    try {
      const res = await fetch(`/api/admin/lexora-billing/${dunningOpen.id}/dunning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: dunningChannels, stage: 'manual' }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || t('adm3.bill.err_generic', locale))
      setDunningResults(j.results)
      setMessage({ type: 'success', text: `${dunningChannels.length} ${t('adm3.bill.toast_dun_channels_a', locale)} ${t('adm3.bill.toast_dun_channels_b', locale)}` })
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || t('adm3.bill.err_generic', locale) })
    } finally {
      setDunningSending(false)
    }
  }

  const markPaid = async () => {
    if (!payOpen) return
    setPaySaving(true)
    try {
      const res = await fetch(`/api/admin/lexora-billing/${payOpen.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_paid', payment_reference: payRef, payment_method: 'virement' }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || t('adm3.bill.err_generic', locale))
      setMessage({ type: 'success', text: t('adm3.bill.toast_paid', locale) })
      setPayOpen(null); setPayRef('')
      fetchData()
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || t('adm3.bill.err_generic', locale) })
    } finally {
      setPaySaving(false)
    }
  }

  const openEmit = async () => {
    setEmitOpen(true); setEmitSaving(false)
    setEmitForm({ societe_id: '', plan_id: '', periodicite: 'mensuelle', tarif_ht_mur: '', designation: '', invoice_date: new Date().toISOString().slice(0, 10) })
    try {
      const [socRes, planRes] = await Promise.all([
        fetch('/api/admin/societes', { cache: 'no-store' }),
        fetch('/api/admin/plans', { cache: 'no-store' }),
      ])
      const socJ = await socRes.json(); const planJ = await planRes.json()
      setEmitSocietes((socJ.societes || socJ.data || []).map((s: any) => ({ id: s.id, nom: s.nom, brn: s.brn })).sort((a: any, b: any) => a.nom.localeCompare(b.nom)))
      setEmitPlans((planJ.plans || []).filter((p: any) => p.actif))
    } catch {
      setEmitSocietes([]); setEmitPlans([])
    }
  }

  const submitEmit = async () => {
    if (!emitForm.societe_id) { setMessage({ type: 'error', text: t('adm3.bill.toast_select_company', locale) }); return }
    if (!emitForm.plan_id && !emitForm.tarif_ht_mur) { setMessage({ type: 'error', text: t('adm3.bill.toast_plan_or_rate', locale) }); return }
    setEmitSaving(true)
    try {
      const res = await fetch('/api/admin/lexora-billing/emit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societe_id: emitForm.societe_id,
          plan_id: emitForm.plan_id || undefined,
          periodicite: emitForm.periodicite,
          tarif_ht_mur: emitForm.tarif_ht_mur ? Number(emitForm.tarif_ht_mur) : undefined,
          designation: emitForm.designation || undefined,
          invoice_date: emitForm.invoice_date || undefined,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || t('adm3.bill.err_generic', locale))
      setMessage({ type: 'success', text: j.reused ? t('adm3.bill.toast_invoice_reused', locale) : `${t('adm3.bill.toast_invoice_created_a', locale)} ${j.invoice?.invoice_number} ${t('adm3.bill.toast_invoice_created_b', locale)}` })
      setEmitOpen(false); fetchData()
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || t('adm3.bill.err_generic', locale) })
    } finally {
      setEmitSaving(false)
    }
  }

  const cancel = async (inv: Invoice) => {
    if (!confirm(`${t('adm3.bill.confirm_cancel_a', locale)} ${inv.invoice_number} ?`)) return
    const res = await fetch(`/api/admin/lexora-billing/${inv.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    })
    if (res.ok) { setMessage({ type: 'success', text: t('adm3.bill.toast_cancelled', locale) }); fetchData() }
    else { const j = await res.json(); setMessage({ type: 'error', text: j.error }) }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0B0F2E' }}>{t('adm3.bill.title', locale)}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('adm3.bill.subtitle', locale)}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openEmit}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-sm" style={{ backgroundColor: '#D4AF37', color: '#0B0F2E' }}>
            <Plus className="h-4 w-4" /> {t('adm3.bill.emit_invoice', locale)}
          </button>
          <Link href="/admin/lexora-billing/rapprochement"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm">
            <Repeat className="h-4 w-4" /> {t('adm3.bill.reconcile', locale)}
          </Link>
          <Link href="/admin/lexora-billing/parametres"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: '#0B0F2E', color: 'white' }}>
            <Settings className="h-4 w-4" /> {t('adm3.bill.issuer_settings', locale)}
          </Link>
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500">{t('adm3.bill.kpi_total', locale)}</p>
            <p className="text-xl font-bold mt-1" style={{ color: '#0B0F2E' }}>{fmt(stats.total_ttc)}</p>
            <p className="text-xs text-gray-400 mt-1">{stats.total} {t('adm3.bill.kpi_invoices_suffix', locale)}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500">{t('adm3.bill.kpi_collected', locale)}</p>
            <p className="text-xl font-bold mt-1 text-green-700">{fmt(stats.paid_ttc)}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500">{t('adm3.bill.kpi_unpaid', locale)}</p>
            <p className="text-xl font-bold mt-1 text-amber-700">{fmt(stats.unpaid_ttc)}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500">{t('adm3.bill.kpi_overdue', locale)}</p>
            <p className="text-xl font-bold mt-1 text-red-700">{stats.overdue_count}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(['all','emise','partiellement_payee','payee','en_retard','annulee'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${filter === s ? 'bg-[#0B0F2E] text-white border-[#0B0F2E]' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
            {s === 'all' ? t('adm3.bill.filter_all', locale) : statusLabel(s as Status, locale)}
          </button>
        ))}
        <input type="text" placeholder={t('adm3.bill.search_placeholder', locale)} value={search} onChange={e => setSearch(e.target.value)}
               className="ml-auto px-3 py-1.5 rounded-lg border text-sm w-64" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
          <p>{t('adm3.bill.empty', locale)}</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-600">{t('adm3.bill.th_number', locale)}</th>
                <th className="px-4 py-3 font-semibold text-gray-600">{t('adm3.bill.th_date', locale)}</th>
                <th className="px-4 py-3 font-semibold text-gray-600">{t('adm3.bill.th_client', locale)}</th>
                <th className="px-4 py-3 font-semibold text-gray-600">{t('adm3.bill.th_due', locale)}</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-right">{t('adm3.bill.th_amount_ttc', locale)}</th>
                <th className="px-4 py-3 font-semibold text-gray-600">{t('adm3.bill.th_status', locale)}</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-right">{t('adm3.bill.th_actions', locale)}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const s = STATUS_COLORS[inv.status]
                return (
                  <tr key={inv.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-gray-600">{inv.invoice_date}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{inv.customer_snapshot?.nom || '—'}</p>
                      {inv.customer_snapshot?.dirigeant_nom && (
                        <p className="text-xs text-gray-500">{inv.customer_snapshot.dirigeant_nom}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{inv.due_date}</td>
                    <td className="px-4 py-3 text-right font-semibold">{fmt(inv.amount_ttc, inv.devise)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: s.bg, color: s.text }}>
                        {statusLabel(inv.status, locale)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <a href={`/api/admin/lexora-billing/${inv.id}/pdf`} target="_blank" rel="noopener"
                           className="p-1.5 rounded hover:bg-gray-100" title={t('adm3.bill.action_view_pdf', locale)}>
                          <Eye className="h-4 w-4" />
                        </a>
                        {inv.status !== 'payee' && inv.status !== 'annulee' && (
                          <>
                            <button onClick={() => { setDunningOpen(inv); setDunningResults(null) }}
                                    className="p-1.5 rounded hover:bg-gray-100" title={t('adm3.bill.action_dun', locale)}>
                              <Send className="h-4 w-4 text-amber-600" />
                            </button>
                            <button onClick={() => setPayOpen(inv)}
                                    className="p-1.5 rounded hover:bg-gray-100" title={t('adm3.bill.action_mark_paid', locale)}>
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            </button>
                            <button onClick={() => cancel(inv)}
                                    className="p-1.5 rounded hover:bg-gray-100" title={t('adm3.bill.action_cancel', locale)}>
                              <X className="h-4 w-4 text-red-600" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dunning dialog */}
      {dunningOpen && (
        <Modal onClose={() => setDunningOpen(null)} title={`${t('adm3.bill.dun_title', locale)} ${dunningOpen.invoice_number}`}>
          <p className="text-sm text-gray-600 mb-4">{t('adm3.bill.dun_help', locale)}</p>
          <div className="space-y-2 mb-4">
            {[
              { id: 'email', label: t('adm3.bill.dun_email', locale), ok: true },
              { id: 'telegram', label: t('adm3.bill.dun_telegram', locale), ok: true },
              { id: 'sms', label: t('adm3.bill.dun_sms', locale), ok: !!process.env.NEXT_PUBLIC_TWILIO_ENABLED },
              { id: 'whatsapp', label: t('adm3.bill.dun_whatsapp', locale), ok: !!process.env.NEXT_PUBLIC_TWILIO_ENABLED },
            ].map(c => (
              <label key={c.id} className="flex items-center gap-2 p-2 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={dunningChannels.includes(c.id)}
                       onChange={e => setDunningChannels(prev => e.target.checked ? [...prev, c.id] : prev.filter(x => x !== c.id))} />
                <span className="text-sm">{c.label}</span>
                {!c.ok && <span className="ml-auto text-xs text-amber-600">{t('adm3.bill.dun_stub', locale)}</span>}
              </label>
            ))}
          </div>
          {dunningResults && (
            <div className="mb-4 p-3 bg-gray-50 rounded-lg text-xs space-y-1">
              {dunningResults.map((r, i) => (
                <div key={i} className="flex justify-between">
                  <span>{r.channel} → {r.recipient || '—'}</span>
                  <span className={r.status === 'sent' ? 'text-green-700' : r.status === 'skipped' ? 'text-gray-500' : 'text-red-700'}>
                    {r.status}{r.error ? ` — ${r.error}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setDunningOpen(null)} className="px-3 py-2 rounded-lg border text-sm">{t('adm3.bill.close', locale)}</button>
            <button onClick={triggerDunning} disabled={dunningSending || dunningChannels.length === 0}
                    className="px-3 py-2 rounded-lg text-sm text-white" style={{ backgroundColor: '#D4AF37', color: '#0B0F2E' }}>
              {dunningSending ? <Loader2 className="h-4 w-4 animate-spin inline" /> : t('adm3.bill.send', locale)}
            </button>
          </div>
        </Modal>
      )}

      {/* Emit-invoice dialog */}
      {emitOpen && (
        <Modal onClose={() => setEmitOpen(false)} title={t('adm3.bill.emit_title', locale)}>
          <div className="space-y-3">
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">{t('adm3.bill.emit_company', locale)}</span>
              <select value={emitForm.societe_id} onChange={e => setEmitForm({ ...emitForm, societe_id: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">{t('adm3.bill.emit_choose', locale)}</option>
                {emitSocietes.map(s => <option key={s.id} value={s.id}>{s.nom}{s.brn ? ` (${s.brn})` : ''}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">{t('adm3.bill.emit_plan', locale)}</span>
              <select value={emitForm.plan_id} onChange={e => {
                const p = emitPlans.find(x => x.id === e.target.value)
                const period = emitForm.periodicite as 'mensuelle' | 'annuelle'
                const price = p ? (period === 'annuelle' ? (p.prix_annuel_mur || 0) : p.prix_mensuel_mur) : 0
                setEmitForm({ ...emitForm, plan_id: e.target.value, tarif_ht_mur: price ? String(price) : emitForm.tarif_ht_mur })
              }} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">{t('adm3.bill.emit_plan_none', locale)}</option>
                {emitPlans.map(p => <option key={p.id} value={p.id}>{p.nom} — {p.prix_mensuel_mur.toLocaleString('fr-FR')} {t('adm3.bill.emit_plan_per_month', locale)}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">{t('adm3.bill.emit_periodicity', locale)}</span>
                <select value={emitForm.periodicite} onChange={e => setEmitForm({ ...emitForm, periodicite: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="mensuelle">{t('adm3.bill.emit_monthly', locale)}</option>
                  <option value="annuelle">{t('adm3.bill.emit_annual', locale)}</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">{t('adm3.bill.emit_rate_ht', locale)}</span>
                <input type="number" value={emitForm.tarif_ht_mur} onChange={e => setEmitForm({ ...emitForm, tarif_ht_mur: e.target.value })}
                       className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0" />
              </label>
            </div>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">{t('adm3.bill.emit_designation', locale)}</span>
              <input type="text" value={emitForm.designation} onChange={e => setEmitForm({ ...emitForm, designation: e.target.value })}
                     className="w-full px-3 py-2 border rounded-lg text-sm" placeholder={t('adm3.bill.emit_designation_ph', locale)} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">{t('adm3.bill.emit_date', locale)}</span>
              <input type="date" value={emitForm.invoice_date} onChange={e => setEmitForm({ ...emitForm, invoice_date: e.target.value })}
                     className="w-full px-3 py-2 border rounded-lg text-sm" />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setEmitOpen(false)} className="px-3 py-2 rounded-lg border text-sm">{t('adm3.bill.cancel', locale)}</button>
            <button onClick={submitEmit} disabled={emitSaving}
                    className="px-3 py-2 rounded-lg text-sm font-semibold" style={{ backgroundColor: '#D4AF37', color: '#0B0F2E' }}>
              {emitSaving ? <Loader2 className="h-4 w-4 animate-spin inline" /> : t('adm3.bill.emit_submit', locale)}
            </button>
          </div>
        </Modal>
      )}

      {/* Mark-paid dialog */}
      {payOpen && (
        <Modal onClose={() => setPayOpen(null)} title={`${t('adm3.bill.pay_title_a', locale)} ${payOpen.invoice_number} ${t('adm3.bill.pay_title_b', locale)}`}>
          <p className="text-sm text-gray-600 mb-3">
            {t('adm3.bill.pay_amount_label', locale)} <strong>{fmt(payOpen.amount_ttc, payOpen.devise)}</strong>. {t('adm3.bill.pay_desc', locale)}
          </p>
          <label className="block text-sm mb-1">{t('adm3.bill.pay_ref_label', locale)}</label>
          <input type="text" value={payRef} onChange={e => setPayRef(e.target.value)}
                 className="w-full px-3 py-2 border rounded-lg text-sm mb-4" placeholder="REF-2026-…" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setPayOpen(null)} className="px-3 py-2 rounded-lg border text-sm">{t('adm3.bill.cancel', locale)}</button>
            <button onClick={markPaid} disabled={paySaving}
                    className="px-3 py-2 rounded-lg text-sm text-white bg-green-700">
              {paySaving ? <Loader2 className="h-4 w-4 animate-spin inline" /> : t('adm3.bill.pay_confirm', locale)}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg" style={{ color: '#0B0F2E' }}>{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
