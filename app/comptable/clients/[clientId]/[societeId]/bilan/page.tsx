"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table"
import {
  ArrowLeft, FileText, Download, Send, Pencil, CheckCircle2, Landmark,
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
const exercises = ["2025-2026", "2024-2025", "2023-2024"]

const statuses: Record<string, { label: string; color: string }> = {
  brouillon: { label: "Brouillon", color: "bg-orange-100 text-orange-700" },
  finalise: { label: "Finalisé", color: "bg-blue-100 text-blue-700" },
  audite: { label: "Audité", color: "bg-green-100 text-green-700" },
}

const actifNonCourant = [
  { compte: "Immobilisations corporelles", montant: 850000 },
  { compte: "Immobilisations incorporelles", montant: 350000 },
  { compte: "Amortissements cumulés", montant: -275000 },
]

const actifCourant = [
  { compte: "Créances clients", montant: 396000 },
  { compte: "Stocks", montant: 124000 },
  { compte: "Trésorerie et équivalents", montant: 773000 },
]

const tresorerieDetail = [
  { banque: "MCB (Mauritius Commercial Bank)", montant: 150000 },
  { banque: "SBM (State Bank of Mauritius)", montant: 65000 },
  { banque: "CIC (Compte EUR converti)", montant: 558000 },
]

const capitauxPropres = [
  { compte: "Capital social", montant: 100000 },
  { compte: "Réserves légales", montant: 85000 },
  { compte: "Report à nouveau", montant: 2800000 },
]

const passifCourant = [
  { compte: "Fournisseurs", montant: 228000 },
  { compte: "TVA à payer", montant: 129000 },
  { compte: "CSG / NSF à payer", montant: 81000 },
]

export default function BilanOfficielPage() {
  const params = useParams()
  const clientId = params.clientId as string
  const societeId = params.societeId as string
  const societeName = "TIBOK Ltd"

  const [selectedExercise, setSelectedExercise] = useState(exercises[0])
  const [status, setStatus] = useState<"brouillon" | "finalise" | "audite">("brouillon")

  const totalActifNonCourant = actifNonCourant.reduce((s, r) => s + r.montant, 0)
  const totalActifCourant = actifCourant.reduce((s, r) => s + r.montant, 0)
  const totalActif = totalActifNonCourant + totalActifCourant

  const totalCapitaux = capitauxPropres.reduce((s, r) => s + r.montant, 0)
  const totalPassifCourant = passifCourant.reduce((s, r) => s + r.montant, 0)
  const totalPassif = totalCapitaux + totalPassifCourant

  const equilibre = totalActif === totalPassif

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
            Bilan Officiel — {societeName}
          </h1>
          <p className="text-sm text-gray-500">
            Vue consolidée des actifs et passifs
          </p>
        </div>
        <Badge className={statuses[status].color}>{statuses[status].label}</Badge>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium" style={{ color: NAVY }}>Exercice :</label>
          <select
            value={selectedExercise}
            onChange={(e) => setSelectedExercise(e.target.value)}
            className="border rounded-md px-3 py-1.5 text-sm"
          >
            {exercises.map((ex) => (
              <option key={ex} value={ex}>{ex}</option>
            ))}
          </select>
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setStatus("brouillon")}>
          <Pencil className="w-4 h-4 mr-1" /> Modifier
        </Button>
        <Button
          size="sm"
          style={{ background: GOLD, color: NAVY }}
          onClick={() => setStatus("finalise")}
        >
          <CheckCircle2 className="w-4 h-4 mr-1" /> Finaliser
        </Button>
        <Button size="sm" variant="outline">
          <Send className="w-4 h-4 mr-1" /> Publier au client
        </Button>
        <Button size="sm" variant="outline">
          <Download className="w-4 h-4 mr-1" /> Exporter PDF
        </Button>
      </div>

      {/* Equilibré badge */}
      {equilibre && (
        <div className="flex justify-center">
          <Badge className="bg-green-100 text-green-700 text-base px-4 py-1">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Équilibré — Total Actif = Total Passif = {fmt(totalActif)}
          </Badge>
        </div>
      )}

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ACTIF */}
        <Card className="border-t-4" style={{ borderTopColor: NAVY }}>
          <CardHeader>
            <CardTitle style={{ color: NAVY }}>ACTIF</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Non-courant */}
            <div>
              <h3 className="font-semibold text-sm mb-2" style={{ color: NAVY }}>
                Actif non courant
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Compte</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actifNonCourant.map((r) => (
                    <TableRow key={r.compte}>
                      <TableCell className="text-sm">{r.compte}</TableCell>
                      <TableCell className={`text-right text-sm font-medium ${r.montant < 0 ? "text-red-600" : ""}`}>
                        {fmt(r.montant)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-bold">Sous-total</TableCell>
                    <TableCell className="text-right font-bold">{fmt(totalActifNonCourant)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            {/* Courant */}
            <div>
              <h3 className="font-semibold text-sm mb-2" style={{ color: NAVY }}>
                Actif courant
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Compte</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actifCourant.map((r) => (
                    <TableRow key={r.compte}>
                      <TableCell className="text-sm">{r.compte}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{fmt(r.montant)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-bold">Sous-total</TableCell>
                    <TableCell className="text-right font-bold">{fmt(totalActifCourant)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            {/* Total Actif */}
            <div className="rounded-lg p-3" style={{ background: NAVY }}>
              <div className="flex justify-between text-white font-bold text-lg">
                <span>TOTAL ACTIF</span>
                <span>{fmt(totalActif)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PASSIF */}
        <Card className="border-t-4" style={{ borderTopColor: GOLD }}>
          <CardHeader>
            <CardTitle style={{ color: NAVY }}>PASSIF</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Capitaux Propres */}
            <div>
              <h3 className="font-semibold text-sm mb-2" style={{ color: NAVY }}>
                Capitaux propres
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Compte</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {capitauxPropres.map((r) => (
                    <TableRow key={r.compte}>
                      <TableCell className="text-sm">{r.compte}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{fmt(r.montant)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-bold">Sous-total</TableCell>
                    <TableCell className="text-right font-bold">{fmt(totalCapitaux)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            {/* Passif courant */}
            <div>
              <h3 className="font-semibold text-sm mb-2" style={{ color: NAVY }}>
                Passif courant
              </h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Compte</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {passifCourant.map((r) => (
                    <TableRow key={r.compte}>
                      <TableCell className="text-sm">{r.compte}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{fmt(r.montant)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-bold">Sous-total</TableCell>
                    <TableCell className="text-right font-bold">{fmt(totalPassifCourant)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            {/* Total Passif */}
            <div className="rounded-lg p-3" style={{ background: NAVY }}>
              <div className="flex justify-between text-white font-bold text-lg">
                <span>TOTAL PASSIF</span>
                <span>{fmt(totalPassif)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trésorerie note */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: NAVY }}>
            <Landmark className="w-5 h-5" />
            Note : Détail de la Trésorerie
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 mb-3">
            Ventilation du poste &quot;Trésorerie et équivalents&quot; par compte bancaire :
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Compte bancaire</TableHead>
                <TableHead className="text-right">Solde</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tresorerieDetail.map((r) => (
                <TableRow key={r.banque}>
                  <TableCell className="text-sm">{r.banque}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{fmt(r.montant)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-bold">Total trésorerie</TableCell>
                <TableCell className="text-right font-bold">
                  {fmt(tresorerieDetail.reduce((s, r) => s + r.montant, 0))}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <p className="text-xs text-gray-400 mt-2">
            Note : Le compte CIC est libellé en EUR (12 000 EUR). Conversion au taux de 46,50 MUR/EUR.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
