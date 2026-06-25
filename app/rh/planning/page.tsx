"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Loader2, Calendar, ChevronLeft, ChevronRight, Send, Wand2, Users, Check, Plus, Trash2, Clock, Coffee, AlertTriangle, FileDown, Copy, Eye, Shield, CheckCircle2, XCircle, Info, ChevronDown, Settings, UserCheck } from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { toast } from "sonner"
import { notifySuccess, notifyError, notifyWarning } from "@/lib/utils/toast"
import { t, getLocale } from "@/lib/i18n"
import Link from "next/link"
import type { PlanningShift, JourCode } from "@/types/planning"
import { type Creneau, shiftToCreneau, creneauToShift } from "@/lib/planning/converters"

const DEFAULT_JOURS: JourCode[] = ["lun", "mar", "mer", "jeu", "ven"]

// ─── Types ──────────────────────────────────────────────────────────
// Le type Creneau est maintenant importé depuis @/lib/planning/converters
// (source unique, compatible avec le nouveau PlanningShift côté DB).

interface CellData {
  creneau_id: string
  heure_debut: string
  heure_fin: string
  pause_debut: string
  pause_fin: string
  heures_prevues: number
}

// ─── Helpers ────────────────────────────────────────────────────────

function computeMinutes(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  let diff = (eh * 60 + em) - (sh * 60 + sm)
  if (diff < 0) diff += 24 * 60
  return diff
}

function computeEffective(hd: string, hf: string, pd: string, pf: string): number {
  const total = computeMinutes(hd, hf)
  const pause = pd && pf ? computeMinutes(pd, pf) : 0
  return Math.round((total - pause) / 60 * 10) / 10
}

function fmtH(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`
}

const COLORS = [
  "bg-blue-500 text-white", "bg-emerald-500 text-white", "bg-orange-500 text-white",
  "bg-purple-500 text-white", "bg-indigo-600 text-white", "bg-pink-500 text-white",
  "bg-teal-500 text-white", "bg-red-500 text-white", "bg-cyan-600 text-white",
]

function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate() }
function isWeekend(year: number, month: number, day: number) { const d = new Date(year, month, day); return d.getDay() === 0 || d.getDay() === 6 }

const MONTH_NAMES_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
const MONTH_NAMES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const DAY_NAMES_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
const DAY_NAMES_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
function getMonthNames(loc: string) { return loc === 'en' ? MONTH_NAMES_EN : MONTH_NAMES_FR }
function getDayNames(loc: string) { return loc === 'en' ? DAY_NAMES_EN : DAY_NAMES_FR }
// Backward-compat aliases (FR fallback for any code outside the component)
const MONTH_NAMES = MONTH_NAMES_FR
const DAY_NAMES = DAY_NAMES_FR

const REPOS_CRENEAU: Creneau = {
  id: "repos", nom: "Repos", code: "R",
  heure_debut: "", heure_fin: "", pause_debut: "", pause_fin: "",
  pause_minutes: 0, heures_effectives: 0, couleur: "bg-gray-200 text-gray-600",
}

const CONGE_CRENEAU: Creneau = {
  id: "conge", nom: "Congé", code: "C",
  heure_debut: "", heure_fin: "", pause_debut: "", pause_fin: "",
  pause_minutes: 0, heures_effectives: 0, couleur: "bg-emerald-100 text-emerald-700",
}

// Sick Leave assignable directement depuis la grille : crée un vrai congé
// maladie approuvé (demandes_conges type=SL) → impacte soldes / paie /
// Absences & Congés. Voir markSickLeave().
const SICK_LEAVE_CRENEAU: Creneau = {
  id: "sick", nom: "Sick Leave", code: "SL",
  heure_debut: "", heure_fin: "", pause_debut: "", pause_fin: "",
  pause_minutes: 0, heures_effectives: 0, couleur: "bg-orange-200 text-orange-800",
}

interface Conflict {
  type: "leave" | "hours"
  // Sprint 11 BUG 8 — severity distingue erreur bloquante (illégal) et
  // avertissement légal (heures au-dessus de 45h mais dans la limite OT).
  severity: "error" | "warning"
  empId: string
  empName: string
  detail: string
}

// Sprint 1 — fallback uniquement (WRA 2019 art. 14(1)). La valeur réelle
// est lue depuis /api/rh/planning/regles?societe_id=… au mount + à chaque
// changement de société. Voir state `weeklyLimit` plus bas.
const WEEKLY_HOURS_LIMIT_DEFAULT = 45
// Sprint 11 BUG 8 — limite OT hebdomadaire WRA 2019 : max 10h d'OT
// autorisées au-dessus de 45h → plafond légal effectif 55h/semaine.
// Entre 45h et 55h → avertissement (OT légal). Au-dessus de 55h → erreur.
const WEEKLY_OT_LIMIT = 55
const WEEK_DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

// Shifts par défaut GÉNÉRIQUES (pas DDS-spécifiques).
// fallback si DB vide — utilisés uniquement quand la société n'a pas
// encore configuré ses propres shifts dans societes.shifts_planning.
// Le RH peut personnaliser via /rh/planning/regles.
const DEFAULT_CRENEAUX: Creneau[] = [
  { id: "default_j", nom: "Journée", code: "J", heure_debut: "08:00", heure_fin: "17:00", pause_debut: "12:00", pause_fin: "13:00", pause_minutes: 60, heures_effectives: 8, couleur: COLORS[0] },
]

// ─── Component ──────────────────────────────────────────────────────

export default function PlanningPage() {
  const locale = getLocale()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [societes, setSocietes] = useState<any[]>([])
  // Sprint 5 BUG B — persister la sélection société pour ne pas revenir à
  // "all" après un refresh, ce qui masquait les plannings brouillon de
  // l'utilisateur et affichait "Sélectionnez une société".
  const [societe, setSociete] = useState<string>(() => {
    if (typeof window === "undefined") return "all"
    try { return localStorage.getItem("rh_planning_societe") || "all" } catch { return "all" }
  })
  // Sprint 1 — Limite hebdo lue depuis /api/rh/planning/regles (config WRA
  // par société). Fallback 45 si la société n'a pas de règle persistée.
  const [weeklyLimit, setWeeklyLimit] = useState<number>(WEEKLY_HOURS_LIMIT_DEFAULT)
  const [employes, setEmployes] = useState<any[]>([])
  const [planning, setPlanning] = useState<Record<string, Record<number, CellData | null>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [published, setPublished] = useState(false)

  // Créneaux configuration — persist per société in localStorage
  const [creneaux, setCreneaux] = useState<Creneau[]>(DEFAULT_CRENEAUX)
  const [creneauConfigOpen, setCreneauConfigOpen] = useState(false)
  const [editingCreneau, setEditingCreneau] = useState<Creneau | null>(null)

  // Load creneaux from DB (societes.shifts_planning) when société changes.
  // P2a — plus de fallback localStorage : source unique = DB.
  useEffect(() => {
    if (societe === "all") { setCreneaux(DEFAULT_CRENEAUX); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/rh/planning/regles?societe_id=${societe}`)
        if (res.ok) {
          const data = await res.json()
          const shifts: PlanningShift[] = Array.isArray(data?.shifts_planning)
            ? data.shifts_planning
            : []
          if (shifts.length > 0) {
            if (!cancelled) setCreneaux(shifts.map(shiftToCreneau))
            return
          }
        }
      } catch { /* noop */ }
      if (!cancelled) setCreneaux(DEFAULT_CRENEAUX)
    })()
    return () => { cancelled = true }
  }, [societe])

  // Persist creneaux → DB (PUT societes.shifts_planning).
  // P2a — plus d'écriture localStorage.
  const persistCreneaux = useCallback(async (next: Creneau[]) => {
    if (!societe || societe === "all") return
    try {
      const res = await fetch("/api/rh/planning/regles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societe,
          shifts_planning: next.map(c =>
            creneauToShift(c, (c.jours as JourCode[] | undefined) || DEFAULT_JOURS),
          ),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        notifyError(t('rhpl.save_creneaux', locale), data?.error || `HTTP ${res.status}`)
      }
    } catch (e: unknown) {
      notifyError(t('rhpl.network_error', locale), e)
    }
  }, [societe])

  // Employee filter — who appears in the planning
  const [allEmployes, setAllEmployes] = useState<any[]>([])
  const [includedEmpIds, setIncludedEmpIds] = useState<Set<string>>(new Set())
  const [groupes, setGroupes] = useState<any[]>([])
  const [selectedGroupe, setSelectedGroupe] = useState("all")
  const [empFilterOpen, setEmpFilterOpen] = useState(false)
  const [empSearch, setEmpSearch] = useState("")

  // View mode: monthly or weekly
  const [viewMode, setViewMode] = useState<"monthly" | "weekly">("monthly")
  const [weekOffset, setWeekOffset] = useState(0) // which week of the month (0-based)

  // Conflict detail visibility
  const [showConflicts, setShowConflicts] = useState(false)

  // Confirm dialog for auto-generate
  const [confirmGenOpen, setConfirmGenOpen] = useState(false)

  // Sprint 7 FIX 5 — Dialog de confirmation avant publication (rend
  // le planning visible par tous les employés de la société).
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false)

  // Approved leave days: empId -> Map(day -> leave type)
  const [approvedLeaves, setApprovedLeaves] = useState<Record<string, Map<number, string>>>({})

  // Jours fériés du mois affiché : day -> libellé. Marqueur visuel
  // uniquement (n'efface jamais le shift planifié de l'employé).
  const [holidaysByDay, setHolidaysByDay] = useState<Record<number, string>>({})

  // Marquage sick leave en cours (empId-day) — évite le double-clic
  const [sickPending, setSickPending] = useState<Set<string>>(new Set())

  // Cell edit — `rect` ancre le popover (position fixe, au-dessus de la
  // cellule) pour qu'il ne soit jamais rogné par le conteneur scrollable.
  const [editCell, setEditCell] = useState<{ empId: string; day: number; rect?: DOMRect } | null>(null)

  // Bulk assign
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkEmployees, setBulkEmployees] = useState<string[]>([])
  const [bulkDateFrom, setBulkDateFrom] = useState(1)
  const [bulkDateTo, setBulkDateTo] = useState(1)

  // Affecter un shift à des employés choisis (menu Remplir) — sprint bugs paie/conges
  const [shiftAssignOpen, setShiftAssignOpen] = useState(false)
  const [shiftAssignCreneauId, setShiftAssignCreneauId] = useState<string>("")
  const [shiftAssignEmployes, setShiftAssignEmployes] = useState<string[]>([])
  const [bulkCreneauId, setBulkCreneauId] = useState("c1")
  const [bulkWeekendOff, setBulkWeekendOff] = useState(true)

  const daysInMonth = getDaysInMonth(year, month)
  const periode = `${year}-${String(month + 1).padStart(2, "0")}`

  const getCreneauById = (id: string): Creneau => {
    // Match by id, nom, or code (API returns shift name, not creneau id)
    return creneaux.find(c => c.id === id || c.nom === id || c.code === id) || REPOS_CRENEAU
  }
  const allCreneaux = [...creneaux, REPOS_CRENEAU, CONGE_CRENEAU, SICK_LEAVE_CRENEAU]

  // ─── Conflict detection ─────────────────────────────────────────

  const getWeeklyHours = useCallback((empId: string, weekStartDay: number, weekEndDay: number): number => {
    let total = 0
    for (let d = weekStartDay; d <= Math.min(weekEndDay, daysInMonth); d++) {
      const cell = planning[empId]?.[d]
      if (cell) total += (cell.heures_prevues || 0)
    }
    return Math.round(total * 10) / 10
  }, [planning, daysInMonth])

  const conflicts = useMemo<Conflict[]>(() => {
    const result: Conflict[] = []
    for (const emp of employes) {
      // Check leave conflicts
      const leaves = approvedLeaves[emp.id]
      if (leaves) {
        for (const day of Array.from(leaves.keys())) {
          const cell = planning[emp.id]?.[day]
          if (cell && cell.creneau_id !== "repos" && cell.creneau_id !== "conge" && !cell.creneau_id?.startsWith("conge_")) {
            result.push({
              type: "leave",
              severity: "error",
              empId: emp.id,
              empName: `${emp.prenom} ${emp.nom}`,
              detail: `${t('rhpl.conf_planned_on', locale)} ${day}/${month + 1} ${t('rhpl.conf_while_leave', locale)}`,
            })
          }
        }
      }
      // Sprint 1 — limite hebdo lue dynamiquement depuis les règles WRA
      // de la société (fallback 45h). Avant: hardcodée à 45.
      // Sprint 11 BUG 8 — OT légal WRA 2019 : entre 45h et 55h, heures
      // supplémentaires autorisées → avertissement (jaune). Au-dessus de
      // 55h, dépassement illégal → erreur (rouge).
      let d = 1
      while (d <= daysInMonth) {
        const weekEnd = Math.min(d + 6, daysInMonth)
        const hours = getWeeklyHours(emp.id, d, weekEnd)
        if (hours > weeklyLimit) {
          const isOTLegal = hours <= WEEKLY_OT_LIMIT
          result.push({
            type: "hours",
            severity: isOTLegal ? "warning" : "error",
            empId: emp.id,
            empName: `${emp.prenom} ${emp.nom}`,
            detail: isOTLegal
              ? `${t('rhpl.week_of', locale)} ${d}/${month + 1}: ${hours}h — ${t('rhpl.ot_legal_exceeds', locale)} ${weeklyLimit}h ${t('rhpl.ot_but_under', locale)} ≤${WEEKLY_OT_LIMIT}h ${t('rhpl.max_wra', locale)})`
              : `${t('rhpl.week_of', locale)} ${d}/${month + 1}: ${hours}h > ${WEEKLY_OT_LIMIT}h ${t('rhpl.max_wra', locale)} (${t('rhpl.illegal_overrun', locale)})`,
          })
        }
        d += 7
      }
    }
    return result
  }, [employes, planning, approvedLeaves, month, daysInMonth, getWeeklyHours, weeklyLimit])

  // Helper: check if a specific cell has a conflict
  const cellHasConflict = useCallback((empId: string, day: number): boolean => {
    const leaves = approvedLeaves[empId]
    if (leaves && leaves.has(day)) {
      const cell = planning[empId]?.[day]
      if (cell && cell.creneau_id !== "repos" && cell.creneau_id !== "conge" && !cell.creneau_id?.startsWith("conge_")) return true
    }
    return false
  }, [approvedLeaves, planning])

  // ─── WRA Compliance Validation ─────────────────────────────────

  interface Violation {
    severity: "red" | "orange"
    empName: string
    empId: string
    rule: string
    detail: string
  }

  const [validationResults, setValidationResults] = useState<Violation[] | null>(null)
  const [showValidation, setShowValidation] = useState(false)

  const loadRules = () => {
    const stored = localStorage.getItem(`lexora_planning_rules_${societe}`)
    if (stored) {
      try { return JSON.parse(stored) } catch { /* noop */ }
    }
    // defaults
    return [
      { key: "max_heures_semaine", value: 45, enabled: true, category: "heures" },
      { key: "max_heures_jour", value: 9, enabled: true, category: "heures" },
      { key: "max_jours_consecutifs", value: 6, enabled: true, category: "repos" },
      { key: "repos_minimum_semaine", value: 1, enabled: true, category: "repos" },
      { key: "nuit_debut", value: "18:00", enabled: true, category: "repos" },
      { key: "nuit_fin", value: "06:00", enabled: true, category: "repos" },
      { key: "pause_minimum_minutes", value: 30, enabled: true, category: "heures" },
      { key: "max_employes_absents_pct", value: 30, enabled: true, category: "equipe" },
    ]
  }

  const getRuleValue = (rules: any[], key: string): any => {
    const r = rules.find((r: any) => r.key === key)
    return r?.enabled ? r.value : null
  }

  const runValidation = () => {
    const rules = loadRules()
    const violations: Violation[] = []
    const maxWeeklyH = getRuleValue(rules, "max_heures_semaine")
    const maxDailyH = getRuleValue(rules, "max_heures_jour")
    const maxConsec = getRuleValue(rules, "max_jours_consecutifs")
    const reposMin = getRuleValue(rules, "repos_minimum_semaine")
    const nuitDebut = getRuleValue(rules, "nuit_debut")
    const nuitFin = getRuleValue(rules, "nuit_fin")
    const pauseMin = getRuleValue(rules, "pause_minimum_minutes")
    const maxAbsentPct = getRuleValue(rules, "max_employes_absents_pct")

    for (const emp of employes) {
      const name = `${emp.prenom} ${emp.nom}`

      // 1. Weekly hours check
      // Sprint 11 BUG 8 — OT légal WRA 2019 : au-dessus de maxWeeklyH,
      // jusqu'à 55h max, c'est un avertissement (OT à payer, pas une
      // violation bloquante). Au-dessus de 55h, c'est une vraie violation.
      if (maxWeeklyH !== null) {
        let d = 1
        while (d <= daysInMonth) {
          const weekEnd = Math.min(d + 6, daysInMonth)
          const hours = getWeeklyHours(emp.id, d, weekEnd)
          if (hours > maxWeeklyH) {
            if (hours <= WEEKLY_OT_LIMIT) {
              violations.push({
                severity: "orange",
                empName: name, empId: emp.id, rule: t('rhpl.rule_week_hours_ot', locale),
                detail: `${t('rhpl.week_of', locale)} ${d}: ${hours}h — ${t('rhpl.ot_legal_exceeds', locale)} ${maxWeeklyH}h ${t('rhpl.ot_but_under', locale)} ≤${WEEKLY_OT_LIMIT}h ${t('rhpl.max_wra', locale)})`,
              })
            } else {
              violations.push({
                severity: "red",
                empName: name, empId: emp.id, rule: t('rhpl.rule_week_hours', locale),
                detail: `${t('rhpl.week_of', locale)} ${d}: ${hours}h > ${WEEKLY_OT_LIMIT}h ${t('rhpl.max_wra', locale)} (${t('rhpl.illegal_overrun_art14', locale)})`,
              })
            }
          }
          d += 7
        }
      }

      // 2. Daily hours check
      if (maxDailyH !== null) {
        for (let d = 1; d <= daysInMonth; d++) {
          const cell = planning[emp.id]?.[d]
          if (cell && cell.heures_prevues > maxDailyH) {
            violations.push({ severity: "red", empName: name, empId: emp.id, rule: t('rhpl.rule_day_hours', locale), detail: `${t('rhpl.day', locale)} ${d}: ${cell.heures_prevues}h / ${maxDailyH}h max` })
          }
        }
      }

      // 3. Consecutive working days
      if (maxConsec !== null) {
        let consecutive = 0
        for (let d = 1; d <= daysInMonth; d++) {
          const cell = planning[emp.id]?.[d]
          if (cell && cell.creneau_id !== "repos" && cell.creneau_id !== "conge" && !cell.creneau_id?.startsWith("conge_")) {
            consecutive++
            if (consecutive > maxConsec) {
              violations.push({ severity: "red", empName: name, empId: emp.id, rule: t('rhpl.rule_consec_days', locale), detail: `${consecutive} ${t('rhpl.consec_days_at_day', locale)} ${d} (max ${maxConsec})` })
              break
            }
          } else {
            consecutive = 0
          }
        }
      }

      // 4. Mandatory rest day per week
      if (reposMin !== null) {
        let d = 1
        while (d <= daysInMonth) {
          const weekEnd = Math.min(d + 6, daysInMonth)
          let restDays = 0
          for (let wd = d; wd <= weekEnd; wd++) {
            const cell = planning[emp.id]?.[wd]
            if (!cell || cell.creneau_id === "repos" || cell.creneau_id === "conge" || cell.creneau_id?.startsWith("conge_")) restDays++
          }
          if (restDays < reposMin && weekEnd - d >= 6) {
            violations.push({ severity: "red", empName: name, empId: emp.id, rule: t('rhpl.rule_weekly_rest', locale), detail: `${t('rhpl.week_of', locale)} ${d}: ${restDays} ${t('rhpl.rest_days_label', locale)} (min ${reposMin})` })
          }
          d += 7
        }
      }

      // 5. Night shift check
      if (nuitDebut !== null && nuitFin !== null) {
        for (let d = 1; d <= daysInMonth; d++) {
          const cell = planning[emp.id]?.[d]
          if (cell && cell.heure_debut && cell.heure_fin) {
            const [sh] = cell.heure_debut.split(":").map(Number)
            const [ndh] = (nuitDebut as string).split(":").map(Number)
            const [nfh] = (nuitFin as string).split(":").map(Number)
            const isNight = sh >= ndh || sh < nfh
            if (isNight) {
              violations.push({ severity: "orange", empName: name, empId: emp.id, rule: t('rhpl.rule_night_work', locale), detail: `${t('rhpl.day', locale)} ${d}: ${t('rhpl.slot_label', locale)} ${cell.heure_debut}-${cell.heure_fin} (${t('rhpl.night_label', locale)} ${nuitDebut}-${nuitFin})` })
            }
          }
        }
      }

      // 6. Pause check
      if (pauseMin !== null) {
        for (let d = 1; d <= daysInMonth; d++) {
          const cell = planning[emp.id]?.[d]
          if (cell && cell.heures_prevues >= 6) {
            const pauseDuration = cell.pause_debut && cell.pause_fin ? computeMinutes(cell.pause_debut, cell.pause_fin) : 0
            if (pauseDuration < pauseMin) {
              violations.push({ severity: "orange", empName: name, empId: emp.id, rule: t('rhpl.rule_min_break', locale), detail: `${t('rhpl.day', locale)} ${d}: ${t('rhpl.break_label', locale)} ${pauseDuration}min (min ${pauseMin}min ${t('rhpl.for_6h_plus', locale)})` })
            }
          }
        }
      }

      // 7. Sprint 14 FIX 3 — Repos inter-journées 11h minimum (WRA Art. 19).
      // Pour chaque paire de jours consécutifs, calculer le temps de repos
      // entre la fin du shift jour J et le début du shift jour J+1.
      // Si < 11h → ERREUR bloquante (pas un simple avertissement).
      for (let d = 1; d < daysInMonth; d++) {
        const cellD = planning[emp.id]?.[d]
        const cellD1 = planning[emp.id]?.[d + 1]
        const isWorkD = cellD && cellD.heure_fin && cellD.creneau_id !== "repos" && cellD.creneau_id !== "conge" && !cellD.creneau_id?.startsWith("conge_")
        const isWorkD1 = cellD1 && cellD1.heure_debut && cellD1.creneau_id !== "repos" && cellD1.creneau_id !== "conge" && !cellD1.creneau_id?.startsWith("conge_")
        if (isWorkD && isWorkD1) {
          const [fh, fm] = cellD.heure_fin.split(":").map(Number)
          const [sh, sm] = cellD.heure_debut.split(":").map(Number)
          const [nh, nm] = cellD1.heure_debut.split(":").map(Number)
          const endMins = fh * 60 + (fm || 0)
          const startMins = sh * 60 + (sm || 0)
          const nextStartMins = nh * 60 + (nm || 0)
          // Shift crosses midnight if heure_fin ≤ heure_debut (ex: 22:00→06:00)
          const crossesMidnight = endMins <= startMins
          const restMins = crossesMidnight
            ? (nextStartMins - endMins) // end is on day d+1, next start also on day d+1
            : ((24 * 60 - endMins) + nextStartMins) // end is on day d, next start on day d+1
          const restH = Math.round(restMins / 6) / 10 // round to 0.1h
          if (restMins < 11 * 60) {
            violations.push({
              severity: "red",
              empName: name,
              empId: emp.id,
              rule: t('rhpl.rule_inter_day_rest', locale),
              detail: `${t('rhpl.day', locale)} ${d}→${d + 1}: ${restH}h ${t('rhpl.of_rest', locale)} (min 11h, WRA Art. 19). ${t('rhpl.end_label', locale)} ${cellD.heure_fin} → ${t('rhpl.start_label', locale)} ${cellD1.heure_debut}`,
            })
          }
        }
      }
    }

    // 7. Team absence percentage per day
    if (maxAbsentPct !== null && employes.length > 0) {
      for (let d = 1; d <= daysInMonth; d++) {
        let absent = 0
        for (const emp of employes) {
          const cell = planning[emp.id]?.[d]
          if (!cell || cell.creneau_id === "repos" || cell.creneau_id === "conge" || cell.creneau_id?.startsWith("conge_")) absent++
        }
        const pct = Math.round((absent / employes.length) * 100)
        if (pct > maxAbsentPct) {
          violations.push({ severity: "orange", empName: t('rhpl.team', locale), empId: "", rule: t('rhpl.rule_team_absence', locale), detail: `${t('rhpl.day', locale)} ${d}: ${pct}% ${t('rhpl.absent_label', locale)} (max ${maxAbsentPct}%)` })
        }
      }
    }

    setValidationResults(violations)
    setShowValidation(true)
    if (violations.length === 0) {
      notifySuccess(t('rhpl.compliant_no_violation', locale))
    } else {
      notifyWarning(`${violations.length} ${t('rhpl.violations_detected', locale)}`)
    }
  }

  // ─── Weekly view helpers ────────────────────────────────────────

  const getWeeksOfMonth = useCallback(() => {
    const weeks: { start: number; end: number; label: string }[] = []
    // Find the first Monday of or before the month
    let d = 1
    while (d <= daysInMonth) {
      const end = Math.min(d + 6, daysInMonth)
      weeks.push({ start: d, end, label: `${d}-${end} ${MONTH_NAMES[month].slice(0, 3)}` })
      d += 7
    }
    return weeks
  }, [daysInMonth, month])

  const weeks = getWeeksOfMonth()
  const currentWeek = weeks[Math.min(weekOffset, weeks.length - 1)] || weeks[0]

  // ─── Auto-generate: copy current week to remaining weeks ────────

  const generateFromCurrentWeek = () => {
    if (!currentWeek) return
    setPlanning(prev => {
      const next = { ...prev }
      for (const empId of Object.keys(next)) {
        const row = { ...next[empId] }
        // Read the pattern from currentWeek
        const pattern: (CellData | null)[] = []
        for (let d = currentWeek.start; d <= currentWeek.end; d++) {
          pattern.push(row[d] || null)
        }
        // Apply to all OTHER weeks
        for (const week of weeks) {
          if (week.start === currentWeek.start) continue
          for (let i = 0; i < 7; i++) {
            const targetDay = week.start + i
            if (targetDay > daysInMonth) break
            row[targetDay] = pattern[i % pattern.length] ? { ...pattern[i % pattern.length]! } : null
          }
        }
        next[empId] = row
      }
      return next
    })
    setConfirmGenOpen(false)
    notifySuccess(t('rhpl.template_applied_weeks', locale))
  }

  // ─── Load data ──────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
      setSocietes(unique)
      // Sprint 5 BUG B — ne pas écraser une sélection persistée valide.
      // Fallback sur la première société si la sélection stockée n'est plus
      // accessible (perte de droits, société supprimée, etc.).
      if (unique.length >= 1) {
        setSociete(prev => {
          const stillValid = prev && prev !== "all" && unique.some((s: any) => s.id === prev)
          return stillValid ? prev : unique[0].id
        })
      }
    })
  }, [])

  // Sprint 5 BUG B — persister la sélection société au changement.
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      if (societe && societe !== "all") {
        localStorage.setItem("rh_planning_societe", societe)
      }
    } catch { /* noop */ }
  }, [societe])

  // Sprint 1 — fetch la limite hebdo depuis les règles WRA persistées de
  // la société. Évite de bloquer l'utilisateur si la règle n'existe pas
  // encore (fallback sur la valeur par défaut 45h).
  useEffect(() => {
    if (!societe || societe === "all") {
      setWeeklyLimit(WEEKLY_HOURS_LIMIT_DEFAULT)
      return
    }
    fetch(`/api/rh/planning/regles?societe_id=${societe}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const regles = data?.regles
        if (Array.isArray(regles)) {
          const r = regles.find((x: any) => x.key === 'max_heures_semaine' && x.enabled)
          const v = r ? Number(r.value) : NaN
          setWeeklyLimit(Number.isFinite(v) && v > 0 ? v : WEEKLY_HOURS_LIMIT_DEFAULT)
        } else {
          setWeeklyLimit(WEEKLY_HOURS_LIMIT_DEFAULT)
        }
      })
      .catch(() => setWeeklyLimit(WEEKLY_HOURS_LIMIT_DEFAULT))
  }, [societe])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ periode })
      if (societe !== "all") params.set("societe_id", societe)
      const [planRes, empRes, grpRes, leaveRes, feriesRes] = await Promise.all([
        fetch(`/api/rh/planning?${params}`).then(r => r.json()).catch(() => ({ planning: [] })),
        fetch(`/api/rh/employes?${societe !== "all" ? `societe_id=${societe}` : ""}`).then(r => r.json()).catch(() => ({ employes: [] })),
        fetch(`/api/rh/groupes?${societe !== "all" ? `societe_id=${societe}` : ""}`).then(r => r.json()).catch(() => ({ groupes: [] })),
        fetch(`/api/rh/conges?${params}&statut=approuve`).then(r => r.json()).catch(() => ({ conges: [] })),
        fetch(`/api/rh/jours-feries?annee=${year}`).then(r => r.json()).catch(() => ({ jours_feries: [] })),
      ])
      // Jours fériés du mois — marqueur visuel UNIQUEMENT (n'efface pas le
      // shift). On garde les fériés nationaux (societe_id null) + ceux de la
      // société sélectionnée.
      const feriesMap: Record<number, string> = {}
      for (const jf of (feriesRes.jours_feries || [])) {
        const dStr = String(jf.date || "").slice(0, 10)
        if (!dStr.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)) continue
        if (societe !== "all" && jf.societe_id && jf.societe_id !== societe) continue
        const day = parseInt(dStr.slice(8, 10), 10)
        if (day >= 1 && day <= daysInMonth) feriesMap[day] = jf.libelle || t('rhpl.public_holiday', locale)
      }
      setHolidaysByDay(feriesMap)
      // Build approved leave map — mark days with type (AL, SL, MAT, PAT...)
      const leaveMap: Record<string, Map<number, string>> = {}
      for (const conge of (leaveRes.conges || [])) {
        if (!leaveMap[conge.employe_id]) leaveMap[conge.employe_id] = new Map()
        const startStr = String(conge.date_debut || "").slice(0, 10)
        const endStr = String(conge.date_fin || conge.date_debut || "").slice(0, 10)
        const leaveType = conge.type_conge || "AL"
        if (!startStr) continue

        for (let d = 1; d <= daysInMonth; d++) {
          const dayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
          if (dayStr >= startStr && dayStr <= endStr) {
            leaveMap[conge.employe_id].set(d, leaveType)
          }
        }
      }
      setApprovedLeaves(leaveMap)
      setGroupes(grpRes.groupes || [])
      // Défense en profondeur — n'affiche que les employés actifs
      // non-partis (l'API filtre déjà, mais on re-filtre côté client pour
      // éviter qu'un ancien salarié apparaisse dans le planning).
      const emps = (empRes.employes || [])
        .filter((e: any) => e.actif !== false && !e.date_depart)
        .sort((a: any, b: any) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`))
      setAllEmployes(emps)
      setPublished(planRes.published || false)

      // Sprint 9 BUG 1 — recalcul de la sélection à chaque load.
      // Avant : on ne setIncludedEmpIds QUE si vide, donc en changeant de
      // société, includedEmpIds gardait les IDs de la société précédente
      // → displayedEmps = [] → "Aucun employé sélectionné" alors que la DB
      // contient bien les assignments. Correction : on construit la
      // sélection à partir des employés du planning (s'il en existe en DB)
      // ET des employés actifs de la société, en intersectant avec la
      // sélection précédente UNIQUEMENT si elle inclut des IDs valides
      // pour cette société.
      const empIdsThisSociete = new Set<string>(emps.map((e: any) => e.id as string))
      const planEmpIds = new Set<string>((planRes.planning || []).map((e: any) => e.employe_id as string))
      const previousSelection = Array.from(includedEmpIds)
        .filter(id => empIdsThisSociete.has(id))
      let nextIncluded: Set<string>
      if (previousSelection.length > 0) {
        // L'utilisateur avait une sélection compatible → la garder
        nextIncluded = new Set<string>(previousSelection)
      } else if (planEmpIds.size > 0) {
        // Pas de sélection compatible mais planning DB → afficher
        // tous les employés assignés (intersection avec employés actifs)
        const ids: string[] = []
        planEmpIds.forEach(id => { if (empIdsThisSociete.has(id)) ids.push(id) })
        nextIncluded = new Set<string>(ids)
        // Ajouter aussi les employés sans assignment pour permettre
        // l'édition (sinon on ne peut plus ajouter un nouveau salarié
        // au planning).
        empIdsThisSociete.forEach(id => nextIncluded.add(id))
      } else {
        // Société sans planning + pas de sélection → tous les employés actifs
        nextIncluded = new Set<string>(empIdsThisSociete)
      }
      setIncludedEmpIds(nextIncluded)

      // Filter displayed employees
      const displayedEmps = emps.filter((e: any) => nextIncluded.has(e.id))
      setEmployes(displayedEmps)

      const grid: Record<string, Record<number, CellData | null>> = {}
      for (const emp of displayedEmps) {
        grid[emp.id] = {}
        for (let d = 1; d <= daysInMonth; d++) grid[emp.id][d] = null
      }
      for (const entry of planRes.planning || []) {
        if (grid[entry.employe_id]) {
          const day = parseInt(entry.jour || entry.day, 10)
          if (day >= 1 && day <= daysInMonth) {
            // Match shift_code to a creneau by name or code
            const shiftName = entry.creneau_id || entry.shift || entry.type_shift || "repos"
            const isRepos = shiftName === "repos" || shiftName === "Repos" || entry.est_repos
            if (isRepos) {
              grid[entry.employe_id][day] = null // repos = null cell
            } else {
              grid[entry.employe_id][day] = {
                creneau_id: shiftName, // will be matched by getCreneauById via nom/code
                heure_debut: entry.heure_debut || "",
                heure_fin: entry.heure_fin || "",
                pause_debut: entry.pause_debut || "",
                pause_fin: entry.pause_fin || "",
                heures_prevues: entry.heures_prevues || 0,
              }
            }
          }
        }
      }
      // Override with approved leave days — congé takes priority over planned shift
      for (const [empId, dayMap] of Object.entries(leaveMap)) {
        if (grid[empId]) {
          for (const [day, leaveType] of dayMap.entries()) {
            if (day >= 1 && day <= daysInMonth) {
              grid[empId][day] = {
                creneau_id: `conge_${leaveType}`,
                heure_debut: "", heure_fin: "",
                pause_debut: "", pause_fin: "",
                heures_prevues: 0,
              }
            }
          }
        }
      }

      setPlanning(grid)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [societe, periode, daysInMonth])

  useEffect(() => { load() }, [load])

  // Fermer le sélecteur de créneau avec Échap.
  useEffect(() => {
    if (!editCell) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setEditCell(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [editCell])

  // ─── Actions ────────────────────────────────────────────────────

  // Sick Leave depuis la grille → crée un vrai congé maladie APPROUVÉ
  // (demandes_conges type=SL, 1 jour). Impacte soldes / paie / Absences.
  // Un SL d'1 jour < 3 jours consécutifs : aucun certificat requis (WRA S.46).
  const markSickLeave = async (empId: string, day: number) => {
    const key = `${empId}-${day}`
    if (sickPending.has(key)) return
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    setSickPending(prev => new Set(prev).add(key))
    setEditCell(null)
    try {
      const res = await fetch("/api/rh/conges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "creer",
          employe_id: empId,
          type_conge: "SL",
          date_debut: dateStr,
          date_fin: dateStr,
          statut: "approuve",
          impose_par_societe: true,
          motif: t('rhpl.sl_motif', locale),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        toast.info(t('rhpl.leave_already_exists', locale))
      } else if (!res.ok) {
        notifyError(t('rhpl.save_sick_leave', locale), data?.error || data?.raison || `HTTP ${res.status}`)
        return
      } else {
        const finalType = data?.type_conge_final || data?.conge?.type_conge || "SL"
        // Reflète immédiatement dans la grille via approvedLeaves (source de
        // vérité pour le type de congé) — pas besoin de recharger.
        setApprovedLeaves(prev => {
          const next = { ...prev }
          const m = new Map(next[empId] || [])
          m.set(day, finalType)
          next[empId] = m
          return next
        })
        setPlanning(prev => ({
          ...prev,
          [empId]: {
            ...prev[empId],
            [day]: { creneau_id: `conge_${finalType}`, heure_debut: "", heure_fin: "", pause_debut: "", pause_fin: "", heures_prevues: 0 },
          },
        }))
        notifySuccess(data?.bascule_ul ? t('rhpl.sl_saved_ul', locale) : t('rhpl.sl_saved', locale))
      }
    } catch (e: any) {
      notifyError(t('rhpl.network_error', locale), e)
    } finally {
      setSickPending(prev => { const n = new Set(prev); n.delete(key); return n })
    }
  }

  const assignCreneau = (empId: string, day: number, creneauId: string) => {
    if (creneauId === "sick") {
      void markSickLeave(empId, day)
      return
    }
    if (creneauId === "repos") {
      setPlanning(prev => ({ ...prev, [empId]: { ...prev[empId], [day]: null } }))
    } else if (creneauId === "conge") {
      setPlanning(prev => ({
        ...prev,
        [empId]: {
          ...prev[empId],
          [day]: { creneau_id: "conge", heure_debut: "", heure_fin: "", pause_debut: "", pause_fin: "", heures_prevues: 0 }
        },
      }))
      setEditCell(null)
      return
    } else {
      const c = getCreneauById(creneauId)
      setPlanning(prev => ({
        ...prev,
        [empId]: {
          ...prev[empId],
          [day]: {
            creneau_id: c.id,
            heure_debut: c.heure_debut,
            heure_fin: c.heure_fin,
            pause_debut: c.pause_debut,
            pause_fin: c.pause_fin,
            heures_prevues: c.heures_effectives,
          }
        },
      }))
    }
    setEditCell(null)
  }

  const generateStandard = () => {
    // Cherche le premier créneau de TRAVAIL (heures > 0 et nom != "repos").
    // Évite de remplir le mois avec un créneau "Repos" si c'est le 1er listé.
    const workCreneau = creneaux.find(
      c => c.heures_effectives > 0 && !c.nom.toLowerCase().includes("repos"),
    ) || creneaux[0]
    if (!workCreneau) {
      notifyError(t('rhpl.fill_planning', locale), t('rhpl.no_work_slot', locale))
      return
    }
    // Option B — shift par défaut par employé : si emp.shift_template_id est
    // renseigné et qu'on trouve le shift correspondant dans creneaux, on
    // l'utilise pour cet employé. Sinon on retombe sur le shift standard.
    const empById = new Map(employes.map(e => [e.id, e]))
    const shiftByEmpId = (empId: string) => {
      const emp = empById.get(empId)
      const customId = emp?.shift_template_id ? String(emp.shift_template_id) : null
      if (customId) {
        const custom = creneaux.find(c => String(c.id) === customId)
        if (custom) return custom
      }
      return workCreneau
    }
    let nbCustom = 0
    setPlanning(prev => {
      const next = { ...prev }
      for (const empId of Object.keys(next)) {
        const c = shiftByEmpId(empId)
        if (c.id !== workCreneau.id) nbCustom++
        const row = { ...next[empId] }
        for (let d = 1; d <= daysInMonth; d++) {
          // Respect approved congés: force "Congé" cell with leave type
          const leaves = approvedLeaves[empId]
          if (leaves && leaves.has(d)) {
            const lt = leaves.get(d) || "AL"
            row[d] = { creneau_id: `conge_${lt}`, heure_debut: "", heure_fin: "", pause_debut: "", pause_fin: "", heures_prevues: 0 }
          } else {
            row[d] = isWeekend(year, month, d) ? null : {
              creneau_id: c.id, heure_debut: c.heure_debut, heure_fin: c.heure_fin,
              pause_debut: c.pause_debut, pause_fin: c.pause_fin, heures_prevues: c.heures_effectives,
            }
          }
        }
        next[empId] = row
      }
      return next
    })
    notifySuccess(
      nbCustom > 0
        ? `${t('rhpl.filled_prefix', locale)} ${nbCustom} ${t('rhpl.filled_custom_rest', locale)} "${workCreneau.nom}"`
        : `${t('rhpl.filled_with', locale)} "${workCreneau.nom}"`,
    )
  }

  const generate3x8 = () => {
    const rotatingCreneaux = creneaux.filter(c => c.id !== creneaux[0]?.id).slice(0, 3)
    if (rotatingCreneaux.length < 2) return
    setPlanning(prev => {
      const next = { ...prev }
      const empIds = Object.keys(next)
      empIds.forEach((empId, idx) => {
        const row = { ...next[empId] }
        for (let d = 1; d <= daysInMonth; d++) {
          const weekNum = Math.floor((d - 1) / 7)
          const c = rotatingCreneaux[(idx + weekNum) % rotatingCreneaux.length]
          row[d] = { creneau_id: c.id, heure_debut: c.heure_debut, heure_fin: c.heure_fin, pause_debut: c.pause_debut, pause_fin: c.pause_fin, heures_prevues: c.heures_effectives }
        }
        next[empId] = row
      })
      return next
    })
  }

  // Sprint bugs paie/conges — "Affecter un shift à des employés" :
  // applique un shift choisi à tous les jours ouvrés du mois pour les
  // employés sélectionnés. Respecte les congés approuvés et les week-ends.
  const applyShiftAssign = () => {
    const c = getCreneauById(shiftAssignCreneauId)
    if (!c || c.heures_effectives === 0) {
      notifyError(t('rhpl.apply_shift', locale), t('rhpl.invalid_shift', locale))
      return
    }
    setPlanning(prev => {
      const next = { ...prev }
      for (const empId of shiftAssignEmployes) {
        if (!next[empId]) continue
        const row = { ...next[empId] }
        for (let d = 1; d <= daysInMonth; d++) {
          // Respecter congé approuvé : ne pas écraser
          const leaves = approvedLeaves[empId]
          if (leaves && leaves.has(d)) {
            const lt = leaves.get(d) || "AL"
            row[d] = { creneau_id: `conge_${lt}`, heure_debut: "", heure_fin: "", pause_debut: "", pause_fin: "", heures_prevues: 0 }
            continue
          }
          // Respecter week-end (jour de repos)
          if (isWeekend(year, month, d)) {
            row[d] = null
            continue
          }
          // Appliquer le shift choisi
          row[d] = {
            creneau_id: c.id,
            heure_debut: c.heure_debut,
            heure_fin: c.heure_fin,
            pause_debut: c.pause_debut,
            pause_fin: c.pause_fin,
            heures_prevues: c.heures_effectives,
          }
        }
        next[empId] = row
      }
      return next
    })
    notifySuccess(`${t('rhpl.shift_word', locale)} "${c.nom}" ${t('rhpl.applied_to', locale)} ${shiftAssignEmployes.length} ${t('rhpl.employees_word', locale)}`)
    setShiftAssignOpen(false)
    setShiftAssignCreneauId("")
    setShiftAssignEmployes([])
  }

  const applyBulk = () => {
    const c = bulkCreneauId === "repos" ? REPOS_CRENEAU : getCreneauById(bulkCreneauId)
    setPlanning(prev => {
      const next = { ...prev }
      for (const empId of bulkEmployees) {
        if (!next[empId]) continue
        const row = { ...next[empId] }
        for (let d = bulkDateFrom; d <= Math.min(bulkDateTo, daysInMonth); d++) {
          if (bulkWeekendOff && isWeekend(year, month, d) && bulkCreneauId !== "repos") continue
          row[d] = c.id === "repos" ? null : {
            creneau_id: c.id, heure_debut: c.heure_debut, heure_fin: c.heure_fin,
            pause_debut: c.pause_debut, pause_fin: c.pause_fin, heures_prevues: c.heures_effectives,
          }
        }
        next[empId] = row
      }
      return next
    })
    setBulkOpen(false)
  }

  // ─── Planning creation wizard ─────────────────────────────────────
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardMode, setWizardMode] = useState<"standard" | "rotation" | "manual">("standard")
  const [wizardShift, setWizardShift] = useState("")
  const [wizardRotation, setWizardRotation] = useState<string[]>([])

  const isPlanningEmpty = employes.length > 0 && Object.values(planning).every(row =>
    !row || Object.values(row).every(cell => !cell)
  )

  const applyWizard = () => {
    if (wizardMode === "standard") {
      const c = creneaux.find(cr => cr.id === wizardShift) || creneaux[0]
      if (!c) return
      setPlanning(prev => {
        const next = { ...prev }
        for (const empId of Object.keys(next)) {
          const row = { ...next[empId] }
          for (let d = 1; d <= daysInMonth; d++) {
            const leaves = approvedLeaves[empId]
            if (leaves && leaves.has(d)) {
              const lt = leaves.get(d) || "AL"
              row[d] = { creneau_id: `conge_${lt}`, heure_debut: "", heure_fin: "", pause_debut: "", pause_fin: "", heures_prevues: 0 }
            } else {
              row[d] = isWeekend(year, month, d) ? null : {
                creneau_id: c.id, heure_debut: c.heure_debut, heure_fin: c.heure_fin,
                pause_debut: c.pause_debut, pause_fin: c.pause_fin, heures_prevues: c.heures_effectives,
              }
            }
          }
          next[empId] = row
        }
        return next
      })
    } else if (wizardMode === "rotation") {
      const rotShifts = wizardRotation.map(id => creneaux.find(c => c.id === id)).filter(Boolean) as Creneau[]
      if (rotShifts.length < 2) return
      setPlanning(prev => {
        const next = { ...prev }
        const empIds = Object.keys(next)
        empIds.forEach((empId, idx) => {
          const row = { ...next[empId] }
          for (let d = 1; d <= daysInMonth; d++) {
            const leaves = approvedLeaves[empId]
            if (leaves && leaves.has(d)) {
              const lt = leaves.get(d) || "AL"
              row[d] = { creneau_id: `conge_${lt}`, heure_debut: "", heure_fin: "", pause_debut: "", pause_fin: "", heures_prevues: 0 }
            } else {
              const weekNum = Math.floor((d - 1) / 7)
              const c = rotShifts[(idx + weekNum) % rotShifts.length]
              row[d] = isWeekend(year, month, d) ? null : {
                creneau_id: c.id, heure_debut: c.heure_debut, heure_fin: c.heure_fin,
                pause_debut: c.pause_debut, pause_fin: c.pause_fin, heures_prevues: c.heures_effectives,
              }
            }
          }
          next[empId] = row
        })
        return next
      })
    }
    // "manual" = close wizard, user edits cell by cell
    setWizardOpen(false)
  }

  const savePlanning = async (publish = false) => {
    setSaving(true)
    try {
      const entries: any[] = []
      for (const empId of Object.keys(planning)) {
        for (let d = 1; d <= daysInMonth; d++) {
          const cell = planning[empId][d]
          // Skip leave days — congés are managed separately via demandes_conges
          if (cell && (cell.creneau_id === "conge" || cell.creneau_id?.startsWith("conge_"))) continue
          if (approvedLeaves[empId]?.has(d)) continue
          entries.push({
            employe_id: empId, jour: d,
            shift: cell ? (getCreneauById(cell.creneau_id)?.nom || cell.creneau_id) : "Repos",
            creneau_id: cell?.creneau_id || "repos",
            heure_debut: cell?.heure_debut || null,
            heure_fin: cell?.heure_fin || null,
            pause_debut: cell?.pause_debut || null,
            pause_fin: cell?.pause_fin || null,
            heures_prevues: cell?.heures_prevues || 0,
          })
        }
      }
      const res = await fetch("/api/rh/planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periode, societe_id: societe, planning: entries, publish }),
      })
      const data = await res.json()
      if (!res.ok) {
        notifyError(t('rhpl.save_planning', locale), data.error || res.statusText)
        return
      }
      if (publish) setPublished(true)
      notifySuccess(publish ? t('rhpl.planning_published', locale) : t('rhpl.planning_saved', locale))
    } catch (e: any) {
      notifyError(t('rhpl.network_error', locale), e)
      console.error(e)
    }
    finally { setSaving(false) }
  }

  // ─── Créneau CRUD ────────────────────────────────────────────────

  const addCreneau = () => {
    const id = `c${Date.now()}`
    const newC: Creneau = {
      id, nom: t('rhpl.new_slot', locale), code: "X",
      heure_debut: "08:00", heure_fin: "16:00",
      pause_debut: "12:00", pause_fin: "12:30", pause_minutes: 30,
      heures_effectives: 7.5, couleur: COLORS[creneaux.length % COLORS.length],
    }
    setCreneaux(prev => {
      const next = [...prev, newC]
      persistCreneaux(next)
      return next
    })
    setEditingCreneau(newC)
  }

  const updateCreneau = (updated: Creneau) => {
    updated.pause_minutes = computeMinutes(updated.pause_debut, updated.pause_fin)
    updated.heures_effectives = computeEffective(updated.heure_debut, updated.heure_fin, updated.pause_debut, updated.pause_fin)
    setCreneaux(prev => {
      const next = prev.map(c => c.id === updated.id ? updated : c)
      persistCreneaux(next)
      return next
    })
    setEditingCreneau(null)
  }

  const deleteCreneau = (id: string) => {
    setCreneaux(prev => {
      const next = prev.filter(c => c.id !== id)
      persistCreneaux(next)
      return next
    })
    setEditingCreneau(null)
  }

  // ─── Navigation ─────────────────────────────────────────────────

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>{t('rha.a.plan.title', locale)}</h1>
          <p className="text-gray-500 text-sm">
            {t('rha.a.plan.subtitle2_prefix', locale)} {getMonthNames(locale)[month]} {year}.
            {societe !== "all" && (
              <span className="ml-2 text-xs">· {t('rha.a.plan.weekly_limit', locale)} <b>{weeklyLimit}h</b></span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder={t('rha.a.plan.societe_ph', locale)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('rha.a.plan.toutes', locale)}</SelectItem>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          {groupes.length > 0 && (
            <Select value={selectedGroupe} onValueChange={v => {
              setSelectedGroupe(v)
              if (v === "all") {
                setIncludedEmpIds(new Set(allEmployes.map(e => e.id)))
              } else if (v === "sans_groupe") {
                const assignedIds = new Set(groupes.flatMap((g: any) => (g.membres || []).map((m: any) => m.employe_id)))
                setIncludedEmpIds(new Set(allEmployes.filter(e => !assignedIds.has(e.id)).map(e => e.id)))
              } else {
                const g = groupes.find((g: any) => g.id === v)
                setIncludedEmpIds(new Set((g?.membres || []).map((m: any) => m.employe_id)))
              }
              // Trigger re-render of displayed employees
              setEmployes(allEmployes.filter(e => {
                if (v === "all") return true
                if (v === "sans_groupe") {
                  const assignedIds = new Set(groupes.flatMap((g: any) => (g.membres || []).map((m: any) => m.employe_id)))
                  return !assignedIds.has(e.id)
                }
                const g = groupes.find((g: any) => g.id === v)
                return (g?.membres || []).some((m: any) => m.employe_id === e.id)
              }))
            }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder={t('rha.a.plan.groupe_ph', locale)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('rha.a.plan.all_groups', locale)}</SelectItem>
                {groupes.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.nom} ({g.nb_membres})</SelectItem>)}
                <SelectItem value="sans_groupe">{t('rha.a.plan.no_group', locale)}</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => setEmpFilterOpen(true)}>
            <Users className="h-4 w-4 mr-1" /> {t('rha.a.plan.collabs', locale)} ({employes.length}/{allEmployes.length})
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setEditingCreneau(null); setCreneauConfigOpen(true) }}>
            <Clock className="h-4 w-4 mr-1" /> {t('rha.a.plan.creneaux', locale)}
          </Button>
        </div>
      </div>

      {/* Créneaux summary — bandeau enrichi avec lien vers /rh/planning/regles */}
      {(() => {
        const societeNom = societes.find(s => s.id === societe)?.nom || "société"
        const joursShort: Record<string, string> = { lun: "Lu", mar: "Ma", mer: "Me", jeu: "Je", ven: "Ve", sam: "Sa", dim: "Di" }
        return (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-semibold" style={{ color: "#0B0F2E" }}>
                    {t('rha.a.plan.creneaux_of', locale)} {societeNom}
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    {creneaux.length} {creneaux.length > 1 ? t('rha.a.plan.actifs', locale) : t('rha.a.plan.actif', locale)}
                  </Badge>
                </div>
                <Link href="/rh/planning/regles" className="text-xs font-medium text-blue-600 hover:underline">
                  {t('rha.a.plan.edit', locale)}
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {creneaux.length === 0 ? (
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-dashed border-gray-300 bg-gray-50">
                  <span className="text-sm text-gray-500">{t('rha.a.plan.no_creneau', locale)}</span>
                  <Link href="/rh/planning/regles">
                    <Button size="sm" variant="outline">{t('rha.a.plan.configurer', locale)}</Button>
                  </Link>
                </div>
              ) : (
                <div className="flex flex-wrap items-stretch gap-2">
                  {creneaux.map(c => {
                    const jours = (c.jours || []).map(j => joursShort[j] || j).join("·")
                    return (
                      <div key={c.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${c.couleur}`}>
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-white/20 text-xs font-bold">
                          {c.code}
                        </span>
                        <div className="flex flex-col leading-tight">
                          <span className="text-sm font-semibold">{c.nom}</span>
                          <span className="text-[10px] opacity-90">
                            {c.heure_debut && c.heure_fin ? `${c.heure_debut}—${c.heure_fin}` : "—"}
                            {c.pause_minutes > 0 ? ` · ${c.pause_minutes}min` : ""}
                            {c.heures_effectives > 0 ? ` · ${c.heures_effectives}h eff.` : ""}
                          </span>
                          {jours && <span className="text-[9px] opacity-75">{jours}</span>}
                        </div>
                      </div>
                    )
                  })}
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-gray-200 text-gray-600 self-start">
                    <span className="font-bold">R</span> {t('rha.a.plan.repos', locale)}
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-100 text-emerald-700 self-start">
                    <span className="font-bold">C</span> {t('rha.a.plan.conge', locale)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {/* Banner guidance — affiché si la société a des employés mais qu'aucune
          cellule du planning n'est encore remplie pour le mois affiché. */}
      {!loading && employes.length > 0 && (() => {
        const filledCells = Object.values(planning).reduce(
          (sum, empPlanning) => sum + Object.values(empPlanning).filter(c => c !== null).length,
          0,
        )
        if (filledCells > 0) return null
        return (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                  <Wand2 className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-blue-900">
                    {t('rha.a.plan.ready_prefix', locale)} {getMonthNames(locale)[month]} {year} ?
                  </h4>
                  <p className="text-sm text-blue-800 mt-1">
                    {t('rha.a.plan.ready_hint', locale)}
                  </p>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" onClick={generateStandard}>
                      {t('rha.a.plan.apply_standard', locale)}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
                      {t('rha.a.plan.bulk_affect', locale)}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {/* Conflict alert bar */}
      {/* Sprint 11 BUG 8 — différencier erreurs bloquantes (rouge) des
          avertissements OT légaux (jaune). Compteur séparé + badges +
          note explicative sur la zone légale 45h→55h. */}
      {conflicts.length > 0 && (() => {
        const errors = conflicts.filter(c => c.severity === "error")
        const warnings = conflicts.filter(c => c.severity === "warning")
        const hasErrors = errors.length > 0
        const barBorder = hasErrors ? "border-red-300" : "border-yellow-300"
        const barBg = hasErrors ? "bg-red-50" : "bg-yellow-50"
        const iconColor = hasErrors ? "text-red-600" : "text-yellow-600"
        const textColor = hasErrors ? "text-red-800" : "text-yellow-800"
        return (
        <div className={`flex flex-col gap-2 px-4 py-2.5 rounded-lg border ${barBorder} ${barBg}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <AlertTriangle className={`h-5 w-5 ${iconColor} shrink-0`} />
            <span className={`text-sm font-medium ${textColor}`}>
              {errors.length > 0 && (
                <><span className="font-bold">{errors.length} {errors.length > 1 ? t('rhpl.errors', locale) : t('rhpl.error', locale)}</span> ({t('rhpl.blocking', locale)})</>
              )}
              {errors.length > 0 && warnings.length > 0 && <span> — </span>}
              {warnings.length > 0 && (
                <>{warnings.length} {warnings.length > 1 ? t('rhpl.warnings', locale) : t('rhpl.warning', locale)} ({t('rhpl.ot_legal_paren', locale)})</>
              )}
            </span>
            <button
              className={`text-sm font-medium underline ${hasErrors ? "text-red-700 hover:text-red-900" : "text-yellow-700 hover:text-yellow-900"}`}
              onClick={() => setShowConflicts(!showConflicts)}
            >
              {showConflicts ? t('rhpl.hide', locale) : t('rhpl.see_details', locale)}
            </button>
          </div>
          {warnings.length > 0 && !hasErrors && (
            <p className="text-xs text-yellow-700 italic">
              {t('rhpl.ot_note_prefix', locale)} {weeklyLimit}h {t('rhpl.ot_note_mid', locale)}
              ({WEEKLY_OT_LIMIT}h {t('rhpl.max_wra_2019', locale)}). {t('rhpl.ot_note_suffix', locale)}
            </p>
          )}
          {showConflicts && (
            <div className="flex flex-col gap-1 text-xs max-h-40 overflow-y-auto">
              {conflicts.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Badge className={
                    c.severity === "error"
                      ? "bg-red-100 text-red-700"
                      : "bg-orange-100 text-orange-700"
                  }>
                    {c.type === "leave" ? t('rhpl.conge_badge', locale) : c.severity === "warning" ? "OT" : t('rhpl.hours_badge', locale)}
                  </Badge>
                  <span className="font-medium">{c.empName}</span>
                  <span className={c.severity === "error" ? "text-red-800" : "text-yellow-900"}>{c.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        )
      })()}

      {/* WRA Validation Results */}
      {showValidation && validationResults !== null && (
        <Card className={`border ${validationResults.length === 0 ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                {validationResults.length === 0 ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="text-green-800">{t('rhpl.compliant_wra', locale)}</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-600" />
                    <span className="text-red-800">
                      {validationResults.length} {validationResults.length > 1 ? t('rhpl.violations_found_plural', locale) : t('rhpl.violation_found', locale)} {t('rhpl.on_word', locale)} {new Set(validationResults.filter(v => v.empId).map(v => v.empId)).size} {t('rhpl.employees_paren', locale)}
                    </span>
                  </>
                )}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowValidation(false)} className="text-xs">
                {t('rhpl.close', locale)}
              </Button>
            </div>
          </CardHeader>
          {validationResults.length > 0 && (
            <CardContent className="pt-0">
              <div className="max-h-48 overflow-y-auto space-y-1.5">
                {validationResults.map((v, i) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs ${
                    v.severity === "red" ? "bg-red-100 text-red-800 border border-red-200" : "bg-orange-100 text-orange-800 border border-orange-200"
                  }`}>
                    <Badge className={`text-[10px] shrink-0 ${v.severity === "red" ? "bg-red-600 text-white" : "bg-orange-500 text-white"}`}>
                      {v.severity === "red" ? "WRA" : t('rhpl.alert_badge', locale)}
                    </Badge>
                    <span className="font-medium shrink-0">{v.empName}</span>
                    <span className="font-medium shrink-0">[{v.rule}]</span>
                    <span className="truncate">{v.detail}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Calendar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <CardTitle className="text-lg" style={{ color: "#0B0F2E" }}>
                <Calendar className="inline h-5 w-5 mr-2" />{getMonthNames(locale)[month]} {year}
              </CardTitle>
              <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {published
                ? <Badge className="bg-green-100 text-green-700">{t('rha.a.plan.publie', locale)}</Badge>
                : <Badge className="bg-amber-100 text-amber-700">{t('rha.a.plan.brouillon', locale)}</Badge>}
              {/* View toggle */}
              <div className="inline-flex rounded-lg border overflow-hidden">
                <button
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "monthly" ? "text-white" : "text-gray-600 hover:bg-gray-50"}`}
                  style={viewMode === "monthly" ? { backgroundColor: "#0B0F2E" } : {}}
                  onClick={() => setViewMode("monthly")}
                >
                  <Calendar className="inline h-3.5 w-3.5 mr-1" />{t('rha.a.plan.mensuel', locale)}
                </button>
                <button
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "weekly" ? "text-white" : "text-gray-600 hover:bg-gray-50"}`}
                  style={viewMode === "weekly" ? { backgroundColor: "#0B0F2E" } : {}}
                  onClick={() => { setViewMode("weekly"); setWeekOffset(0) }}
                >
                  <Eye className="inline h-3.5 w-3.5 mr-1" />{t('rha.a.plan.hebdo', locale)}
                </button>
              </div>
              {/* Dropdown "Remplir" — regroupe Standard, 3×8, Copier semaine,
                  Affectation multiple. Réduit le bruit visuel de la barre. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Wand2 className="h-4 w-4 mr-1" /> {t('rhpl.fill', locale)} <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs">{t('rhpl.auto_generators', locale)}</DropdownMenuLabel>
                  <DropdownMenuItem onClick={generateStandard}>
                    {t('rhpl.standard_planning', locale)}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={generate3x8}>
                    {t('rhpl.rotation_3x8', locale)}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setConfirmGenOpen(true)}>
                    {t('rhpl.copy_current_week', locale)}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShiftAssignOpen(true)}>
                    <UserCheck className="h-4 w-4 mr-2 text-indigo-600" />
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{t('rhpl.assign_shift_employees', locale)}</span>
                      <span className="text-[10px] text-gray-500">{t('rhpl.assign_shift_hint', locale)}</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setBulkOpen(true)}>
                    {t('rhpl.multi_assign', locale)}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Dropdown "Outils" — Vérifier conformité, Export PDF, Règles */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-1" /> {t('rhpl.tools', locale)} <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={runValidation}>
                    {t('rhpl.check_compliance', locale)}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toast.info(t('rhpl.export_pdf_soon', locale))}>
                    {t('rhpl.export_pdf', locale)}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/rh/planning/regles">{t('rhpl.rules_and_slots', locale)}</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Sprint 7 FIX 5 — Sauver vs Publier clairement distincts.
                  Séparateur visuel (border-l) pour distinguer les actions
                  finales des outils ci-dessus. */}
              <div className="border-l pl-2 ml-1 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => savePlanning(false)}
                  disabled={saving}
                  title={t('rhpl.save_draft_title', locale)}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                  {t('rhpl.save_draft', locale)}
                </Button>
                <Button
                  size="sm"
                  onClick={() => setConfirmPublishOpen(true)}
                  disabled={saving}
                  className="text-white hover:opacity-90 bg-emerald-600 hover:bg-emerald-700"
                  title={t('rhpl.publish_employees_title', locale)}
                >
                  <Send className="h-4 w-4 mr-1" />
                  {t('rhpl.publish_employees', locale)}
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
          ) : employes.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              {societe === "all" ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-gray-100 mx-auto flex items-center justify-center">
                    <Calendar className="w-7 h-7 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold" style={{ color: "#0B0F2E" }}>
                    {t('rhpl.select_company', locale)}
                  </h3>
                  <p className="text-sm text-gray-500 max-w-md mx-auto">
                    {t('rhpl.select_company_hint', locale)}
                  </p>
                </>
              ) : allEmployes.length === 0 ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-amber-100 mx-auto flex items-center justify-center">
                    <Users className="w-7 h-7 text-amber-600" />
                  </div>
                  <h3 className="text-lg font-semibold" style={{ color: "#0B0F2E" }}>
                    {t('rhpl.no_employee_company', locale)}
                  </h3>
                  <p className="text-sm text-gray-500 max-w-md mx-auto">
                    {t('rhpl.no_employee_hint', locale)}
                  </p>
                  <div className="pt-2">
                    <Link href="/rh/employes">
                      <Button size="sm" style={{ backgroundColor: "#0B0F2E" }} className="text-white">
                        <Plus className="h-4 w-4 mr-1" /> {t('rhpl.add_employee', locale)}
                      </Button>
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-blue-100 mx-auto flex items-center justify-center">
                    <Users className="w-7 h-7 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold" style={{ color: "#0B0F2E" }}>
                    {t('rhpl.nobody_to_show', locale)}
                  </h3>
                  <p className="text-sm text-gray-500 max-w-md mx-auto">
                    {allEmployes.length} {t('rhpl.available_in_company', locale)}
                  </p>
                  <div className="pt-2">
                    <Button size="sm" onClick={() => setEmpFilterOpen(true)}>
                      <Users className="h-4 w-4 mr-1" /> {t('rhpl.choose_collaborators', locale)}
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : isPlanningEmpty && societe !== "all" ? (
            /* ── Planning vide : assistant de démarrage ── */
            <div className="text-center py-16 space-y-4">
              <Calendar className="w-12 h-12 mx-auto text-gray-300" />
              <h3 className="text-lg font-semibold text-[#0B0F2E]">
                {t('rhpl.no_planning_for', locale)} {getMonthNames(locale)[month]} {year}
              </h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                {t('rhpl.create_planning_prefix', locale)} {employes.length} {t('rhpl.create_planning_suffix', locale)}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button
                  onClick={() => { setWizardShift(creneaux[0]?.id || ""); setWizardMode("standard"); setWizardOpen(true) }}
                  className="bg-[#0B0F2E] text-white"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  {t('rhpl.create_planning_btn', locale)}
                </Button>
                {creneaux.length >= 3 && (
                  <Button
                    variant="outline"
                    onClick={() => { setWizardRotation(creneaux.slice(0, 3).map(c => c.id)); setWizardMode("rotation"); setWizardOpen(true) }}
                  >
                    {t('rhpl.auto_rotation', locale)} ({creneaux.length} shifts)
                  </Button>
                )}
              </div>
              {creneaux.length <= 1 && (
                <p className="text-xs text-amber-600 mt-2">
                  {t('rhpl.single_slot_hint', locale)}
                </p>
              )}
            </div>
          ) : viewMode === "monthly" ? (
            /* ── Monthly View ── */
            <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white z-10 border px-2 py-1 text-left min-w-[140px]" style={{ color: "#0B0F2E" }}>{t('rhpl.employee', locale)}</th>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                      const dow = new Date(year, month, d).getDay()
                      return (
                        <th key={d} className={`border px-0 py-1 text-center min-w-[38px] ${dow === 0 || dow === 6 ? "bg-gray-100" : ""}`}>
                          <div className="text-[9px] text-gray-400">{getDayNames(locale)[dow]}</div>
                          <div className="text-[11px]">{d}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {employes.map(emp => (
                    <tr key={emp.id}>
                      <td className="sticky left-0 bg-white z-10 border px-2 py-1 font-medium truncate max-w-[140px]">{emp.prenom} {emp.nom}</td>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                        const cell = planning[emp.id]?.[d]
                        // Always check approvedLeaves first (source of truth for leave type)
                        const leaveType = approvedLeaves[emp.id]?.get(d) || (cell?.creneau_id?.startsWith("conge_") ? cell.creneau_id.replace("conge_", "") : null)
                        const isLeave = !!leaveType || (cell && (cell.creneau_id === "conge" || cell.creneau_id?.startsWith("conge_")))
                        const leaveMonthColors: Record<string, { couleur: string; code: string; nom: string }> = {
                          AL: { couleur: "bg-blue-200 text-blue-800", code: "AL", nom: t('rhpl.local_leave', locale) },
                          SL: { couleur: "bg-orange-200 text-orange-800", code: "SL", nom: t('rhpl.sick_leave', locale) },
                          MAT: { couleur: "bg-purple-200 text-purple-800", code: "MAT", nom: t('rhpl.maternity', locale) },
                          PAT: { couleur: "bg-indigo-200 text-indigo-800", code: "PAT", nom: t('rhpl.paternity', locale) },
                          SANS_SOLDE: { couleur: "bg-gray-300 text-gray-700", code: "SS", nom: t('rhpl.unpaid', locale) },
                        }
                        const lt = leaveType || "AL"
                        const creneau = isLeave
                          ? { ...CONGE_CRENEAU, couleur: leaveMonthColors[lt]?.couleur || CONGE_CRENEAU.couleur, code: leaveMonthColors[lt]?.code || "C", nom: leaveMonthColors[lt]?.nom || t('rhpl.leave_word', locale) }
                          : cell ? getCreneauById(cell.creneau_id) : REPOS_CRENEAU
                        const isEditing = editCell?.empId === emp.id && editCell?.day === d
                        const hasConflict = cellHasConflict(emp.id, d)
                        const holiday = holidaysByDay[d]
                        return (
                          <td key={d}
                            className={`border p-0 text-center cursor-pointer relative ${hasConflict ? "ring-2 ring-inset ring-red-500" : ""} ${holiday ? "ring-1 ring-inset ring-amber-400" : ""} ${isEditing ? "ring-2 ring-inset ring-blue-500" : ""}`}
                            onClick={(e) => setEditCell(isEditing ? null : { empId: emp.id, day: d, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() })}
                            title={`${holiday ? `${t('rhpl.public_holiday', locale)} : ${holiday}\n` : ""}${hasConflict ? `${t('rhpl.conflict_leave_approved', locale)}\n${cell ? `${creneau.nom} ${cell.heure_debut}—${cell.heure_fin}` : t('rhpl.rest_word', locale)}` : cell ? `${creneau.nom}\n${cell.heure_debut}—${cell.heure_fin}\n${t('rhpl.break_word', locale)}: ${cell.pause_debut || "—"}—${cell.pause_fin || "—"}\n${cell.heures_prevues}h eff.` : t('rhpl.rest_word', locale)}`}
                          >
                            {holiday && (
                              <div className="absolute top-0 left-0 right-0 h-[3px] bg-amber-400" aria-hidden="true" />
                            )}
                            <div className={`w-full py-0.5 leading-tight ${hasConflict ? "bg-red-100 text-red-700" : creneau.couleur}`}>
                              <div className="text-[10px] font-bold">{creneau.code}</div>
                              {cell && cell.heure_debut && <div className="text-[7px] opacity-80">{cell.heure_debut?.slice(0,5)}</div>}
                              {holiday && <div className="text-[6px] font-bold text-amber-700 uppercase tracking-wide">{t('rhpl.holiday_short', locale)}</div>}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-3 px-2">
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-blue-200 border border-blue-300" /><span className="text-xs text-gray-600 font-medium">AL - {t('rhpl.local_leave', locale)}</span></div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-orange-200 border border-orange-300" /><span className="text-xs text-gray-600 font-medium">SL - {t('rhpl.sick_leave', locale)}</span></div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-purple-200 border border-purple-300" /><span className="text-xs text-gray-600 font-medium">MAT - {t('rhpl.maternity', locale)}</span></div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-indigo-200 border border-indigo-300" /><span className="text-xs text-gray-600 font-medium">PAT - {t('rhpl.paternity', locale)}</span></div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-gray-200 border border-gray-300" /><span className="text-xs text-gray-600 font-medium">R - {t('rhpl.rest_word', locale)}</span></div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-white border-2 border-amber-400" /><span className="text-xs text-gray-600 font-medium">{t('rhpl.holiday_legend', locale)}</span></div>
            </div>
            </>
          ) : (
            /* ── Weekly View ── */
            <div className="space-y-3">
              {/* Week navigation */}
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" disabled={weekOffset <= 0} onClick={() => setWeekOffset(w => w - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> {t('rhpl.prev_week', locale)}
                </Button>
                <span className="text-sm font-medium" style={{ color: "#0B0F2E" }}>
                  {t('rhpl.week_of_label', locale)} {currentWeek?.start} {t('rhpl.to_word', locale)} {currentWeek?.end} {getMonthNames(locale)[month]}
                </span>
                <Button variant="outline" size="sm" disabled={weekOffset >= weeks.length - 1} onClick={() => setWeekOffset(w => w + 1)}>
                  {t('rhpl.next_week', locale)} <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
              {/* Weekly grid */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-white z-10 border px-3 py-2 text-left min-w-[180px]" style={{ color: "#0B0F2E" }}>{t('rhpl.employee', locale)}</th>
                      {Array.from({ length: 7 }, (_, i) => {
                        const day = (currentWeek?.start || 1) + i
                        const valid = day <= daysInMonth
                        return (
                          <th key={i} className="border px-2 py-2 text-center min-w-[120px]" style={{ backgroundColor: valid ? "#f8f9fa" : "#eee" }}>
                            <div className="text-xs font-bold" style={{ color: "#0B0F2E" }}>{WEEK_DAY_LABELS[i]}</div>
                            {valid && <div className="text-xs text-gray-500">{day}/{month + 1}</div>}
                          </th>
                        )
                      })}
                      <th className="border px-2 py-2 text-center min-w-[80px] bg-gray-50" style={{ color: "#0B0F2E" }}>{t('rhpl.total', locale)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employes.map(emp => {
                      const weekHours = getWeeklyHours(emp.id, currentWeek?.start || 1, currentWeek?.end || 7)
                      // Sprint 11 BUG 8 — 3 niveaux : OK / OT légal (jaune) / dépassement illégal (rouge)
                      const hoursOverLimit = weekHours > weeklyLimit
                      const hoursIllegal = weekHours > WEEKLY_OT_LIMIT
                      const hoursExceeded = hoursOverLimit // alias pour compat des refs plus bas
                      return (
                        <tr key={emp.id}>
                          <td className="sticky left-0 bg-white z-10 border px-3 py-2 font-medium">{emp.prenom} {emp.nom}</td>
                          {Array.from({ length: 7 }, (_, i) => {
                            const day = (currentWeek?.start || 1) + i
                            const valid = day <= daysInMonth
                            if (!valid) return <td key={i} className="border p-2 bg-gray-50" />
                            const cell = planning[emp.id]?.[day]
                            const hasConflict = cellHasConflict(emp.id, day)
                            const leaveType = approvedLeaves[emp.id]?.get(day)
                            const isLeaveDay = !!leaveType
                            const isEditing = editCell?.empId === emp.id && editCell?.day === day

                            // Leave type colors — distinct and visible
                            const leaveColors: Record<string, { bg: string; label: string }> = {
                              AL: { bg: "bg-blue-200 text-blue-800 font-bold", label: t('rhpl.local_leave', locale) },
                              SL: { bg: "bg-orange-200 text-orange-800 font-bold", label: t('rhpl.sick_leave', locale) },
                              MAT: { bg: "bg-purple-200 text-purple-800 font-bold", label: t('rhpl.maternity', locale) },
                              PAT: { bg: "bg-indigo-200 text-indigo-800 font-bold", label: t('rhpl.paternity', locale) },
                              SANS_SOLDE: { bg: "bg-gray-300 text-gray-700 font-bold", label: t('rhpl.unpaid', locale) },
                            }

                            let bgColor = "bg-gray-100 text-gray-500" // Repos
                            let label = t('rhpl.rest_word', locale)
                            // Always check approvedLeaves first (source of truth)
                            if (isLeaveDay) {
                              const lc = leaveColors[leaveType] || { bg: "bg-emerald-200 text-emerald-800 font-bold", label: t('rhpl.leave_word', locale) }
                              bgColor = lc.bg
                              label = lc.label
                            } else if (cell) {
                              const isCongeCell = cell.creneau_id === "conge" || cell.creneau_id?.startsWith("conge_")
                              if (isCongeCell) {
                                const cellType = cell.creneau_id?.startsWith("conge_") ? cell.creneau_id.replace("conge_", "") : "AL"
                                const lc = leaveColors[cellType] || { bg: "bg-emerald-200 text-emerald-800 font-bold", label: t('rhpl.leave_word', locale) }
                                bgColor = lc.bg
                                label = lc.label
                              } else {
                                bgColor = "bg-blue-50 text-blue-800"
                                label = `${cell.heure_debut?.slice(0,5) || ""}—${cell.heure_fin?.slice(0,5) || ""}`
                              }
                            }
                            if (hasConflict) {
                              bgColor = "bg-red-50 text-red-700"
                            }

                            const wHoliday = holidaysByDay[day]
                            return (
                              <td key={i}
                                className={`border p-0 text-center cursor-pointer relative ${hasConflict ? "ring-2 ring-inset ring-red-500" : ""} ${wHoliday ? "ring-1 ring-inset ring-amber-400" : ""} ${isEditing ? "ring-2 ring-inset ring-blue-500" : ""}`}
                                onClick={(e) => setEditCell(isEditing ? null : { empId: emp.id, day, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() })}
                                title={`${wHoliday ? `${t('rhpl.public_holiday', locale)} : ${wHoliday}\n` : ""}${hasConflict ? t('rhpl.conflict_leave_approved', locale) : label}`}
                              >
                                {wHoliday && (
                                  <div className="absolute top-0 left-0 right-0 h-[3px] bg-amber-400 z-10" aria-hidden="true" />
                                )}
                                <div className={`px-2 py-2.5 rounded-sm ${bgColor}`}>
                                  <div className="text-xs font-semibold">{label}</div>
                                  {cell && cell.creneau_id !== "conge" && !cell.creneau_id?.startsWith("conge_") && (
                                    <div className="text-[10px] opacity-70 mt-0.5">
                                      {getCreneauById(cell.creneau_id).nom} ({cell.heures_prevues}h)
                                    </div>
                                  )}
                                  {wHoliday && <div className="text-[9px] font-bold text-amber-700 uppercase tracking-wide mt-0.5">{t('rhpl.holiday_short', locale)}</div>}
                                  {hasConflict && <AlertTriangle className="inline h-3 w-3 text-red-500 mt-0.5" />}
                                </div>
                              </td>
                            )
                          })}
                          <td className={`border px-2 py-2 text-center font-bold text-sm ${
                              hoursIllegal
                                ? "bg-red-50 text-red-700"
                                : hoursOverLimit
                                  ? "bg-yellow-50 text-yellow-800"
                                  : "bg-gray-50"
                            }`}
                            title={
                              hoursIllegal
                                ? `${t('rhpl.illegal_overrun_label', locale)} : ${weekHours}h > ${WEEKLY_OT_LIMIT}h ${t('rhpl.max_wra', locale)}`
                                : hoursOverLimit
                                  ? `${t('rhpl.ot_legal_label', locale)} : ${weekHours}h (${t('rhpl.base_word', locale)} ${weeklyLimit}h + ${weekHours - weeklyLimit}h OT ≤ ${WEEKLY_OT_LIMIT}h ${t('rhpl.max_wra', locale)})`
                                  : `${weekHours}h ${t('rhpl.this_week', locale)}`
                            }>
                            {weekHours}h
                            {hoursIllegal && <AlertTriangle className="inline h-3 w-3 text-red-500 ml-1" />}
                            {hoursOverLimit && !hoursIllegal && <AlertTriangle className="inline h-3 w-3 text-yellow-500 ml-1" />}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {/* Color legend */}
              <div className="flex items-center gap-4 text-xs text-gray-500 pt-1">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "#4191FF" }} /> {t('rhpl.work_word', locale)}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-gray-300" /> {t('rhpl.rest_word', locale)}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-emerald-400" /> {t('rhpl.leave_word', locale)}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-400" /> {t('rhpl.conflict_word', locale)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Employee filter dialog ── */}
      <Dialog open={empFilterOpen} onOpenChange={setEmpFilterOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: "#0B0F2E" }}>{t('rhpl.collabs_in_planning', locale)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder={t('rha.a.plan.search_collab', locale)} value={empSearch} onChange={e => setEmpSearch(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIncludedEmpIds(new Set(allEmployes.map(e => e.id)))}>
                {t('rhpl.select_all', locale)}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIncludedEmpIds(new Set())}>
                {t('rhpl.deselect_all', locale)}
              </Button>
            </div>
            <div className="border rounded-lg divide-y max-h-[50vh] overflow-y-auto">
              {allEmployes
                .filter(e => {
                  if (!empSearch.trim()) return true
                  const q = empSearch.toLowerCase()
                  return `${e.nom} ${e.prenom}`.toLowerCase().includes(q) || (e.poste || "").toLowerCase().includes(q)
                })
                .map(emp => (
                  <label key={emp.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includedEmpIds.has(emp.id)}
                      onChange={() => {
                        setIncludedEmpIds(prev => {
                          const next = new Set(prev)
                          if (next.has(emp.id)) next.delete(emp.id)
                          else next.add(emp.id)
                          return next
                        })
                      }}
                      className="rounded border-gray-300"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{emp.prenom} {emp.nom}</p>
                      {emp.poste && <p className="text-xs text-gray-400">{emp.poste}</p>}
                    </div>
                    {includedEmpIds.has(emp.id) && (
                      <Badge className="bg-green-100 text-green-700 text-[10px]">{t('rhpl.included', locale)}</Badge>
                    )}
                  </label>
                ))}
            </div>
            <p className="text-xs text-gray-500">{includedEmpIds.size} {t('rhpl.selected_of', locale)} {allEmployes.length}</p>
            <Button className="w-full text-white" style={{ backgroundColor: "#0B0F2E" }} onClick={() => {
              setEmployes(allEmployes.filter(e => includedEmpIds.has(e.id)))
              // Rebuild planning grid for newly included employees
              setPlanning(prev => {
                const next = { ...prev }
                for (const emp of allEmployes) {
                  if (includedEmpIds.has(emp.id) && !next[emp.id]) {
                    next[emp.id] = {}
                    for (let d = 1; d <= daysInMonth; d++) next[emp.id][d] = null
                  }
                }
                // Remove excluded
                for (const empId of Object.keys(next)) {
                  if (!includedEmpIds.has(empId)) delete next[empId]
                }
                return next
              })
              setEmpFilterOpen(false)
            }}>
              {t('rhpl.apply', locale)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Créneau config dialog ── */}
      <Dialog open={creneauConfigOpen} onOpenChange={setCreneauConfigOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: "#0B0F2E" }}>{t('rhpl.time_slots', locale)}</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-xs text-blue-900 mb-3">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{t('rhpl.slots_shared_note', locale)}</p>
              <p className="mt-0.5">{t('rhpl.full_edit_prefix', locale)} <Link href="/rh/planning/regles" className="underline font-medium">{t('rhpl.planning_rules_link', locale)}</Link>.</p>
            </div>
          </div>
          {!editingCreneau ? (
            <div className="space-y-3">
              {creneaux.map(c => (
                <div key={c.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50">
                  <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-sm font-bold ${c.couleur}`}>{c.code}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{c.nom}</p>
                    <p className="text-xs text-gray-500">{c.heure_debut} — {c.heure_fin} | {t('rhpl.break_word', locale)}: {c.pause_debut || "—"} — {c.pause_fin || "—"} ({c.pause_minutes}min) | {c.heures_effectives}h eff.</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setEditingCreneau(c)}>{t('rhpl.modify', locale)}</Button>
                </div>
              ))}
              <Button variant="outline" className="w-full" onClick={addCreneau}><Plus className="h-4 w-4 mr-1" /> {t('rhpl.add_slot', locale)}</Button>
            </div>
          ) : (
            <CreneauEditor creneau={editingCreneau} onSave={updateCreneau} onDelete={deleteCreneau} onCancel={() => setEditingCreneau(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirm generate dialog ── */}
      <Dialog open={confirmGenOpen} onOpenChange={setConfirmGenOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ color: "#0B0F2E" }}>{t('rhpl.generate_template', locale)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {t('rhpl.gen_template_desc1', locale)}
              {currentWeek ? ` (${t('rhpl.days_word', locale)} ${currentWeek.start}–${currentWeek.end})` : ""} {t('rhpl.gen_template_desc2', locale)} {getMonthNames(locale)[month]}.
            </p>
            <p className="text-sm text-yellow-700 bg-yellow-50 px-3 py-2 rounded-lg border border-yellow-200">
              <AlertTriangle className="inline h-4 w-4 mr-1" />
              {t('rhpl.gen_template_warn', locale)}
            </p>
            <div className="flex gap-2">
              <Button className="flex-1 text-white" style={{ backgroundColor: "#D4AF37" }} onClick={generateFromCurrentWeek}>
                <Copy className="h-4 w-4 mr-1" /> {t('rhpl.confirm', locale)}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setConfirmGenOpen(false)}>{t('rhpl.cancel', locale)}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk dialog ── */}
      {/* Sprint 7 FIX 5 — Dialog confirmation publication */}
      <Dialog open={confirmPublishOpen} onOpenChange={setConfirmPublishOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ color: "#0B0F2E" }} className="flex items-center gap-2">
              <Send className="h-5 w-5 text-emerald-600" />
              {t('rhpl.publish_this_planning', locale)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-gray-700">
              {t('rhpl.publish_desc1', locale)} <strong>{t('rhpl.publish_desc_all_emp', locale)}</strong> {t('rhpl.publish_desc2', locale)} (<code className="bg-gray-100 px-1 rounded text-xs">/salarie</code>).
            </p>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
              <p className="font-medium mb-1">⚠️ {t('rhpl.before_publish_check', locale)}</p>
              <ul className="space-y-1 ml-4 list-disc">
                <li>{t('rhpl.check_assignments', locale)}</li>
                <li>{t('rhpl.check_wra_rules', locale)}</li>
                <li>{t('rhpl.check_no_conflict', locale)}</li>
              </ul>
            </div>
            <p className="text-xs text-gray-500">
              {t('rhpl.can_republish', locale)}
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button
              variant="outline"
              onClick={() => setConfirmPublishOpen(false)}
              disabled={saving}
            >
              {t('rhpl.cancel', locale)}
            </Button>
            <Button
              onClick={async () => {
                setConfirmPublishOpen(false)
                await savePlanning(true)
              }}
              disabled={saving}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              {t('rhpl.confirm_publication', locale)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog — Affecter un shift à des employés (menu Remplir) */}
      <Dialog open={shiftAssignOpen} onOpenChange={setShiftAssignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ color: "#0B0F2E" }}>{t('rhpl.assign_shift_employees', locale)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('rhpl.shift_to_apply', locale)}</Label>
              <Select value={shiftAssignCreneauId} onValueChange={setShiftAssignCreneauId}>
                <SelectTrigger><SelectValue placeholder={t('rhpl.choose_shift', locale)} /></SelectTrigger>
                <SelectContent>
                  {creneaux.filter(c => c.heures_effectives > 0).map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.nom} ({c.heure_debut}–{c.heure_fin})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('rhpl.employees_concerned', locale)}</Label>
              <div className="border rounded p-2 max-h-48 overflow-y-auto space-y-1 mt-1">
                {employes.map(emp => (
                  <label
                    key={emp.id}
                    className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded px-2 py-1"
                  >
                    <input
                      type="checkbox"
                      checked={shiftAssignEmployes.includes(emp.id)}
                      onChange={e => setShiftAssignEmployes(prev =>
                        e.target.checked
                          ? [...prev, emp.id]
                          : prev.filter(id => id !== emp.id),
                      )}
                    />
                    {emp.prenom} {emp.nom}
                  </label>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setShiftAssignEmployes(employes.map(e => e.id))}
                >
                  {t('rhpl.select_all', locale)}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setShiftAssignEmployes([])}
                >
                  {t('rhpl.deselect_all', locale)}
                </Button>
              </div>
            </div>

            <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-xs text-blue-900">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                {t('rhpl.assign_shift_info', locale)}
              </div>
            </div>

            <Button
              className="w-full text-white"
              style={{ backgroundColor: "#0B0F2E" }}
              onClick={applyShiftAssign}
              disabled={!shiftAssignCreneauId || shiftAssignEmployes.length === 0}
            >
              {t('rhpl.apply_to', locale)} {shiftAssignEmployes.length} {shiftAssignEmployes.length > 1 ? t('rhpl.employees_plain', locale) : t('rhpl.employee_plain', locale)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle style={{ color: "#0B0F2E" }}>{t('rhpl.multi_assign', locale)}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('rhpl.employees_label', locale)}</Label>
              <div className="border rounded p-2 max-h-40 overflow-y-auto space-y-1 mt-1">
                {employes.map(emp => (
                  <label key={emp.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={bulkEmployees.includes(emp.id)}
                      onChange={e => setBulkEmployees(prev => e.target.checked ? [...prev, emp.id] : prev.filter(id => id !== emp.id))} />
                    {emp.prenom} {emp.nom}
                  </label>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => setBulkEmployees(employes.map(e => e.id))}>{t('rhpl.select_all', locale)}</Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t('rhpl.from_day', locale)}</Label><Input type="number" min={1} max={daysInMonth} value={bulkDateFrom} onChange={e => setBulkDateFrom(+e.target.value)} /></div>
              <div><Label>{t('rhpl.to_day', locale)}</Label><Input type="number" min={1} max={daysInMonth} value={bulkDateTo} onChange={e => setBulkDateTo(+e.target.value)} /></div>
            </div>
            <div>
              <Label>{t('rhpl.slot_word', locale)}</Label>
              <Select value={bulkCreneauId} onValueChange={setBulkCreneauId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allCreneaux.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.code} — {c.nom} {c.heure_debut ? `(${c.heure_debut}-${c.heure_fin})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={bulkWeekendOff} onCheckedChange={setBulkWeekendOff} />
              <Label className="text-sm">{t('rhpl.weekend_auto_rest', locale)}</Label>
            </div>
            <Button className="w-full text-white" style={{ backgroundColor: "#0B0F2E" }} onClick={applyBulk}>{t('rhpl.apply', locale)}</Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* ── Wizard création planning ── */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ color: "#0B0F2E" }}>{t('rhpl.create_planning_btn', locale)} — {getMonthNames(locale)[month]} {year}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input type="radio" checked={wizardMode === "standard"} onChange={() => setWizardMode("standard")} />
                <div>
                  <p className="text-sm font-medium">{t('rhpl.standard_planning', locale)}</p>
                  <p className="text-xs text-gray-500">{t('rhpl.same_shift_all_days', locale)}</p>
                </div>
              </label>
              {creneaux.length >= 2 && (
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input type="radio" checked={wizardMode === "rotation"} onChange={() => { setWizardMode("rotation"); setWizardRotation(creneaux.slice(0, Math.min(3, creneaux.length)).map(c => c.id)) }} />
                  <div>
                    <p className="text-sm font-medium">{t('rhpl.auto_rotation', locale)}</p>
                    <p className="text-xs text-gray-500">{t('rhpl.alternate_prefix', locale)} {creneaux.length} {t('rhpl.shifts_per_week', locale)}</p>
                  </div>
                </label>
              )}
              <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input type="radio" checked={wizardMode === "manual"} onChange={() => setWizardMode("manual")} />
                <div>
                  <p className="text-sm font-medium">{t('rhpl.manual_mode', locale)}</p>
                  <p className="text-xs text-gray-500">{t('rhpl.fill_cell_by_cell', locale)}</p>
                </div>
              </label>
            </div>

            {wizardMode === "standard" && (
              <div>
                <Label>{t('rhpl.shift_to_apply', locale)}</Label>
                <Select value={wizardShift || creneaux[0]?.id || ""} onValueChange={setWizardShift}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {creneaux.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.code} — {c.nom} ({c.heure_debut}-{c.heure_fin})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {wizardMode === "rotation" && (
              <div className="space-y-2">
                <Label>{t('rhpl.shifts_rotation_order', locale)}</Label>
                {creneaux.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={wizardRotation.includes(c.id)}
                      onChange={e => {
                        if (e.target.checked) setWizardRotation(prev => [...prev, c.id])
                        else setWizardRotation(prev => prev.filter(id => id !== c.id))
                      }}
                    />
                    {c.code} — {c.nom} ({c.heure_debut}-{c.heure_fin})
                  </label>
                ))}
                {wizardRotation.length < 2 && (
                  <p className="text-xs text-amber-600">{t('rhpl.select_min_2_shifts', locale)}</p>
                )}
              </div>
            )}

            <p className="text-xs text-gray-500">
              {employes.length} {t('rhpl.wizard_footer_note', locale)}
            </p>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setWizardOpen(false)}>{t('rhpl.cancel', locale)}</Button>
              <Button
                className="flex-1 text-white"
                style={{ backgroundColor: "#0B0F2E" }}
                disabled={wizardMode === "rotation" && wizardRotation.length < 2}
                onClick={applyWizard}
              >
                {wizardMode === "manual" ? t('rhpl.start', locale) : t('rhpl.generate', locale)}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sélecteur de créneau — popover EN POSITION FIXE, ancré AU-DESSUS de
          la cellule cliquée. Rendu hors du conteneur scrollable (overflow)
          pour ne jamais être rogné : on voit toutes les options et c'est
          facile à sélectionner. */}
      {editCell && (() => {
        const r = editCell.rect
        const PW = 220 // largeur popover
        const left = r ? Math.max(8, Math.min(r.left, window.innerWidth - PW - 8)) : Math.max(8, (window.innerWidth - PW) / 2)
        // `bottom` calculé depuis le viewport → le popover s'ouvre au-dessus
        // de la cellule (son bas est à 6px au-dessus du haut de la cellule).
        const bottom = r ? Math.max(8, window.innerHeight - r.top + 6) : 80
        const empName = (allEmployes.find((e: any) => e.id === editCell.empId)
          || employes.find((e: any) => e.id === editCell.empId))
        const empLabel = empName ? `${empName.prenom} ${empName.nom}` : ""
        const dateLabel = `${editCell.day} ${getMonthNames(locale)[month]}`
        return (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setEditCell(null)} aria-hidden="true" />
            <div
              className="fixed z-[61] bg-white border rounded-lg shadow-2xl p-1.5 flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto"
              style={{ left, bottom, width: PW }}
              onClick={e => e.stopPropagation()}
              role="menu"
            >
              <div className="px-2 py-1 mb-0.5 border-b sticky top-0 bg-white">
                <div className="text-[11px] font-bold text-gray-800 truncate">{empLabel}</div>
                <div className="text-[10px] text-gray-500">{dateLabel}{holidaysByDay[editCell.day] ? ` · ${t('rhpl.holiday_short', locale)} : ${holidaysByDay[editCell.day]}` : ""}</div>
              </div>
              {allCreneaux.map(c => {
                const pendingSick = c.id === "sick" && sickPending.has(`${editCell.empId}-${editCell.day}`)
                return (
                  <button key={c.id}
                    disabled={pendingSick}
                    className={`text-left px-2 py-2 rounded text-xs hover:opacity-80 flex items-center justify-between gap-2 disabled:opacity-50 ${c.couleur}`}
                    onClick={() => assignCreneau(editCell.empId, editCell.day, c.id)}>
                    <span className="font-bold">{c.code} {c.nom}</span>
                    {c.heure_debut
                      ? <span className="text-[10px] opacity-75">{c.heure_debut}—{c.heure_fin}</span>
                      : pendingSick ? <span className="text-[10px]">…</span> : null}
                  </button>
                )
              })}
            </div>
          </>
        )
      })()}
    </div>
    </ClientPageShell>
  )
}

// ─── Créneau Editor sub-component ─────────────────────────────────

function CreneauEditor({ creneau, onSave, onDelete, onCancel }: {
  creneau: Creneau
  onSave: (c: Creneau) => void
  onDelete: (id: string) => void
  onCancel: () => void
}) {
  const locale = getLocale()
  const [c, setC] = useState<Creneau>({ ...creneau })

  const eff = computeEffective(c.heure_debut, c.heure_fin, c.pause_debut, c.pause_fin)
  const pauseMin = computeMinutes(c.pause_debut, c.pause_fin)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>{t('rhpl.name_label', locale)}</Label><Input value={c.nom} onChange={e => setC(p => ({ ...p, nom: e.target.value }))} /></div>
        <div><Label>{t('rhpl.code_label', locale)}</Label><Input value={c.code} maxLength={3} onChange={e => setC(p => ({ ...p, code: e.target.value.toUpperCase() }))} /></div>
      </div>

      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-1"><Clock className="w-4 h-4" /> {t('rhpl.work_hours', locale)}</p>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">{t('rhpl.start_field', locale)}</Label><Input type="time" value={c.heure_debut} onChange={e => setC(p => ({ ...p, heure_debut: e.target.value }))} /></div>
          <div><Label className="text-xs">{t('rhpl.end_field', locale)}</Label><Input type="time" value={c.heure_fin} onChange={e => setC(p => ({ ...p, heure_fin: e.target.value }))} /></div>
        </div>
      </div>

      <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
        <p className="text-sm font-medium text-orange-800 mb-2 flex items-center gap-1"><Coffee className="w-4 h-4" /> {t('rhpl.break_word', locale)}</p>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">{t('rhpl.break_start', locale)}</Label><Input type="time" value={c.pause_debut} onChange={e => setC(p => ({ ...p, pause_debut: e.target.value }))} /></div>
          <div><Label className="text-xs">{t('rhpl.break_end', locale)}</Label><Input type="time" value={c.pause_fin} onChange={e => setC(p => ({ ...p, pause_fin: e.target.value }))} /></div>
        </div>
        <p className="text-xs text-orange-600 mt-2">{t('rhpl.break_duration', locale)} {pauseMin} {t('rhpl.minutes_word', locale)}</p>
      </div>

      <div className="p-3 bg-green-50 rounded-lg border border-green-200">
        <p className="text-sm font-medium text-green-800">{t('rhpl.effective_hours', locale)} <span className="text-lg">{eff}h</span></p>
        <p className="text-xs text-green-600">= {t('rhpl.work_hours_calc', locale)} ({computeMinutes(c.heure_debut, c.heure_fin)} min) - {t('rhpl.break_word', locale)} ({pauseMin} min)</p>
      </div>

      <div>
        <Label>{t('rhpl.color_label', locale)}</Label>
        <div className="flex gap-2 mt-1 flex-wrap">
          {COLORS.map(color => (
            <button key={color}
              className={`w-8 h-8 rounded-lg ${color} ${c.couleur === color ? "ring-2 ring-offset-2 ring-[#0B0F2E]" : ""}`}
              onClick={() => setC(p => ({ ...p, couleur: color }))} />
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button className="flex-1 text-white" style={{ backgroundColor: "#0B0F2E" }} onClick={() => onSave({ ...c, pause_minutes: pauseMin, heures_effectives: eff })}>
          {t('rhpl.save_word', locale)}
        </Button>
        <Button variant="outline" onClick={onCancel}>{t('rhpl.cancel', locale)}</Button>
        <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => onDelete(c.id)}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
