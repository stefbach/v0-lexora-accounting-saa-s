"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  TrendingUp,
  TrendingDown,
  Calculator,
  AlertTriangle,
  Loader2,
  FileText,
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"
import Link from "next/link"

export default function TVAPage() {
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
          Vous n&apos;avez pas acc&egrave;s &agrave; cette section
        </h1>
        <Link href="/client" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour au tableau de bord
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          TVA &amp; Fiscal
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suivi de vos d&eacute;clarations TVA et obligations fiscales aupr&egrave;s de la MRA.
        </p>
      </div>

      {/* Summary Cards - empty state */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "TVA Collect\u00e9e totale", icon: TrendingUp, color: "#1E2A4A", bg: "bg-blue-50" },
          { title: "TVA D\u00e9ductible totale", icon: TrendingDown, color: "#C9A84C", bg: "bg-amber-50" },
          { title: "TVA Nette", icon: Calculator, color: "#DC2626", bg: "bg-red-50" },
          { title: "D\u00e9clarations en retard", icon: AlertTriangle, color: "#DC2626", bg: "bg-red-50" },
        ].map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={`rounded-lg p-2 ${card.bg}`}>
                <card.icon className="h-5 w-5" style={{ color: card.color }} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">--</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly TVA Table - empty state */}
      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#1E2A4A" }}>D&eacute;clarations TVA mensuelles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              Aucune d&eacute;claration TVA disponible pour le moment.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Vos d&eacute;clarations TVA mensuelles appara&icirc;tront ici une fois trait&eacute;es par votre comptable.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
