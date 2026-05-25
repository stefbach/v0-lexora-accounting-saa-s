"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, AlertCircle, AlertTriangle, Download, Upload, FileText, Check, Send, ExternalLink } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'
import { t, getLocale, type Locale } from '@/lib/i18n'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const fmt = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(Number(n))

/** Lit le bloc manual_submission depuis n'importe quel `notes` JSON d'une tx déclarée. */
function findManualSubmission(declared: any[] | undefined): {
  ack_ref: string; ack_pdf_path: string; submitted_at: string; status: string
} | null {
  for (const tx of declared || []) {
    if (!tx?.notes) continue
    try {
      const obj = JSON.parse(tx.notes)
      if (obj?.ack_ref && obj?.ack_pdf_path) {
        return {
          ack_ref: obj.ack_ref, ack_pdf_path: obj.ack_pdf_path,
          submitted_at: obj.submitted_at || tx.reported_at,
          status: obj.status || 'submitted_manual',
        }
      }
    } catch { /* legacy text notes, skip */ }
  }
  return null
}

export default function MraSftPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState(new Date().getFullYear() - 1)
  const [threshold, setThreshold] = useState(50000)

  // ── Soumission manuelle (portail MRA générique, pas d'API) ─────────────
  const [submitOpen, setSubmitOpen] = useState(false)
  const [submitAckRef, setSubmitAckRef] = useState('')
  const [submitFile, setSubmitFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const manualSub = findManualSubmission(data?.declared)

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const r = await fetch(`/api/comptable/mra/sft?societe_id=${societeId}&year=${year}&threshold=${threshold}`).then(r => r.json())
      setData(r)
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId, year, threshold])

  const submitManual = async () => {
    if (!societeId || !submitAckRef.trim() || !submitFile) return
    setSubmitting(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('societe_id', societeId)
      fd.append('year', String(year))
      fd.append('action', 'submit_manual')
      fd.append('mra_ack_ref', submitAckRef.trim())
      fd.append('ack_pdf', submitFile)
      const r = await fetch('/api/comptable/mra/sft', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'Échec soumission manuelle')
      setSubmitOpen(false); setSubmitAckRef(''); setSubmitFile(null)
      load()
    } catch (e: any) {
      setError(e?.message || 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  const exportXml = () => { if (societeId) window.location.href = `/api/comptable/mra/sft?societe_id=${societeId}&year=${year}&action=export_xml` }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('mra.sft.no_societe', locale)}</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> {t('mra.sft.loading', locale)}</div>

  const s = data?.summary || {}

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><AlertTriangle className="h-6 w-6 text-rose-600" /> {t('mra.sft.title', locale)}</h1>
          <p className="text-sm text-slate-500">{t('mra.sft.subtitle', locale)}</p>
        </div>
        <div className="flex gap-2 items-center">
          <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="border rounded px-2 py-1 text-sm w-24" />
          <input type="number" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))} className="border rounded px-2 py-1 text-sm w-32" placeholder={t('mra.sft.threshold_placeholder', locale)} />
          <Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />{t('mra.sft.refresh', locale)}</Button>
          <Button onClick={exportXml} variant="outline"><Download className="h-4 w-4 mr-2" />{t('mra.sft.xml', locale)}</Button>
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">{t('mra.sft.kpi.detected', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-rose-700">{s.nb_detected || 0}</div><div className="text-xs text-slate-500">≥ {fmt(threshold)} MUR</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">{t('mra.sft.kpi.declared', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-700">{s.nb_declared || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">{t('mra.sft.kpi.total_detected', locale)}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(s.total_amount_mur)}</div><div className="text-xs text-slate-500">MUR</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('mra.sft.detected.title', locale)}{year}</CardTitle></CardHeader>
        <CardContent>
          {(data?.detected?.length || 0) === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">{t('mra.sft.detected.empty', locale)}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">{t('mra.sft.col.date', locale)}</th><th className="py-2 px-2">{t('mra.sft.col.source', locale)}</th><th className="py-2 px-2">{t('mra.sft.col.counterparty', locale)}</th><th className="py-2 px-2">{t('mra.sft.col.type', locale)}</th><th className="py-2 px-2 text-right">{t('mra.sft.col.amount', locale)}</th></tr></thead>
              <tbody>
                {data.detected.map((tx: any, i: number) => (
                  <tr key={i} className="border-b">
                    <td className="py-2 px-2 text-xs">{tx.date_trans}</td>
                    <td className="py-2 px-2 text-xs"><Badge variant="outline">{tx.source}</Badge></td>
                    <td className="py-2 px-2 font-medium">{tx.counterparty}</td>
                    <td className="py-2 px-2 text-xs">{tx.transaction_type}</td>
                    <td className="py-2 px-2 text-right font-semibold">{fmt(tx.amount_mur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Soumission manuelle SFT — preuve d'archivage du dépôt MRA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4 text-slate-600" />
            Soumission manuelle MRA (SFT {year})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-600 mb-3">
            Le SFT se dépose manuellement sur le portail{' '}
            <a href="https://eservices8.mra.mu" target="_blank" rel="noopener noreferrer"
               className="text-indigo-600 hover:underline inline-flex items-center gap-1">
              MRA e-Services <ExternalLink className="h-3 w-3" />
            </a>.
            Après dépôt, remontez ici la référence MRA et l'accusé PDF pour preuve réglementaire.
          </p>
          {manualSub ? (
            <div className="rounded border border-emerald-200 bg-emerald-50 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                <Check className="h-4 w-4" />
                Déclaration {year} soumise manuellement
              </div>
              <div className="text-xs text-emerald-900 space-y-1">
                <div><span className="font-semibold">Référence :</span> {manualSub.ack_ref}</div>
                <div><span className="font-semibold">Date :</span> {new Date(manualSub.submitted_at).toLocaleString('fr-FR')}</div>
                <div className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  <span className="font-mono break-all">{manualSub.ack_pdf_path}</span>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setSubmitOpen(true)}>
                Re-soumettre / mettre à jour
              </Button>
            </div>
          ) : (
            <Button onClick={() => setSubmitOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Upload className="h-4 w-4 mr-2" />J'ai soumis sur le portail MRA
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={submitOpen} onOpenChange={(o) => { if (!submitting) setSubmitOpen(o) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la soumission manuelle SFT {year}</DialogTitle>
            <DialogDescription>
              Renseignez la référence MRA et joignez l'accusé PDF (max 10MB). Toutes les
              transactions SFT {year} de cette société seront marquées comme déclarées.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-slate-600 block mb-1">Référence MRA *</label>
              <input
                type="text"
                value={submitAckRef}
                onChange={e => setSubmitAckRef(e.target.value)}
                placeholder="ex: SFT-2025-12345"
                className="w-full border rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 block mb-1">Accusé de réception PDF *</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={e => setSubmitFile(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
              {submitFile && (
                <p className="text-xs text-slate-500 mt-1">
                  {submitFile.name} ({(submitFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)} disabled={submitting}>Annuler</Button>
            <Button
              onClick={submitManual}
              disabled={submitting || !submitAckRef.trim() || !submitFile}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Send className="h-4 w-4 mr-2" />Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
