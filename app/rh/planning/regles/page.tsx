"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { toast } from "sonner"
import {
  ArrowLeft, Plus, Pencil, Trash2, Save, Shield, ChevronDown, Clock, Moon, Sun, Sunset,
  CalendarDays, Loader2,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import Link from "next/link"

// ─── Types ──────────────────────────────────────────────────────────

type JourCode = "lun" | "mar" | "mer" | "jeu" | "ven" | "sam" | "dim"

interface Shift {
  id: string
  code: string
  label: string
  debut: string | null      // HH:mm (null = créneau de repos)
  fin: string | null
  pause_minutes: number
  couleur: string
  flexible: boolean
  debut_min?: string
  debut_max?: string
  heures_requises?: number
  jours: JourCode[]
}

interface ReglesWRA {
  max_heures_semaine: number
  repos_entre_journees: number
  max_jours_consecutifs: number
  pause_apres_6h_minutes: number
}

interface ReglesPlanning {
  shifts: Shift[]
  jours_travailles: JourCode[]
  regles_wra: ReglesWRA
}

const JOURS: { code: JourCode; label: string; short: string }[] = [
  { code: "lun", label: "Lundi", short: "Lun" },
  { code: "mar", label: "Mardi", short: "Mar" },
  { code: "mer", label: "Mercredi", short: "Mer" },
  { code: "jeu", label: "Jeudi", short: "Jeu" },
  { code: "ven", label: "Vendredi", short: "Ven" },
  { code: "sam", label: "Samedi", short: "Sam" },
  { code: "dim", label: "Dimanche", short: "Dim" },
]

const COLORS = [
  "#4CAF50", "#4191FF", "#F97316", "#D4AF37", "#9333EA",
  "#DC2626", "#0891B2", "#64748B", "#9E9E9E",
]

const SHIFT_ICONS: Record<string, any> = {
  J: Sun,       // Journée
  M: Clock,     // Matin
  AM: Sunset,   // Après-midi
  N: Moon,      // Nuit
  R: CalendarDays, // Repos
}

const DEFAULT_WRA: ReglesWRA = {
  max_heures_semaine: 45,
  repos_entre_journees: 11,
  max_jours_consecutifs: 6,
  pause_apres_6h_minutes: 30,
}

const DEFAULT_REGLES: ReglesPlanning = {
  shifts: [],
  jours_travailles: ["lun", "mar", "mer", "jeu", "ven"],
  regles_wra: DEFAULT_WRA,
}

// ─── Parse / format regles_planning from DB ─────────────────────────

/**
 * Le JSONB `societes.regles_planning` existe sous deux formats :
 *   1. Legacy (array) — ancien écran : liste de PlanningRule[],
 *      avec parfois un dernier élément { shifts, jours_travailles } mixé.
 *   2. Nouveau (object) — { shifts, jours_travailles, regles_wra }.
 *
 * Cette fonction reconnaît les deux et retourne toujours un objet propre.
 */
function parseRegles(raw: unknown): ReglesPlanning {
  if (!raw) return { ...DEFAULT_REGLES }

  // Nouveau format
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    const shifts = Array.isArray(o.shifts) ? (o.shifts as unknown[]).map(normalizeShift).filter(Boolean) as Shift[] : []
    const jours = Array.isArray(o.jours_travailles) ? (o.jours_travailles as JourCode[]) : DEFAULT_REGLES.jours_travailles
    const wra = (o.regles_wra && typeof o.regles_wra === "object")
      ? { ...DEFAULT_WRA, ...(o.regles_wra as Partial<ReglesWRA>) }
      : extractWraFromLegacy(o as any)
    return { shifts, jours_travailles: jours, regles_wra: wra }
  }

  // Legacy array
  if (Array.isArray(raw)) {
    const shiftsEntry = raw.find((e: any) => e && typeof e === "object" && Array.isArray(e.shifts))
    const shifts: Shift[] = shiftsEntry
      ? (shiftsEntry.shifts as unknown[]).map(normalizeShift).filter(Boolean) as Shift[]
      : []
    const jours: JourCode[] = Array.isArray(shiftsEntry?.jours_travailles)
      ? shiftsEntry!.jours_travailles
      : DEFAULT_REGLES.jours_travailles
    const wra = extractWraFromLegacyArray(raw)
    return { shifts, jours_travailles: jours, regles_wra: wra }
  }

  return { ...DEFAULT_REGLES }
}

function normalizeShift(raw: unknown): Shift | null {
  if (!raw || typeof raw !== "object") return null
  const s = raw as Record<string, any>
  // Tolérance aux variantes de clés : debut/heure_debut, fin/heure_fin, label/nom
  const debut = (s.debut ?? s.heure_debut ?? null) as string | null
  const fin = (s.fin ?? s.heure_fin ?? null) as string | null
  const label = (s.label ?? s.nom ?? "Créneau") as string
  const code = (s.code ?? label.slice(0, 1).toUpperCase()) as string
  return {
    id: (s.id as string) || `s_${Math.random().toString(36).slice(2, 10)}`,
    code,
    label,
    debut: debut || null,
    fin: fin || null,
    pause_minutes: Number(s.pause_minutes) || 0,
    couleur: (s.couleur as string) || "#4191FF",
    flexible: !!s.flexible,
    debut_min: s.debut_min || undefined,
    debut_max: s.debut_max || undefined,
    heures_requises: s.heures_requises !== undefined ? Number(s.heures_requises) : undefined,
    jours: Array.isArray(s.jours) ? (s.jours as JourCode[]) : [],
  }
}

function extractWraFromLegacy(o: Record<string, any>): ReglesWRA {
  // Legacy format (nouvelle shape) peut exposer les règles à plat
  return {
    max_heures_semaine: Number(o.max_heures_semaine) || DEFAULT_WRA.max_heures_semaine,
    repos_entre_journees: Number(o.repos_entre_journees) || DEFAULT_WRA.repos_entre_journees,
    max_jours_consecutifs: Number(o.max_jours_consecutifs) || DEFAULT_WRA.max_jours_consecutifs,
    pause_apres_6h_minutes: Number(o.pause_apres_6h_minutes) || DEFAULT_WRA.pause_apres_6h_minutes,
  }
}

function extractWraFromLegacyArray(arr: any[]): ReglesWRA {
  const find = (key: string) => arr.find((e: any) => e && typeof e === "object" && e.key === key && e.enabled)
  const maxSemaine = find("max_heures_semaine")
  const maxConsecutifs = find("max_jours_consecutifs")
  const pauseMin = find("pause_minimum_minutes")
  return {
    max_heures_semaine: Number(maxSemaine?.value) || DEFAULT_WRA.max_heures_semaine,
    repos_entre_journees: DEFAULT_WRA.repos_entre_journees, // pas dans legacy
    max_jours_consecutifs: Number(maxConsecutifs?.value) || DEFAULT_WRA.max_jours_consecutifs,
    pause_apres_6h_minutes: Number(pauseMin?.value) || DEFAULT_WRA.pause_apres_6h_minutes,
  }
}

// ─── Shift Editor Dialog ─────────────────────────────────────────────

function ShiftEditor({
  open, initial, onSave, onCancel,
}: {
  open: boolean
  initial: Shift | null
  onSave: (s: Shift) => void
  onCancel: () => void
}) {
  const [s, setS] = useState<Shift>(() => initial || newShift())
  useEffect(() => { if (open) setS(initial || newShift()) }, [open, initial])

  const toggleJour = (j: JourCode) => {
    setS(prev => ({
      ...prev,
      jours: prev.jours.includes(j) ? prev.jours.filter(x => x !== j) : [...prev.jours, j],
    }))
  }

  const canSave = s.label.trim().length > 0 && s.code.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Modifier le créneau" : "Nouveau créneau"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nom du créneau</Label>
              <Input value={s.label} onChange={e => {
                const label = e.target.value
                setS(p => ({ ...p, label, code: p.code || label.slice(0, 2).toUpperCase() }))
              }} placeholder="Journée" />
            </div>
            <div>
              <Label>Code (1-3 car.)</Label>
              <Input value={s.code} maxLength={3} onChange={e => setS(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="J" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Heure de début</Label>
              <Input type="time" value={s.debut || ""} onChange={e => setS(p => ({ ...p, debut: e.target.value || null }))} />
            </div>
            <div>
              <Label>Heure de fin</Label>
              <Input type="time" value={s.fin || ""} onChange={e => setS(p => ({ ...p, fin: e.target.value || null }))} />
            </div>
          </div>

          <div>
            <Label>Pause (minutes)</Label>
            <Input
              type="number"
              min={0}
              value={s.pause_minutes}
              onChange={e => setS(p => ({ ...p, pause_minutes: Math.max(0, Number(e.target.value) || 0) }))}
            />
          </div>

          <div>
            <Label>Couleur</Label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Couleur ${color}`}
                  className={`w-9 h-9 rounded-lg border-2 transition-transform ${s.couleur === color ? "ring-2 ring-offset-2 ring-[#0B0F2E] scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setS(p => ({ ...p, couleur: color }))}
                />
              ))}
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-3 bg-slate-50">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">Horaires flexibles</Label>
                <p className="text-xs text-gray-500 mt-0.5">
                  L'employé peut commencer dans une fenêtre horaire tant qu'il fait ses heures requises
                </p>
              </div>
              <Switch checked={s.flexible} onCheckedChange={(v) => setS(p => ({ ...p, flexible: v }))} />
            </div>

            {s.flexible && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Début min</Label>
                  <Input type="time" value={s.debut_min || ""} onChange={e => setS(p => ({ ...p, debut_min: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Début max</Label>
                  <Input type="time" value={s.debut_max || ""} onChange={e => setS(p => ({ ...p, debut_max: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Heures requises</Label>
                  <Input
                    type="number"
                    step={0.5}
                    min={0}
                    value={s.heures_requises ?? ""}
                    onChange={e => setS(p => ({ ...p, heures_requises: e.target.value === "" ? undefined : Number(e.target.value) }))}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <Label>Jours appliqués</Label>
            <div className="flex flex-wrap gap-3 mt-2">
              {JOURS.map(j => (
                <label key={j.code} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={s.jours.includes(j.code)}
                    onCheckedChange={() => toggleJour(j.code)}
                  />
                  <span className="text-sm">{j.short}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Annuler</Button>
          <Button
            disabled={!canSave}
            onClick={() => onSave(s)}
            className="text-white"
            style={{ backgroundColor: "#0B0F2E" }}
          >
            <Save className="h-4 w-4 mr-1.5" /> Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function newShift(): Shift {
  return {
    id: `s_${Math.random().toString(36).slice(2, 10)}`,
    code: "",
    label: "",
    debut: "09:00",
    fin: "17:00",
    pause_minutes: 60,
    couleur: COLORS[0],
    flexible: false,
    jours: ["lun", "mar", "mer", "jeu", "ven"],
  }
}

// ─── Shift Card ──────────────────────────────────────────────────────

function ShiftCard({ shift, onEdit, onDelete }: { shift: Shift; onEdit: () => void; onDelete: () => void }) {
  const Icon = SHIFT_ICONS[shift.code] || Clock
  const joursLabel = summarizeJours(shift.jours)
  const pauseLabel = shift.pause_minutes > 0
    ? `Pause ${shift.pause_minutes >= 60 ? `${(shift.pause_minutes / 60).toFixed(shift.pause_minutes % 60 === 0 ? 0 : 1)}h` : `${shift.pause_minutes}min`}`
    : "Sans pause"
  const horaireLabel = shift.debut && shift.fin ? `${shift.debut} → ${shift.fin}` : "Hors planning"

  return (
    <div className="rounded-xl border bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="h-1.5" style={{ backgroundColor: shift.couleur }} />
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white"
            style={{ backgroundColor: shift.couleur }}
          >
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate" style={{ color: "#0B0F2E" }}>
              {shift.label}
            </h3>
            <p className="text-[11px] text-gray-500">Code : {shift.code}</p>
          </div>
        </div>
        <div className="text-sm text-gray-700">{horaireLabel} · {pauseLabel}</div>
        {shift.flexible && shift.debut_min && shift.debut_max && (
          <div className="text-xs text-blue-600 font-medium">
            Flex : {shift.debut_min}–{shift.debut_max}
            {shift.heures_requises ? ` · ${shift.heures_requises}h requises` : ""}
          </div>
        )}
        <div className="text-xs text-gray-500">{joursLabel}</div>
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" variant="outline" className="h-8" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> Modifier
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-200 hover:bg-red-50" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function summarizeJours(jours: JourCode[]): string {
  if (jours.length === 0) return "Aucun jour"
  if (jours.length === 7) return "Tous les jours"
  // Détection simple Lun-Ven / Sam-Dim
  const set = new Set(jours)
  const lunVen: JourCode[] = ["lun", "mar", "mer", "jeu", "ven"]
  const samDim: JourCode[] = ["sam", "dim"]
  if (lunVen.every(j => set.has(j)) && !set.has("sam") && !set.has("dim")) return "Lun – Ven"
  if (samDim.every(j => set.has(j)) && lunVen.every(j => !set.has(j))) return "Sam – Dim"
  return JOURS.filter(j => set.has(j.code)).map(j => j.short).join(" · ")
}

// ─── Page ────────────────────────────────────────────────────────────

export default function ReglesPage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [regles, setRegles] = useState<ReglesPlanning>(DEFAULT_REGLES)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorShift, setEditorShift] = useState<Shift | null>(null)
  const [wraOpen, setWraOpen] = useState(false)

  // Load societes
  useEffect(() => {
    Promise.all([
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
      setSocietes(unique)
      if (unique.length >= 1) setSociete(unique[0].id)
    })
  }, [])

  // Load regles quand la société change
  useEffect(() => {
    if (!societe) return
    setLoading(true)
    fetch(`/api/rh/planning/regles?societe_id=${societe}`)
      .then(r => r.json())
      .then(d => {
        setRegles(parseRegles(d?.regles))
      })
      .catch(() => setRegles({ ...DEFAULT_REGLES }))
      .finally(() => setLoading(false))
  }, [societe])

  const save = async () => {
    if (!societe) return
    setSaving(true)
    try {
      const res = await fetch("/api/rh/planning/regles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societe, regles }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error("Erreur sauvegarde : " + (data?.error || `HTTP ${res.status}`))
        return
      }
      toast.success("✅ Règles de planning enregistrées")
    } catch (e: any) {
      toast.error("Erreur réseau : " + (e?.message || ""))
    } finally {
      setSaving(false)
    }
  }

  const openEditor = (shift: Shift | null) => {
    setEditorShift(shift)
    setEditorOpen(true)
  }
  const saveShift = (next: Shift) => {
    setRegles(r => {
      const idx = r.shifts.findIndex(s => s.id === next.id)
      const shifts = idx >= 0
        ? r.shifts.map(s => (s.id === next.id ? next : s))
        : [...r.shifts, next]
      return { ...r, shifts }
    })
    setEditorOpen(false)
    setEditorShift(null)
  }
  const deleteShift = (id: string) => {
    if (!window.confirm("Supprimer ce créneau ?")) return
    setRegles(r => ({ ...r, shifts: r.shifts.filter(s => s.id !== id) }))
  }

  const toggleJourTravail = (j: JourCode) => {
    setRegles(r => ({
      ...r,
      jours_travailles: r.jours_travailles.includes(j)
        ? r.jours_travailles.filter(x => x !== j)
        : [...r.jours_travailles, j],
    }))
  }

  const updateWra = (field: keyof ReglesWRA, val: number) => {
    setRegles(r => ({ ...r, regles_wra: { ...r.regles_wra, [field]: val } }))
  }

  const shifts = regles.shifts

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#0B0F2E" }}>
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>Règles de planning</h1>
              <p className="text-gray-500 text-sm">Créneaux et paramètres horaires par société</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/rh/planning">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" /> Retour au planning
              </Button>
            </Link>
            <Select value={societe} onValueChange={setSociete}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Société" /></SelectTrigger>
              <SelectContent>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* SECTION 1 — Mes créneaux */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle style={{ color: "#0B0F2E" }}>Mes créneaux</CardTitle>
                  <Button
                    size="sm"
                    onClick={() => openEditor(null)}
                    className="text-white"
                    style={{ backgroundColor: "#D4AF37" }}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Ajouter un créneau
                  </Button>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Configure les types de poste (shifts) disponibles pour le planning.
                </p>
              </CardHeader>
              <CardContent>
                {shifts.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 text-sm">
                    Aucun créneau configuré. Cliquez sur "Ajouter un créneau" pour commencer.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {shifts.map(shift => (
                      <ShiftCard
                        key={shift.id}
                        shift={shift}
                        onEdit={() => openEditor(shift)}
                        onDelete={() => deleteShift(shift.id)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* SECTION 2 — Jours travaillés */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle style={{ color: "#0B0F2E" }}>Jours travaillés</CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  Jours ouvrés par défaut pour la société (appliqués au calcul des absences et du prorata).
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  {JOURS.map(j => (
                    <label key={j.code} className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border hover:border-[#4191FF] transition-colors">
                      <Checkbox
                        checked={regles.jours_travailles.includes(j.code)}
                        onCheckedChange={() => toggleJourTravail(j.code)}
                      />
                      <span className="text-sm font-medium">{j.label}</span>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* SECTION 3 — Règles WRA (collapsible) */}
            <Collapsible open={wraOpen} onOpenChange={setWraOpen}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle style={{ color: "#0B0F2E" }}>Règles légales — Avancé</CardTitle>
                        <p className="text-sm text-gray-500 mt-1">Pré-configurées WRA 2019.</p>
                      </div>
                      <ChevronDown className={`h-5 w-5 text-gray-500 transition-transform ${wraOpen ? "rotate-180" : ""}`} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-4 border-t pt-4">
                    <WraField
                      label="Heures max / semaine"
                      value={regles.regles_wra.max_heures_semaine}
                      unit="h"
                      onChange={(v) => updateWra("max_heures_semaine", v)}
                    />
                    <WraField
                      label="Repos entre journées"
                      value={regles.regles_wra.repos_entre_journees}
                      unit="h"
                      onChange={(v) => updateWra("repos_entre_journees", v)}
                    />
                    <WraField
                      label="Jours consécutifs max"
                      value={regles.regles_wra.max_jours_consecutifs}
                      unit="j"
                      onChange={(v) => updateWra("max_jours_consecutifs", v)}
                    />
                    <WraField
                      label="Pause après 6h"
                      value={regles.regles_wra.pause_apres_6h_minutes}
                      unit="min"
                      onChange={(v) => updateWra("pause_apres_6h_minutes", v)}
                    />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-3 pt-2 pb-8 sticky bottom-4">
              <Button
                onClick={save}
                disabled={saving || !societe}
                className="text-white px-8 shadow-lg"
                style={{ backgroundColor: "#0B0F2E" }}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </>
        )}

        {/* Editor Dialog */}
        <ShiftEditor
          open={editorOpen}
          initial={editorShift}
          onSave={saveShift}
          onCancel={() => { setEditorOpen(false); setEditorShift(null) }}
        />
      </div>
    </ClientPageShell>
  )
}

function WraField({
  label, value, unit, onChange,
}: { label: string; value: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-gray-50 border">
      <Label className="text-sm font-medium" style={{ color: "#0B0F2E" }}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          value={value}
          onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="w-24 text-right"
        />
        <span className="text-sm text-gray-500 w-10">{unit}</span>
      </div>
    </div>
  )
}
