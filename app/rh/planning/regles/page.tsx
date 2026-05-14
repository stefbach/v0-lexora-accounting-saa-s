"use client"
import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion"
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { ArrowLeft, Save, Shield, Loader2, Plus } from "lucide-react"
import { t, getLocale } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type {
  PlanningShift, PlanningConfig, PlanningRegleLegale, JourCode,
} from "@/types/planning"
import { DEFAULT_CONFIG, DEFAULT_REGLES_WRA } from "@/types/planning"
import { UI_PRESETS, type UIPreset } from "@/lib/planning/ui-presets"
import { getWRAExplanation } from "@/lib/planning/wra-explanations"
import { ShiftRow } from "./_components/ShiftRow"
import { ShiftEditDialog } from "./_components/ShiftEditDialog"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

const JOURS: { code: JourCode; label: string }[] = [
  { code: "lun", label: "Lundi" },
  { code: "mar", label: "Mardi" },
  { code: "mer", label: "Mercredi" },
  { code: "jeu", label: "Jeudi" },
  { code: "ven", label: "Vendredi" },
  { code: "sam", label: "Samedi" },
  { code: "dim", label: "Dimanche" },
]

function genShiftId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `s_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

export default function ReglesPlanningPage() {
  const locale = getLocale()
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState<string>("")
  const [shifts, setShifts] = useState<PlanningShift[]>([])
  const [config, setConfig] = useState<PlanningConfig>(DEFAULT_CONFIG)
  const [regles, setRegles] = useState<PlanningRegleLegale[]>(DEFAULT_REGLES_WRA)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Edition de créneaux
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorShift, setEditorShift] = useState<PlanningShift | null>(null)

  // Chargement des sociétés accessibles
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

  // Chargement des règles de la société active
  useEffect(() => {
    if (!societe) return
    setLoading(true)
    fetch(`/api/rh/planning/regles?societe_id=${societe}`)
      .then(r => r.json())
      .then(data => {
        setShifts(Array.isArray(data.shifts_planning) ? data.shifts_planning : [])
        setConfig(
          data.config_planning && typeof data.config_planning === "object"
            ? { ...DEFAULT_CONFIG, ...data.config_planning }
            : DEFAULT_CONFIG,
        )
        setRegles(
          Array.isArray(data.regles_planning) && data.regles_planning.length > 0
            ? data.regles_planning
            : DEFAULT_REGLES_WRA,
        )
      })
      .catch(() => toast.error("Impossible de charger les règles"))
      .finally(() => setLoading(false))
  }, [societe])

  const applyPreset = (preset: UIPreset) => {
    const shiftsWithId: PlanningShift[] = preset.shifts.map(s => ({ ...s, id: genShiftId() }))
    setShifts(shiftsWithId)
    setConfig(prev => ({ ...prev, jours_travailles: preset.jours_travailles }))
    toast.info(`Modèle "${preset.label}" chargé. N'oubliez pas d'enregistrer.`)
  }

  const toggleJour = (code: JourCode) => {
    setConfig(prev => ({
      ...prev,
      jours_travailles: prev.jours_travailles.includes(code)
        ? prev.jours_travailles.filter(j => j !== code)
        : [...prev.jours_travailles, code],
    }))
  }

  // ─── Shifts CRUD ────────────────────────────────────────────────────
  const openAddShift = () => {
    setEditorShift(null)
    setEditorOpen(true)
  }
  const openEditShift = (s: PlanningShift) => {
    setEditorShift(s)
    setEditorOpen(true)
  }
  const saveShift = (next: PlanningShift) => {
    setShifts(prev => {
      const idx = prev.findIndex(s => s.id === next.id)
      return idx >= 0
        ? prev.map(s => (s.id === next.id ? next : s))
        : [...prev, next]
    })
    setEditorOpen(false)
    setEditorShift(null)
  }
  const duplicateShift = (s: PlanningShift) => {
    // Cherche un code unique en incrémentant 2/3 si nécessaire
    const existingCodes = new Set(shifts.map(x => x.code.toUpperCase()))
    let newCode = `${s.code}2`
    let n = 2
    while (existingCodes.has(newCode.toUpperCase())) {
      n += 1
      newCode = `${s.code}${n}`.slice(0, 3)
    }
    const dup: PlanningShift = {
      ...s,
      id: genShiftId(),
      code: newCode,
      label: `${s.label} (copie)`,
    }
    setShifts(prev => [...prev, dup])
    toast.info(`Créneau "${s.label}" dupliqué`)
  }
  const deleteShift = (id: string) => {
    const target = shifts.find(s => s.id === id)
    if (!target) return
    if (!window.confirm(`Supprimer le créneau "${target.label}" ?`)) return
    setShifts(prev => prev.filter(s => s.id !== id))
  }

  // ─── Règles WRA ─────────────────────────────────────────────────────
  const updateRegle = (
    key: string,
    field: "enabled" | "value",
    val: boolean | number | string,
  ) => {
    setRegles(prev => prev.map(r => (r.key === key ? { ...r, [field]: val } : r)))
  }

  // ─── Dérivés pour l'UI ──────────────────────────────────────────────
  const existingCodes = useMemo(
    () => shifts
      .filter(s => !editorShift || s.id !== editorShift.id)
      .map(s => s.code.toUpperCase()),
    [shifts, editorShift],
  )
  const maxHeuresJourRegle = useMemo(() => {
    const r = regles.find(x => x.key === "max_heures_jour" && x.enabled)
    return r ? Number(r.value) : undefined
  }, [regles])

  const handleSave = async () => {
    if (!societe) return
    setSaving(true)
    try {
      const res = await fetch("/api/rh/planning/regles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societe,
          shifts_planning: shifts,
          config_planning: config,
          regles_planning: regles,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error("Erreur : " + (data?.error || `HTTP ${res.status}`))
        return
      }
      toast.success("✅ Règles de planning enregistrées")
    } catch (e: any) {
      toast.error("Erreur réseau : " + (e?.message || ""))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-5 max-w-5xl mx-auto pb-24">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: NAVY }}
            >
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: NAVY }}>{t('rha.a.planr.title', locale)}</h1>
              <p className="text-gray-500 text-sm">Créneaux, jours et règles par société</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/rh/planning">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" /> Retour au planning
              </Button>
            </Link>
            <Select value={societe} onValueChange={setSociete}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Société" />
              </SelectTrigger>
              <SelectContent>
                {societes.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                ))}
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
            {/* Section A — Démarrage rapide (si aucun shift) */}
            {shifts.length === 0 && (
              <Card className="border-2 border-dashed border-blue-300 bg-blue-50/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2" style={{ color: NAVY }}>
                    <span aria-hidden>⚡</span> Commencez rapidement
                  </CardTitle>
                  <p className="text-sm text-gray-600">
                    Choisissez un modèle adapté à votre activité. Vous pourrez tout personnaliser après.
                  </p>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {UI_PRESETS.map(preset => (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="p-4 bg-white border rounded-lg hover:border-blue-500 hover:shadow-md text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <div className="text-3xl mb-2">{preset.icon}</div>
                      <div className="font-bold text-sm mb-1" style={{ color: NAVY }}>{preset.label}</div>
                      <div className="text-xs text-gray-500 leading-snug">{preset.description}</div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Section 1 — Jours travaillés */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" style={{ color: NAVY }}>
                  <span aria-hidden>📅</span> Jours travaillés
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Cochez les jours de travail habituels. Utilisé pour calculer les absences et le prorata.
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {JOURS.map(day => {
                    const checked = config.jours_travailles.includes(day.code)
                    return (
                      <label
                        key={day.code}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer transition-all select-none",
                          checked
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleJour(day.code)}
                        />
                        <span className="text-sm font-medium">{day.label}</span>
                      </label>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  {config.jours_travailles.length} jour(s) travaillé(s) par semaine
                </p>
              </CardContent>
            </Card>

            {/* Section 2 — Mes créneaux */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2" style={{ color: NAVY }}>
                      <span aria-hidden>🕐</span> Mes créneaux
                    </CardTitle>
                    <p className="text-sm text-gray-600">
                      Les types de journée disponibles pour planifier les employés.
                    </p>
                  </div>
                  <Button size="sm" onClick={openAddShift}>
                    <Plus className="w-4 h-4 mr-1" /> Ajouter
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {shifts.length === 0 ? (
                  <div className="text-center py-10 text-sm text-gray-400">
                    Aucun créneau. Utilisez un modèle dans « Démarrage rapide » ci-dessus ou cliquez sur « Ajouter ».
                  </div>
                ) : (
                  <div className="space-y-2">
                    {shifts.map(shift => (
                      <ShiftRow
                        key={shift.id}
                        shift={shift}
                        onEdit={() => openEditShift(shift)}
                        onDuplicate={() => duplicateShift(shift)}
                        onDelete={() => deleteShift(shift.id)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Section 3 — Règles légales WRA 2019 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" style={{ color: NAVY }}>
                  <span aria-hidden>⚖️</span> Règles légales — Workers' Rights Act 2019
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Limites légales à Maurice. Les règles désactivées ne sont pas vérifiées lors de la validation du planning.
                </p>
              </CardHeader>
              <CardContent>
                <TooltipProvider delayDuration={200}>
                  <Accordion type="multiple" defaultValue={["heures"]} className="w-full">
                    <WraCategoryItem
                      value="heures"
                      label="🕐 Heures de travail"
                      regles={regles.filter(r => r.category === "heures")}
                      onChange={updateRegle}
                    />
                    <WraCategoryItem
                      value="repos"
                      label="😴 Repos et rotation"
                      regles={regles.filter(r => r.category === "repos")}
                      onChange={updateRegle}
                    />
                    <WraCategoryItem
                      value="ot"
                      label="💰 Heures supplémentaires"
                      regles={regles.filter(r => r.category === "ot")}
                      onChange={updateRegle}
                    />
                    <WraCategoryItem
                      value="equipe"
                      label="👥 Équipe"
                      regles={regles.filter(r => r.category === "equipe")}
                      onChange={updateRegle}
                    />
                  </Accordion>
                </TooltipProvider>
              </CardContent>
            </Card>
          </>
        )}

        {/* Dialog d'édition de créneau */}
        <ShiftEditDialog
          shift={editorShift}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          onSave={saveShift}
          existingCodes={existingCodes}
          maxHeuresJour={maxHeuresJourRegle}
        />

        {/* Bouton Enregistrer — fixed bottom-right */}
        <div className="fixed bottom-6 right-6 z-40">
          <Button
            onClick={handleSave}
            disabled={saving || !societe || loading}
            className="text-white px-6 shadow-xl"
            style={{ backgroundColor: GOLD }}
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </div>
    </ClientPageShell>
  )
}

// ─── Sous-composants WRA ─────────────────────────────────────────────

function WraCategoryItem({
  value, label, regles, onChange,
}: {
  value: string
  label: string
  regles: PlanningRegleLegale[]
  onChange: (key: string, field: "enabled" | "value", val: boolean | number | string) => void
}) {
  const nbActives = regles.filter(r => r.enabled).length
  return (
    <AccordionItem value={value}>
      <AccordionTrigger>
        <div className="flex items-center gap-2 flex-1">
          <span>{label}</span>
          <Badge variant="outline" className="ml-auto mr-3 text-[10px] font-normal">
            {nbActives}/{regles.length} actives
          </Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="divide-y">
          {regles.map(r => (
            <RegleRow key={r.key} regle={r} onChange={onChange} />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

function RegleRow({
  regle, onChange,
}: {
  regle: PlanningRegleLegale
  onChange: (key: string, field: "enabled" | "value", val: boolean | number | string) => void
}) {
  return (
    <div className={cn(
      "flex items-center gap-3 py-3",
      !regle.enabled && "opacity-50",
    )}>
      <Switch
        checked={regle.enabled}
        onCheckedChange={(v) => onChange(regle.key, "enabled", v)}
        aria-label={`Activer ${regle.label}`}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: NAVY }}>{regle.label}</div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="text-[10px] font-mono mt-1 cursor-help"
            >
              {regle.wraRef}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs">{getWRAExplanation(regle.wraRef)}</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {regle.type === "boolean" ? (
          <Switch
            checked={regle.value as boolean}
            onCheckedChange={(v) => onChange(regle.key, "value", v)}
            disabled={!regle.enabled}
          />
        ) : regle.type === "time" ? (
          <Input
            type="time"
            value={regle.value as string}
            onChange={e => onChange(regle.key, "value", e.target.value)}
            disabled={!regle.enabled}
            className="w-[110px] text-sm"
          />
        ) : (
          <Input
            type="number"
            value={regle.value as number}
            onChange={e => onChange(regle.key, "value", parseFloat(e.target.value) || 0)}
            disabled={!regle.enabled}
            className="w-[80px] text-right text-sm"
            min={0}
          />
        )}
        {regle.unit && (
          <span className="text-xs text-gray-500 min-w-[50px] whitespace-nowrap">{regle.unit}</span>
        )}
      </div>
    </div>
  )
}
