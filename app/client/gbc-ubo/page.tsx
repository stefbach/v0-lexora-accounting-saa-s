"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, RefreshCw, AlertCircle, UserCheck, Plus } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'

const EMPTY = {
  prenom: '', nom: '', date_naissance: '', nationalite: 'MU', pays_residence: 'MU',
  adresse_complete: '', id_type: 'passport', id_number: '', id_expiry: '', id_country: 'MU',
  pct_detention: 100, nature_controle: 'shares', is_pep: false, pep_details: '',
  sanctions_screened: false, sanctions_clear: true, notes: '',
}

export default function GbcUboPage() {
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const res = await fetch(`/api/comptable/gbc/beneficial-owners?societe_id=${societeId}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId])

  const declare = async () => {
    if (!societeId || !form.prenom || !form.nom || !form.id_number) {
      setError('Prénom, nom et ID number requis'); return
    }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/comptable/gbc/beneficial-owners', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'declare', payload: { ...form, societe_id: societeId, pct_detention: Number(form.pct_detention) || 0 } }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setOpen(false); setForm(EMPTY); load()
    } catch (e: any) { setError(e?.message || 'Erreur enregistrement') } finally { setSaving(false) }
  }

  const attest = async (uboId: string) => {
    await fetch('/api/comptable/gbc/beneficial-owners', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'attest', ubo_id: uboId, societe_id: societeId }) })
    load()
  }
  const revoke = async (uboId: string) => {
    if (!confirm('Révoquer cet UBO ?')) return
    await fetch('/api/comptable/gbc/beneficial-owners', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke', ubo_id: uboId, societe_id: societeId }) })
    load()
  }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> Chargement…</div>

  const s = data?.summary || {}
  const fmtPct = (n: number) => Number(n || 0).toFixed(2)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><UserCheck className="h-6 w-6 text-indigo-600" /> Beneficial Owners (UBO)</h1>
          <p className="text-sm text-slate-500">FSC AML Act + FATF — registre UBO ≥ 10%</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />Rafraîchir</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-indigo-600 hover:bg-indigo-700 text-white"><Plus className="h-4 w-4 mr-2" />Déclarer UBO</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Déclaration d'un Beneficial Owner</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Prénom *</Label><Input value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} /></div>
                  <div><Label>Nom *</Label><Input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} /></div>
                  <div><Label>Date de naissance</Label><Input type="date" value={form.date_naissance} onChange={e => setForm({ ...form, date_naissance: e.target.value })} /></div>
                  <div><Label>Nationalité (ISO)</Label><Input value={form.nationalite} onChange={e => setForm({ ...form, nationalite: e.target.value })} placeholder="MU/FR/IN..." /></div>
                  <div><Label>Pays de résidence (ISO)</Label><Input value={form.pays_residence} onChange={e => setForm({ ...form, pays_residence: e.target.value })} /></div>
                  <div><Label>Type de pièce</Label>
                    <Select value={form.id_type} onValueChange={v => setForm({ ...form, id_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="passport">Passport</SelectItem>
                        <SelectItem value="national_id">National ID</SelectItem>
                        <SelectItem value="driver_license">Driver License</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>N° pièce *</Label><Input value={form.id_number} onChange={e => setForm({ ...form, id_number: e.target.value })} /></div>
                  <div><Label>Pays émetteur</Label><Input value={form.id_country} onChange={e => setForm({ ...form, id_country: e.target.value })} /></div>
                  <div><Label>Expiration pièce</Label><Input type="date" value={form.id_expiry} onChange={e => setForm({ ...form, id_expiry: e.target.value })} /></div>
                  <div><Label>% Détention *</Label><Input type="number" min="0" max="100" step="0.01" value={form.pct_detention} onChange={e => setForm({ ...form, pct_detention: Number(e.target.value) || 0 })} /></div>
                  <div><Label>Nature contrôle</Label>
                    <Select value={form.nature_controle} onValueChange={v => setForm({ ...form, nature_controle: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="shares">Actions / parts</SelectItem>
                        <SelectItem value="voting">Droits de vote</SelectItem>
                        <SelectItem value="board">Conseil d'administration</SelectItem>
                        <SelectItem value="contract">Contrat / accord</SelectItem>
                        <SelectItem value="other">Autre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>PEP ?</Label>
                    <Select value={form.is_pep ? 'oui' : 'non'} onValueChange={v => setForm({ ...form, is_pep: v === 'oui' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="non">Non</SelectItem><SelectItem value="oui">Oui (PEP)</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label>Sanctions check OK ?</Label>
                    <Select value={form.sanctions_clear ? 'oui' : 'non'} onValueChange={v => setForm({ ...form, sanctions_clear: v === 'oui', sanctions_screened: true })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="oui">OK</SelectItem><SelectItem value="non">À investiguer</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Adresse complète</Label><Input value={form.adresse_complete} onChange={e => setForm({ ...form, adresse_complete: e.target.value })} /></div>
                {form.is_pep && <div><Label>Détails PEP (fonction, période)</Label><Input value={form.pep_details} onChange={e => setForm({ ...form, pep_details: e.target.value })} /></div>}
                <div><Label>Notes internes</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
                {error && <div className="text-sm text-red-600">{error}</div>}
                <Button onClick={declare} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">
                  {saving ? 'Enregistrement…' : 'Déclarer UBO'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && !open && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}
      {s.compliance_warning && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2"><AlertCircle className="h-4 w-4" />{s.compliance_warning}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">UBO actifs</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{s.nb_active}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">% Détention déclarée</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmtPct(s.total_pct_declared)}%</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Audit trail</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{data?.history?.length || 0}</div><div className="text-xs text-slate-500">événements</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">UBO actifs</CardTitle></CardHeader>
        <CardContent>
          {(data?.ubos?.length || 0) === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">Aucun UBO déclaré. Clique sur "Déclarer UBO" pour commencer.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">Nom</th><th className="py-2 px-2">Nationalité</th><th className="py-2 px-2 text-right">% Détention</th><th className="py-2 px-2">Contrôle</th><th className="py-2 px-2">PEP</th><th className="py-2 px-2">Sanctions</th><th className="py-2 px-2">Actions</th></tr></thead>
              <tbody>
                {data.ubos.map((u: any) => (
                  <tr key={u.id} className="border-b">
                    <td className="py-2 px-2 font-medium">{u.prenom} {u.nom}</td>
                    <td className="py-2 px-2 text-xs">{u.nationalite}</td>
                    <td className="py-2 px-2 text-right">{Number(u.pct_detention).toFixed(2)}%</td>
                    <td className="py-2 px-2 text-xs">{u.nature_controle}</td>
                    <td className="py-2 px-2">{u.is_pep ? <Badge className="bg-amber-100 text-amber-800">PEP</Badge> : '—'}</td>
                    <td className="py-2 px-2 text-xs">{u.sanctions_clear == null ? '—' : u.sanctions_clear ? '✓' : '✗'}</td>
                    <td className="py-2 px-2 flex gap-1"><Button size="sm" variant="outline" onClick={() => attest(u.id)} className="text-xs">Attester</Button><Button size="sm" variant="outline" onClick={() => revoke(u.id)} className="text-xs text-red-600">Révoquer</Button></td>
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
