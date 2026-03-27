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
  ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Brain, Landmark,
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
// Mock data
// ---------------------------------------------------------------------------
const periods = ["T2 2026", "T1 2026", "T4 2025"]

interface PrevisionRow {
  poste: string
  prevu: number
  reel: number
}

const previsionVsReel: PrevisionRow[] = [
  { poste: "Chiffre d'affaires", prevu: 1250000, reel: 1185000 },
  { poste: "Charges d'exploitation", prevu: 820000, reel: 795000 },
  { poste: "Masse salariale", prevu: 420000, reel: 420000 },
  { poste: "Charges sociales (CSG/NSF)", prevu: 85000, reel: 81050 },
  { poste: "TVA nette à payer", prevu: 125000, reel: 129540 },
  { poste: "Résultat net prévisionnel", prevu: 305000, reel: 278410 },
]

interface TresoCompteRow {
  compte: string
  devise: "MUR" | "EUR"
  actuel: number
  j30: number
  j60: number
  j90: number
}

const tresoParCompte: TresoCompteRow[] = [
  { compte: "MCB (Mauritius Commercial Bank)", devise: "MUR", actuel: 150000, j30: 135000, j60: 180000, j90: 210000 },
  { compte: "SBM (State Bank of Mauritius)", devise: "MUR", actuel: 65000, j30: 60000, j60: 70000, j90: 85000 },
  { compte: "CIC (Compte EUR)", devise: "EUR", actuel: 12000, j30: 11000, j60: 13000, j90: 15000 },
]

export default function PrevisionnelPage() {
  const params = useParams()
  const clientId = params.clientId as string
  const societeId = params.societeId as string
  const societeName = "TIBOK Ltd"

  const [selectedPeriod, setSelectedPeriod] = useState(periods[0])
  const [tauxChange, setTauxChange] = useState<Record<string, number>>({ EUR: 46.5, GBP: 54.2, USD: 44.8, MUR: 1 })

  useEffect(() => {
    fetch("/api/taux-change")
      .then(r => r.json())
      .then(data => { if (data.rates) setTauxChange(data.rates) })
      .catch(() => {})
  }, [])

  const totalMUR = (col: "actuel" | "j30" | "j60" | "j90") => {
    return tresoParCompte.reduce((s, r) => {
      const taux = tauxChange[r.devise] || 1
      return s + (r.devise !== "MUR" ? r[col] * taux : r[col])
    }, 0)
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

      {/* Prévision vs Réel */}
      <Card className="border-t-4" style={{ borderTopColor: NAVY }}>
        <CardHeader>
          <CardTitle style={{ color: NAVY }}>Prévision vs Réel</CardTitle>
        </CardHeader>
        <CardContent>
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
            Note : Les montants CIC en EUR sont convertis au taux de 46,50 MUR/EUR pour le total consolidé.
          </p>
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
          <div className="flex items-start gap-2">
            <TrendingUp className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-700">
              <strong>Tendance positive :</strong> La trésorerie consolidée devrait augmenter de
              36% sur les 90 prochains jours, passant de 773 000 MUR à environ 1 050 000 MUR.
              Le compte MCB montre la plus forte croissance (+40%), soutenu par les encaissements
              clients prévus en avril et mai.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <TrendingDown className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-700">
              <strong>Point d&apos;attention :</strong> Le compte SBM connaitra une baisse temporaire
              à J+30 (-7.7%) avant de se redresser. Ceci est lié au paiement des charges sociales
              CSG/NSF prévues le 15 du mois prochain. Recommandation : anticiper un virement
              interne MCB vers SBM de 20 000 MUR pour maintenir un coussin de sécurité.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <TrendingDown className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-700">
              <strong>Risque identifié :</strong> Le chiffre d&apos;affaires réel est inférieur
              de 5.2% au prévisionnel. Si cette tendance se poursuit, le résultat net annuel
              pourrait être impacté de -320 000 MUR. Surveiller les factures impayées
              (Swan Insurance : 109 250 MUR en retard de 41 jours).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
