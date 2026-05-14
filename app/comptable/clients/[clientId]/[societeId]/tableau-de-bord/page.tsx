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
import { t, getLocale } from '@/lib/i18n'

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
interface ScoreCard {
  titre: string
  score: string
  scoreColor: string
  items: { label: string; value: string; color: string }[]
  icon: React.ReactNode
}

export default function TableauDeBordPage() {
  const params = useParams()
  const locale = getLocale()
  const clientId = params.clientId as string
  const societeId = params.societeId as string
  const societeName = "TIBOK Ltd"

  const periods = [t('cabclt.tdb.period_mar2026', locale), t('cabclt.tdb.period_feb2026', locale), t('cabclt.tdb.period_jan2026', locale), t('cabclt.tdb.period_q4_2025', locale)]

  const quadrants: ScoreCard[] = [
    {
      titre: t('cabclt.tdb.quad_liquidity', locale),
      score: "A",
      scoreColor: "bg-green-100 text-green-700",
      icon: <Landmark className="w-5 h-5" />,
      items: [
        { label: t('cabclt.tdb.liq_ratio', locale), value: "2.4x", color: "text-green-600" },
        { label: t('cabclt.tdb.net_treasury', locale), value: "773 000 MUR", color: "text-green-600" },
        { label: t('cabclt.tdb.st_debt_coverage', locale), value: "1.8x", color: "text-green-600" },
      ],
    },
    {
      titre: t('cabclt.tdb.quad_profitability', locale),
      score: "B",
      scoreColor: "bg-orange-100 text-orange-700",
      icon: <TrendingUp className="w-5 h-5" />,
      items: [
        { label: t('cabclt.tdb.net_margin', locale), value: "12%", color: "text-orange-600" },
        { label: "EBITDA", value: "485 000 MUR", color: "text-orange-600" },
        { label: "ROE", value: "18%", color: "text-orange-600" },
      ],
    },
    {
      titre: t('cabclt.tdb.quad_structure', locale),
      score: "A",
      scoreColor: "bg-green-100 text-green-700",
      icon: <ShieldCheck className="w-5 h-5" />,
      items: [
        { label: t('cabclt.tdb.debt_equity', locale), value: "0.8x", color: "text-green-600" },
        { label: t('cabclt.tdb.fin_autonomy', locale), value: "55%", color: "text-green-600" },
        { label: t('cabclt.tdb.debt_capacity', locale), value: t('cabclt.tdb.good', locale), color: "text-green-600" },
      ],
    },
    {
      titre: t('cabclt.tdb.quad_efficiency', locale),
      score: "B",
      scoreColor: "bg-orange-100 text-orange-700",
      icon: <Zap className="w-5 h-5" />,
      items: [
        { label: t('cabclt.tdb.dso', locale), value: "42 " + t('cabclt.tdb.days', locale), color: "text-orange-600" },
        { label: t('cabclt.tdb.dpo', locale), value: "28 " + t('cabclt.tdb.days', locale), color: "text-green-600" },
        { label: "Runway", value: "5.7 " + t('cabclt.tdb.months', locale), color: "text-green-600" },
      ],
    },
  ]

  const tresorerieComptes = [
    { banque: "MCB", solde: 150000 },
    { banque: "SBM", solde: 65000 },
    { banque: "CIC (12 000 EUR = 558 000 MUR)", solde: 558000 },
  ]

  const [selectedPeriod, setSelectedPeriod] = useState(periods[0])

  const totalTresorerie = tresorerieComptes.reduce((s, c) => s + c.solde, 0)

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: "#F4F6FB" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Link href={`/comptable/clients/${clientId}/${societeId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> {t('cabclt.tdb.back', locale)}
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            {t('cabclt.tdb.title', locale)} — {societeName}
          </h1>
          <p className="text-sm text-gray-500">
            {t('cabclt.tdb.subtitle', locale)}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium" style={{ color: NAVY }}>{t('cabclt.tdb.period_label', locale)}</label>
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
          <RefreshCw className="w-4 h-4 mr-1" /> {t('cabclt.tdb.regenerate', locale)}
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="outline">
          <Send className="w-4 h-4 mr-1" /> {t('cabclt.tdb.publish', locale)}
        </Button>
      </div>

      {/* Score Global */}
      <Card className="border-l-4" style={{ borderLeftColor: GOLD }}>
        <CardContent className="flex items-center gap-6 py-5">
          <div className="flex flex-col items-center">
            <span className="text-xs font-medium text-gray-500 mb-1">{t('cabclt.tdb.global_score', locale)}</span>
            <span
              className="text-4xl font-black rounded-xl w-16 h-16 flex items-center justify-center text-green-700 bg-green-100"
            >
              A
            </span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold mb-1" style={{ color: NAVY }}>
              {t('cabclt.tdb.ai_advice', locale)}
            </p>
            <p className="text-sm text-gray-600">
              {t('cabclt.tdb.ai_advice_pre', locale)} {societeName} {t('cabclt.tdb.ai_advice_mid', locale)} {fmt(totalTresorerie)}. {t('cabclt.tdb.ai_advice_post', locale)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Trésorerie consolidée */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: NAVY }}>
            <Landmark className="w-5 h-5" />
            {t('cabclt.tdb.consolidated_treasury', locale)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 mb-4">
            <span className="text-3xl font-bold" style={{ color: NAVY }}>
              {fmt(totalTresorerie)}
            </span>
            <Badge className="bg-green-100 text-green-700 mb-1">
              <TrendingUp className="w-3 h-3 mr-1" /> +8.2% {t('cabclt.tdb.vs_prev_month', locale)}
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
