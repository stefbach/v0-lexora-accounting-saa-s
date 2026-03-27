"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
import { createClient } from "@/lib/supabase/client"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Clock,
  Loader2,
  AlertTriangle,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Simulation {
  id: string
  titre: string
  type_simulation: string
  score_opportunite: number | null
  recommandation: string | null
  scenario_optimiste: any
  scenario_base: any
  scenario_pessimiste: any
  statut: string
  created_at?: string
}

const simulationTypes = [
  "Nouveau client",
  "Embauche",
  "Investissement",
  "Changement de prix",
  "Perte client",
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SimulationsPage() {
  const { profile } = useProfile()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [simulations, setSimulations] = useState<Simulation[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [societeId, setSocieteId] = useState<string | null>(null)

  // Form state
  const [titre, setTitre] = useState("")
  const [typeSimulation, setTypeSimulation] = useState("")
  const [description, setDescription] = useState("")

  // Fetch societe_id and existing simulations
  useEffect(() => {
    async function init() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Get the client's societe via dossiers
        const { data: dossiers } = await supabase
          .from("dossiers")
          .select("societe_id")
          .eq("client_id", user.id)
          .limit(1)

        if (dossiers && dossiers.length > 0) {
          const socId = dossiers[0].societe_id
          setSocieteId(socId)

          // Fetch existing simulations
          const { data: sims } = await supabase
            .from("simulations")
            .select("*")
            .eq("societe_id", socId)
            .order("created_at", { ascending: false })

          if (sims) {
            setSimulations(sims)
          }
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [])

  async function handleCreateSimulation() {
    if (!societeId || !titre.trim() || !typeSimulation) return

    setSubmitting(true)
    setSubmitError("")

    try {
      const res = await fetch("/api/simuler-scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          titre: titre.trim(),
          type_simulation: typeSimulation,
          parametres: {
            description: description.trim(),
            type: typeSimulation,
          },
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setSubmitError(data.error || "Erreur lors de la creation de la simulation")
        return
      }

      // Add the new simulation to the list
      if (data.simulation) {
        setSimulations((prev) => [data.simulation, ...prev])
      }

      // Reset form and close dialog
      setTitre("")
      setTypeSimulation("")
      setDescription("")
      setDialogOpen(false)
    } catch {
      setSubmitError("Erreur de connexion. Reessayez plus tard.")
    } finally {
      setSubmitting(false)
    }
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "#1E2A4A" }}>
          Acces non autorise
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;acceder a cette page.
        </p>
        <Link href="/client/documents" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour aux documents
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  function getScoreColor(score: number | null) {
    if (score === null) return { color: "#6B7280", label: "N/A" }
    if (score >= 70) return { color: "#16a34a", label: "Favorable" }
    if (score >= 40) return { color: "#ea580c", label: "Modere" }
    return { color: "#EF4444", label: "Risque" }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Mes Simulations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Testez l&apos;impact de vos decisions sur votre tresorerie
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setSubmitError("") }}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: "#C9A84C" }} className="text-white" disabled={!societeId}>
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle simulation
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle style={{ color: "#1E2A4A" }}>
                Nouvelle simulation
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="sim-titre">Titre</Label>
                <Input
                  id="sim-titre"
                  placeholder="Ex : Nouveau contrat Rogers"
                  value={titre}
                  onChange={(e) => setTitre(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sim-type">Type</Label>
                <Select value={typeSimulation} onValueChange={setTypeSimulation}>
                  <SelectTrigger id="sim-type">
                    <SelectValue placeholder="Choisir un type" />
                  </SelectTrigger>
                  <SelectContent>
                    {simulationTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sim-desc">Description</Label>
                <Textarea
                  id="sim-desc"
                  placeholder="Decrivez votre projet ou scenario..."
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              {submitError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {submitError}
                </div>
              )}
              <Button
                className="w-full text-white"
                style={{ backgroundColor: "#C9A84C" }}
                onClick={handleCreateSimulation}
                disabled={submitting || !titre.trim() || !typeSimulation}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {submitting ? "Analyse en cours..." : "Analyser"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Simulation cards */}
      {simulations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">
              Aucune simulation pour le moment. Cliquez sur &quot;Nouvelle simulation&quot; pour tester l&apos;impact d&apos;une decision.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {simulations.map((sim) => {
            const scoreInfo = getScoreColor(sim.score_opportunite)
            const isGreen = (sim.score_opportunite ?? 0) >= 70
            const DirectionIcon = isGreen ? TrendingUp : TrendingDown
            return (
              <Card
                key={sim.id}
                className={isGreen ? "border-green-200" : "border-orange-200"}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                      {sim.type_simulation}
                    </Badge>
                    <Badge
                      className={
                        isGreen
                          ? "bg-green-100 text-green-700 border-green-200"
                          : "bg-orange-100 text-orange-700 border-orange-200"
                      }
                    >
                      {scoreInfo.label}
                    </Badge>
                  </div>
                  <CardTitle className="text-base mt-2" style={{ color: "#1E2A4A" }}>
                    {sim.titre}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {sim.recommandation && (
                    <div className="flex items-start gap-3">
                      <DirectionIcon
                        className="h-5 w-5 mt-0.5 shrink-0"
                        style={{ color: scoreInfo.color }}
                      />
                      <p className="text-sm text-muted-foreground">{sim.recommandation}</p>
                    </div>
                  )}

                  {/* Scenarios summary */}
                  {sim.scenario_base && (
                    <div className="text-xs text-muted-foreground space-y-1 bg-gray-50 p-2 rounded">
                      {sim.scenario_optimiste?.description && (
                        <p><span className="font-medium text-green-600">Optimiste:</span> {sim.scenario_optimiste.description}</p>
                      )}
                      {sim.scenario_base?.description && (
                        <p><span className="font-medium text-orange-600">Realiste:</span> {sim.scenario_base.description}</p>
                      )}
                      {sim.scenario_pessimiste?.description && (
                        <p><span className="font-medium text-red-600">Pessimiste:</span> {sim.scenario_pessimiste.description}</p>
                      )}
                    </div>
                  )}

                  {/* Score bar */}
                  {sim.score_opportunite !== null && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Score de viabilite</span>
                        <span className="font-semibold" style={{ color: "#1E2A4A" }}>
                          {sim.score_opportunite}/100
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${sim.score_opportunite}%`,
                            backgroundColor: scoreInfo.color,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Footer badge */}
      <div className="flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          L&apos;analyse est generee automatiquement par IA
        </p>
      </div>
    </div>
  )
}
