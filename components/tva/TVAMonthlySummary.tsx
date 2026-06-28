import { Receipt, CreditCard, Calculator, AlertTriangle } from "lucide-react"
import { KPICard } from "@/components/dashboard/KPICard"
import { t, getLocale } from "@/lib/i18n"
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
  const locale = getLocale()
  const totalCollectee = data.reduce((sum, row) => sum + row.tva_collectee, 0)
  const totalDeductible = data.reduce((sum, row) => sum + row.tva_deductible, 0)
  const totalNette = data.reduce((sum, row) => sum + row.tva_nette, 0)
  const enRetardCount = data.filter(
    (row) => row.statut_declaration === "en_retard"
  ).length

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KPICard
        title={t('scmsc.tva.total_collectee', locale)}
        value={formatMUR(totalCollectee)}
        icon={Receipt}
      />
      <KPICard
        title={t('scmsc.tva.total_deductible', locale)}
        value={formatMUR(totalDeductible)}
        icon={CreditCard}
      />
      <KPICard
        title={t('scmsc.tva.nette_totale', locale)}
        value={formatMUR(totalNette)}
        icon={Calculator}
      />
      <KPICard
        title={t('scmsc.tva.declarations_retard', locale)}
        value={enRetardCount}
        icon={AlertTriangle}
        description={
          enRetardCount > 0
            ? t(
                enRetardCount > 1
                  ? 'scmsc.tva.nb_declarations_retard_plural'
                  : 'scmsc.tva.nb_declarations_retard',
                locale
              ).replace('{n}', String(enRetardCount))
            : t('scmsc.tva.toutes_a_jour', locale)
        }
      />
    </div>
  )
}
