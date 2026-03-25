import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, XCircle, Info } from "lucide-react"

interface Alert {
  id: string
  message: string
  type: "warning" | "error" | "info"
  date: string
}

interface AlertsPanelProps {
  alerts: Alert[]
}

function getRelativeTime(dateString: string): string {
  const now = new Date()
  const date = new Date(dateString)
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMinutes < 1) return "À l'instant"
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`
  if (diffHours < 24) return `Il y a ${diffHours}h`
  if (diffDays < 7) return `Il y a ${diffDays}j`
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>Alertes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune alerte</p>
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
                  {getRelativeTime(alert.date)}
                </p>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
