"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Download, Eye, TrendingUp, TrendingDown } from "lucide-react"

function formatMUR(amount: number) {
  return new Intl.NumberFormat("fr-MU", { style: "decimal", minimumFractionDigits: 0 }).format(amount) + " MUR"
}

const mockRapports = [
  { id: "1", client: "Jean-Pierre Dupont", societe: "TIBOK", periode: "Mars 2026", ca: 850000, charges: 620000, ebitda: 230000, statut: "genere" },
  { id: "2", client: "Marie Curie", societe: "BPO", periode: "Mars 2026", ca: 420000, charges: 380000, ebitda: 40000, statut: "genere" },
  { id: "3", client: "Ahmed Hassan", societe: "Obesity Care Malta", periode: "Mars 2026", ca: 1200000, charges: 950000, ebitda: 250000, statut: "en_attente" },
  { id: "4", client: "Sophie Martin", societe: "NHS S2", periode: "Mars 2026", ca: 680000, charges: 590000, ebitda: 90000, statut: "genere" },
  { id: "5", client: "Jean-Pierre Dupont", societe: "TIBOK", periode: "Février 2026", ca: 780000, charges: 600000, ebitda: 180000, statut: "genere" },
  { id: "6", client: "Marie Curie", societe: "BPO", periode: "Février 2026", ca: 390000, charges: 370000, ebitda: 20000, statut: "genere" },
]

export default function ComptableRapportsPage() {
  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Rapports P&L</h1>
        <p className="text-muted-foreground">Rapports mensuels de compte de résultat</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{mockRapports.length}</div>
            <p className="text-sm text-muted-foreground">Total rapports</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{formatMUR(mockRapports.reduce((s, r) => s + r.ca, 0))}</div>
            <p className="text-sm text-muted-foreground">CA Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold" style={{ color: "#C9A84C" }}>{formatMUR(mockRapports.reduce((s, r) => s + r.ebitda, 0))}</div>
            <p className="text-sm text-muted-foreground">EBITDA Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">{mockRapports.filter((r) => r.statut === "en_attente").length}</div>
            <p className="text-sm text-muted-foreground">En attente</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Société</TableHead>
                <TableHead>Période</TableHead>
                <TableHead className="text-right">Chiffre d&apos;affaires</TableHead>
                <TableHead className="text-right">Charges</TableHead>
                <TableHead className="text-right">EBITDA</TableHead>
                <TableHead>Marge</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockRapports.map((r) => {
                const marge = ((r.ebitda / r.ca) * 100).toFixed(1)
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.client}</TableCell>
                    <TableCell>{r.societe}</TableCell>
                    <TableCell>{r.periode}</TableCell>
                    <TableCell className="text-right text-green-700">{formatMUR(r.ca)}</TableCell>
                    <TableCell className="text-right text-red-600">{formatMUR(r.charges)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatMUR(r.ebitda)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {Number(marge) > 15 ? <TrendingUp className="h-4 w-4 text-green-600" /> : <TrendingDown className="h-4 w-4 text-orange-500" />}
                        <span className={Number(marge) > 15 ? "text-green-600" : "text-orange-500"}>{marge}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.statut === "genere" ? (
                        <Badge className="bg-green-100 text-green-800">Généré</Badge>
                      ) : (
                        <Badge className="bg-yellow-100 text-yellow-800">En attente</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon"><Download className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
