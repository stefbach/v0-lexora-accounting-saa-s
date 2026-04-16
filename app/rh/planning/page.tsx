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
import { Loader2, Calendar, ChevronLeft, ChevronRight, Send, Wand2, Users, Check, Plus, Trash2, Clock, Coffee, AlertTriangle, FileDown, Copy, Eye, Shield, CheckCircle2, XCircle } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { toast } from "sonner"
import Link from "next/link"

// ─── Types ──────────────────────────────────────────────────────────

interface Creneau {
  id: string
  nom: string
  code: string
  heure_debut: string
  heure_fin: string
  pause_debut: string
  pause_fin: string
  pause_minutes: number
  heures_effectives: number
  couleur: string
}

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

const MONTH_NAMES = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
const DAY_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]

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

const DEFAULT_CRENEAUX: Creneau[] = [
  { id: "c1", nom: "Journée", code: "J", heure_debut: "08:00", heure_fin: "17:00", pause_debut: "12:00", pause_fin: "13:00", pause_minutes: 60, heures_effectives: 8, couleur: COLORS[0] },
  { id: "c2", nom: "Matin", code: "M", heure_debut: "06:00", heure_fin: "14:00", pause_debut: "10:00", pause_fin: "10:30", pause_minutes: 30, heures_effectives: 7.5, couleur: COLORS[2] },
  { id: "c3", nom: "Après-midi", code: "AM", heure_debut: "14:00", heure_fin: "22:00", pause_debut: "18:00", pause_fin: "18:30", pause_minutes: 30, heures_effectives: 7.5, couleur: COLORS[3] },
  { id: "c4", nom: "Nuit", code: "N", heure_debut: "22:00", heure_fin: "06:00", pause_debut: "02:00", pause_fin: "02:30", pause_minutes: 30, heures_effectives: 7.5, couleur: COLORS[4] },
]

// ─── Component ──────────────────────────────────────────────────────

export default function PlanningPage() {
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

  // Load creneaux from localStorage when société changes
  useEffect(() => {
    if (typeof window === "undefined") return
    const key = `lexora_creneaux_${societe || "default"}`
    try {
      const stored = localStorage.getItem(key)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCreneaux(parsed)
          return
        }
      }
    } catch {}
    setCreneaux(DEFAULT_CRENEAUX)
  }, [societe])

  // Save creneaux to localStorage whenever they change
  const persistCreneaux = useCallback((next: Creneau[]) => {
    if (typeof window === "undefined") return
    const key = `lexora_creneaux_${societe || "default"}`
    try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
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

  // Cell edit
  const [editCell, setEditCell] = useState<{ empId: string; day: number } | null>(null)

  // Bulk assign
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkEmployees, setBulkEmployees] = useState<string[]>([])
  const [bulkDateFrom, setBulkDateFrom] = useState(1)
  const [bulkDateTo, setBulkDateTo] = useState(1)
  const [bulkCreneauId, setBulkCreneauId] = useState("c1")
  const [bulkWeekendOff, setBulkWeekendOff] = useState(true)

  const daysInMonth = getDaysInMonth(year, month)
  const periode = `${year}-${String(month + 1).padStart(2, "0")}`

  const getCreneauById = (id: string): Creneau => {
    // Match by id, nom, or code (API returns shift name, not creneau id)
    return creneaux.find(c => c.id === id || c.nom === id || c.code === id) || REPOS_CRENEAU
  }
  const allCreneaux = [...creneaux, REPOS_CRENEAU, CONGE_CRENEAU]

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
              detail: `Planifié le ${day}/${month + 1} alors qu'un congé est approuvé`,
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
              ? `Semaine du ${d}/${month + 1}: ${hours}h — OT légal (dépasse ${weeklyLimit}h mais ≤${WEEKLY_OT_LIMIT}h max WRA)`
              : `Semaine du ${d}/${month + 1}: ${hours}h > ${WEEKLY_OT_LIMIT}h max WRA (dépassement illégal)`,
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
      try { return JSON.parse(stored) } catch {}
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
                empName: name, empId: emp.id, rule: "Heures semaine (OT)",
                detail: `Semaine du ${d}: ${hours}h — OT légal (dépasse ${maxWeeklyH}h mais ≤${WEEKLY_OT_LIMIT}h max WRA)`,
              })
            } else {
              violations.push({
                severity: "red",
                empName: name, empId: emp.id, rule: "Heures semaine",
                detail: `Semaine du ${d}: ${hours}h > ${WEEKLY_OT_LIMIT}h max WRA (dépassement illégal, Art.14)`,
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
            violations.push({ severity: "red", empName: name, empId: emp.id, rule: "Heures jour", detail: `Jour ${d}: ${cell.heures_prevues}h / ${maxDailyH}h max` })
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
              violations.push({ severity: "red", empName: name, empId: emp.id, rule: "Jours consecutifs", detail: `${consecutive} jours consecutifs au jour ${d} (max ${maxConsec})` })
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
            violations.push({ severity: "red", empName: name, empId: emp.id, rule: "Repos hebdomadaire", detail: `Semaine du ${d}: ${restDays} jour(s) de repos (min ${reposMin})` })
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
              violations.push({ severity: "orange", empName: name, empId: emp.id, rule: "Travail de nuit", detail: `Jour ${d}: creneau ${cell.heure_debut}-${cell.heure_fin} (nuit ${nuitDebut}-${nuitFin})` })
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
              violations.push({ severity: "orange", empName: name, empId: emp.id, rule: "Pause minimum", detail: `Jour ${d}: pause ${pauseDuration}min (min ${pauseMin}min pour 6h+)` })
            }
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
          violations.push({ severity: "orange", empName: "Equipe", empId: "", rule: "Absences equipe", detail: `Jour ${d}: ${pct}% absents (max ${maxAbsentPct}%)` })
        }
      }
    }

    setValidationResults(violations)
    setShowValidation(true)
    if (violations.length === 0) {
      toast.success("Planning conforme - aucune violation detectee")
    } else {
      toast.warning(`${violations.length} violation(s) detectee(s)`)
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
    toast.success("Planning type appliqué aux semaines restantes du mois")
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
    } catch {}
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
      const [planRes, empRes, grpRes, leaveRes] = await Promise.all([
        fetch(`/api/rh/planning?${params}`).then(r => r.json()).catch(() => ({ planning: [] })),
        fetch(`/api/rh/employes?${societe !== "all" ? `societe_id=${societe}` : ""}`).then(r => r.json()).catch(() => ({ employes: [] })),
        fetch(`/api/rh/groupes?${societe !== "all" ? `societe_id=${societe}` : ""}`).then(r => r.json()).catch(() => ({ groupes: [] })),
        fetch(`/api/rh/conges?${params}&statut=approuve`).then(r => r.json()).catch(() => ({ conges: [] })),
      ])
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

  // ─── Actions ────────────────────────────────────────────────────

  const assignCreneau = (empId: string, day: number, creneauId: string) => {
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
    const c = creneaux[0] // Premier créneau = journée standard
    setPlanning(prev => {
      const next = { ...prev }
      for (const empId of Object.keys(next)) {
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
        toast.error("Erreur sauvegarde: " + (data.error || res.statusText))
        return
      }
      if (publish) setPublished(true)
      toast.success(publish ? "Planning publié !" : "Planning sauvegardé")
    } catch (e: any) {
      toast.error("Erreur réseau: " + (e.message || "Impossible de sauvegarder"))
      console.error(e)
    }
    finally { setSaving(false) }
  }

  // ─── Créneau CRUD ────────────────────────────────────────────────

  const addCreneau = () => {
    const id = `c${Date.now()}`
    const newC: Creneau = {
      id, nom: "Nouveau créneau", code: "X",
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
          <h1 className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>Planning</h1>
          <p className="text-gray-500 text-sm">
            Créneaux personnalisables avec pauses ·{' '}
            <span className="text-gray-600">
              Limite hebdomadaire : <b>{weeklyLimit}h</b>
              {weeklyLimit === WEEKLY_HOURS_LIMIT_DEFAULT ? ' (WRA 2019 défaut)' : ' (règle société)'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Société" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
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
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Groupe" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les groupes</SelectItem>
                {groupes.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.nom} ({g.nb_membres})</SelectItem>)}
                <SelectItem value="sans_groupe">Sans groupe</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => setEmpFilterOpen(true)}>
            <Users className="h-4 w-4 mr-1" /> Collaborateurs ({employes.length}/{allEmployes.length})
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setEditingCreneau(null); setCreneauConfigOpen(true) }}>
            <Clock className="h-4 w-4 mr-1" /> Créneaux
          </Button>
        </div>
      </div>

      {/* Créneaux summary */}
      <Card className="border-dashed">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-2">
            {creneaux.map(c => (
              <div key={c.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${c.couleur}`}>
                <span className="font-bold">{c.code}</span>
                <span>{c.nom}</span>
                <span className="opacity-75">{c.heure_debut}—{c.heure_fin}</span>
                {c.pause_minutes > 0 && <span className="opacity-75 flex items-center gap-0.5"><Coffee className="w-3 h-3" />{c.pause_minutes}min</span>}
                <span className="opacity-75">({c.heures_effectives}h eff.)</span>
              </div>
            ))}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-200 text-gray-600">
              <span className="font-bold">R</span> Repos
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-100 text-emerald-700">
              <span className="font-bold">C</span> Congé
            </div>
          </div>
        </CardContent>
      </Card>

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
                <><span className="font-bold">{errors.length} erreur{errors.length > 1 ? "s" : ""}</span> (bloquant)</>
              )}
              {errors.length > 0 && warnings.length > 0 && <span> — </span>}
              {warnings.length > 0 && (
                <>{warnings.length} avertissement{warnings.length > 1 ? "s" : ""} (OT légal)</>
              )}
            </span>
            <button
              className={`text-sm font-medium underline ${hasErrors ? "text-red-700 hover:text-red-900" : "text-yellow-700 hover:text-yellow-900"}`}
              onClick={() => setShowConflicts(!showConflicts)}
            >
              {showConflicts ? "Masquer" : "Voir détails"}
            </button>
          </div>
          {warnings.length > 0 && !hasErrors && (
            <p className="text-xs text-yellow-700 italic">
              Ces heures dépassent {weeklyLimit}h mais restent dans la limite légale OT
              ({WEEKLY_OT_LIMIT}h max WRA 2019). À payer en heures supplémentaires.
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
                    {c.type === "leave" ? "Congé" : c.severity === "warning" ? "OT" : "Heures"}
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
                    <span className="text-green-800">Planning conforme WRA 2019</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-600" />
                    <span className="text-red-800">
                      {validationResults.length} violation{validationResults.length > 1 ? "s" : ""} trouvee{validationResults.length > 1 ? "s" : ""} sur {new Set(validationResults.filter(v => v.empId).map(v => v.empId)).size} employe(s)
                    </span>
                  </>
                )}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowValidation(false)} className="text-xs">
                Fermer
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
                      {v.severity === "red" ? "WRA" : "Alerte"}
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
                <Calendar className="inline h-5 w-5 mr-2" />{MONTH_NAMES[month]} {year}
              </CardTitle>
              <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {published
                ? <Badge className="bg-green-100 text-green-700">Publié</Badge>
                : <Badge className="bg-amber-100 text-amber-700">Brouillon</Badge>}
              {/* View toggle */}
              <div className="inline-flex rounded-lg border overflow-hidden">
                <button
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "monthly" ? "text-white" : "text-gray-600 hover:bg-gray-50"}`}
                  style={viewMode === "monthly" ? { backgroundColor: "#0B0F2E" } : {}}
                  onClick={() => setViewMode("monthly")}
                >
                  <Calendar className="inline h-3.5 w-3.5 mr-1" />Mensuel
                </button>
                <button
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "weekly" ? "text-white" : "text-gray-600 hover:bg-gray-50"}`}
                  style={viewMode === "weekly" ? { backgroundColor: "#0B0F2E" } : {}}
                  onClick={() => { setViewMode("weekly"); setWeekOffset(0) }}
                >
                  <Eye className="inline h-3.5 w-3.5 mr-1" />Hebdomadaire
                </button>
              </div>
              <Button variant="outline" size="sm" onClick={generateStandard}><Wand2 className="h-4 w-4 mr-1" /> Standard</Button>
              <Button variant="outline" size="sm" onClick={generate3x8}>3×8</Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmGenOpen(true)} style={{ borderColor: "#D4AF37", color: "#D4AF37" }}>
                <Copy className="h-4 w-4 mr-1" /> Générer planning type
              </Button>
              <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}><Users className="h-4 w-4 mr-1" /> Masse</Button>
              <Button variant="outline" size="sm" onClick={() => toast.info("Export PDF bientôt disponible")} style={{ borderColor: "#4191FF", color: "#4191FF" }}>
                <FileDown className="h-4 w-4 mr-1" /> Exporter PDF
              </Button>
              <Button variant="outline" size="sm" onClick={runValidation} style={{ borderColor: "#0B0F2E", color: "#0B0F2E" }}>
                <Shield className="h-4 w-4 mr-1" /> Verifier conformite
              </Button>
              <Link href="/rh/planning/regles">
                <Button variant="outline" size="sm" className="text-gray-600">
                  <Shield className="h-4 w-4 mr-1" /> Regles
                </Button>
              </Link>
              {/* Sprint 7 FIX 5 — Sauver vs Publier clairement distincts.
                  Sauver : style outline (secondaire), enregistre en brouillon,
                  visible uniquement RH. Publier : style solid vert (primaire),
                  rend le planning visible par tous les employés — confirmation
                  obligatoire via Dialog pour éviter publication accidentelle. */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => savePlanning(false)}
                disabled={saving}
                title="Enregistrer en brouillon — visible uniquement par vous (RH). Les employés ne voient rien tant que vous n'avez pas publié."
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                Sauver brouillon
              </Button>
              <Button
                size="sm"
                onClick={() => setConfirmPublishOpen(true)}
                disabled={saving}
                className="text-white hover:opacity-90 bg-emerald-600 hover:bg-emerald-700"
                title="Publier le planning — les employés pourront le consulter sur leur espace (/salarie). Nécessite confirmation."
              >
                <Send className="h-4 w-4 mr-1" />
                Publier aux employés
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
          ) : employes.length === 0 ? (
            // Sprint 5 BUG B — message plus précis selon l'état de société.
            // Avant : "Aucun employé. Sélectionnez une société." même quand
            // une société était déjà sélectionnée, ce qui masquait les
            // plannings brouillon existants.
            <div className="text-center py-12 space-y-2">
              <p className="text-gray-400">
                {societe === "all"
                  ? "Sélectionnez une société pour afficher son planning."
                  : allEmployes.length === 0
                    ? "Cette société n'a aucun employé actif. Ajoutez un employé dans /rh/employes pour commencer."
                    : "Aucun employé sélectionné — cochez-les via le bouton « Filtrer employés »."}
              </p>
              {allEmployes.length > 0 && societe !== "all" && (
                <p className="text-xs text-gray-400">
                  {allEmployes.length} employé(s) disponible(s) pour cette société.
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
                    <th className="sticky left-0 bg-white z-10 border px-2 py-1 text-left min-w-[140px]" style={{ color: "#0B0F2E" }}>Employé</th>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                      const dow = new Date(year, month, d).getDay()
                      return (
                        <th key={d} className={`border px-0 py-1 text-center min-w-[38px] ${dow === 0 || dow === 6 ? "bg-gray-100" : ""}`}>
                          <div className="text-[9px] text-gray-400">{DAY_NAMES[dow]}</div>
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
                          AL: { couleur: "bg-blue-200 text-blue-800", code: "AL", nom: "Local Leave" },
                          SL: { couleur: "bg-orange-200 text-orange-800", code: "SL", nom: "Sick Leave" },
                          MAT: { couleur: "bg-purple-200 text-purple-800", code: "MAT", nom: "Maternité" },
                          PAT: { couleur: "bg-indigo-200 text-indigo-800", code: "PAT", nom: "Paternité" },
                          SANS_SOLDE: { couleur: "bg-gray-300 text-gray-700", code: "SS", nom: "Sans solde" },
                        }
                        const lt = leaveType || "AL"
                        const creneau = isLeave
                          ? { ...CONGE_CRENEAU, couleur: leaveMonthColors[lt]?.couleur || CONGE_CRENEAU.couleur, code: leaveMonthColors[lt]?.code || "C", nom: leaveMonthColors[lt]?.nom || "Congé" }
                          : cell ? getCreneauById(cell.creneau_id) : REPOS_CRENEAU
                        const isEditing = editCell?.empId === emp.id && editCell?.day === d
                        const hasConflict = cellHasConflict(emp.id, d)
                        return (
                          <td key={d}
                            className={`border p-0 text-center cursor-pointer relative ${hasConflict ? "ring-2 ring-inset ring-red-500" : ""}`}
                            onClick={() => setEditCell(isEditing ? null : { empId: emp.id, day: d })}
                            title={hasConflict ? `CONFLIT: Congé approuvé ce jour\n${cell ? `${creneau.nom} ${cell.heure_debut}—${cell.heure_fin}` : "Repos"}` : cell ? `${creneau.nom}\n${cell.heure_debut}—${cell.heure_fin}\nPause: ${cell.pause_debut || "—"}—${cell.pause_fin || "—"}\n${cell.heures_prevues}h eff.` : "Repos"}
                          >
                            <div className={`w-full py-0.5 leading-tight ${hasConflict ? "bg-red-100 text-red-700" : creneau.couleur}`}>
                              <div className="text-[10px] font-bold">{creneau.code}</div>
                              {cell && cell.heure_debut && <div className="text-[7px] opacity-80">{cell.heure_debut?.slice(0,5)}</div>}
                            </div>
                            {isEditing && (
                              <div className="absolute top-full left-0 z-30 bg-white border rounded-lg shadow-xl p-1 flex flex-col gap-0.5 min-w-[160px]" onClick={e => e.stopPropagation()}>
                                {allCreneaux.map(c => (
                                  <button key={c.id}
                                    className={`text-left px-2 py-1.5 rounded text-xs hover:opacity-80 flex items-center justify-between gap-2 ${c.couleur}`}
                                    onClick={() => assignCreneau(emp.id, d, c.id)}>
                                    <span className="font-bold">{c.code} {c.nom}</span>
                                    {c.heure_debut && <span className="text-[10px] opacity-75">{c.heure_debut}—{c.heure_fin}</span>}
                                  </button>
                                ))}
                              </div>
                            )}
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
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-blue-200 border border-blue-300" /><span className="text-xs text-gray-600 font-medium">AL - Local Leave</span></div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-orange-200 border border-orange-300" /><span className="text-xs text-gray-600 font-medium">SL - Sick Leave</span></div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-purple-200 border border-purple-300" /><span className="text-xs text-gray-600 font-medium">MAT - Maternité</span></div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-indigo-200 border border-indigo-300" /><span className="text-xs text-gray-600 font-medium">PAT - Paternité</span></div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-gray-200 border border-gray-300" /><span className="text-xs text-gray-600 font-medium">R - Repos</span></div>
            </div>
            </>
          ) : (
            /* ── Weekly View ── */
            <div className="space-y-3">
              {/* Week navigation */}
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" disabled={weekOffset <= 0} onClick={() => setWeekOffset(w => w - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Semaine préc.
                </Button>
                <span className="text-sm font-medium" style={{ color: "#0B0F2E" }}>
                  Semaine du {currentWeek?.start} au {currentWeek?.end} {MONTH_NAMES[month]}
                </span>
                <Button variant="outline" size="sm" disabled={weekOffset >= weeks.length - 1} onClick={() => setWeekOffset(w => w + 1)}>
                  Semaine suiv. <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
              {/* Weekly grid */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-white z-10 border px-3 py-2 text-left min-w-[180px]" style={{ color: "#0B0F2E" }}>Employé</th>
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
                      <th className="border px-2 py-2 text-center min-w-[80px] bg-gray-50" style={{ color: "#0B0F2E" }}>Total</th>
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
                              AL: { bg: "bg-blue-200 text-blue-800 font-bold", label: "Local Leave" },
                              SL: { bg: "bg-orange-200 text-orange-800 font-bold", label: "Sick Leave" },
                              MAT: { bg: "bg-purple-200 text-purple-800 font-bold", label: "Maternité" },
                              PAT: { bg: "bg-indigo-200 text-indigo-800 font-bold", label: "Paternité" },
                              SANS_SOLDE: { bg: "bg-gray-300 text-gray-700 font-bold", label: "Sans solde" },
                            }

                            let bgColor = "bg-gray-100 text-gray-500" // Repos
                            let label = "Repos"
                            // Always check approvedLeaves first (source of truth)
                            if (isLeaveDay) {
                              const lc = leaveColors[leaveType] || { bg: "bg-emerald-200 text-emerald-800 font-bold", label: "Congé" }
                              bgColor = lc.bg
                              label = lc.label
                            } else if (cell) {
                              const isCongeCell = cell.creneau_id === "conge" || cell.creneau_id?.startsWith("conge_")
                              if (isCongeCell) {
                                const cellType = cell.creneau_id?.startsWith("conge_") ? cell.creneau_id.replace("conge_", "") : "AL"
                                const lc = leaveColors[cellType] || { bg: "bg-emerald-200 text-emerald-800 font-bold", label: "Congé" }
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

                            return (
                              <td key={i}
                                className={`border p-0 text-center cursor-pointer relative ${hasConflict ? "ring-2 ring-inset ring-red-500" : ""}`}
                                onClick={() => setEditCell(isEditing ? null : { empId: emp.id, day })}
                                title={hasConflict ? "CONFLIT: Congé approuvé ce jour" : label}
                              >
                                <div className={`px-2 py-2.5 rounded-sm ${bgColor}`}>
                                  <div className="text-xs font-semibold">{label}</div>
                                  {cell && cell.creneau_id !== "conge" && !cell.creneau_id?.startsWith("conge_") && (
                                    <div className="text-[10px] opacity-70 mt-0.5">
                                      {getCreneauById(cell.creneau_id).nom} ({cell.heures_prevues}h)
                                    </div>
                                  )}
                                  {hasConflict && <AlertTriangle className="inline h-3 w-3 text-red-500 mt-0.5" />}
                                </div>
                                {isEditing && (
                                  <div className="absolute top-full left-0 z-30 bg-white border rounded-lg shadow-xl p-1 flex flex-col gap-0.5 min-w-[160px]" onClick={e => e.stopPropagation()}>
                                    {allCreneaux.map(c => (
                                      <button key={c.id}
                                        className={`text-left px-2 py-1.5 rounded text-xs hover:opacity-80 flex items-center justify-between gap-2 ${c.couleur}`}
                                        onClick={() => assignCreneau(emp.id, day, c.id)}>
                                        <span className="font-bold">{c.code} {c.nom}</span>
                                        {c.heure_debut && <span className="text-[10px] opacity-75">{c.heure_debut}—{c.heure_fin}</span>}
                                      </button>
                                    ))}
                                  </div>
                                )}
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
                                ? `Dépassement ILLÉGAL : ${weekHours}h > ${WEEKLY_OT_LIMIT}h max WRA`
                                : hoursOverLimit
                                  ? `OT légal : ${weekHours}h (base ${weeklyLimit}h + ${weekHours - weeklyLimit}h OT ≤ ${WEEKLY_OT_LIMIT}h max WRA)`
                                  : `${weekHours}h cette semaine`
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
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: "#4191FF" }} /> Travail</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-gray-300" /> Repos</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-emerald-400" /> Congé</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-400" /> Conflit</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Employee filter dialog ── */}
      <Dialog open={empFilterOpen} onOpenChange={setEmpFilterOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: "#0B0F2E" }}>Collaborateurs dans le planning</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Rechercher un collaborateur..." value={empSearch} onChange={e => setEmpSearch(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIncludedEmpIds(new Set(allEmployes.map(e => e.id)))}>
                Tout sélectionner
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIncludedEmpIds(new Set())}>
                Tout désélectionner
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
                      <Badge className="bg-green-100 text-green-700 text-[10px]">Inclus</Badge>
                    )}
                  </label>
                ))}
            </div>
            <p className="text-xs text-gray-500">{includedEmpIds.size} collaborateur(s) sélectionné(s) sur {allEmployes.length}</p>
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
              Appliquer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Créneau config dialog ── */}
      <Dialog open={creneauConfigOpen} onOpenChange={setCreneauConfigOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: "#0B0F2E" }}>Créneaux horaires</DialogTitle>
          </DialogHeader>
          {!editingCreneau ? (
            <div className="space-y-3">
              {creneaux.map(c => (
                <div key={c.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50">
                  <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-sm font-bold ${c.couleur}`}>{c.code}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{c.nom}</p>
                    <p className="text-xs text-gray-500">{c.heure_debut} — {c.heure_fin} | Pause: {c.pause_debut || "—"} — {c.pause_fin || "—"} ({c.pause_minutes}min) | {c.heures_effectives}h eff.</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setEditingCreneau(c)}>Modifier</Button>
                </div>
              ))}
              <Button variant="outline" className="w-full" onClick={addCreneau}><Plus className="h-4 w-4 mr-1" /> Ajouter un créneau</Button>
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
            <DialogTitle style={{ color: "#0B0F2E" }}>Générer planning type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Cette action va copier le planning de la semaine actuelle
              {currentWeek ? ` (jours ${currentWeek.start}–${currentWeek.end})` : ""} vers toutes les
              semaines restantes du mois de {MONTH_NAMES[month]}.
            </p>
            <p className="text-sm text-yellow-700 bg-yellow-50 px-3 py-2 rounded-lg border border-yellow-200">
              <AlertTriangle className="inline h-4 w-4 mr-1" />
              Les données existantes des autres semaines seront écrasées.
            </p>
            <div className="flex gap-2">
              <Button className="flex-1 text-white" style={{ backgroundColor: "#D4AF37" }} onClick={generateFromCurrentWeek}>
                <Copy className="h-4 w-4 mr-1" /> Confirmer
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setConfirmGenOpen(false)}>Annuler</Button>
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
              Publier ce planning ?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-gray-700">
              En publiant ce planning, <strong>tous les employés concernés</strong> pourront
              le consulter sur leur espace personnel (<code className="bg-gray-100 px-1 rounded text-xs">/salarie</code>).
            </p>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
              <p className="font-medium mb-1">⚠️ Avant de publier, vérifiez :</p>
              <ul className="space-y-1 ml-4 list-disc">
                <li>Toutes les affectations sont correctes</li>
                <li>Les règles WRA (45h/semaine, repos) sont respectées</li>
                <li>Aucun conflit avec les congés approuvés</li>
              </ul>
            </div>
            <p className="text-xs text-gray-500">
              Vous pourrez toujours republier après modification.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button
              variant="outline"
              onClick={() => setConfirmPublishOpen(false)}
              disabled={saving}
            >
              Annuler
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
              Confirmer la publication
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle style={{ color: "#0B0F2E" }}>Affectation en masse</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employés</Label>
              <div className="border rounded p-2 max-h-40 overflow-y-auto space-y-1 mt-1">
                {employes.map(emp => (
                  <label key={emp.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={bulkEmployees.includes(emp.id)}
                      onChange={e => setBulkEmployees(prev => e.target.checked ? [...prev, emp.id] : prev.filter(id => id !== emp.id))} />
                    {emp.prenom} {emp.nom}
                  </label>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => setBulkEmployees(employes.map(e => e.id))}>Tout sélectionner</Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Du jour</Label><Input type="number" min={1} max={daysInMonth} value={bulkDateFrom} onChange={e => setBulkDateFrom(+e.target.value)} /></div>
              <div><Label>Au jour</Label><Input type="number" min={1} max={daysInMonth} value={bulkDateTo} onChange={e => setBulkDateTo(+e.target.value)} /></div>
            </div>
            <div>
              <Label>Créneau</Label>
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
              <Label className="text-sm">Week-end = Repos automatique</Label>
            </div>
            <Button className="w-full text-white" style={{ backgroundColor: "#0B0F2E" }} onClick={applyBulk}>Appliquer</Button>
          </div>
        </DialogContent>
      </Dialog>
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
  const [c, setC] = useState<Creneau>({ ...creneau })

  const eff = computeEffective(c.heure_debut, c.heure_fin, c.pause_debut, c.pause_fin)
  const pauseMin = computeMinutes(c.pause_debut, c.pause_fin)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Nom</Label><Input value={c.nom} onChange={e => setC(p => ({ ...p, nom: e.target.value }))} /></div>
        <div><Label>Code (1-3 car.)</Label><Input value={c.code} maxLength={3} onChange={e => setC(p => ({ ...p, code: e.target.value.toUpperCase() }))} /></div>
      </div>

      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-1"><Clock className="w-4 h-4" /> Horaires de travail</p>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Début</Label><Input type="time" value={c.heure_debut} onChange={e => setC(p => ({ ...p, heure_debut: e.target.value }))} /></div>
          <div><Label className="text-xs">Fin</Label><Input type="time" value={c.heure_fin} onChange={e => setC(p => ({ ...p, heure_fin: e.target.value }))} /></div>
        </div>
      </div>

      <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
        <p className="text-sm font-medium text-orange-800 mb-2 flex items-center gap-1"><Coffee className="w-4 h-4" /> Pause</p>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Début pause</Label><Input type="time" value={c.pause_debut} onChange={e => setC(p => ({ ...p, pause_debut: e.target.value }))} /></div>
          <div><Label className="text-xs">Fin pause</Label><Input type="time" value={c.pause_fin} onChange={e => setC(p => ({ ...p, pause_fin: e.target.value }))} /></div>
        </div>
        <p className="text-xs text-orange-600 mt-2">Durée pause : {pauseMin} minutes</p>
      </div>

      <div className="p-3 bg-green-50 rounded-lg border border-green-200">
        <p className="text-sm font-medium text-green-800">Heures effectives : <span className="text-lg">{eff}h</span></p>
        <p className="text-xs text-green-600">= Horaires travail ({computeMinutes(c.heure_debut, c.heure_fin)} min) - Pause ({pauseMin} min)</p>
      </div>

      <div>
        <Label>Couleur</Label>
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
          Enregistrer
        </Button>
        <Button variant="outline" onClick={onCancel}>Annuler</Button>
        <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => onDelete(c.id)}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
