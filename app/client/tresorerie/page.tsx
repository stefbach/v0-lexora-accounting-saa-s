"use client"

import { useProfile } from "@/hooks/use-profile"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Loader2,
  Banknote,
  ArrowRight,
  Lock,
  Wallet,
} from "lucide-react"

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
// Main treasury view (client_admin) - empty state
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
        {/* Card 1 -- Situation aujourd'hui */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Banknote className="h-4 w-4" style={{ color: "#C9A84C" }} />
              Situation aujourd{"'"}hui
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Wallet className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Pas encore de donn&eacute;es de tr&eacute;sorerie.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Vos soldes appara&icirc;tront ici une fois vos comptes connect&eacute;s.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Card 2 -- Dans 30 jours */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowRight className="h-4 w-4" style={{ color: "#C9A84C" }} />
              Dans 30 jours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Wallet className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Pas encore de pr&eacute;vision disponible.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Les pr&eacute;visions seront calcul&eacute;es &agrave; partir de vos donn&eacute;es comptables.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Card 3 -- Dans 60-90 jours */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowRight className="h-4 w-4" style={{ color: "#C9A84C" }} />
              Dans 60 a 90 jours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Wallet className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Pas encore de pr&eacute;vision disponible.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Les estimations &agrave; long terme appara&icirc;tront ici.
              </p>
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
