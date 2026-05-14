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
import { Loader2, RefreshCw, AlertCircle, ShieldCheck, Settings, Plus } from 'lucide-react'
import { useSocieteActive } from '@/components/client/SocieteActiveProvider'

const fmt = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(Number(n))
const STATUS_COLOR: Record<string, string> = {
  compliant: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  at_risk: 'bg-amber-100 text-amber-800 border-amber-200',
  non_compliant: 'bg-red-100 text-red-800 border-red-200',
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
}

const EMPTY_CIGA = { activity_type: 'board_meeting', date: '', location: 'Mauritius', description: '', attendees: '' }

export default function GbcSubstancePage() {
  const { societeId } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exercice, setExercice] = useState(() => {
    const y = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1
    return `${y}-${y + 1}`
  })
  const [openCfg, setOpenCfg] = useState(false)
  const [openCiga, setOpenCiga] = useState(false)
  const [cfg, setCfg] = useState({ activity_code: 'other', premises_address: '', premises_verified: false, notes: '' })
  const [ciga, setCiga] = useState(EMPTY_CIGA)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!societeId) { setLoading(false); return }
    setError(null); setLoading(true)
    try {
      const res = await fetch(`/api/comptable/gbc/substance?societe_id=${societeId}&exercice=${exercice}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
      if (json.tracking) setCfg({
        activity_code: json.tracking.activity_code || 'other',
        premises_address: json.tracking.premises_address || '',
        premises_verified: !!json.tracking.premises_verified,
        notes: json.tracking.notes || '',
      })
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [societeId, exercice])

  const saveCfg = async () => {
    if (!societeId) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/comptable/gbc/substance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: societeId, exercice, ...cfg, ciga_activities: data?.tracking?.ciga_activities || [] }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setOpenCfg(false); load()
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setSaving(false) }
  }

  const addCiga = async () => {
    if (!societeId || !ciga.date) { setError('Date requise'); return }
    setSaving(true); setError(null)
    try {
      const existing = data?.tracking?.ciga_activities || []
      const newActivity = { ...ciga, attendees: ciga.attendees.split(',').map(s => s.trim()).filter(Boolean) }
      const updated = [...existing, newActivity]
      const res = await fetch('/api/comptable/gbc/substance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societe_id: societeId, exercice,
          activity_code: data?.tracking?.activity_code || 'other',
          premises_address: data?.tracking?.premises_address || '',
          premises_verified: !!data?.tracking?.premises_verified,
          ciga_activities: updated,
          notes: data?.tracking?.notes || '',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setOpenCiga(false); setCiga(EMPTY_CIGA); load()
    } catch (e: any) { setError(e?.message || 'Erreur') } finally { setSaving(false) }
  }

  if (!societeId) return <div className="p-8"><div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Aucune société sélectionnée.</div></div>
  if (loading) return <div className="p-8 flex items-center gap-2"><Loader2 className="animate-spin h-5 w-5" /> Chargement…</div>

  const ass = data?.auto_assessment || {}
  const tr = data?.tracking || {}
  const cigas: any[] = tr?.ciga_activities || []

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-indigo-600" /> Substance Requirements (CIGA)</h1>
          <p className="text-sm text-slate-500">Income Tax Act §73A + FSC Guidelines — exigences pour bénéficier du PER</p>
        </div>
        <div className="flex gap-2 items-center">
          <input value={exercice} onChange={e => setExercice(e.target.value)} className="border rounded px-2 py-1 text-sm w-32" />
          <Button onClick={load} variant="outline"><RefreshCw className="h-4 w-4 mr-2" />Rafraîchir</Button>
          <Dialog open={openCfg} onOpenChange={setOpenCfg}>
            <DialogTrigger asChild><Button variant="outline"><Settings className="h-4 w-4 mr-2" />Configurer activité</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Configurer l'activité substance — {exercice}</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div><Label>Activité principale *</Label>
                  <Select value={cfg.activity_code} onValueChange={v => setCfg({ ...cfg, activity_code: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(data?.requirements || []).map((r: any) => (
                        <SelectItem key={r.activity_code} value={r.activity_code}>
                          {r.libelle} — min {fmt(r.min_expenditure_mur)} MUR, {r.min_employees} emp.
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Adresse premises Maurice</Label><Input value={cfg.premises_address} onChange={e => setCfg({ ...cfg, premises_address: e.target.value })} placeholder="Adresse complète" /></div>
                <div><Label>Premises vérifiés ?</Label>
                  <Select value={cfg.premises_verified ? 'oui' : 'non'} onValueChange={v => setCfg({ ...cfg, premises_verified: v === 'oui' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="non">Non</SelectItem><SelectItem value="oui">Oui (visite effectuée)</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>Notes</Label><Textarea value={cfg.notes} onChange={e => setCfg({ ...cfg, notes: e.target.value })} rows={3} /></div>
                {error && <div className="text-sm text-red-600">{error}</div>}
                <Button onClick={saveCfg} disabled={saving} className="w-full">{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={openCiga} onOpenChange={setOpenCiga}>
            <DialogTrigger asChild><Button className="bg-indigo-600 hover:bg-indigo-700 text-white"><Plus className="h-4 w-4 mr-2" />Log CIGA</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Enregistrer une activité CIGA</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div><Label>Type activité</Label>
                  <Select value={ciga.activity_type} onValueChange={v => setCiga({ ...ciga, activity_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="board_meeting">Board meeting</SelectItem>
                      <SelectItem value="investment_decision">Investment decision</SelectItem>
                      <SelectItem value="risk_management">Risk management</SelectItem>
                      <SelectItem value="strategy_meeting">Strategy meeting</SelectItem>
                      <SelectItem value="other">Autre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Date *</Label><Input type="date" value={ciga.date} onChange={e => setCiga({ ...ciga, date: e.target.value })} /></div>
                  <div><Label>Lieu</Label><Input value={ciga.location} onChange={e => setCiga({ ...ciga, location: e.target.value })} placeholder="Mauritius / Port Louis" /></div>
                </div>
                <div><Label>Description</Label><Textarea value={ciga.description} onChange={e => setCiga({ ...ciga, description: e.target.value })} rows={2} /></div>
                <div><Label>Participants (séparés par virgule)</Label><Input value={ciga.attendees} onChange={e => setCiga({ ...ciga, attendees: e.target.value })} placeholder="John Doe, Jane Smith" /></div>
                {error && <div className="text-sm text-red-600">{error}</div>}
                <Button onClick={addCiga} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white">{saving ? 'Enregistrement…' : 'Enregistrer CIGA'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && !openCfg && !openCiga && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Statut compliance</CardTitle></CardHeader><CardContent>
          <Badge className={STATUS_COLOR[ass?.overall_status || 'pending']}>{ass?.overall_status || 'pending'}</Badge>
          {tr?.activity_code && <div className="text-xs text-slate-500 mt-2">Activité : {tr.activity_code}</div>}
        </CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Dépenses Maurice</CardTitle></CardHeader><CardContent>
          <div className="text-xl font-bold">{fmt(ass?.actual_expenditure_mur)}</div>
          <div className="text-xs text-slate-500">Requis : {fmt(ass?.required_expenditure_mur)} MUR</div>
          <div className={`text-xs mt-1 ${ass?.expenditure_compliant ? 'text-emerald-700' : 'text-red-700'}`}>{ass?.expenditure_compliant ? '✓ conforme' : '✗ insuffisant'}</div>
        </CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-slate-500">Employés</CardTitle></CardHeader><CardContent>
          <div className="text-xl font-bold">{ass?.actual_employees ?? '—'}</div>
          <div className="text-xs text-slate-500">Requis : {ass?.required_employees ?? '—'}</div>
          <div className={`text-xs mt-1 ${ass?.employees_compliant ? 'text-emerald-700' : 'text-red-700'}`}>{ass?.employees_compliant ? '✓ conforme' : '✗ insuffisant'}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Activités CIGA enregistrées ({cigas.length})</CardTitle></CardHeader>
        <CardContent>
          {cigas.length === 0 ? (
            <div className="text-sm text-slate-500 p-4 text-center">Aucune activité CIGA. Clique sur "Log CIGA" pour ajouter (board meetings, decisions, etc.).</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">Date</th><th className="py-2 px-2">Type</th><th className="py-2 px-2">Lieu</th><th className="py-2 px-2">Description</th></tr></thead>
              <tbody>
                {cigas.map((c: any, i: number) => (
                  <tr key={i} className="border-b">
                    <td className="py-2 px-2 text-xs">{c.date}</td>
                    <td className="py-2 px-2 text-xs">{c.activity_type}</td>
                    <td className="py-2 px-2 text-xs">{c.location}</td>
                    <td className="py-2 px-2 text-xs">{c.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Référentiel des activités (seuils ITA §73A)</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="border-b"><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 px-2">Code</th><th className="py-2 px-2">Activité</th><th className="py-2 px-2 text-right">Dépenses min</th><th className="py-2 px-2 text-right">Employés min</th></tr></thead>
            <tbody>
              {(data?.requirements || []).map((r: any) => (
                <tr key={r.activity_code} className={`border-b ${tr?.activity_code === r.activity_code ? 'bg-indigo-50' : ''}`}>
                  <td className="py-2 px-2 font-mono text-xs">{r.activity_code}</td>
                  <td className="py-2 px-2">{r.libelle}</td>
                  <td className="py-2 px-2 text-right">{fmt(r.min_expenditure_mur)} MUR</td>
                  <td className="py-2 px-2 text-right">{r.min_employees}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
