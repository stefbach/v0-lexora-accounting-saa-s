"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Download, Eye, TrendingUp, TrendingDown, BarChart3 } from "lucide-react"

function formatMUR(amount: number) {
  return new Intl.NumberFormat("fr-MU", { style: "decimal", minimumFractionDigits: 0 }).format(amount) + " MUR"
}

interface Rapport {
  id: string
  client: string
  societe: string
  periode: string
  ca: number
  charges: number
  ebitda: number
  statut: string
}

export default function ComptableRapportsPage() {
  const rapports: Rapport[] = []

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Rapports P&L</h1>
        <p className="text-muted-foreground">Rapports mensuels de compte de résultat</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{rapports.length}</div>
            <p className="text-sm text-muted-foreground">Total rapports</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{formatMUR(rapports.reduce((s, r) => s + r.ca, 0))}</div>
            <p className="text-sm text-muted-foreground">CA Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold" style={{ color: "#C9A84C" }}>{formatMUR(rapports.reduce((s, r) => s + r.ebitda, 0))}</div>
            <p className="text-sm text-muted-foreground">EBITDA Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">{rapports.filter((r) => r.statut === "en_attente").length}</div>
            <p className="text-sm text-muted-foreground">En attente</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {rapports.length > 0 ? (
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
                {rapports.map((r) => {
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
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <BarChart3 className="h-12 w-12 text-muted-foreground/40" />
              <p className="font-medium text-base">Aucun rapport disponible</p>
              <p className="text-sm">Les rapports P&L mensuels apparaîtront ici une fois générés.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
