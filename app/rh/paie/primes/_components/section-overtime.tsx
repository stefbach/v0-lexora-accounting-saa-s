'use client'

/**
 * SectionOvertime — UI de saisie des heures supplémentaires (mode
 * détaillé par date, depuis STEP 4.0.2).
 *
 * Trois zones fonctionnelles :
 *   1. Suggestions depuis le planning (informationnel, repliable)
 *   2. Alertes WRA légales (si une semaine planning > 55h)
 *   3. Tableau de saisie libre (employé × jour × OT 1.5×/2× × motif)
 *
 * Le composant reçoit `societeId` en prop depuis la page parent (qui le
 * tire de son <Select> société local). Pas de lecture cookie côté
 * composant — l'API côté serveur résout societe_id via query/body
 * prioritaire, fallback cookie (cf. STEP 3.6 / 4.bis.bis).
 *
 * Les taux 1.5×/2× affichés en live sont des estimations Tailwind. Le
 * serveur est autoritaire et recharge les taux depuis
 * parametres_paie_mra avant l'écriture.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertTriangle,
  Calculator,
  Check,
  Info,
  Loader2,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { notifySuccess, notifyError, notifyWarning } from "@/lib/utils/toast"

import type {
  OvertimeAlerteSemaine,
  OvertimeLigneEmploye,
  OvertimeLigneJour,
  SaveOvertimeResult,
} from '@/lib/rh/overtime'

// ─── Types ──────────────────────────────────────────────────────────────────

type LigneSaisie = {
  id: string                 // UUID local React, jamais envoyé au serveur
  employe_id: string         // '' si pas encore choisi
  date: string               // 'YYYY-MM-DD' ou ''
  heures_ot_1_5: number
  heures_ot_2: number
  motif: string
}

interface EmployeActif {
  id: string
  nom: string
  prenom: string
  salaire_base: number
}

interface Props {
  societeId: string | null   // null → état "société non sélectionnée"
}

// ─── Constantes ─────────────────────────────────────────────────────────────

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

// Taux WRA hardcodés UNIQUEMENT pour le calcul live côté client.
// Source de vérité : parametres_paie_mra.heures_sup_taux_normal et
// heures_sup_taux_majore, lus côté serveur par lib/rh/overtime.ts au
// moment du save.
// Si la MRA modifie ces valeurs, le client peut afficher temporairement
// un montant différent du montant réel persisté, jusqu'à mise à jour du
// composant.
const TAUX_NORMAL_AFFICHAGE = 1.5
const TAUX_MAJORE_AFFICHAGE = 2.0

const HEURES_PAR_MOIS = 195   // 45h × 52 / 12, formule WRA

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtMUR(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-MU', {
    maximumFractionDigits: 0,
  }).format(Math.round(n)) + ' MUR'
}

function fmtTaux(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-MU', {
    maximumFractionDigits: 2,
  }).format(n) + ' MUR/h'
}

function fmtHeures(n: number): string {
  if (!Number.isFinite(n)) return '—'
  // Affichage 1 décimale max, sans zéro inutile : "9", "4.5", "2.5"
  const s = n.toFixed(1)
  return (s.endsWith('.0') ? s.slice(0, -2) : s) + 'h'
}

function lastDayOfPeriode(periode: string): string {
  const [y, m] = periode.split('-').map(Number)
  if (!y || !m) return periode
  const last = new Date(y, m, 0).getDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}

function moisOptions(): Array<{ value: string; label: string }> {
  const now = new Date()
  const out: Array<{ value: string; label: string }> = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const label = `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`
    out.push({ value, label })
  }
  return out
}

function periodeCourante(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function newLigneSaisie(initial?: Partial<LigneSaisie>): LigneSaisie {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return {
    id,
    employe_id: '',
    date: '',
    heures_ot_1_5: 0,
    heures_ot_2: 0,
    motif: '',
    ...initial,
  }
}

function montantLigne(taux: number, ot15: number, ot2: number): number {
  return ot15 * taux * TAUX_NORMAL_AFFICHAGE + ot2 * taux * TAUX_MAJORE_AFFICHAGE
}

// ─── Composant principal ────────────────────────────────────────────────────

export function SectionOvertime({ societeId }: Props) {
  const [periode, setPeriode] = useState<string>(periodeCourante)
  const [employes, setEmployes] = useState<EmployeActif[]>([])
  const [loadingEmployes, setLoadingEmployes] = useState(false)
  const [preview, setPreview] = useState<OvertimeLigneEmploye[] | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saisies, setSaisies] = useState<LigneSaisie[]>([])
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [validatedSuggestions, setValidatedSuggestions] = useState<Set<string>>(
    () => new Set(),
  )

  // Charger employés actifs au changement de société.
  useEffect(() => {
    if (!societeId) {
      setEmployes([])
      setPreview(null)
      setSaisies([])
      setValidatedSuggestions(new Set())
      return
    }
    let cancelled = false
    setLoadingEmployes(true)
    fetch(`/api/rh/employes?societe_id=${encodeURIComponent(societeId)}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const list: EmployeActif[] = (data.employes ?? [])
          .filter((e: { actif?: boolean; date_depart?: string | null }) =>
            e.actif !== false && !e.date_depart)
          .map((e: {
            id: string
            nom: string | null
            prenom: string | null
            salaire_base: number | string | null
          }) => ({
            id: e.id,
            nom: e.nom ?? '',
            prenom: e.prenom ?? '',
            salaire_base: Number(e.salaire_base) || 0,
          }))
        setEmployes(list)
      })
      .catch(() => {
        if (!cancelled) notifyError('Charger employés')
      })
      .finally(() => {
        if (!cancelled) setLoadingEmployes(false)
      })
    return () => { cancelled = true }
  }, [societeId])

  // Reset preview + saisies si la période change (les dates seraient invalides).
  useEffect(() => {
    setPreview(null)
    setValidatedSuggestions(new Set())
  }, [periode])

  // FIX UX : charger automatiquement les OT déjà sauvegardés en BDD
  // (table heures_travaillees) au chargement et à chaque changement
  // de société/période. Avant on partait toujours vide → impression que
  // "rien n'a été saisi" alors que les données existaient.
  useEffect(() => {
    if (!societeId || !periode) {
      setSaisies([])
      return
    }
    const params = new URLSearchParams({ periode, societe_id: societeId })
    let cancelled = false
    fetch(`/api/rh/paie/ot/saisies?${params}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const rows = (data.saisies || []).map((h: any) => ({
          id: h.id || `db-${h.employe_id}-${h.date}`,
          employe_id: h.employe_id,
          date: h.date,
          heures_ot_1_5: Number(h.heures_ot_1_5) || 0,
          heures_ot_2: Number(h.heures_ot_2) || 0,
          motif: '',
        }))
        setSaisies(rows)
      })
      .catch(e => {
        if (!cancelled) console.warn('[OT] auto-load saisies failed:', e)
      })
    return () => { cancelled = true }
  }, [societeId, periode])

  // Maps de lookup rapide.
  const employesById = useMemo(() => {
    const m = new Map<string, EmployeActif>()
    for (const e of employes) m.set(e.id, e)
    return m
  }, [employes])

  const previewById = useMemo(() => {
    const m = new Map<string, OvertimeLigneEmploye>()
    if (preview) for (const p of preview) m.set(p.employe_id, p)
    return m
  }, [preview])

  const tauxFor = useCallback((employeId: string): number => {
    if (!employeId) return 0
    // 1) preview est la source officielle (taux calculé serveur identique)
    const fromPreview = previewById.get(employeId)
    if (fromPreview) return fromPreview.taux_horaire_base
    // 2) fallback : recalcul local depuis salaire_base
    const emp = employesById.get(employeId)
    if (!emp) return 0
    return emp.salaire_base > 0 ? emp.salaire_base / HEURES_PAR_MOIS : 0
  }, [employesById, previewById])

  // ─── Charger suggestions planning ─────────────────────────────────────────

  const handleChargerPreview = useCallback(async () => {
    if (!societeId) return
    setLoadingPreview(true)
    try {
      const url = `/api/rh/paie/ot/preview?societe_id=${encodeURIComponent(societeId)}&periode=${encodeURIComponent(periode)}`
      const res = await fetch(url)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur réseau' }))
        notifyError('Charger suggestions', err.error)
        return
      }
      const data = await res.json()
      setPreview(Array.isArray(data.lignes) ? data.lignes : [])
      setValidatedSuggestions(new Set())
    } catch (e: unknown) {
      notifyError('Charger suggestions', e instanceof Error ? e : 'Erreur réseau')
    } finally {
      setLoadingPreview(false)
    }
  }, [societeId, periode])

  // ─── Mutations sur saisies ────────────────────────────────────────────────

  const updateLigne = useCallback((id: string, patch: Partial<LigneSaisie>) => {
    setSaisies(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)))
  }, [])

  const removeLigne = useCallback((id: string) => {
    setSaisies(prev => prev.filter(l => l.id !== id))
  }, [])

  const addLigne = useCallback(() => {
    setSaisies(prev => [...prev, newLigneSaisie()])
  }, [])

  const validerSuggestion = useCallback((p: OvertimeLigneEmploye) => {
    const nouvellesLignes: LigneSaisie[] = []
    for (const j of p.jours) {
      if (j.heures_ot_1_5 > 0 || j.heures_ot_2 > 0) {
        nouvellesLignes.push(newLigneSaisie({
          employe_id: p.employe_id,
          date: j.date,
          heures_ot_1_5: j.heures_ot_1_5,
          heures_ot_2: j.heures_ot_2,
        }))
      }
    }
    if (nouvellesLignes.length === 0) return
    setSaisies(prev => [...prev, ...nouvellesLignes])
    setValidatedSuggestions(prev => {
      const next = new Set(prev)
      next.add(p.employe_id)
      return next
    })
  }, [])

  const validerToutesSuggestions = useCallback(() => {
    if (!preview) return
    for (const p of preview) {
      if (validatedSuggestions.has(p.employe_id)) continue
      if (p.total_ot_1_5_heures === 0 && p.total_ot_2_heures === 0) continue
      validerSuggestion(p)
    }
  }, [preview, validatedSuggestions, validerSuggestion])

  // ─── Save ─────────────────────────────────────────────────────────────────

  const lignesValidesPourSave = useMemo(() => {
    return saisies.filter(s =>
      s.employe_id !== '' && s.date !== ''
      && (s.heures_ot_1_5 > 0 || s.heures_ot_2 > 0))
  }, [saisies])

  const lignesIncompletes = useMemo(() => {
    return saisies.some(s =>
      (s.heures_ot_1_5 > 0 || s.heures_ot_2 > 0)
      && (s.employe_id === '' || s.date === ''))
  }, [saisies])

  const saveDisabled = saving
    || !societeId
    || lignesValidesPourSave.length === 0
    || lignesIncompletes

  const handleSave = useCallback(async () => {
    if (!societeId) return
    setSaving(true)
    try {
      // Group par employe_id
      const map = new Map<string, {
        employe_id: string
        jours: Array<{ date: string; heures_ot_1_5: number; heures_ot_2: number; motif?: string }>
      }>()
      for (const s of lignesValidesPourSave) {
        if (!map.has(s.employe_id)) {
          map.set(s.employe_id, { employe_id: s.employe_id, jours: [] })
        }
        const motifTrim = s.motif.trim()
        map.get(s.employe_id)!.jours.push({
          date: s.date,
          heures_ot_1_5: Number(s.heures_ot_1_5) || 0,
          heures_ot_2: Number(s.heures_ot_2) || 0,
          ...(motifTrim ? { motif: motifTrim } : {}),
        })
      }
      const body = {
        societe_id: societeId,
        periode,
        lignes: Array.from(map.values()),
      }
      const res = await fetch('/api/rh/paie/ot/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 200) {
        const result = (await res.json()) as SaveOvertimeResult
        const nbBul = result.nb_bulletins_maj ?? 0
        const nbUps = result.nb_lignes_upsert ?? 0
        if (result.bulletins_bloques && result.bulletins_bloques.length > 0) {
          notifyWarning(
            `${nbUps} OT enregistré(s), ${nbBul} bulletin(s) mis à jour. `
            + `${result.bulletins_bloques.length} bulletin(s) verrouillé(s) — déverrouiller pour les inclure.`,
          )
        } else if (result.warnings && result.warnings.length > 0) {
          notifySuccess(
            `${nbBul} bulletin(s) mis à jour (${result.warnings.length} avertissement(s) non bloquant(s)).`,
          )
        } else {
          notifySuccess(`${nbBul} bulletin(s) mis à jour, ${nbUps} ligne(s) journalière(s) enregistrée(s).`)
        }
        return
      }
      const err = await res.json().catch(() => ({ error: 'Erreur réseau' }))
      if (res.status === 400) {
        if (Array.isArray(err.erreurs_validation) && err.erreurs_validation.length > 0) {
          const detail = err.erreurs_validation
            .slice(0, 3)
            .map((e: { employe_id: string; raison: string }) => {
              const emp = employesById.get(e.employe_id)
              const nom = emp ? `${emp.prenom} ${emp.nom}`.trim() : e.employe_id
              return `${nom} : ${e.raison}`
            })
            .join(' | ')
          const reste = err.erreurs_validation.length - 3
          notifyError('Validation', `${detail}${reste > 0 ? ` (+${reste} autre(s))` : ''}`)
        } else if (Array.isArray(err.details) && err.details.length > 0) {
          notifyError('Format invalide', `${err.details[0].path} — ${err.details[0].error}`)
        } else {
          notifyError('Enregistrer OT', err.error ?? 'Erreur de validation')
        }
      } else if (res.status === 403) {
        notifyError('Enregistrer OT', "Accès refusé — rôle requis manquant")
      } else if (res.status === 401) {
        notifyError('Enregistrer OT', 'Session expirée — reconnectez-vous')
      } else {
        notifyError('Enregistrer OT', err.error ?? "Erreur inconnue")
      }
    } catch (e: unknown) {
      notifyError('Enregistrer OT', e instanceof Error ? e : 'Erreur réseau')
    } finally {
      setSaving(false)
    }
  }, [societeId, periode, lignesValidesPourSave, employesById])

  // ─── Calculs récap ────────────────────────────────────────────────────────

  const totalMontant = useMemo(() => {
    return lignesValidesPourSave.reduce((acc, s) => {
      const taux = tauxFor(s.employe_id)
      return acc + montantLigne(taux, s.heures_ot_1_5, s.heures_ot_2)
    }, 0)
  }, [lignesValidesPourSave, tauxFor])

  const employesConcernes = useMemo(() => {
    const set = new Set<string>()
    for (const s of lignesValidesPourSave) set.add(s.employe_id)
    return set.size
  }, [lignesValidesPourSave])

  const dateMin = periode
  const dateMax = lastDayOfPeriode(periode)

  // ─── Suggestions / alertes dérivées ──────────────────────────────────────

  const suggestionsAvecOT = useMemo(() => {
    if (!preview) return [] as OvertimeLigneEmploye[]
    return preview.filter(p =>
      p.total_ot_1_5_heures > 0 || p.total_ot_2_heures > 0)
  }, [preview])

  const alertes = useMemo(() => {
    if (!preview) return [] as Array<{ employe_nom: string; alerte: OvertimeAlerteSemaine }>
    const out: Array<{ employe_nom: string; alerte: OvertimeAlerteSemaine }> = []
    for (const p of preview) {
      for (const a of p.alertes_semaines) {
        if (a.illegal) out.push({ employe_nom: p.employe_nom, alerte: a })
      }
    }
    return out
  }, [preview])

  // ─── Rendu ────────────────────────────────────────────────────────────────

  if (!societeId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Heures supplémentaires</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Sélectionnez une société pour gérer les heures supplémentaires.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Heures supplémentaires</CardTitle>
        <p className="text-sm text-gray-600 mt-1">
          Saisie détaillée par date — calcul WRA 2019 (×1.5 et ×2)
        </p>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Zone 1 : période + bouton */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Période :</span>
            <Select value={periode} onValueChange={setPeriode}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {moisOptions().map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleChargerPreview}
            disabled={loadingPreview}
          >
            {loadingPreview
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Calculator className="h-4 w-4 mr-2" />}
            Charger suggestions planning
          </Button>
          <span className="text-xs text-gray-500 ml-auto">
            {loadingEmployes
              ? 'Chargement…'
              : `${employes.length} employé(s) actif(s)`}
          </span>
        </div>

        {/* Zone 2 : bandeau suggestions */}
        {suggestionsAvecOT.length > 0 && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-blue-900">
                  {suggestionsAvecOT.length} suggestion(s) OT depuis le planning
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-blue-700 hover:text-blue-900 hover:bg-blue-100"
                  onClick={() => setDialogOpen(true)}
                >
                  Voir détail
                </Button>
              </div>
              <p className="text-xs text-blue-800 mt-1 truncate">
                {suggestionsAvecOT
                  .slice(0, 6)
                  .map(p => `${p.employe_nom} ${fmtHeures(p.total_ot_1_5_heures + p.total_ot_2_heures)}`)
                  .join(' • ')}
                {suggestionsAvecOT.length > 6 ? ' • …' : ''}
              </p>
            </div>
          </div>
        )}

        {/* Zone 3 : alertes WRA */}
        {alertes.length > 0 && (
          <div className="space-y-1">
            {alertes.map((a, i) => (
              <div
                key={`${a.employe_nom}-${a.alerte.debut_semaine}-${i}`}
                className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-center gap-2"
              >
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-900">
                  <span className="font-medium">{a.employe_nom}</span>
                  {' — semaine du '}
                  {a.alerte.debut_semaine.slice(8, 10)}
                  /
                  {a.alerte.debut_semaine.slice(5, 7)}
                  {' : '}
                  <span className="font-medium">{fmtHeures(a.alerte.heures_totales)}</span>
                  {' dans le planning, dépasse 55h max WRA'}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Zone 4 : tableau saisie */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">OT validés à payer</h3>
            <Button type="button" variant="outline" size="sm" onClick={addLigne}>
              <Plus className="h-4 w-4 mr-1" />
              Ajouter une ligne
            </Button>
          </div>

          {saisies.length === 0 ? (
            <p className="text-sm text-gray-500 italic py-4 text-center border border-dashed rounded-md">
              Aucun OT saisi. Ajoutez une ligne ou validez une suggestion ci-dessus.
            </p>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Employé</TableHead>
                    <TableHead className="text-right">Salaire</TableHead>
                    <TableHead className="text-right">Taux/h</TableHead>
                    <TableHead className="min-w-[140px]">Date</TableHead>
                    <TableHead className="text-right w-[100px]">OT ×1.5</TableHead>
                    <TableHead className="text-right w-[100px]">OT ×2</TableHead>
                    <TableHead className="min-w-[140px]">Motif</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {saisies.map(ligne => {
                    const emp = ligne.employe_id ? employesById.get(ligne.employe_id) : undefined
                    const taux = tauxFor(ligne.employe_id)
                    const montant = montantLigne(
                      taux,
                      ligne.heures_ot_1_5,
                      ligne.heures_ot_2,
                    )
                    return (
                      <TableRow key={ligne.id}>
                        <TableCell>
                          <Select
                            value={ligne.employe_id}
                            onValueChange={v => updateLigne(ligne.id, { employe_id: v })}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Choisir…" />
                            </SelectTrigger>
                            <SelectContent>
                              {employes.map(e => (
                                <SelectItem key={e.id} value={e.id}>
                                  {e.prenom} {e.nom}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {emp ? fmtMUR(emp.salaire_base) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {emp ? fmtTaux(taux) : '—'}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            className="h-8"
                            min={dateMin}
                            max={dateMax}
                            value={ligne.date}
                            onChange={e => updateLigne(ligne.id, { date: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            className="h-8 text-right"
                            min="0"
                            step="0.5"
                            value={ligne.heures_ot_1_5}
                            onChange={e => updateLigne(ligne.id, {
                              heures_ot_1_5: Math.max(0, Number(e.target.value) || 0),
                            })}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            className="h-8 text-right"
                            min="0"
                            step="0.5"
                            value={ligne.heures_ot_2}
                            onChange={e => updateLigne(ligne.id, {
                              heures_ot_2: Math.max(0, Number(e.target.value) || 0),
                            })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            className="h-8"
                            placeholder="Optionnel"
                            value={ligne.motif}
                            onChange={e => updateLigne(ligne.id, { motif: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums font-medium">
                          {emp && montant > 0 ? fmtMUR(montant) : '—'}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => removeLigne(ligne.id)}
                            aria-label="Supprimer la ligne"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Zone 5 : récap + sauver */}
        <div className="flex flex-wrap items-center gap-4 pt-4 border-t">
          <div className="text-sm">
            <span className="text-gray-600">Total OT du mois : </span>
            <span className="font-semibold tabular-nums">{fmtMUR(totalMontant)}</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-600">Employé(s) concerné(s) : </span>
            <span className="font-semibold tabular-nums">{employesConcernes}</span>
          </div>
          {lignesIncompletes && (
            <div className="text-sm text-amber-700">
              {/* hint discret quand certaines lignes ne sont pas finalisées */}
              Complétez l'employé et la date sur toutes les lignes saisies.
            </div>
          )}
          <Button
            type="button"
            className="ml-auto"
            disabled={saveDisabled}
            onClick={handleSave}
          >
            {saving
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Save className="h-4 w-4 mr-2" />}
            Enregistrer et intégrer aux bulletins
          </Button>
        </div>
      </CardContent>

      {/* Dialog suggestions */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Suggestions depuis le planning</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={validerToutesSuggestions}
              disabled={suggestionsAvecOT.every(p => validatedSuggestions.has(p.employe_id))}
            >
              Tout valider
            </Button>
          </div>
          <div className="border rounded-md overflow-x-auto max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employé</TableHead>
                  <TableHead className="text-right">OT ×1.5</TableHead>
                  <TableHead className="text-right">OT ×2</TableHead>
                  <TableHead className="text-right">Montant suggéré</TableHead>
                  <TableHead className="w-[200px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suggestionsAvecOT.map(p => {
                  const dejaValide = validatedSuggestions.has(p.employe_id)
                  return (
                    <TableRow key={p.employe_id}>
                      <TableCell className="font-medium">{p.employe_nom}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtHeures(p.total_ot_1_5_heures)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtHeures(p.total_ot_2_heures)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtMUR(p.total_ot_montant)}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant={dejaValide ? 'ghost' : 'outline'}
                          size="sm"
                          disabled={dejaValide}
                          onClick={() => validerSuggestion(p)}
                        >
                          {dejaValide
                            ? <><Check className="h-3 w-3 mr-1" /> Validé</>
                            : 'Valider cette suggestion'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// Re-exporte le type pour les consommateurs (page intégratrice).
export type { OvertimeLigneJour }
