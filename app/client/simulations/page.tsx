"use client"

import { useState } from "react"
import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
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
} from "lucide-react"

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface Simulation {
  id: number
  titre: string
  type: string
  impact: string
  score: number
  badge: { label: string; color: "green" | "orange" }
  direction: "up" | "down"
}

const simulations: Simulation[] = []

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

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "#1E2A4A" }}>
          Accès non autorisé
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;accéder à cette page.
        </p>
        <Link href="/client/documents" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour aux documents
        </Link>
      </div>
    )
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
            Testez l&apos;impact de vos décisions sur votre trésorerie
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: "#C9A84C" }} className="text-white">
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
                <Input id="sim-titre" placeholder="Ex : Nouveau contrat Rogers" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sim-type">Type</Label>
                <Select>
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
                  placeholder="Décrivez votre projet ou scénario..."
                  rows={3}
                />
              </div>
              <Button
                className="w-full text-white"
                style={{ backgroundColor: "#C9A84C" }}
                onClick={() => setDialogOpen(false)}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Analyser
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
              Aucune simulation pour le moment. Cliquez sur &quot;Nouvelle simulation&quot; pour tester l&apos;impact d&apos;une décision.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {simulations.map((sim) => {
            const isGreen = sim.badge.color === "green"
            const DirectionIcon = sim.direction === "up" ? TrendingUp : TrendingDown
            return (
              <Card
                key={sim.id}
                className={isGreen ? "border-green-200" : "border-orange-200"}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                      {sim.type}
                    </Badge>
                    <Badge
                      className={
                        isGreen
                          ? "bg-green-100 text-green-700 border-green-200"
                          : "bg-orange-100 text-orange-700 border-orange-200"
                      }
                    >
                      {sim.badge.label}
                    </Badge>
                  </div>
                  <CardTitle className="text-base mt-2" style={{ color: "#1E2A4A" }}>
                    {sim.titre}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <DirectionIcon
                      className="h-5 w-5 mt-0.5 shrink-0"
                      style={{ color: isGreen ? "#16a34a" : "#ea580c" }}
                    />
                    <p className="text-sm text-muted-foreground">{sim.impact}</p>
                  </div>

                  {/* Score bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Score</span>
                      <span className="font-semibold" style={{ color: "#1E2A4A" }}>
                        {sim.score}/100
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${sim.score}%`,
                          backgroundColor: isGreen ? "#16a34a" : "#ea580c",
                        }}
                      />
                    </div>
                  </div>
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
          L&apos;analyse est générée automatiquement
        </p>
      </div>
    </div>
  )
}
