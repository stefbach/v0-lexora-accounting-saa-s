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
  Wallet, Loader2, Calculator, Save, ShieldAlert, AlertTriangle,
  CheckCircle2, Trash2, FileDown,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import {
  formaterSeverance, formaterAnciennete,
  getMotifNonEligibleLabel, MOTIF_LABELS, STATUT_LABELS,
  type SeveranceCalcul, type SeveranceRecord, type MotifLicenciement,
} from "@/lib/rh/severance"
import { useRHSocieteActive } from "@/components/rh/RHSocieteActiveProvider"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Employe { id: string; nom: string; prenom: string; societe_id: string }

export default function SeverancePage() {
  // Société active depuis le sidebar RH (cookie partagé avec /client/*).
  const { societeId, societe } = useRHSocieteActive()
  const [employes, setEmployes] = useState<Employe[]>([])
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [userRole, setUserRole] = useState<string>("")

  // Form simulation (pré-rempli via ?employe_id=&date= depuis /rh/depart)
  const initialFromUrl = (() => {
    if (typeof window === 'undefined') return { emp: '', date: '' }
    const p = new URLSearchParams(window.location.search)
    return {
      emp: p.get('employe_id') || '',
      date: p.get('date') || '',
    }
  })()
  const [employeId, setEmployeId] = useState<string>(initialFromUrl.emp)
  const [dateLicenciement, setDateLicenciement] = useState<string>(
    initialFromUrl.date || new Date().toISOString().slice(0, 10),
  )
  const [motif, setMotif] = useState<MotifLicenciement>('non_justifie')
  const [dGratif, setDGratif] = useState<string>('0')
  const [dPension, setDPension] = useState<string>('0')
  const [dPrgf, setDPrgf] = useState<string>('0')
  const [commentaire, setCommentaire] = useState<string>('')

  const [resultat, setResultat] = useState<SeveranceCalcul | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const [simulations, setSimulations] = useState<SeveranceRecord[]>([])
  const [loadingHistorique, setLoadingHistorique] = useState(false)
  const [filtreStatut, setFiltreStatut] = useState<string>('all')
  const [rowLoading, setRowLoading] = useState<string | null>(null)

  // Auth uniquement — la liste des sociétés vient du provider RH.
  useEffect(() => {
    ;(async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (!user) { setAuthorized(false); return }
        const { data: prof } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle()
        const role = (prof as any)?.role || ''
        setUserRole(role)
        if (!['admin', 'rh'].includes(role)) { setAuthorized(false); return }
        setAuthorized(true)
      } catch { setAuthorized(false) }
    })()
  }, [])

  // Employés par société
  useEffect(() => {
    if (!societeId) return
    fetch(`/api/rh/employes?societe_id=${societeId}`)
      .then(r => r.ok ? r.json() : { employes: [] })
      .then(d => {
        const list = (d?.employes || []).filter((e: any) => e.actif !== false)
        setEmployes(list.sort((a: any, b: any) => a.nom.localeCompare(b.nom)))
      })
      .catch(() => setEmployes([]))
  }, [societeId])

  // Historique simulations
  const loadHistorique = useCallback(async () => {
    if (!societeId) return
    setLoadingHistorique(true)
    try {
      const q = new URLSearchParams({ societe_id: societeId })
      if (filtreStatut !== 'all') q.set('statut', filtreStatut)
      const res = await fetch(`/api/rh/severance?${q.toString()}`)
      const d = await res.json()
      setSimulations(d?.simulations || [])
    } finally { setLoadingHistorique(false) }
  }, [societeId, filtreStatut])

  useEffect(() => { if (authorized && societeId) loadHistorique() }, [authorized, societeId, filtreStatut, loadHistorique])

  const calculer = async () => {
    if (!employeId || !dateLicenciement) {
      setFeedback('⚠ Employé + date de licenciement requis.')
      return
    }
    setCalculating(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/rh/severance/calculer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employe_id: employeId,
          date_licenciement: dateLicenciement,
          deductions: {
            gratifications: Number(dGratif) || 0,
            pension_privee: Number(dPension) || 0,
            prgf: Number(dPrgf) || 0,
          },
        }),
      })
      const d = await res.json()
      if (!res.ok) { setFeedback(`⚠ ${d?.error || `HTTP ${res.status}`}`); setResultat(null); return }
      setResultat(d.calcul as SeveranceCalcul)
    } catch (e: any) {
      setFeedback(`⚠ ${e?.message || 'erreur'}`)
      setResultat(null)
    } finally { setCalculating(false) }
  }

  const sauvegarder = async () => {
    if (!resultat || !resultat.eligible || !employeId || !societeId) return
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/rh/severance/sauvegarder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employe_id: employeId,
          societe_id: societeId,
          date_licenciement: dateLicenciement,
          motif_licenciement: motif,
          deductions: {
            gratifications: Number(dGratif) || 0,
            pension_privee: Number(dPension) || 0,
            prgf: Number(dPrgf) || 0,
          },
          commentaire,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setFeedback(`⚠ ${d?.error || `HTTP ${res.status}`}`); return }
      setFeedback(`✅ Simulation ${d.id?.slice(0, 8)} sauvegardée.`)
      await loadHistorique()
    } finally { setSaving(false) }
  }

  const rowAction = async (id: string, kind: 'valider' | 'supprimer') => {
    if (kind === 'supprimer' && !confirm('Annuler (soft delete) cette simulation ?')) return
    if (kind === 'valider' && !confirm('Valider cette simulation ? Action irréversible.')) return
    setRowLoading(id)
    try {
      const url = kind === 'valider'
        ? `/api/rh/severance/${id}/valider`
        : `/api/rh/severance/${id}`
      const res = await fetch(url, { method: kind === 'valider' ? 'PATCH' : 'DELETE' })
      const d = await res.json()
      if (!res.ok) { setFeedback(`⚠ ${d?.error || `HTTP ${res.status}`}`); return }
      setFeedback(kind === 'valider' ? '✅ Simulation validée.' : '✅ Simulation annulée.')
      await loadHistorique()
    } finally { setRowLoading(null) }
  }

  if (authorized === false) {
    return (
      <ClientPageShell hideHero disableParticles>
        <Card className="max-w-lg mx-auto mt-12 border-red-300 bg-red-50">
          <CardContent className="p-6 flex items-start gap-3">
            <ShieldAlert className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Accès refusé</p>
              <p className="text-sm text-red-800 mt-1">
                Cette page est réservée aux RH et administrateurs.
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
        <div className="flex items-center justify-center py-24"><Loader2 className="h-10 w-10 animate-spin text-gray-400" /></div>
      </ClientPageShell>
    )
  }

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-[1400px] mx-auto">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2" style={{ color: NAVY }}>
            <Wallet className="h-7 w-7" style={{ color: GOLD }} />
            Severance Calculator
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Workers&apos; Rights Act 2019 Section 70. 3 mois × ancienneté × max(dernier_mois, moyenne_12).
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base" style={{ color: NAVY }}>Nouvelle simulation</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm">Société</Label>
              <div className="h-10 px-3 py-2 text-sm rounded-md border bg-slate-50 flex items-center"
                style={{ color: NAVY }}>
                {societe?.nom || <span className="text-slate-500 italic">Sélectionnez une société dans le menu de gauche</span>}
              </div>
            </div>
            <div>
              <Label className="text-sm">Employé</Label>
              <Select value={employeId} onValueChange={setEmployeId}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  {employes.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.prenom} {e.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Date de licenciement</Label>
              <Input type="date" value={dateLicenciement} onChange={e => setDateLicenciement(e.target.value)} />
            </div>
            <div>
              <Label className="text-sm">Motif</Label>
              <Select value={motif} onValueChange={v => setMotif(v as MotifLicenciement)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(MOTIF_LABELS) as MotifLicenciement[]).map(k => (
                    <SelectItem key={k} value={k}>{MOTIF_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Déduction gratifications</Label>
              <Input type="number" step="100" value={dGratif} onChange={e => setDGratif(e.target.value)} />
            </div>
            <div>
              <Label className="text-sm">Déduction pension privée</Label>
              <Input type="number" step="100" value={dPension} onChange={e => setDPension(e.target.value)} />
            </div>
            <div>
              <Label className="text-sm">Déduction PRGF</Label>
              <Input type="number" step="100" value={dPrgf} onChange={e => setDPrgf(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label className="text-sm">Commentaire (optionnel)</Label>
              <Input value={commentaire} onChange={e => setCommentaire(e.target.value)} placeholder="Note interne sauvegardée avec la simulation" />
            </div>
            <div className="md:col-span-3 flex gap-2 justify-end pt-2">
              <Button variant="outline" disabled={calculating || !employeId} onClick={calculer}>
                {calculating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Calculator className="w-4 h-4 mr-2" />}
                Calculer (preview)
              </Button>
              <Button
                disabled={saving || !resultat?.eligible}
                onClick={sauvegarder}
                className="text-white"
                style={{ backgroundColor: NAVY }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Sauvegarder simulation
              </Button>
            </div>
          </CardContent>
        </Card>

        {feedback && (
          <div className={`rounded-md px-4 py-2 text-sm border ${feedback.startsWith('⚠') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-800 border-green-200'}`}>
            {feedback}
          </div>
        )}

        {resultat && (
          <Card className="border-2" style={{ borderColor: resultat.eligible ? GOLD + '50' : '#fca5a5' }}>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between" style={{ color: NAVY }}>
                <span>Résultat</span>
                {resultat.eligible ? (
                  <Badge className="bg-emerald-100 text-emerald-800">Éligible</Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-700">{getMotifNonEligibleLabel(resultat.motif_non_eligible)}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Line label="Ancienneté" value={formaterAnciennete(resultat.anciennete_annees, resultat.anciennete_mois_additionnels)} hint={`${resultat.anciennete_total_mois.toFixed(2)} mois au total`} />
              <Line label="Dernier mois complet" value={formaterSeverance(resultat.dernier_mois_remuneration)} />
              <Line label="Moyenne 12 derniers mois" value={formaterSeverance(resultat.moyenne_12_mois)} />
              <Line
                label="Base retenue"
                value={`${formaterSeverance(resultat.mois_remuneration_retenu)} (${resultat.base_mois_retenue === 'dernier_mois' ? 'dernier mois' : 'moyenne 12 mois'})`}
                hint="Règle WRA S.70 : on retient le plus élevé des deux."
              />
              <div className="pt-2 border-t">
                <Line label="Severance brut" value={formaterSeverance(resultat.severance_brut)} hint={`3 × ${formaterSeverance(resultat.mois_remuneration_retenu)} × (${resultat.anciennete_total_mois.toFixed(2)} / 12)`} />
                <Line label="Déductions" value={`− ${formaterSeverance(resultat.deduction_total)}`} warning={resultat.deduction_total > 0} />
              </div>
              <div className="pt-2 border-t-2 border-gray-300">
                <Line label="Severance net" value={formaterSeverance(resultat.severance_net)} big />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between" style={{ color: NAVY }}>
              <span>Historique simulations ({simulations.length})</span>
              <Select value={filtreStatut} onValueChange={setFiltreStatut}>
                <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous statuts</SelectItem>
                  <SelectItem value="simulation">Simulation</SelectItem>
                  <SelectItem value="valide">Validé</SelectItem>
                  <SelectItem value="paye">Payé</SelectItem>
                  <SelectItem value="annule">Annulé</SelectItem>
                </SelectContent>
              </Select>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingHistorique ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : simulations.length === 0 ? (
              <p className="text-center py-8 text-gray-500 text-sm">Aucune simulation.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employé</TableHead>
                      <TableHead>Date licenciement</TableHead>
                      <TableHead>Ancienneté</TableHead>
                      <TableHead>Motif</TableHead>
                      <TableHead className="text-right">Severance brut</TableHead>
                      <TableHead className="text-right">Déductions</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {simulations.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.employe_nom || s.employe_id.slice(0, 8)}</TableCell>
                        <TableCell className="text-xs">{new Date(s.date_licenciement).toLocaleDateString('fr-FR')}</TableCell>
                        <TableCell className="text-xs">{formaterAnciennete(s.anciennete_annees, s.anciennete_mois_additionnels)}</TableCell>
                        <TableCell className="text-xs">{s.motif_licenciement ? MOTIF_LABELS[s.motif_licenciement] : '—'}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formaterSeverance(s.severance_brut)}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-red-700">− {formaterSeverance(s.deduction_total)}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-bold" style={{ color: NAVY }}>
                          {formaterSeverance(s.severance_net)}
                        </TableCell>
                        <TableCell>
                          <Badge className={statutColor(s.statut)}>{STATUT_LABELS[s.statut]}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <a
                              href={`/api/rh/severance/${s.id}/pdf`}
                              target="_blank" rel="noopener noreferrer"
                              title="Télécharger PDF officiel"
                            >
                              <Button size="sm" variant="ghost" className="h-7">
                                <FileDown className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                            {s.statut === 'simulation' && userRole === 'admin' && (
                              <Button
                                size="sm" variant="ghost" className="h-7 text-emerald-600"
                                onClick={() => rowAction(s.id, 'valider')}
                                disabled={rowLoading === s.id}
                                title="Valider"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {s.statut !== 'annule' && userRole === 'admin' && (
                              <Button
                                size="sm" variant="ghost" className="h-7 text-red-600"
                                onClick={() => rowAction(s.id, 'supprimer')}
                                disabled={rowLoading === s.id}
                                title="Annuler (soft delete)"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-amber-300 bg-amber-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 space-y-1">
              <p className="font-semibold">Rappels WRA 2019 S.70</p>
              <p>Éligibilité : minimum 12 mois d&apos;ancienneté continue + licenciement non justifié ou redundancy injustifiée.</p>
              <p>La simulation utilise les bulletins de paie valides/comptabilisés/payés. Si aucun bulletin n&apos;est trouvé, dernier_mois / moyenne_12 sont à 0 — à compléter manuellement si besoin.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ClientPageShell>
  )
}

function Line({ label, value, hint, warning, big }: { label: string; value: string; hint?: string; warning?: boolean; big?: boolean }) {
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

function statutColor(s: string): string {
  switch (s) {
    case 'simulation': return 'bg-blue-100 text-blue-800'
    case 'valide': return 'bg-emerald-100 text-emerald-800'
    case 'paye': return 'bg-purple-100 text-purple-800'
    case 'annule': return 'bg-gray-100 text-gray-500'
    default: return 'bg-gray-100'
  }
}
