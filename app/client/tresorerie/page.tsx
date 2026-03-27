"use client"

import { useProfile } from "@/hooks/use-profile"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  Banknote,
  ArrowRight,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  Lock,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMUR(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} MUR`
}

// ---------------------------------------------------------------------------
// Mock upcoming expenses for 30-day forecast
// ---------------------------------------------------------------------------

const upcomingExpenses = [
  { label: "Salaires employes", montant: 185_000, date: "30 avril" },
  { label: "Loyer bureau", montant: 45_000, date: "1er avril" },
  { label: "Declaration TVA", montant: 45_230, date: "20 avril" },
  { label: "Cotisations CSG/NSF", montant: 8_450, date: "30 avril" },
  { label: "Facture fournisseur Orange", montant: 12_300, date: "15 avril" },
]

// ---------------------------------------------------------------------------
// Access denied view for client_user
// ---------------------------------------------------------------------------

function AccessDenied() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Card className="border-orange-200 bg-orange-50">
        <CardContent className="py-12 text-center space-y-4">
          <Lock className="h-12 w-12 mx-auto text-orange-400" />
          <h2 className="text-lg font-semibold" style={{ color: "#1E2A4A" }}>
            Acces reserve
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Cette page est reservee au responsable de l{"'"}entreprise.
            Si vous pensez que c{"'"}est une erreur, contactez votre administrateur.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main treasury view (client_admin)
// ---------------------------------------------------------------------------

function TresorerieView() {
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Ma Tresorerie
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Votre situation financiere en un coup d{"'"}oeil.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ============================================================= */}
        {/* Card 1 — Situation aujourd'hui */}
        {/* ============================================================= */}
        <Card className="border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Banknote className="h-4 w-4" style={{ color: "#C9A84C" }} />
              Situation aujourd{"'"}hui
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-3xl font-bold" style={{ color: "#1E2A4A" }}>
                {fmtMUR(2_150_000)}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Badge className="bg-green-100 text-green-700 border-green-200 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Sain
                </Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Votre tresorerie est en bonne sante. Vous avez assez d{"'"}argent pour couvrir
              vos depenses courantes sans difficulte.
            </p>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Mis a jour le 26 mars 2026
            </div>
          </CardContent>
        </Card>

        {/* ============================================================= */}
        {/* Card 2 — Dans 30 jours */}
        {/* ============================================================= */}
        <Card className="border-orange-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowRight className="h-4 w-4" style={{ color: "#C9A84C" }} />
              Dans 30 jours
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-3xl font-bold" style={{ color: "#1E2A4A" }}>
                {fmtMUR(1_800_000)}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Badge className="bg-orange-100 text-orange-700 border-orange-200 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Attention
                </Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Plusieurs depenses importantes arrivent en avril.
              Pensez a relancer vos factures impayees pour maintenir votre niveau de tresorerie.
            </p>

            {/* Upcoming expenses */}
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-semibold" style={{ color: "#1E2A4A" }}>
                Depenses a venir :
              </p>
              {upcomingExpenses.map((expense, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-400" />
                    <span className="text-muted-foreground">{expense.label}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium" style={{ color: "#1E2A4A" }}>
                      {fmtMUR(expense.montant)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {expense.date}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ============================================================= */}
        {/* Card 3 — Dans 60-90 jours */}
        {/* ============================================================= */}
        <Card className="border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowRight className="h-4 w-4" style={{ color: "#C9A84C" }} />
              Dans 60 a 90 jours
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-3xl font-bold" style={{ color: "#1E2A4A" }}>
                {fmtMUR(2_600_000)}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Badge className="bg-green-100 text-green-700 border-green-200 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Sain
                </Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Sur la base des factures a recevoir et des depenses prevues,
              votre tresorerie devrait remonter d{"'"}ici juin. La situation reste confortable.
            </p>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Estimation basee sur vos donnees actuelles
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function TresoreriePage() {
  const { profile, loading } = useProfile()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  const isClientUser = profile?.role === "client_user"

  if (isClientUser) {
    return <AccessDenied />
  }

  return <TresorerieView />
}
