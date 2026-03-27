"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  ArrowLeft, Plus, Brain, TrendingUp, TrendingDown, CheckCircle2,
  Clock, AlertTriangle, X, BarChart3,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

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
const typeOptions = [
  { value: "nouveau_client", label: "Nouveau client" },
  { value: "embauche", label: "Embauche" },
  { value: "investissement", label: "Investissement" },
  { value: "emprunt", label: "Emprunt bancaire" },
  { value: "expansion", label: "Expansion" },
  { value: "reduction", label: "Réduction de coûts" },
]

export default function SimulationsPage() {
  const params = useParams()
  const clientId = params.clientId as string
  const societeId = params.societeId as string

  const [showDialog, setShowDialog] = useState(false)
  const [newSim, setNewSim] = useState({
    titre: "",
    type: "nouveau_client",
    description: "",
    parametres: "",
  })

  const simulations: Simulation[] = []

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
            Modélisez l&apos;impact de décisions stratégiques sur la trésorerie
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
              <Button variant="ghost" size="sm" onClick={() => setShowDialog(false)}>
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
                  placeholder="Décrivez le contexte et les hypothèses..."
                  value={newSim.description}
                  onChange={(e) => setNewSim({ ...newSim, description: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Paramètres</label>
                <textarea
                  className="border rounded-md px-3 py-2 w-full text-sm"
                  rows={2}
                  placeholder="Montant estimé, durée, nombre d'employés..."
                  value={newSim.parametres}
                  onChange={(e) => setNewSim({ ...newSim, parametres: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>
                  Annuler
                </Button>
                <Button
                  size="sm"
                  style={{ background: NAVY, color: "white" }}
                  onClick={() => setShowDialog(false)}
                >
                  <Brain className="w-4 h-4 mr-1" /> Analyser avec l&apos;IA
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Simulations list */}
      <div className="space-y-6">
        {simulations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <BarChart3 className="h-12 w-12 text-muted-foreground/40" />
              <p className="font-medium text-base">Aucune simulation</p>
              <p className="text-sm text-center">
                Créez votre première simulation pour modéliser l&apos;impact de décisions stratégiques sur la trésorerie.
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
                        {typeOptions.find((t) => t.value === sim.type)?.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500">{sim.description}</p>
                    <p className="text-xs text-gray-400 mt-1">Créée le {sim.date}</p>
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
                <Tabs defaultValue="impact" className="w-full">
                  <TabsList className="mb-3">
                    <TabsTrigger value="impact">Impact par compte</TabsTrigger>
                    <TabsTrigger value="scenarios">3 Scénarios</TabsTrigger>
                    <TabsTrigger value="analyse">Analyse IA</TabsTrigger>
                  </TabsList>

                  {/* Impact par compte */}
                  <TabsContent value="impact">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Compte bancaire</TableHead>
                          <TableHead className="text-right">Impact mensuel</TableHead>
                          <TableHead className="text-right">Tendance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sim.impacts.map((imp) => (
                          <TableRow key={imp.compte}>
                            <TableCell className="text-sm font-medium">{imp.compte}</TableCell>
                            <TableCell className={`text-right text-sm font-semibold ${imp.impact > 0 ? "text-green-600" : imp.impact < 0 ? "text-red-600" : "text-gray-400"}`}>
                              {imp.impact !== 0 ? (
                                <>
                                  {imp.impact > 0 ? "+" : ""}{fmt(imp.impact)}{imp.frequence}
                                </>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {imp.impact > 0 ? (
                                <TrendingUp className="w-4 h-4 text-green-600 inline" />
                              ) : imp.impact < 0 ? (
                                <TrendingDown className="w-4 h-4 text-red-600 inline" />
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TabsContent>

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
