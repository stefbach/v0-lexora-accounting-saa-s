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
  Loader2, ShieldAlert, UserMinus, Calculator, Save, FileDown, Trash2,
  AlertTriangle, LogOut,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale, type Locale } from "@/lib/i18n"
import {
  formaterMUR, MOTIF_EXIT_LABELS,
  type ExitStatementPrgf, type MotifExit, type StatutExit,
} from "@/lib/rh/declarations-mra"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Societe { id: string; nom: string }
interface Employe { id: string; nom: string; prenom: string; societe_id: string }

export default function ExitStatementsPage() {
  const locale: Locale = getLocale()
  const [societes, setSocietes] = useState<Societe[]>([])
  const [societeId, setSocieteId] = useState<string>("")
  const [employes, setEmployes] = useState<Employe[]>([])
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [userRole, setUserRole] = useState<string>("")

  // Nouveau exit statement
  const [employeId, setEmployeId] = useState<string>("")
  const [dateExit, setDateExit] = useState<string>(new Date().toISOString().slice(0, 10))
  const [motif, setMotif] = useState<MotifExit>("retraite")
  const [preview, setPreview] = useState<{ dernier: number; moyenne: number; retenu: number } | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const [exits, setExits] = useState<ExitStatementPrgf[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [rowLoading, setRowLoading] = useState<string | null>(null)

  // Dialog édition gratuity
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editGratuity, setEditGratuity] = useState<string>("0")
  const [editDatePaiement, setEditDatePaiement] = useState<string>("")
  const [editPastServices, setEditPastServices] = useState<string>("0")

  const isAdmin = userRole === 'admin'

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

  // Charger les employés de la société
  useEffect(() => {
    if (!societeId) return
    ;(async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const sb = createClient()
        const { data } = await sb.from('employes')
          .select('id, nom, prenom, societe_id')
          .eq('societe_id', societeId)
          .order('nom')
        setEmployes((data || []) as Employe[])
      } catch { setEmployes([]) }
    })()
  }, [societeId])

  const loadExits = useCallback(async () => {
    if (!societeId) return
    setLoadingList(true)
    try {
      const r = await fetch(`/api/rh/prgf/exit-statements?societe_id=${societeId}`)
      const d = r.ok ? await r.json() : { exit_statements: [] }
      setExits(d?.exit_statements || [])
    } catch { setExits([]) }
    finally { setLoadingList(false) }
  }, [societeId])

  useEffect(() => { loadExits() }, [loadExits])

  const handleCalculer = useCallback(async () => {
    if (!employeId || !dateExit) return
    setCalculating(true); setFeedback(null); setPreview(null)
    try {
      const r = await fetch(
        `/api/rh/prgf/exit-statements?preview_employe_id=${employeId}&preview_date=${dateExit}`,
      )
      const d = await r.json()
      if (!r.ok) { setFeedback(`❌ ${d.error}`); return }
      setPreview(d.preview)
    } catch (e: any) { setFeedback(`❌ ${e?.message}`) }
    finally { setCalculating(false) }
  }, [employeId, dateExit])

  const handleSauvegarder = useCallback(async () => {
    if (!employeId || !societeId || !dateExit || !motif) return
    setSaving(true); setFeedback(null)
    try {
      const r = await fetch('/api/rh/prgf/exit-statements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employe_id: employeId, societe_id: societeId,
          date_exit: dateExit, motif_exit: motif,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setFeedback(`❌ ${d.error}`); return }
      setFeedback('✅ Exit statement créé')
      setPreview(null); setEmployeId("")
      loadExits()
    } catch (e: any) { setFeedback(`❌ ${e?.message}`) }
    finally { setSaving(false) }
  }, [employeId, societeId, dateExit, motif, loadExits])

  const openEdit = useCallback((ex: ExitStatementPrgf) => {
    setEditingId(ex.id)
    setEditGratuity(String(ex.gratuity_paid_mur || 0))
    setEditDatePaiement(ex.gratuity_date_paiement || "")
    setEditPastServices(String(ex.past_services_due_mur || 0))
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingId) return
    setRowLoading(editingId)
    try {
      const r = await fetch(`/api/rh/prgf/exit-statements/${editingId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gratuity_paid_mur: Number(editGratuity) || 0,
          gratuity_date_paiement: editDatePaiement || null,
          past_services_due_mur: Number(editPastServices) || 0,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setFeedback(`❌ ${d.error}`); return }
      setEditingId(null)
      loadExits()
    } catch (e: any) { setFeedback(`❌ ${e?.message}`) }
    finally { setRowLoading(null) }
  }, [editingId, editGratuity, editDatePaiement, editPastServices, loadExits])

  const handleDelete = useCallback(async (id: string) => {
    if (!isAdmin) return
    if (!confirm('Annuler cet exit statement ?')) return
    setRowLoading(id)
    try {
      const r = await fetch(`/api/rh/prgf/exit-statements/${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) { setFeedback(`❌ ${d.error}`); return }
      loadExits()
    } catch (e: any) { setFeedback(`❌ ${e?.message}`) }
    finally { setRowLoading(null) }
  }, [isAdmin, loadExits])

  const employesFiltres = useMemo(
    () => employes.filter(e => e.societe_id === societeId),
    [employes, societeId],
  )

  if (authorized === null) {
    return <ClientPageShell><div className="flex items-center gap-2 text-slate-500 p-6">
      <Loader2 className="h-4 w-4 animate-spin" /> {t('rhdiv.exit.loading', locale)}
    </div></ClientPageShell>
  }
  if (authorized === false) {
    return <ClientPageShell><Card><CardContent className="p-6 flex items-start gap-3">
      <ShieldAlert className="h-5 w-5 text-red-600 mt-1" />
      <div><div className="font-semibold">{t('rhdiv.exit.access_denied', locale)}</div>
      <div className="text-sm text-slate-600">{t('rhdiv.exit.access_msg', locale)}</div></div>
    </CardContent></Card></ClientPageShell>
  }

  const isPayable = motif === 'retraite' || motif === 'deces'

  return (
    <ClientPageShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" style={{ color: NAVY }}>
            <LogOut className="h-6 w-6" style={{ color: GOLD }} /> {t('rhdiv.exit.title', locale)}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('rhdiv.exit.subtitle', locale)}
          </p>
        </div>

        {/* Nouveau */}
        <Card>
          <CardHeader><CardTitle className="text-base">{t('rhdiv.exit.new_title', locale)}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-5 gap-3">
              <div>
                <Label>{t('rhdiv.exit.lbl_societe', locale)}</Label>
                <Select value={societeId} onValueChange={setSocieteId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('rhdiv.exit.lbl_employee', locale)}</Label>
                <Select value={employeId} onValueChange={setEmployeId}>
                  <SelectTrigger><SelectValue placeholder={t('rhdiv.exit.select', locale)} /></SelectTrigger>
                  <SelectContent>
                    {employesFiltres.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.prenom} {e.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('rhdiv.exit.lbl_exit_date', locale)}</Label>
                <Input type="date" value={dateExit} onChange={e => setDateExit(e.target.value)} />
              </div>
              <div>
                <Label>{t('rhdiv.exit.lbl_motif', locale)}</Label>
                <Select value={motif} onValueChange={v => setMotif(v as MotifExit)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MOTIF_EXIT_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={handleCalculer} disabled={calculating || !employeId}
                  variant="outline" className="gap-2">
                  {calculating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Calculator className="h-3 w-3" />}
                  {t('rhdiv.exit.btn_calculate', locale)}
                </Button>
                <Button onClick={handleSauvegarder} disabled={saving || !employeId}
                  className="gap-2" style={{ backgroundColor: NAVY, color: 'white' }}>
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  {t('rhdiv.exit.btn_save', locale)}
                </Button>
              </div>
            </div>

            {preview && (
              <div className="mt-3 grid md:grid-cols-3 gap-3">
                <div className="p-3 rounded border bg-slate-50">
                  <div className="text-xs text-slate-500">{t('rhdiv.exit.last_month', locale)}</div>
                  <div className="text-lg font-semibold">{formaterMUR(preview.dernier)}</div>
                </div>
                <div className="p-3 rounded border bg-slate-50">
                  <div className="text-xs text-slate-500">{t('rhdiv.exit.avg_12', locale)}</div>
                  <div className="text-lg font-semibold">{formaterMUR(preview.moyenne)}</div>
                </div>
                <div className="p-3 rounded border" style={{ borderColor: NAVY, backgroundColor: GOLD + '10' }}>
                  <div className="text-xs" style={{ color: NAVY }}>{t('rhdiv.exit.final_remuneration', locale)}</div>
                  <div className="text-lg font-bold" style={{ color: NAVY }}>{formaterMUR(preview.retenu)}</div>
                </div>
              </div>
            )}

            {isPayable && preview && (
              <div className="mt-3 text-xs text-amber-700 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Motif <strong>{MOTIF_EXIT_LABELS[motif]}</strong> — une gratuity doit être payée.
                Saisissez le montant après la sauvegarde via la colonne "Gratuity".
              </div>
            )}

            {feedback && <div className="mt-3 text-sm px-3 py-2 rounded border bg-slate-50">{feedback}</div>}
          </CardContent>
        </Card>

        {/* Liste */}
        <Card>
          <CardHeader><CardTitle className="text-base">{t('rhdiv.exit.list_title', locale)}</CardTitle></CardHeader>
          <CardContent>
            {loadingList ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('rhdiv.exit.loading', locale)}
              </div>
            ) : exits.length === 0 ? (
              <div className="text-sm text-slate-500 italic">{t('rhdiv.exit.no_exit', locale)}</div>
            ) : (
              <div className="overflow-x-auto border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('rhdiv.exit.col_employee', locale)}</TableHead>
                      <TableHead>{t('rhdiv.exit.col_exit_date', locale)}</TableHead>
                      <TableHead>{t('rhdiv.exit.col_motif', locale)}</TableHead>
                      <TableHead className="text-right">{t('rhdiv.exit.col_final_rem', locale)}</TableHead>
                      <TableHead className="text-right">{t('rhdiv.exit.col_gratuity', locale)}</TableHead>
                      <TableHead>{t('rhdiv.exit.col_deadline', locale)}</TableHead>
                      <TableHead>{t('rhdiv.exit.col_status', locale)}</TableHead>
                      <TableHead className="text-right">{t('rhdiv.exit.col_actions', locale)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exits.map(ex => (
                      <TableRow key={ex.id}>
                        <TableCell className="font-medium">{ex.employe_nom}</TableCell>
                        <TableCell>{ex.date_exit}</TableCell>
                        <TableCell className="text-xs">{MOTIF_EXIT_LABELS[ex.motif_exit]}</TableCell>
                        <TableCell className="text-right">{formaterMUR(ex.final_remuneration)}</TableCell>
                        <TableCell className="text-right">
                          {ex.gratuity_paid_mur > 0
                            ? formaterMUR(ex.gratuity_paid_mur)
                            : <span className="text-slate-400 italic text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-xs">{ex.gratuity_return_deadline || '—'}</TableCell>
                        <TableCell><ExitStatutBadge statut={ex.statut} locale={locale} /></TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(ex)}>
                              <UserMinus className="h-3 w-3" />
                            </Button>
                            <a href={`/api/rh/prgf/exit-statements/${ex.id}/gratuity-return`}
                              target="_blank" rel="noreferrer">
                              <Button size="sm" variant="ghost">
                                <FileDown className="h-3 w-3" />
                              </Button>
                            </a>
                            {isAdmin && ex.statut !== 'annule' && (
                              <Button size="sm" variant="ghost" onClick={() => handleDelete(ex.id)}
                                disabled={rowLoading === ex.id}>
                                {rowLoading === ex.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Trash2 className="h-3 w-3 text-red-600" />}
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

        {/* Dialog édition gratuity */}
        {editingId && (
          <Card className="border-2" style={{ borderColor: GOLD }}>
            <CardHeader><CardTitle className="text-base">{t('rhdiv.exit.edit_title', locale)}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <Label>{t('rhdiv.exit.lbl_gratuity_mur', locale)}</Label>
                  <Input type="number" value={editGratuity} onChange={e => setEditGratuity(e.target.value)} />
                </div>
                <div>
                  <Label>{t('rhdiv.exit.lbl_pay_date', locale)}</Label>
                  <Input type="date" value={editDatePaiement} onChange={e => setEditDatePaiement(e.target.value)} />
                </div>
                <div>
                  <Label>{t('rhdiv.exit.lbl_past_services', locale)}</Label>
                  <Input type="number" value={editPastServices} onChange={e => setEditPastServices(e.target.value)} />
                </div>
              </div>
              <div className="text-xs text-slate-600">
                Si date paiement saisie, la deadline du gratuity return est calculée à +15 jours.
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveEdit} disabled={rowLoading === editingId}
                  style={{ backgroundColor: NAVY, color: 'white' }}>
                  {rowLoading === editingId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  {t('rhdiv.exit.btn_save_short', locale)}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>{t('rhdiv.exit.btn_cancel', locale)}</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ClientPageShell>
  )
}

function ExitStatutBadge({ statut, locale }: { statut: StatutExit; locale: Locale }) {
  const cfg: Record<StatutExit, { bg: string; color: string; label: string }> = {
    brouillon: { bg: '#e5e7eb', color: '#1f2937', label: t('rhdiv.exit.status_brouillon', locale) },
    valide: { bg: '#dbeafe', color: '#1e40af', label: t('rhdiv.exit.status_valide', locale) },
    soumis_mra: { bg: '#dcfce7', color: '#166534', label: t('rhdiv.exit.status_soumis_mra', locale) },
    annule: { bg: '#fee2e2', color: '#991b1b', label: t('rhdiv.exit.status_annule', locale) },
  }
  const c = cfg[statut] || cfg.brouillon
  return <Badge style={{ backgroundColor: c.bg, color: c.color }} className="font-normal">{c.label}</Badge>
}
