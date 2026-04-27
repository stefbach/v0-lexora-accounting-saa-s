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

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtMUR(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-MU', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(n) + ' MUR'
}

function formaterPeriode(periode: string): string {
  const idx = parseInt(periode.slice(5, 7), 10) - 1
  const annee = periode.slice(0, 4)
  const mois = MOIS_FR[idx]
  return mois ? `${mois} ${annee}` : periode
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
        setParseError('Fichier vide ou format invalide. Vérifiez que le fichier contient une 1ère feuille avec une colonne nom + une colonne montant.')
        setParsing(false)
        return
      }
      if (parsed.lignes.length === 0) {
        setParseError('Aucune ligne valide détectée dans le fichier (nom + montant > 0 attendus).')
        setParsing(false)
        return
      }

      // Charger employés actifs de la société.
      const res = await fetch(
        `/api/rh/employes?societe_id=${encodeURIComponent(societeId)}`,
      )
      if (!res.ok) {
        setParseError('Impossible de charger la liste des employés.')
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
      setParseError(e instanceof Error ? e.message : 'Erreur lors de la lecture du fichier')
    } finally {
      setParsing(false)
    }
  }, [file, societeId])

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
      toast.info('Aucune ligne à importer (toutes les lignes sont sur "ignorer").')
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
          toast.warning(
            `${nbImp} prime(s) importée(s). ${nbBloques} bulletin(s) verrouillé(s) ignoré(s) — déverrouillez avant de réessayer.`,
          )
        } else if (Array.isArray(data.warnings) && data.warnings.length > 0) {
          toast.success(
            `${nbImp} prime(s) importée(s). ${data.warnings.length} avertissement(s) non bloquant(s).`,
          )
        } else {
          toast.success(`${nbImp} prime(s) importée(s) avec succès.`)
        }
        onImportSuccess?.()
        handleOpenChange(false)
        return
      }
      // Erreur HTTP
      if (res.status === 400) {
        if (Array.isArray(data.details) && data.details.length > 0) {
          const first = data.details[0]
          toast.error(`Format invalide : ${first.path} — ${first.error}`)
        } else {
          toast.error(data.error ?? 'Validation échouée')
        }
      } else if (res.status === 401) {
        toast.error('Session expirée — reconnectez-vous.')
      } else if (res.status === 403) {
        toast.error("Accès refusé — vous n'avez pas le rôle requis.")
      } else {
        toast.error(data.error ?? "Erreur lors de l'import des primes.")
      }
    } catch {
      toast.error('Erreur réseau lors de l\'import.')
    } finally {
      setSubmitting(false)
    }
  }, [societeId, periode, lignesAEnvoyer, onImportSuccess, handleOpenChange])

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
            ? 'Sélectionnez une société pour importer des primes'
            : undefined}
        >
          <Upload className="w-4 h-4 mr-2" />
          Importer Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Importer des primes commerciales
            {etape === 'preview' && ' — Étape 2/3'}
            {etape === 'confirmation' && ' — Étape 3/3'}
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
                    {(file.size / 1024).toFixed(1)} KB · cliquez pour changer
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-700">
                    Glissez-déposez votre fichier Excel ici
                  </p>
                  <p className="text-xs text-gray-500">
                    ou cliquez pour parcourir · formats acceptés .xlsx, .xls
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
                Annuler
              </Button>
              <Button
                type="button"
                onClick={handleLireFichier}
                disabled={!file || parsing}
              >
                {parsing
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : null}
                Lire le fichier
              </Button>
            </DialogFooter>
          </div>
        )}

        {etape === 'preview' && (
          <div className="space-y-3 py-2">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm space-y-1">
              <p className="text-blue-900">
                Vous allez importer <strong>{lignesAEnvoyer.length}</strong> prime(s) dans le bulletin <strong>{formaterPeriode(periode)}</strong>.
              </p>
              {periodeExcel && periodeExcel !== periode.slice(0, 7) && (
                <p className="text-xs text-blue-700">
                  Le fichier Excel mentionne <strong>{formaterPeriode(`${periodeExcel}-01`)}</strong>. Vérifiez que c'est cohérent avec le mois de calcul des primes.
                </p>
              )}
            </div>
            <div className="text-xs text-gray-600 flex gap-3">
              <span><span className="text-green-600 font-semibold">{compteursAffichage.ok}</span> OK</span>
              <span><span className="text-amber-600 font-semibold">{compteursAffichage.ambigu}</span> ambigu(s)</span>
              <span><span className="text-gray-500 font-semibold">{compteursAffichage.ignorer}</span> ignoré(s)</span>
              <span><span className="text-red-600 font-semibold">{compteursAffichage.nonMatche}</span> non matché(s)</span>
            </div>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom Excel</TableHead>
                    <TableHead className="min-w-[220px]">Employé matché</TableHead>
                    <TableHead className="text-right w-[120px]">Montant</TableHead>
                    <TableHead className="w-[120px]">Statut</TableHead>
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
                              <SelectValue placeholder="-- choisir --" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={IGNORE_SENTINEL}>
                                — Ignorer cette ligne —
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
                              <CheckCircle className="w-3.5 h-3.5" /> OK
                            </span>
                          )}
                          {statut === 'ambigu' && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                              <AlertCircle className="w-3.5 h-3.5" /> Ambigu
                            </span>
                          )}
                          {statut === 'ignorer' && (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                              Ignorée
                            </span>
                          )}
                          {statut === 'non_matche' && (
                            <span className="inline-flex items-center gap-1 text-xs text-red-700">
                              <XCircle className="w-3.5 h-3.5" /> Non matché
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
                Retour
              </Button>
              <Button
                type="button"
                onClick={() => setEtape('confirmation')}
                disabled={continueDisabled}
              >
                Continuer
              </Button>
            </DialogFooter>
          </div>
        )}

        {etape === 'confirmation' && (
          <div className="space-y-4 py-2">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-2">
              <div className="text-sm">
                <span className="text-gray-600">Période bulletin : </span>
                <span className="font-semibold">{formaterPeriode(periode)}</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-600">Primes à importer : </span>
                <span className="font-semibold">{lignesAEnvoyer.length}</span>
              </div>
              <div className="text-sm">
                <span className="text-gray-600">Total : </span>
                <span className="font-semibold tabular-nums">{fmtMUR(totalMontant)}</span>
              </div>
              {nbIgnorees > 0 && (
                <div className="text-sm">
                  <span className="text-gray-600">Lignes ignorées : </span>
                  <span className="font-semibold">{nbIgnorees}</span>
                </div>
              )}
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900">
                Si une prime existe déjà pour un employé sur cette période, son montant sera mis à jour.
                L'approbation et l'intégration paie existantes seront préservées.
                Les bulletins verrouillés ou validés seront automatiquement exclus.
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
                Retour
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
                  ? 'Aucune ligne à importer'
                  : `Confirmer l'import (${lignesAEnvoyer.length} ligne${lignesAEnvoyer.length > 1 ? 's' : ''})`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
