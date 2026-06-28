import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, XCircle, Info } from "lucide-react"
import { t, getLocale } from "@/lib/i18n"

interface Alert {
  id: string
  message: string
  type: "warning" | "error" | "info"
  date: string
}

interface AlertsPanelProps {
  alerts: Alert[]
}

function getRelativeTime(dateString: string, locale: ReturnType<typeof getLocale>): string {
  const now = new Date()
  const date = new Date(dateString)
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMinutes < 1) return t('scmsc.alerts.a_linstant', locale)
  if (diffMinutes < 60) return t('scmsc.alerts.il_y_a_min', locale).replace('{n}', String(diffMinutes))
  if (diffHours < 24) return t('scmsc.alerts.il_y_a_h', locale).replace('{n}', String(diffHours))
  if (diffDays < 7) return t('scmsc.alerts.il_y_a_j', locale).replace('{n}', String(diffDays))
  return date.toLocaleDateString("fr-FR")
}

const alertConfig = {
  warning: {
    icon: AlertTriangle,
    className: "text-amber-500",
    bg: "bg-amber-50",
  },
  error: {
    icon: XCircle,
    className: "text-red-500",
    bg: "bg-red-50",
  },
  info: {
    icon: Info,
    className: "text-blue-500",
    bg: "bg-blue-50",
  },
}

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  const locale = getLocale()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('scmsc.alerts.titre', locale)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('scmsc.alerts.aucune', locale)}</p>
        )}
        {alerts.map((alert) => {
          const config = alertConfig[alert.type]
          const Icon = config.icon
          return (
            <div
              key={alert.id}
              className={cn(
                "flex items-start gap-3 rounded-lg p-3",
                config.bg
              )}
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", config.className)} />
              <div className="flex-1 space-y-1">
                <p className="text-sm">{alert.message}</p>
                <p className="text-xs text-muted-foreground">
                  {getRelativeTime(alert.date, locale)}
                </p>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
