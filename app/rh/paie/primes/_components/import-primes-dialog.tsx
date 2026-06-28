'use client'

/**
 * ImportPrimesDialog — Dialog 3-étapes pour importer un .xlsx de
 * primes commerciales mensuelles dans /rh/paie/primes.
 *
 * Workflow :
 *   1. Sélection fichier (drag-and-drop ou file picker)
 *   2. Preview matching : tableau Excel × employés résolus, avec
 *      Select de correction et action "-- ignorer --"
 *   3. Confirmation : récap + POST /api/rh/paie/primes/import
 *
 * Le composant gère son propre état d'ouverture (Dialog interne).
 * Bouton désactivé si societeId === null.
 *
 * Sécurité : tout le matching et la résolution employé est ré-validé
 * côté serveur dans la route + lib (employe_id appartient bien à la
 * société, montant > 0 et < 1M, bulletins non verrouillés). Le front
 * n'est qu'une UX assistante.
 */

import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  FileSpreadsheet,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { notifySuccess, notifyError, notifyWarning } from "@/lib/utils/toast"
import { t, getLocale } from "@/lib/i18n"
import * as XLSX from 'xlsx'

import {
  previewMatchingExcel,
  type EmployeShort,
  type LigneExcelBrute,
  type MatchingStatus,
} from '@/lib/rh/import-primes'

// ─── Types internes ─────────────────────────────────────────────────────────

type EtapeImport = 'selection' | 'preview' | 'confirmation'

/** Représentation locale d'une ligne dans la preview UI :
 *  - employe_id_choisi : '' = ignorer / pas encore choisi
 *  - modified          : l'utilisateur a touché le Select au moins 1×
 *  - statut_initial    : statut renvoyé par previewMatchingExcel */
interface LignePreviewLocal {
  ligne_excel: number
  nom_excel: string
  montant: number
  candidats: Array<{ id: string; nom_complet: string }>
  employe_id_choisi: string
  modified: boolean
  statut_initial: MatchingStatus
}

interface Props {
  societeId: string | null
  periode: string             // 'YYYY-MM-01' (sélecteur page parente)
  onImportSuccess?: () => void
}

// ─── Constantes ─────────────────────────────────────────────────────────────

// Radix Select interdit la value '' → on utilise un sentinel pour
// "-- ignorer --" et on mappe vers '' dans l'état interne.
const IGNORE_SENTINEL = '__ignore__'

const MOIS_KEYS = [
  'uirh.importprimes.mois_01', 'uirh.importprimes.mois_02', 'uirh.importprimes.mois_03',
  'uirh.importprimes.mois_04', 'uirh.importprimes.mois_05', 'uirh.importprimes.mois_06',
  'uirh.importprimes.mois_07', 'uirh.importprimes.mois_08', 'uirh.importprimes.mois_09',
  'uirh.importprimes.mois_10', 'uirh.importprimes.mois_11', 'uirh.importprimes.mois_12',
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtMUR(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-MU', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(n) + ' MUR'
}

function formaterPeriode(periode: string, locale: ReturnType<typeof getLocale>): string {
  const idx = parseInt(periode.slice(5, 7), 10) - 1
  const annee = periode.slice(0, 4)
  const key = MOIS_KEYS[idx]
  return key ? `${t(key, locale)} ${annee}` : periode
}

/** Tente de détecter une période 'YYYY-MM' depuis la cellule B1. */
function detectPeriodeFromCell(cell: unknown): string | null {
  if (cell instanceof Date && !isNaN(cell.getTime())) {
    const y = cell.getFullYear()
    const m = String(cell.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  }
  if (typeof cell === 'string') {
    const m = cell.match(/^(\d{4})-(\d{1,2})/)
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`
  }
  return null
}

/** Parse défensif d'un montant Excel. */
function parseMontant(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v !== 'string') return NaN
  const s = v.trim().replace(/[^\d,.-]/g, '')
  if (!s) return NaN
  // Si , et . : le dernier rencontré est le séparateur décimal
  if (s.includes(',') && s.includes('.')) {
    const lastComma = s.lastIndexOf(',')
    const lastDot = s.lastIndexOf('.')
    const cleaned = lastComma > lastDot
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '')
    return Number(cleaned)
  }
  // Seulement , → décimal (format FR)
  if (s.includes(',')) return Number(s.replace(',', '.'))
  return Number(s)
}

interface ParseResult {
  lignes: LigneExcelBrute[]
  periode_excel: string | null    // info uniquement, ne dicte pas la période bulletin
}

/** Parse le 1er sheet de l'arrayBuffer Excel. Retourne null en cas
 *  d'erreur / fichier vide. */
function parseExcelBuffer(buf: ArrayBuffer): ParseResult | null {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  if (!wb.SheetNames || wb.SheetNames.length === 0) return null
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return null
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
    blankrows: false,
  })
  if (rows.length < 2) return null

  const periodeExcel = detectPeriodeFromCell(rows[0]?.[1])
  const lignes: LigneExcelBrute[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r) continue
    const nom = String(r[0] ?? '').trim()
    const montant = parseMontant(r[1])
    if (!nom) continue
    if (!Number.isFinite(montant) || montant <= 0) continue
    lignes.push({
      ligne_excel: i + 1,        // ligne 1-indexed côté Excel (header = ligne 1)
      nom_complet: nom,
      montant: Math.round(montant * 100) / 100,
    })
  }
  return { lignes, periode_excel: periodeExcel }
}

/** Statut affiché pour une ligne preview locale. */
type StatutAffichage = 'ok' | 'ambigu' | 'ignorer' | 'non_matche'

function statutAffichage(l: LignePreviewLocal): StatutAffichage {
  if (l.employe_id_choisi === '') {
    if (!l.modified && l.statut_initial === 'non_matche') return 'non_matche'
    return 'ignorer'
  }
  if (l.modified) return 'ok'
  return l.statut_initial === 'ok' ? 'ok' : 'ambigu'
}

// ─── Composant principal ────────────────────────────────────────────────────

export function ImportPrimesDialog({
  societeId,
  periode,
  onImportSuccess,
}: Props) {
  const locale = getLocale()
  const [open, setOpen] = useState(false)
  const [etape, setEtape] = useState<EtapeImport>('selection')
  const [file, setFile] = useState<File | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [periodeExcel, setPeriodeExcel] = useState<string | null>(null)
  const [employes, setEmployes] = useState<EmployeShort[]>([])
  const [previewLignes, setPreviewLignes] = useState<LignePreviewLocal[]>([])
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const employesById = useMemo(() => {
    const m = new Map<string, EmployeShort>()
    for (const e of employes) m.set(e.id, e)
    return m
  }, [employes])

  // ─── Reset de l'état à l'ouverture/fermeture du dialog ──────────────────

  const resetAll = useCallback(() => {
    setEtape('selection')
    setFile(null)
    setParseError(null)
    setParsing(false)
    setPeriodeExcel(null)
    setEmployes([])
    setPreviewLignes([])
    setSubmitting(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleOpenChange = useCallback((v: boolean) => {
    setOpen(v)
    if (!v) resetAll()
  }, [resetAll])

  // ─── Étape 1 : sélection fichier ────────────────────────────────────────

  const handleFile = useCallback((f: File | null) => {
    setParseError(null)
    setFile(f)
  }, [])

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0] ?? null
    if (f) handleFile(f)
  }, [handleFile])

  const handleLireFichier = useCallback(async () => {
    if (!file || !societeId) return
    setParsing(true)
    setParseError(null)
    try {
      const buf = await file.arrayBuffer()
      const parsed = parseExcelBuffer(buf)
      if (!parsed) {
        setParseError(t('uirh.importprimes.err_fichier_invalide', locale))
        setParsing(false)
        return
      }
      if (parsed.lignes.length === 0) {
        setParseError(t('uirh.importprimes.err_aucune_ligne', locale))
        setParsing(false)
        return
      }

      // Charger employés actifs de la société.
      const res = await fetch(
        `/api/rh/employes?societe_id=${encodeURIComponent(societeId)}`,
      )
      if (!res.ok) {
        setParseError(t('uirh.importprimes.err_charger_employes', locale))
        setParsing(false)
        return
      }
      const data = await res.json()
      const empList: EmployeShort[] = ((data.employes ?? []) as Array<{
        id: string
        nom: string | null
        prenom: string | null
        actif?: boolean
        date_depart?: string | null
      }>)
        .filter(e => e.actif !== false && !e.date_depart)
        .map(e => ({
          id: e.id,
          nom: e.nom ?? '',
          prenom: e.prenom ?? '',
        }))

      setEmployes(empList)
      setPeriodeExcel(parsed.periode_excel)

      // Matching côté lib (pure, pas de DB).
      const matching = previewMatchingExcel(parsed.lignes, empList)
      const local: LignePreviewLocal[] = matching.map(m => ({
        ligne_excel: m.ligne_excel,
        nom_excel: m.nom_excel,
        montant: m.montant,
        candidats: m.candidats,
        employe_id_choisi: m.employe_id_suggere ?? '',
        modified: false,
        statut_initial: m.statut,
      }))
      setPreviewLignes(local)
      setEtape('preview')
    } catch (e) {
      setParseError(e instanceof Error ? e.message : t('uirh.importprimes.err_lecture', locale))
    } finally {
      setParsing(false)
    }
  }, [file, societeId, locale])

  // ─── Étape 2 : modifications du Select par ligne ────────────────────────

  const updateLigneEmploye = useCallback((idx: number, value: string) => {
    setPreviewLignes(prev => {
      const next = [...prev]
      const target = next[idx]
      if (!target) return prev
      next[idx] = {
        ...target,
        employe_id_choisi: value === IGNORE_SENTINEL ? '' : value,
        modified: true,
      }
      return next
    })
  }, [])

  const continueDisabled = useMemo(() => {
    return previewLignes.some(l => statutAffichage(l) === 'non_matche')
  }, [previewLignes])

  // ─── Étape 3 : récap + POST ─────────────────────────────────────────────

  const lignesAEnvoyer = useMemo(() => {
    return previewLignes
      .filter(l => l.employe_id_choisi !== '')
      .map(l => ({
        employe_id: l.employe_id_choisi,
        montant: l.montant,
      }))
  }, [previewLignes])

  const totalMontant = useMemo(
    () => lignesAEnvoyer.reduce((s, l) => s + l.montant, 0),
    [lignesAEnvoyer],
  )

  const nbIgnorees = previewLignes.length - lignesAEnvoyer.length

  const handleConfirmer = useCallback(async () => {
    if (!societeId) return
    // UX : si toutes les lignes sont sur "-- ignorer --", pas de POST
    // (économie audit log + message clair). Le backend court-circuite
    // déjà 200 sur lignes:[] (STEP D.0.1) mais autant ne pas le solliciter.
    if (lignesAEnvoyer.length === 0) {
      toast.info(t('uirh.importprimes.toast_aucune_ligne', locale))
      handleOpenChange(false)
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/rh/paie/primes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societe_id: societeId,
          periode,
          lignes: lignesAEnvoyer,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const nbBloques = Array.isArray(data.bulletins_bloques) ? data.bulletins_bloques.length : 0
        const nbImp = data.nb_importes ?? 0
        if (nbBloques > 0) {
          notifyWarning(
            t('uirh.importprimes.notif_importees_bloquees', locale)
              .replace('{nb}', String(nbImp))
              .replace('{nbBloques}', String(nbBloques)),
          )
        } else if (Array.isArray(data.warnings) && data.warnings.length > 0) {
          notifySuccess(
            t('uirh.importprimes.notif_importees_warnings', locale)
              .replace('{nb}', String(nbImp))
              .replace('{nbWarn}', String(data.warnings.length)),
          )
        } else {
          notifySuccess(
            t('uirh.importprimes.notif_importees_succes', locale)
              .replace('{nb}', String(nbImp)),
          )
        }
        onImportSuccess?.()
        handleOpenChange(false)
        return
      }
      // Erreur HTTP
      if (res.status === 400) {
        if (Array.isArray(data.details) && data.details.length > 0) {
          const first = data.details[0]
          notifyError(t('uirh.importprimes.err_format_invalide', locale), `${first.path} — ${first.error}`)
        } else {
          notifyError(t('uirh.importprimes.notif_title', locale), data.error ?? t('uirh.importprimes.err_validation', locale))
        }
      } else if (res.status === 401) {
        notifyError(t('uirh.importprimes.notif_title', locale), t('uirh.importprimes.err_session', locale))
      } else if (res.status === 403) {
        notifyError(t('uirh.importprimes.notif_title', locale), t('uirh.importprimes.err_acces', locale))
      } else {
        notifyError(t('uirh.importprimes.notif_title', locale), data.error ?? t('uirh.importprimes.err_inconnue', locale))
      }
    } catch (e: unknown) {
      notifyError(t('uirh.importprimes.notif_title', locale), e instanceof Error ? e : t('uirh.importprimes.err_reseau', locale))
    } finally {
      setSubmitting(false)
    }
  }, [societeId, periode, lignesAEnvoyer, onImportSuccess, handleOpenChange, locale])

  // ─── Compteurs récap ─────────────────────────────────────────────────────

  const compteursAffichage = useMemo(() => {
    let ok = 0, ambigu = 0, ignorer = 0, nonMatche = 0
    for (const l of previewLignes) {
      switch (statutAffichage(l)) {
        case 'ok': ok++; break
        case 'ambigu': ambigu++; break
        case 'ignorer': ignorer++; break
        case 'non_matche': nonMatche++; break
      }
    }
    return { ok, ambigu, ignorer, nonMatche }
  }, [previewLignes])

  // ─── Rendu ───────────────────────────────────────────────────────────────

  const buttonDisabled = !societeId

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={buttonDisabled}
          title={buttonDisabled
            ? t('uirh.importprimes.btn_disabled_title', locale)
            : undefined}
        >
          <Upload className="w-4 h-4 mr-2" />
          {t('uirh.importprimes.btn_importer', locale)}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('uirh.importprimes.dialog_title', locale)}
            {etape === 'preview' && ` ${t('uirh.importprimes.etape_2', locale)}`}
            {etape === 'confirmation' && ` ${t('uirh.importprimes.etape_3', locale)}`}
          </DialogTitle>
        </DialogHeader>

        {etape === 'selection' && (
          <div className="space-y-4 py-4">
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
            >
              <FileSpreadsheet className="w-10 h-10 mx-auto text-gray-400 mb-3" />
              {file ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-800 flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(file.size / 1024).toFixed(1)} {t('uirh.importprimes.kb_changer', locale)}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-700">
                    {t('uirh.importprimes.drop_zone', locale)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t('uirh.importprimes.drop_hint', locale)}
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => handleFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {parseError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{parseError}</p>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                {t('uirh.importprimes.annuler', locale)}
              </Button>
              <Button
                type="button"
                onClick={handleLireFichier}
                disabled={!file || parsing}
              >
                {parsing
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : null}
                {t('uirh.importprimes.lire_fichier', locale)}
              </Button>
            </DialogFooter>
          </div>
        )}

        {etape === 'preview' && (
          <div className="space-y-3 py-2">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm space-y-1">
              <p className="text-blue-900">
                {t('uirh.importprimes.preview_intro_avant', locale)} <strong>{lignesAEnvoyer.length}</strong> {t('uirh.importprimes.preview_intro_milieu', locale)} <strong>{formaterPeriode(periode, locale)}</strong>.
              </p>
              {periodeExcel && periodeExcel !== periode.slice(0, 7) && (
                <p className="text-xs text-blue-700">
                  {t('uirh.importprimes.preview_excel_avant', locale)} <strong>{formaterPeriode(`${periodeExcel}-01`, locale)}</strong>. {t('uirh.importprimes.preview_excel_apres', locale)}
                </p>
              )}
            </div>
            <div className="text-xs text-gray-600 flex gap-3">
              <span><span className="text-green-600 font-semibold">{compteursAffichage.ok}</span> {t('uirh.importprimes.cnt_ok', locale)}</span>
              <span><span className="text-amber-600 font-semibold">{compteursAffichage.ambigu}</span> {t('uirh.importprimes.cnt_ambigu', locale)}</span>
              <span><span className="text-gray-500 font-semibold">{compteursAffichage.ignorer}</span> {t('uirh.importprimes.cnt_ignore', locale)}</span>
              <span><span className="text-red-600 font-semibold">{compteursAffichage.nonMatche}</span> {t('uirh.importprimes.cnt_non_matche', locale)}</span>
            </div>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('uirh.importprimes.th_nom_excel', locale)}</TableHead>
                    <TableHead className="min-w-[220px]">{t('uirh.importprimes.th_employe_matche', locale)}</TableHead>
                    <TableHead className="text-right w-[120px]">{t('uirh.importprimes.th_montant', locale)}</TableHead>
                    <TableHead className="w-[120px]">{t('uirh.importprimes.th_statut', locale)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewLignes.map((l, idx) => {
                    const statut = statutAffichage(l)
                    const selectValue = l.employe_id_choisi === ''
                      ? IGNORE_SENTINEL
                      : l.employe_id_choisi
                    return (
                      <TableRow key={`${l.ligne_excel}-${idx}`}>
                        <TableCell className="text-sm">{l.nom_excel}</TableCell>
                        <TableCell>
                          <Select
                            value={selectValue}
                            onValueChange={v => updateLigneEmploye(idx, v)}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder={t('uirh.importprimes.ph_choisir', locale)} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={IGNORE_SENTINEL}>
                                {t('uirh.importprimes.ignorer_ligne', locale)}
                              </SelectItem>
                              {employes.map(e => (
                                <SelectItem key={e.id} value={e.id}>
                                  {e.prenom} {e.nom}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {fmtMUR(l.montant)}
                        </TableCell>
                        <TableCell>
                          {statut === 'ok' && (
                            <span className="inline-flex items-center gap-1 text-xs text-green-700">
                              <CheckCircle className="w-3.5 h-3.5" /> {t('uirh.importprimes.statut_ok', locale)}
                            </span>
                          )}
                          {statut === 'ambigu' && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                              <AlertCircle className="w-3.5 h-3.5" /> {t('uirh.importprimes.statut_ambigu', locale)}
                            </span>
                          )}
                          {statut === 'ignorer' && (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                              {t('uirh.importprimes.statut_ignoree', locale)}
                            </span>
                          )}
                          {statut === 'non_matche' && (
                            <span className="inline-flex items-center gap-1 text-xs text-red-700">
                              <XCircle className="w-3.5 h-3.5" /> {t('uirh.importprimes.statut_non_matche', locale)}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEtape('selection')}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                {t('uirh.importprimes.retour', locale)}
              </Button>
              <Button
                type="button"
                onClick={() => setEtape('confirmation')}
                disabled={continueDisabled}
              >
                {t('uirh.importprimes.continuer', locale)}
              </Button>
            </DialogFooter>
          </div>
        )}

        {etape === 'confirmation' && (
          <div className="space-y-4 py-2">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-2">
              <div className="text-sm">
                <span className="text-gray-600">{t('uirh.importprimes.recap_periode', locale)} </span>
                <span className="font-semibold">{formaterPeriode(periode, locale)}</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-600">{t('uirh.importprimes.recap_primes', locale)} </span>
                <span className="font-semibold">{lignesAEnvoyer.length}</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-600">{t('uirh.importprimes.recap_total', locale)} </span>
                <span className="font-semibold tabular-nums">{fmtMUR(totalMontant)}</span>
              </div>
              {nbIgnorees > 0 && (
                <div className="text-sm">
                  <span className="text-gray-600">{t('uirh.importprimes.recap_ignorees', locale)} </span>
                  <span className="font-semibold">{nbIgnorees}</span>
                </div>
              )}
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900">
                {t('uirh.importprimes.warn_maj', locale)}
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEtape('preview')}
                disabled={submitting}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                {t('uirh.importprimes.retour', locale)}
              </Button>
              <Button
                type="button"
                onClick={handleConfirmer}
                disabled={submitting}
              >
                {submitting
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : null}
                {lignesAEnvoyer.length === 0
                  ? t('uirh.importprimes.btn_aucune_ligne', locale)
                  : t(lignesAEnvoyer.length > 1 ? 'uirh.importprimes.btn_confirmer_plural' : 'uirh.importprimes.btn_confirmer_singular', locale)
                      .replace('{n}', String(lignesAEnvoyer.length))}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
