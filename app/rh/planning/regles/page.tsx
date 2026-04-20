"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { ArrowLeft, Save, Shield, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  PlanningShift, PlanningConfig, PlanningRegleLegale, JourCode,
} from "@/types/planning"
import { DEFAULT_CONFIG, DEFAULT_REGLES_WRA } from "@/types/planning"
import { UI_PRESETS, type UIPreset } from "@/lib/planning/ui-presets"

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
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState<string>("")
  const [shifts, setShifts] = useState<PlanningShift[]>([])
  const [config, setConfig] = useState<PlanningConfig>(DEFAULT_CONFIG)
  const [regles, setRegles] = useState<PlanningRegleLegale[]>(DEFAULT_REGLES_WRA)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

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
              <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Règles de planning</h1>
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

            {/* Section 2 — Mes créneaux (placeholder) */}
            <Card className="border-2 border-dashed border-gray-300 bg-gray-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-gray-600">
                  <span aria-hidden>🕐</span> Mes créneaux
                </CardTitle>
                <p className="text-sm text-gray-500">À venir dans la prochaine itération.</p>
              </CardHeader>
            </Card>

            {/* Section 3 — Règles WRA (placeholder) */}
            <Card className="border-2 border-dashed border-gray-300 bg-gray-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-gray-600">
                  <span aria-hidden>⚖️</span> Règles légales — WRA 2019
                </CardTitle>
                <p className="text-sm text-gray-500">À venir dans la prochaine itération.</p>
              </CardHeader>
            </Card>
          </>
        )}

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
