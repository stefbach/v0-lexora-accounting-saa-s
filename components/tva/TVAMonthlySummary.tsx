import { Receipt, CreditCard, Calculator, AlertTriangle } from "lucide-react"
import { KPICard } from "@/components/dashboard/KPICard"
import type { TVAMensuelle } from "@/lib/types"

interface TVAMonthlySummaryProps {
  data: TVAMensuelle[]
}

function formatMUR(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MUR",
    minimumFractionDigits: 2,
  }).format(amount)
}

export function TVAMonthlySummary({ data }: TVAMonthlySummaryProps) {
  const totalCollectee = data.reduce((sum, row) => sum + row.tva_collectee, 0)
  const totalDeductible = data.reduce((sum, row) => sum + row.tva_deductible, 0)
  const totalNette = data.reduce((sum, row) => sum + row.tva_nette, 0)
  const enRetardCount = data.filter(
    (row) => row.statut_declaration === "en_retard"
  ).length

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KPICard
        title="Total TVA Collectée"
        value={formatMUR(totalCollectee)}
        icon={Receipt}
      />
      <KPICard
        title="Total TVA Déductible"
        value={formatMUR(totalDeductible)}
        icon={CreditCard}
      />
      <KPICard
        title="TVA Nette totale"
        value={formatMUR(totalNette)}
        icon={Calculator}
      />
      <KPICard
        title="Déclarations en retard"
        value={enRetardCount}
        icon={AlertTriangle}
        description={
          enRetardCount > 0
            ? `${enRetardCount} déclaration${enRetardCount > 1 ? "s" : ""} en retard`
            : "Toutes les déclarations sont à jour"
        }
      />
    </div>
  )
}
