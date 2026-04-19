'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { Loader2, Play, Eye, RefreshCcw, ArrowLeft } from 'lucide-react'

interface SocieteOption {
  id: string
  nom: string
}

interface PreviewSampleDoc {
  id: string
  nom_fichier: string
  type_document: string | null
  statut: string | null
  created_at: string
}

interface PreviewResult {
  ok: boolean
  count: number
  by_type: Record<string, number>
  by_statut: Record<string, number>
  estimated_duration_sec: number
  estimated_cost_usd: number
  sample: PreviewSampleDoc[]
}

interface JobStats {
  auto_approve: number
  quick_review: number
  full_review: number
  reject: number
}

interface JobErrorEntry {
  document_id: string
  nom_fichier?: string | null
  error: string
  at: string
}

interface JobRow {
  id: string
  initiated_by: string | null
  societe_id: string | null
  total_documents: number
  processed_count: number
  success_count: number
  error_count: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  stats: JobStats | null
  errors?: JobErrorEntry[]
  started_at: string | null
  completed_at: string | null
  created_at: string
}

const DOC_TYPES: { value: string; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'facture_fournisseur', label: 'Facture fournisseur' },
  { value: 'facture_client', label: 'Facture client' },
  { value: 'releve_bancaire', label: 'Relevé bancaire' },
  { value: 'autre', label: 'Autre' },
]

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'En attente', cls: 'bg-gray-100 text-gray-800' },
    running: { label: 'En cours', cls: 'bg-blue-100 text-blue-800' },
    completed: { label: 'Terminé', cls: 'bg-green-100 text-green-800' },
    failed: { label: 'Échec', cls: 'bg-red-100 text-red-800' },
    cancelled: { label: 'Annulé', cls: 'bg-orange-100 text-orange-800' },
  }
  const c = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-800' }
  return <Badge variant="outline" className={c.cls}>{c.label}</Badge>
}

function fmtDateTime(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('fr-FR')
}

export default function BatchReanalyzePage() {
  // Filters
  const [societeId, setSocieteId] = useState<string>('all')
  const [typeDocument, setTypeDocument] = useState<string>('all')
  const [dateDebut, setDateDebut] = useState<string>('')
  const [dateFin, setDateFin] = useState<string>('')
  const [onlyErrors, setOnlyErrors] = useState<boolean>(false)
  const [onlyLowConfidence, setOnlyLowConfidence] = useState<boolean>(false)
  const [limit, setLimit] = useState<number>(100)
  const [concurrency, setConcurrency] = useState<number>(3)
  const [dryRun, setDryRun] = useState<boolean>(false)

  const [societes, setSocietes] = useState<SocieteOption[]>([])
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [launching, setLaunching] = useState(false)

  // Current job polling
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [currentJob, setCurrentJob] = useState<JobRow | null>(null)
  const [jobs, setJobs] = useState<JobRow[]>([])
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch société list
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetch('/api/admin/societes')
        if (!res.ok) return
        const data = (await res.json()) as { societes?: SocieteOption[] }
        if (!cancelled && data.societes) {
          setSocietes(data.societes.map((s) => ({ id: s.id, nom: s.nom })))
        }
      } catch {
        /* ignore */
      }
    }
    void run()
    return () => { cancelled = true }
  }, [])

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/documents/batch-reanalyze/status')
      if (!res.ok) return
      const data = (await res.json()) as { ok?: boolean; jobs?: JobRow[] }
      if (data.jobs) setJobs(data.jobs)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => { void fetchJobs() }, [fetchJobs])

  const filtersPayload = useMemo(
    () => ({
      societe_id: societeId !== 'all' ? societeId : undefined,
      type_document: typeDocument !== 'all' ? typeDocument : undefined,
      only_errors: onlyErrors,
      only_low_confidence: onlyLowConfidence,
      date_debut: dateDebut || undefined,
      date_fin: dateFin || undefined,
      limit,
    }),
    [societeId, typeDocument, onlyErrors, onlyLowConfidence, dateDebut, dateFin, limit]
  )

  const handlePreview = async () => {
    setPreviewing(true)
    setPreview(null)
    try {
      const params = new URLSearchParams()
      Object.entries(filtersPayload).forEach(([k, v]) => {
        if (v === undefined || v === null || v === '') return
        params.set(k, String(v))
      })
      const res = await fetch(`/api/admin/documents/batch-reanalyze?${params.toString()}`)
      const data = (await res.json()) as PreviewResult & { error?: string }
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'Erreur lors de la prévisualisation')
        return
      }
      setPreview(data)
      toast.success(`${data.count} document(s) correspondent aux filtres`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur réseau'
      toast.error(msg)
    } finally {
      setPreviewing(false)
    }
  }

  const handleLaunch = async () => {
    if (!preview || preview.count === 0) {
      toast.error('Prévisualise d’abord et vérifie qu’il y a des documents')
      return
    }
    if (!confirm(`Lancer le batch sur ${preview.count} document(s) ?\n\nCoût estimé ~${preview.estimated_cost_usd}$, durée ~${Math.round(preview.estimated_duration_sec / 60)} min.${dryRun ? '\n\nMODE DRY RUN — rien ne sera modifié en DB.' : ''}`)) return

    setLaunching(true)
    try {
      const body = { ...filtersPayload, concurrency, dry_run: dryRun }
      const res = await fetch('/api/admin/documents/batch-reanalyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { ok?: boolean; job_id?: string; total_documents?: number; error?: string; status?: string }
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'Erreur lors du lancement')
        return
      }
      if (data.job_id) {
        setCurrentJobId(data.job_id)
        toast.success(`Batch lancé — job ${data.job_id.slice(0, 8)}… (${data.total_documents} docs)`)
      } else {
        toast.success(data.status === 'completed' ? 'Aucun document à traiter' : 'Job créé')
      }
      void fetchJobs()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur réseau'
      toast.error(msg)
    } finally {
      setLaunching(false)
    }
  }

  // Poll current job
  useEffect(() => {
    const clear = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
    if (!currentJobId) { clear(); return }
    const pull = async () => {
      try {
        const res = await fetch(`/api/admin/documents/batch-reanalyze/status?job_id=${currentJobId}`)
        if (!res.ok) return
        const data = (await res.json()) as { ok?: boolean; job?: JobRow }
        if (data.job) {
          setCurrentJob(data.job)
          if (data.job.status !== 'running' && data.job.status !== 'pending') {
            clear()
            if (data.job.status === 'completed') toast.success('Batch terminé')
            else if (data.job.status === 'failed') toast.error('Batch en échec')
            void fetchJobs()
          }
        }
      } catch {
        /* ignore */
      }
    }
    void pull()
    pollRef.current = setInterval(pull, 2000)
    return clear
  }, [currentJobId, fetchJobs])

  const progressPct = currentJob && currentJob.total_documents > 0
    ? Math.round((currentJob.processed_count / currentJob.total_documents) * 100)
    : 0

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/admin/documents" className="hover:underline inline-flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Retour aux documents
            </Link>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold">Batch re-analyse OCR</h1>
          <p className="text-sm text-gray-500 mt-1">
            Relance l&apos;extraction IA sur un ensemble de documents pour tester les dernières règles
            de validation, le confidence-scorer et le workflow action.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void fetchJobs()}>
          <RefreshCcw className="w-4 h-4 mr-2" />
          Rafraîchir
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtres</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Société</label>
            <Select value={societeId} onValueChange={setSocieteId}>
              <SelectTrigger><SelectValue placeholder="Toutes les sociétés" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les sociétés</SelectItem>
                {societes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Type de document</label>
            <Select value={typeDocument} onValueChange={setTypeDocument}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Limite (max 500)</label>
            <Input
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(500, Number(e.target.value) || 100)))}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Date début</label>
            <Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Date fin</label>
            <Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Concurrence (1–5)</label>
            <Input
              type="number"
              min={1}
              max={5}
              value={concurrency}
              onChange={(e) => setConcurrency(Math.max(1, Math.min(5, Number(e.target.value) || 3)))}
            />
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Checkbox id="errs" checked={onlyErrors} onCheckedChange={(v) => setOnlyErrors(v === true)} />
            <label htmlFor="errs" className="text-sm cursor-pointer">Seulement les docs en erreur</label>
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Checkbox id="lowc" checked={onlyLowConfidence} onCheckedChange={(v) => setOnlyLowConfidence(v === true)} />
            <label htmlFor="lowc" className="text-sm cursor-pointer">Seulement confiance &lt; 70</label>
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Checkbox id="dry" checked={dryRun} onCheckedChange={(v) => setDryRun(v === true)} />
            <label htmlFor="dry" className="text-sm cursor-pointer">Dry run (ne pas modifier la DB)</label>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={handlePreview} disabled={previewing} variant="outline">
          {previewing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
          Prévisualiser
        </Button>
        <Button
          onClick={handleLaunch}
          disabled={!preview || preview.count === 0 || launching || !!currentJob && currentJob.status === 'running'}
        >
          {launching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
          Lancer le batch
        </Button>
      </div>

      {/* Preview */}
      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>Prévisualisation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded border p-3">
                <div className="text-xs text-gray-500">Documents</div>
                <div className="text-2xl font-bold">{preview.count}</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-gray-500">Durée estimée</div>
                <div className="text-2xl font-bold">{Math.round(preview.estimated_duration_sec / 60)} min</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-gray-500">Coût estimé</div>
                <div className="text-2xl font-bold">${preview.estimated_cost_usd}</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-gray-500">Concurrence</div>
                <div className="text-2xl font-bold">{concurrency}</div>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Par type</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(preview.by_type).map(([k, v]) => (
                    <Badge key={k} variant="outline">{k}: {v}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Par statut</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(preview.by_statut).map(([k, v]) => (
                    <Badge key={k} variant="outline">{k}: {v}</Badge>
                  ))}
                </div>
              </div>
            </div>
            {preview.sample.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Échantillon (max 20)</div>
                <div className="max-h-48 overflow-auto border rounded">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fichier</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Créé</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.sample.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-mono text-xs">{d.nom_fichier}</TableCell>
                          <TableCell>{d.type_document || '—'}</TableCell>
                          <TableCell>{d.statut || '—'}</TableCell>
                          <TableCell className="text-xs">{fmtDateTime(d.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Current job progress */}
      {currentJob && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Progression — job {currentJob.id.slice(0, 8)}… {statusBadge(currentJob.status)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progressPct} />
            <div className="text-sm text-gray-600">
              {currentJob.processed_count} / {currentJob.total_documents} traités
              ({progressPct}%) · ✓ {currentJob.success_count} · ✗ {currentJob.error_count}
            </div>
            {currentJob.stats && (
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="bg-green-50">auto_approve: {currentJob.stats.auto_approve}</Badge>
                <Badge variant="outline" className="bg-blue-50">quick_review: {currentJob.stats.quick_review}</Badge>
                <Badge variant="outline" className="bg-yellow-50">full_review: {currentJob.stats.full_review}</Badge>
                <Badge variant="outline" className="bg-red-50">reject: {currentJob.stats.reject}</Badge>
              </div>
            )}
            {currentJob.errors && currentJob.errors.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-gray-600">
                  {currentJob.errors.length} erreur(s)
                </summary>
                <div className="mt-2 max-h-48 overflow-auto border rounded p-2 space-y-1 text-xs">
                  {currentJob.errors.slice(-20).map((e, i) => (
                    <div key={i} className="font-mono">
                      <span className="text-red-600">{e.document_id.slice(0, 8)}</span>
                      {e.nom_fichier ? ` (${e.nom_fichier})` : ''}: {e.error}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {/* Past jobs */}
      <Card>
        <CardHeader>
          <CardTitle>Jobs récents</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-sm text-gray-500">Aucun job pour l&apos;instant.</div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Traités</TableHead>
                    <TableHead>Succès / Erreurs</TableHead>
                    <TableHead>Démarré</TableHead>
                    <TableHead>Terminé</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="font-mono text-xs">{j.id.slice(0, 8)}…</TableCell>
                      <TableCell>{statusBadge(j.status)}</TableCell>
                      <TableCell>{j.total_documents}</TableCell>
                      <TableCell>{j.processed_count}</TableCell>
                      <TableCell>
                        <span className="text-green-700">✓ {j.success_count}</span>
                        {' / '}
                        <span className="text-red-700">✗ {j.error_count}</span>
                      </TableCell>
                      <TableCell className="text-xs">{fmtDateTime(j.started_at)}</TableCell>
                      <TableCell className="text-xs">{fmtDateTime(j.completed_at)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setCurrentJobId(j.id)}
                        >
                          Voir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
