"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TrendingUp, TrendingDown, DollarSign, Users } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

function formatMUR(amount: number) {
  return amount.toLocaleString("fr-FR") + " MUR"
}

const months = [
  "Mars 2026",
  "Février 2026",
  "Janvier 2026",
  "Décembre 2025",
  "Novembre 2025",
  "Octobre 2025",
]

const revenueData = [
  { categorie: "Consultations B2C", montant: 120000 },
  { categorie: "Forfaits B2B", montant: 450000 },
  { categorie: "Autres revenus", montant: 80000 },
]

const expenseData = [
  { categorie: "Salaires", montant: 85000 },
  { categorie: "Technologie", montant: 15000 },
  { categorie: "Marketing", montant: 10000 },
  { categorie: "Loyer", montant: 25000 },
]

const annualRevenues = [
  { categorie: "Consultations B2C", montant: 1440000 },
  { categorie: "Forfaits B2B", montant: 5400000 },
  { categorie: "Autres revenus", montant: 960000 },
]

const annualExpenses = [
  { categorie: "Salaires", montant: 1020000 },
  { categorie: "Technologie", montant: 180000 },
  { categorie: "Marketing", montant: 120000 },
  { categorie: "Loyer", montant: 300000 },
]

const tvaData = [
  { mois: "Mars 2026", collectee: 97500, deductible: 20250, solde: 77250, statut: "a_payer", deadline: "20 avril 2026" },
  { mois: "Février 2026", collectee: 91000, deductible: 18900, solde: 72100, statut: "paye", deadline: "20 mars 2026" },
  { mois: "Janvier 2026", collectee: 88000, deductible: 17500, solde: 70500, statut: "paye", deadline: "20 février 2026" },
  { mois: "Décembre 2025", collectee: 102000, deductible: 21000, solde: 81000, statut: "paye", deadline: "20 janvier 2026" },
  { mois: "Novembre 2025", collectee: 85000, deductible: 16800, solde: 68200, statut: "paye", deadline: "20 décembre 2025" },
  { mois: "Octobre 2025", collectee: 79000, deductible: 15500, solde: 63500, statut: "paye", deadline: "20 novembre 2025" },
]

const salairesData = [
  { mois: "Mars 2026", nbEmployes: 5, salairesNets: 310000, csgNsf: 15500, paye: 28500, total: 354000 },
  { mois: "Février 2026", nbEmployes: 5, salairesNets: 310000, csgNsf: 15500, paye: 28500, total: 354000 },
  { mois: "Janvier 2026", nbEmployes: 5, salairesNets: 305000, csgNsf: 15250, paye: 27800, total: 348050 },
  { mois: "Décembre 2025", nbEmployes: 4, salairesNets: 260000, csgNsf: 13000, paye: 23500, total: 296500 },
  { mois: "Novembre 2025", nbEmployes: 4, salairesNets: 258000, csgNsf: 12900, paye: 23200, total: 294100 },
  { mois: "Octobre 2025", nbEmployes: 4, salairesNets: 255000, csgNsf: 12750, paye: 22800, total: 290550 },
]

function getTvaStatutBadge(statut: string) {
  switch (statut) {
    case "a_payer":
      return <Badge className="bg-orange-100 text-orange-700 border-orange-200">A payer</Badge>
    case "paye":
      return <Badge className="bg-green-100 text-green-700 border-green-200">Payé</Badge>
    default:
      return <Badge variant="secondary">{statut}</Badge>
  }
}

export default function FinancesPage() {
  const { profile } = useProfile()
  const [selectedMonth, setSelectedMonth] = useState("Mars 2026")

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "#1E2A4A" }}>
          Accès non autorisé
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;accéder à cette page.
        </p>
        <Link href="/client/upload" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour à l&apos;envoi de documents
        </Link>
      </div>
    )
  }

  const totalRevenues = revenueData.reduce((sum, r) => sum + r.montant, 0)
  const totalExpenses = expenseData.reduce((sum, e) => sum + e.montant, 0)
  const result = totalRevenues - totalExpenses

  const totalAnnualRevenues = annualRevenues.reduce((sum, r) => sum + r.montant, 0)
  const totalAnnualExpenses = annualExpenses.reduce((sum, e) => sum + e.montant, 0)
  const annualResult = totalAnnualRevenues - totalAnnualExpenses

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Mes Chiffres
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suivez vos revenus, vos dépenses, la TVA et les salaires en un coup d&apos;oeil.
        </p>
      </div>

      <Tabs defaultValue="mensuel">
        <TabsList>
          <TabsTrigger value="mensuel">Mes Chiffres</TabsTrigger>
          <TabsTrigger value="tva">Ma TVA</TabsTrigger>
          <TabsTrigger value="salaires">Salaires &amp; Charges</TabsTrigger>
        </TabsList>

        {/* Tab 1 - Vue mensuelle */}
        <TabsContent value="mensuel" className="space-y-6">
          <div className="flex items-center gap-4 mt-4">
            <span className="text-sm font-medium" style={{ color: "#1E2A4A" }}>Mois :</span>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total revenus
                </CardTitle>
                <TrendingUp className="h-5 w-5" style={{ color: "#22C55E" }} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
                  {formatMUR(totalRevenues)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total dépenses
                </CardTitle>
                <TrendingDown className="h-5 w-5" style={{ color: "#EF4444" }} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
                  {formatMUR(totalExpenses)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Résultat du mois
                </CardTitle>
                <DollarSign className="h-5 w-5" style={{ color: "#C9A84C" }} />
              </CardHeader>
              <CardContent>
                <div
                  className="text-2xl font-bold"
                  style={{ color: result >= 0 ? "#22C55E" : "#EF4444" }}
                >
                  {result >= 0 ? "+" : ""}{formatMUR(result)}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle style={{ color: "#1E2A4A" }}>
                  Revenus — {selectedMonth}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Catégorie</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revenueData.map((row) => (
                      <TableRow key={row.categorie}>
                        <TableCell className="font-medium">{row.categorie}</TableCell>
                        <TableCell className="text-right text-green-600 font-semibold">
                          {formatMUR(row.montant)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2">
                      <TableCell className="font-bold" style={{ color: "#1E2A4A" }}>Total</TableCell>
                      <TableCell className="text-right font-bold text-green-600">
                        {formatMUR(totalRevenues)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle style={{ color: "#1E2A4A" }}>
                  Dépenses — {selectedMonth}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Catégorie</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenseData.map((row) => (
                      <TableRow key={row.categorie}>
                        <TableCell className="font-medium">{row.categorie}</TableCell>
                        <TableCell className="text-right text-red-600 font-semibold">
                          {formatMUR(row.montant)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2">
                      <TableCell className="font-bold" style={{ color: "#1E2A4A" }}>Total</TableCell>
                      <TableCell className="text-right font-bold text-red-600">
                        {formatMUR(totalExpenses)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="py-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Résultat net du mois</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Ce que votre société a gagné après avoir payé toutes ses dépenses.
                  </p>
                </div>
                <div
                  className="text-3xl font-bold"
                  style={{ color: result >= 0 ? "#22C55E" : "#EF4444" }}
                >
                  {result >= 0 ? "+" : ""}{formatMUR(result)}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2 - Ma TVA */}
        <TabsContent value="tva" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle style={{ color: "#1E2A4A" }}>Suivi de la TVA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mois</TableHead>
                    <TableHead className="text-right">TVA collectée</TableHead>
                    <TableHead className="text-right">TVA déductible</TableHead>
                    <TableHead className="text-right">Je dois</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Deadline</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tvaData.map((row) => (
                    <TableRow key={row.mois}>
                      <TableCell className="font-medium">{row.mois}</TableCell>
                      <TableCell className="text-right">{formatMUR(row.collectee)}</TableCell>
                      <TableCell className="text-right">{formatMUR(row.deductible)}</TableCell>
                      <TableCell className="text-right font-semibold" style={{ color: "#1E2A4A" }}>
                        {formatMUR(row.solde)}
                      </TableCell>
                      <TableCell>{getTvaStatutBadge(row.statut)}</TableCell>
                      <TableCell className="text-sm">{row.deadline}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="rounded-lg border p-4 bg-blue-50/50">
                <p className="text-sm" style={{ color: "#1E2A4A" }}>
                  <strong>Comment ça marche ?</strong>
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  La TVA collectée est celle que vos clients vous ont payée en plus de vos prix.
                  La TVA déductible est celle que vous avez payée sur vos achats professionnels.
                  La différence (&quot;Je dois&quot;) est ce que vous devez reverser à la MRA chaque mois.
                  Votre comptable s&apos;occupe de faire la déclaration pour vous.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4 - Salaires & Charges */}
        <TabsContent value="salaires" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5" style={{ color: "#1E2A4A" }} />
                <CardTitle style={{ color: "#1E2A4A" }}>Salaires &amp; Charges mensuels</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mois</TableHead>
                    <TableHead className="text-right">Nb employés</TableHead>
                    <TableHead className="text-right">Salaires nets</TableHead>
                    <TableHead className="text-right">CSG / NSF</TableHead>
                    <TableHead className="text-right">PAYE</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salairesData.map((row) => (
                    <TableRow key={row.mois}>
                      <TableCell className="font-medium">{row.mois}</TableCell>
                      <TableCell className="text-right">{row.nbEmployes}</TableCell>
                      <TableCell className="text-right">{formatMUR(row.salairesNets)}</TableCell>
                      <TableCell className="text-right">{formatMUR(row.csgNsf)}</TableCell>
                      <TableCell className="text-right">{formatMUR(row.paye)}</TableCell>
                      <TableCell className="text-right font-bold" style={{ color: "#1E2A4A" }}>
                        {formatMUR(row.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
