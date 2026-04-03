"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft, RefreshCw, Send, TrendingUp, TrendingDown, Landmark,
  ShieldCheck, BarChart3, Zap, Clock,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return n.toLocaleString("fr-FR") + " MUR"
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
const periods = ["Mars 2026", "Février 2026", "Janvier 2026", "T4 2025"]

interface ScoreCard {
  titre: string
  score: string
  scoreColor: string
  items: { label: string; value: string; color: string }[]
  icon: React.ReactNode
}

const quadrants: ScoreCard[] = [
  {
    titre: "Liquidité",
    score: "A",
    scoreColor: "bg-green-100 text-green-700",
    icon: <Landmark className="w-5 h-5" />,
    items: [
      { label: "Ratio de liquidité", value: "2.4x", color: "text-green-600" },
      { label: "Trésorerie nette", value: "773 000 MUR", color: "text-green-600" },
      { label: "Couverture dettes CT", value: "1.8x", color: "text-green-600" },
    ],
  },
  {
    titre: "Rentabilité",
    score: "B",
    scoreColor: "bg-orange-100 text-orange-700",
    icon: <TrendingUp className="w-5 h-5" />,
    items: [
      { label: "Marge nette", value: "12%", color: "text-orange-600" },
      { label: "EBITDA", value: "485 000 MUR", color: "text-orange-600" },
      { label: "ROE", value: "18%", color: "text-orange-600" },
    ],
  },
  {
    titre: "Structure Financière",
    score: "A",
    scoreColor: "bg-green-100 text-green-700",
    icon: <ShieldCheck className="w-5 h-5" />,
    items: [
      { label: "Dettes / Capitaux propres", value: "0.8x", color: "text-green-600" },
      { label: "Autonomie financière", value: "55%", color: "text-green-600" },
      { label: "Capacité d'endettement", value: "Bonne", color: "text-green-600" },
    ],
  },
  {
    titre: "Efficacité Opérationnelle",
    score: "B",
    scoreColor: "bg-orange-100 text-orange-700",
    icon: <Zap className="w-5 h-5" />,
    items: [
      { label: "DSO (Délai encaissement)", value: "42 jours", color: "text-orange-600" },
      { label: "DPO (Délai paiement)", value: "28 jours", color: "text-green-600" },
      { label: "Runway", value: "5.7 mois", color: "text-green-600" },
    ],
  },
]

const tresorerieComptes = [
  { banque: "MCB", solde: 150000 },
  { banque: "SBM", solde: 65000 },
  { banque: "CIC (12 000 EUR = 558 000 MUR)", solde: 558000 },
]

export default function TableauDeBordPage() {
  const params = useParams()
  const clientId = params.clientId as string
  const societeId = params.societeId as string
  const societeName = "TIBOK Ltd"

  const [selectedPeriod, setSelectedPeriod] = useState(periods[0])

  const totalTresorerie = tresorerieComptes.reduce((s, c) => s + c.solde, 0)

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
            Tableau de Bord Financier — {societeName}
          </h1>
          <p className="text-sm text-gray-500">
            Analyse consolidée de la santé financière
          </p>
        </div>
      </div>

      {/* Controls */}
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
        <div className="flex-1" />
        <Button size="sm" variant="outline">
          <Send className="w-4 h-4 mr-1" /> Publier au client
        </Button>
      </div>

      {/* Score Global */}
      <Card className="border-l-4" style={{ borderLeftColor: GOLD }}>
        <CardContent className="flex items-center gap-6 py-5">
          <div className="flex flex-col items-center">
            <span className="text-xs font-medium text-gray-500 mb-1">Score Global</span>
            <span
              className="text-4xl font-black rounded-xl w-16 h-16 flex items-center justify-center text-green-700 bg-green-100"
            >
              A
            </span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold mb-1" style={{ color: NAVY }}>
              Conseil IA
            </p>
            <p className="text-sm text-gray-600">
              La société {societeName} présente une situation financière saine avec une trésorerie
              confortable de {fmt(totalTresorerie)}. Le ratio de liquidité de 2.4x est excellent.
              Points d&apos;attention : la marge nette de 12% est en dessous de la moyenne sectorielle
              (15%) et le DSO de 42 jours pourrait être optimisé. Recommandation : accélérer le
              recouvrement des créances et revoir la politique tarifaire.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Trésorerie consolidée */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: NAVY }}>
            <Landmark className="w-5 h-5" />
            Trésorerie consolidée
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 mb-4">
            <span className="text-3xl font-bold" style={{ color: NAVY }}>
              {fmt(totalTresorerie)}
            </span>
            <Badge className="bg-green-100 text-green-700 mb-1">
              <TrendingUp className="w-3 h-3 mr-1" /> +8.2% vs mois précédent
            </Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {tresorerieComptes.map((c) => (
              <div
                key={c.banque}
                className="rounded-lg border p-3 flex flex-col"
              >
                <span className="text-xs text-gray-500 font-medium">{c.banque}</span>
                <span className="text-lg font-bold" style={{ color: NAVY }}>
                  {fmt(c.solde)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 4 quadrants */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {quadrants.map((q) => (
          <Card key={q.titre} className="border-t-4" style={{ borderTopColor: NAVY }}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base" style={{ color: NAVY }}>
                  {q.icon}
                  {q.titre}
                </CardTitle>
                <Badge className={q.scoreColor + " text-lg font-bold px-3"}>
                  {q.score}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {q.items.map((item) => (
                  <div key={item.label} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{item.label}</span>
                    <span className={`text-sm font-semibold ${item.color}`}>
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
