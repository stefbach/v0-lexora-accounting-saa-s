"use client"

/**
 * /admin/lexora-billing/rapprochement — vue dédiée pour matcher manuellement
 * les transactions bancaires DDS avec les factures impayées.
 *
 * L'API GET retourne déjà des suggestions triées par score (montant exact +
 * référence). Un clic sur "Lier" déclenche le marquage payée + l'écriture
 * d'encaissement BNQ ↔ 411.
 */

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Link2, CheckCircle2, AlertCircle } from "lucide-react"
import { t, getLocale } from "@/lib/i18n"

interface Tx {
  id: string; date_operation: string; libelle: string; reference: string | null; montant: number
}
interface Inv {
  id: string; invoice_number: string; invoice_date: string; due_date: string; amount_ttc: number;
  status: string; customer_snapshot: any
}
interface Suggestion {
  transaction_id: string; invoice_id: string; score: number; reason: string
}

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
}

export default function ReconcilePage() {
  const locale = getLocale()
  const [loading, setLoading] = useState(true)
  const [txs, setTxs] = useState<Tx[]>([])
  const [invs, setInvs] = useState<Inv[]>([])
  const [sugs, setSugs] = useState<Suggestion[]>([])
  const [warning, setWarning] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [linking, setLinking] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/lexora-billing/reconcile', { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || t('adm3.rec.err_generic', locale))
      setTxs(j.transactions || []); setInvs(j.invoices || []); setSugs(j.suggestions || [])
      setWarning(j.warning || null)
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || t('adm3.rec.err_generic', locale) })
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const link = async (invoice_id: string, transaction_id: string) => {
    setLinking(`${invoice_id}|${transaction_id}`)
    try {
      const res = await fetch('/api/admin/lexora-billing/reconcile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id, transaction_id }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || t('adm3.rec.err_generic', locale))
      setMsg({ type: 'success', text: t('adm3.rec.toast_linked', locale) })
      load()
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.message || t('adm3.rec.err_generic', locale) })
    } finally {
      setLinking(null)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  const invMap = new Map(invs.map(i => [i.id, i]))
  const txMap = new Map(txs.map(t => [t.id, t]))

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/lexora-billing" className="text-gray-400 hover:text-gray-700"><ArrowLeft className="h-5 w-5" /></Link>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0B0F2E' }}>{t('adm3.rec.title', locale)}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('adm3.rec.subtitle', locale)}</p>
        </div>
      </div>

      {warning && (
        <div className="mb-4 p-3 bg-amber-50 text-amber-800 text-sm rounded-lg flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {warning}
        </div>
      )}
      {msg && (
        <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${msg.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {msg.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="font-bold text-sm uppercase tracking-wider text-gray-500 mb-3">{t('adm3.rec.suggestions_a', locale)} ({sugs.length})</h2>
            {sugs.length === 0 ? (
              <p className="text-sm text-gray-500">{t('adm3.rec.no_suggestions', locale)}</p>
            ) : (
              <div className="bg-white border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-4 py-2 font-semibold text-gray-600">{t('adm3.rec.th_invoice', locale)}</th>
                      <th className="px-4 py-2 font-semibold text-gray-600">{t('adm3.rec.th_client', locale)}</th>
                      <th className="px-4 py-2 font-semibold text-gray-600">{t('adm3.rec.th_transaction', locale)}</th>
                      <th className="px-4 py-2 font-semibold text-gray-600 text-right">{t('adm3.rec.th_amount', locale)}</th>
                      <th className="px-4 py-2 font-semibold text-gray-600">{t('adm3.rec.th_reason', locale)}</th>
                      <th className="px-4 py-2 font-semibold text-gray-600 text-right">{t('adm3.rec.th_action', locale)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sugs.map((s, i) => {
                      const inv = invMap.get(s.invoice_id); const tx = txMap.get(s.transaction_id)
                      if (!inv || !tx) return null
                      const key = `${s.invoice_id}|${s.transaction_id}`
                      return (
                        <tr key={i} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono text-xs">{inv.invoice_number}</td>
                          <td className="px-4 py-2">{inv.customer_snapshot?.nom}</td>
                          <td className="px-4 py-2">
                            <p className="text-sm">{tx.libelle}</p>
                            <p className="text-xs text-gray-500">{tx.date_operation} · {tx.reference || '—'}</p>
                          </td>
                          <td className="px-4 py-2 text-right font-semibold">{fmt(tx.montant)}</td>
                          <td className="px-4 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded ${s.score >= 100 ? 'bg-green-100 text-green-800' : s.score >= 70 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>
                              {s.reason} · {s.score}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button onClick={() => link(s.invoice_id, s.transaction_id)} disabled={linking === key}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded text-white bg-green-700 hover:bg-green-800">
                              {linking === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />} {t('adm3.rec.link', locale)}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section>
              <h2 className="font-bold text-sm uppercase tracking-wider text-gray-500 mb-3">{t('adm3.rec.unmatched_tx_a', locale)} ({txs.length})</h2>
              <div className="bg-white border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-semibold text-gray-600">{t('adm3.rec.th_date', locale)}</th>
                      <th className="px-3 py-2 font-semibold text-gray-600">{t('adm3.rec.th_label', locale)}</th>
                      <th className="px-3 py-2 font-semibold text-gray-600 text-right">{t('adm3.rec.th_amount', locale)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.length === 0 ? (
                      <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-500">{t('adm3.rec.nothing_to_reconcile', locale)}</td></tr>
                    ) : txs.map(t => (
                      <tr key={t.id} className="border-t">
                        <td className="px-3 py-2 text-xs">{t.date_operation}</td>
                        <td className="px-3 py-2">{t.libelle}<div className="text-xs text-gray-400">{t.reference}</div></td>
                        <td className="px-3 py-2 text-right font-semibold">{fmt(t.montant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="font-bold text-sm uppercase tracking-wider text-gray-500 mb-3">{t('adm3.rec.unpaid_invoices_a', locale)} ({invs.length})</h2>
              <div className="bg-white border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-semibold text-gray-600">{t('adm3.rec.th_number', locale)}</th>
                      <th className="px-3 py-2 font-semibold text-gray-600">{t('adm3.rec.th_client', locale)}</th>
                      <th className="px-3 py-2 font-semibold text-gray-600 text-right">{t('adm3.rec.th_amount', locale)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invs.length === 0 ? (
                      <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-500">{t('adm3.rec.no_unpaid', locale)}</td></tr>
                    ) : invs.map(i => (
                      <tr key={i.id} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{i.invoice_number}</td>
                        <td className="px-3 py-2">{i.customer_snapshot?.nom}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmt(i.amount_ttc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
