import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TVAStatusBadge } from "@/components/tva/TVAStatusBadge"
import type { TVAMensuelle } from "@/lib/types"

interface TVATableProps {
  data: TVAMensuelle[]
}

function formatMUR(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MUR",
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatPeriode(periode: string): string {
  const date = new Date(periode + "-01")
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
}

export function TVATable({ data }: TVATableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mois</TableHead>
          <TableHead>Société</TableHead>
          <TableHead className="text-right">TVA Collectée</TableHead>
          <TableHead className="text-right">TVA Déductible</TableHead>
          <TableHead className="text-right">TVA Nette</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead>Deadline</TableHead>
          <TableHead>Déclaration</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 && (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-muted-foreground">
              Aucune donnée TVA
            </TableCell>
          </TableRow>
        )}
        {data.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium capitalize">
              {formatPeriode(row.periode)}
            </TableCell>
            <TableCell>{(row as any).societe}</TableCell>
            <TableCell className="text-right">{formatMUR(row.tva_collectee)}</TableCell>
            <TableCell className="text-right">{formatMUR(row.tva_deductible)}</TableCell>
            <TableCell className="text-right font-medium">
              {formatMUR(row.tva_nette)}
            </TableCell>
            <TableCell>
              <TVAStatusBadge statut={(row.statut ?? "a_payer") as any} montant={Math.abs(row.tva_nette)} />
            </TableCell>
            <TableCell>
              {new Date(row.date_limite).toLocaleDateString("fr-FR")}
            </TableCell>
            <TableCell>
              {row.statut_declaration === "a_faire" && (
                <Badge
                  variant="outline"
                  className="bg-orange-100 text-orange-800 border-orange-200"
                >
                  À faire
                </Badge>
              )}
              {row.statut_declaration === "declare" && (
                <div className="flex flex-col gap-1">
                  <Badge
                    variant="outline"
                    className="bg-green-100 text-green-800 border-green-200"
                  >
                    Déclaré
                  </Badge>
                  {row.date_declaration && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(row.date_declaration).toLocaleDateString("fr-FR")}
                    </span>
                  )}
                </div>
              )}
              {row.statut_declaration === "en_retard" && (
                <div className="flex flex-col gap-1">
                  <Badge
                    variant="outline"
                    className="bg-red-100 text-red-800 border-red-200"
                  >
                    En retard
                  </Badge>
                  {((row as any).penalites ?? 0) > 0 && (
                    <span className="text-xs text-red-600">
                      Pénalité: {formatMUR(((row as any).penalites ?? 0))}
                    </span>
                  )}
                </div>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
