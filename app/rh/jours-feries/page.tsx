"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Loader2, Calendar, Star, Plus, Trash2, Info, RefreshCw, Edit3,
  ChevronLeft, ChevronRight, Sun, Moon, Sparkles, Clock, MapPin
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

// ─── Colors ───
const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
const BLUE = "#4191FF"

// ─── Types ───
interface JourFerie {
  id: string
  date: string
  libelle: string
  type_jour: string
  societe_id: string | null
  annee: number | null
  travail_autorise?: boolean // Sprint 4 mig 139
  majoration_pct?: number    // Sprint 4 mig 139
}

interface HolidayDef {
  date: string
  libelle: string
  type: "fixe" | "variable" | "custom"
  // Sprint 4 TÂCHE 3 — paramètres « travail autorisé » (mig 139).
  // Nullable/optionnel car les défauts côté DB sont false/100.
  travail_autorise?: boolean
  majoration_pct?: number
}

// ─── Mauritius Public Holidays ───
// Sprint 5 FIX 3 — toutes les données jours fériés viennent EXCLUSIVEMENT de la DB
// (table jours_feries). La liste hardcodée (FIXED_HOLIDAYS, VARIABLE_HOLIDAYS_BY_YEAR)
// a été supprimée car elle créait des doublons d'affichage quand un libellé en DB
// différait légèrement du libellé hardcodé (ex. "Nouvel An" vs "Jour de l'An").
//
// Ajout / import : utiliser "Importer depuis calendrier Maurice" (Nager.Date)
// ou "Ajouter un jour férié" manuel. La base est la source de vérité unique.

const VARIABLE_SUGGESTIONS = [
  "Thaipoosam Cavadee",
  "Maha Shivaratree",
  "Fête du Printemps Chinois",
  "Ougadi",
  "Eid-Ul-Fitr",
  "Ganesh Chaturthi",
  "Divali",
  "Assomption de la Bienheureuse Vierge Marie",
]

// ─── Holiday icon helper ───
function HolidayIcon({ type, size = 16 }: { type: string; size?: number }) {
  if (type === "fixe") return <MapPin size={size} style={{ color: BLUE }} />
  if (type === "variable") return <Moon size={size} style={{ color: GOLD }} />
  return <Sparkles size={size} style={{ color: "#22c55e" }} />
}

function typeBadgeClass(type: string) {
  if (type === "fixe") return "border-blue-300 bg-blue-50 text-blue-700"
  if (type === "variable") return "border-amber-300 bg-amber-50 text-amber-700"
  return "border-green-300 bg-green-50 text-green-700"
}

function typeLabel(type: string) {
  if (type === "fixe") return "Fixe"
  if (type === "variable") return "Variable"
  return "Personnalisé"
}

// ─── Mini Calendar Component ───
function MiniCalendar({
  year,
  month,
  holidayDates,
}: {
  year: number
  month: number
  holidayDates: Map<string, { libelle: string; type: string }>
}) {
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // Monday = 0
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const monthNames = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ]

  const hasAnyHoliday = Array.from(holidayDates.keys()).some(d => {
    const dt = new Date(d + "T00:00:00")
    return dt.getFullYear() === year && dt.getMonth() === month
  })

  if (!hasAnyHoliday) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 w-full">
      <div className="text-xs font-semibold text-center mb-2" style={{ color: NAVY }}>
        {monthNames[month]} {year}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
          <div key={i} className="text-[10px] font-medium text-gray-400 py-0.5">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />
          const mm = String(month + 1).padStart(2, "0")
          const dd = String(day).padStart(2, "0")
          const dateStr = `${year}-${mm}-${dd}`
          const holiday = holidayDates.get(dateStr)
          const isToday = dateStr === todayStr
          const isPast = dateStr < todayStr

          let bg = ""
          let textColor = isPast ? "text-gray-300" : "text-gray-700"
          let ring = ""

          if (holiday) {
            if (holiday.type === "fixe") {
              bg = "bg-blue-500"
              textColor = "text-white"
            } else if (holiday.type === "variable") {
              bg = "bg-amber-400"
              textColor = "text-white"
            } else {
              bg = "bg-green-500"
              textColor = "text-white"
            }
          }
          if (isToday) {
            ring = "ring-2 ring-offset-1 ring-[#0B0F2E]"
          }

          return (
            <div
              key={dateStr}
              title={holiday ? holiday.libelle : undefined}
              className={`text-[11px] w-6 h-6 flex items-center justify-center rounded-full mx-auto cursor-default transition-colors ${bg} ${textColor} ${ring}`}
            >
              {day}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Next Upcoming Holiday Banner ───
function NextHolidayBanner({ holidays }: { holidays: HolidayDef[] }) {
  const todayStr = (() => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`
  })()

  const upcoming = holidays.filter(h => h.date >= todayStr)
  if (upcoming.length === 0) return null
  const next = upcoming[0]

  const nextDate = new Date(next.date + "T00:00:00")
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffMs = nextDate.getTime() - today.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  const dateStr = nextDate.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const borderColor = next.type === "fixe" ? BLUE : next.type === "variable" ? GOLD : "#22c55e"

  return (
    <Card
      className="overflow-hidden"
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0"
            style={{ backgroundColor: `${borderColor}15` }}
          >
            <Clock size={24} style={{ color: borderColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              Prochain jour férié
            </p>
            <p className="text-lg font-bold truncate" style={{ color: NAVY }}>
              {next.libelle}
            </p>
            <p className="text-sm text-gray-500 capitalize">{dateStr}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <div
              className="text-3xl font-black"
              style={{ color: borderColor }}
            >
              {diffDays === 0 ? (
                <span className="text-xl">Aujourd&apos;hui</span>
              ) : (
                <>J-{diffDays}</>
              )}
            </div>
            <Badge variant="outline" className={typeBadgeClass(next.type)}>
              {typeLabel(next.type)}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Holiday Card ───
function HolidayCard({
  holiday,
  isPast,
  onDelete,
  onEdit,
}: {
  holiday: HolidayDef & { id?: string }
  isPast: boolean
  onDelete?: (id: string) => void
  onEdit?: () => void
}) {
  const d = new Date(holiday.date + "T00:00:00")
  const dayNum = d.getDate()
  const monthShort = d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")
  const weekday = d.toLocaleDateString("fr-FR", { weekday: "long" })

  const borderColor =
    holiday.type === "fixe" ? BLUE : holiday.type === "variable" ? GOLD : "#22c55e"

  return (
    <div
      className={`group relative flex items-stretch rounded-xl border transition-all duration-200 overflow-hidden ${
        isPast ? "opacity-50 grayscale-[30%]" : "hover:shadow-md hover:-translate-y-0.5"
      }`}
      style={{ borderColor: isPast ? "#e5e7eb" : `${borderColor}40` }}
    >
      {/* Date pill */}
      <div
        className="flex flex-col items-center justify-center px-4 py-3 min-w-[64px]"
        style={{ backgroundColor: isPast ? "#f3f4f6" : `${borderColor}10` }}
      >
        <span className="text-2xl font-black leading-none" style={{ color: isPast ? "#9ca3af" : borderColor }}>
          {dayNum}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: isPast ? "#9ca3af" : borderColor }}>
          {monthShort}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 py-3 px-3 flex flex-col justify-center min-w-0">
        <div className="flex items-center gap-2">
          <HolidayIcon type={holiday.type} size={14} />
          <span
            className="text-sm font-semibold truncate"
            style={{ color: isPast ? "#9ca3af" : NAVY }}
          >
            {holiday.libelle}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-gray-400 capitalize">{weekday}</span>
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 h-4 ${typeBadgeClass(holiday.type)}`}
          >
            {typeLabel(holiday.type)}
          </Badge>
          {/* Sprint 4 TÂCHE 3 — badge travail autorisé + majoration */}
          {holiday.travail_autorise && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-4 bg-emerald-50 text-emerald-700 border-emerald-200"
              title="Les employés peuvent travailler ce jour férié (WRA 2019 art. 21)"
            >
              Travail +{holiday.majoration_pct ?? 100}%
            </Badge>
          )}
        </div>
      </div>

      {/* Edit + Delete buttons for DB holidays */}
      {holiday.id && (onEdit || onDelete) && (
        <div className="flex items-center pr-2 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              className="text-gray-500 hover:text-[#0B0F2E] hover:bg-gray-100 h-7 w-7 p-0"
              title="Modifier (travail autorisé, majoration)"
            >
              <Edit3 size={14} />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(holiday.id!)}
              className="text-red-400 hover:text-red-600 hover:bg-red-50 h-7 w-7 p-0"
            >
              <Trash2 size={14} />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ─── Main Page ───
// ══════════════════════════════════════════════════════════════

export default function JoursFeriesPage() {
  const currentYear = new Date().getFullYear()
  const years = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2]
  const [activeYear, setActiveYear] = useState(currentYear.toString())
  const yearNum = parseInt(activeYear)

  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")

  // DB holidays (from API)
  const [dbHolidays, setDbHolidays] = useState<JourFerie[]>([])
  const [loading, setLoading] = useState(true)
  const [initializing, setInitializing] = useState(false)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newDate, setNewDate] = useState("")
  const [newLibelle, setNewLibelle] = useState("")
  const [newType, setNewType] = useState<"variable" | "fixe" | "custom">("custom")
  const [saving, setSaving] = useState(false)

  // Sprint 4 TÂCHE 2 — Import Nager.Date preview state
  // Jamais d'import auto — toujours afficher preview avec cases à cocher.
  const [nagerOpen, setNagerOpen] = useState(false)
  const [nagerLoading, setNagerLoading] = useState(false)
  const [nagerError, setNagerError] = useState<string | null>(null)
  type NagerItem = { date: string; libelle: string; selected: boolean; already_exists: boolean }
  const [nagerItems, setNagerItems] = useState<NagerItem[]>([])
  const [nagerImporting, setNagerImporting] = useState(false)

  // Sprint 4 TÂCHE 3 — Edit dialog (travail_autorise + majoration_pct)
  const [editingHoliday, setEditingHoliday] = useState<JourFerie | null>(null)
  const [editTravailAutorise, setEditTravailAutorise] = useState(false)
  const [editMajoration, setEditMajoration] = useState("100")
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Calendar preview month navigation
  const [calMonth, setCalMonth] = useState(new Date().getMonth())

  // Load societes
  useEffect(() => {
    fetch("/api/comptable/societes")
      .then(r => r.json())
      .then(d => setSocietes(d.societes || []))
      .catch(() => {})
  }, [])

  // Load holidays from API
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ annee: activeYear })
      if (societe !== "all") params.set("societe_id", societe)
      const res = await fetch(`/api/rh/jours-feries?${params}`)
      const data = await res.json()
      setDbHolidays(data.jours_feries || [])
    } catch {
      setDbHolidays([])
    } finally {
      setLoading(false)
    }
  }, [activeYear, societe])

  useEffect(() => { load() }, [load])

  // Sprint 5 FIX 3 — liste venant UNIQUEMENT de la DB (plus de merge
  // hardcodé/DB qui créait des doublons). Dédoublonnage défensif sur
  // (date, libelle) pour couvrir une éventuelle incohérence côté DB.
  const allHolidays = useMemo<(HolidayDef & { id?: string })[]>(() => {
    const map = new Map<string, HolidayDef & { id?: string }>()
    for (const jf of dbHolidays) {
      const dateStr = String(jf.date).slice(0, 10)
      const key = `${dateStr}|${jf.libelle}`
      if (map.has(key)) continue // doublon DB, on garde le premier
      map.set(key, {
        date: dateStr,
        libelle: jf.libelle,
        type: (jf.type_jour === "fixe" || jf.type_jour === "variable") ? jf.type_jour : "custom",
        id: jf.id,
        travail_autorise: jf.travail_autorise === true,
        majoration_pct: Number(jf.majoration_pct ?? 100),
      })
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [dbHolidays])

  // Build holiday date map for calendar
  const holidayDateMap = useMemo(() => {
    const m = new Map<string, { libelle: string; type: string }>()
    for (const h of allHolidays) {
      m.set(h.date, { libelle: h.libelle, type: h.type })
    }
    return m
  }, [allHolidays])

  const todayStr = useMemo(() => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`
  }, [])

  // Stats (tous types viennent de la DB maintenant)
  const fixedCount = allHolidays.filter(h => h.type === "fixe").length
  const variableCount = allHolidays.filter(h => h.type === "variable").length
  const customCount = allHolidays.filter(h => h.type === "custom").length

  // Init year with fixed holidays in DB
  const initAnnee = async () => {
    setInitializing(true)
    try {
      await fetch("/api/rh/jours-feries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "init_annee",
          annee: yearNum,
          societe_id: societe !== "all" ? societe : null,
        }),
      })
      await load()
    } finally {
      setInitializing(false)
    }
  }

  // Add holiday
  const handleAdd = async () => {
    if (!newDate || !newLibelle) return
    setSaving(true)
    try {
      const res = await fetch("/api/rh/jours-feries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "creer",
          date: newDate,
          libelle: newLibelle,
          type_jour: newType,
          societe_id: societe !== "all" ? societe : null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setDialogOpen(false)
        setNewDate("")
        setNewLibelle("")
        setNewType("custom")
        await load()
      }
    } finally {
      setSaving(false)
    }
  }

  // Sprint 4 TÂCHE 2 — Import Nager.Date (preview obligatoire, jamais auto).
  // API : https://date.nager.at/api/v3/PublicHolidays/{year}/MU
  // Exclut systématiquement les fêtes pascales qui ne sont PAS fériées
  // officielles à Maurice (Good Friday, Easter Monday, Easter Sunday, …).
  const EXCLUDED_NAMES_RE = /easter|good\s?friday|pâques|paques/i

  const loadFromNager = async () => {
    setNagerLoading(true)
    setNagerError(null)
    setNagerItems([])
    try {
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${yearNum}/MU`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`API Nager.Date HTTP ${res.status}`)
      const rawItems = await res.json() as Array<{ date: string; name: string; localName: string }>
      // Construire la liste existante DB (indépendamment de la société :
      // on veut éviter de créer un doublon sur un jour national déjà là).
      const existingDates = new Set((dbHolidays || []).map(h => h.date.slice(0, 10)))
      const items: NagerItem[] = rawItems
        .filter(it => !EXCLUDED_NAMES_RE.test(it.name) && !EXCLUDED_NAMES_RE.test(it.localName))
        .map(it => ({
          date: it.date,
          libelle: it.localName || it.name,
          selected: !existingDates.has(it.date), // déjà en DB → pré-décoché
          already_exists: existingDates.has(it.date),
        }))
      if (items.length === 0) {
        setNagerError('Aucun jour férié trouvé pour Maurice cette année via Nager.Date.')
      }
      setNagerItems(items)
    } catch (e: any) {
      setNagerError(`Erreur de chargement : ${e?.message || 'réseau'}. Vérifiez votre connexion ou réessayez plus tard.`)
    } finally {
      setNagerLoading(false)
    }
  }

  const toggleNagerItem = (idx: number) => {
    setNagerItems(prev => prev.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it))
  }

  const importSelectedNager = async () => {
    const selected = nagerItems.filter(it => it.selected && !it.already_exists)
    if (selected.length === 0) {
      setNagerError('Aucun jour à importer sélectionné.')
      return
    }
    setNagerImporting(true)
    setNagerError(null)
    try {
      for (const it of selected) {
        await fetch('/api/rh/jours-feries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'creer',
            date: it.date,
            libelle: it.libelle,
            type_jour: 'variable',
            societe_id: societe !== 'all' ? societe : null,
          }),
        })
      }
      setNagerOpen(false)
      setNagerItems([])
      await load()
    } catch (e: any) {
      setNagerError(`Erreur d'import : ${e?.message || 'réseau'}`)
    } finally {
      setNagerImporting(false)
    }
  }

  // Sprint 4 TÂCHE 3 — ouvrir le dialog d'édition travail_autorise/majoration
  const openEditDialog = (h: JourFerie) => {
    setEditingHoliday(h)
    setEditTravailAutorise(h.travail_autorise === true)
    setEditMajoration(String(h.majoration_pct ?? 100))
    setEditError(null)
  }

  const saveEditHoliday = async () => {
    if (!editingHoliday) return
    setEditSaving(true)
    setEditError(null)
    try {
      const res = await fetch('/api/rh/jours-feries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'modifier',
          id: editingHoliday.id,
          travail_autorise: editTravailAutorise,
          majoration_pct: Number(editMajoration) || 100,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) {
        setEditError(data.error || `Erreur ${res.status}`)
        return
      }
      setEditingHoliday(null)
      await load()
    } catch (e: any) {
      setEditError(e?.message || 'Erreur réseau')
    } finally {
      setEditSaving(false)
    }
  }

  // Delete holiday
  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce jour férié ?")) return
    await fetch("/api/rh/jours-feries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "supprimer", id }),
    })
    await load()
  }

  // Months that contain holidays for calendar preview
  const holidayMonths = useMemo(() => {
    const months = new Set<number>()
    for (const h of allHolidays) {
      const d = new Date(h.date + "T00:00:00")
      months.add(d.getMonth())
    }
    return Array.from(months).sort((a, b) => a - b)
  }, [allHolidays])

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: NAVY }}>
            <Calendar className="w-7 h-7" style={{ color: GOLD }} />
            Jours fériés
          </h1>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
            <MapPin size={12} /> Maurice (Mauritius) &mdash; Calendrier officiel
          </p>
        </div>
        <Select value={societe} onValueChange={setSociete}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Toutes les sociétés" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les sociétés</SelectItem>
            {societes.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ─── Next upcoming holiday (across all years) ─── */}
      <NextHolidayBanner holidays={allHolidays} />

      {/* ─── Year Tabs ─── */}
      <Tabs value={activeYear} onValueChange={setActiveYear}>
        <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:flex">
          {years.map(y => (
            <TabsTrigger
              key={y}
              value={y.toString()}
              className={`relative ${y === currentYear ? "font-bold" : ""}`}
            >
              {y}
              {y === currentYear && (
                <span
                  className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                  style={{ backgroundColor: GOLD }}
                />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {years.map(y => (
          <TabsContent key={y} value={y.toString()} className="mt-4 space-y-6">
            {/* ─── Stats Row ─── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border p-3 text-center" style={{ borderColor: `${BLUE}30`, backgroundColor: `${BLUE}08` }}>
                <div className="text-2xl font-black" style={{ color: BLUE }}>{fixedCount}</div>
                <div className="text-xs font-medium text-gray-500">Jours fixes</div>
              </div>
              <div className="rounded-xl border p-3 text-center" style={{ borderColor: `${GOLD}30`, backgroundColor: `${GOLD}08` }}>
                <div className="text-2xl font-black" style={{ color: GOLD }}>{variableCount}</div>
                <div className="text-xs font-medium text-gray-500">Jours variables</div>
              </div>
              <div className="rounded-xl border p-3 text-center" style={{ borderColor: "#22c55e30", backgroundColor: "#22c55e08" }}>
                <div className="text-2xl font-black" style={{ color: "#22c55e" }}>{customCount}</div>
                <div className="text-xs font-medium text-gray-500">Personnalisés</div>
              </div>
              <div className="rounded-xl border p-3 text-center bg-gray-50">
                <div className="text-2xl font-black" style={{ color: NAVY }}>{allHolidays.length}</div>
                <div className="text-xs font-medium text-gray-500">Total</div>
              </div>
            </div>

            {/* Sprint 5 FIX 3 — alerte si aucun jour férié en DB pour cette année */}
            {!loading && allHolidays.length === 0 && (
              <Alert className="border-amber-300 bg-amber-50">
                <Info className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 text-sm">
                  Aucun jour férié en base pour {y}. Importez depuis le calendrier
                  officiel Maurice (Nager.Date) ou ajoutez-les manuellement.
                </AlertDescription>
              </Alert>
            )}

            {/* ─── Actions ─── */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Sprint 4 TÂCHE 2 — Import Nager.Date. Toujours preview avant
                  import (jamais automatique). Exclut Easter/Good Friday. */}
              <Button
                variant="outline"
                onClick={() => { setNagerOpen(true); setNagerError(null); setNagerItems([]); loadFromNager() }}
                className="border-[#0B0F2E] text-[#0B0F2E]"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Importer depuis calendrier Maurice
              </Button>
              <Button
                onClick={() => {
                  setNewDate("")
                  setNewLibelle("")
                  setNewType("custom")
                  setDialogOpen(true)
                }}
                style={{ backgroundColor: GOLD, color: NAVY }}
                className="hover:opacity-90 font-semibold"
              >
                <Plus className="w-4 h-4 mr-2" />
                Ajouter un jour férié
              </Button>
              <Button
                variant="outline"
                onClick={initAnnee}
                disabled={initializing}
                className="border-[#0B0F2E]/20 text-[#0B0F2E] hover:bg-[#0B0F2E]/5"
              >
                {initializing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Synchroniser avec la base
              </Button>
            </div>

            {/* ─── Main content: Cards + Calendar ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Holiday Cards */}
              <div className="lg:col-span-2 space-y-2">
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin" style={{ color: GOLD }} />
                  </div>
                ) : allHolidays.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Aucun jour férié pour {y}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {allHolidays.map(h => (
                      <HolidayCard
                        key={`${h.date}-${h.libelle}`}
                        holiday={h}
                        isPast={h.date < todayStr}
                        onDelete={h.id ? handleDelete : undefined}
                        onEdit={h.id
                          ? () => {
                              // Retrouve la row DB complète pour alimenter le dialog
                              const dbRow = dbHolidays.find(r => r.id === h.id)
                              if (dbRow) openEditDialog(dbRow)
                            }
                          : undefined}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Calendar Preview Sidebar */}
              <div className="space-y-3">
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold" style={{ color: NAVY }}>
                        Calendrier {y}
                      </CardTitle>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => setCalMonth(m => Math.max(0, m - 1))}
                          disabled={calMonth === 0}
                        >
                          <ChevronLeft size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => setCalMonth(m => Math.min(11, m + 1))}
                          disabled={calMonth === 11}
                        >
                          <ChevronRight size={14} />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    {/* Show 3 months at a time: current month and the two closest months with holidays */}
                    {(() => {
                      const monthsToShow = [calMonth]
                      // add prev and next month
                      if (calMonth > 0) monthsToShow.unshift(calMonth - 1)
                      if (calMonth < 11) monthsToShow.push(calMonth + 1)
                      return monthsToShow.map(m => (
                        <MiniCalendar
                          key={`${y}-${m}`}
                          year={y}
                          month={m}
                          holidayDates={holidayDateMap}
                        />
                      ))
                    })()}
                  </CardContent>
                </Card>

                {/* Legend */}
                <div className="rounded-xl border border-gray-100 p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Légende</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: BLUE }} />
                      <span className="text-xs text-gray-600">Jour férié fixe</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: GOLD }} />
                      <span className="text-xs text-gray-600">Jour férié variable</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: "#22c55e" }} />
                      <span className="text-xs text-gray-600">Jour personnalisé (société)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full ring-2 ring-[#0B0F2E] ring-offset-1 flex-shrink-0" style={{ width: 12, height: 12 }} />
                      <span className="text-xs text-gray-600">Aujourd&apos;hui</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Sprint 4 TÂCHE 2 — Dialog preview import Nager.Date */}
      <Dialog open={nagerOpen} onOpenChange={setNagerOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" style={{ color: GOLD }} />
              Importer les jours fériés Maurice {yearNum}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto flex-1 pr-1">
            <p className="text-sm text-gray-600">
              Source : <a href="https://date.nager.at/" target="_blank" rel="noopener" className="underline">Nager.Date</a> — jours fériés officiels Maurice.
              Les fêtes pascales (Good Friday, Easter Monday) sont exclues automatiquement car NON fériées officielles à Maurice.
            </p>
            {nagerLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                Chargement depuis Nager.Date…
              </div>
            )}
            {nagerError && (
              <Alert className="border-red-300 bg-red-50">
                <Info className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800 text-sm">{nagerError}</AlertDescription>
              </Alert>
            )}
            {!nagerLoading && !nagerError && nagerItems.length > 0 && (
              <>
                <div className="text-xs text-gray-500 pb-1">
                  {nagerItems.filter(i => i.selected && !i.already_exists).length} à importer · {nagerItems.filter(i => i.already_exists).length} déjà en DB
                </div>
                <div className="border rounded-lg divide-y max-h-[50vh] overflow-y-auto">
                  {nagerItems.map((it, idx) => (
                    <label
                      key={`${it.date}-${it.libelle}`}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 ${it.already_exists ? 'opacity-60 bg-gray-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={it.selected}
                        disabled={it.already_exists}
                        onChange={() => toggleNagerItem(idx)}
                        className="h-4 w-4"
                      />
                      <span className="text-xs font-mono text-gray-500 shrink-0 w-24">{it.date}</span>
                      <span className="text-sm flex-1">{it.libelle}</span>
                      {it.already_exists && (
                        <Badge variant="outline" className="text-[10px]">déjà importé</Badge>
                      )}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button variant="outline" onClick={() => setNagerOpen(false)} disabled={nagerImporting}>
              Annuler
            </Button>
            <Button
              onClick={importSelectedNager}
              disabled={nagerImporting || nagerItems.filter(i => i.selected && !i.already_exists).length === 0}
              style={{ backgroundColor: GOLD, color: NAVY }}
            >
              {nagerImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Importer les sélectionnés
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sprint 4 TÂCHE 3 — Dialog édition travail_autorise + majoration_pct */}
      <Dialog open={!!editingHoliday} onOpenChange={(o) => { if (!o) setEditingHoliday(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier le jour férié</DialogTitle>
          </DialogHeader>
          {editingHoliday && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm">Date</Label>
                <p className="text-sm font-medium">{editingHoliday.date}</p>
              </div>
              <div>
                <Label className="text-sm">Libellé</Label>
                <p className="text-sm font-medium">{editingHoliday.libelle}</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editTravailAutorise}
                    onChange={(e) => setEditTravailAutorise(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium text-emerald-900">Travail autorisé ce jour</span>
                </label>
                <p className="text-xs text-emerald-800">
                  Si activé : les employés peuvent pointer ce jour. WRA 2019 art. 21 —
                  rémunération = salaire normal + majoration.
                </p>
              </div>
              {editTravailAutorise && (
                <div>
                  <Label className="text-sm">Majoration (%)</Label>
                  <Input
                    type="number"
                    value={editMajoration}
                    onChange={(e) => setEditMajoration(e.target.value)}
                    min="0"
                    max="1000"
                    step="1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    100 = +100% = double salaire (défaut WRA 2019). Ajustez si votre société applique un autre taux.
                  </p>
                </div>
              )}
              {editError && (
                <Alert className="border-red-300 bg-red-50">
                  <Info className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800 text-sm">{editError}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button variant="outline" onClick={() => setEditingHoliday(null)} disabled={editSaving}>
              Annuler
            </Button>
            <Button
              onClick={saveEditHoliday}
              disabled={editSaving}
              style={{ backgroundColor: GOLD, color: NAVY }}
            >
              {editSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Add Holiday Dialog ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: NAVY }}>
              <Plus size={18} style={{ color: GOLD }} />
              Ajouter un jour férié
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Libellé</Label>
              <Input
                placeholder="Ex: Divali, Eid-Ul-Fitr..."
                value={newLibelle}
                onChange={e => setNewLibelle(e.target.value)}
              />
              {/* Quick suggestions */}
              <div className="flex flex-wrap gap-1">
                {VARIABLE_SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setNewLibelle(s)
                      setNewType("variable")
                    }}
                    className="text-xs px-2 py-0.5 rounded-full border border-gray-200 hover:border-amber-400 hover:bg-amber-50 text-gray-600 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={newType} onValueChange={(v: any) => setNewType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixe">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BLUE }} />
                      Fixe
                    </span>
                  </SelectItem>
                  <SelectItem value="variable">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: GOLD }} />
                      Variable
                    </span>
                  </SelectItem>
                  <SelectItem value="custom">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#22c55e" }} />
                      Personnalisé (société)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={handleAdd}
                disabled={saving || !newDate || !newLibelle}
                style={{ backgroundColor: NAVY }}
                className="text-white hover:opacity-90"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Ajouter
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </ClientPageShell>
  )
}
