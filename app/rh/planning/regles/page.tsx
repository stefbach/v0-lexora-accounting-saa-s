"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Shield, Clock, Moon, Coffee, Users, TrendingUp, RotateCcw, Save, ArrowLeft, Info } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import Link from "next/link"

// ─── Types ──────────────────────────────────────────────────────────

interface PlanningRule {
  key: string
  label: string
  value: number | string | boolean
  unit: string
  wraRef: string
  category: "heures" | "repos" | "ot" | "equipe"
  enabled: boolean
  type: "number" | "time" | "boolean" | "percent"
}

const DEFAULT_RULES: PlanningRule[] = [
  // Heures de travail
  { key: "max_heures_semaine", label: "Heures max par semaine", value: 45, unit: "heures", wraRef: "WRA 2019, Art. 14(1)", category: "heures", enabled: true, type: "number" },
  { key: "max_heures_jour", label: "Heures max par jour (semaine 5j)", value: 9, unit: "heures", wraRef: "WRA 2019, Art. 14(2)(a)", category: "heures", enabled: true, type: "number" },
  { key: "max_heures_jour_6j", label: "Heures max par jour (semaine 6j)", value: 8, unit: "heures", wraRef: "WRA 2019, Art. 14(2)(b)", category: "heures", enabled: true, type: "number" },
  { key: "pause_minimum_minutes", label: "Pause minimum par 6h travaillees", value: 30, unit: "minutes", wraRef: "WRA 2019, Art. 15", category: "heures", enabled: true, type: "number" },
  // Repos & Rotation
  { key: "max_jours_consecutifs", label: "Jours consecutifs max avant repos", value: 6, unit: "jours", wraRef: "WRA 2019, Art. 16(1)", category: "repos", enabled: true, type: "number" },
  { key: "repos_minimum_semaine", label: "Repos minimum par semaine", value: 1, unit: "jour (24h consecutives)", wraRef: "WRA 2019, Art. 16(2)", category: "repos", enabled: true, type: "number" },
  { key: "rotation_preavis_jours", label: "Preavis avant changement de rotation", value: 7, unit: "jours", wraRef: "WRA 2019, Art. 17", category: "repos", enabled: true, type: "number" },
  { key: "nuit_debut", label: "Debut travail de nuit", value: "18:00", unit: "", wraRef: "WRA 2019, Art. 2", category: "repos", enabled: true, type: "time" },
  { key: "nuit_fin", label: "Fin travail de nuit", value: "06:00", unit: "", wraRef: "WRA 2019, Art. 2", category: "repos", enabled: true, type: "time" },
  // Heures supplementaires
  { key: "ot_apres_heures", label: "OT commence apres X heures/jour", value: 9, unit: "heures", wraRef: "WRA 2019, Art. 20(1)", category: "ot", enabled: true, type: "number" },
  { key: "ot_taux_15x", label: "Taux 1.5x (2 premieres heures OT)", value: true, unit: "", wraRef: "WRA 2019, Art. 20(2)(a)", category: "ot", enabled: true, type: "boolean" },
  { key: "ot_taux_2x", label: "Taux 2x (feries / nuit)", value: true, unit: "", wraRef: "WRA 2019, Art. 20(2)(b)", category: "ot", enabled: true, type: "boolean" },
  { key: "ferie_travaille_taux", label: "Taux jour ferie travaille", value: 2.0, unit: "x salaire", wraRef: "WRA 2019, Art. 21", category: "ot", enabled: true, type: "number" },
  // Contraintes equipe
  { key: "max_employes_absents_pct", label: "Max employes absents meme jour", value: 30, unit: "%", wraRef: "Politique interne", category: "equipe", enabled: true, type: "percent" },
]

const CATEGORY_META: Record<string, { label: string; icon: any; color: string; bgColor: string }> = {
  heures: { label: "Heures de travail", icon: Clock, color: "#4191FF", bgColor: "bg-blue-50 border-blue-200" },
  repos: { label: "Repos & Rotation", icon: Moon, color: "#D4AF37", bgColor: "bg-amber-50 border-amber-200" },
  ot: { label: "Heures supplementaires", icon: TrendingUp, color: "#F97316", bgColor: "bg-orange-50 border-orange-200" },
  equipe: { label: "Contraintes equipe", icon: Users, color: "#0B0F2E", bgColor: "bg-slate-50 border-slate-200" },
}

const STORAGE_KEY = "lexora_planning_rules"

export default function ReglesPage() {
  const [rules, setRules] = useState<PlanningRule[]>(DEFAULT_RULES)
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

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

  // Load rules from localStorage + API
  useEffect(() => {
    // Try localStorage first
    const stored = localStorage.getItem(`${STORAGE_KEY}_${societe}`)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as PlanningRule[]
        setRules(parsed)
        setLoaded(true)
        return
      } catch {}
    }
    // Try API
    if (societe && societe !== "all") {
      fetch(`/api/rh/planning/regles?societe_id=${societe}`)
        .then(r => r.json())
        .then(data => {
          if (data.regles && Array.isArray(data.regles) && data.regles.length > 0) {
            setRules(data.regles)
          } else {
            setRules(DEFAULT_RULES)
          }
        })
        .catch(() => setRules(DEFAULT_RULES))
        .finally(() => setLoaded(true))
    } else {
      setRules(DEFAULT_RULES)
      setLoaded(true)
    }
  }, [societe])

  const updateRule = (key: string, field: "value" | "enabled", val: any) => {
    setRules(prev => prev.map(r => r.key === key ? { ...r, [field]: val } : r))
  }

  const resetDefaults = () => {
    setRules(DEFAULT_RULES)
    toast.info("Regles restaurees aux valeurs par defaut WRA 2019")
  }

  const saveRules = async () => {
    setSaving(true)
    try {
      // Save to localStorage
      localStorage.setItem(`${STORAGE_KEY}_${societe}`, JSON.stringify(rules))

      // Save to API
      if (societe && societe !== "all") {
        const res = await fetch("/api/rh/planning/regles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ societe_id: societe, regles: rules }),
        })
        if (!res.ok) {
          const data = await res.json()
          toast.error("Erreur API: " + (data.error || "Impossible de sauvegarder"))
          return
        }
      }
      toast.success("Regles de planning sauvegardees")
    } catch (e: any) {
      toast.error("Erreur: " + (e.message || ""))
    } finally {
      setSaving(false)
    }
  }

  const categories = ["heures", "repos", "ot", "equipe"] as const

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
            <h1 className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>Regles de planning</h1>
            <p className="text-gray-500 text-sm">Configuration WRA 2019 - Workers' Rights Act (Maurice)</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/rh/planning">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Retour au planning
            </Button>
          </Link>
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Societe" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg border" style={{ backgroundColor: "#0B0F2E08", borderColor: "#0B0F2E20" }}>
        <Info className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#4191FF" }} />
        <div className="text-sm text-gray-600">
          <p className="font-medium" style={{ color: "#0B0F2E" }}>Workers' Rights Act 2019 - Ile Maurice</p>
          <p className="mt-1">Ces regles sont pre-remplies selon la legislation mauricienne. Vous pouvez les adapter par societe. Les regles desactivees ne seront pas verifiees lors de la validation du planning.</p>
        </div>
      </div>

      {/* Rule cards by category */}
      {categories.map(cat => {
        const meta = CATEGORY_META[cat]
        const Icon = meta.icon
        const catRules = rules.filter(r => r.category === cat)

        return (
          <Card key={cat} className={`border ${meta.bgColor}`}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon className="w-5 h-5" style={{ color: meta.color }} />
                <span style={{ color: "#0B0F2E" }}>{meta.label}</span>
                <Badge variant="outline" className="ml-auto text-xs font-normal">
                  {catRules.filter(r => r.enabled).length}/{catRules.length} actives
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {catRules.map(rule => (
                <div
                  key={rule.key}
                  className={`flex items-center gap-4 p-3 rounded-lg bg-white border transition-opacity ${
                    !rule.enabled ? "opacity-50" : ""
                  }`}
                >
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(v) => updateRule(rule.key, "enabled", v)}
                  />
                  <div className="flex-1 min-w-0">
                    <Label className="text-sm font-medium" style={{ color: "#0B0F2E" }}>
                      {rule.label}
                    </Label>
                    <p className="text-xs text-gray-400 mt-0.5">{rule.wraRef}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {rule.type === "boolean" ? (
                      <Switch
                        checked={rule.value as boolean}
                        onCheckedChange={(v) => updateRule(rule.key, "value", v)}
                        disabled={!rule.enabled}
                      />
                    ) : rule.type === "time" ? (
                      <Input
                        type="time"
                        value={rule.value as string}
                        onChange={(e) => updateRule(rule.key, "value", e.target.value)}
                        disabled={!rule.enabled}
                        className="w-[120px] text-sm"
                      />
                    ) : (
                      <Input
                        type="number"
                        value={rule.value as number}
                        onChange={(e) => updateRule(rule.key, "value", parseFloat(e.target.value) || 0)}
                        disabled={!rule.enabled}
                        className="w-[90px] text-sm text-right"
                        min={0}
                      />
                    )}
                    {rule.unit && (
                      <span className="text-xs text-gray-500 min-w-[60px]">{rule.unit}</span>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )
      })}

      {/* Action buttons */}
      <div className="flex items-center justify-between gap-3 pt-2 pb-8">
        <Button
          variant="outline"
          onClick={resetDefaults}
          className="border-amber-300 text-amber-700 hover:bg-amber-50"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Restaurer defauts WRA 2019
        </Button>
        <Button
          onClick={saveRules}
          disabled={saving}
          className="text-white px-8"
          style={{ backgroundColor: "#D4AF37" }}
        >
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Enregistrement..." : "Enregistrer les regles"}
        </Button>
      </div>
    </div>
    </ClientPageShell>
  )
}
