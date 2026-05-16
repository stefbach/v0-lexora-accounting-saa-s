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
import { Loader2, FileText, CheckCircle2, AlertCircle, Send, X, Eye, Settings, Repeat } from "lucide-react"

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

const STATUS_COLORS: Record<Status, { bg: string; text: string; label: string }> = {
  brouillon:            { bg: '#F3F4F6', text: '#374151', label: 'Brouillon' },
  emise:                { bg: '#DBEAFE', text: '#1E40AF', label: 'Émise' },
  partiellement_payee:  { bg: '#FEF3C7', text: '#92400E', label: 'Partielle' },
  payee:                { bg: '#D1FAE5', text: '#065F46', label: 'Payée' },
  en_retard:            { bg: '#FEE2E2', text: '#991B1B', label: 'En retard' },
  annulee:              { bg: '#E5E7EB', text: '#4B5563', label: 'Annulée' },
}

function fmt(n: number, devise = 'MUR') {
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)} ${devise}`
}

export default function LexoraBillingPage() {
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

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') params.set('status', filter)
      if (search) params.set('q', search)
      const res = await fetch(`/api/admin/lexora-billing?${params}`, { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Erreur')
      setInvoices(j.invoices || [])
      setStats(j.stats || null)
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Erreur' })
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { if (message) { const t = setTimeout(() => setMessage(null), 5000); return () => clearTimeout(t) } }, [message])

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
      if (!res.ok) throw new Error(j.error || 'Erreur')
      setDunningResults(j.results)
      setMessage({ type: 'success', text: `${dunningChannels.length} canal(canaux) déclenché(s)` })
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Erreur' })
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
      if (!res.ok) throw new Error(j.error || 'Erreur')
      setMessage({ type: 'success', text: 'Facture marquée payée + écriture compta créée.' })
      setPayOpen(null); setPayRef('')
      fetchData()
    } catch (e: any) {
      setMessage({ type: 'error', text: e?.message || 'Erreur' })
    } finally {
      setPaySaving(false)
    }
  }

  const cancel = async (inv: Invoice) => {
    if (!confirm(`Annuler la facture ${inv.invoice_number} ?`)) return
    const res = await fetch(`/api/admin/lexora-billing/${inv.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    })
    if (res.ok) { setMessage({ type: 'success', text: 'Annulée.' }); fetchData() }
    else { const j = await res.json(); setMessage({ type: 'error', text: j.error }) }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0B0F2E' }}>Facturation Lexora</h1>
          <p className="text-sm text-gray-500 mt-1">Factures émises par Digital Data Solutions Ltd aux clients SaaS.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/lexora-billing/rapprochement"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm">
            <Repeat className="h-4 w-4" /> Rapprochement
          </Link>
          <Link href="/admin/lexora-billing/parametres"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: '#0B0F2E', color: 'white' }}>
            <Settings className="h-4 w-4" /> Paramètres émetteur
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
            <p className="text-xs uppercase tracking-wider text-gray-500">Total facturé</p>
            <p className="text-xl font-bold mt-1" style={{ color: '#0B0F2E' }}>{fmt(stats.total_ttc)}</p>
            <p className="text-xs text-gray-400 mt-1">{stats.total} facture(s)</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500">Encaissé</p>
            <p className="text-xl font-bold mt-1 text-green-700">{fmt(stats.paid_ttc)}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500">Impayé</p>
            <p className="text-xl font-bold mt-1 text-amber-700">{fmt(stats.unpaid_ttc)}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500">En retard</p>
            <p className="text-xl font-bold mt-1 text-red-700">{stats.overdue_count}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(['all','emise','partiellement_payee','payee','en_retard','annulee'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${filter === s ? 'bg-[#0B0F2E] text-white border-[#0B0F2E]' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
            {s === 'all' ? 'Toutes' : STATUS_COLORS[s as Status].label}
          </button>
        ))}
        <input type="text" placeholder="Recherche N° facture…" value={search} onChange={e => setSearch(e.target.value)}
               className="ml-auto px-3 py-1.5 rounded-lg border text-sm w-64" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
          <p>Aucune facture pour ce filtre.</p>
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-600">N°</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Date</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Client</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Échéance</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-right">Montant TTC</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Statut</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-right">Actions</th>
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
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <a href={`/api/admin/lexora-billing/${inv.id}/pdf`} target="_blank" rel="noopener"
                           className="p-1.5 rounded hover:bg-gray-100" title="Voir PDF">
                          <Eye className="h-4 w-4" />
                        </a>
                        {inv.status !== 'payee' && inv.status !== 'annulee' && (
                          <>
                            <button onClick={() => { setDunningOpen(inv); setDunningResults(null) }}
                                    className="p-1.5 rounded hover:bg-gray-100" title="Relancer">
                              <Send className="h-4 w-4 text-amber-600" />
                            </button>
                            <button onClick={() => setPayOpen(inv)}
                                    className="p-1.5 rounded hover:bg-gray-100" title="Marquer payée">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            </button>
                            <button onClick={() => cancel(inv)}
                                    className="p-1.5 rounded hover:bg-gray-100" title="Annuler">
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
        <Modal onClose={() => setDunningOpen(null)} title={`Relancer ${dunningOpen.invoice_number}`}>
          <p className="text-sm text-gray-600 mb-4">Choisis les canaux pour envoyer la relance.</p>
          <div className="space-y-2 mb-4">
            {[
              { id: 'email', label: 'Email (Resend)', ok: true },
              { id: 'telegram', label: 'Telegram (bot Lexora)', ok: true },
              { id: 'sms', label: 'SMS (Twilio)', ok: !!process.env.NEXT_PUBLIC_TWILIO_ENABLED },
              { id: 'whatsapp', label: 'WhatsApp (Twilio)', ok: !!process.env.NEXT_PUBLIC_TWILIO_ENABLED },
            ].map(c => (
              <label key={c.id} className="flex items-center gap-2 p-2 border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={dunningChannels.includes(c.id)}
                       onChange={e => setDunningChannels(prev => e.target.checked ? [...prev, c.id] : prev.filter(x => x !== c.id))} />
                <span className="text-sm">{c.label}</span>
                {!c.ok && <span className="ml-auto text-xs text-amber-600">stub — voir env vars</span>}
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
            <button onClick={() => setDunningOpen(null)} className="px-3 py-2 rounded-lg border text-sm">Fermer</button>
            <button onClick={triggerDunning} disabled={dunningSending || dunningChannels.length === 0}
                    className="px-3 py-2 rounded-lg text-sm text-white" style={{ backgroundColor: '#D4AF37', color: '#0B0F2E' }}>
              {dunningSending ? <Loader2 className="h-4 w-4 animate-spin inline" /> : 'Envoyer'}
            </button>
          </div>
        </Modal>
      )}

      {/* Mark-paid dialog */}
      {payOpen && (
        <Modal onClose={() => setPayOpen(null)} title={`Marquer ${payOpen.invoice_number} payée`}>
          <p className="text-sm text-gray-600 mb-3">
            Montant : <strong>{fmt(payOpen.amount_ttc, payOpen.devise)}</strong>. Cela créera l'écriture d'encaissement (BNQ ↔ 411) dans la compta DDS.
          </p>
          <label className="block text-sm mb-1">Référence virement (optionnel)</label>
          <input type="text" value={payRef} onChange={e => setPayRef(e.target.value)}
                 className="w-full px-3 py-2 border rounded-lg text-sm mb-4" placeholder="REF-2026-…" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setPayOpen(null)} className="px-3 py-2 rounded-lg border text-sm">Annuler</button>
            <button onClick={markPaid} disabled={paySaving}
                    className="px-3 py-2 rounded-lg text-sm text-white bg-green-700">
              {paySaving ? <Loader2 className="h-4 w-4 animate-spin inline" /> : 'Confirmer'}
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
