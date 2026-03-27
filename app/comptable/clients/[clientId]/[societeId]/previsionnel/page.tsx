"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table"
import {
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Brain, Landmark, Loader2,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

function fmt(n: number) {
  return n.toLocaleString("fr-FR") + " MUR"
}

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR") + " EUR"
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PrevisionRow {
  poste: string
  prevu: number
  reel: number
}

interface TresoCompteRow {
  compte: string
  devise: "MUR" | "EUR"
  actuel: number
  j30: number
  j60: number
  j90: number
}

interface AnalyseIA {
  type: "positive" | "attention" | "risque"
  texte: string
}

interface PrevisionnelData {
  societeName: string
  periods: string[]
  previsionVsReel: PrevisionRow[]
  tresoParCompte: TresoCompteRow[]
  analyseIA: AnalyseIA[]
}

export default function PrevisionnelPage() {
  const params = useParams()
  const clientId = params.clientId as string
  const societeId = params.societeId as string

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<PrevisionnelData | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState("")
  const [tauxChange, setTauxChange] = useState<Record<string, number>>({ EUR: 46.5, GBP: 54.2, USD: 44.8, MUR: 1 })

  useEffect(() => {
    fetch("/api/taux-change")
      .then(r => r.json())
      .then(d => { if (d.rates) setTauxChange(d.rates) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/comptable/clients/${clientId}/${societeId}/previsionnel`)
        if (res.ok) {
          const json = await res.json()
          if (json.data) {
            setData(json.data)
            if (json.data.periods?.length > 0) {
              setSelectedPeriod(json.data.periods[0])
            }
          }
        }
      } catch {
        // API not available
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [clientId, societeId])

  const previsionVsReel = data?.previsionVsReel || []
  const tresoParCompte = data?.tresoParCompte || []
  const periods = data?.periods || []
  const analyseIA = data?.analyseIA || []
  const societeName = data?.societeName || societeId

  const totalMUR = (col: "actuel" | "j30" | "j60" | "j90") => {
    return tresoParCompte.reduce((s, r) => {
      const taux = tauxChange[r.devise] || 1
      return s + (r.devise !== "MUR" ? r[col] * taux : r[col])
    }, 0)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    )
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
            Prévisionnel — {societeName}
          </h1>
          <p className="text-sm text-gray-500">
            Projections financières et trésorerie prévisionnelle
          </p>
        </div>
      </div>

      {/* Controls */}
      {periods.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium" style={{ color: NAVY }}>Période :</label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="border rounded-md px-3 py-1.5 text-sm"
            >
              {periods.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-1" /> Regénérer
          </Button>
        </div>
      )}

      {/* Prévision vs Réel */}
      <Card className="border-t-4" style={{ borderTopColor: NAVY }}>
        <CardHeader>
          <CardTitle style={{ color: NAVY }}>Prévision vs Réel</CardTitle>
        </CardHeader>
        <CardContent>
          {previsionVsReel.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Aucune donnée prévisionnelle disponible.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Poste</TableHead>
                  <TableHead className="text-right">Prévu</TableHead>
                  <TableHead className="text-right">Réel</TableHead>
                  <TableHead className="text-right">Écart</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previsionVsReel.map((r) => {
                  const ecart = r.reel - r.prevu
                  const pct = r.prevu !== 0 ? ((ecart / r.prevu) * 100) : 0
                  const isRevenue = r.poste === "Chiffre d'affaires" || r.poste === "Résultat net prévisionnel"
                  const ecartPositif = isRevenue ? ecart >= 0 : ecart <= 0
                  return (
                    <TableRow key={r.poste}>
                      <TableCell className="text-sm font-medium">{r.poste}</TableCell>
                      <TableCell className="text-right text-sm">{fmt(r.prevu)}</TableCell>
                      <TableCell className="text-right text-sm">{fmt(r.reel)}</TableCell>
                      <TableCell className={`text-right text-sm font-semibold ${ecartPositif ? "text-green-600" : "text-red-600"}`}>
                        {ecart >= 0 ? "+" : ""}{fmt(ecart)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <Badge className={ecartPositif ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                          {ecart >= 0 ? "+" : ""}{pct.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Trésorerie par compte */}
      <Card className="border-t-4" style={{ borderTopColor: GOLD }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: NAVY }}>
            <Landmark className="w-5 h-5" />
            Trésorerie prévisionnelle par compte
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tresoParCompte.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Aucune donnée de trésorerie disponible.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Compte</TableHead>
                    <TableHead className="text-right">Actuel</TableHead>
                    <TableHead className="text-right">+30 jours</TableHead>
                    <TableHead className="text-right">+60 jours</TableHead>
                    <TableHead className="text-right">+90 jours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tresoParCompte.map((r) => {
                    const f = r.devise === "EUR" ? fmtEur : fmt
                    return (
                      <TableRow key={r.compte}>
                        <TableCell className="text-sm font-medium">{r.compte}</TableCell>
                        <TableCell className="text-right text-sm">{f(r.actuel)}</TableCell>
                        <TableCell className={`text-right text-sm ${r.j30 < r.actuel ? "text-red-600" : "text-green-600"}`}>
                          {f(r.j30)}
                        </TableCell>
                        <TableCell className={`text-right text-sm ${r.j60 < r.actuel ? "text-red-600" : "text-green-600"}`}>
                          {f(r.j60)}
                        </TableCell>
                        <TableCell className={`text-right text-sm ${r.j90 < r.actuel ? "text-red-600" : "text-green-600"}`}>
                          {f(r.j90)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-bold">TOTAL (en MUR)</TableCell>
                    <TableCell className="text-right font-bold">{fmt(totalMUR("actuel"))}</TableCell>
                    <TableCell className="text-right font-bold">{fmt(totalMUR("j30"))}</TableCell>
                    <TableCell className="text-right font-bold">{fmt(totalMUR("j60"))}</TableCell>
                    <TableCell className="text-right font-bold">{fmt(totalMUR("j90"))}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
              <p className="text-xs text-gray-400 mt-2">
                Note : Les montants en devises étrangères sont convertis au taux du jour pour le total consolidé.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Analyse IA */}
      <Card className="border-l-4" style={{ borderLeftColor: GOLD }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: NAVY }}>
            <Brain className="w-5 h-5" />
            Analyse IA — Prévisions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {analyseIA.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Aucune analyse disponible. Les analyses seront générées une fois les données prévisionnelles saisies.
            </p>
          ) : (
            analyseIA.map((item, i) => {
              const Icon = item.type === "positive" ? TrendingUp : TrendingDown
              const iconColor = item.type === "positive" ? "text-green-600" : item.type === "attention" ? "text-orange-600" : "text-red-600"
              return (
                <div key={i} className="flex items-start gap-2">
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
                  <p className="text-sm text-gray-700">{item.texte}</p>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
