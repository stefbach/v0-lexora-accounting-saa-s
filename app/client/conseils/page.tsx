"use client"

import { useState, useEffect } from "react"
import { useProfile } from "@/hooks/use-profile"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  Lightbulb,
  Phone,
  AlertTriangle,
  PiggyBank,
  Users,
  Receipt,
  Lock,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMUR(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} MUR`
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Conseil {
  id: string
  titre: string
  description: string
  montant?: number
  detail: string
  urgence: "haute" | "moyenne" | "basse"
  icon: string
  action: string
}

// ---------------------------------------------------------------------------
// Icon resolver
// ---------------------------------------------------------------------------

function ConseilIcon({ icon }: { icon: string }) {
  switch (icon) {
    case "receipt":
      return <Receipt className="h-6 w-6" />
    case "alert":
      return <AlertTriangle className="h-6 w-6" />
    case "users":
      return <Users className="h-6 w-6" />
    case "piggybank":
      return <PiggyBank className="h-6 w-6" />
    case "lightbulb":
      return <Lightbulb className="h-6 w-6" />
    default:
      return <Lightbulb className="h-6 w-6" />
  }
}

// ---------------------------------------------------------------------------
// Urgency badge
// ---------------------------------------------------------------------------

function UrgenceBadge({ urgence }: { urgence: Conseil["urgence"] }) {
  switch (urgence) {
    case "haute":
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200">
          Urgent
        </Badge>
      )
    case "moyenne":
      return (
        <Badge className="bg-orange-100 text-orange-700 border-orange-200">
          A prevoir
        </Badge>
      )
    case "basse":
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
          Bonne idee
        </Badge>
      )
  }
}

// ---------------------------------------------------------------------------
// Access denied for client_user
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
// Conseils view (client_admin)
// ---------------------------------------------------------------------------

function ConseilsView() {
  const [conseils, setConseils] = useState<Conseil[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchConseils() {
      try {
        const res = await fetch("/api/client/conseils")
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data.conseils)) {
            setConseils(data.conseils)
          }
        }
      } catch {
        // API not available -- leave empty
      } finally {
        setLoading(false)
      }
    }

    fetchConseils()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Conseils de votre comptable
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Des recommandations personnalisees pour votre entreprise ce mois-ci.
        </p>
      </div>

      {conseils.length === 0 ? (
        <Card className="border-[#C9A84C]/30 bg-[#C9A84C]/5">
          <CardContent className="py-12 text-center space-y-4">
            <Lightbulb className="h-12 w-12 mx-auto" style={{ color: "#C9A84C" }} />
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Les conseils financiers apparaitront ici une fois vos donnees analysees.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {conseils.map((conseil) => (
            <Card
              key={conseil.id}
              className={`overflow-hidden ${
                conseil.urgence === "haute"
                  ? "border-red-200"
                  : conseil.urgence === "moyenne"
                  ? "border-orange-200"
                  : "border-gray-200"
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 p-2 rounded-lg"
                      style={{ backgroundColor: "#C9A84C20", color: "#C9A84C" }}
                    >
                      <ConseilIcon icon={conseil.icon} />
                    </div>
                    <div>
                      <CardTitle className="text-base" style={{ color: "#1E2A4A" }}>
                        {conseil.titre}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {conseil.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {conseil.montant && (
                      <span className="text-sm font-bold" style={{ color: "#1E2A4A" }}>
                        {fmtMUR(conseil.montant)}
                      </span>
                    )}
                    <UrgenceBadge urgence={conseil.urgence} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {conseil.detail}
                </p>
                <Button
                  size="sm"
                  className="text-white"
                  style={{ backgroundColor: "#1E2A4A" }}
                >
                  {conseil.action === "Contacter mon comptable" && (
                    <Phone className="h-4 w-4 mr-2" />
                  )}
                  {conseil.action}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function ConseilsPage() {
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

  return <ConseilsView />
}
