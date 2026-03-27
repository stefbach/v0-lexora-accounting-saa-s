"use client"

import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  CalendarDays,
  TrendingUp,
  Clock,
  Loader2,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PrevisionnelPage() {
  const { profile, loading } = useProfile()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "#1E2A4A" }}>
          Acc&egrave;s non autoris&eacute;
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;acc&eacute;der &agrave; cette page.
        </p>
        <Link href="/client/documents" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour aux documents
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Mon Pr&eacute;visionnel
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Anticipez l&apos;&eacute;volution de votre tr&eacute;sorerie
        </p>
      </div>

      {/* Forecast cards - empty state */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {["Aujourd\u2019hui", "Dans 30 jours", "Dans 60 jours", "Dans 90 jours"].map((label) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {label}
                </CardTitle>
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Pas encore de pr&eacute;vision
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Note */}
      <Card className="bg-slate-50">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 shrink-0" style={{ color: "#C9A84C" }} />
            <p className="text-sm text-muted-foreground">
              Les pr&eacute;visions appara&icirc;tront ici une fois vos donn&eacute;es comptables trait&eacute;es par votre comptable.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Footer badge */}
      <div className="flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          G&eacute;n&eacute;r&eacute; automatiquement chaque mois
        </p>
      </div>
    </div>
  )
}
