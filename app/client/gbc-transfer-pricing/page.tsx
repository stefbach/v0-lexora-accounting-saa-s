"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, RefreshCw, AlertCircle, GitBranch, Plus, FileText } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'

const fmt = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(Number(n))
const TIER_COLOR: Record<string, string> = {
  documentation_required: 'bg-red-100 text-red-800 border-red-200',
  recommended: 'bg-amber-100 text-amber-800 border-amber-200',
  optional: 'bg-slate-100 text-slate-700 border-slate-200',
}

const EMPTY_TX = {
  related_party_name: '', related_party_country: '', relationship_type: 'subsidiary',
  transaction_type: 'services', amount_mur: 0, tp_method: 'TNMM',
  arm_length_range_low: 0, arm_length_range_high: 0, benchmarking_source: '',
  is_within_range: true, rationale: '',
}
const EMPTY_MF = {
  group_structure: '', business_overview: '', intangibles_description: '',
  financing_strategy: '', financial_position: '', consolidated_revenue_mur: 0,
}

export default function GbcTpPage() {
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exercice, setExercice] = useState(() => {
    const y = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1
    return `${y}-${y + 1}`
  })
  const [openTx, setOpenTx] = useState(false)
  const [openMf, setOpenMf] = useState(false)
  const [formTx, setFormTx] = useState(EMPTY_TX)
  const [formMf, setFormMf] = useState(EMPTY_MF)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const res = await fetch(`/api/comptable/gbc/transfer-pricing?societe_id=${societeId}&exercice=${exercice}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
      if (json.master_file) setFormMf(json.master_file)
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId, exercice])

  const saveTx = async () => {
    if (!societeId || !formTx.related_party_name) { setError('Partie liée requise'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/comptable/gbc/transfer-pricing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'transaction', payload: { ...formTx, societe_id: societeId, exercice, amount_mur: Number(formTx.amount_mur) || 0 } }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setOpenTx(false); setFormTx(EMPTY_TX); load()
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setSaving(false) }
  }

  const saveMf = async () => {
    if (!societeId) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/comptable/gbc/transfer-pricing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'master_file', payload: { ...formMf, societe_id: societeId, exercice, consolidated_revenue_mur: Number(formMf.consolidated_revenue_mur) || 0 } }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setOpenMf(false); load()
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setSaving(false) }
  }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> Chargement…</div>

  const s = data?.summary || {}
  const tier = (amt: number) => amt >= 5_000_000 ? 'documentation_required' : amt >= 1_000_000 ? 'recommended' : 'optional'

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><GitBranch className="h-6 w-6 text-indigo-600" /> Transfer Pricing</h1>
          <p className="text-sm text-slate-500">Maurice TP Act 2023 + OECD TPG — documentation intragroupe</p>
        </div>
        <div className="flex gap-2">
          <input value={exercice} onChange={e => setExercice(e.target.value)} className="border rounded px-2 py-1 text-sm w-32" />
          <Dialog open={openMf} onOpenChange={setOpenMf}>
            <DialogTrigger asChild><Button variant="outline"><FileText className="h-4 w-4 mr-2" />Master File</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Master File — {exercice}</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div><Label>Structure groupe</Label><Textarea value={formMf.group_structure || ''} onChange={e => setFormMf({ ...formMf, group_structure: e.target.value })} rows={3} placeholder="Description organigramme groupe + entités principales" /></div>
                <div><Label>Vue d'ensemble activité</Label><Textarea value={formMf.business_overview || ''} onChange={e => setFormMf({ ...formMf, business_overview: e.target.value })} rows={3} /></div>
                <div><Label>Intangibles (IP)</Label><Textarea value={formMf.intangibles_description || ''} onChange={e => setFormMf({ ...formMf, intangibles_description: e.target.value })} rows={2} placeholder="Brevets, marques, IP holding, redevances" /></div>
                <div><Label>Stratégie financière intragroupe</Label><Textarea value={formMf.financing_strategy || ''} onChange={e => setFormMf({ ...formMf, financing_strategy: e.target.value })} rows={2} /></div>
                <div><Label>Position financière</Label><Textarea value={formMf.financial_position || ''} onChange={e => setFormMf({ ...formMf, financial_position: e.target.value })} rows={2} /></div>
                <div><Label>CA consolidé groupe (MUR)</Label><Input type="number" value={formMf.consolidated_revenue_mur || 0} onChange={e => setFormMf({ ...formMf, consolidated_revenue_mur: Number(e.target.value) || 0 })} /></div>
                {error && <div className="text-sm text-red-600">{error}</div>}
                <Button onClick={saveMf} disabled={saving} className="w-full">{saving ? 'Enregistrement…' : 'Enregistrer Master File'}</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={openTx} onOpenChange={setOpenTx}>
            <DialogTrigger asChild><Button className="bg-indigo-600 hover:bg-indigo-700 text-white"><Plus className="h-4 w-4 mr-2" />Transaction TP</Button></DialogTrigger>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Saisir une transaction intragroupe</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><Label>Partie liée (nom) *</Label><Input value={formTx.related_party_name} onChange={e => setFormTx({ ...formTx, related_party_name: e.target.value })} /></div>
                  <div><Label>Pays (ISO)</Label><Input value={formTx.related_party_country} onChange={e => setFormTx({ ...formTx, related_party_country: e.target.value })} placeholder="ZA/IN/FR" /></div>
                  <div><Label>Type relation</Label>
                    <Select value={formTx.relationship_type} onValueChange={v => setFormTx({ ...formTx, relationship_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="parent">Société mère</SelectItem>
                        <SelectItem value="subsidiary">Filiale</SelectItem>
                        <SelectItem value="sister">Société sœur</SelectItem>
                        <SelectItem value="common_control">Contrôle commun</SelectItem>
                        <SelectItem value="key_management">Management clé</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Type transaction</Label>
                    <Select value={formTx.transaction_type} onValueChange={v => setFormTx({ ...formTx, transaction_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="goods">Biens</SelectItem>
                        <SelectItem value="services">Services</SelectItem>
                        <SelectItem value="royalties">Redevances</SelectItem>
                        <SelectItem value="interest">Intérêts</SelectItem>
                        <SelectItem value="financing">Financement</SelectItem>
                        <SelectItem value="cost_sharing">Partage coûts</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Montant (MUR)</Label><Input type="number" value={formTx.amount_mur} onChange={e => setFormTx({ ...formTx, amount_mur: Number(e.target.value) || 0 })} /></div>
                  <div><Label>Méthode TP (OECD)</Label>
                    <Select value={formTx.tp_method} onValueChange={v => setFormTx({ ...formTx, tp_method: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CUP">CUP (Comparable Uncontrolled Price)</SelectItem>
                        <SelectItem value="RPM">RPM (Resale Price Method)</SelectItem>
                        <SelectItem value="CPM">CPM (Cost Plus Method)</SelectItem>
                        <SelectItem value="TNMM">TNMM (Transactional Net Margin)</SelectItem>
                        <SelectItem value="PSM">PSM (Profit Split Method)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Arm's length min</Label><Input type="number" value={formTx.arm_length_range_low} onChange={e => setFormTx({ ...formTx, arm_length_range_low: Number(e.target.value) || 0 })} /></div>
                  <div><Label>Arm's length max</Label><Input type="number" value={formTx.arm_length_range_high} onChange={e => setFormTx({ ...formTx, arm_length_range_high: Number(e.target.value) || 0 })} /></div>
                  <div><Label>Dans la fourchette ?</Label>
                    <Select value={formTx.is_within_range ? 'oui' : 'non'} onValueChange={v => setFormTx({ ...formTx, is_within_range: v === 'oui' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="oui">Oui</SelectItem><SelectItem value="non">Non — à investiguer</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label>Source benchmarking</Label><Input value={formTx.benchmarking_source} onChange={e => setFormTx({ ...formTx, benchmarking_source: e.target.value })} placeholder="Orbis 2024, comparable agreement..." /></div>
                </div>
                <div><Label>Rationale</Label><Textarea value={formTx.rationale} onChange={e => setFormTx({ ...formTx, rationale: e.target.value })} rows={3} /></div>
                {error && <div className="text-sm text-red-600">{error}</div>}
                <Button onClick={saveTx} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">{saving ? 'Enregistrement…' : 'Enregistrer transaction'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && !openTx && !openMf && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Transactions</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{s.count || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Total intragroupe</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(s.total_amount_mur)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Doc obligatoire</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-700">{s.by_tier?.documentation_required || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Hors arm's length</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-amber-700">{s.flagged_not_arms_length || 0}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Master File {data?.master_file ? '✓ renseigné' : '— manquant'}</CardTitle></CardHeader>
        <CardContent>
          {data?.master_file ? (
            <div className="text-sm space-y-1">
              <div><strong>CA consolidé :</strong> {fmt(data.master_file.consolidated_revenue_mur)} MUR</div>
              {data.master_file.business_overview && <div className="text-xs text-slate-600">{data.master_file.business_overview.slice(0, 300)}…</div>}
            </div>
          ) : <div className="text-sm text-slate-500">Clique sur "Master File" pour le saisir.</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Transactions intragroupe</CardTitle></CardHeader>
        <CardContent>
          {(data?.transactions?.length || 0) === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">Aucune transaction. Clique sur "Transaction TP" pour saisir.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">Partie liée</th><th className="py-2 px-2">Type</th><th className="py-2 px-2 text-right">Montant</th><th className="py-2 px-2">Méthode</th><th className="py-2 px-2">Tier</th><th className="py-2 px-2">Arm's length</th></tr></thead>
              <tbody>
                {data.transactions.map((t: any) => (
                  <tr key={t.id} className="border-b">
                    <td className="py-2 px-2 font-medium">{t.related_party_name}</td>
                    <td className="py-2 px-2 text-xs">{t.transaction_type}</td>
                    <td className="py-2 px-2 text-right">{fmt(t.amount_mur)}</td>
                    <td className="py-2 px-2 text-xs">{t.tp_method || '—'}</td>
                    <td className="py-2 px-2"><Badge className={TIER_COLOR[tier(Number(t.amount_mur))]}>{tier(Number(t.amount_mur))}</Badge></td>
                    <td className="py-2 px-2 text-xs">{t.is_within_range == null ? '—' : t.is_within_range ? '✓' : '✗'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
