"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  ArrowLeft, Plus, Brain, TrendingUp, TrendingDown, CheckCircle2,
  Clock, X, BarChart3, Loader2,
} from "lucide-react"
import { t, getLocale, type Locale } from '@/lib/i18n'

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return n.toLocaleString("fr-FR") + " MUR"
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Scenario {
  nom: string
  probabilite: string
  impact: string
  detail: string
}

interface ImpactCompte {
  compte: string
  impact: number
  frequence: string
}

interface Simulation {
  id: string
  titre: string
  type: string
  description: string
  score: number
  verdict: string
  verdictColor: string
  verdictBg: string
  date: string
  impacts: ImpactCompte[]
  scenarios: Scenario[]
  analyseIA: string
}

// ---------------------------------------------------------------------------
// Type options for the new simulation form
// ---------------------------------------------------------------------------
const getTypeOptions = (locale: Locale) => [
  { value: "nouveau_client", label: t('cabclt.sim.type_new_client', locale) },
  { value: "embauche", label: t('cabclt.sim.type_hiring', locale) },
  { value: "investissement", label: t('cabclt.sim.type_investment', locale) },
  { value: "emprunt", label: t('cabclt.sim.type_loan', locale) },
  { value: "expansion", label: t('cabclt.sim.type_expansion', locale) },
  { value: "reduction", label: t('cabclt.sim.type_cost_reduction', locale) },
]

function mapDbSimulation(row: any, locale: Locale): Simulation {
  const score = row.score_opportunite || 0
  const isGood = score >= 70
  const optim = row.scenario_optimiste || {}
  const base = row.scenario_base || {}
  const pessim = row.scenario_pessimiste || {}

  return {
    id: row.id,
    titre: row.titre || t('cabclt.sim.no_title', locale),
    type: row.type_simulation || "autre",
    description: row.recommandation || "",
    score,
    verdict: isGood ? t('cabclt.sim.verdict_viable', locale) : t('cabclt.sim.verdict_evaluate', locale),
    verdictColor: isGood ? "text-green-700" : "text-orange-700",
    verdictBg: isGood ? "bg-green-100" : "bg-orange-100",
    date: row.created_at ? new Date(row.created_at).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB') : "--",
    impacts: [],
    scenarios: [
      {
        nom: t('cabclt.sim.scenario_optimistic', locale),
        probabilite: optim.probabilite || "--",
        impact: optim.impact_tresorerie ? fmt(optim.impact_tresorerie) : optim.description || "--",
        detail: optim.description || "",
      },
      {
        nom: t('cabclt.sim.scenario_base', locale),
        probabilite: base.probabilite || "--",
        impact: base.impact_tresorerie ? fmt(base.impact_tresorerie) : base.description || "--",
        detail: base.description || "",
      },
      {
        nom: t('cabclt.sim.scenario_pessimistic', locale),
        probabilite: pessim.probabilite || "--",
        impact: pessim.impact_tresorerie ? fmt(pessim.impact_tresorerie) : pessim.description || "--",
        detail: pessim.description || "",
      },
    ],
    analyseIA: row.recommandation || t('cabclt.sim.no_analysis', locale),
  }
}

export default function SimulationsPage() {
  const params = useParams()
  const clientId = params.clientId as string
  const societeId = params.societeId as string

  const [showDialog, setShowDialog] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [newSim, setNewSim] = useState({
    titre: "",
    type: "nouveau_client",
    description: "",
    parametres: "",
  })

  const [simulations, setSimulations] = useState<Simulation[]>([])

  const fetchSimulations = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: rows, error } = await supabase
        .from("simulations")
        .select("*")
        .eq("societe_id", societeId)
        .order("created_at", { ascending: false })

      if (!error && rows) {
        setSimulations(rows.map(mapDbSimulation))
      }
    } catch {
      // API not available, keep empty
    } finally {
      setLoading(false)
    }
  }, [societeId])

  useEffect(() => {
    fetchSimulations()
  }, [fetchSimulations])

  async function handleSubmit() {
    if (!newSim.titre || !newSim.description) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch("/api/simuler-scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          type_simulation: newSim.type,
          titre: newSim.titre,
          parametres: {
            description: newSim.description,
            parametres_additionnels: newSim.parametres,
          },
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setSubmitError(data.error || "Erreur lors de la simulation.")
        setSubmitting(false)
        return
      }

      // Add the new simulation to the list
      if (data.simulation) {
        setSimulations(prev => [mapDbSimulation(data.simulation), ...prev])
      }

      setNewSim({ titre: "", type: "nouveau_client", description: "", parametres: "" })
      setShowDialog(false)
    } catch {
      setSubmitError("Erreur de connexion.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: "#F4F6FB" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Link href={`/comptable/clients/${clientId}/${societeId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> Retour
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            Simulations
          </h1>
          <p className="text-sm text-gray-500">
            Modelisez l&apos;impact de decisions strategiques sur la tresorerie
          </p>
        </div>
        <Button
          size="sm"
          style={{ background: GOLD, color: NAVY }}
          onClick={() => setShowDialog(true)}
        >
          <Plus className="w-4 h-4 mr-1" /> Nouvelle simulation
        </Button>
      </div>

      {/* Dialog / Modal */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <Card className="w-full max-w-lg mx-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle style={{ color: NAVY }}>Nouvelle simulation</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => { setShowDialog(false); setSubmitError(null) }}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Titre</label>
                <input
                  type="text"
                  className="border rounded-md px-3 py-2 w-full text-sm"
                  placeholder="Ex: Nouveau contrat Air Mauritius"
                  value={newSim.titre}
                  onChange={(e) => setNewSim({ ...newSim, titre: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Type</label>
                <select
                  className="border rounded-md px-3 py-2 w-full text-sm"
                  value={newSim.type}
                  onChange={(e) => setNewSim({ ...newSim, type: e.target.value })}
                >
                  {typeOptions.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Description</label>
                <textarea
                  className="border rounded-md px-3 py-2 w-full text-sm"
                  rows={3}
                  placeholder="Decrivez le contexte et les hypotheses..."
                  value={newSim.description}
                  onChange={(e) => setNewSim({ ...newSim, description: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Parametres</label>
                <textarea
                  className="border rounded-md px-3 py-2 w-full text-sm"
                  rows={2}
                  placeholder="Montant estime, duree, nombre d'employes..."
                  value={newSim.parametres}
                  onChange={(e) => setNewSim({ ...newSim, parametres: e.target.value })}
                />
              </div>
              {submitError && (
                <p className="text-sm text-red-600">{submitError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => { setShowDialog(false); setSubmitError(null) }}>
                  Annuler
                </Button>
                <Button
                  size="sm"
                  disabled={submitting || !newSim.titre || !newSim.description}
                  style={{ background: NAVY, color: "white" }}
                  onClick={handleSubmit}
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Brain className="w-4 h-4 mr-1" />
                  )}
                  Analyser avec l&apos;IA
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Simulations list */}
      <div className="space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
          </div>
        ) : simulations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <BarChart3 className="h-12 w-12 text-muted-foreground/40" />
              <p className="font-medium text-base">Aucune simulation</p>
              <p className="text-sm text-center">
                Creez votre premiere simulation pour modeliser l&apos;impact de decisions strategiques sur la tresorerie.
              </p>
              <Button
                size="sm"
                className="mt-2"
                style={{ background: GOLD, color: NAVY }}
                onClick={() => setShowDialog(true)}
              >
                <Plus className="w-4 h-4 mr-1" /> Nouvelle simulation
              </Button>
            </CardContent>
          </Card>
        ) : (
          simulations.map((sim) => (
            <Card key={sim.id} className="border-t-4" style={{ borderTopColor: sim.score >= 70 ? "#16a34a" : GOLD }}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <CardTitle style={{ color: NAVY }}>{sim.titre}</CardTitle>
                      <Badge variant="outline" className="text-xs">
                        {typeOptions.find((t) => t.value === sim.type)?.label || sim.type}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500">{sim.description}</p>
                    <p className="text-xs text-gray-400 mt-1">Creee le {sim.date}</p>
                  </div>
                  <div className="flex flex-col items-center ml-4">
                    <span className="text-xs text-gray-500 mb-1">Score</span>
                    <div
                      className={`text-2xl font-black rounded-xl w-14 h-14 flex items-center justify-center ${sim.verdictBg} ${sim.verdictColor}`}
                    >
                      {sim.score}
                    </div>
                    <Badge className={`${sim.verdictBg} ${sim.verdictColor} mt-1`}>
                      {sim.score >= 70 ? (
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                      ) : (
                        <Clock className="w-3 h-3 mr-1" />
                      )}
                      {sim.verdict}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="scenarios" className="w-full">
                  <TabsList className="mb-3">
                    <TabsTrigger value="scenarios">3 Scenarios</TabsTrigger>
                    <TabsTrigger value="analyse">Analyse IA</TabsTrigger>
                  </TabsList>

                  {/* 3 Scénarios */}
                  <TabsContent value="scenarios">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {sim.scenarios.map((sc) => {
                        const colors: Record<string, string> = {
                          Optimiste: "border-green-200 bg-green-50",
                          Base: "border-blue-200 bg-blue-50",
                          Pessimiste: "border-red-200 bg-red-50",
                        }
                        return (
                          <div key={sc.nom} className={`rounded-lg border p-4 ${colors[sc.nom] || ""}`}>
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-semibold text-sm" style={{ color: NAVY }}>{sc.nom}</span>
                              <Badge variant="outline" className="text-xs">{sc.probabilite}</Badge>
                            </div>
                            <p className="text-lg font-bold mb-2" style={{ color: NAVY }}>{sc.impact}</p>
                            <p className="text-xs text-gray-600">{sc.detail}</p>
                          </div>
                        )
                      })}
                    </div>
                  </TabsContent>

                  {/* Analyse IA */}
                  <TabsContent value="analyse">
                    <div className="flex items-start gap-3 p-4 rounded-lg" style={{ background: "#F8F6F0" }}>
                      <Brain className="w-5 h-5 mt-0.5 shrink-0" style={{ color: GOLD }} />
                      <p className="text-sm text-gray-700 leading-relaxed">{sim.analyseIA}</p>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
